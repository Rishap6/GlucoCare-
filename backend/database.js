const { Worker } = require('worker_threads');
const fs = require('fs');
const os = require('os');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const runnerPath = path.join(__dirname, 'services', 'postgres-runner.js');
let _wrapper = null;
let _initPromise = null;

function transformSql(sql) {
    let out = String(sql || '');

    if (/INSERT\s+OR\s+IGNORE/i.test(out)) {
        out = out.replace(/INSERT\s+OR\s+IGNORE/i, 'INSERT');
        if (!/ON\s+CONFLICT/i.test(out)) {
            out = out.replace(/;?\s*$/i, ' ON CONFLICT DO NOTHING');
        }
    }

    return out
        .replace(/INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/gi, 'BIGSERIAL PRIMARY KEY')
        .replace(/\bINTEGER(?=\s+(?:PRIMARY\s+KEY\s+)?(?:NOT\s+NULL\s+)?REFERENCES\b)/gi, 'BIGINT')
        .replace(/\bAUTOINCREMENT\b/gi, '')
        .replace(/TEXT\s+DEFAULT\s+\(datetime\('now'\)\)/gi, 'TIMESTAMPTZ DEFAULT NOW()')
        .replace(/datetime\('now'\)/gi, 'NOW()')
        .replace(/COLLATE\s+NOCASE/gi, '');
}

function convertPositionalPlaceholders(sqlText) {
    const text = String(sqlText || '');
    let out = '';
    let paramIndex = 1;
    let inSingle = false;
    let inDouble = false;
    let inBacktick = false;
    let inLineComment = false;
    let inBlockComment = false;

    for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];
        const next = text[i + 1];

        if (inLineComment) {
            out += ch;
            if (ch === '\n') inLineComment = false;
            continue;
        }

        if (inBlockComment) {
            out += ch;
            if (ch === '*' && next === '/') {
                out += next;
                i += 1;
                inBlockComment = false;
            }
            continue;
        }

        if (!inDouble && !inBacktick && ch === "'" && text[i - 1] !== '\\') {
            inSingle = !inSingle;
            out += ch;
            continue;
        }

        if (!inSingle && !inBacktick && ch === '"') {
            inDouble = !inDouble;
            out += ch;
            continue;
        }

        if (!inSingle && !inDouble && ch === '`') {
            inBacktick = !inBacktick;
            out += ch;
            continue;
        }

        if (!inSingle && !inDouble && !inBacktick && ch === '-' && next === '-') {
            inLineComment = true;
            out += ch + next;
            i += 1;
            continue;
        }

        if (!inSingle && !inDouble && !inBacktick && ch === '/' && next === '*') {
            inBlockComment = true;
            out += ch + next;
            i += 1;
            continue;
        }

        if (!inSingle && !inDouble && !inBacktick && ch === '?') {
            out += `$${paramIndex++}`;
            continue;
        }

        out += ch;
    }

    return out;
}

function normalizeValue(value) {
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(normalizeValue);
    if (value && typeof value === 'object') {
        const out = {};
        for (const [key, item] of Object.entries(value)) {
            out[key] = normalizeValue(item);
        }
        return out;
    }
    return value;
}

function runDbAction(action, sql, params = []) {
    const payload = {
        action,
        sql: convertPositionalPlaceholders(transformSql(sql)),
        params: Array.isArray(params) ? params : [],
    };

    const status = new Int32Array(new SharedArrayBuffer(4));
    const outputPath = path.join(os.tmpdir(), `glucocare-db-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);

    const worker = new Worker(runnerPath, {
        workerData: {
            payload,
            outputPath,
            statusBuffer: status.buffer,
        },
    });

    const timeoutMs = Number(process.env.DB_WORKER_TIMEOUT_MS || 60000);
    const deadline = Date.now() + timeoutMs;

    while (Atomics.load(status, 0) === 0) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
            try { worker.terminate(); } catch (_e) {}
            throw new Error('Database query timed out');
        }
        Atomics.wait(status, 0, 0, Math.min(remaining, 1000));
    }

    try {
        const stdout = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8').trim() : '';
        if (!stdout) return null;
        const parsed = JSON.parse(stdout);
        if (!parsed.ok) {
            const err = new Error(parsed.error || 'Database query failed');
            if (parsed.stack) err.stack = parsed.stack;
            throw err;
        }
        return normalizeValue(parsed);
    } finally {
        try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch (_e) {}
        try { worker.terminate(); } catch (_e) {}
    }
}

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

class PostgresWrapper {
    exec(sql) {
        return runDbAction('exec', sql);
    }

    pragma(_str) {
        return undefined;
    }

    prepare(sql) {
        const query = String(sql || '').trim();
        return {
            get(...params) {
                if (/^PRAGMA\s+table_info\s*\(\s*reports\s*\)/i.test(query)) {
                    return [
                        { cid: 0, name: 'id' },
                        { cid: 1, name: 'patient' },
                        { cid: 2, name: 'reportName' },
                        { cid: 3, name: 'type' },
                        { cid: 4, name: 'date' },
                        { cid: 5, name: 'doctor' },
                        { cid: 6, name: 'status' },
                        { cid: 7, name: 'file_url' },
                        { cid: 8, name: 'file_type' },
                        { cid: 9, name: 'parsed_json' },
                        { cid: 10, name: 'review_json' },
                        { cid: 11, name: 'createdAt' },
                        { cid: 12, name: 'updatedAt' },
                    ];
                }
                const result = runDbAction('get', query, params);
                return Array.isArray(result?.rows) ? result.rows[0] || null : null;
            },
            all(...params) {
                if (/^PRAGMA\s+table_info\s*\(\s*reports\s*\)/i.test(query)) {
                    return [
                        { cid: 0, name: 'id' },
                        { cid: 1, name: 'patient' },
                        { cid: 2, name: 'reportName' },
                        { cid: 3, name: 'type' },
                        { cid: 4, name: 'date' },
                        { cid: 5, name: 'doctor' },
                        { cid: 6, name: 'status' },
                        { cid: 7, name: 'file_url' },
                        { cid: 8, name: 'file_type' },
                        { cid: 9, name: 'parsed_json' },
                        { cid: 10, name: 'review_json' },
                        { cid: 11, name: 'createdAt' },
                        { cid: 12, name: 'updatedAt' },
                    ];
                }
                const result = runDbAction('all', query, params);
                return Array.isArray(result?.rows) ? result.rows : [];
            },
            run(...params) {
                const noIdTables = new Set([
                    'patient_doctors',
                    'alert_settings',
                    'ai_chat_history',
                    'privacy_settings',
                    'safety_profiles',
                ]);

                let q = query;
                let returningId = false;
                const insertMatch = q.match(/^INSERT\s+INTO\s+([^\s(]+)/i);
                if (insertMatch && !/RETURNING\s+id/i.test(q)) {
                    const table = String(insertMatch[1] || '').trim().replace(/["'`]/g, '');
                    if (!noIdTables.has(table)) {
                        q = `${q.replace(/;?\s*$/i, '')} RETURNING id`;
                        returningId = true;
                    }
                }

                const result = runDbAction('run', q, params);
                const row = Array.isArray(result?.rows) ? result.rows[0] || null : null;
                return {
                    lastInsertRowid: returningId && row ? row.id : null,
                    changes: Number(result?.count || 0),
                };
            },
        };
    }
}

async function initDatabase() {
    if (_wrapper) return _wrapper;
    if (_initPromise) return _initPromise;

    _initPromise = (async () => {
    _wrapper = new PostgresWrapper();

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

    _wrapper.exec(`
        CREATE TABLE IF NOT EXISTS report_corrections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
            patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            field_key TEXT NOT NULL,
            original_value_json TEXT,
            corrected_value_json TEXT,
            note TEXT,
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
        CREATE TABLE IF NOT EXISTS diet_intakes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            meal_slot TEXT NOT NULL CHECK(meal_slot IN ('breakfast', 'lunch', 'dinner', 'snack')),
            intake_text TEXT NOT NULL,
            blood_sugar_mgdl REAL,
            sugar_timing TEXT CHECK(sugar_timing IN ('before', 'after', 'random')),
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

    _wrapper.exec(`
        CREATE TABLE IF NOT EXISTS ai_chat_history (
            patient_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            conversation_json TEXT NOT NULL,
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
    _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_report_corrections_report ON report_corrections(report_id)`);
    _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_report_corrections_patient ON report_corrections(patient_id)`);
    _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_records_patient ON medical_records(patient)`);
    _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient)`);
    _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_appointments_doctor ON appointments(doctor)`);
    _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_alerts_patient ON alerts(patient_id)`);
    _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status)`);
    _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_scores_patient_date ON diabetes_scores(patient_id, date)`);
    _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_medications_patient ON medications(patient_id)`);
    _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_med_logs_patient ON medication_logs(patient_id)`);
    _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_meals_patient ON meal_logs(patient_id)`);
    _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_diet_intakes_patient_logged ON diet_intakes(patient_id, logged_at)`);
    _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_activity_patient ON activity_logs(patient_id)`);
    _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_threads_patient ON message_threads(patient_id)`);
    _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id)`);
    _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_ai_chat_history_patient ON ai_chat_history(patient_id)`);
    _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_safety_events_patient ON safety_events(patient_id)`);
    _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_goals_patient ON goals(patient_id)`);
    _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_exports_patient ON exports(patient_id)`);
    _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_shares_patient ON data_shares(patient_id)`);
    _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id)`);
    _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_audit_user ON access_audit_logs(user_id)`);

    return _wrapper;
    })();

    try {
        return await _initPromise;
    } finally {
        _initPromise = null;
    }
}

async function initAuthDatabase() {
    if (_wrapper) return _wrapper;
    if (_initPromise) return _initPromise;

    _initPromise = (async () => {
        _wrapper = new PostgresWrapper();

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

        _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id)`);
        _wrapper.exec(`CREATE INDEX IF NOT EXISTS idx_audit_user ON access_audit_logs(user_id)`);

        return _wrapper;
    })();

    try {
        return await _initPromise;
    } finally {
        _initPromise = null;
    }
}

function getDb() {
    if (!_wrapper) throw new Error('Database not initialized. Call initDatabase() first.');
    return _wrapper;
}

module.exports = { initDatabase, initAuthDatabase, getDb };
