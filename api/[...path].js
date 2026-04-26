const serverless = require('serverless-http');
const { app, ensureDatabaseReady } = require('../backend/server');

const handler = serverless(app);

module.exports = async function vercelApi(req, res) {
    await ensureDatabaseReady();
    return handler(req, res);
};
