const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const hpp = require('hpp');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { initDatabase } = require('./database');
const { requireJsonContentType } = require('./middleware/validate');

const authRoutes = require('./routes/auth');
const patientRoutes = require('./routes/patient');
const doctorRoutes = require('./routes/doctor');
const predictRoutes = require('./routes/predict');

const DEFAULT_PORT = Number(process.env.PORT || 5000);
let activePort = DEFAULT_PORT;
let dbInitPromise = null;

const CONFIGURED_ORIGINS = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(function(s) { return s.trim(); }).filter(Boolean)
    : [];

function isLocalhostOrigin(origin, port) {
    return origin === 'http://localhost:' + port || origin === 'http://127.0.0.1:' + port;
}

function isAllowedOrigin(origin) {
    if (!origin) return true;
    if (CONFIGURED_ORIGINS.indexOf(origin) !== -1) return true;
    return isLocalhostOrigin(origin, activePort);
}

function corsOriginValidator(origin, callback) {
    if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
    }
    callback(new Error('Not allowed by CORS'));
}

function ensureDatabaseReady() {
    if (!dbInitPromise) {
        dbInitPromise = initDatabase();
    }
    return dbInitPromise;
}

const app = express();
const usingVercel = !!process.env.VERCEL;

function createNoopIo() {
    return {
        use() {},
        on() {},
        emit() {},
        to() {
            return {
                emit() {},
            };
        },
    };
}

const server = usingVercel ? null : http.createServer(app);
const io = usingVercel ? createNoopIo() : new Server(server, {
    cors: { origin: corsOriginValidator, credentials: true },
    pingTimeout: 20000,
    pingInterval: 25000,
});

// Make io accessible in routes
app.set('io', io);

// ── Security headers ────────────────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: false,   // static frontend needs inline scripts
    crossOriginEmbedderPolicy: false,
}));
app.use(compression());
app.use(hpp());

// ── Rate limiting ───────────────────────────────────────────────────
// Strict limiter for auth endpoints (brute-force protection)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,                        // 15 login / register attempts per 15 min
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

// General API limiter
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,                       // 200 requests per 15 min per IP
    standardHeaders: true,
    legacyHeaders: false,
});

// ── Middleware ───────────────────────────────────────────────────────
app.use(cors({
    origin: corsOriginValidator,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: false, limit: '12mb' }));
app.use(requireJsonContentType);
// Disable X-Powered-By (belt & suspenders — helmet already does this)
app.disable('x-powered-by');

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..', 'public')));

// API Routes (with appropriate rate limiters)
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/patient', apiLimiter, patientRoutes);
app.use('/api/doctor', apiLimiter, doctorRoutes);
app.use('/api/predict', apiLimiter, predictRoutes);

// Serve frontend pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'home', 'index.html'));
});

// Start server
const PORT = DEFAULT_PORT;

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

// Limit events per socket to guard against flood
const SOCKET_EVENT_LIMIT = 30;  // max events per 10 seconds
const SOCKET_WINDOW_MS = 10000;

// Socket.io connection handler
io.on('connection', function(socket) {
    // Join a room named after the user's id so we can target messages
    socket.join('user_' + socket.user.id);
    console.log('Socket connected: user_' + socket.user.id);

    // Simple per-socket rate limiter
    var socketEventCount = 0;
    var socketWindowStart = Date.now();
    function socketRateLimitOk() {
        var now = Date.now();
        if (now - socketWindowStart > SOCKET_WINDOW_MS) {
            socketEventCount = 0;
            socketWindowStart = now;
        }
        socketEventCount++;
        return socketEventCount <= SOCKET_EVENT_LIMIT;
    }

    // Delivery acknowledgment: recipient confirms message arrived on their device
    socket.on('message_delivered', function(data) {
        if (!socketRateLimitOk()) return;
        if (!data || !Array.isArray(data.messageIds) || data.messageIds.length === 0) return;
        // Cap array length to prevent abuse
        var ids = data.messageIds.slice(0, 100).filter(function(id) { return Number.isInteger(Number(id)) && Number(id) > 0; });
        if (ids.length === 0) return;
        try {
            var db = require('./database').getDb();
            var placeholders = ids.map(function() { return '?'; }).join(',');
            db.prepare(
                "UPDATE messages SET delivered_at = datetime('now') WHERE id IN (" + placeholders + ") AND delivered_at IS NULL"
            ).run(...ids);

            // Notify the sender so their UI updates to double-grey checks
            if (data.senderId && Number.isInteger(Number(data.senderId))) {
                io.to('user_' + data.senderId).emit('messages_delivered', {
                    messageIds: ids,
                    threadId: data.threadId
                });
            }
        } catch (err) {
            console.error('message_delivered error:', err.message);
        }
    });

    // Read acknowledgment: recipient has opened and viewed the messages
    socket.on('messages_read', function(data) {
        if (!socketRateLimitOk()) return;
        if (!data || !Array.isArray(data.messageIds) || data.messageIds.length === 0) return;
        var ids = data.messageIds.slice(0, 100).filter(function(id) { return Number.isInteger(Number(id)) && Number(id) > 0; });
        if (ids.length === 0) return;
        try {
            var db = require('./database').getDb();
            var placeholders = ids.map(function() { return '?'; }).join(',');
            db.prepare(
                "UPDATE messages SET delivered_at = COALESCE(delivered_at, datetime('now')), read_at = datetime('now') WHERE id IN (" + placeholders + ") AND read_at IS NULL"
            ).run(...ids);

            // Notify the sender so their UI updates to double-blue checks
            if (data.senderId && Number.isInteger(Number(data.senderId))) {
                io.to('user_' + data.senderId).emit('messages_read_ack', {
                    messageIds: ids,
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

// ── Global error handler (must be last) ─────────────────────────────
app.use(function(err, req, res, _next) {
    console.error('[unhandled]', err.stack || err.message || err);
    res.status(500).json({ error: 'Internal server error.' });
});

// ── Graceful shutdown ───────────────────────────────────────────────
function gracefulShutdown(signal) {
    console.log(`\n${signal} received - shutting down gracefully`);
    if (!server) {
        process.exit(0);
        return;
    }
    server.close(function() {
        console.log('HTTP server closed');
        process.exit(0);
    });
    // Force exit after 5 seconds if connections don't close
    setTimeout(function() { process.exit(1); }, 5000);
}
process.on('SIGINT', function() { gracefulShutdown('SIGINT'); });
process.on('SIGTERM', function() { gracefulShutdown('SIGTERM'); });

async function startServer() {
    try {
        await ensureDatabaseReady();
        console.log('Connected to database');

        function listenOnPort(port) {
            activePort = port;

            function onError(err) {
                server.removeListener('listening', onListening);
                if (err && err.code === 'EADDRINUSE') {
                    const nextPort = Number(port) + 1;
                    console.warn(`Port ${port} is in use. Trying ${nextPort}...`);
                    setTimeout(function() {
                        listenOnPort(nextPort);
                    }, 100);
                    return;
                }
                console.error('Server start failed:', err && err.message ? err.message : err);
                process.exit(1);
            }

            function onListening() {
                server.removeListener('error', onError);
                console.log(`Server running on http://localhost:${activePort}`);
            }

            server.once('error', onError);
            server.once('listening', onListening);

            server.listen(port);
        }

        listenOnPort(PORT);
    } catch (err) {
        console.error('Failed to initialize database:', err.message);
        process.exit(1);
    }
}

if (!process.env.VERCEL) {
    startServer();
}

module.exports = { app, ensureDatabaseReady };

