# GlucoCare

GlucoCare is a full-stack diabetes care platform with role-based dashboards, report intelligence, AI guidance, real-time doctor/patient messaging, and automated smoke testing.

This repository contains:
- Static frontend pages for patient, doctor, auth, and landing flows
- Express backend APIs with JWT auth and Socket.IO
- SQLite persistence (via sql.js)
- Trainable AI knowledge module for Q and A and report extraction
- API and browser click smoke test harnesses

## 1) System Architecture

```text
Browser (Patient/Doctor UI)
    |
    | HTTP (REST) + JWT
    v
Express API (backend/server.js)
    |-- Auth routes (/api/auth)
    |-- Patient routes (/api/patient)
    |-- Doctor routes (/api/doctor)
    |-- Predict routes (/api/predict)
    |
    | Socket.IO (real-time messaging status)
    v
Room-based events (user_<id>)

Express API
    |
    | Data access
    v
SQLite DB (backend/glucocare.db by default)

Express API
    |
    | AI calls
    v
AI module (Ai/)
    |-- diabetes Q and A scoring engine
    |-- fallback LLM support
    |-- document parsing and extraction
```

## 2) Repository Layout

```text
Ai/                          AI engine, training, extraction logic
backend/                     Express API, DB schema, services, scripts
  middleware/                auth and validation middleware
  models/                    domain model helpers
  routes/                    auth, patient, doctor, predict routes
  scripts/                   smoke and maintenance scripts
public/                      frontend pages (patient/doctor/auth/home)
README.md                    this document
```

## 3) Runtime and Prerequisites

- Node.js 18+ (project currently runs on modern Node versions)
- npm
- Optional: Python (only if you want to serve static files separately)

## 4) Local Setup

### 4.1 Install backend dependencies

From repository root:

```powershell
cd backend
npm install
```

### 4.2 Configure environment

Create `backend/.env` with your values.

Important variables:

| Variable | Purpose |
|---|---|
| `PORT` | Backend HTTP port (default `5000`) |
| `JWT_SECRET` | Token signing secret |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins |
| `DB_PATH` | Optional DB filename/path (default `glucocare.db`) |
| `OPENAI_API_KEY` | API key for LLM fallback |
| `OPENAI_MODEL` | OpenAI model name |
| `LLM_PROVIDER` | LLM provider (for fallback path) |
| `LLM_FALLBACK_ENABLED` | Enable/disable fallback model usage |
| `LLM_FALLBACK_THRESHOLD` | Confidence threshold to trigger fallback |
| `LLM_TIMEOUT_MS` | Timeout for fallback LLM request |
| `AI_DEBUG_SOURCE` | Include debug source metadata in AI responses |

### 4.3 Start the platform

From `backend/`:

```powershell
npm start
```

The backend serves frontend pages from `public/`.

Open:
- `http://localhost:5000/` for the home page

## 5) NPM Scripts (backend)

| Script | What it does |
|---|---|
| `npm start` | Start backend server |
| `npm run dev` | Start with nodemon |
| `npm run train:ai` | Train AI model from AI knowledge data |
| `npm run train:csv` | Train using CSV-based pipeline |
| `npm run reports:reprocess` | Reprocess stored report extractions |
| `npm run ocr:test` | Run OCR test script on test folder |
| `npm run smoke:test` | Full API smoke test |

Additional command (not yet in package scripts):

```powershell
node scripts/ui-click-smoke.js
```

This runs the browser UI click smoke for patient and doctor visible behaviors.

## 6) End-to-End Workflow

### 6.1 Authentication and role bootstrapping

1. User registers or logs in.
2. Backend issues JWT token.
3. Frontend stores token and role in session storage.
4. Dashboard bootstrap validates token via `/api/auth/me`.
5. Role-gated routes load patient or doctor experience.

### 6.2 Patient workflow

1. Patient logs glucose and health metrics.
2. Alerts are evaluated from thresholds.
3. Dashboard and trends update from stored readings.
4. Patient can manage medications, meals, activities, and goals.
5. Patient can message doctor in real time.

### 6.3 Report ingestion workflow

1. Patient uploads report content (`/api/patient/reports/upload`) or creates report record.
2. Document parser reads text (PDF, DOCX, TXT, image OCR paths).
3. AI extraction builds structured values (HbA1c, glucose, BP, meds, diagnoses).
4. `review` block classifies report severity (`bad`, `caution`, `not-bad`).
5. Parsed metrics feed downstream dashboard/trend calculations.
6. Patient can apply corrections (`/reports/:id/corrections`).

### 6.4 Doctor workflow

1. Doctor views assigned patients and summaries.
2. Doctor reviews glucose, health metrics, reports, and alerts.
3. Doctor manages appointments and notes.
4. Doctor exchanges messages with patient and unread counts are tracked.

### 6.5 Messaging and notification workflow

1. Threads/messages are created through patient or doctor endpoints.
2. New messages are pushed with Socket.IO to recipient room (`user_<id>`).
3. Recipient emits `message_delivered` and `messages_read`.
4. Backend updates message `delivered_at` and `read_at`.
5. Sender UI receives ack events and updates message status icons.
6. Badge counts clear when thread is opened/read.

### 6.6 Predict workflow

1. Client submits diabetes predictor inputs.
2. Backend runs model logic and returns risk response.
3. Client can also query model metadata endpoint.

## 7) API Map

### 7.1 Auth (`/api/auth`)

- `POST /register`
- `POST /login`
- `GET /me`

### 7.2 Predict (`/api/predict`)

- `GET /model-info`
- `POST /diabetes`

### 7.3 Doctor (`/api/doctor`)

- Patients
  - `GET /patients`
  - `GET /patients/:patientId`
  - `GET /patients/:patientId/glucose`
  - `GET /patients/:patientId/health-metrics`
  - `GET /patients/:patientId/reports`
  - `POST /patients/assign`
- Appointments
  - `GET /appointments`
  - `POST /appointments`
  - `PUT /appointments/:id`
- Clinical authoring
  - `POST /reports`
  - `POST /records`
- Alerts and dashboard
  - `GET /alerts`
  - `GET /dashboard`
- Profile
  - `GET /profile`
  - `PUT /profile`
- Messaging
  - `GET /messages/threads`
  - `GET /messages/threads/:id`
  - `POST /messages/threads/:id`
  - `GET /messages/unread-count`

### 7.4 Patient (`/api/patient`)

- Profile and dashboard
  - `GET /profile`
  - `PUT /profile`
  - `GET /dashboard`
- Glucose
  - `GET /glucose`
  - `POST /glucose`
  - `GET /glucose/trends`
  - `GET /glucose/time-in-range`
- Alerts
  - `GET /alerts/settings`
  - `POST /alerts/settings`
  - `GET /alerts`
  - `PATCH /alerts/:id/read`
- Health metrics
  - `GET /health-metrics`
  - `POST /health-metrics`
- Doctors and appointments
  - `GET /doctors`
  - `GET /appointments`
  - `POST /appointments`
  - `GET /appointments/upcoming`
  - `GET /appointments/:id/checklist`
  - `POST /appointments/:id/checklist`
- Reports and records
  - `GET /reports`
  - `POST /reports`
  - `POST /reports/upload`
  - `GET /reports/extraction-metrics`
  - `GET /reports/:id`
  - `DELETE /reports/:id`
  - `GET /reports/:id/corrections`
  - `POST /reports/:id/corrections`
  - `GET /records`
  - `POST /records`
- Diabetes score
  - `GET /score/today`
  - `GET /score/history`
- Medications and adherence
  - `GET /medications`
  - `POST /medications`
  - `PATCH /medications/:id`
  - `POST /medications/:id/log`
  - `GET /medications/adherence`
- Lifestyle and correlations
  - `POST /meals`
  - `GET /meals`
  - `POST /activities`
  - `GET /activities`
  - `GET /correlations/glucose-lifestyle`
  - `GET /biometrics/latest`
  - `GET /biometrics/trends`
- Messaging
  - `GET /messages/threads`
  - `POST /messages/threads`
  - `GET /messages/threads/:id`
  - `POST /messages/threads/:id`
- Education and AI
  - `GET /education/recommendations`
  - `POST /education/:id/feedback`
  - `POST /ai/ask`
  - `POST /ai/extract-document`
- Safety
  - `GET /safety/profile`
  - `PATCH /safety/profile`
  - `POST /safety/trigger`
- Gamification
  - `GET /gamification/progress`
  - `POST /gamification/goals`
  - `PATCH /gamification/goals/:id`
- Data sharing/export/privacy/security
  - `POST /exports`
  - `GET /exports/:id`
  - `POST /shares`
  - `PATCH /shares/:id/revoke`
  - `GET /privacy/settings`
  - `PATCH /privacy/settings`
  - `GET /security/sessions`
  - `DELETE /security/sessions/:id`
  - `GET /audit/access-log`

## 8) Database Schema (high level)

Key SQLite tables include:

- Core identity and relations
  - `users`, `patient_doctors`, `user_sessions`
- Clinical data
  - `glucose_readings`, `health_metrics`, `reports`, `report_corrections`, `medical_records`, `appointments`
- Alerts and scoring
  - `alert_settings`, `alerts`, `diabetes_scores`
- Medication and lifestyle
  - `medications`, `medication_logs`, `refill_reminders`, `meal_logs`, `activity_logs`
- Messaging
  - `message_threads`, `messages`, `appointment_checklist`
- Education and safety
  - `education_content`, `education_recommendations`, `education_feedback`, `safety_profiles`, `safety_events`
- Motivation and governance
  - `goals`, `streaks`, `badges`, `patient_badges`, `exports`, `data_shares`, `privacy_settings`, `access_audit_logs`

## 9) QA and Validation Workflow

### 9.1 API smoke test

`backend/scripts/smoke-test-api.js` validates broad API behavior across auth, patient, doctor, messaging, notifications, and predict endpoints.

Run:

```powershell
cd backend
npm run smoke:test
```

Tip: If auth rate limiting (`429`) occurs after repeated runs, run against an isolated port:

```powershell
# Terminal 1
$env:PORT='5001'; node server.js

# Terminal 2
$env:SMOKE_BASE_URL='http://localhost:5001'; npm run smoke:test
```

### 9.2 Browser UI click smoke

`backend/scripts/ui-click-smoke.js` validates visible UI behavior for:
- Patient: notification badge, notification panel open/close, thread open, unread clear
- Doctor: message badge, chat panel open/close, unread clear, alerts modal open/close

Run:

```powershell
# Terminal 1
$env:PORT='5002'; node backend/server.js

# Terminal 2
cd backend
$env:UI_SMOKE_BASE_URL='http://localhost:5002'; node scripts/ui-click-smoke.js
```

Expected output ends with:
- `UI CLICK SMOKE RESULT: PASS`

## 10) Security and Operational Notes

- `helmet`, `hpp`, `compression`, strict CORS, and JSON content validation are enabled.
- Auth endpoints have strict rate limiting (brute-force protection).
- API endpoints have general per-IP rate limiting.
- Socket events are also rate limited per connection window.
- JWT is required for both REST and socket auth.

## 11) AI Module Notes

The AI module in `Ai/` provides:
- Knowledge-driven diabetes Q and A
- Optional fallback LLM when local confidence is low
- Document extraction and report review classification
- India geo-aware dietary risk knowledge expansion

Training commands are executed from backend scripts (`train:ai`, `train:csv`).

## 12) Clinical Safety Disclaimer

GlucoCare provides decision support and workflow automation. It does not replace professional medical diagnosis or treatment. Users should consult licensed clinicians for medical decisions.
