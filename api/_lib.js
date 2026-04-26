function sendJson(res, statusCode, payload) {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(payload));
}

function readBody(req) {
    if (req.body && typeof req.body === 'object') {
        return Promise.resolve(req.body);
    }
    if (typeof req.body === 'string' && req.body.trim()) {
        try {
            return Promise.resolve(JSON.parse(req.body));
        } catch (_e) {
            return Promise.resolve({});
        }
    }

    return new Promise((resolve, reject) => {
        let data = '';
        req.setEncoding('utf8');
        req.on('data', (chunk) => {
            data += chunk;
        });
        req.on('end', () => {
            if (!data) {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(data));
            } catch (err) {
                reject(err);
            }
        });
        req.on('error', reject);
    });
}

function getClientIp(req) {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    return forwarded || req.socket?.remoteAddress || '';
}

function getUserAgent(req) {
    return String(req.headers['user-agent'] || '');
}

module.exports = {
    sendJson,
    readBody,
    getClientIp,
    getUserAgent,
};
