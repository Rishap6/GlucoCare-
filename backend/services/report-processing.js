const { sanitize, isFiniteInRange } = require('../middleware/validate');
const { getDb } = require('../database');

const REPORT_IMPORT_GLUCOSE_NOTE = 'Imported from AI report upload';
const REPORT_IMPORT_CLEANUP_WINDOW_MINUTES = 45;

const db = {
    prepare: (...args) => getDb().prepare(...args),
};

function normalizePersonName(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/\([^)]*\)/g, ' ')
        .replace(/\b(mr|mrs|ms|dr|patient|name|id|ref|by)\b/g, ' ')
        .replace(/[^a-z\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenizePersonName(value) {
    const noisyTokens = new Set(['male', 'female', 'years', 'year', 'old', 'yf']);
    const normalized = normalizePersonName(value);
    if (!normalized) return [];
    return normalized.split(' ').filter((token) => token.length > 1 && !noisyTokens.has(token));
}

function verifyReportPatientName(reportPatientName, profileName) {
    const reportTokens = tokenizePersonName(reportPatientName);
    const profileTokens = tokenizePersonName(profileName);

    const result = {
        reportPatientName: reportPatientName || null,
        profileName: profileName || null,
        isMatch: null,
        confidence: null,
        profileCoverage: null,
        reportCoverage: null,
        note: '',
    };

    if (!profileTokens.length) {
        result.note = 'Logged-in profile name is unavailable.';
        return result;
    }

    if (!reportTokens.length) {
        result.note = 'Could not confidently extract patient name from report text.';
        return result;
    }

    const reportSet = new Set(reportTokens);
    const profileSet = new Set(profileTokens);

    let overlapCount = 0;
    profileSet.forEach((token) => {
        if (reportSet.has(token)) overlapCount += 1;
    });

    const profileCoverage = overlapCount / profileSet.size;
    const reportCoverage = overlapCount / reportSet.size;
    const normalizedReportName = normalizePersonName(reportPatientName);
    const normalizedProfileName = normalizePersonName(profileName);
    const exactLikeMatch = Boolean(
        normalizedReportName
        && normalizedProfileName
        && (
            normalizedReportName === normalizedProfileName
            || normalizedReportName.includes(normalizedProfileName)
            || normalizedProfileName.includes(normalizedReportName)
        )
    );

    const isMatch = exactLikeMatch || profileCoverage >= 0.67 || (profileSet.size === 1 && overlapCount === 1);
    const rawConfidence = (profileCoverage * 0.7) + (reportCoverage * 0.3) + (exactLikeMatch ? 0.2 : 0);

    result.isMatch = isMatch;
    result.confidence = Number(Math.min(0.99, Math.max(0, rawConfidence)).toFixed(3));
    result.profileCoverage = Number(profileCoverage.toFixed(3));
    result.reportCoverage = Number(reportCoverage.toFixed(3));
    result.note = isMatch
        ? 'Report patient name appears to match logged-in user.'
        : 'Report patient name may not match logged-in user.';

    return result;
}

function mapReportRow(row) {
    if (!row) return null;
    return {
        ...row,
        _id: row.id,
        fileUrl: row.file_url,
        fileType: row.file_type,
        parsedJson: row.parsed_json,
        reviewJson: row.review_json,
    };
}

function findRecentDuplicateReport({ patientId, reportName, type, date, fileUrl }) {
    return db.prepare(`
        SELECT * FROM reports
        WHERE patient = ?
          AND reportName = ?
          AND type = ?
          AND date = ?
          AND COALESCE(file_url, '') = COALESCE(?, '')
          AND datetime(createdAt) >= datetime('now', '-10 minutes')
        ORDER BY id DESC
        LIMIT 1
    `).get(patientId, reportName, type, date, fileUrl || null);
}

function parseReportJsonObject(row) {
    if (!row || !row.parsed_json) return null;
    try {
        const parsed = JSON.parse(row.parsed_json);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
}

function toFiniteNumberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const cleaned = String(value).replace(/[^0-9.\-]/g, '');
    if (!cleaned) return null;
    const numeric = Number(cleaned);
    return Number.isFinite(numeric) ? numeric : null;
}

function toDateKey(value) {
    if (!value) return null;
    const direct = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;

    const date = new Date(direct);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
}

function nearlyEqual(left, right, tolerance) {
    return Number.isFinite(left)
        && Number.isFinite(right)
        && Math.abs(Number(left) - Number(right)) <= Number(tolerance || 0);
}

function getPrimaryBloodPressure(extracted) {
    const current = Array.isArray(extracted.bloodPressure) && extracted.bloodPressure.length > 0
        ? extracted.bloodPressure[0]
        : {};
    if (typeof current === 'string') {
        const match = current.match(/(\d{2,3})\s*[\/\-]\s*(\d{2,3})/);
        return {
            systolic: match ? Number(match[1]) : null,
            diastolic: match ? Number(match[2]) : null,
        };
    }
    return {
        systolic: toFiniteNumberOrNull(current.systolic),
        diastolic: toFiniteNumberOrNull(current.diastolic),
    };
}

function extractImportedSignalsFromReport(reportRow) {
    const parsed = parseReportJsonObject(reportRow);
    const extracted = parsed && parsed.extracted && typeof parsed.extracted === 'object'
        ? parsed.extracted
        : {};

    const glucoseValues = (Array.isArray(extracted.glucoseReadingsMgDl) ? extracted.glucoseReadingsMgDl : [])
        .map((value) => toFiniteNumberOrNull(value))
        .filter((value) => Number.isFinite(value) && value >= 1 && value <= 900);

    const primaryBp = getPrimaryBloodPressure(extracted);
    const weight = toFiniteNumberOrNull(extracted.weightKg);
    const hba1c = toFiniteNumberOrNull(extracted.hba1c);

    return {
        reportDateKey: toDateKey(reportRow && reportRow.date),
        glucoseValues,
        weight: Number.isFinite(weight) ? Number(weight) : null,
        systolic: Number.isFinite(primaryBp.systolic) ? Number(primaryBp.systolic) : null,
        diastolic: Number.isFinite(primaryBp.diastolic) ? Number(primaryBp.diastolic) : null,
        hba1c: Number.isFinite(hba1c) ? Number(hba1c) : null,
    };
}

function cleanupImportedBiometricsForReport(reportRow, patientId) {
    if (!reportRow || !patientId || !reportRow.createdAt) {
        return { glucoseDeleted: 0, healthMetricsDeleted: 0 };
    }

    const signals = extractImportedSignalsFromReport(reportRow);
    const windowMinus = `-${REPORT_IMPORT_CLEANUP_WINDOW_MINUTES} minutes`;
    const windowPlus = `+${REPORT_IMPORT_CLEANUP_WINDOW_MINUTES} minutes`;

    const glucoseRows = db.prepare(`
        SELECT id, value, recordedAt, notes
        FROM glucose_readings
        WHERE patient = ?
          AND notes = ?
          AND datetime(createdAt) >= datetime(?, ?)
          AND datetime(createdAt) <= datetime(?, ?)
    `).all(patientId, REPORT_IMPORT_GLUCOSE_NOTE, reportRow.createdAt, windowMinus, reportRow.createdAt, windowPlus);

    const glucoseIds = glucoseRows
        .filter((row) => {
            if (signals.reportDateKey && toDateKey(row.recordedAt) !== signals.reportDateKey) return false;
            const value = toFiniteNumberOrNull(row.value);
            if (!Number.isFinite(value)) return false;
            if (!signals.glucoseValues.length) return true;
            return signals.glucoseValues.some((candidate) => nearlyEqual(value, candidate, 0.75));
        })
        .map((row) => Number(row.id))
        .filter((id) => Number.isFinite(id));

    let glucoseDeleted = 0;
    glucoseIds.forEach((id) => {
        glucoseDeleted += db.prepare('DELETE FROM glucose_readings WHERE id = ? AND patient = ?').run(id, patientId).changes;
    });

    const hasMetricSignals = [signals.weight, signals.systolic, signals.diastolic, signals.hba1c]
        .some((value) => Number.isFinite(value));

    let healthMetricsDeleted = 0;
    if (hasMetricSignals) {
        const metricRows = db.prepare(`
            SELECT id, weight, systolic, diastolic, hba1c, recordedAt
            FROM health_metrics
            WHERE patient = ?
              AND datetime(createdAt) >= datetime(?, ?)
              AND datetime(createdAt) <= datetime(?, ?)
        `).all(patientId, reportRow.createdAt, windowMinus, reportRow.createdAt, windowPlus);

        const metricIds = metricRows
            .filter((row) => {
                if (signals.reportDateKey && toDateKey(row.recordedAt) !== signals.reportDateKey) return false;

                let comparisons = 0;
                let matches = 0;
                let mismatches = 0;

                if (Number.isFinite(signals.weight) && Number.isFinite(toFiniteNumberOrNull(row.weight))) {
                    comparisons += 1;
                    if (nearlyEqual(toFiniteNumberOrNull(row.weight), signals.weight, 0.15)) matches += 1;
                    else mismatches += 1;
                }
                if (Number.isFinite(signals.systolic) && Number.isFinite(toFiniteNumberOrNull(row.systolic))) {
                    comparisons += 1;
                    if (nearlyEqual(toFiniteNumberOrNull(row.systolic), signals.systolic, 1)) matches += 1;
                    else mismatches += 1;
                }
                if (Number.isFinite(signals.diastolic) && Number.isFinite(toFiniteNumberOrNull(row.diastolic))) {
                    comparisons += 1;
                    if (nearlyEqual(toFiniteNumberOrNull(row.diastolic), signals.diastolic, 1)) matches += 1;
                    else mismatches += 1;
                }
                if (Number.isFinite(signals.hba1c) && Number.isFinite(toFiniteNumberOrNull(row.hba1c))) {
                    comparisons += 1;
                    if (nearlyEqual(toFiniteNumberOrNull(row.hba1c), signals.hba1c, 0.05)) matches += 1;
                    else mismatches += 1;
                }

                return comparisons > 0 && matches > 0 && mismatches === 0;
            })
            .map((row) => Number(row.id))
            .filter((id) => Number.isFinite(id));

        metricIds.forEach((id) => {
            healthMetricsDeleted += db.prepare('DELETE FROM health_metrics WHERE id = ? AND patient = ?').run(id, patientId).changes;
        });
    }

    return {
        glucoseDeleted,
        healthMetricsDeleted,
    };
}

function normalizeCorrectionFieldKey(value) {
    const key = String(value || '').trim().toLowerCase();
    const aliases = {
        patientname: 'patientName',
        patientid: 'patientId',
        hba1c: 'hba1c',
        glucose: 'primaryGlucoseMgDl',
        primaryglucosemgdl: 'primaryGlucoseMgDl',
        averageglucosemgdl: 'averageGlucoseMgDl',
        abg: 'averageGlucoseMgDl',
        weight: 'weightKg',
        weightkg: 'weightKg',
        systolic: 'systolic',
        diastolic: 'diastolic',
        reportdate: 'reportDate',
        medications: 'medications',
        diagnoses: 'diagnoses',
        allergies: 'allergies',
    };
    return aliases[key] || null;
}

function parseStringList(value, limit) {
    const max = Number(limit || 25);
    let items = [];
    if (Array.isArray(value)) {
        items = value;
    } else {
        items = String(value || '').split(/[\n,;|]/g);
    }

    return items
        .map((item) => sanitize(String(item || '')).trim())
        .filter(Boolean)
        .slice(0, max);
}

function ensureExtractedPayload(parsedObject) {
    if (!parsedObject.extracted || typeof parsedObject.extracted !== 'object') {
        parsedObject.extracted = {};
    }
    if (!Array.isArray(parsedObject.extracted.glucoseReadingsMgDl)) parsedObject.extracted.glucoseReadingsMgDl = [];
    if (!Array.isArray(parsedObject.extracted.bloodPressure)) parsedObject.extracted.bloodPressure = [];
    if (!Array.isArray(parsedObject.extracted.diagnoses)) parsedObject.extracted.diagnoses = [];
    if (!Array.isArray(parsedObject.extracted.medications)) parsedObject.extracted.medications = [];
    if (!Array.isArray(parsedObject.extracted.allergies)) parsedObject.extracted.allergies = [];
    if (!Array.isArray(parsedObject.extracted.dates)) parsedObject.extracted.dates = [];
    return parsedObject.extracted;
}

function upsertPrimaryBloodPressure(extracted, systolic, diastolic) {
    const current = getPrimaryBloodPressure(extracted);
    const next = {
        systolic: Number.isFinite(Number(systolic)) ? Number(systolic) : current.systolic,
        diastolic: Number.isFinite(Number(diastolic)) ? Number(diastolic) : current.diastolic,
    };

    if (!isFiniteInRange(next.systolic, 40, 300) || !isFiniteInRange(next.diastolic, 20, 200)) {
        throw new Error('Blood pressure values must be within clinical ranges.');
    }

    extracted.bloodPressure = [next].concat((extracted.bloodPressure || []).slice(1));
    return next;
}

function readCorrectableField(extracted, fieldKey) {
    if (fieldKey === 'patientName') return extracted.patientName || null;
    if (fieldKey === 'patientId') return extracted.patientId || null;
    if (fieldKey === 'hba1c') return extracted.hba1c;
    if (fieldKey === 'primaryGlucoseMgDl') {
        return Array.isArray(extracted.glucoseReadingsMgDl) && extracted.glucoseReadingsMgDl.length
            ? extracted.glucoseReadingsMgDl[0]
            : null;
    }
    if (fieldKey === 'averageGlucoseMgDl') return extracted.averageGlucoseMgDl;
    if (fieldKey === 'weightKg') return extracted.weightKg;
    if (fieldKey === 'systolic') return getPrimaryBloodPressure(extracted).systolic;
    if (fieldKey === 'diastolic') return getPrimaryBloodPressure(extracted).diastolic;
    if (fieldKey === 'reportDate') return extracted.reportDate || null;
    if (fieldKey === 'medications') return Array.isArray(extracted.medications) ? extracted.medications : [];
    if (fieldKey === 'diagnoses') return Array.isArray(extracted.diagnoses) ? extracted.diagnoses : [];
    if (fieldKey === 'allergies') return Array.isArray(extracted.allergies) ? extracted.allergies : [];
    return null;
}

function applyCorrectableField(extracted, fieldKey, value) {
    if (fieldKey === 'patientName') {
        const normalized = sanitize(String(value || '')).trim();
        if (!normalized) throw new Error('Patient name cannot be empty.');
        extracted.patientName = normalized.slice(0, 120);
        return extracted.patientName;
    }

    if (fieldKey === 'patientId') {
        const normalized = sanitize(String(value || '')).trim();
        if (!normalized) throw new Error('Patient ID cannot be empty.');
        extracted.patientId = normalized.slice(0, 40);
        return extracted.patientId;
    }

    if (fieldKey === 'hba1c') {
        const numeric = toFiniteNumberOrNull(value);
        if (!isFiniteInRange(numeric, 2, 20)) throw new Error('HbA1c must be between 2 and 20.');
        extracted.hba1c = Number(numeric.toFixed(2));
        return extracted.hba1c;
    }

    if (fieldKey === 'primaryGlucoseMgDl') {
        const numeric = toFiniteNumberOrNull(value);
        if (!isFiniteInRange(numeric, 20, 700)) throw new Error('Glucose must be between 20 and 700 mg/dL.');
        const primary = Number(numeric.toFixed(0));
        const rest = (Array.isArray(extracted.glucoseReadingsMgDl) ? extracted.glucoseReadingsMgDl : [])
            .map((item) => toFiniteNumberOrNull(item))
            .filter((item) => isFiniteInRange(item, 20, 700) && item !== primary);
        extracted.glucoseReadingsMgDl = [primary].concat(rest).slice(0, 20);
        return primary;
    }

    if (fieldKey === 'averageGlucoseMgDl') {
        const numeric = toFiniteNumberOrNull(value);
        if (!isFiniteInRange(numeric, 20, 700)) throw new Error('Average glucose must be between 20 and 700 mg/dL.');
        const normalized = Number(numeric.toFixed(0));
        extracted.averageGlucoseMgDl = normalized;
        if (!Array.isArray(extracted.glucoseReadingsMgDl)) extracted.glucoseReadingsMgDl = [];
        if (!extracted.glucoseReadingsMgDl.includes(normalized)) {
            extracted.glucoseReadingsMgDl = [normalized].concat(extracted.glucoseReadingsMgDl).slice(0, 20);
        }
        return normalized;
    }

    if (fieldKey === 'weightKg') {
        const numeric = toFiniteNumberOrNull(value);
        if (!isFiniteInRange(numeric, 1, 700)) throw new Error('Weight must be between 1 and 700 kg.');
        extracted.weightKg = Number(numeric.toFixed(1));
        return extracted.weightKg;
    }

    if (fieldKey === 'systolic') {
        const numeric = toFiniteNumberOrNull(value);
        if (!isFiniteInRange(numeric, 40, 300)) throw new Error('Systolic BP must be between 40 and 300.');
        return upsertPrimaryBloodPressure(extracted, Number(numeric.toFixed(0)), null);
    }

    if (fieldKey === 'diastolic') {
        const numeric = toFiniteNumberOrNull(value);
        if (!isFiniteInRange(numeric, 20, 200)) throw new Error('Diastolic BP must be between 20 and 200.');
        return upsertPrimaryBloodPressure(extracted, null, Number(numeric.toFixed(0)));
    }

    if (fieldKey === 'reportDate') {
        const normalized = sanitize(String(value || '')).trim();
        if (!normalized) throw new Error('Report date cannot be empty.');
        extracted.reportDate = normalized.slice(0, 40);
        if (!Array.isArray(extracted.dates)) extracted.dates = [];
        if (!extracted.dates.includes(extracted.reportDate)) {
            extracted.dates = [extracted.reportDate].concat(extracted.dates).slice(0, 20);
        }
        return extracted.reportDate;
    }

    if (fieldKey === 'medications') {
        extracted.medications = parseStringList(value, 25);
        return extracted.medications;
    }

    if (fieldKey === 'diagnoses') {
        extracted.diagnoses = parseStringList(value, 20);
        return extracted.diagnoses;
    }

    if (fieldKey === 'allergies') {
        extracted.allergies = parseStringList(value, 20);
        return extracted.allergies;
    }

    throw new Error('Unsupported correction field.');
}

function normalizeCorrectionsInput(body) {
    if (!body || typeof body !== 'object') return [];
    const list = Array.isArray(body.corrections)
        ? body.corrections
        : (body.fieldKey ? [{ fieldKey: body.fieldKey, value: body.value, note: body.note }] : []);

    return list
        .map((item) => ({
            fieldKey: normalizeCorrectionFieldKey(item && item.fieldKey),
            value: item ? item.value : undefined,
            note: sanitize(String((item && item.note) || '')).slice(0, 400),
        }))
        .filter((item) => item.fieldKey);
}

function buildCorrectedReportStatus(parsedObject) {
    const nameVerification = parsedObject && parsedObject.nameVerification ? parsedObject.nameVerification : null;
    if (nameVerification && nameVerification.isMatch === false) return 'Name Mismatch - Review';
    if (parsedObject && parsedObject.review && (parsedObject.review.level === 'bad' || parsedObject.review.level === 'caution')) {
        return 'Needs Attention';
    }
    return 'Reviewed - Not Bad';
}

module.exports = {
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
};
