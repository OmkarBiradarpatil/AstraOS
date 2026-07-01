# Render Deployment Notes

Render uses the root `render.yaml` file.

Service:

- name: `astraos-api`
- root directory: `backend`
- health path: `/api/ready`

Production must set all secrets in Render dashboard. Do not commit `.env`.

`/api/health` is liveness only. Render should use `/api/ready` so deployments fail when required providers are not configured or unhealthy.

The blueprint should stay aligned with the backend environment contract: dev auth disabled, JSON limit set, trust proxy enabled, Mongo pool/timeouts configured, and OpenRouter timeout/cache controls present. Backend tests include a Render blueprint contract check for these keys.
