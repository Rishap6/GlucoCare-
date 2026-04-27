const { sendJson, readBody } = require('../../../_lib');
const { requirePatient } = require('../_auth');
const { extractDocumentForAssistant } = require('../_ai');

module.exports = async function extractDocumentHandler(req, res) {
    if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'Method not allowed' });
        return;
    }

    try {
        const user = await requirePatient(req, res);
        if (!user) return;

        const body = await readBody(req);
        const fileName = String(body.fileName || '').trim() || null;
        const fileType = String(body.fileType || '').trim() || null;
        const text = body.text;
        const base64Content = body.base64Content;

        if (!text && !base64Content) {
            sendJson(res, 400, { error: 'Provide either text or base64Content from uploaded document.' });
            return;
        }

        const result = await extractDocumentForAssistant({
            fileName,
            fileType,
            text,
            base64Content,
            patientName: user.fullName,
        });

        if (!result.ok) {
            sendJson(res, 422, result);
            return;
        }

        sendJson(res, 200, result);
    } catch (err) {
        console.error('AI extract-document error:', err);
        sendJson(res, 500, { error: 'Failed to extract data from document.' });
    }
};
