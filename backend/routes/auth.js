const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
    try {
        const { fullName, email, phone, password, role, medicalRegistrationNumber, specialization, clinicName } = req.body;

        // Check required fields
        if (!fullName || !email || !password || !role) {
            return res.status(400).json({ error: 'Full name, email, password, and role are required.' });
        }

        if (!['patient', 'doctor'].includes(role)) {
            return res.status(400).json({ error: 'Role must be "patient" or "doctor".' });
        }

        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters.' });
        }

        // Doctor-specific validation
        if (role === 'doctor') {
            if (!medicalRegistrationNumber || !specialization || !clinicName) {
                return res.status(400).json({ error: 'Doctors must provide registration number, specialization, and clinic name.' });
            }
        }

        // Check if email already exists
        const existingUser = User.findByEmail(email);
        if (existingUser) {
            return res.status(409).json({ error: 'An account with this email already exists.' });
        }

        const user = await User.create({
            fullName,
            email,
            phone,
            password,
            role,
            medicalRegistrationNumber: role === 'doctor' ? medicalRegistrationNumber : undefined,
            specialization: role === 'doctor' ? specialization : undefined,
            clinicName: role === 'doctor' ? clinicName : undefined,
        });

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        User.createSession(user._id, {
            deviceInfo: req.get('user-agent'),
            ipAddress: req.ip,
        });

        res.status(201).json({
            message: 'Account created successfully',
            token,
            user,
        });
    } catch (err) {
        console.error('Register error:', err.message);
        res.status(500).json({ error: 'Server error. Please try again.' });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }

        const user = User.findByEmail(email);
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        User.createSession(user._id, {
            deviceInfo: req.get('user-agent'),
            ipAddress: req.ip,
        });

        res.json({
            message: 'Login successful',
            token,
            user,
        });
    } catch (err) {
        console.error('Login error:', err.message);
        res.status(500).json({ error: 'Server error. Please try again.' });
    }
});

// GET /api/auth/me — get current user
router.get('/me', auth, async (req, res) => {
    res.json({ user: req.user });
});

module.exports = router;
