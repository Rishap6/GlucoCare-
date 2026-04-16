const express = require('express');
const { auth, requireRole } = require('../middleware/auth');
const { sanitize, isValidDate, isValidTime, isFiniteInRange, isPositiveInt, isOneOf } = require('../middleware/validate');
const GlucoseReading = require('../models/GlucoseReading');
const HealthMetric = require('../models/HealthMetric');
const Report = require('../models/Report');
const MedicalRecord = require('../models/MedicalRecord');
const Appointment = require('../models/Appointment');
const Alert = require('../models/Alert');
const User = require('../models/User');
const { getDb } = require('../database');
const { answerQuestion } = require('../../Ai/ai-engine');
const { extractProjectDataFromDocument, evaluateExtractedData } = require('../../Ai/document-intelligence');
const { parseDocumentToText } = require('../../Ai/document-reader');
const { estimateNutrition } = require('../../Ai/meal-parser');
const { askLlmFallback } = require('../services/llm');
const {
    verifyReportPatientName,
    mapReportRow,
    findRecentDuplicateReport,
    parseReportJsonObject,
    toFiniteNumberOrNull,
    cleanupImportedBiometricsForReport,
    normalizeCorrectionsInput,
    ensureExtractedPayload,
    readCorrectableField,
    applyCorrectableField,
    buildCorrectedReportStatus,
} = require('../services/report-processing');
const {
    DIET_MEAL_SLOTS,
    DIET_SUGAR_TIMINGS,
    mapDietIntakeRow,
    buildDietDateRange,
    buildDietReportSummary,
    buildDietAiResponse,
} = require('../services/diet-analytics');

const router = express.Router();
const IST_TIME_ZONE = 'Asia/Kolkata';
const AI_HISTORY_MAX_MESSAGES = 80;
const AI_HISTORY_MAX_CHATS = 40;

const db = {
    prepare: (...args) => getDb().prepare(...args),
};

function getIstDateKey(date = new Date()) {
    return date.toLocaleDateString('sv-SE', {
        timeZone: IST_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
}

function getIstDateKeyDaysAgo(days) {
    const d = new Date();
    d.setDate(d.getDate() - Number(days || 0));
    return getIstDateKey(d);
}

function resolveRangeDays(range) {
    if (!range) return 7;
    const value = String(range).toLowerCase();
    if (value === '7d') return 7;
    if (value === '30d') return 30;
    if (value === '90d') return 90;
    return 7;
}

function calculateStandardDeviation(values) {
    if (values.length === 0) return 0;
    const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + ((v - avg) ** 2), 0) / values.length;
    return Math.sqrt(variance);
}

function safeJsonParse(value, fallback) {
    try {
        return value ? JSON.parse(value) : fallback;
    } catch {
        return fallback;
    }
}

function shouldUseConciseAiResponse(question, explicit) {
    if (explicit) return true;
    const q = String(question || '').toLowerCase();
    return /\b(summar(y|ize|ise)|brief|concise|short|in short|tldr)\b/.test(q);
}

function toConciseSentence(value, maxSentences, maxChars) {
    const source = String(value || '').replace(/\s+/g, ' ').trim();
    if (!source) return '';

    const chunks = source.match(/[^.!?]+[.!?]?/g) || [source];
    let compact = chunks.slice(0, Math.max(1, Number(maxSentences || 1))).join(' ').trim();

    const limit = Number(maxChars || 280);
    if (compact.length > limit) {
        compact = compact.slice(0, limit).replace(/[\s,;:.!?-]+$/, '') + '...';
    }

    return compact;
}

function applyAiResponseStyle(payload, options) {
    if (!payload || typeof payload !== 'object') return payload;
    const opts = options || {};
    if (!opts.concise) return payload;

    const answer = toConciseSentence(payload.answer, 2, 280);
    const whatItMeans = toConciseSentence(payload.whatItMeans, 1, 140);
    const nextSteps = toConciseSentence(payload.nextSteps, 1, 140);

    const compactAnswer = [
        answer,
        whatItMeans ? `Meaning: ${whatItMeans}` : '',
        nextSteps ? `Next: ${nextSteps}` : '',
    ].filter(Boolean).join(' ');

    return {
        ...payload,
        answer: compactAnswer || answer || payload.answer,
        suggestions: Array.isArray(payload.suggestions)
            ? payload.suggestions.slice(0, 2)
            : [],
    };
}

function sanitizeAiHistoryAttachment(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const name = String(raw.name || '').trim();
    if (!name) return null;

    let size = Number(raw.size || 0);
    if (!Number.isFinite(size) || size < 0) size = 0;

    return {
        name,
        size,
        isImage: Boolean(raw.isImage),
        isPdf: Boolean(raw.isPdf),
    };
}

function sanitizeAiHistoryEntry(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const role = String(raw.role || '').trim();
    if (role !== 'assistant' && role !== 'patient') return null;

    const text = String(raw.text || '').trim();
    const attachments = Array.isArray(raw.attachments)
        ? raw.attachments.map(sanitizeAiHistoryAttachment).filter(Boolean).slice(0, 3)
        : [];

    if (!text && attachments.length === 0) return null;

    const entry = {
        role,
        text: text.slice(0, 4000),
        attachments,
    };

    const meta = String(raw.meta || '').trim();
    if (meta) entry.meta = meta.slice(0, 200);

    if (raw.debug && typeof raw.debug === 'object' && raw.debug.engine) {
        entry.debug = {
            engine: String(raw.debug.engine).slice(0, 40),
            provider: raw.debug.provider ? String(raw.debug.provider).slice(0, 40) : null,
        };
    }

    if (Array.isArray(raw.suggestions)) {
        const suggestions = raw.suggestions
            .map((item) => String(item || '').trim())
            .filter(Boolean)
            .slice(0, 3)
            .map((item) => item.slice(0, 200));
        if (suggestions.length > 0) {
            entry.suggestions = suggestions;
        }
    }

    return entry;
}

function sanitizeAiConversation(rawConversation) {
    if (!Array.isArray(rawConversation)) return [];
    return rawConversation
        .map(sanitizeAiHistoryEntry)
        .filter(Boolean)
        .slice(-AI_HISTORY_MAX_MESSAGES);
}

function deriveAiChatTitleFromConversation(conversation) {
    const list = Array.isArray(conversation) ? conversation : [];
    const userEntry = list.find((item) => item && item.role === 'patient' && String(item.text || '').trim());
    const assistantEntry = list.find((item) => item && item.role === 'assistant' && String(item.text || '').trim());
    const sourceText = String((userEntry && userEntry.text) || (assistantEntry && assistantEntry.text) || '').replace(/\s+/g, ' ').trim();
    if (!sourceText) return 'New chat';
    return sourceText.length > 80 ? `${sourceText.slice(0, 80)}...` : sourceText;
}

function sanitizeAiChatItem(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const messages = sanitizeAiConversation(raw.messages || raw.conversation || []);
    const id = String(raw.id || '').trim() || `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const updatedAtRaw = String(raw.updatedAt || '').trim();
    const updatedAt = updatedAtRaw || new Date().toISOString();
    const titleRaw = String(raw.title || '').replace(/\s+/g, ' ').trim();
    const title = titleRaw ? titleRaw.slice(0, 120) : deriveAiChatTitleFromConversation(messages);

    return {
        id,
        title,
        updatedAt,
        messages,
    };
}

function sanitizeAiHistoryPayload(raw) {
    if (!raw || typeof raw !== 'object') {
        return { chats: [], activeChatId: null };
    }

    const chats = Array.isArray(raw.chats)
        ? raw.chats.map(sanitizeAiChatItem).filter(Boolean).slice(0, AI_HISTORY_MAX_CHATS)
        : [];

    let activeChatId = String(raw.activeChatId || '').trim() || null;
    if (chats.length > 0 && !chats.some((item) => item.id === activeChatId)) {
        activeChatId = chats[0].id;
    }

    return {
        chats,
        activeChatId,
    };
}

function convertLegacyAiConversationToHistory(rawConversation) {
    const messages = sanitizeAiConversation(rawConversation || []);
    if (messages.length === 0) {
        return { chats: [], activeChatId: null };
    }

    const legacyId = 'legacy-main-chat';
    return {
        chats: [{
            id: legacyId,
            title: deriveAiChatTitleFromConversation(messages),
            updatedAt: new Date().toISOString(),
            messages,
        }],
        activeChatId: legacyId,
    };
}

function computeDailyScore(patientId) {
    const today = getIstDateKey();
    const readings = db.prepare(`
        SELECT value FROM glucose_readings
        WHERE patient = ? AND substr(datetime(recordedAt, '+5 hours', '+30 minutes'), 1, 10) = ?
    `).all(patientId, today);

    const medicationLogs = db.prepare(`
        SELECT status FROM medication_logs
        WHERE patient_id = ? AND substr(datetime(COALESCE(taken_time, createdAt), '+5 hours', '+30 minutes'), 1, 10) = ?
    `).all(patientId, today);

    const activity = db.prepare(`
        SELECT COALESCE(SUM(duration_min), 0) AS total_duration
        FROM activity_logs
        WHERE patient_id = ? AND substr(datetime(logged_at, '+5 hours', '+30 minutes'), 1, 10) = ?
    `).get(patientId, today);

    const inRangeCount = readings.filter((r) => Number(r.value) >= 70 && Number(r.value) <= 180).length;
    const glucoseComponent = readings.length === 0 ? 50 : (inRangeCount / readings.length) * 100;

    const takenCount = medicationLogs.filter((l) => l.status === 'taken').length;
    const adherenceComponent = medicationLogs.length === 0 ? 60 : (takenCount / medicationLogs.length) * 100;

    const activityMinutes = Number(activity.total_duration || 0);
    const activityComponent = Math.min(100, (activityMinutes / 30) * 100);

    const sleepComponent = 70;
    const score = (glucoseComponent * 0.5) + (adherenceComponent * 0.25) + (activityComponent * 0.2) + (sleepComponent * 0.05);

    db.prepare(`
        INSERT INTO diabetes_scores (
            patient_id, date, score, glucose_component, adherence_component, activity_component, sleep_component, explanation_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(patient_id, date) DO UPDATE SET
            score = excluded.score,
            glucose_component = excluded.glucose_component,
            adherence_component = excluded.adherence_component,
            activity_component = excluded.activity_component,
            sleep_component = excluded.sleep_component,
            explanation_json = excluded.explanation_json,
            updatedAt = datetime('now')
    `).run(
        patientId,
        today,
        Number(score.toFixed(2)),
        Number(glucoseComponent.toFixed(2)),
        Number(adherenceComponent.toFixed(2)),
        Number(activityComponent.toFixed(2)),
        Number(sleepComponent.toFixed(2)),
        JSON.stringify({
            glucose: 'Higher score with readings in 70-180 mg/dL range',
            adherence: 'Based on medication logs marked as taken',
            activity: 'Target is 30 minutes daily activity',
            sleep: 'Baseline component until sleep tracking is added',
        }),
    );

    return db.prepare('SELECT * FROM diabetes_scores WHERE patient_id = ? AND date = ?').get(patientId, today);
}

// All routes require authentication + patient role
router.use(auth, requireRole('patient'));

// ─── Glucose Readings ───────────────────────────────────────────────

// GET /api/patient/glucose - get readings with optional date range
router.get('/glucose', async (req, res) => {
    try {
        const { days } = req.query;
        const readings = GlucoseReading.findByPatient(req.user._id, { days });
        res.json(readings);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch glucose readings.' });
    }
});

// POST /api/patient/glucose - add a reading
router.post('/glucose', async (req, res) => {
    try {
        const { value, type, notes, recordedAt } = req.body;

        if (value === undefined || value === null || !type) {
            return res.status(400).json({ error: 'Value and type are required.' });
        }

        if (!isFiniteInRange(value, 1, 900)) {
            return res.status(400).json({ error: 'Glucose value must be between 1 and 900 mg/dL.' });
        }

        if (!isOneOf(type, ['fasting', 'postprandial', 'random'])) {
            return res.status(400).json({ error: 'Type must be fasting, postprandial, or random.' });
        }

        if (recordedAt && !isValidDate(recordedAt)) {
            return res.status(400).json({ error: 'Invalid date format for recordedAt.' });
        }

        const reading = GlucoseReading.create({
            patient: req.user._id,
            value: Number(value),
            type,
            notes: sanitize(notes || ''),
            recordedAt: recordedAt || undefined,
        });

        const generatedAlert = Alert.evaluateGlucoseReading(req.user._id, reading);

        res.status(201).json({ reading, alert: generatedAlert });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save glucose reading.' });
    }
});

// GET /api/patient/glucose/trends?range=7d|30d|90d
router.get('/glucose/trends', async (req, res) => {
    try {
        const days = resolveRangeDays(req.query.range);
        const readings = GlucoseReading.findByPatient(req.user._id, { days });

        const byDate = new Map();
        for (const reading of readings) {
            const dayKey = String(reading.recordedAt || '').slice(0, 10);
            if (!byDate.has(dayKey)) {
                byDate.set(dayKey, []);
            }
            byDate.get(dayKey).push(Number(reading.value));
        }

        const points = [...byDate.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([date, values]) => {
                const average = values.reduce((sum, v) => sum + v, 0) / values.length;
                return {
                    date,
                    count: values.length,
                    avg: Number(average.toFixed(2)),
                    min: Math.min(...values),
                    max: Math.max(...values),
                };
            });

        const allValues = readings.map((r) => Number(r.value));
        const overallAvg = allValues.length > 0
            ? allValues.reduce((sum, v) => sum + v, 0) / allValues.length
            : 0;

        res.json({
            range: `${days}d`,
            summary: {
                readingCount: allValues.length,
                average: Number(overallAvg.toFixed(2)),
                variability: Number(calculateStandardDeviation(allValues).toFixed(2)),
            },
            points,
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to build glucose trends.' });
    }
});

// GET /api/patient/glucose/time-in-range?range=7d|30d|90d&low=70&high=180
router.get('/glucose/time-in-range', async (req, res) => {
    try {
        const days = resolveRangeDays(req.query.range);
        const low = req.query.low ? Number(req.query.low) : 70;
        const high = req.query.high ? Number(req.query.high) : 180;

        if (!isFiniteInRange(low, 30, 400) || !isFiniteInRange(high, 30, 500) || low >= high) {
            return res.status(400).json({ error: 'Invalid low/high thresholds.' });
        }

        const readings = GlucoseReading.findByPatient(req.user._id, { days });
        const total = readings.length;

        let inRange = 0;
        let belowRange = 0;
        let aboveRange = 0;

        for (const reading of readings) {
            const value = Number(reading.value);
            if (value < low) {
                belowRange += 1;
            } else if (value > high) {
                aboveRange += 1;
            } else {
                inRange += 1;
            }
        }

        const pct = (count) => (total === 0 ? 0 : Number(((count / total) * 100).toFixed(2)));

        res.json({
            range: `${days}d`,
            thresholds: { low, high },
            counts: { total, inRange, belowRange, aboveRange },
            percentages: {
                inRange: pct(inRange),
                belowRange: pct(belowRange),
                aboveRange: pct(aboveRange),
            },
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to calculate time in range.' });
    }
});

// GET /api/patient/alerts/settings
router.get('/alerts/settings', async (req, res) => {
    try {
        const settings = Alert.getSettings(req.user._id);
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch alert settings.' });
    }
});

// POST /api/patient/alerts/settings
router.post('/alerts/settings', async (req, res) => {
    try {
        const { lowThreshold, highThreshold, missedLogHours, notifyPush, notifyEmail } = req.body;

        if (lowThreshold !== undefined && Number(lowThreshold) < 40) {
            return res.status(400).json({ error: 'Low threshold must be at least 40.' });
        }
        if (highThreshold !== undefined && Number(highThreshold) > 400) {
            return res.status(400).json({ error: 'High threshold must be 400 or less.' });
        }

        const settings = Alert.upsertSettings(req.user._id, {
            lowThreshold: lowThreshold !== undefined ? Number(lowThreshold) : undefined,
            highThreshold: highThreshold !== undefined ? Number(highThreshold) : undefined,
            missedLogHours: missedLogHours !== undefined ? Number(missedLogHours) : undefined,
            notifyPush,
            notifyEmail,
        });

        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: 'Failed to update alert settings.' });
    }
});

// GET /api/patient/alerts
router.get('/alerts', async (req, res) => {
    try {
        const status = req.query.status ? String(req.query.status) : undefined;
        const limit = req.query.limit ? Number(req.query.limit) : 50;
        const alerts = Alert.listByPatient(req.user._id, { status, limit });
        res.json(alerts);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch alerts.' });
    }
});

// PATCH /api/patient/alerts/:id/read
router.patch('/alerts/:id/read', async (req, res) => {
    try {
        const updated = Alert.markAsRead(req.user._id, Number(req.params.id));
        if (!updated) {
            return res.status(404).json({ error: 'Alert not found.' });
        }
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: 'Failed to update alert.' });
    }
});

// ─── Health Metrics ─────────────────────────────────────────────────

// GET /api/patient/health-metrics
router.get('/health-metrics', async (req, res) => {
    try {
        const { days } = req.query;
        const metrics = HealthMetric.findByPatient(req.user._id, { days });
        res.json(metrics);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch health metrics.' });
    }
});

// POST /api/patient/health-metrics
router.post('/health-metrics', async (req, res) => {
    try {
        const { weight, systolic, diastolic, hba1c, recordedAt } = req.body;

        if (weight !== undefined && !isFiniteInRange(weight, 1, 700)) {
            return res.status(400).json({ error: 'Weight must be between 1 and 700 kg.' });
        }
        if (systolic !== undefined && !isFiniteInRange(systolic, 40, 300)) {
            return res.status(400).json({ error: 'Systolic BP must be between 40 and 300.' });
        }
        if (diastolic !== undefined && !isFiniteInRange(diastolic, 20, 200)) {
            return res.status(400).json({ error: 'Diastolic BP must be between 20 and 200.' });
        }
        if (hba1c !== undefined && !isFiniteInRange(hba1c, 2, 20)) {
            return res.status(400).json({ error: 'HbA1c must be between 2 and 20%.' });
        }
        if (recordedAt && !isValidDate(recordedAt)) {
            return res.status(400).json({ error: 'Invalid date format for recordedAt.' });
        }

        const metric = HealthMetric.create({
            patient: req.user._id,
            weight,
            systolic,
            diastolic,
            hba1c,
            recordedAt: recordedAt || undefined,
        });

        res.status(201).json(metric);
    } catch (err) {
        res.status(500).json({ error: 'Failed to save health metric.' });
    }
});

// ─── Reports ────────────────────────────────────────────────────────

// GET /api/patient/reports
router.get('/reports', async (req, res) => {
    try {
        const { type } = req.query;
        const reports = Report.findByPatient(req.user._id, { type });
        res.json(reports);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch reports.' });
    }
});

// POST /api/patient/reports
router.post('/reports', async (req, res) => {
    try {
        const reportName = sanitize(req.body.reportName);
        const type = sanitize(req.body.type);
        const date = sanitize(req.body.date);
        const { doctor, status } = req.body;

        if (!reportName || !type || !date) {
            return res.status(400).json({ error: 'Report name, type, and date are required.' });
        }

        if (!isOneOf(type, ['Lab Report', 'Imaging', 'Clinical Note', 'Diabetes Report'])) {
            return res.status(400).json({ error: 'Invalid report type.' });
        }

        if (!isValidDate(date)) {
            return res.status(400).json({ error: 'Invalid date format.' });
        }

        const duplicate = findRecentDuplicateReport({
            patientId: req.user._id,
            reportName,
            type,
            date,
            fileUrl: null,
        });
        if (duplicate) {
            return res.status(409).json({
                error: 'Duplicate report detected. This report was already added recently.',
                code: 'duplicate_report',
                report: mapReportRow(duplicate),
            });
        }

        const report = Report.create({
            patient: req.user._id,
            reportName,
            type,
            date,
            doctor,
            status: status || 'Pending',
        });

        res.status(201).json(report);
    } catch (err) {
        res.status(500).json({ error: 'Failed to save report.' });
    }
});

// ─── Medical Records ────────────────────────────────────────────────

// GET /api/patient/records
router.get('/records', async (req, res) => {
    try {
        const { type } = req.query;
        const records = MedicalRecord.findByPatient(req.user._id, { type });
        res.json(records);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch medical records.' });
    }
});

// POST /api/patient/records
router.post('/records', async (req, res) => {
    try {
        const title = sanitize(req.body.title);
        const type = sanitize(req.body.type);
        const date = sanitize(req.body.date);
        const { doctor, description, facility } = req.body;

        if (!title || !type || !date) {
            return res.status(400).json({ error: 'Title, type, and date are required.' });
        }

        if (!isOneOf(type, ['Diagnosis', 'Treatment', 'Surgery', 'Vaccination', 'Other'])) {
            return res.status(400).json({ error: 'Invalid record type.' });
        }

        if (!isValidDate(date)) {
            return res.status(400).json({ error: 'Invalid date format.' });
        }

        const record = MedicalRecord.create({
            patient: req.user._id,
            title,
            type,
            date,
            doctor,
            description: sanitize(description || ''),
            facility: sanitize(facility || ''),
        });

        res.status(201).json(record);
    } catch (err) {
        res.status(500).json({ error: 'Failed to save medical record.' });
    }
});

// ─── Doctors ────────────────────────────────────────────────────────

// GET /api/patient/doctors - get assigned doctors (latest assigned first)
router.get('/doctors', async (req, res) => {
    try {
        // Return doctors assigned to this patient via patient_doctors join
        var assigned = User.getAssignedDoctors(req.user._id);

        // Fallback: if no assignments yet, return all doctors so patient can chat
        if (!assigned || assigned.length === 0) {
            assigned = User.findAllDoctors();
        }

        res.json(assigned);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch doctors.' });
    }
});

// ─── Appointments ───────────────────────────────────────────────────

// GET /api/patient/appointments
router.get('/appointments', async (req, res) => {
    try {
        const appointments = Appointment.findByPatient(req.user._id);
        res.json(appointments);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch appointments.' });
    }
});

// POST /api/patient/appointments
router.post('/appointments', async (req, res) => {
    try {
        const { doctor, date, time, reason } = req.body;

        if (!doctor || !date || !time) {
            return res.status(400).json({ error: 'Doctor, date, and time are required.' });
        }

        if (!isPositiveInt(doctor)) {
            return res.status(400).json({ error: 'Invalid doctor id.' });
        }

        if (!isValidDate(date)) {
            return res.status(400).json({ error: 'Invalid date format.' });
        }

        if (!isValidTime(time)) {
            return res.status(400).json({ error: 'Time must be HH:MM (24-hour).' });
        }

        const appointment = Appointment.create({
            patient: req.user._id,
            doctor: Number(doctor),
            date,
            time,
            reason: sanitize(reason || ''),
        });

        res.status(201).json(appointment);
    } catch (err) {
        res.status(500).json({ error: 'Failed to book appointment.' });
    }
});

// ─── Profile ────────────────────────────────────────────────────────

// GET /api/patient/profile
router.get('/profile', async (req, res) => {
    res.json(req.user);
});

// PUT /api/patient/profile
router.put('/profile', async (req, res) => {
    try {
        const allowed = ['fullName', 'phone', 'dateOfBirth', 'bloodType', 'allergies', 'chronicConditions', 'emergencyContact'];
        const updates = {};

        for (const key of allowed) {
            if (req.body[key] !== undefined) {
                updates[key] = req.body[key];
            }
        }

        const user = User.findByIdAndUpdate(req.user._id, updates);
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: 'Failed to update profile.' });
    }
});

// ─── Dashboard Summary ──────────────────────────────────────────────

// GET /api/patient/dashboard - aggregated overview data
router.get('/dashboard', async (req, res) => {
    try {
        const patientId = req.user._id;

        // Latest glucose reading
        const latestGlucose = GlucoseReading.findLatestByPatient(patientId);

        // Latest health metric
        const latestMetric = HealthMetric.findLatestByPatient(patientId);

        // Upcoming appointments
        const upcomingAppointments = Appointment.findUpcomingByPatient(patientId, 5);

        // Recent glucose readings (last 7 days)
        const recentGlucose = GlucoseReading.findRecentByPatient(patientId, 7);

        // Recent health metrics (last 30 days)
        const recentMetrics = HealthMetric.findRecentByPatient(patientId, 30);

        res.json({
            latestGlucose,
            latestMetric,
            upcomingAppointments,
            recentGlucose,
            recentMetrics,
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load dashboard data.' });
    }
});

// ─── Feature 3: Daily Diabetes Score ───────────────────────────────

// GET /api/patient/score/today
router.get('/score/today', async (req, res) => {
    try {
        const row = computeDailyScore(req.user._id);
        res.json({
            date: row.date,
            score: Number(row.score),
            components: {
                glucose: Number(row.glucose_component),
                adherence: Number(row.adherence_component),
                activity: Number(row.activity_component),
                sleep: Number(row.sleep_component),
            },
            explanation: safeJsonParse(row.explanation_json, {}),
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to calculate daily score.' });
    }
});

// GET /api/patient/score/history?range=30d
router.get('/score/history', async (req, res) => {
    try {
        const days = resolveRangeDays(req.query.range || '30d');
        const sinceDateKey = getIstDateKeyDaysAgo(days);

        const rows = db.prepare(`
            SELECT * FROM diabetes_scores
            WHERE patient_id = ? AND date >= ?
            ORDER BY date DESC
        `).all(req.user._id, sinceDateKey);

        res.json(rows.map((row) => ({
            date: row.date,
            score: Number(row.score),
            components: {
                glucose: Number(row.glucose_component),
                adherence: Number(row.adherence_component),
                activity: Number(row.activity_component),
                sleep: Number(row.sleep_component),
            },
            explanation: safeJsonParse(row.explanation_json, {}),
        })));
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch score history.' });
    }
});

// ─── Feature 4: Medication Tracker ─────────────────────────────────

// GET /api/patient/medications
router.get('/medications', async (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT * FROM medications
            WHERE patient_id = ?
            ORDER BY active DESC, createdAt DESC
        `).all(req.user._id);

        res.json(rows.map((row) => ({
            id: row.id,
            name: row.name,
            dosage: row.dosage,
            frequency: row.frequency,
            timing: safeJsonParse(row.timing_json, []),
            startDate: row.start_date,
            endDate: row.end_date,
            active: row.active === 1,
        })));
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch medications.' });
    }
});

// POST /api/patient/medications
router.post('/medications', async (req, res) => {
    try {
        const { name, dosage, frequency, timing, startDate, endDate, active } = req.body;
        if (!name) return res.status(400).json({ error: 'Medication name is required.' });

        const result = db.prepare(`
            INSERT INTO medications (patient_id, name, dosage, frequency, timing_json, start_date, end_date, active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            req.user._id,
            name,
            dosage || null,
            frequency || null,
            JSON.stringify(Array.isArray(timing) ? timing : []),
            startDate || null,
            endDate || null,
            active === false ? 0 : 1,
        );

        const created = db.prepare('SELECT * FROM medications WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json(created);
    } catch (err) {
        res.status(500).json({ error: 'Failed to create medication.' });
    }
});

// PATCH /api/patient/medications/:id
router.patch('/medications/:id', async (req, res) => {
    try {
        const existing = db.prepare('SELECT * FROM medications WHERE id = ? AND patient_id = ?').get(req.params.id, req.user._id);
        if (!existing) return res.status(404).json({ error: 'Medication not found.' });

        const next = {
            name: req.body.name ?? existing.name,
            dosage: req.body.dosage ?? existing.dosage,
            frequency: req.body.frequency ?? existing.frequency,
            timing: req.body.timing ?? safeJsonParse(existing.timing_json, []),
            startDate: req.body.startDate ?? existing.start_date,
            endDate: req.body.endDate ?? existing.end_date,
            active: req.body.active === undefined ? existing.active : (req.body.active ? 1 : 0),
        };

        db.prepare(`
            UPDATE medications
            SET name = ?, dosage = ?, frequency = ?, timing_json = ?, start_date = ?, end_date = ?, active = ?, updatedAt = datetime('now')
            WHERE id = ? AND patient_id = ?
        `).run(
            next.name,
            next.dosage,
            next.frequency,
            JSON.stringify(Array.isArray(next.timing) ? next.timing : []),
            next.startDate,
            next.endDate,
            next.active,
            req.params.id,
            req.user._id,
        );

        const updated = db.prepare('SELECT * FROM medications WHERE id = ?').get(req.params.id);
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: 'Failed to update medication.' });
    }
});

// POST /api/patient/medications/:id/log
router.post('/medications/:id/log', async (req, res) => {
    try {
        const medication = db.prepare('SELECT * FROM medications WHERE id = ? AND patient_id = ?').get(req.params.id, req.user._id);
        if (!medication) return res.status(404).json({ error: 'Medication not found.' });

        const { scheduledTime, takenTime, status, note } = req.body;
        const result = db.prepare(`
            INSERT INTO medication_logs (medication_id, patient_id, scheduled_time, taken_time, status, note)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(
            req.params.id,
            req.user._id,
            scheduledTime || null,
            takenTime || new Date().toISOString(),
            status || 'taken',
            note || null,
        );

        const log = db.prepare('SELECT * FROM medication_logs WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json(log);
    } catch (err) {
        res.status(500).json({ error: 'Failed to save medication log.' });
    }
});

// GET /api/patient/medications/adherence?range=30d
router.get('/medications/adherence', async (req, res) => {
    try {
        const days = resolveRangeDays(req.query.range || '30d');
        const since = new Date();
        since.setDate(since.getDate() - days);

        const aggregate = db.prepare(`
            SELECT
                COUNT(*) AS total,
                COALESCE(SUM(CASE WHEN status = 'taken' THEN 1 ELSE 0 END), 0) AS taken,
                COALESCE(SUM(CASE WHEN status = 'missed' THEN 1 ELSE 0 END), 0) AS missed
            FROM medication_logs
            WHERE patient_id = ? AND COALESCE(taken_time, createdAt) >= ?
        `).get(req.user._id, since.toISOString());

        const total = Number(aggregate.total || 0);
        const taken = Number(aggregate.taken || 0);
        const missed = Number(aggregate.missed || 0);
        const adherencePercent = total === 0 ? 0 : Number(((taken / total) * 100).toFixed(2));

        res.json({ range: `${days}d`, total, taken, missed, adherencePercent });
    } catch (err) {
        res.status(500).json({ error: 'Failed to calculate adherence.' });
    }
});

// ─── Feature 5: Meals and Activity ─────────────────────────────────

// GET /api/patient/diet/intake/estimate?text=2%20idli
router.get('/diet/intake/estimate', async (req, res) => {
    try {
        const text = sanitize(String(req.query.text || '')).trim();

        if (!text) {
            return res.json({
                calories: null,
                carbs: null,
                protein: null,
                fat: null,
                fiber: null,
                gi: null,
                serving: null,
                servingText: null,
                itemCount: 0,
                items: [],
            });
        }

        if (text.length > 240) {
            return res.status(400).json({ error: 'Meal text is too long for quick estimation.' });
        }

        const estimate = estimateNutrition(text);
        return res.json({
            calories: Number(estimate.calories || 0),
            carbs: Number(estimate.carbs || 0),
            protein: Number(estimate.protein || 0),
            fat: Number(estimate.fat || 0),
            fiber: Number(estimate.fiber || 0),
            gi: estimate.gi !== null && estimate.gi !== undefined ? Number(estimate.gi) : null,
            serving: estimate.serving !== null && estimate.serving !== undefined ? Number(estimate.serving) : null,
            servingText: estimate.servingText || null,
            itemCount: Number(estimate.itemCount || 0),
            items: Array.isArray(estimate.items) ? estimate.items.slice(0, 10) : [],
        });
    } catch (_err) {
        return res.status(500).json({ error: 'Failed to estimate meal nutrition.' });
    }
});

router.post('/diet/intake', async (req, res) => {
    try {
        const mealSlot = sanitize(String(req.body.mealSlot || '')).toLowerCase();
        const intakeText = sanitize(String(req.body.intakeText || req.body.intake || '')).trim();
        const sugarTiming = sanitize(String(req.body.sugarTiming || '')).toLowerCase() || null;
        const note = sanitize(String(req.body.note || '')).trim() || null;
        const loggedAt = req.body.loggedAt || null;

        const bloodSugarMgDl = toFiniteNumberOrNull(req.body.bloodSugarMgDl);
        const carbsG = toFiniteNumberOrNull(req.body.carbsG);
        const calories = toFiniteNumberOrNull(req.body.calories);

        if (!isOneOf(mealSlot, DIET_MEAL_SLOTS)) {
            return res.status(400).json({ error: 'Meal slot must be breakfast, lunch, dinner, or snack.' });
        }

        if (!intakeText) {
            return res.status(400).json({ error: 'Meal intake details are required.' });
        }

        if (intakeText.length > 600) {
            return res.status(400).json({ error: 'Meal intake details are too long (max 600 chars).' });
        }

        if (sugarTiming && !isOneOf(sugarTiming, DIET_SUGAR_TIMINGS)) {
            return res.status(400).json({ error: 'Sugar timing must be before, after, or random.' });
        }

        if (bloodSugarMgDl !== null && !isFiniteInRange(bloodSugarMgDl, 40, 700)) {
            return res.status(400).json({ error: 'Blood sugar must be between 40 and 700 mg/dL.' });
        }

        if (carbsG !== null && !isFiniteInRange(carbsG, 0, 1200)) {
            return res.status(400).json({ error: 'Carbs must be between 0 and 1200 grams.' });
        }

        if (calories !== null && !isFiniteInRange(calories, 0, 10000)) {
            return res.status(400).json({ error: 'Calories must be between 0 and 10000.' });
        }

        if (loggedAt && !isValidDate(loggedAt)) {
            return res.status(400).json({ error: 'Invalid loggedAt date/time format.' });
        }

        const result = db.prepare(`
            INSERT INTO diet_intakes (
                patient_id, meal_slot, intake_text, blood_sugar_mgdl, sugar_timing, carbs_g, calories, note, logged_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            req.user._id,
            mealSlot,
            intakeText,
            bloodSugarMgDl,
            sugarTiming,
            carbsG,
            calories,
            note,
            loggedAt ? new Date(loggedAt).toISOString() : new Date().toISOString(),
        );

        const created = db.prepare('SELECT * FROM diet_intakes WHERE id = ?').get(result.lastInsertRowid);
        return res.status(201).json(mapDietIntakeRow(created));
    } catch (err) {
        return res.status(500).json({ error: 'Failed to save diet intake log.' });
    }
});

router.get('/diet/intake', async (req, res) => {
    try {
        const days = resolveRangeDays(req.query.range || req.query.days || '7d');
        const { sinceIso } = buildDietDateRange(days);
        const rows = db.prepare(`
            SELECT *
            FROM diet_intakes
            WHERE patient_id = ?
              AND datetime(logged_at) >= datetime(?)
            ORDER BY datetime(logged_at) DESC
        `).all(req.user._id, sinceIso);

        return res.json(rows.map(mapDietIntakeRow));
    } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch diet intake logs.' });
    }
});

router.get('/diet/report', async (req, res) => {
    try {
        const days = resolveRangeDays(req.query.range || '7d');
        const report = buildDietReportSummary(req.user._id, days);
        return res.json(report);
    } catch (err) {
        return res.status(500).json({ error: 'Failed to build diet report.' });
    }
});

router.post('/meals', async (req, res) => {
    try {
        const { mealType, carbsG, calories, note, loggedAt } = req.body;
        const result = db.prepare(`
            INSERT INTO meal_logs (patient_id, meal_type, carbs_g, calories, note, logged_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(req.user._id, mealType || null, carbsG || null, calories || null, note || null, loggedAt || new Date().toISOString());
        res.status(201).json(db.prepare('SELECT * FROM meal_logs WHERE id = ?').get(result.lastInsertRowid));
    } catch (err) {
        res.status(500).json({ error: 'Failed to save meal log.' });
    }
});

router.get('/meals', async (req, res) => {
    try {
        const days = resolveRangeDays(req.query.range || '7d');
        const since = new Date();
        since.setDate(since.getDate() - days);
        const rows = db.prepare('SELECT * FROM meal_logs WHERE patient_id = ? AND logged_at >= ? ORDER BY logged_at DESC').all(req.user._id, since.toISOString());
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch meals.' });
    }
});

router.post('/activities', async (req, res) => {
    try {
        const { activityType, durationMin, intensity, steps, caloriesBurned, loggedAt } = req.body;
        const result = db.prepare(`
            INSERT INTO activity_logs (patient_id, activity_type, duration_min, intensity, steps, calories_burned, logged_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(req.user._id, activityType || null, durationMin || null, intensity || null, steps || null, caloriesBurned || null, loggedAt || new Date().toISOString());
        res.status(201).json(db.prepare('SELECT * FROM activity_logs WHERE id = ?').get(result.lastInsertRowid));
    } catch (err) {
        res.status(500).json({ error: 'Failed to save activity log.' });
    }
});

router.get('/activities', async (req, res) => {
    try {
        const days = resolveRangeDays(req.query.range || '7d');
        const since = new Date();
        since.setDate(since.getDate() - days);
        const rows = db.prepare('SELECT * FROM activity_logs WHERE patient_id = ? AND logged_at >= ? ORDER BY logged_at DESC').all(req.user._id, since.toISOString());
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch activity logs.' });
    }
});

router.get('/correlations/glucose-lifestyle', async (req, res) => {
    try {
        const days = resolveRangeDays(req.query.range || '30d');
        const since = new Date();
        since.setDate(since.getDate() - days);

        const glucose = db.prepare('SELECT value FROM glucose_readings WHERE patient = ? AND recordedAt >= ?').all(req.user._id, since.toISOString());
        const meals = db.prepare('SELECT COALESCE(SUM(carbs_g),0) AS carbs, COUNT(*) AS mealCount FROM meal_logs WHERE patient_id = ? AND logged_at >= ?').get(req.user._id, since.toISOString());
        const activity = db.prepare('SELECT COALESCE(SUM(duration_min),0) AS activeMinutes FROM activity_logs WHERE patient_id = ? AND logged_at >= ?').get(req.user._id, since.toISOString());

        const avgGlucose = glucose.length === 0 ? null : Number((glucose.reduce((s, g) => s + Number(g.value), 0) / glucose.length).toFixed(2));
        res.json({
            range: `${days}d`,
            summary: {
                avgGlucose,
                totalCarbs: Number(meals.carbs || 0),
                mealCount: Number(meals.mealCount || 0),
                activeMinutes: Number(activity.activeMinutes || 0),
            },
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to build correlation summary.' });
    }
});

// ─── Feature 6: Biometrics Panel ───────────────────────────────────

router.get('/biometrics/latest', async (req, res) => {
    try {
        const latestGlucose = GlucoseReading.findLatestByPatient(req.user._id);
        const latestMetric = HealthMetric.findLatestByPatient(req.user._id);
        res.json({ latestGlucose, latestMetric });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch latest biometrics.' });
    }
});

router.get('/biometrics/trends', async (req, res) => {
    try {
        const days = resolveRangeDays(req.query.range || '90d');
        const glucose = GlucoseReading.findByPatient(req.user._id, { days });
        const metrics = HealthMetric.findByPatient(req.user._id, { days });
        res.json({ range: `${days}d`, glucose, metrics });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch biometrics trends.' });
    }
});

// ─── Feature 7: Doctor Communication ───────────────────────────────

router.get('/messages/threads', async (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT
                mt.*,
                (
                    SELECT m.body
                    FROM messages m
                    WHERE m.thread_id = mt.id
                    ORDER BY m.id DESC
                    LIMIT 1
                ) AS lastMessageBody,
                (
                    SELECT m.sender_role
                    FROM messages m
                    WHERE m.thread_id = mt.id
                    ORDER BY m.id DESC
                    LIMIT 1
                ) AS lastMessageSenderRole,
                (
                    SELECT COUNT(*)
                    FROM messages m
                    WHERE m.thread_id = mt.id
                      AND m.sender_role = 'doctor'
                      AND m.read_at IS NULL
                ) AS unreadCount
            FROM message_threads mt
            WHERE mt.patient_id = ?
            ORDER BY mt.last_message_at DESC
        `).all(req.user._id);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch threads.' });
    }
});

router.post('/messages/threads', async (req, res) => {
    try {
        const { doctorId, subject, body } = req.body;
        const result = db.prepare('INSERT INTO message_threads (patient_id, doctor_id, subject) VALUES (?, ?, ?)').run(req.user._id, doctorId || null, subject || null);
        const threadId = result.lastInsertRowid;

        var msg = null;
        if (body) {
            var msgResult = db.prepare(`
                INSERT INTO messages (thread_id, sender_id, sender_role, body, attachments_json)
                VALUES (?, ?, 'patient', ?, ?)
            `).run(threadId, req.user._id, body, JSON.stringify([]));
            msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(msgResult.lastInsertRowid);
        }

        var thread = db.prepare('SELECT * FROM message_threads WHERE id = ?').get(threadId);

        // Real-time push to doctor
        if (doctorId) {
            var io = req.app.get('io');
            if (io) {
                io.to('user_' + doctorId).emit('new_message', { threadId: threadId, message: msg, thread: thread });
            }
        }

        res.status(201).json(thread);
    } catch (err) {
        res.status(500).json({ error: 'Failed to create thread.' });
    }
});

router.get('/messages/threads/:id', async (req, res) => {
    try {
        const thread = db.prepare('SELECT * FROM message_threads WHERE id = ? AND patient_id = ?').get(req.params.id, req.user._id);
        if (!thread) return res.status(404).json({ error: 'Thread not found.' });
        const messages = db.prepare('SELECT * FROM messages WHERE thread_id = ? ORDER BY sent_at ASC').all(req.params.id);

        // Mark doctor messages as read
        const unreadDoctorMsgs = messages.filter(function(m) { return m.sender_role === 'doctor' && !m.read_at; });
        if (unreadDoctorMsgs.length > 0) {
            db.prepare("UPDATE messages SET delivered_at = COALESCE(delivered_at, datetime('now')), read_at = datetime('now') WHERE thread_id = ? AND sender_role = 'doctor' AND read_at IS NULL").run(req.params.id);
            // Notify doctor via socket that their messages were read
            var io = req.app.get('io');
            if (io && thread.doctor_id) {
                io.to('user_' + thread.doctor_id).emit('messages_read_ack', {
                    messageIds: unreadDoctorMsgs.map(function(m) { return m.id; }),
                    threadId: Number(req.params.id)
                });
            }
            // Refresh messages to include updated read_at
            const updatedMessages = db.prepare('SELECT * FROM messages WHERE thread_id = ? ORDER BY sent_at ASC').all(req.params.id);
            return res.json({ thread, messages: updatedMessages });
        }

        res.json({ thread, messages });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch thread messages.' });
    }
});

router.post('/messages/threads/:id', async (req, res) => {
    try {
        const thread = db.prepare('SELECT * FROM message_threads WHERE id = ? AND patient_id = ?').get(req.params.id, req.user._id);
        if (!thread) return res.status(404).json({ error: 'Thread not found.' });

        const { body, attachments } = req.body;
        if (!body || !sanitize(body)) return res.status(400).json({ error: 'Message body is required.' });
        if (body.length > 5000) return res.status(400).json({ error: 'Message body is too long (max 5000 chars).' });

        const result = db.prepare(`
            INSERT INTO messages (thread_id, sender_id, sender_role, body, attachments_json)
            VALUES (?, ?, 'patient', ?, ?)
        `).run(req.params.id, req.user._id, body, JSON.stringify(Array.isArray(attachments) ? attachments : []));

        db.prepare('UPDATE message_threads SET last_message_at = datetime(\'now\'), updatedAt = datetime(\'now\') WHERE id = ?').run(req.params.id);

        var msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid);

        // Real-time push to doctor
        if (thread.doctor_id) {
            var io = req.app.get('io');
            if (io) {
                io.to('user_' + thread.doctor_id).emit('new_message', { threadId: thread.id, message: msg });
            }
        }

        res.status(201).json(msg);
    } catch (err) {
        res.status(500).json({ error: 'Failed to send message.' });
    }
});

// ─── Feature 8: Appointment Experience ─────────────────────────────

router.get('/appointments/upcoming', async (req, res) => {
    try {
        const rows = Appointment.findUpcomingByPatient(req.user._id, 10);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch upcoming appointments.' });
    }
});

router.get('/appointments/:id/checklist', async (req, res) => {
    try {
        const rows = db.prepare('SELECT * FROM appointment_checklist WHERE appointment_id = ? AND patient_id = ? ORDER BY id DESC').all(req.params.id, req.user._id);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch checklist.' });
    }
});

router.post('/appointments/:id/checklist', async (req, res) => {
    try {
        const { item, isDone } = req.body;
        if (!item) return res.status(400).json({ error: 'Checklist item is required.' });
        const result = db.prepare(`
            INSERT INTO appointment_checklist (appointment_id, patient_id, item, is_done)
            VALUES (?, ?, ?, ?)
        `).run(req.params.id, req.user._id, item, isDone ? 1 : 0);
        res.status(201).json(db.prepare('SELECT * FROM appointment_checklist WHERE id = ?').get(result.lastInsertRowid));
    } catch (err) {
        res.status(500).json({ error: 'Failed to save checklist item.' });
    }
});

// ─── Feature 9: Report Center Enhancements ─────────────────────────

router.post('/reports/upload', async (req, res) => {
    try {
        const reportName = sanitize(req.body.reportName);
        const type = sanitize(req.body.type);
        const date = sanitize(req.body.date);
        const { doctor, status, parsed } = req.body;
        const fileUrl = req.body.fileUrl ? sanitize(String(req.body.fileUrl)) : null;
        const fileType = req.body.fileType ? sanitize(String(req.body.fileType)) : null;

        if (!reportName || !type || !date) {
            return res.status(400).json({ error: 'Report name, type, and date are required.' });
        }

        if (!isOneOf(type, ['Lab Report', 'Imaging', 'Clinical Note', 'Diabetes Report'])) {
            return res.status(400).json({ error: 'Invalid report type.' });
        }

        if (!isValidDate(date)) {
            return res.status(400).json({ error: 'Invalid date format.' });
        }

        const duplicate = findRecentDuplicateReport({
            patientId: req.user._id,
            reportName,
            type,
            date,
            fileUrl,
        });
        if (duplicate) {
            return res.status(409).json({
                error: 'Duplicate report detected. This report was already added recently.',
                code: 'duplicate_report',
                report: mapReportRow(duplicate),
            });
        }

        const parsedObject = parsed && typeof parsed === 'object' ? parsed : null;
        const extractedPatientName = parsedObject && parsedObject.extracted
            ? parsedObject.extracted.patientName
            : null;
        const nameVerification = verifyReportPatientName(extractedPatientName, req.user.fullName);

        if (parsedObject) {
            parsedObject.nameVerification = nameVerification;
        }

        let finalStatus = status || 'Pending';
        if (!status && parsedObject && parsedObject.review && parsedObject.review.label) {
            finalStatus = (parsedObject.review.level === 'bad' || parsedObject.review.level === 'caution')
                ? 'Needs Attention'
                : 'Reviewed - Not Bad';
        } else if (!status && parsedObject) {
            finalStatus = 'Analyzed';
        }
        if (nameVerification.isMatch === false) {
            finalStatus = 'Name Mismatch - Review';
        }

        const parsedJson = parsedObject ? JSON.stringify(parsedObject) : null;
        const reviewJson = parsedObject && parsedObject.review && typeof parsedObject.review === 'object'
            ? JSON.stringify(parsedObject.review)
            : null;

        const report = Report.create({
            patient: req.user._id,
            reportName,
            type,
            date,
            doctor,
            status: finalStatus,
            fileUrl,
            fileType,
            parsedJson,
            reviewJson,
        });
        res.status(201).json({
            ...report,
            nameVerification,
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to upload report metadata.' });
    }
});

router.get('/reports/extraction-metrics', async (req, res) => {
    try {
        const days = resolveRangeDays(req.query.range || '30d');
        const since = new Date();
        since.setDate(since.getDate() - days);
        const sinceIso = since.toISOString();

        const reportRows = db.prepare(`
            SELECT id, reportName, date, status, parsed_json, createdAt
            FROM reports
            WHERE patient = ? AND datetime(createdAt) >= datetime(?)
            ORDER BY datetime(createdAt) DESC
        `).all(req.user._id, sinceIso);

        const correctionSummary = db.prepare(`
            SELECT
                COUNT(*) AS correctionCount,
                COUNT(DISTINCT report_id) AS correctedReports
            FROM report_corrections
            WHERE patient_id = ? AND datetime(createdAt) >= datetime(?)
        `).get(req.user._id, sinceIso);

        const topCorrectedFields = db.prepare(`
            SELECT field_key AS fieldKey, COUNT(*) AS count
            FROM report_corrections
            WHERE patient_id = ? AND datetime(createdAt) >= datetime(?)
            GROUP BY field_key
            ORDER BY count DESC
            LIMIT 8
        `).all(req.user._id, sinceIso).map((row) => ({
            fieldKey: row.fieldKey,
            count: Number(row.count || 0),
        }));

        let extractedReports = 0;
        let highConfidence = 0;
        let mediumConfidence = 0;
        let lowConfidence = 0;
        let confidenceTotal = 0;
        let confidenceCount = 0;
        let templateMatchedReports = 0;
        let missingCriticalSignals = 0;
        let nameMismatchReports = 0;
        const recent = [];

        reportRows.forEach((row) => {
            const parsed = parseReportJsonObject(row);
            if (!parsed) return;

            extractedReports += 1;
            const confidence = Number(parsed.confidence);
            if (Number.isFinite(confidence)) {
                confidenceTotal += confidence;
                confidenceCount += 1;

                if (confidence >= 0.86) highConfidence += 1;
                else if (confidence >= 0.64) mediumConfidence += 1;
                else lowConfidence += 1;
            }

            const template = parsed.confidenceDetails && parsed.confidenceDetails.template;
            if (template && template.strategy === 'template') {
                templateMatchedReports += 1;
            }

            const extracted = parsed.extracted || {};
            const glucoseValues = Array.isArray(extracted.glucoseReadingsMgDl) ? extracted.glucoseReadingsMgDl : [];
            if (extracted.hba1c === null && glucoseValues.length === 0) {
                missingCriticalSignals += 1;
            }

            if ((parsed.nameVerification && parsed.nameVerification.isMatch === false)
                || String(row.status || '').toLowerCase().includes('name mismatch')) {
                nameMismatchReports += 1;
            }

            if (recent.length < 12) {
                recent.push({
                    reportId: row.id,
                    reportName: row.reportName,
                    date: row.date,
                    status: row.status,
                    confidence: Number.isFinite(confidence) ? Number(confidence.toFixed(3)) : null,
                    qualityFlags: Array.isArray(parsed.qualityFlags) ? parsed.qualityFlags : [],
                });
            }
        });

        res.json({
            range: `${days}d`,
            summary: {
                totalReports: reportRows.length,
                extractedReports,
                avgConfidence: confidenceCount ? Number((confidenceTotal / confidenceCount).toFixed(3)) : null,
                highConfidenceReports: highConfidence,
                mediumConfidenceReports: mediumConfidence,
                lowConfidenceReports: lowConfidence,
                templateMatchedReports,
                missingCriticalSignals,
                nameMismatchReports,
            },
            corrections: {
                correctionCount: Number(correctionSummary.correctionCount || 0),
                correctedReports: Number(correctionSummary.correctedReports || 0),
                topCorrectedFields,
            },
            recent,
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to build extraction metrics.' });
    }
});

router.get('/reports/:id/corrections', async (req, res) => {
    try {
        const report = db.prepare('SELECT id FROM reports WHERE id = ? AND patient = ?').get(req.params.id, req.user._id);
        if (!report) return res.status(404).json({ error: 'Report not found.' });

        const rows = db.prepare(`
            SELECT id, field_key, original_value_json, corrected_value_json, note, createdAt
            FROM report_corrections
            WHERE report_id = ? AND patient_id = ?
            ORDER BY id DESC
        `).all(req.params.id, req.user._id);

        res.json(rows.map((row) => ({
            id: row.id,
            fieldKey: row.field_key,
            originalValue: safeJsonParse(row.original_value_json, null),
            correctedValue: safeJsonParse(row.corrected_value_json, null),
            note: row.note || null,
            createdAt: row.createdAt,
        })));
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch report corrections.' });
    }
});

router.post('/reports/:id/corrections', async (req, res) => {
    try {
        const reportRow = db.prepare('SELECT * FROM reports WHERE id = ? AND patient = ?').get(req.params.id, req.user._id);
        if (!reportRow) return res.status(404).json({ error: 'Report not found.' });

        const corrections = normalizeCorrectionsInput(req.body);
        if (corrections.length === 0) {
            return res.status(400).json({ error: 'Provide at least one valid correction entry.' });
        }

        const parsedObject = parseReportJsonObject(reportRow) || {
            summary: null,
            extracted: {},
            confidence: null,
            source: 'manual-correction',
        };

        const extracted = ensureExtractedPayload(parsedObject);
        const applied = [];

        corrections.forEach((correction) => {
            const beforeValue = readCorrectableField(extracted, correction.fieldKey);
            const afterValue = applyCorrectableField(extracted, correction.fieldKey, correction.value);

            if (JSON.stringify(beforeValue) === JSON.stringify(afterValue)) {
                return;
            }

            db.prepare(`
                INSERT INTO report_corrections (
                    report_id, patient_id, field_key, original_value_json, corrected_value_json, note
                )
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(
                reportRow.id,
                req.user._id,
                correction.fieldKey,
                JSON.stringify(beforeValue),
                JSON.stringify(afterValue),
                correction.note || null,
            );

            applied.push({
                fieldKey: correction.fieldKey,
                originalValue: beforeValue,
                correctedValue: afterValue,
                note: correction.note || null,
            });
        });

        if (applied.length === 0) {
            return res.status(200).json({
                message: 'No effective changes detected in correction payload.',
                report: mapReportRow(reportRow),
                applied: [],
            });
        }

        const evaluated = evaluateExtractedData(extracted, {
            text: parsedObject.textPreview || '',
            metadata: {
                fileName: reportRow.reportName,
                fileType: reportRow.file_type,
                ocrDiagnostics: parsedObject.confidenceDetails && parsedObject.confidenceDetails.ocr
                    ? parsedObject.confidenceDetails.ocr
                    : null,
            },
            templateInfo: parsedObject.confidenceDetails && parsedObject.confidenceDetails.template
                ? parsedObject.confidenceDetails.template
                : null,
        });

        parsedObject.summary = evaluated.summary;
        parsedObject.review = evaluated.review;
        parsedObject.confidence = evaluated.confidence;
        parsedObject.confidenceDetails = evaluated.confidenceDetails;
        parsedObject.qualityFlags = evaluated.qualityFlags;
        parsedObject.correctionMeta = {
            correctedAt: new Date().toISOString(),
            correctedFieldCount: Number((parsedObject.correctionMeta && parsedObject.correctionMeta.correctedFieldCount) || 0) + applied.length,
        };

        const nextStatus = buildCorrectedReportStatus(parsedObject);

        db.prepare(`
            UPDATE reports
            SET parsed_json = ?, review_json = ?, status = ?, updatedAt = datetime('now')
            WHERE id = ? AND patient = ?
        `).run(
            JSON.stringify(parsedObject),
            parsedObject.review ? JSON.stringify(parsedObject.review) : null,
            nextStatus,
            reportRow.id,
            req.user._id,
        );

        const updatedRow = db.prepare('SELECT * FROM reports WHERE id = ? AND patient = ?').get(reportRow.id, req.user._id);

        res.json({
            message: 'Corrections applied successfully.',
            applied,
            report: mapReportRow(updatedRow),
            result: parsedObject,
        });
    } catch (err) {
        res.status(400).json({ error: err && err.message ? err.message : 'Failed to apply report corrections.' });
    }
});

router.get('/reports/:id', async (req, res) => {
    try {
        const row = db.prepare('SELECT * FROM reports WHERE id = ? AND patient = ?').get(req.params.id, req.user._id);
        if (!row) return res.status(404).json({ error: 'Report not found.' });
        res.json(mapReportRow(row));
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch report.' });
    }
});

router.delete('/reports/:id', async (req, res) => {
    try {
        const reportRow = db.prepare('SELECT * FROM reports WHERE id = ? AND patient = ?').get(req.params.id, req.user._id);
        if (!reportRow) return res.status(404).json({ error: 'Report not found.' });

        let cleanup = { glucoseDeleted: 0, healthMetricsDeleted: 0 };
        try {
            cleanup = cleanupImportedBiometricsForReport(reportRow, req.user._id);
        } catch (_cleanupErr) {
        }

        const result = db.prepare('DELETE FROM reports WHERE id = ? AND patient = ?').run(req.params.id, req.user._id);
        if (result.changes === 0) return res.status(404).json({ error: 'Report not found.' });
        res.json({
            message: 'Report deleted.',
            cleanup,
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete report.' });
    }
});

// ─── Feature 10: Personalized Education ────────────────────────────

router.get('/education/recommendations', async (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT er.*, ec.title, ec.body, ec.topic, ec.language, ec.media_url
            FROM education_recommendations er
            JOIN education_content ec ON er.content_id = ec.id
            WHERE er.patient_id = ?
            ORDER BY er.shown_at DESC
            LIMIT 20
        `).all(req.user._id);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch education recommendations.' });
    }
});

router.post('/education/:id/feedback', async (req, res) => {
    try {
        const { helpfulScore, comment } = req.body;
        const result = db.prepare(`
            INSERT INTO education_feedback (patient_id, content_id, helpful_score, comment)
            VALUES (?, ?, ?, ?)
        `).run(req.user._id, req.params.id, helpfulScore ?? null, comment || null);
        res.status(201).json(db.prepare('SELECT * FROM education_feedback WHERE id = ?').get(result.lastInsertRowid));
    } catch (err) {
        res.status(500).json({ error: 'Failed to save education feedback.' });
    }
});

// ─── Feature 10b: AI Diabetes Assistant ────────────────────────────

router.get('/ai/history', async (req, res) => {
    try {
        const row = db.prepare(`
            SELECT conversation_json
            FROM ai_chat_history
            WHERE patient_id = ?
            LIMIT 1
        `).get(req.user._id);

        const stored = row && row.conversation_json ? safeJsonParse(row.conversation_json, []) : [];
        const history = Array.isArray(stored)
            ? convertLegacyAiConversationToHistory(stored)
            : sanitizeAiHistoryPayload(stored);

        res.json({ history });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch AI history.' });
    }
});

router.put('/ai/history', async (req, res) => {
    try {
        let history = null;

        if (req.body && typeof req.body.history === 'object' && req.body.history) {
            history = sanitizeAiHistoryPayload(req.body.history);
        } else if (Array.isArray(req.body.conversation)) {
            history = convertLegacyAiConversationToHistory(req.body.conversation);
        } else {
            return res.status(400).json({ error: 'Provide history object or conversation array.' });
        }

        const payload = JSON.stringify(history);

        db.prepare(`
            INSERT INTO ai_chat_history (patient_id, conversation_json)
            VALUES (?, ?)
            ON CONFLICT(patient_id) DO UPDATE SET
                conversation_json = excluded.conversation_json,
                updatedAt = datetime('now')
        `).run(req.user._id, payload);

        res.json({ history });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save AI history.' });
    }
});

router.delete('/ai/history', async (req, res) => {
    try {
        db.prepare('DELETE FROM ai_chat_history WHERE patient_id = ?').run(req.user._id);
        res.json({ message: 'AI history cleared.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to clear AI history.' });
    }
});

router.post('/ai/ask', async (req, res) => {
    try {
        const debugSourceEnabled = String(process.env.AI_DEBUG_SOURCE || 'false').toLowerCase() === 'true';
        const withDebug = (payload, engine) => {
            if (!debugSourceEnabled || !payload || typeof payload !== 'object') return payload;
            return {
                ...payload,
                debug: {
                    engine,
                    provider: engine === 'llm-fallback' ? String(process.env.LLM_PROVIDER || '').toLowerCase() : 'local',
                    sourceId: payload.source && payload.source.id ? payload.source.id : null,
                    confidence: typeof payload.confidence === 'number' ? payload.confidence : null,
                },
            };
        };

        const question = String(req.body.question || '').trim();
        if (!question) {
            return res.status(400).json({ error: 'Question is required.' });
        }

        const conciseRequested = shouldUseConciseAiResponse(
            question,
            Boolean(
                (req.body && req.body.concise === true)
                || String((req.body && req.body.responseStyle) || '').toLowerCase() === 'concise',
            ),
        );

        if (question.length > 600) {
            return res.status(400).json({ error: 'Question is too long. Keep it below 600 characters.' });
        }

        const dietAnalyticsResponse = buildDietAiResponse(req.user._id, question);
        if (dietAnalyticsResponse) {
            return res.json(withDebug(applyAiResponseStyle(dietAnalyticsResponse, { concise: conciseRequested }), 'diet-analytics'));
        }

        const allergies = Array.isArray(req.user.allergies) ? req.user.allergies : [];
        const profile = {
            chronicConditions: Array.isArray(req.user.chronicConditions) ? req.user.chronicConditions : [],
            bloodType: req.user.bloodType || null,
            dateOfBirth: req.user.dateOfBirth || null,
        };
        const localResponse = answerQuestion(question, { allergies, profile });

        const fallbackThreshold = Number(process.env.LLM_FALLBACK_THRESHOLD || 0.74);
        const lowConfidence = !localResponse
            || typeof localResponse.confidence !== 'number'
            || localResponse.confidence < fallbackThreshold;
        const localLooksVague = !localResponse || !localResponse.source || localResponse.source.id === 'clarify-question-first';
        const fallbackEnabled = String(process.env.LLM_FALLBACK_ENABLED || 'true').toLowerCase() !== 'false';

        if (fallbackEnabled && (lowConfidence || localLooksVague)) {
            const llmResponse = await askLlmFallback({
                question,
                allergies,
                profile,
                localResponse,
            });

            if (llmResponse) {
                return res.json(withDebug(applyAiResponseStyle(llmResponse, { concise: conciseRequested }), 'llm-fallback'));
            }
        }

        res.json(withDebug(applyAiResponseStyle(localResponse, { concise: conciseRequested }), 'local-ai'));
    } catch (err) {
        res.status(500).json({ error: 'Failed to process AI question.' });
    }
});

router.post('/ai/extract-document', async (req, res) => {
    try {
        const fileName = String(req.body.fileName || '').trim() || null;
        const fileType = String(req.body.fileType || '').trim() || null;
        const text = req.body.text;
        const base64Content = req.body.base64Content;

        if (!text && !base64Content) {
            return res.status(400).json({
                error: 'Provide either text or base64Content from uploaded document.',
            });
        }

        const parsed = await parseDocumentToText({
            fileName,
            fileType,
            text,
            base64Content,
        });

        if (!parsed.text) {
            return res.status(422).json({
                error: 'Could not read text from the provided document.',
                parser: parsed.parser,
                inferredType: parsed.inferredType,
            });
        }

        const extracted = extractProjectDataFromDocument(parsed.text, {
            fileName,
            fileType: parsed.inferredType,
            parser: parsed.parser,
            ocrDiagnostics: parsed.ocrDiagnostics || null,
        });

        const extractedPatientName = extracted && extracted.extracted
            ? extracted.extracted.patientName
            : null;
        const nameVerification = verifyReportPatientName(extractedPatientName, req.user.fullName);
        if (extracted && typeof extracted === 'object') {
            extracted.nameVerification = nameVerification;
        }

        res.json({
            parser: parsed.parser,
            inferredType: parsed.inferredType,
            diagnostics: {
                ocr: parsed.ocrDiagnostics || null,
            },
            result: extracted,
            nameVerification,
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to extract data from document.' });
    }
});

// ─── Feature 11: Emergency and Safety ──────────────────────────────

router.get('/safety/profile', async (req, res) => {
    try {
        let row = db.prepare('SELECT * FROM safety_profiles WHERE patient_id = ?').get(req.user._id);
        if (!row) {
            db.prepare('INSERT INTO safety_profiles (patient_id) VALUES (?)').run(req.user._id);
            row = db.prepare('SELECT * FROM safety_profiles WHERE patient_id = ?').get(req.user._id);
        }
        res.json(row);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch safety profile.' });
    }
});

router.patch('/safety/profile', async (req, res) => {
    try {
        const current = db.prepare('SELECT * FROM safety_profiles WHERE patient_id = ?').get(req.user._id)
            || { emergency_contact_name: null, emergency_contact_phone: null, caregiver_user_id: null, severe_low_threshold: 60, auto_notify_enabled: 0 };

        const next = {
            emergency_contact_name: req.body.emergencyContactName ?? current.emergency_contact_name,
            emergency_contact_phone: req.body.emergencyContactPhone ?? current.emergency_contact_phone,
            caregiver_user_id: req.body.caregiverUserId ?? current.caregiver_user_id,
            severe_low_threshold: req.body.severeLowThreshold ?? current.severe_low_threshold,
            auto_notify_enabled: req.body.autoNotifyEnabled === undefined ? current.auto_notify_enabled : (req.body.autoNotifyEnabled ? 1 : 0),
        };

        db.prepare(`
            INSERT INTO safety_profiles (patient_id, emergency_contact_name, emergency_contact_phone, caregiver_user_id, severe_low_threshold, auto_notify_enabled)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(patient_id) DO UPDATE SET
                emergency_contact_name = excluded.emergency_contact_name,
                emergency_contact_phone = excluded.emergency_contact_phone,
                caregiver_user_id = excluded.caregiver_user_id,
                severe_low_threshold = excluded.severe_low_threshold,
                auto_notify_enabled = excluded.auto_notify_enabled,
                updatedAt = datetime('now')
        `).run(
            req.user._id,
            next.emergency_contact_name,
            next.emergency_contact_phone,
            next.caregiver_user_id,
            next.severe_low_threshold,
            next.auto_notify_enabled,
        );

        res.json(db.prepare('SELECT * FROM safety_profiles WHERE patient_id = ?').get(req.user._id));
    } catch (err) {
        res.status(500).json({ error: 'Failed to update safety profile.' });
    }
});

router.post('/safety/trigger', async (req, res) => {
    try {
        const { eventType, severity, details } = req.body;
        if (!eventType || !severity) return res.status(400).json({ error: 'eventType and severity are required.' });
        const result = db.prepare(`
            INSERT INTO safety_events (patient_id, event_type, severity, details_json, notified_at)
            VALUES (?, ?, ?, ?, ?)
        `).run(req.user._id, eventType, severity, JSON.stringify(details || {}), new Date().toISOString());
        res.status(201).json(db.prepare('SELECT * FROM safety_events WHERE id = ?').get(result.lastInsertRowid));
    } catch (err) {
        res.status(500).json({ error: 'Failed to create safety event.' });
    }
});

// ─── Feature 12: Gamification ──────────────────────────────────────

router.get('/gamification/progress', async (req, res) => {
    try {
        const goals = db.prepare('SELECT * FROM goals WHERE patient_id = ? ORDER BY createdAt DESC').all(req.user._id);
        const streaks = db.prepare('SELECT * FROM streaks WHERE patient_id = ?').all(req.user._id);
        const badges = db.prepare(`
            SELECT pb.*, b.code, b.name
            FROM patient_badges pb
            JOIN badges b ON pb.badge_id = b.id
            WHERE pb.patient_id = ?
            ORDER BY pb.earned_at DESC
        `).all(req.user._id);
        res.json({ goals, streaks, badges });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch gamification progress.' });
    }
});

router.post('/gamification/goals', async (req, res) => {
    try {
        const { type, targetValue, period, status, startDate, endDate } = req.body;
        if (!type) return res.status(400).json({ error: 'Goal type is required.' });
        const result = db.prepare(`
            INSERT INTO goals (patient_id, type, target_value, period, status, start_date, end_date)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(req.user._id, type, targetValue ?? null, period || null, status || 'active', startDate || null, endDate || null);
        res.status(201).json(db.prepare('SELECT * FROM goals WHERE id = ?').get(result.lastInsertRowid));
    } catch (err) {
        res.status(500).json({ error: 'Failed to create goal.' });
    }
});

router.patch('/gamification/goals/:id', async (req, res) => {
    try {
        const current = db.prepare('SELECT * FROM goals WHERE id = ? AND patient_id = ?').get(req.params.id, req.user._id);
        if (!current) return res.status(404).json({ error: 'Goal not found.' });
        db.prepare(`
            UPDATE goals SET
                type = ?, target_value = ?, period = ?, status = ?, start_date = ?, end_date = ?, updatedAt = datetime('now')
            WHERE id = ? AND patient_id = ?
        `).run(
            req.body.type ?? current.type,
            req.body.targetValue ?? current.target_value,
            req.body.period ?? current.period,
            req.body.status ?? current.status,
            req.body.startDate ?? current.start_date,
            req.body.endDate ?? current.end_date,
            req.params.id,
            req.user._id,
        );
        res.json(db.prepare('SELECT * FROM goals WHERE id = ?').get(req.params.id));
    } catch (err) {
        res.status(500).json({ error: 'Failed to update goal.' });
    }
});

// ─── Feature 13: Export and Sharing ────────────────────────────────

router.post('/exports', async (req, res) => {
    try {
        const { format, scope, expiresAt } = req.body;
        if (!format) return res.status(400).json({ error: 'Export format is required.' });
        const result = db.prepare(`
            INSERT INTO exports (patient_id, format, scope_json, status, file_url, expires_at)
            VALUES (?, ?, ?, 'ready', ?, ?)
        `).run(
            req.user._id,
            format,
            JSON.stringify(scope || {}),
            `/exports/${Date.now()}-${req.user._id}.${String(format).toLowerCase()}`,
            expiresAt || null,
        );
        res.status(201).json(db.prepare('SELECT * FROM exports WHERE id = ?').get(result.lastInsertRowid));
    } catch (err) {
        res.status(500).json({ error: 'Failed to create export.' });
    }
});

router.get('/exports/:id', async (req, res) => {
    try {
        const row = db.prepare('SELECT * FROM exports WHERE id = ? AND patient_id = ?').get(req.params.id, req.user._id);
        if (!row) return res.status(404).json({ error: 'Export not found.' });
        res.json(row);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch export.' });
    }
});

router.post('/shares', async (req, res) => {
    try {
        const { targetType, targetValue, scope, expiresAt } = req.body;
        const token = `share_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        const result = db.prepare(`
            INSERT INTO data_shares (patient_id, target_type, target_value, scope_json, token, expires_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(req.user._id, targetType || null, targetValue || null, JSON.stringify(scope || {}), token, expiresAt || null);
        res.status(201).json(db.prepare('SELECT * FROM data_shares WHERE id = ?').get(result.lastInsertRowid));
    } catch (err) {
        res.status(500).json({ error: 'Failed to create share.' });
    }
});

router.patch('/shares/:id/revoke', async (req, res) => {
    try {
        const result = db.prepare(`
            UPDATE data_shares SET revoked_at = datetime('now'), updatedAt = datetime('now')
            WHERE id = ? AND patient_id = ?
        `).run(req.params.id, req.user._id);
        if (result.changes === 0) return res.status(404).json({ error: 'Share not found.' });
        res.json(db.prepare('SELECT * FROM data_shares WHERE id = ?').get(req.params.id));
    } catch (err) {
        res.status(500).json({ error: 'Failed to revoke share.' });
    }
});

// ─── Feature 14: Privacy and Access Controls ───────────────────────

router.get('/privacy/settings', async (req, res) => {
    try {
        let row = db.prepare('SELECT * FROM privacy_settings WHERE patient_id = ?').get(req.user._id);
        if (!row) {
            db.prepare('INSERT INTO privacy_settings (patient_id) VALUES (?)').run(req.user._id);
            row = db.prepare('SELECT * FROM privacy_settings WHERE patient_id = ?').get(req.user._id);
        }
        res.json(row);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch privacy settings.' });
    }
});

router.patch('/privacy/settings', async (req, res) => {
    try {
        const current = db.prepare('SELECT * FROM privacy_settings WHERE patient_id = ?').get(req.user._id)
            || { share_with_doctor: 1, share_with_caregiver: 0, research_opt_in: 0, marketing_opt_in: 0 };

        db.prepare(`
            INSERT INTO privacy_settings (patient_id, share_with_doctor, share_with_caregiver, research_opt_in, marketing_opt_in)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(patient_id) DO UPDATE SET
                share_with_doctor = excluded.share_with_doctor,
                share_with_caregiver = excluded.share_with_caregiver,
                research_opt_in = excluded.research_opt_in,
                marketing_opt_in = excluded.marketing_opt_in,
                updatedAt = datetime('now')
        `).run(
            req.user._id,
            req.body.shareWithDoctor === undefined ? current.share_with_doctor : (req.body.shareWithDoctor ? 1 : 0),
            req.body.shareWithCaregiver === undefined ? current.share_with_caregiver : (req.body.shareWithCaregiver ? 1 : 0),
            req.body.researchOptIn === undefined ? current.research_opt_in : (req.body.researchOptIn ? 1 : 0),
            req.body.marketingOptIn === undefined ? current.marketing_opt_in : (req.body.marketingOptIn ? 1 : 0),
        );

        res.json(db.prepare('SELECT * FROM privacy_settings WHERE patient_id = ?').get(req.user._id));
    } catch (err) {
        res.status(500).json({ error: 'Failed to update privacy settings.' });
    }
});

router.get('/security/sessions', async (req, res) => {
    try {
        const rows = db.prepare('SELECT * FROM user_sessions WHERE user_id = ? ORDER BY createdAt DESC').all(req.user._id);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch sessions.' });
    }
});

router.delete('/security/sessions/:id', async (req, res) => {
    try {
        const result = db.prepare(`
            UPDATE user_sessions SET revoked_at = datetime('now'), updatedAt = datetime('now')
            WHERE id = ? AND user_id = ?
        `).run(req.params.id, req.user._id);
        if (result.changes === 0) return res.status(404).json({ error: 'Session not found.' });
        res.json({ message: 'Session revoked.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to revoke session.' });
    }
});

router.get('/audit/access-log', async (req, res) => {
    try {
        const rows = db.prepare('SELECT * FROM access_audit_logs WHERE user_id = ? ORDER BY createdAt DESC LIMIT 100').all(req.user._id);
        res.json(rows.map((row) => ({ ...row, meta: safeJsonParse(row.meta_json, {}) })));
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch audit logs.' });
    }
});

module.exports = router;
