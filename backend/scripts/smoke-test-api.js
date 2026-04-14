/* eslint-disable no-console */
const BASE_URL = (process.env.SMOKE_BASE_URL || process.env.BASE_URL || 'http://localhost:5000').replace(/\/+$/, '');

const DEFAULT_TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 20000);

function assertCondition(condition, message) {
    if (!condition) throw new Error(message);
}

function todayDateKey(offsetDays) {
    const d = new Date();
    d.setDate(d.getDate() + Number(offsetDays || 0));
    return d.toISOString().slice(0, 10);
}

function nowIso() {
    return new Date().toISOString();
}

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
    const token = options.token || null;
    const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);

    const headers = {
        Accept: 'application/json',
        ...(options.headers || {}),
    };

    let body = options.body;
    if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase()) && body === undefined) {
        body = {};
    }

    if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
    }

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const url = `${BASE_URL}${path}`;
    const startedAt = Date.now();

    try {
        const response = await fetch(url, {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
            signal: controller.signal,
        });

        const durationMs = Date.now() - startedAt;
        const responseText = await response.text();
        let payload;
        try {
            payload = responseText ? JSON.parse(responseText) : null;
        } catch {
            payload = responseText;
        }

        if (!expectedStatus.includes(response.status)) {
            throw new Error(
                `${method} ${path} expected ${expectedStatus.join('/')} but got ${response.status}. Response: ${safeJson(payload)}`,
            );
        }

        console.log(`PASS ${method} ${path} -> ${response.status} (${durationMs}ms)`);
        return { status: response.status, data: payload, durationMs };
    } finally {
        clearTimeout(timeout);
    }
}

async function run() {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const doctorEmail = `smoke.doctor.${suffix}@example.com`;
    const patientEmail = `smoke.patient.${suffix}@example.com`;
    const password = 'SmokePass123!';

    const doctorRegistration = {
        fullName: `Dr Smoke ${suffix}`,
        email: doctorEmail,
        phone: '9000000001',
        password,
        role: 'doctor',
        medicalRegistrationNumber: `REG-${suffix}`,
        specialization: 'Diabetology',
        clinicName: 'Smoke Test Clinic',
    };

    const patientRegistration = {
        fullName: `Patient Smoke ${suffix}`,
        email: patientEmail,
        phone: '9000000002',
        password,
        role: 'patient',
    };

    const smokeState = {
        doctorToken: null,
        patientToken: null,
        doctorId: null,
        patientId: null,
        appointmentId: null,
        medicationId: null,
        patientReportId: null,
        doctorReportId: null,
        threadId: null,
        exportId: null,
        shareId: null,
        goalId: null,
        sessionIdToRevoke: null,
    };

    console.log(`Running smoke tests against ${BASE_URL}`);

    // Auth + account setup
    const doctorRegisterRes = await apiRequest('POST', '/api/auth/register', {
        expectedStatus: 201,
        body: doctorRegistration,
    });
    smokeState.doctorToken = doctorRegisterRes.data && doctorRegisterRes.data.token;
    smokeState.doctorId = Number(doctorRegisterRes.data && doctorRegisterRes.data.user && doctorRegisterRes.data.user._id);

    const patientRegisterRes = await apiRequest('POST', '/api/auth/register', {
        expectedStatus: 201,
        body: patientRegistration,
    });
    smokeState.patientToken = patientRegisterRes.data && patientRegisterRes.data.token;
    smokeState.patientId = Number(patientRegisterRes.data && patientRegisterRes.data.user && patientRegisterRes.data.user._id);

    assertCondition(smokeState.doctorToken, 'Doctor token missing after registration.');
    assertCondition(smokeState.patientToken, 'Patient token missing after registration.');
    assertCondition(Number.isFinite(smokeState.doctorId), 'Doctor id missing after registration.');
    assertCondition(Number.isFinite(smokeState.patientId), 'Patient id missing after registration.');

    const doctorLogin = await apiRequest('POST', '/api/auth/login', {
        expectedStatus: 200,
        body: { email: doctorEmail, password },
    });
    smokeState.doctorToken = doctorLogin.data && doctorLogin.data.token;

    const patientLogin = await apiRequest('POST', '/api/auth/login', {
        expectedStatus: 200,
        body: { email: patientEmail, password },
    });
    smokeState.patientToken = patientLogin.data && patientLogin.data.token;

    const doctorMe = await apiRequest('GET', '/api/auth/me', {
        token: smokeState.doctorToken,
        expectedStatus: 200,
    });
    assertCondition(doctorMe.data && doctorMe.data.user && doctorMe.data.user.role === 'doctor', 'Doctor /auth/me returned invalid role.');

    const patientMe = await apiRequest('GET', '/api/auth/me', {
        token: smokeState.patientToken,
        expectedStatus: 200,
    });
    assertCondition(patientMe.data && patientMe.data.user && patientMe.data.user.role === 'patient', 'Patient /auth/me returned invalid role.');

    // Assignment for doctor-side patient visibility
    await apiRequest('POST', '/api/doctor/patients/assign', {
        token: smokeState.doctorToken,
        expectedStatus: 201,
        body: { patientId: smokeState.patientId },
    });

    // Patient core flows
    await apiRequest('GET', '/api/patient/profile', { token: smokeState.patientToken, expectedStatus: 200 });
    await apiRequest('PUT', '/api/patient/profile', {
        token: smokeState.patientToken,
        expectedStatus: 200,
        body: { bloodType: 'O+', emergencyContact: { name: 'Smoke Contact', phone: '9000000099' } },
    });

    await apiRequest('GET', '/api/patient/dashboard', { token: smokeState.patientToken, expectedStatus: 200 });

    const glucoseCreate = await apiRequest('POST', '/api/patient/glucose', {
        token: smokeState.patientToken,
        expectedStatus: 201,
        body: {
            value: 246,
            type: 'random',
            notes: 'smoke high reading',
            recordedAt: todayDateKey(0),
        },
    });
    assertCondition(glucoseCreate.data && glucoseCreate.data.reading, 'Glucose create did not return reading payload.');

    await apiRequest('GET', '/api/patient/glucose?days=30', { token: smokeState.patientToken, expectedStatus: 200 });
    await apiRequest('GET', '/api/patient/glucose/trends?range=30d', { token: smokeState.patientToken, expectedStatus: 200 });
    await apiRequest('GET', '/api/patient/glucose/time-in-range?range=30d&low=70&high=180', { token: smokeState.patientToken, expectedStatus: 200 });

    await apiRequest('GET', '/api/patient/alerts/settings', { token: smokeState.patientToken, expectedStatus: 200 });
    await apiRequest('POST', '/api/patient/alerts/settings', {
        token: smokeState.patientToken,
        expectedStatus: 200,
        body: {
            lowThreshold: 65,
            highThreshold: 195,
            missedLogHours: 18,
            notifyPush: true,
            notifyEmail: false,
        },
    });

    const alertsRes = await apiRequest('GET', '/api/patient/alerts?limit=20', {
        token: smokeState.patientToken,
        expectedStatus: 200,
    });
    const alerts = Array.isArray(alertsRes.data) ? alertsRes.data : [];
    if (alerts.length > 0 && Number.isFinite(Number(alerts[0].id))) {
        await apiRequest('PATCH', `/api/patient/alerts/${alerts[0].id}/read`, {
            token: smokeState.patientToken,
            expectedStatus: 200,
            body: {},
        });
    }

    await apiRequest('POST', '/api/patient/health-metrics', {
        token: smokeState.patientToken,
        expectedStatus: 201,
        body: {
            weight: 72.4,
            systolic: 122,
            diastolic: 79,
            hba1c: 6.8,
            recordedAt: todayDateKey(0),
        },
    });
    await apiRequest('GET', '/api/patient/health-metrics?days=30', { token: smokeState.patientToken, expectedStatus: 200 });

    const doctorsRes = await apiRequest('GET', '/api/patient/doctors', {
        token: smokeState.patientToken,
        expectedStatus: 200,
    });
    const doctorsList = Array.isArray(doctorsRes.data) ? doctorsRes.data : [];
    const linkedDoctor = doctorsList.find((item) => Number(item._id) === smokeState.doctorId);
    assertCondition(Boolean(linkedDoctor), 'Assigned doctor was not returned in /api/patient/doctors.');

    const patientAppointment = await apiRequest('POST', '/api/patient/appointments', {
        token: smokeState.patientToken,
        expectedStatus: 201,
        body: {
            doctor: smokeState.doctorId,
            date: todayDateKey(2),
            time: '10:30',
            reason: 'Smoke appointment',
        },
    });
    smokeState.appointmentId = Number(patientAppointment.data && patientAppointment.data._id);

    await apiRequest('GET', '/api/patient/appointments', { token: smokeState.patientToken, expectedStatus: 200 });
    await apiRequest('GET', '/api/patient/appointments/upcoming?limit=10', { token: smokeState.patientToken, expectedStatus: 200 });

    if (Number.isFinite(smokeState.appointmentId)) {
        await apiRequest('POST', `/api/patient/appointments/${smokeState.appointmentId}/checklist`, {
            token: smokeState.patientToken,
            expectedStatus: 201,
            body: { item: 'Carry latest reports', isDone: false },
        });
        await apiRequest('GET', `/api/patient/appointments/${smokeState.appointmentId}/checklist`, {
            token: smokeState.patientToken,
            expectedStatus: 200,
        });
    }

    const patientReport = await apiRequest('POST', '/api/patient/reports', {
        token: smokeState.patientToken,
        expectedStatus: 201,
        body: {
            reportName: `Smoke Report ${suffix}`,
            type: 'Lab Report',
            date: todayDateKey(0),
            status: 'Pending',
        },
    });
    smokeState.patientReportId = Number(patientReport.data && patientReport.data._id);

    await apiRequest('GET', '/api/patient/reports', { token: smokeState.patientToken, expectedStatus: 200 });
    await apiRequest('GET', '/api/patient/reports/extraction-metrics?range=30d', { token: smokeState.patientToken, expectedStatus: 200 });

    if (Number.isFinite(smokeState.patientReportId)) {
        await apiRequest('GET', `/api/patient/reports/${smokeState.patientReportId}`, {
            token: smokeState.patientToken,
            expectedStatus: 200,
        });
    }

    await apiRequest('POST', '/api/patient/records', {
        token: smokeState.patientToken,
        expectedStatus: 201,
        body: {
            title: `Smoke Record ${suffix}`,
            type: 'Diagnosis',
            date: todayDateKey(0),
            description: 'Smoke patient record',
            facility: 'Smoke Facility',
        },
    });
    await apiRequest('GET', '/api/patient/records', { token: smokeState.patientToken, expectedStatus: 200 });

    const medicationCreate = await apiRequest('POST', '/api/patient/medications', {
        token: smokeState.patientToken,
        expectedStatus: 201,
        body: {
            name: 'Metformin',
            dosage: '500mg',
            frequency: 'BD',
            timing: ['08:00', '20:00'],
            active: true,
        },
    });
    smokeState.medicationId = Number(medicationCreate.data && medicationCreate.data.id);

    await apiRequest('GET', '/api/patient/medications', { token: smokeState.patientToken, expectedStatus: 200 });

    if (Number.isFinite(smokeState.medicationId)) {
        await apiRequest('POST', `/api/patient/medications/${smokeState.medicationId}/log`, {
            token: smokeState.patientToken,
            expectedStatus: 201,
            body: {
                status: 'taken',
                scheduledTime: nowIso(),
                takenTime: nowIso(),
                note: 'Smoke log',
            },
        });
    }

    await apiRequest('GET', '/api/patient/medications/adherence?range=30d', {
        token: smokeState.patientToken,
        expectedStatus: 200,
    });

    await apiRequest('POST', '/api/patient/meals', {
        token: smokeState.patientToken,
        expectedStatus: 201,
        body: {
            mealType: 'lunch',
            carbsG: 45,
            calories: 520,
            note: 'Smoke meal',
            loggedAt: nowIso(),
        },
    });
    await apiRequest('GET', '/api/patient/meals?range=7d', { token: smokeState.patientToken, expectedStatus: 200 });

    await apiRequest('POST', '/api/patient/activities', {
        token: smokeState.patientToken,
        expectedStatus: 201,
        body: {
            activityType: 'walk',
            durationMin: 35,
            intensity: 'moderate',
            steps: 4200,
            caloriesBurned: 180,
            loggedAt: nowIso(),
        },
    });
    await apiRequest('GET', '/api/patient/activities?range=7d', { token: smokeState.patientToken, expectedStatus: 200 });
    await apiRequest('GET', '/api/patient/correlations/glucose-lifestyle?range=30d', {
        token: smokeState.patientToken,
        expectedStatus: 200,
    });

    await apiRequest('GET', '/api/patient/biometrics/latest', { token: smokeState.patientToken, expectedStatus: 200 });
    await apiRequest('GET', '/api/patient/biometrics/trends?range=90d', { token: smokeState.patientToken, expectedStatus: 200 });
    await apiRequest('GET', '/api/patient/score/today', { token: smokeState.patientToken, expectedStatus: 200 });
    await apiRequest('GET', '/api/patient/score/history?range=30d', { token: smokeState.patientToken, expectedStatus: 200 });

    await apiRequest('GET', '/api/patient/safety/profile', { token: smokeState.patientToken, expectedStatus: 200 });
    await apiRequest('PATCH', '/api/patient/safety/profile', {
        token: smokeState.patientToken,
        expectedStatus: 200,
        body: {
            emergencyContactName: 'Smoke Emergency',
            emergencyContactPhone: '9000000011',
            severeLowThreshold: 58,
            autoNotifyEnabled: true,
        },
    });
    await apiRequest('POST', '/api/patient/safety/trigger', {
        token: smokeState.patientToken,
        expectedStatus: 201,
        body: {
            eventType: 'manual_alert',
            severity: 'medium',
            details: { source: 'smoke-test' },
        },
    });

    await apiRequest('GET', '/api/patient/gamification/progress', { token: smokeState.patientToken, expectedStatus: 200 });
    const goalCreate = await apiRequest('POST', '/api/patient/gamification/goals', {
        token: smokeState.patientToken,
        expectedStatus: 201,
        body: {
            type: 'steps',
            targetValue: 7000,
            period: 'daily',
        },
    });
    smokeState.goalId = Number(goalCreate.data && goalCreate.data.id);
    if (Number.isFinite(smokeState.goalId)) {
        await apiRequest('PATCH', `/api/patient/gamification/goals/${smokeState.goalId}`, {
            token: smokeState.patientToken,
            expectedStatus: 200,
            body: { status: 'active', targetValue: 8000 },
        });
    }

    const exportCreate = await apiRequest('POST', '/api/patient/exports', {
        token: smokeState.patientToken,
        expectedStatus: 201,
        body: {
            format: 'json',
            scope: { include: ['glucose', 'metrics'] },
        },
    });
    smokeState.exportId = Number(exportCreate.data && exportCreate.data.id);
    if (Number.isFinite(smokeState.exportId)) {
        await apiRequest('GET', `/api/patient/exports/${smokeState.exportId}`, {
            token: smokeState.patientToken,
            expectedStatus: 200,
        });
    }

    const shareCreate = await apiRequest('POST', '/api/patient/shares', {
        token: smokeState.patientToken,
        expectedStatus: 201,
        body: {
            targetType: 'doctor',
            targetValue: String(smokeState.doctorId),
            scope: { type: 'summary' },
        },
    });
    smokeState.shareId = Number(shareCreate.data && shareCreate.data.id);
    if (Number.isFinite(smokeState.shareId)) {
        await apiRequest('PATCH', `/api/patient/shares/${smokeState.shareId}/revoke`, {
            token: smokeState.patientToken,
            expectedStatus: 200,
            body: {},
        });
    }

    await apiRequest('GET', '/api/patient/privacy/settings', { token: smokeState.patientToken, expectedStatus: 200 });
    await apiRequest('PATCH', '/api/patient/privacy/settings', {
        token: smokeState.patientToken,
        expectedStatus: 200,
        body: {
            shareWithDoctor: true,
            shareWithCaregiver: false,
            researchOptIn: false,
            marketingOptIn: false,
        },
    });

    const sessionsRes = await apiRequest('GET', '/api/patient/security/sessions', {
        token: smokeState.patientToken,
        expectedStatus: 200,
    });
    const sessions = Array.isArray(sessionsRes.data) ? sessionsRes.data : [];
    if (sessions.length > 0 && Number.isFinite(Number(sessions[0].id))) {
        smokeState.sessionIdToRevoke = Number(sessions[0].id);
        await apiRequest('DELETE', `/api/patient/security/sessions/${smokeState.sessionIdToRevoke}`, {
            token: smokeState.patientToken,
            expectedStatus: 200,
        });
    }

    await apiRequest('GET', '/api/patient/audit/access-log', { token: smokeState.patientToken, expectedStatus: 200 });

    await apiRequest('POST', '/api/patient/ai/ask', {
        token: smokeState.patientToken,
        expectedStatus: 200,
        body: { question: 'How can I reduce fasting glucose naturally?' },
        timeoutMs: 30000,
    });

    // Doctor core flows
    await apiRequest('GET', '/api/doctor/profile', { token: smokeState.doctorToken, expectedStatus: 200 });
    await apiRequest('PUT', '/api/doctor/profile', {
        token: smokeState.doctorToken,
        expectedStatus: 200,
        body: {
            phone: '9000000012',
            specialization: 'Endocrinology',
            clinicName: 'Smoke Clinic Updated',
        },
    });

    await apiRequest('GET', '/api/doctor/dashboard', { token: smokeState.doctorToken, expectedStatus: 200 });

    const doctorPatients = await apiRequest('GET', '/api/doctor/patients?assignedOnly=true', {
        token: smokeState.doctorToken,
        expectedStatus: 200,
    });
    const doctorPatientsList = Array.isArray(doctorPatients.data) ? doctorPatients.data : [];
    assertCondition(
        doctorPatientsList.some((p) => Number(p._id) === smokeState.patientId),
        'Assigned patient not found in doctor patient list.',
    );

    await apiRequest('GET', `/api/doctor/patients/${smokeState.patientId}`, {
        token: smokeState.doctorToken,
        expectedStatus: 200,
    });
    await apiRequest('GET', `/api/doctor/patients/${smokeState.patientId}/glucose?days=30`, {
        token: smokeState.doctorToken,
        expectedStatus: 200,
    });
    await apiRequest('GET', `/api/doctor/patients/${smokeState.patientId}/health-metrics`, {
        token: smokeState.doctorToken,
        expectedStatus: 200,
    });
    await apiRequest('GET', `/api/doctor/patients/${smokeState.patientId}/reports`, {
        token: smokeState.doctorToken,
        expectedStatus: 200,
    });

    await apiRequest('GET', '/api/doctor/appointments', { token: smokeState.doctorToken, expectedStatus: 200 });
    if (Number.isFinite(smokeState.appointmentId)) {
        await apiRequest('PUT', `/api/doctor/appointments/${smokeState.appointmentId}`, {
            token: smokeState.doctorToken,
            expectedStatus: 200,
            body: { status: 'Completed', notes: 'Smoke confirm' },
        });
    }

    await apiRequest('GET', '/api/doctor/alerts', { token: smokeState.doctorToken, expectedStatus: 200 });

    const doctorReportCreate = await apiRequest('POST', '/api/doctor/reports', {
        token: smokeState.doctorToken,
        expectedStatus: 201,
        body: {
            patient: smokeState.patientId,
            reportName: `Doctor Smoke Report ${suffix}`,
            type: 'Clinical Note',
            date: todayDateKey(0),
            status: 'Pending',
        },
    });
    smokeState.doctorReportId = Number(doctorReportCreate.data && doctorReportCreate.data._id);

    await apiRequest('POST', '/api/doctor/records', {
        token: smokeState.doctorToken,
        expectedStatus: 201,
        body: {
            patient: smokeState.patientId,
            title: `Doctor Smoke Record ${suffix}`,
            type: 'Treatment',
            date: todayDateKey(0),
            description: 'Doctor-side smoke record',
            facility: 'Smoke Hospital',
        },
    });

    // Messaging and notification read flow (patient <-> doctor)
    const threadCreate = await apiRequest('POST', '/api/patient/messages/threads', {
        token: smokeState.patientToken,
        expectedStatus: 201,
        body: {
            doctorId: smokeState.doctorId,
            subject: `Smoke Thread ${suffix}`,
            body: 'Hello doctor, this is a smoke test thread.',
        },
    });
    smokeState.threadId = Number(threadCreate.data && threadCreate.data.id);
    assertCondition(Number.isFinite(smokeState.threadId), 'Thread id missing after patient thread creation.');

    const unreadBeforeRead = await apiRequest('GET', '/api/doctor/messages/unread-count', {
        token: smokeState.doctorToken,
        expectedStatus: 200,
    });
    assertCondition(
        Number(unreadBeforeRead.data && unreadBeforeRead.data.count) >= 1,
        'Doctor unread message count did not increase after patient message.',
    );

    await apiRequest('GET', '/api/doctor/messages/threads', {
        token: smokeState.doctorToken,
        expectedStatus: 200,
    });

    await apiRequest('GET', `/api/doctor/messages/threads/${smokeState.threadId}`, {
        token: smokeState.doctorToken,
        expectedStatus: 200,
    });

    const unreadAfterRead = await apiRequest('GET', '/api/doctor/messages/unread-count', {
        token: smokeState.doctorToken,
        expectedStatus: 200,
    });
    assertCondition(
        Number(unreadAfterRead.data && unreadAfterRead.data.count) === 0,
        'Doctor unread count did not clear after opening thread.',
    );

    await apiRequest('POST', `/api/doctor/messages/threads/${smokeState.threadId}`, {
        token: smokeState.doctorToken,
        expectedStatus: 201,
        body: { body: 'Reply from doctor during smoke test.' },
    });

    const patientThreadsAfterReply = await apiRequest('GET', '/api/patient/messages/threads', {
        token: smokeState.patientToken,
        expectedStatus: 200,
    });
    const patientThreadRows = Array.isArray(patientThreadsAfterReply.data) ? patientThreadsAfterReply.data : [];
    const patientThreadRow = patientThreadRows.find((row) => Number(row.id) === smokeState.threadId);
    assertCondition(
        patientThreadRow && Number(patientThreadRow.unreadCount || 0) >= 1,
        'Patient unread notification count did not increase after doctor reply.',
    );

    await apiRequest('GET', `/api/patient/messages/threads/${smokeState.threadId}`, {
        token: smokeState.patientToken,
        expectedStatus: 200,
    });

    const patientThreadsAfterRead = await apiRequest('GET', '/api/patient/messages/threads', {
        token: smokeState.patientToken,
        expectedStatus: 200,
    });
    const patientThreadRowsAfterRead = Array.isArray(patientThreadsAfterRead.data) ? patientThreadsAfterRead.data : [];
    const patientThreadAfterRead = patientThreadRowsAfterRead.find((row) => Number(row.id) === smokeState.threadId);
    assertCondition(
        patientThreadAfterRead && Number(patientThreadAfterRead.unreadCount || 0) === 0,
        'Patient unread notification count did not clear after reading thread.',
    );

    // Prediction endpoints
    await apiRequest('GET', '/api/predict/model-info', { expectedStatus: 200 });
    await apiRequest('POST', '/api/predict/diabetes', {
        expectedStatus: 200,
        body: {
            age: 49,
            bmi: 29.2,
            glucose_fasting: 138,
            hba1c: 7.1,
            systolic_bp: 132,
            diastolic_bp: 84,
            family_history: 1,
            physical_activity: 2,
        },
    });

    // Cleanup of smoke-created patient report records
    if (Number.isFinite(smokeState.patientReportId)) {
        await apiRequest('DELETE', `/api/patient/reports/${smokeState.patientReportId}`, {
            token: smokeState.patientToken,
            expectedStatus: 200,
        });
    }
    if (Number.isFinite(smokeState.doctorReportId)) {
        await apiRequest('DELETE', `/api/patient/reports/${smokeState.doctorReportId}`, {
            token: smokeState.patientToken,
            expectedStatus: 200,
        });
    }

    console.log('');
    console.log('SMOKE TEST RESULT: PASS');
    console.log(`doctorId=${smokeState.doctorId} patientId=${smokeState.patientId} threadId=${smokeState.threadId}`);
}

run().catch((error) => {
    console.error('');
    console.error('SMOKE TEST RESULT: FAIL');
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
});
