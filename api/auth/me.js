const jwt = require('jsonwebtoken');
const User = require('../../backend/models/User');
const { ensureDatabaseReady } = require('../../backend/server');
const { sendJson } = require('../_lib');

module.exports = async function meHandler(req, res) {
    if (req.method !== 'GET') {
        sendJson(res, 405, { error: 'Method not allowed' });
        return;
    }

    try {
        await ensureDatabaseReady();
        const header = String(req.headers.authorization || '');
        if (!header.startsWith('Bearer ')) {
            sendJson(res, 401, { error: 'Authentication required' });
            return;
        }

        const token = header.replace('Bearer ', '');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = User.findById(decoded.id);

        if (!user) {
            sendJson(res, 401, { error: 'User not found' });
            return;
        }

        sendJson(res, 200, { user });
    } catch (_err) {
        sendJson(res, 401, { error: 'Invalid or expired token' });
    }
};
