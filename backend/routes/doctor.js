const express = require('express');
const { auth, requireRole } = require('../middleware/auth');
const { getDb } = require('../database');
const User = require('../models/User');
const GlucoseReading = require('../models/GlucoseReading');
const HealthMetric = require('../models/HealthMetric');
const Report = require('../models/Report');
const Appointment = require('../models/Appointment');
const MedicalRecord = require('../models/MedicalRecord');
const Alert = require('../models/Alert');

const router = express.Router();

function ensureAssignedPatient(patientId, doctorId) {
    return User.findPatientByIdAndDoctor(patientId, doctorId);
}

// All routes require authentication + doctor role
router.use(auth, requireRole('doctor'));

// ─── Patients ───────────────────────────────────────────────────────

// GET /api/doctor/patients - list patients assigned to this doctor
router.get('/patients', async (req, res) => {
    try {
        const assignedOnly = String(req.query.assignedOnly || 'false') === 'true';
        const search = req.query.search ? String(req.query.search) : undefined;

        const patients = assignedOnly
            ? User.findPatientsByDoctor(req.user._id)
            : User.findAllPatients({ search });

        res.json(patients);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch patients.' });
    }
});

// GET /api/doctor/patients/:patientId - get a single patient's details
router.get('/patients/:patientId', async (req, res) => {
    try {
        const patient = ensureAssignedPatient(req.params.patientId, req.user._id);
        if (!patient) {
            return res.status(404).json({ error: 'Patient not found.' });
        }

        res.json(patient);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch patient details.' });
    }
});

// GET /api/doctor/patients/:patientId/glucose
router.get('/patients/:patientId/glucose', async (req, res) => {
    try {
        const patient = ensureAssignedPatient(req.params.patientId, req.user._id);
        if (!patient) {
            return res.status(404).json({ error: 'Patient not found.' });
        }

        const { days } = req.query;
        const readings = GlucoseReading.findByPatient(req.params.patientId, { days });
        res.json(readings);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch glucose readings.' });
    }
});

// GET /api/doctor/patients/:patientId/health-metrics
router.get('/patients/:patientId/health-metrics', async (req, res) => {
    try {
        const patient = ensureAssignedPatient(req.params.patientId, req.user._id);
        if (!patient) {
            return res.status(404).json({ error: 'Patient not found.' });
        }

        const metrics = HealthMetric.findByPatient(req.params.patientId);
        res.json(metrics);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch health metrics.' });
    }
});

// GET /api/doctor/patients/:patientId/reports
router.get('/patients/:patientId/reports', async (req, res) => {
    try {
        const patient = ensureAssignedPatient(req.params.patientId, req.user._id);
        if (!patient) {
            return res.status(404).json({ error: 'Patient not found.' });
        }

        const reports = Report.findByPatientForDoctor(req.params.patientId);
        res.json(reports);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch reports.' });
    }
});

// POST /api/doctor/patients/assign - assign an existing patient to this doctor
router.post('/patients/assign', async (req, res) => {
    try {
        const patientId = Number(req.body.patientId);
        if (!Number.isInteger(patientId) || patientId <= 0) {
            return res.status(400).json({ error: 'A valid patientId is required.' });
        }

        const result = User.assignPatientToDoctor(patientId, req.user._id);
        if (!result.ok) {
            return res.status(404).json({ error: 'Patient not found.' });
        }

        const patient = User.findPatientByIdAndDoctor(patientId, req.user._id);
        res.status(201).json({ message: 'Patient assigned successfully.', patient });
    } catch (err) {
        res.status(500).json({ error: 'Failed to assign patient.' });
    }
});

// ─── Appointments ───────────────────────────────────────────────────

// GET /api/doctor/appointments
router.get('/appointments', async (req, res) => {
    try {
        const appointments = Appointment.findByDoctor(req.user._id);
        res.json(appointments);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch appointments.' });
    }
});

// PUT /api/doctor/appointments/:id - update appointment status/notes
router.put('/appointments/:id', async (req, res) => {
    try {
        const { status, notes } = req.body;
        const appointment = Appointment.updateByIdAndDoctor(req.params.id, req.user._id, { status, notes });

        if (!appointment) {
            return res.status(404).json({ error: 'Appointment not found.' });
        }

        res.json(appointment);
    } catch (err) {
        res.status(500).json({ error: 'Failed to update appointment.' });
    }
});

// POST /api/doctor/appointments - create appointment for an assigned patient
router.post('/appointments', async (req, res) => {
    try {
        const patientId = Number(req.body.patient);
        const { date, time, reason } = req.body;

        if (!Number.isInteger(patientId) || patientId <= 0) {
            return res.status(400).json({ error: 'A valid patient id is required.' });
        }
        if (!date || !time) {
            return res.status(400).json({ error: 'Date and time are required.' });
        }

        const assigned = User.isPatientAssignedToDoctor(patientId, req.user._id);
        if (!assigned) {
            return res.status(403).json({ error: 'Patient is not assigned to this doctor.' });
        }

        const appointment = Appointment.create({
            patient: patientId,
            doctor: req.user._id,
            date,
            time,
            reason,
        });

        res.status(201).json(appointment);
    } catch (err) {
        res.status(500).json({ error: 'Failed to create appointment.' });
    }
});

// POST /api/doctor/reports - create report for an assigned patient
router.post('/reports', async (req, res) => {
    try {
        const patientId = Number(req.body.patient);
        const { reportName, type, date, status, notes } = req.body;

        if (!Number.isInteger(patientId) || patientId <= 0) {
            return res.status(400).json({ error: 'A valid patient id is required.' });
        }
        if (!reportName || !type || !date) {
            return res.status(400).json({ error: 'Report name, type, and date are required.' });
        }

        const assigned = User.isPatientAssignedToDoctor(patientId, req.user._id);
        if (!assigned) {
            return res.status(403).json({ error: 'Patient is not assigned to this doctor.' });
        }

        const report = Report.create({
            patient: patientId,
            reportName,
            type,
            date,
            doctor: req.user._id,
            status,
            notes,
        });

        res.status(201).json(report);
    } catch (err) {
        res.status(500).json({ error: 'Failed to create report.' });
    }
});

// POST /api/doctor/records - create medical record for an assigned patient
router.post('/records', async (req, res) => {
    try {
        const patientId = Number(req.body.patient);
        const { title, type, date, description, facility } = req.body;

        if (!Number.isInteger(patientId) || patientId <= 0) {
            return res.status(400).json({ error: 'A valid patient id is required.' });
        }
        if (!title || !type || !date) {
            return res.status(400).json({ error: 'Title, type, and date are required.' });
        }

        const assigned = User.isPatientAssignedToDoctor(patientId, req.user._id);
        if (!assigned) {
            return res.status(403).json({ error: 'Patient is not assigned to this doctor.' });
        }

        const record = MedicalRecord.create({
            patient: patientId,
            title,
            type,
            date,
            doctor: req.user._id,
            description,
            facility,
        });

        res.status(201).json(record);
    } catch (err) {
        res.status(500).json({ error: 'Failed to create medical record.' });
    }
});

// GET /api/doctor/alerts - aggregate assigned patient alerts + critical readings
router.get('/alerts', async (req, res) => {
    try {
        const patients = User.findPatientsByDoctor(req.user._id);
        const patientIds = patients.map((p) => Number(p._id)).filter(Boolean);

        if (patientIds.length === 0) {
            return res.json([]);
        }

        const alerts = [];

        // Existing persisted alerts from patient side thresholds.
        for (const patientId of patientIds) {
            const items = Alert.listByPatient(patientId, { limit: 20 });
            for (const item of items) {
                const patient = patients.find((p) => Number(p._id) === Number(patientId));
                alerts.push({
                    source: 'alert',
                    patient: patient ? { _id: patient._id, fullName: patient.fullName } : { _id: patientId, fullName: 'Patient' },
                    severity: item.severity,
                    title: item.title,
                    message: item.message,
                    status: item.status,
                    triggeredAt: item.triggeredAt,
                });
            }
        }

        // Add recent critical glucose readings as actionable items.
        const criticalReadings = GlucoseReading.findCriticalByPatients(patientIds, 25);
        for (const reading of criticalReadings) {
            alerts.push({
                source: 'critical_reading',
                patient: reading.patient,
                severity: Number(reading.value) > 220 || Number(reading.value) < 60 ? 'critical' : 'warning',
                title: `Critical glucose: ${Number(reading.value).toFixed(0)} mg/dL`,
                message: `Reading type: ${reading.type || 'reading'}`,
                status: 'unread',
                triggeredAt: reading.recordedAt,
            });
        }

        alerts.sort((a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime());
        res.json(alerts.slice(0, 50));
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch alerts.' });
    }
});

// ─── Doctor Dashboard Summary ───────────────────────────────────────

// GET /api/doctor/dashboard
router.get('/dashboard', async (req, res) => {
    try {
        const doctorId = req.user._id;

        // Count of assigned patients
        const patientCount = User.countPatientsByDoctor(doctorId);

        // Today's appointments
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const todayAppointments = Appointment.findByDoctorAndDateRange(
            doctorId, startOfDay.toISOString(), endOfDay.toISOString(), { populatePatient: true }
        );

        // Upcoming appointments (next 7 days)
        const sevenDaysLater = new Date();
        sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);

        const upcomingAppointments = Appointment.findUpcomingByDoctor(
            doctorId, sevenDaysLater.toISOString(), 10
        );

        // Recent patients with critical glucose (last reading above 200 or below 70)
        const patients = User.findPatientsByDoctor(doctorId);
        const patientIds = patients.map(p => p._id);

        const criticalReadings = GlucoseReading.findCriticalByPatients(patientIds, 10);

        res.json({
            patientCount,
            todayAppointments,
            upcomingAppointments,
            criticalReadings,
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load dashboard data.' });
    }
});

// ─── Doctor Profile ─────────────────────────────────────────────────

// GET /api/doctor/profile
router.get('/profile', async (req, res) => {
    res.json(req.user);
});

// PUT /api/doctor/profile
router.put('/profile', async (req, res) => {
    try {
        const allowed = ['fullName', 'phone', 'specialization', 'clinicName'];
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

// ─── Doctor Messaging ───────────────────────────────────────────────

// GET /api/doctor/messages/threads - all threads for this doctor
router.get('/messages/threads', auth, requireRole('doctor'), async (req, res) => {
    try {
        const db = getDb();
        const threads = db.prepare(`
            SELECT mt.*, u.fullName as patientName
            FROM message_threads mt
            LEFT JOIN users u ON u.id = mt.patient_id
            WHERE mt.doctor_id = ?
            ORDER BY mt.last_message_at DESC
        `).all(req.user._id);

        // Attach unread count per thread
        threads.forEach(function(t) {
            var unread = db.prepare(`
                SELECT COUNT(*) as cnt FROM messages
                WHERE thread_id = ? AND sender_role = 'patient' AND read_at IS NULL
            `).get(t.id);
            t.unreadCount = unread ? unread.cnt : 0;
        });

        res.json(threads);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch threads.' });
    }
});

// GET /api/doctor/messages/threads/:id - get thread messages
router.get('/messages/threads/:id', auth, requireRole('doctor'), async (req, res) => {
    try {
        const db = getDb();
        const thread = db.prepare('SELECT * FROM message_threads WHERE id = ? AND doctor_id = ?').get(req.params.id, req.user._id);
        if (!thread) return res.status(404).json({ error: 'Thread not found.' });

        const messages = db.prepare('SELECT * FROM messages WHERE thread_id = ? ORDER BY sent_at ASC').all(req.params.id);

        // Mark patient messages as read
        db.prepare(`UPDATE messages SET read_at = datetime('now') WHERE thread_id = ? AND sender_role = 'patient' AND read_at IS NULL`).run(req.params.id);

        res.json({ thread, messages });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch thread messages.' });
    }
});

// POST /api/doctor/messages/threads/:id - doctor sends a reply
router.post('/messages/threads/:id', auth, requireRole('doctor'), async (req, res) => {
    try {
        const db = getDb();
        const thread = db.prepare('SELECT * FROM message_threads WHERE id = ? AND doctor_id = ?').get(req.params.id, req.user._id);
        if (!thread) return res.status(404).json({ error: 'Thread not found.' });

        const { body } = req.body;
        if (!body || !body.trim()) return res.status(400).json({ error: 'Message body is required.' });

        const result = db.prepare(`
            INSERT INTO messages (thread_id, sender_id, sender_role, body, attachments_json)
            VALUES (?, ?, 'doctor', ?, '[]')
        `).run(req.params.id, req.user._id, body.trim());

        db.prepare("UPDATE message_threads SET last_message_at = datetime('now'), updatedAt = datetime('now') WHERE id = ?").run(req.params.id);

        const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid);

        // Real-time push to patient
        var io = req.app.get('io');
        if (io) {
            io.to('user_' + thread.patient_id).emit('new_message', {
                threadId: thread.id,
                message: msg
            });
        }

        res.status(201).json(msg);
    } catch (err) {
        res.status(500).json({ error: 'Failed to send message.' });
    }
});

// GET /api/doctor/messages/unread-count - total unread messages for badge
router.get('/messages/unread-count', auth, requireRole('doctor'), async (req, res) => {
    try {
        const db = getDb();
        var row = db.prepare(`
            SELECT COUNT(*) as cnt FROM messages m
            JOIN message_threads mt ON mt.id = m.thread_id
            WHERE mt.doctor_id = ? AND m.sender_role = 'patient' AND m.read_at IS NULL
        `).get(req.user._id);
        res.json({ count: row ? row.cnt : 0 });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch unread count.' });
    }
});

module.exports = router;
