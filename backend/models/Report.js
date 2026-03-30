const { getDb } = require('../database');

const db = {
    prepare: (...args) => getDb().prepare(...args),
};

function transform(row) {
    if (!row) return null;
    const obj = { ...row, _id: row.id };
    if (row.file_url !== undefined) {
        obj.fileUrl = row.file_url;
        delete obj.file_url;
    }
    if (row.file_type !== undefined) {
        obj.fileType = row.file_type;
        delete obj.file_type;
    }
    if (row.parsed_json !== undefined) {
        obj.parsedJson = row.parsed_json;
        delete obj.parsed_json;
    }
    if (row.review_json !== undefined) {
        obj.reviewJson = row.review_json;
        delete obj.review_json;
    }
    if (row.doctorFullName !== undefined) {
        obj.doctor = row.doctor ? { _id: row.doctor, fullName: row.doctorFullName, specialization: row.doctorSpecialization } : null;
        delete obj.doctorFullName;
        delete obj.doctorSpecialization;
    }
    return obj;
}

const Report = {
    findByPatient(patientId, { type } = {}) {
        let sql = `
            SELECT r.*, u.fullName as doctorFullName, u.specialization as doctorSpecialization
            FROM reports r
            LEFT JOIN users u ON r.doctor = u.id
            WHERE r.patient = ?`;
        const params = [patientId];

        if (type) {
            sql += ' AND r.type = ?';
            params.push(type);
        }

        sql += ' ORDER BY r.date DESC';
        return db.prepare(sql).all(...params).map(transform);
    },

    findByPatientForDoctor(patientId) {
        const rows = db.prepare(`
            SELECT r.*, u.fullName as doctorFullName
            FROM reports r
            LEFT JOIN users u ON r.doctor = u.id
            WHERE r.patient = ?
            ORDER BY r.date DESC
        `).all(patientId);
        return rows.map(transform);
    },

    create(data) {
        const result = db.prepare(`
            INSERT INTO reports (patient, reportName, type, date, doctor, status, file_url, file_type, parsed_json, review_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            data.patient,
            data.reportName,
            data.type,
            data.date,
            data.doctor || null,
            data.status || 'Pending',
            data.fileUrl || null,
            data.fileType || null,
            data.parsedJson || null,
            data.reviewJson || null,
        );
        return transform(db.prepare('SELECT * FROM reports WHERE id = ?').get(result.lastInsertRowid));
    },
};

module.exports = Report;
