const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
    try {
        const header = req.header('Authorization');
        if (!header || !header.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const token = header.replace('Bearer ', '');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = User.findById(decoded.id);

        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }

        req.user = user;
        req.token = token;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
};

// Role-based access
const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            console.warn(`Access denied: user ${req.user ? req.user._id : 'unknown'} with role '${req.user ? req.user.role : 'none'}' tried ${req.method} ${req.originalUrl} (requires [${roles.join(', ')}])`);
            return res.status(403).json({ error: 'Access denied' });
        }
        next();
    };
};

module.exports = { auth, requireRole };
