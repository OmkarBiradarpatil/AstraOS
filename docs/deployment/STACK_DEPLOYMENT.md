# AstraOS Stack Deployment Guide

This guide describes the production environment setup, configuration parameters, and launch verification checks for the AstraOS platform.

## Architecture & Services

The active deployment target uses a decoupled clients/services architecture:
- **Frontend Entry**: `apps/web/index.html` (Vite, React 19 UMD shell, Clerk Auth)
- **Backend Entry**: `backend/src/server.ts` (Express, Mongoose/MongoDB Atlas, Upstash Redis, Cloudinary, OpenRouter)

Supabase assets in this repository are for legacy fallback and reference only.

---

## Frontend Configuration (Vercel)

Deploy `apps/web/` to Vercel with the following environment variables:

| Variable | Description | Recommended Value |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | Express API endpoints URL | `https://<your-render-app>.onrender.com/api` |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk user authentication key | `<clerk-publishable-key>` |
| `VITE_ASTRAOS_API_DEBUG` | Enable verbose client side console logs | `false` |

### Legacy Fallbacks (Optional)
If legacy Supabase clients are active in fallback modes:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### Build Command
```bash
# Build Vite Client
npm run build
```

---

## Backend Configuration (Render)

Deploy `backend/` to Render using the Web Service specification. Configure the following environment variables:

### Core Configuration
- `NODE_ENV=production`
- `WEB_ORIGIN=https://<your-vercel-app>.vercel.app`
- `ASTRAOS_ALLOW_DEV_AUTH=false`
- `ASTRAOS_JSON_LIMIT=1mb`
- `ASTRAOS_TRUST_PROXY=true`

### Security & Tokens
- `ASTRAOS_OPS_TOKEN`: Protects operations endpoints. Production rejects tokens shorter than 32 characters.
- `ASTRAOS_REQUIRED_PROVIDERS`: CSV list of essential providers before marking healthy.
  Default: `clerk,mongo,cloudinary,redis,openrouter`
  *(Note: `reminders` delivery is optional. Do not add `reminders` until live smtp/schedulers are configured.)*

### Clerk Authentication
- `CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `CLERK_WEBHOOK_SECRET` *(reserved for user sync webhook checks)*

### Database (MongoDB Atlas)
- `MONGODB_URI`
- `MONGODB_DB_NAME=astraos`
- `MONGODB_MAX_POOL_SIZE=10`
- `MONGODB_MIN_POOL_SIZE=0`
- `MONGODB_SERVER_SELECTION_TIMEOUT_MS=5000`
- `MONGODB_SOCKET_TIMEOUT_MS=30000`

### Cloud Cache (Upstash Redis)
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

### Storage (Cloudinary)
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

### Artificial Intelligence (OpenRouter)
- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL=openrouter/free`
- `OPENROUTER_TIMEOUT_MS=8000`
- `OPENROUTER_CACHE_SECONDS=300`
- `OPENROUTER_FAIL_CLOSED=false`

### Build & Start Commands
- **Build**: `npm run backend:build`
- **Start**: `npm start`

---

## Database Index Syncing

Mongoose automatically disables `autoIndex` in production. Ensure MongoDB indexes are explicitly synced after Atlas connections are verified:
```bash
npm --prefix backend run db:sync-indexes
```

---

## Health Checks

Liveness, readiness, and operator visibility endpoints are exposed by the Express API:
- **Liveness Probe**: `GET /api/health`
- **Readiness Probe**: `GET /api/ready` (Used by Render liveness gate)
- **Detailed Operations Health**: `GET /api/system/health` (Requires Header `x-astra-ops-token` matching `ASTRAOS_OPS_TOKEN`)

---

## Release Verification & Staging Smoke

Always run complete verification sequences prior to releasing candidates to production.

### 1. Local Code verification
Run tests, linters, and compilers:
```bash
npm run bootstrap
npm run verify:release
```
For changes affecting responsive layout, games, FocusTube queues, or navigation, run:
```bash
npm run verify:release:e2e
```

### 2. Live Provider Smoke Tests
Execute strict provider smoke checks against the staging deployment. 
Configure the environment variables and run:
```bash
ASTRAOS_SMOKE_API_BASE_URL=https://<your-render-service>.onrender.com/api \
ASTRAOS_SMOKE_WEB_URL=https://<your-vercel-app>.vercel.app \
ASTRAOS_SMOKE_TARGET_ENV=staging \
ASTRAOS_SMOKE_CLERK_TOKEN=<dedicated-smoke-user-jwt> \
ASTRAOS_SMOKE_OPS_TOKEN=<ops-token> \
ASTRAOS_SMOKE_REQUIRE_READY=1 \
ASTRAOS_SMOKE_REQUIRE_OPENROUTER=1 \
ASTRAOS_SMOKE_FULL_CLOUDINARY=1 \
ASTRAOS_SMOKE_CORS_DENY_ORIGIN=https://blocked-origin.example \
ASTRAOS_SMOKE_UPLOAD_FILE=./test-artifacts/smoke-upload.txt \
ASTRAOS_SMOKE_UPLOAD_CONTENT_TYPE=text/plain \
ASTRAOS_SMOKE_REPORT_FILE=./test-artifacts/provider-smoke-report.json \
npm run smoke:providers
```
The command outputs a structured JSON report specifying target details, test verdicts, latency Snapshots for each integration, and reminder dispatch status.

---

## Release Gate Checklist

Before making a public deploy, check off the following requirements:
- [ ] Clerk organization project matches target env.
- [ ] MongoDB Atlas schema collections and synced indexes are initialized.
- [ ] Upstash Redis rate limit counters are tested.
- [ ] Cloudinary upload signatures and folders are isolated.
- [ ] Staging API liveness `/api/ready` returns `ready`.
- [ ] CI pipeline passes successfully in GitHub Actions.
- [ ] Staging provider smoke commands output `PASS`.
