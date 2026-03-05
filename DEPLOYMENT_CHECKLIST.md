# GlucoCare+ Deployment Checklist

## 1) Environment Variables

- Set `JWT_SECRET` to a strong random value in all environments.
- Ensure `NODE_ENV=production` in deployment.
- If moving from SQLite local storage, set `DATABASE_URL` for the target SQL database.

## 2) Frontend (Vercel)

- Connect repository to Vercel.
- Set project root to this Next.js app.
- Add environment variables (`JWT_SECRET`, database values if needed).
- Deploy and verify routes:
  - `/login`
  - `/register`
  - `/dashboard/patient`
  - `/dashboard/doctor`

## 3) Auth and Security Verification

- Confirm auth cookie is set after login/register:
  - `gc_auth_token` (httpOnly)
  - `gc_user_role`
- Confirm middleware redirects unauthenticated users from `/dashboard/*` to `/login`.
- Confirm role mismatch redirects:
  - Patient cannot access doctor dashboard.
  - Doctor cannot access patient dashboard.

## 4) API Access Control Checks

- Patient APIs reject doctor tokens.
- Doctor APIs reject patient tokens.
- Doctor can view only assigned patients.
- Prescription creation fails for unassigned patient.

## 5) Data Integrity Checks

- Register patient + doctor users.
- Assign patient to doctor.
- Add readings and verify:
  - Risk level updates.
  - Alerts are created for abnormal patterns.
- Add prescription and verify retrieval in doctor and patient detail views.

## 6) Production Hardening Recommendations

- Rotate `JWT_SECRET` periodically.
- Add rate limiting for auth endpoints.
- Add centralized request logging + audit trail for clinical actions.
- Add periodic DB backup strategy for local/clinic deployments.