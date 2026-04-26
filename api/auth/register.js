const jwt = require('jsonwebtoken');
const User = require('../../backend/models/User');
const { logAudit } = require('../../backend/services/audit');
const { readBody, sendJson, getClientIp, getUserAgent } = require('../_lib');
const { isValidEmail, sanitize } = require('../../backend/middleware/validate');

module.exports = async function registerHandler(req, res) {
    if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'Method not allowed' });
        return;
    }

    try {
        const body = await readBody(req);
        const fullName = sanitize(body.fullName);
        const email = sanitize(body.email).toLowerCase();
        const phone = sanitize(body.phone || '');
        const password = body.password;
        const role = sanitize(body.role);
        const medicalRegistrationNumber = sanitize(body.medicalRegistrationNumber || '');
        const specialization = sanitize(body.specialization || '');
        const clinicName = sanitize(body.clinicName || '');

        if (!fullName || !email || !password || !role) {
            sendJson(res, 400, { error: 'Full name, email, password, and role are required.' });
            return;
        }

        if (!isValidEmail(email)) {
            sendJson(res, 400, { error: 'Please provide a valid email address.' });
            return;
        }

        if (!['patient', 'doctor'].includes(role)) {
            sendJson(res, 400, { error: 'Role must be "patient" or "doctor".' });
            return;
        }

        if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
            sendJson(res, 400, { error: 'Password must be 8-128 characters.' });
            return;
        }

        if (fullName.length > 100) {
            sendJson(res, 400, { error: 'Full name must be 100 characters or fewer.' });
            return;
        }

        if (role === 'doctor' && (!medicalRegistrationNumber || !specialization || !clinicName)) {
            sendJson(res, 400, { error: 'Doctors must provide registration number, specialization, and clinic name.' });
            return;
        }

        const existingUser = User.findByEmail(email);
        if (existingUser) {
            sendJson(res, 409, { error: 'An account with this email already exists.' });
            return;
        }

        const user = await User.create({
            fullName,
            email,
            phone: phone || undefined,
            password,
            role,
            medicalRegistrationNumber: role === 'doctor' ? medicalRegistrationNumber : undefined,
            specialization: role === 'doctor' ? specialization : undefined,
            clinicName: role === 'doctor' ? clinicName : undefined,
        });

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        User.createSession(user._id, {
            deviceInfo: getUserAgent(req),
            ipAddress: getClientIp(req),
        });

        logAudit({
            userId: user._id,
            action: 'register',
            actorRole: role,
            meta: { ip: getClientIp(req), ua: getUserAgent(req) },
        });

        sendJson(res, 201, {
            message: 'Account created successfully',
            token,
            user,
        });
    } catch (err) {
        console.error('Register error:', err);
        sendJson(res, 500, { error: 'Server error. Please try again.' });
    }
};
