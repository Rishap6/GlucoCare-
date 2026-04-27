const { sendJson, readBody } = require('../../../_lib');
const { requirePatient } = require('../_auth');
const { askAssistant, shouldUseConciseAiResponse } = require('../_ai');

module.exports = async function askAiHandler(req, res) {
    if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'Method not allowed' });
        return;
    }

    try {
        const user = await requirePatient(req, res);
        if (!user) return;

        const body = await readBody(req);
        const question = String(body.question || '').trim();
        if (!question) {
            sendJson(res, 400, { error: 'Question is required.' });
            return;
        }

        if (question.length > 600) {
            sendJson(res, 400, { error: 'Question is too long. Keep it below 600 characters.' });
            return;
        }

        const conciseRequested = shouldUseConciseAiResponse(
            question,
            Boolean((body && body.concise === true) || String((body && body.responseStyle) || '').toLowerCase() === 'concise'),
        );

        const response = await askAssistant(question, user, { conciseRequested });
        sendJson(res, 200, response || {});
    } catch (err) {
        console.error('AI ask error:', err);
        sendJson(res, 500, { error: 'Failed to process AI question.' });
    }
};
