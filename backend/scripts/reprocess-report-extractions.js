const { initDatabase, getDb } = require('../database');
const { parseDocumentToText } = require('../../Ai/document-reader');
const { extractProjectDataFromDocument } = require('../../Ai/document-intelligence');

function parseArgs(argv) {
    const out = {
        limit: 0,
        reportId: null,
        dryRun: false,
    };

    for (let i = 0; i < argv.length; i += 1) {
        const token = String(argv[i] || '').trim();
        if (token === '--dry-run') {
            out.dryRun = true;
            continue;
        }

        if (token === '--limit' && argv[i + 1]) {
            const value = Number(argv[i + 1]);
            if (Number.isFinite(value) && value > 0) {
                out.limit = Math.floor(value);
                i += 1;
            }
            continue;
        }

        if (token === '--report-id' && argv[i + 1]) {
            const value = Number(argv[i + 1]);
            if (Number.isFinite(value) && value > 0) {
                out.reportId = Math.floor(value);
                i += 1;
            }
        }
    }

    return out;
}

function parseJsonSafe(value) {
    if (!value) return null;
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
}

function deriveStatus(nextParsed) {
    if (!nextParsed || typeof nextParsed !== 'object') return 'Analyzed';

    if (nextParsed.nameVerification && nextParsed.nameVerification.isMatch === false) {
        return 'Name Mismatch - Review';
    }

    if (nextParsed.review && (nextParsed.review.level === 'bad' || nextParsed.review.level === 'caution')) {
        return 'Needs Attention';
    }

    if (nextParsed.review) return 'Reviewed - Not Bad';
    return 'Analyzed';
}

async function reprocessRow(db, row, options) {
    if (!row || !row.id) {
        return { status: 'skipped', reason: 'missing-row' };
    }

    const fileUrl = String(row.file_url || '').trim();
    if (!fileUrl) {
        return { status: 'skipped', reason: 'missing-file-url' };
    }

    if (!fileUrl.startsWith('data:')) {
        return { status: 'skipped', reason: 'non-data-url' };
    }

    const parsedText = await parseDocumentToText({
        fileName: row.reportName,
        fileType: row.file_type || null,
        base64Content: fileUrl,
    });

    if (!parsedText || !parsedText.text) {
        return { status: 'skipped', reason: 'no-text-from-parser' };
    }

    const extracted = extractProjectDataFromDocument(parsedText.text, {
        fileName: row.reportName,
        fileType: parsedText.inferredType,
        parser: parsedText.parser,
        ocrDiagnostics: parsedText.ocrDiagnostics || null,
    });

    const previousParsed = parseJsonSafe(row.parsed_json);
    if (previousParsed && previousParsed.nameVerification && !extracted.nameVerification) {
        extracted.nameVerification = previousParsed.nameVerification;
    }

    const nextStatus = deriveStatus(extracted);

    if (!options.dryRun) {
        db.prepare(`
            UPDATE reports
            SET parsed_json = ?, review_json = ?, status = ?, updatedAt = datetime('now')
            WHERE id = ?
        `).run(
            JSON.stringify(extracted),
            extracted.review ? JSON.stringify(extracted.review) : null,
            nextStatus,
            row.id,
        );
    }

    return {
        status: 'updated',
        nextStatus,
        parser: parsedText.parser || 'unknown',
        inferredType: parsedText.inferredType || null,
    };
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    await initDatabase();
    const db = getDb();

    const params = [];
    let sql = `
        SELECT id, reportName, file_url, file_type, parsed_json, status
        FROM reports
        WHERE file_url IS NOT NULL AND trim(file_url) <> ''
    `;

    if (options.reportId) {
        sql += ' AND id = ?';
        params.push(options.reportId);
    }

    sql += ' ORDER BY id DESC';

    if (options.limit > 0) {
        sql += ' LIMIT ?';
        params.push(options.limit);
    }

    const rows = db.prepare(sql).all(...params);
    if (!rows.length) {
        console.log('No report rows found for reprocessing.');
        return;
    }

    console.log('Starting report reprocess for', rows.length, 'row(s).', options.dryRun ? '[dry-run]' : '');

    let updated = 0;
    let skipped = 0;
    let failed = 0;
    const skipReasonCounts = {};
    const failures = [];

    for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        try {
            const result = await reprocessRow(db, row, options);
            if (result.status === 'updated') {
                updated += 1;
                console.log(`[${i + 1}/${rows.length}] Updated report ${row.id} (${row.reportName || 'Unnamed'}), parser=${result.parser}`);
            } else {
                skipped += 1;
                const reason = result.reason || 'skipped';
                skipReasonCounts[reason] = (skipReasonCounts[reason] || 0) + 1;
                console.log(`[${i + 1}/${rows.length}] Skipped report ${row.id}: ${reason}`);
            }
        } catch (err) {
            failed += 1;
            const message = err && err.message ? err.message : String(err);
            failures.push({ id: row.id, reportName: row.reportName || 'Unnamed', error: message });
            console.error(`[${i + 1}/${rows.length}] Failed report ${row.id}: ${message}`);
        }
    }

    console.log('\nReprocess Summary');
    console.log('Updated:', updated);
    console.log('Skipped:', skipped);
    console.log('Failed :', failed);

    const skipReasons = Object.keys(skipReasonCounts);
    if (skipReasons.length > 0) {
        console.log('Skip reasons:');
        skipReasons.forEach((key) => {
            console.log('  -', key + ':', skipReasonCounts[key]);
        });
    }

    if (failures.length > 0) {
        console.log('\nFailures:');
        failures.slice(0, 25).forEach((item) => {
            console.log(`  - #${item.id} (${item.reportName}): ${item.error}`);
        });
        if (failures.length > 25) {
            console.log(`  ... and ${failures.length - 25} more failure(s).`);
        }
    }
}

main().catch((err) => {
    const message = err && err.message ? err.message : String(err);
    console.error('Reprocess script failed:', message);
    process.exit(1);
});
