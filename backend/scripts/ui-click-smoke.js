/* eslint-disable no-console */
const { chromium } = require('playwright');

const BASE_URL = (process.env.UI_SMOKE_BASE_URL || 'http://localhost:5002').replace(/\/+$/, '');
const TIMEOUT_MS = Number(process.env.UI_SMOKE_TIMEOUT_MS || 20000);

function assertCondition(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function safeJson(value) {
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function todayDateKey() {
    return new Date().toISOString().slice(0, 10);
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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs || TIMEOUT_MS));

    try {
        const response = await fetch(`${BASE_URL}${path}`, {
            method,
            headers,
            body,
            signal: controller.signal,
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
    } finally {
        clearTimeout(timeout);
    }
}

async function launchBrowser() {
    try {
        return await chromium.launch({ headless: true, channel: 'msedge' });
    } catch {
        return chromium.launch({ headless: true });
    }
}

async function buildScenario() {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const doctorEmail = `ui.smoke.doctor.${suffix}@example.com`;
    const patientEmail = `ui.smoke.patient.${suffix}@example.com`;
    const password = 'UiSmokePass123!';

    const doctorRegister = await apiRequest('POST', '/api/auth/register', {
        expectedStatus: 201,
        body: {
            fullName: `UI Doctor ${suffix}`,
            email: doctorEmail,
            phone: '9111111111',
            password,
            role: 'doctor',
            medicalRegistrationNumber: `UI-REG-${suffix}`,
            specialization: 'Diabetology',
            clinicName: 'UI Smoke Clinic',
        },
    });

    const patientRegister = await apiRequest('POST', '/api/auth/register', {
        expectedStatus: 201,
        body: {
            fullName: `UI Patient ${suffix}`,
            email: patientEmail,
            phone: '9222222222',
            password,
            role: 'patient',
        },
    });

    const doctorToken = doctorRegister && doctorRegister.token;
    const patientToken = patientRegister && patientRegister.token;
    const doctorUser = doctorRegister && doctorRegister.user;
    const patientUser = patientRegister && patientRegister.user;

    assertCondition(doctorToken && doctorUser, 'Doctor registration token/user missing.');
    assertCondition(patientToken && patientUser, 'Patient registration token/user missing.');

    const doctorId = Number(doctorUser._id || doctorUser.id);
    const patientId = Number(patientUser._id || patientUser.id);
    assertCondition(Number.isFinite(doctorId), 'Doctor id missing after registration.');
    assertCondition(Number.isFinite(patientId), 'Patient id missing after registration.');

    await apiRequest('POST', '/api/doctor/patients/assign', {
        token: doctorToken,
        expectedStatus: 201,
        body: { patientId },
    });

    // Create unread doctor and patient message states.
    const threadCreate = await apiRequest('POST', '/api/patient/messages/threads', {
        token: patientToken,
        expectedStatus: 201,
        body: {
            doctorId,
            subject: 'UI smoke thread',
            body: 'Hello doctor, this is a UI smoke test message.',
        },
    });

    const threadId = Number(
        threadCreate && threadCreate.threadId
            ? threadCreate.threadId
            : threadCreate && (threadCreate.id || threadCreate._id)
                ? (threadCreate.id || threadCreate._id)
                : threadCreate && threadCreate.thread && (threadCreate.thread.id || threadCreate.thread._id),
    );
    assertCondition(Number.isFinite(threadId), 'Thread id missing after creation.');

    await apiRequest('POST', `/api/doctor/messages/threads/${threadId}`, {
        token: doctorToken,
        expectedStatus: 201,
        body: { body: 'Doctor reply for patient unread badge.' },
    });

    await apiRequest('POST', `/api/patient/messages/threads/${threadId}`, {
        token: patientToken,
        expectedStatus: 201,
        body: { body: 'Patient follow-up for doctor unread badge.' },
    });

    // Trigger an alert to validate doctor notification button/modal flow.
    await apiRequest('POST', '/api/patient/glucose', {
        token: patientToken,
        expectedStatus: 201,
        body: {
            value: 260,
            type: 'random',
            notes: 'UI smoke critical glucose',
            recordedAt: todayDateKey(),
        },
    });

    return {
        doctor: { token: doctorToken, user: doctorUser },
        patient: { token: patientToken, user: patientUser },
    };
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

async function runPatientUiSmoke(browser, patientAuth) {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('dialog', async (dialog) => {
        await dialog.dismiss();
    });

    await primeSession(page, patientAuth.token, patientAuth.user);
    await page.goto(`${BASE_URL}/home/patient/patient.html`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });

    await page.waitForSelector('#notification-btn', { timeout: TIMEOUT_MS });
    await page.waitForFunction(() => {
        const badge = document.getElementById('notification-badge');
        if (!badge) return false;
        const text = (badge.textContent || '').trim();
        const hasCount = text === '99+' || Number(text) > 0;
        return badge.style.display !== 'none' && hasCount;
    }, null, { timeout: TIMEOUT_MS });

    await page.click('#notification-btn');

    await page.waitForFunction(() => {
        const panel = document.getElementById('notification-panel');
        return !!panel && panel.classList.contains('open') && panel.getAttribute('aria-hidden') === 'false';
    }, null, { timeout: TIMEOUT_MS });

    await page.waitForFunction(() => {
        return document.querySelectorAll('#notification-list .notification-item').length > 0;
    }, null, { timeout: TIMEOUT_MS });

    await page.click('#notification-list .notification-item');

    await page.waitForFunction(() => {
        const chatSection = document.getElementById('doctor-chat');
        return !!chatSection && chatSection.classList.contains('active');
    }, null, { timeout: TIMEOUT_MS });

    await page.waitForFunction(() => {
        return document.querySelectorAll('#thread-messages .wa-msg').length > 0;
    }, null, { timeout: TIMEOUT_MS });

    await page.waitForFunction(() => {
        const badge = document.getElementById('notification-badge');
        if (!badge) return false;
        return badge.style.display === 'none' || (badge.textContent || '').trim() === '0';
    }, null, { timeout: TIMEOUT_MS });

    await context.close();
}

async function runDoctorUiSmoke(browser, doctorAuth) {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('dialog', async (dialog) => {
        await dialog.dismiss();
    });

    await primeSession(page, doctorAuth.token, doctorAuth.user);
    await page.goto(`${BASE_URL}/home/doctor/doctor-dashboard.html`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });

    await page.waitForSelector('#doctor-nav-messages', { timeout: TIMEOUT_MS });
    await page.waitForFunction(() => {
        const badge = document.getElementById('doctor-msg-badge');
        if (!badge) return false;
        const value = Number((badge.textContent || '0').trim());
        return badge.style.display !== 'none' && value > 0;
    }, null, { timeout: TIMEOUT_MS });

    await page.click('#doctor-nav-messages');

    await page.waitForFunction(() => {
        const body = document.getElementById('doctor-dashboard-body');
        return !!body && body.getAttribute('data-view') === 'messages';
    }, null, { timeout: TIMEOUT_MS });

    await page.waitForSelector('#doctor-open-messages-panel-btn', { timeout: TIMEOUT_MS });
    await page.click('#doctor-open-messages-panel-btn');

    await page.waitForFunction(() => {
        const panel = document.getElementById('doctor-chat-panel');
        return !!panel && panel.classList.contains('open');
    }, null, { timeout: TIMEOUT_MS });

    await page.waitForFunction(() => {
        return document.querySelectorAll('#dcp-thread-list .dcp-thread-item').length > 0;
    }, null, { timeout: TIMEOUT_MS });

    await page.click('#dcp-thread-list .dcp-thread-item');

    await page.waitForFunction(() => {
        return (
            document.querySelectorAll('#dcp-messages .dcp-msg').length > 0
            || (document.querySelector('#dcp-messages .dcp-empty') && (document.querySelector('#dcp-messages .dcp-empty').textContent || '').trim() !== 'No messages yet')
        );
    }, null, { timeout: TIMEOUT_MS });

    await page.waitForFunction(() => {
        const badge = document.getElementById('doctor-msg-badge');
        if (!badge) return false;
        return badge.style.display === 'none' || Number((badge.textContent || '0').trim()) === 0;
    }, null, { timeout: TIMEOUT_MS });

    await page.evaluate(() => {
        if (typeof window.closeDoctorChatPanel === 'function') {
            window.closeDoctorChatPanel();
        }
    });

    await page.waitForFunction(() => {
        const panel = document.getElementById('doctor-chat-panel');
        return !!panel && !panel.classList.contains('open');
    }, null, { timeout: TIMEOUT_MS });

    await page.click('#doctor-notification-btn');

    await page.waitForFunction(() => {
        const body = document.getElementById('doctor-dashboard-body');
        return !!body && body.getAttribute('data-view') === 'alerts';
    }, null, { timeout: TIMEOUT_MS });

    await context.close();
}

async function main() {
    console.log(`UI click smoke base URL: ${BASE_URL}`);

    const scenario = await buildScenario();
    const browser = await launchBrowser();

    try {
        await runPatientUiSmoke(browser, scenario.patient);
        console.log('PASS patient dashboard badge/panel/thread-read flow');

        await runDoctorUiSmoke(browser, scenario.doctor);
        console.log('PASS doctor dashboard view-switching/chat-panel/alerts-view flow');

        console.log('UI CLICK SMOKE RESULT: PASS');
    } finally {
        await browser.close();
    }
}

main().catch((err) => {
    console.error('UI CLICK SMOKE RESULT: FAIL');
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
});
