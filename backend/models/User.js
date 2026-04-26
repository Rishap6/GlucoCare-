const { getDb } = require('../database');
const bcrypt = require('bcryptjs');

const db = {
    prepare: (...args) => getDb().prepare(...args),
};

function transformUser(row) {
    if (!row) return null;
    const user = { ...row, _id: row.id };
    user.allergies = row.allergies ? JSON.parse(row.allergies) : [];
    user.chronicConditions = row.chronicConditions ? JSON.parse(row.chronicConditions) : [];
    user.emergencyContact = {
        name: row.emergencyContactName || undefined,
        phone: row.emergencyContactPhone || undefined,
    };
    delete user.emergencyContactName;
    delete user.emergencyContactPhone;
    delete user.password;
    return user;
}

const User = {
    findById(id) {
        const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
        return transformUser(row);
    },

    findByEmail(email) {
        const row = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').toLowerCase().trim());
        if (!row) return null;
        const user = { ...row, _id: row.id };
        user.allergies = row.allergies ? JSON.parse(row.allergies) : [];
        user.chronicConditions = row.chronicConditions ? JSON.parse(row.chronicConditions) : [];
        user.emergencyContact = {
            name: row.emergencyContactName || undefined,
            phone: row.emergencyContactPhone || undefined,
        };
        delete user.emergencyContactName;
        delete user.emergencyContactPhone;
        user.comparePassword = async function (candidatePassword) {
            return bcrypt.compare(candidatePassword, this.password);
        };
        user.toJSON = function () {
            const obj = { ...this };
            delete obj.password;
            delete obj.comparePassword;
            delete obj.toJSON;
            return obj;
        };
        return user;
    },

    async create(data) {
        const hashedPassword = await bcrypt.hash(data.password, 12);
        const stmt = db.prepare(`
            INSERT INTO users (fullName, email, password, phone, role, dateOfBirth, bloodType,
                allergies, chronicConditions, emergencyContactName, emergencyContactPhone,
                medicalRegistrationNumber, specialization, clinicName)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const result = stmt.run(
            data.fullName,
            data.email.toLowerCase().trim(),
            hashedPassword,
            data.phone || null,
            data.role,
            data.dateOfBirth || null,
            data.bloodType || null,
            JSON.stringify(data.allergies || []),
            JSON.stringify(data.chronicConditions || []),
            data.emergencyContact?.name || null,
            data.emergencyContact?.phone || null,
            data.medicalRegistrationNumber || null,
            data.specialization || null,
            data.clinicName || null,
        );
        return User.findById(result.lastInsertRowid);
    },

    findByIdAndUpdate(id, updates) {
        const allowedColumns = new Set([
            'fullName', 'phone', 'dateOfBirth', 'bloodType',
            'allergies', 'chronicConditions', 'emergencyContact',
            'specialization', 'clinicName',
        ]);
        const setClauses = [];
        const values = [];

        for (const [key, value] of Object.entries(updates)) {
            if (!allowedColumns.has(key)) continue;
            if (key === 'allergies' || key === 'chronicConditions') {
                setClauses.push(`${key} = ?`);
                values.push(JSON.stringify(value));
            } else if (key === 'emergencyContact') {
                setClauses.push('emergencyContactName = ?');
                values.push(value?.name || null);
                setClauses.push('emergencyContactPhone = ?');
                values.push(value?.phone || null);
            } else {
                setClauses.push(`${key} = ?`);
                values.push(value);
            }
        }

        if (setClauses.length > 0) {
            setClauses.push("updatedAt = datetime('now')");
            values.push(id);
            db.prepare(`UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
        }

        return User.findById(id);
    },

    findPatientsByDoctor(doctorId) {
        const rows = db.prepare(`
            SELECT u.id, u.fullName, u.email, u.phone, u.dateOfBirth,
                   u.bloodType, u.chronicConditions, u.createdAt
            FROM users u
            JOIN patient_doctors pd ON u.id = pd.patient_id
            WHERE u.role = 'patient' AND pd.doctor_id = ?
        `).all(doctorId);
        return rows.map(row => {
            const user = { ...row, _id: row.id };
            user.chronicConditions = row.chronicConditions ? JSON.parse(row.chronicConditions) : [];
            return user;
        });
    },

    findAllPatients({ search } = {}) {
        let sql = `
            SELECT id, fullName, email, phone, dateOfBirth, bloodType, chronicConditions, createdAt
            FROM users
            WHERE role = 'patient'
        `;
        const params = [];

        if (search) {
            sql += ' AND (fullName ILIKE ? OR email ILIKE ?)';
            const term = `%${String(search).trim()}%`;
            params.push(term, term);
        }

        sql += ' ORDER BY fullName ASC';

        const rows = db.prepare(sql).all(...params);
        return rows.map((row) => ({
            ...row,
            _id: row.id,
            chronicConditions: row.chronicConditions ? JSON.parse(row.chronicConditions) : [],
        }));
    },

    findPatientByIdAndDoctor(patientId, doctorId) {
        const row = db.prepare(`
            SELECT u.* FROM users u
            JOIN patient_doctors pd ON u.id = pd.patient_id
            WHERE u.id = ? AND u.role = 'patient' AND pd.doctor_id = ?
        `).get(patientId, doctorId);
        return transformUser(row);
    },

    isPatientAssignedToDoctor(patientId, doctorId) {
        const row = db.prepare(`
            SELECT 1 as ok
            FROM patient_doctors
            WHERE patient_id = ? AND doctor_id = ?
            LIMIT 1
        `).get(patientId, doctorId);
        return !!row;
    },

    assignPatientToDoctor(patientId, doctorId) {
        const patient = db.prepare(`
            SELECT id FROM users
            WHERE id = ? AND role = 'patient'
        `).get(patientId);

        if (!patient) return { ok: false, reason: 'patient-not-found' };

        db.prepare(`
            INSERT OR IGNORE INTO patient_doctors (patient_id, doctor_id)
            VALUES (?, ?)
        `).run(patientId, doctorId);

        return { ok: true };
    },

    countPatientsByDoctor(doctorId) {
        const row = db.prepare(`
            SELECT COUNT(*) as count FROM users u
            JOIN patient_doctors pd ON u.id = pd.patient_id
            WHERE u.role = 'patient' AND pd.doctor_id = ?
        `).get(doctorId);
        return row.count;
    },

    getAssignedDoctors(patientId) {
        return db.prepare(`
            SELECT u.id as _id, u.fullName, u.email, u.phone, u.specialization, u.clinicName
            FROM users u
            JOIN patient_doctors pd ON u.id = pd.doctor_id
            WHERE pd.patient_id = ?
        `).all(patientId);
    },

    findAllDoctors() {
        return db.prepare(`
            SELECT u.id as _id, u.fullName, u.email, u.phone, u.specialization, u.clinicName,
                   MAX(s.last_seen_at) AS lastSeenAt,
                   CASE WHEN SUM(CASE WHEN s.revoked_at IS NULL THEN 1 ELSE 0 END) > 0 THEN 1 ELSE 0 END AS isLoggedIn
            FROM users u
            LEFT JOIN user_sessions s ON s.user_id = u.id
            WHERE u.role = 'doctor'
            GROUP BY u.id, u.fullName, u.email, u.phone, u.specialization, u.clinicName
            ORDER BY u.fullName ASC
        `).all();
    },

    findLoggedInDoctors() {
        return db.prepare(`
            SELECT u.id as _id, u.fullName, u.email, u.phone, u.specialization, u.clinicName,
                   MAX(s.last_seen_at) AS lastSeenAt,
                   1 AS isLoggedIn
            FROM users u
            JOIN user_sessions s ON s.user_id = u.id
            WHERE u.role = 'doctor' AND s.revoked_at IS NULL
            GROUP BY u.id, u.fullName, u.email, u.phone, u.specialization, u.clinicName
            ORDER BY u.fullName ASC
        `).all();
    },

    createSession(userId, { deviceInfo, ipAddress } = {}) {
        const result = db.prepare(`
            INSERT INTO user_sessions (user_id, device_info, ip_address, last_seen_at)
            VALUES (?, ?, ?, datetime('now'))
        `).run(userId, deviceInfo || null, ipAddress || null);
        return result.lastInsertRowid;
    },
};

module.exports = User;
