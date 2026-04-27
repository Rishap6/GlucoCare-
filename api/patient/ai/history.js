const { sendJson, readBody } = require('../../_lib');
const { requirePatient } = require('../_auth');
const { initAuthDatabase, getDb } = require('../../../backend/database');
const { convertLegacyAiConversationToHistory, sanitizeAiHistoryPayload } = require('../_ai');

function db() {
    return getDb();
}

module.exports = async function aiHistoryHandler(req, res) {
    try {
        const user = await requirePatient(req, res);
        if (!user) return;

        await initAuthDatabase();

        if (req.method === 'GET') {
            const row = db().prepare(`
                SELECT conversation_json
                FROM ai_chat_history
                WHERE patient_id = ?
                LIMIT 1
            `).get(user._id);

            let stored = [];
            if (row && row.conversation_json) {
                try {
                    stored = JSON.parse(row.conversation_json);
                } catch (_e) {
                    stored = [];
                }
            }
            const history = Array.isArray(stored)
                ? convertLegacyAiConversationToHistory(stored)
                : sanitizeAiHistoryPayload(stored);
            sendJson(res, 200, { history });
            return;
        }

        if (req.method === 'PUT') {
            const body = await readBody(req);
            let history = null;

            if (body && typeof body.history === 'object' && body.history) {
                history = sanitizeAiHistoryPayload(body.history);
            } else if (Array.isArray(body.conversation)) {
                history = convertLegacyAiConversationToHistory(body.conversation);
            } else {
                sendJson(res, 400, { error: 'Provide history object or conversation array.' });
                return;
            }

            const payload = JSON.stringify(history);
            db().prepare(`
                INSERT INTO ai_chat_history (patient_id, conversation_json)
                VALUES (?, ?)
                ON CONFLICT(patient_id) DO UPDATE SET
                    conversation_json = excluded.conversation_json,
                    updatedAt = datetime('now')
            `).run(user._id, payload);

            sendJson(res, 200, { history });
            return;
        }

        if (req.method === 'DELETE') {
            db().prepare('DELETE FROM ai_chat_history WHERE patient_id = ?').run(user._id);
            sendJson(res, 200, { message: 'AI history cleared.' });
            return;
        }

        sendJson(res, 405, { error: 'Method not allowed' });
    } catch (err) {
        console.error('AI history error:', err);
        sendJson(res, 500, { error: 'Failed to handle AI history.' });
    }
};
