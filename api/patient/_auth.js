const jwt = require('jsonwebtoken');
const { initAuthDatabase } = require('../../backend/database');
const User = require('../../backend/models/User');
const { sendJson } = require('../_lib');

async function requirePatient(req, res) {
    await initAuthDatabase();

    const header = String(req.headers.authorization || '');
    if (!header.startsWith('Bearer ')) {
        sendJson(res, 401, { error: 'Authentication required' });
        return null;
    }

    const token = header.replace('Bearer ', '').trim();
    if (!token) {
        sendJson(res, 401, { error: 'Authentication required' });
        return null;
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = User.findById(decoded.id);
        if (!user) {
            sendJson(res, 401, { error: 'User not found' });
            return null;
        }
        return user;
    } catch (_err) {
        sendJson(res, 401, { error: 'Invalid or expired token' });
        return null;
    }
}

module.exports = { requirePatient };
