/* eslint-disable no-console */
const { chromium } = require('playwright');

const BASE_URL = (process.env.UI_SMOKE_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '');
const TIMEOUT_MS = Number(process.env.UI_SMOKE_TIMEOUT_MS || 30000);

function safeJson(value) {
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

async function apiRequest(method, path, options = {}) {
    const expectedStatus = Array.isArray(options.expectedStatus)
        ? options.expectedStatus
        : [options.expectedStatus || 200];

    const headers = {
        Accept: 'application/json',
        ...(options.headers || {}),
    };

    if (options.token) {
        headers.Authorization = `Bearer ${options.token}`;
    }

    let body = options.body;
    if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(body);
    }

    const response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        body,
    });

    const text = await response.text();
    let payload;
    try {
        payload = text ? JSON.parse(text) : null;
    } catch {
        payload = text;
    }

    if (!expectedStatus.includes(response.status)) {
        throw new Error(
            `${method} ${path} expected ${expectedStatus.join('/')} but got ${response.status}. Response: ${safeJson(payload)}`,
        );
    }

    return payload;
}

async function launchBrowser() {
    try {
        return await chromium.launch({ headless: true, channel: 'msedge' });
    } catch {
        return chromium.launch({ headless: true });
    }
}

async function primeSession(page, token, user) {
    await page.addInitScript(
        ({ tokenValue, userValue }) => {
            sessionStorage.setItem('token', tokenValue);
            sessionStorage.setItem('user', JSON.stringify(userValue));
            localStorage.setItem('token', tokenValue);
            localStorage.setItem('user', JSON.stringify(userValue));
        },
        { tokenValue: token, userValue: user },
    );
}

function parseBadgeToNumber(text) {
    const t = String(text || '').trim();
    if (!t) return 0;
    if (t === '99+') return 99;
    const n = Number(t);
    return Number.isFinite(n) ? n : 0;
}

async function run() {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const password = 'UiTruthPass123!';

    const doctorRegister = await apiRequest('POST', '/api/auth/register', {
        expectedStatus: 201,
        body: {
            fullName: `UI Truth Doctor ${suffix}`,
            email: `ui.truth.doctor.${suffix}@example.com`,
            phone: '9444444441',
            password,
            role: 'doctor',
            medicalRegistrationNumber: `UITRUTH-${suffix}`,
            specialization: 'Diabetology',
            clinicName: 'UI Truth Clinic',
        },
    });

    const patientRegister = await apiRequest('POST', '/api/auth/register', {
        expectedStatus: 201,
        body: {
            fullName: `UI Truth Patient ${suffix}`,
            email: `ui.truth.patient.${suffix}@example.com`,
            phone: '9444444442',
            password,
            role: 'patient',
        },
    });

    const doctorToken = doctorRegister.token;
    const patientToken = patientRegister.token;
    const doctorUser = doctorRegister.user;
    const patientUser = patientRegister.user;
    const doctorId = Number(doctorUser && (doctorUser._id || doctorUser.id));
    const patientId = Number(patientUser && (patientUser._id || patientUser.id));

    await apiRequest('POST', '/api/doctor/patients/assign', {
        token: doctorToken,
        expectedStatus: 201,
        body: { patientId },
    });

    // Seed message state: doctor should have 1 unread from patient; patient should have 1 unread from doctor.
    const threadCreate = await apiRequest('POST', '/api/patient/messages/threads', {
        token: patientToken,
        expectedStatus: 201,
        body: {
            doctorId,
            subject: 'UI truth thread',
            body: 'Patient first message for unread math.',
        },
    });

    const threadId = Number(threadCreate.threadId || threadCreate.id || (threadCreate.thread && threadCreate.thread.id));

    await apiRequest('POST', `/api/doctor/messages/threads/${threadId}`, {
        token: doctorToken,
        expectedStatus: 201,
        body: { body: 'Doctor reply to create patient unread.' },
    });

    // Seed report metric total to compare with reports section card.
    await apiRequest('POST', '/api/patient/reports', {
        token: patientToken,
        expectedStatus: 201,
        body: {
            reportName: `UI truth report ${suffix}`,
            type: 'Lab Report',
            date: new Date().toISOString().slice(0, 10),
            status: 'Pending',
        },
    });

    const patientThreads = await apiRequest('GET', '/api/patient/messages/threads', {
        token: patientToken,
        expectedStatus: 200,
    });
    const patientUnread = Array.isArray(patientThreads)
        ? patientThreads.reduce((sum, row) => sum + Number(row.unreadCount || 0), 0)
        : 0;

    const doctorUnreadRes = await apiRequest('GET', '/api/doctor/messages/unread-count', {
        token: doctorToken,
        expectedStatus: 200,
    });
    const doctorUnread = Number(doctorUnreadRes && doctorUnreadRes.count || 0);

    const reportMetrics = await apiRequest('GET', '/api/patient/reports/extraction-metrics?range=30d', {
        token: patientToken,
        expectedStatus: 200,
    });
    const expectedReportTotal = Number(reportMetrics && reportMetrics.summary && reportMetrics.summary.totalReports || 0);

    const browser = await launchBrowser();

    try {
        const patientContext = await browser.newContext();
        const patientPage = await patientContext.newPage();
        await primeSession(patientPage, patientToken, patientUser);
        await patientPage.goto(`${BASE_URL}/home/patient/patient.html`, {
            waitUntil: 'domcontentloaded',
            timeout: TIMEOUT_MS,
        });

        await patientPage.waitForFunction(() => {
            const badge = document.getElementById('notification-badge');
            return !!badge;
        }, null, { timeout: TIMEOUT_MS });

        const patientBadgeText = await patientPage.$eval('#notification-badge', (el) => (el.textContent || '').trim());
        const patientBadgeValue = parseBadgeToNumber(patientBadgeText);
        if (patientBadgeValue !== patientUnread) {
            throw new Error(`Patient UI unread badge mismatch. ui=${patientBadgeValue} api=${patientUnread}`);
        }

        await patientPage.click('a.nav-item[data-section="reports"]');
        await patientPage.waitForFunction(() => {
            const el = document.getElementById('metric-reports-total');
            return !!el && (el.textContent || '').trim() !== '--';
        }, null, { timeout: TIMEOUT_MS });

        const metricTotalText = await patientPage.$eval('#metric-reports-total', (el) => (el.textContent || '').trim());
        const metricTotal = Number(metricTotalText);
        if (!Number.isFinite(metricTotal) || metricTotal !== expectedReportTotal) {
            throw new Error(`Patient report total mismatch. ui=${metricTotalText} api=${expectedReportTotal}`);
        }

        await patientContext.close();

        const doctorContext = await browser.newContext();
        const doctorPage = await doctorContext.newPage();
        await primeSession(doctorPage, doctorToken, doctorUser);
        await doctorPage.goto(`${BASE_URL}/home/doctor/doctor-dashboard.html`, {
            waitUntil: 'domcontentloaded',
            timeout: TIMEOUT_MS,
        });

        await doctorPage.waitForSelector('#doctor-msg-badge', { timeout: TIMEOUT_MS });
        await doctorPage.waitForFunction(() => {
            const badge = document.getElementById('doctor-msg-badge');
            return !!badge && (badge.textContent || '').trim() !== '';
        }, null, { timeout: TIMEOUT_MS });

        const doctorBadgeText = await doctorPage.$eval('#doctor-msg-badge', (el) => (el.textContent || '').trim());
        const doctorBadge = Number(doctorBadgeText || 0);
        if (!Number.isFinite(doctorBadge) || doctorBadge !== doctorUnread) {
            throw new Error(`Doctor UI unread badge mismatch. ui=${doctorBadgeText} api=${doctorUnread}`);
        }

        await doctorContext.close();
    } finally {
        await browser.close();
    }

    console.log('UI TRUTH SMOKE RESULT: PASS');
}

run().catch((err) => {
    console.error('UI TRUTH SMOKE RESULT: FAIL');
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
});
