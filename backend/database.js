const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

let _wrapper = null;

function parseLegacyReportNotes(notesValue) {
    const text = String(notesValue || '').trim();
    const out = {
        fileUrl: null,
        fileType: null,
        parsedJson: null,
        reviewJson: null,
    };

    if (!text) return out;

    const parts = text.split(' | ').map((item) => item.trim()).filter(Boolean);
    for (const part of parts) {
        if (part.startsWith('fileUrl:')) {
            out.fileUrl = part.slice('fileUrl:'.length).trim() || null;
            continue;
        }
        if (part.startsWith('fileType:')) {
            out.fileType = part.slice('fileType:'.length).trim() || null;
            continue;
        }
        if (part.startsWith('parsed:')) {
            const raw = part.slice('parsed:'.length).trim();
            if (!raw) continue;
            try {
                const parsed = JSON.parse(raw);
                out.parsedJson = JSON.stringify(parsed);
                if (parsed && typeof parsed === 'object' && parsed.review) {
                    out.reviewJson = JSON.stringify(parsed.review);
                }
            } catch (_e) {
            }
        }
    }

    if (!out.parsedJson) {
        try {
            const parsed = JSON.parse(text);
            out.parsedJson = JSON.stringify(parsed);
            if (parsed && typeof parsed === 'object' && parsed.review) {
                out.reviewJson = JSON.stringify(parsed.review);
            }
        } catch (_e) {
        }
    }

    return out;
}

class SqliteWrapper {
    constructor(db, dbPath) {
        this._db = db;
        this._dbPath = dbPath;
    }

    _save() {
        const data = this._db.export();
        fs.writeFileSync(this._dbPath, Buffer.from(data));
    }

    exec(sql) {
        this._db.run(sql);
        this._save();
    }

    pragma(str) {
        this._db.run(`PRAGMA ${str}`);
    }

    prepare(sql) {
        const db = this._db;
        const wrapper = this;
        return {
            get(...params) {
                const stmt = db.prepare(sql);
                if (params.length > 0) stmt.bind(params);
                let row;
                if (stmt.step()) {
                    row = stmt.getAsObject();
                }
                stmt.free();
                return row;
            },
            all(...params) {
                const rows = [];
                const stmt = db.prepare(sql);
                if (params.length > 0) stmt.bind(params);
                while (stmt.step()) {
                    rows.push(stmt.getAsObject());
                }
                stmt.free();
                return rows;
            },
            run(...params) {
                db.run(sql, params);
                const idResult = db.exec('SELECT last_insert_rowid() as id');
                const lastInsertRowid = idResult[0]?.values[0]?.[0];
                const changes = db.getRowsModified();
                wrapper._save();
                return { lastInsertRowid, changes };
            },
        };
    }
}

async function initDatabase() {
    const dbPath = path.join(__dirname, process.env.DB_PATH || 'glucocare.db');
    const SQL = await initSqlJs();

    let db;
    if (fs.existsSync(dbPath)) {
        const buffer = fs.readFileSync(dbPath);
        db = new SQL.Database(buffer);
    } else {
        db = new SQL.Database();
    }

    _wrapper = new SqliteWrapper(db, dbPath);

    _wrapper.pragma('journal_mode = WAL');
    _wrapper.pragma('foreign_keys = ON');

    _wrapper.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fullName TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password TEXT NOT NULL,
            phone TEXT,
            role TEXT NOT NULL CHECK(role IN ('patient', 'doctor')),
            dateOfBirth TEXT,
            bloodType TEXT,
            allergies TEXT DEFAULT '[]',
            chronicConditions TEXT DEFAULT '[]',
            emergencyContactName TEXT,
            emergencyContactPhone TEXT,
            medicalRegistrationNumber TEXT,
            specialization TEXT,
            clinicName TEXT,
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now'))
        )
    `);

    _wrapper.exec(`
        CREATE TABLE IF NOT EXISTS patient_doctors (
            patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            doctor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            PRIMARY KEY (patient_id, doctor_id)
        )
    `);

    _wrapper.exec(`
        CREATE TABLE IF NOT EXISTS glucose_readings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            value REAL NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('fasting', 'postprandial', 'random')),
            notes TEXT,
            recordedAt TEXT DEFAULT (datetime('now')),
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now'))
        )
    `);

    _wrapper.exec(`
        CREATE TABLE IF NOT EXISTS health_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            weight REAL,
            systolic REAL,
            diastolic REAL,
            hba1c REAL,
            recordedAt TEXT DEFAULT (datetime('now')),
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now'))
        )
    `);

    _wrapper.exec(`
        CREATE TABLE IF NOT EXISTS reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            reportName TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('Lab Report', 'Imaging', 'Clinical Note', 'Diabetes Report')),
            date TEXT NOT NULL,
            doctor INTEGER REFERENCES users(id),
            status TEXT DEFAULT 'Pending',
            file_url TEXT,
            file_type TEXT,
            parsed_json TEXT,
            review_json TEXT,
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now'))
        )
    `);

    try {
        const reportColumns = _wrapper.prepare('PRAGMA table_info(reports)').all().map((col) => String(col.name || ''));
        const needsReportMigration = reportColumns.includes('notes')
            || !reportColumns.includes('file_url')
            || !reportColumns.includes('file_type')
            || !reportColumns.includes('parsed_json')
            || !reportColumns.includes('review_json');

        if (needsReportMigration) {
            const legacyRows = _wrapper.prepare('SELECT * FROM reports').all();

            _wrapper.exec('DROP INDEX IF EXISTS idx_reports_patient');
            _wrapper.exec('ALTER TABLE reports RENAME TO reports_legacy');

            _wrapper.exec(`
                CREATE TABLE reports (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    patient INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    reportName TEXT NOT NULL,
                    type TEXT NOT NULL CHECK(type IN ('Lab Report', 'Imaging', 'Clinical Note', 'Diabetes Report')),
                    date TEXT NOT NULL,
                    doctor INTEGER REFERENCES users(id),
                    status TEXT DEFAULT 'Pending',
                    file_url TEXT,
                    file_type TEXT,
                    parsed_json TEXT,
                    review_json TEXT,
                    createdAt TEXT DEFAULT (datetime('now')),
                    updatedAt TEXT DEFAULT (datetime('now'))
                )
            `);

            const insertReport = _wrapper.prepare(`
                INSERT INTO reports (id, patient, reportName, type, date, doctor, status, file_url, file_type, parsed_json, review_json, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            for (const row of legacyRows) {
                const legacyParsed = parseLegacyReportNotes(row.notes);
                insertReport.run(
                    row.id,
                    row.patient,
                    row.reportName,
                    row.type,
                    row.date,
                    row.doctor || null,
                    row.status || 'Pending',
                    row.file_url || legacyParsed.fileUrl,
                    row.file_type || legacyParsed.fileType,
                    row.parsed_json || legacyParsed.parsedJson,
                    row.review_json || legacyParsed.reviewJson,
                    row.createdAt || null,
                    row.updatedAt || null,
                );
            }

            _wrapper.exec('DROP TABLE reports_legacy');
        }
    } catch (_e) {
    }

    _wrapper.exec(`
        CREATE TABLE IF NOT EXISTS medical_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('Diagnosis', 'Treatment', 'Surgery', 'Vaccination', 'Other')),
            date TEXT NOT NULL,
            doctor INTEGER REFERENCES users(id),
            description TEXT,
            facility TEXT,
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now'))
        )
    `);

    _wrapper.exec(`
        CREATE TABLE IF NOT EXISTS appointments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            doctor INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            reason TEXT,
            status TEXT DEFAULT 'Scheduled' CHECK(status IN ('Scheduled', 'Completed', 'Cancelled')),
            notes TEXT,
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now'))
        )
    `);

    _wrapper.exec(`
        CREATE TABLE IF NOT EXISTS alert_settings (
            patient_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            low_threshold REAL DEFAULT 70,
            high_threshold REAL DEFAULT 180,
            missed_log_hours INTEGER DEFAULT 24,
            notify_push INTEGER DEFAULT 1,
            notify_email INTEGER DEFAULT 0,
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now'))
        )
    `);

    _wrapper.exec(`
        CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            type TEXT NOT NULL,
            severity TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'unread',
            metadata TEXT,
            triggered_at TEXT DEFAULT (datetime('now')),
            read_at TEXT,
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now'))
        )
    `);

    _wrapper.exec(`
        CREATE TABLE IF NOT EXISTS diabetes_scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            date TEXT NOT NULL,
            score REAL NOT NULL,
            glucose_component REAL DEFAULT 0,
            adherence_component REAL DEFAULT 0,
            activity_component REAL DEFAULT 0,
            sleep_component REAL DEFAULT 0,
            explanation_json TEXT,
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now')),
            UNIQUE(patient_id, date)
        )
    `);

    _wrapper.exec(`
        CREATE TABLE IF NOT EXISTS medications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            dosage TEXT,
            frequency TEXT,
            timing_json TEXT,
            start_date TEXT,
            end_date TEXT,
            active INTEGER DEFAULT 1,
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now'))
        )
    `);

    _wrapper.exec(`
        CREATE TABLE IF NOT EXISTS medication_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            medication_id INTEGER NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
            patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            scheduled_time TEXT,
            taken_time TEXT,
            status TEXT NOT NULL DEFAULT 'taken',
            note TEXT,
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now'))
        )
    `);

    _wrapper.exec(`
        CREATE TABLE IF NOT EXISTS refill_reminders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            medication_id INTEGER NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
            remind_on TEXT,
            status TEXT DEFAULT 'active',
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now'))
        )
    `);

    _wrapper.exec(`
        CREATE TABLE IF NOT EXISTS meal_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            meal_type TEXT,
            carbs_g REAL,
            calories REAL,
            note TEXT,
            logged_at TEXT DEFAULT (datetime('now')),
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now'))
        )
    `);

    _wrapper.exec(`
        CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            activity_type TEXT,
            duration_min REAL,
            intensity TEXT,
            steps REAL,
            calories_burned REAL,
            logged_at TEXT DEFAULT (datetime('now')),
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now'))
        )
    `);

    _wrapper.exec(`
        CREATE TABLE IF NOT EXISTS message_threads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            doctor_id INTEGER REFERENCES users(id),
            subject TEXT,
            status TEXT DEFAULT 'open',
            last_message_at TEXT DEFAULT (datetime('now')),
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now'))
        )
    `);

    _wrapper.exec(`
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            thread_id INTEGER NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
            sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            sender_role TEXT NOT NULL,
            body TEXT NOT NULL,
            attachments_json TEXT,
            sent_at TEXT DEFAULT (datetime('now')),
            delivered_at TEXT,
            read_at TEXT,
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now'))
        )
    `);

    // Migration: add delivered_at column if missing
    try {
        _wrapper.exec(`ALTER TABLE messages ADD COLUMN delivered_at TEXT`);
    } catch (e) {
        // Column already exists — ignore
    }

    _wrapper.exec(`
        CREATE TABLE IF NOT EXISTS appointment_checklist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            appointment_id INTEGER NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
            patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            item TEXT NOT NULL,
            is_done INTEGER DEFAULT 0,
            updated_at TEXT DEFAULT (datetime('now')),
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now'))
        )
    `);

    _wrapper.exec(`
        CREATE TABLE IF NOT EXISTS education_content (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            topic TEXT,
            language TEXT DEFAULT 'en',
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            media_url TEXT,
            tags_json TEXT,
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now'))
        )
    `);

    _wrapper.exec(`
        CREATE TABLE IF NOT EXISTS education_recommendations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            content_id INTEGER NOT NULL REFERENCES education_content(id) ON DELETE CASCADE,
            reason TEXT,
            shown_at TEXT DEFAULT (datetime('now')),
            clicked_at TEXT,
            completed_at TEXT,
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now'))
        )
    `);

    _wrapper.exec(`
        CREATE TABLE IF NOT EXISTS education_feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            content_id INTEGER NOT NULL REFERENCES education_content(id) ON DELETE CASCADE,
            helpful_score REAL,
            comment TEXT,
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now'))
        )
    `);

    _wrapper.exec(`
        CREATE TABLE IF NOT EXISTS safety_profiles (
            patient_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            emergency_contact_name TEXT,
            emergency_contact_phone TEXT,
            caregiver_user_id INTEGER REFERENCES users(id),
            severe_low_threshold REAL DEFAULT 60,
            auto_notify_enabled INTEGER DEFAULT 0,
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now'))
        )
    `);

    _wrapper.exec(`
        CREATE TABLE IF NOT EXISTS safety_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            event_type TEXT NOT NULL,
            severity TEXT NOT NULL,
            details_json TEXT,
            triggered_at TEXT DEFAULT (datetime('now')),
            notified_at TEXT,
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now'))
        )
    `);

    _wrapper.exec(`
        CREATE TABLE IF NOT EXISTS goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            type TEXT NOT NULL,
            target_value REAL,
            period TEXT,
            status TEXT DEFAULT 'active',
            start_date TEXT,
            end_date TEXT,
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now'))
        )
    `);

    _wrapper.exec(`
        CREATE TABLE IF NOT EXISTS streaks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            metric TEXT NOT NULL,
            current_streak INTEGER DEFAULT 0,
            best_streak INTEGER DEFAULT 0,
            updated_at TEXT DEFAULT (datetime('now')),
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now')),
            UNIQUE(patient_id, metric)
        )
    `);

    _wrapper.exec(`
        CREATE TABLE IF NOT EXISTS badges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            criteria_json TEXT,
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now'))
        )
    `);

    _wrapper.exec(`
        CREATE TABLE IF NOT EXISTS patient_badges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            badge_id INTEGER NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
            earned_at TEXT DEFAULT (datetime('now')),
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now'))
        )
    `);

    _wrapper.exec(`
        CREATE TABLE IF NOT EXISTS exports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            format TEXT NOT NULL,
            scope_json TEXT,
            status TEXT DEFAULT 'ready',
            file_url TEXT,
            expires_at TEXT,
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now'))
        )
    `);

    _wrapper.exec(`
        CREATE TABLE IF NOT EXISTS data_shares (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            target_type TEXT,
            target_value TEXT,
            scope_json TEXT,
            token TEXT,
            expires_at TEXT,
            revoked_at TEXT,
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now'))
        )
    `);

    _wrapper.exec(`
        CREATE TABLE IF NOT EXISTS privacy_settings (
            patient_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            share_with_doctor INTEGER DEFAULT 1,
            share_with_caregiver INTEGER DEFAULT 0,
            research_opt_in INTEGER DEFAULT 0,
            marketing_opt_in INTEGER DEFAULT 0,
            updated_at TEXT DEFAULT (datetime('now')),
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now'))
        )
    `);

    _wrapper.exec(`
        CREATE TABLE IF NOT EXISTS user_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            device_info TEXT,
            ip_address TEXT,
            last_seen_at TEXT DEFAULT (datetime('now')),
            revoked_at TEXT,
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now'))
        )
    `);

    _wrapper.exec(`
        CREATE TABLE IF NOT EXISTS access_audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            actor_id INTEGER REFERENCES users(id),
            actor_role TEXT,
            action TEXT NOT NULL,
            resource_type TEXT,
            resource_id TEXT,
            meta_json TEXT,
            createdAt TEXT DEFAULT (datetime('now')),
            updatedAt TEXT DEFAULT (datetime('now'))
        )
    `);

    // Create indexes (sql.js executes one statement at a time)
    _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_glucose_patient ON glucose_readings(patient)`);
    _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_health_patient ON health_metrics(patient)`);
    _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_reports_patient ON reports(patient)`);
    _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_records_patient ON medical_records(patient)`);
    _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient)`);
    _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_appointments_doctor ON appointments(doctor)`);
    _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_alerts_patient ON alerts(patient_id)`);
    _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status)`);
    _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_scores_patient_date ON diabetes_scores(patient_id, date)`);
    _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_medications_patient ON medications(patient_id)`);
    _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_med_logs_patient ON medication_logs(patient_id)`);
    _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_meals_patient ON meal_logs(patient_id)`);
    _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_activity_patient ON activity_logs(patient_id)`);
    _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_threads_patient ON message_threads(patient_id)`);
    _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id)`);
    _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_safety_events_patient ON safety_events(patient_id)`);
    _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_goals_patient ON goals(patient_id)`);
    _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_exports_patient ON exports(patient_id)`);
    _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_shares_patient ON data_shares(patient_id)`);
    _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id)`);
    _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_audit_user ON access_audit_logs(user_id)`);

    return _wrapper;
}

function getDb() {
    if (!_wrapper) throw new Error('Database not initialized. Call initDatabase() first.');
    return _wrapper;
}

module.exports = { initDatabase, getDb };
