/* eslint-disable no-console */
const BASE = (process.env.SMOKE_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '');

function safe(value) {
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

async function apiRequest(method, path, options = {}) {
    const expected = Array.isArray(options.expectedStatus)
        ? options.expectedStatus
        : [options.expectedStatus || 200];

    const headers = {
        Accept: 'application/json',
    };

    if (options.token) {
        headers.Authorization = `Bearer ${options.token}`;
    }

    let body;
    if (options.body !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(options.body);
    }

    const response = await fetch(`${BASE}${path}`, {
        method,
        headers,
        body,
    });

    const text = await response.text();
    let data;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = text;
    }

    if (!expected.includes(response.status)) {
        throw new Error(`${method} ${path} expected ${expected.join('/')} but got ${response.status}. Response: ${safe(data)}`);
    }

    console.log(`PASS ${method} ${path} -> ${response.status}`);
    return { status: response.status, data };
}

async function run() {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const password = 'TargetedPass123!';

    const doctorRegister = await apiRequest('POST', '/api/auth/register', {
        expectedStatus: 201,
        body: {
            fullName: `Target Doctor ${suffix}`,
            email: `target.doctor.${suffix}@example.com`,
            phone: '9333333331',
            password,
            role: 'doctor',
            medicalRegistrationNumber: `TREG-${suffix}`,
            specialization: 'Diabetology',
            clinicName: 'Targeted Smoke Clinic',
        },
    });

    const patientRegister = await apiRequest('POST', '/api/auth/register', {
        expectedStatus: 201,
        body: {
            fullName: `Target Patient ${suffix}`,
            email: `target.patient.${suffix}@example.com`,
            phone: '9333333332',
            password,
            role: 'patient',
        },
    });

    const doctorToken = doctorRegister.data && doctorRegister.data.token;
    const patientToken = patientRegister.data && patientRegister.data.token;
    const patientId = Number(patientRegister.data && patientRegister.data.user && patientRegister.data.user._id);

    await apiRequest('POST', '/api/doctor/patients/assign', {
        token: doctorToken,
        expectedStatus: 201,
        body: { patientId },
    });

    await apiRequest('GET', '/api/doctor/patients', {
        token: doctorToken,
        expectedStatus: 200,
    });

    await apiRequest('POST', '/api/doctor/appointments', {
        token: doctorToken,
        expectedStatus: 201,
        body: {
            patient: patientId,
            date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
            time: '11:00',
            reason: 'Targeted appointment create',
        },
    });

    const medication = await apiRequest('POST', '/api/patient/medications', {
        token: patientToken,
        expectedStatus: 201,
        body: {
            name: 'Glimipride',
            dosage: '1mg',
            frequency: 'OD',
            timing: ['09:00'],
            active: true,
        },
    });

    const medicationId = Number(medication.data && medication.data.id);

    await apiRequest('PATCH', `/api/patient/medications/${medicationId}`, {
        token: patientToken,
        expectedStatus: 200,
        body: {
            dosage: '2mg',
            active: true,
            notes: 'updated by targeted smoke',
        },
    });

    await apiRequest('GET', '/api/patient/diet/intake/estimate?text=2%20idli%20sambar', {
        token: patientToken,
        expectedStatus: 200,
    });

    await apiRequest('POST', '/api/patient/diet/intake', {
        token: patientToken,
        expectedStatus: 201,
        body: {
            mealSlot: 'breakfast',
            intakeText: '2 idli with sambar',
            sugarTiming: 'after',
            carbsG: 32,
            calories: 280,
        },
    });

    await apiRequest('GET', '/api/patient/diet/intake?range=7d', {
        token: patientToken,
        expectedStatus: 200,
    });

    await apiRequest('GET', '/api/patient/diet/report?range=7d', {
        token: patientToken,
        expectedStatus: 200,
    });

    const extraction = await apiRequest('POST', '/api/patient/ai/extract-document', {
        token: patientToken,
        expectedStatus: 200,
        body: {
            fileName: 'targeted-lab.txt',
            fileType: 'text/plain',
            text: [
                `Patient Name: Target Patient ${suffix}`,
                'HbA1c: 7.4 %',
                'Fasting Glucose: 132 mg/dL',
                'Blood Pressure: 130/85 mmHg',
                `Date: ${new Date().toISOString().slice(0, 10)}`,
            ].join('\n'),
        },
    });

    const upload = await apiRequest('POST', '/api/patient/reports/upload', {
        token: patientToken,
        expectedStatus: 201,
        body: {
            reportName: `Targeted Upload ${suffix}`,
            type: 'Lab Report',
            date: new Date().toISOString().slice(0, 10),
            parsed: extraction.data && extraction.data.result ? extraction.data.result : null,
            fileType: 'text/plain',
            fileUrl: 'local://targeted-lab.txt',
        },
    });

    const reportId = Number(upload.data && (upload.data._id || upload.data.id));

    await apiRequest('GET', `/api/patient/reports/${reportId}/corrections`, {
        token: patientToken,
        expectedStatus: 200,
    });

    await apiRequest('POST', `/api/patient/reports/${reportId}/corrections`, {
        token: patientToken,
        expectedStatus: 200,
        body: {
            fieldKey: 'hba1c',
            value: 6.9,
            note: 'manual correction by targeted smoke',
        },
    });

    await apiRequest('GET', `/api/patient/reports/${reportId}/corrections`, {
        token: patientToken,
        expectedStatus: 200,
    });

    const recommendations = await apiRequest('GET', '/api/patient/education/recommendations', {
        token: patientToken,
        expectedStatus: 200,
    });

    if (Array.isArray(recommendations.data) && recommendations.data.length > 0) {
        const first = recommendations.data[0];
        const contentId = Number(first.content_id || first.contentId);
        if (Number.isFinite(contentId)) {
            await apiRequest('POST', `/api/patient/education/${contentId}/feedback`, {
                token: patientToken,
                expectedStatus: 201,
                body: {
                    helpfulScore: 4.5,
                    comment: 'useful',
                },
            });
        }
    } else {
        const probe = await apiRequest('POST', '/api/patient/education/1/feedback', {
            token: patientToken,
            expectedStatus: [201, 500],
            body: {
                helpfulScore: 4,
                comment: 'probe',
            },
        });
        console.log(`INFO education feedback probe status=${probe.status}`);
    }

    await apiRequest('DELETE', `/api/patient/reports/${reportId}`, {
        token: patientToken,
        expectedStatus: 200,
    });

    console.log('TARGETED SMOKE RESULT: PASS');
}

run().catch((err) => {
    console.error('TARGETED SMOKE RESULT: FAIL');
    console.error(err && err.stack ? err.stack : err);
    process.exitCode = 1;
});
