const { getDb } = require('../database');
const bcrypt = require('bcryptjs');

const db = {
    prepare: (...args) => getDb().prepare(...args),
};

function readField(row, key, fallback = undefined) {
    if (!row || typeof row !== 'object') return fallback;
    if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
    const lowerKey = String(key || '').toLowerCase();
    if (Object.prototype.hasOwnProperty.call(row, lowerKey)) return row[lowerKey];
    const snakeKey = String(key || '')
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .toLowerCase();
    if (Object.prototype.hasOwnProperty.call(row, snakeKey)) return row[snakeKey];
    return fallback;
}

function parseJsonList(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    try {
        return JSON.parse(value);
    } catch (_e) {
        return [];
    }
}

function transformUser(row, { includePassword = false } = {}) {
    if (!row) return null;
    const user = {
        ...row,
        _id: readField(row, 'id'),
        id: readField(row, 'id'),
        password: includePassword ? readField(row, 'password') : undefined,
        fullName: readField(row, 'fullName'),
        email: readField(row, 'email'),
        phone: readField(row, 'phone'),
        role: readField(row, 'role'),
        dateOfBirth: readField(row, 'dateOfBirth'),
        bloodType: readField(row, 'bloodType'),
        allergies: parseJsonList(readField(row, 'allergies')),
        chronicConditions: parseJsonList(readField(row, 'chronicConditions')),
        emergencyContactName: readField(row, 'emergencyContactName'),
        emergencyContactPhone: readField(row, 'emergencyContactPhone'),
        medicalRegistrationNumber: readField(row, 'medicalRegistrationNumber'),
        specialization: readField(row, 'specialization'),
        clinicName: readField(row, 'clinicName'),
        createdAt: readField(row, 'createdAt'),
        updatedAt: readField(row, 'updatedAt'),
    };
    user.emergencyContact = {
        name: user.emergencyContactName || undefined,
        phone: user.emergencyContactPhone || undefined,
    };
    delete user.emergencyContactName;
    delete user.emergencyContactPhone;
    if (!includePassword) delete user.password;
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
        const user = transformUser(row, { includePassword: true });
        user.emergencyContact = {
            name: user.emergencyContactName || undefined,
            phone: user.emergencyContactPhone || undefined,
        };
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
            return transformUser(row);
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
        return rows.map((row) => transformUser(row));
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
        `).all().map((row) => transformUser(row));
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
        `).all().map((row) => transformUser(row));
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
