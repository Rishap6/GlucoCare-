const jwt = require('jsonwebtoken');
const { initAuthDatabase } = require('../../backend/database');
const User = require('../../backend/models/User');
const { logAudit } = require('../../backend/services/audit');
const { readBody, sendJson, getClientIp, getUserAgent } = require('../_lib');

module.exports = async function loginHandler(req, res) {
    if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'Method not allowed' });
        return;
    }

    try {
        await initAuthDatabase();
        const body = await readBody(req);
        const email = String(body.email || '').trim().toLowerCase();
        const password = body.password;

        if (!email || !password) {
            sendJson(res, 400, { error: 'Email and password are required.' });
            return;
        }

        const user = User.findByEmail(email);
        if (!user) {
            logAudit({ userId: 0, action: 'login_failed', meta: { ip: getClientIp(req), email, reason: 'unknown_email' } });
            sendJson(res, 401, { error: 'Invalid email or password.' });
            return;
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            logAudit({ userId: user._id, action: 'login_failed', actorRole: user.role, meta: { ip: getClientIp(req), reason: 'wrong_password' } });
            sendJson(res, 401, { error: 'Invalid email or password.' });
            return;
        }

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        User.createSession(user._id, {
            deviceInfo: getUserAgent(req),
            ipAddress: getClientIp(req),
        });

        logAudit({
            userId: user._id,
            action: 'login',
            actorRole: user.role,
            meta: { ip: getClientIp(req), ua: getUserAgent(req) },
        });

        sendJson(res, 200, {
            message: 'Login successful',
            token,
            user,
        });
    } catch (err) {
        console.error('Login error:', err);
        sendJson(res, 500, { error: 'Server error. Please try again.' });
    }
};
