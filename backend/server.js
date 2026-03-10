const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const http = require('http');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { initDatabase } = require('./database');

const authRoutes = require('./routes/auth');
const patientRoutes = require('./routes/patient');
const doctorRoutes = require('./routes/doctor');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Make io accessible in routes
app.set('io', io);

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    skip: function(req) {
        // Keep auth throttling separate from dashboard/chat traffic.
        return req.path.startsWith('/api/auth');
    },
});
app.use(limiter);

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..', 'public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/patient', patientRoutes);
app.use('/api/doctor', doctorRoutes);

// Serve frontend pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'home', 'index.html'));
});

// Start server
const PORT = process.env.PORT || 5000;

// Socket.io auth middleware
io.use(function(socket, next) {
    var token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication required'));
    try {
        var decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.user = decoded;
        next();
    } catch (err) {
        next(new Error('Invalid token'));
    }
});

// Socket.io connection handler
io.on('connection', function(socket) {
    // Join a room named after the user's id so we can target messages
    socket.join('user_' + socket.user.id);
    console.log('Socket connected: user_' + socket.user.id);

    // Delivery acknowledgment: recipient confirms message arrived on their device
    socket.on('message_delivered', function(data) {
        if (!data || !Array.isArray(data.messageIds) || data.messageIds.length === 0) return;
        try {
            var db = require('./database').getDb();
            var placeholders = data.messageIds.map(function() { return '?'; }).join(',');
            db.prepare(
                "UPDATE messages SET delivered_at = datetime('now') WHERE id IN (" + placeholders + ") AND delivered_at IS NULL"
            ).run(...data.messageIds);

            // Notify the sender so their UI updates to double-grey checks
            if (data.senderId) {
                io.to('user_' + data.senderId).emit('messages_delivered', {
                    messageIds: data.messageIds,
                    threadId: data.threadId
                });
            }
        } catch (err) {
            console.error('message_delivered error:', err.message);
        }
    });

    // Read acknowledgment: recipient has opened and viewed the messages
    socket.on('messages_read', function(data) {
        if (!data || !Array.isArray(data.messageIds) || data.messageIds.length === 0) return;
        try {
            var db = require('./database').getDb();
            var placeholders = data.messageIds.map(function() { return '?'; }).join(',');
            db.prepare(
                "UPDATE messages SET delivered_at = COALESCE(delivered_at, datetime('now')), read_at = datetime('now') WHERE id IN (" + placeholders + ") AND read_at IS NULL"
            ).run(...data.messageIds);

            // Notify the sender so their UI updates to double-blue checks
            if (data.senderId) {
                io.to('user_' + data.senderId).emit('messages_read_ack', {
                    messageIds: data.messageIds,
                    threadId: data.threadId
                });
            }
        } catch (err) {
            console.error('messages_read error:', err.message);
        }
    });

    socket.on('disconnect', function() {
        console.log('Socket disconnected: user_' + socket.user.id);
    });
});

async function startServer() {
    try {
        await initDatabase();
        console.log('Connected to SQLite database');
        server.listen(PORT, () => {
            console.log(`Server running on http://localhost:${PORT}`);
        });
    } catch (err) {
        console.error('Failed to initialize database:', err.message);
        process.exit(1);
    }
}

startServer();
