const fs = require('fs');
const path = require('path');
const { isMainThread, parentPort, workerData } = require('worker_threads');
const postgres = require('postgres');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

function getStatusBuffer() {
    if (!workerData || !workerData.statusBuffer) return null;
    return new Int32Array(workerData.statusBuffer);
}

function signal(statusBuffer, value) {
    if (!statusBuffer) return;
    Atomics.store(statusBuffer, 0, value);
    Atomics.notify(statusBuffer, 0);
}

async function executePayload(payload) {
    const action = String(payload.action || 'all');
    const sqlText = String(payload.sql || '');
    const params = Array.isArray(payload.params) ? payload.params : [];

    const sql = postgres(process.env.DATABASE_URL, {
        prepare: false,
        ssl: 'require',
    });

    try {
        const result = await sql.unsafe(sqlText, params);
        return {
            ok: true,
            count: Number(result?.count || 0),
            rows: Array.isArray(result) ? result : [],
            command: result?.command || null,
            action,
        };
    } catch (err) {
        return {
            ok: false,
            error: err && err.message ? err.message : 'Database query failed',
            stack: err && err.stack ? err.stack : null,
            action,
        };
    } finally {
        try {
            await sql.end({ timeout: 1 });
        } catch (_e) {
        }
    }
}

async function runWorker() {
    const statusBuffer = getStatusBuffer();
    const payload = workerData && workerData.payload ? workerData.payload : {};
    const outputPath = workerData && workerData.outputPath ? String(workerData.outputPath) : null;

    try {
        const response = await executePayload(payload);
        if (outputPath) {
            fs.writeFileSync(outputPath, JSON.stringify(response));
        }
        signal(statusBuffer, response.ok ? 1 : -1);
        return response;
    } catch (err) {
        const response = {
            ok: false,
            error: err && err.message ? err.message : 'Database runner failed',
            stack: err && err.stack ? err.stack : null,
        };
        if (outputPath) {
            try {
                fs.writeFileSync(outputPath, JSON.stringify(response));
            } catch (_e) {
            }
        }
        signal(statusBuffer, -1);
        return response;
    }
}

async function runCli() {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', async () => {
        try {
            const payload = data ? JSON.parse(data) : {};
            const response = await executePayload(payload);
            process.stdout.write(JSON.stringify(response));
            if (!response.ok) process.exitCode = 1;
        } catch (err) {
            process.stdout.write(JSON.stringify({
                ok: false,
                error: err && err.message ? err.message : 'Database runner failed',
                stack: err && err.stack ? err.stack : null,
            }));
            process.exitCode = 1;
        }
    });
}

if (!isMainThread && workerData) {
    runWorker().catch((err) => {
        const response = {
            ok: false,
            error: err && err.message ? err.message : 'Database runner failed',
            stack: err && err.stack ? err.stack : null,
        };
        const outputPath = workerData && workerData.outputPath ? String(workerData.outputPath) : null;
        if (outputPath) {
            try {
                fs.writeFileSync(outputPath, JSON.stringify(response));
            } catch (_e) {
            }
        }
        const statusBuffer = getStatusBuffer();
        signal(statusBuffer, -1);
        if (parentPort) parentPort.postMessage(response);
    });
} else {
    runCli();
}
