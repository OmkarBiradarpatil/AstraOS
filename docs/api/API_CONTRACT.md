# AstraOS Backend API Contract

Date: 2026-06-08

This contract is source-derived from `backend/src/api/app.ts`, `backend/src/api/routes.ts`, controllers, validators, and services.

## Global Contract

- Base path: `/api`.
- Response envelope:
  - success: `{ ok: true, data, requestId }`
  - error: `{ ok: false, error: { code, message, details? }, requestId }`
- API responses set `Cache-Control: no-store`.
- Request IDs are returned in `x-request-id` and response body `requestId`.
- Production requires `WEB_ORIGIN`; CORS allows configured origins only.
- Browser preflight allows `x-idempotency-key`, and browser responses expose `x-idempotency-status` and `x-idempotency-replayed`.
- Production readiness defaults to `clerk,mongo,cloudinary,redis,openrouter`.
- Protected routes use Clerk when `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY` are configured.
- Development auth fallback is allowed only when `ASTRAOS_ALLOW_DEV_AUTH=true` and `NODE_ENV !== production`.
- `x-astra-dev-email` and `x-astra-dev-name` are trusted only inside explicit non-production dev auth; Clerk-backed auth uses Clerk/session claims as the identity source.
- Authenticated writes are owner-scoped through `req.astraAuth.userId`.
- Create-style protected `POST` routes accept optional `x-idempotency-key` headers. Safe keys are 8-160 characters using letters, numbers, `.`, `_`, `:`, and `-`. Matching retries replay the successful response; mismatched body reuse returns `IDEMPOTENCY_KEY_CONFLICT`. `x-idempotency-status` can be `miss`, `stored`, `hit`, or `bypass`.

## Public Routes

| Method | Path | Auth | Rate limit | Controller | Contract |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/api/health` | none | none | `healthController` | Liveness only. Does not prove provider readiness. |
| `GET` | `/api/ready` | none | none | `readinessController` | Returns `200` with `status=ready` or `503` with `status=not-ready`. Includes provider health/blockers. |
| `GET` | `/api/quiz/daily` | none | `120/hour` | `dailyQuizController` | Returns daily current-affairs quiz, default `region=IN`. |

## Ops Routes

| Method | Path | Auth | Rate limit | Controller | Contract |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/api/system/health` | `x-astra-ops-token` when configured | none | `systemHealthController` | Detailed provider health. Production must set `ASTRAOS_OPS_TOKEN` to at least 32 characters. |

## User Routes

| Method | Path | Auth | Body | Controller | Contract |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/api/users/me` | required | none | `getMeController` | Returns auth context and synced Mongo profile when Mongo is configured. |
| `PATCH` | `/api/users/me` | required | `updateUserProfileSchema` | `updateMeController` | Updates display `name` only. Clerk remains the source of truth for email and role. |

## Owned CRUD Routes

All owned CRUD resources enforce `ownerId=req.astraAuth.userId` and `deletedAt=null` filters. List endpoints support optional `cursor` and `limit`; invalid cursors return `INVALID_CURSOR`, invalid limits return `INVALID_LIMIT`, and valid limits must be integers from `1..200`. Pagination cursors are stable composite cursors derived from `updatedAt` and `_id`.

| Resource | Methods | Path | Create schema | Update schema | Notes |
| --- | --- | --- | --- | --- | --- |
| tasks | `GET`, `POST`, `PATCH`, `DELETE` | `/api/tasks`, `/api/tasks/:id` | `taskSchema` | `taskUpdateSchema` | Create defaults status/priority/tags/estimate. |
| bookmarks | `GET`, `POST`, `PATCH`, `DELETE` | `/api/bookmarks`, `/api/bookmarks/:id` | `bookmarkSchema` | `bookmarkUpdateSchema` | URL must be valid. |
| deadlines | `GET`, `POST`, `PATCH`, `DELETE` | `/api/deadlines`, `/api/deadlines/:id` | `deadlineSchema` | `deadlineUpdateSchema` | Dates are coerced; `dueTime` is `HH:mm`. |
| health logs | `GET`, `POST`, `PATCH`, `DELETE` | `/api/health-logs`, `/api/health-logs/:id` | `healthLogSchema` | `healthLogUpdateSchema` | Log types: water, sleep, workout, screen, checkin, custom. |
| entertainment data | `GET`, `POST`, `PATCH`, `DELETE` | `/api/entertainment-data`, `/api/entertainment-data/:id` | `entertainmentDataSchema` | `entertainmentDataUpdateSchema` | Data types: anime, bucket, watchtime, challenge, game, preference. |

Update routes require at least one field. `:id` params must be 24-character Mongo ObjectId strings.

## Settings Routes

| Method | Path | Auth | Body | Controller | Contract |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/api/settings` | required | none | `getSettingsController` | Returns `{ settings, cache }`; settings may be `null`. |
| `PATCH` | `/api/settings` | required | `settingsSchema` | `updateSettingsController` | Upserts owner settings. Only `theme`, `profile`, `preferences`, and `flags` are accepted. |

## AI Routes

| Method | Path | Auth | Rate limit | Body | Controller | Contract |
| --- | --- | --- | --- | --- | --- |
| `POST` | `/api/assistant/messages` | required | `30/hour` | `assistantMessageSchema` | Returns assistant reply, provider, model, usage, cache, and latency. Uses OpenRouter when configured and local fallback when fail-open. |

## Upload And AI Vault Routes

| Method | Path | Auth | Rate limit | Body | Controller | Contract |
| --- | --- | --- | --- | --- | --- |
| `POST` | `/api/uploads/signature` | required | `60/hour` | `uploadSignatureSchema` | `uploadSignatureController` returns signed Cloudinary upload params scoped to `astraos/{userId}/ai-vault...`. |
| `GET` | `/api/ai-vault/documents` | required | none | none | `listAiVaultDocumentsController` lists owner documents with pagination. |
| `POST` | `/api/ai-vault/documents` | required | `120/hour` | `aiVaultDocumentSchema` | `registerAiVaultDocumentController` registers note/upload/url metadata. Uploads require Cloudinary metadata verification. |
| `DELETE` | `/api/ai-vault/documents/:id` | required | none | none | `deleteAiVaultDocumentController` soft-deletes owner document, deletes chunks, and deletes provider asset when present. |
| `POST` | `/api/ai-vault/documents/:id/chunks` | required | `60/hour` | `aiVaultIngestTextSchema` | `ingestAiVaultTextController` normalizes text, chunks it, replaces prior chunks, and marks document ready. |
| `GET` | `/api/ai-vault/storage/assets` | required | none | none | `listAiVaultCloudinaryAssetsController` lists owner-scoped Cloudinary assets. |

## Non-Goals In Current Contract

- No vector database, embeddings, or RAG contract yet.
- No public admin/teacher/parent role-specific route contract yet.
- No direct `GET /:resource/:id` routes for owned CRUD resources.
- Strong frontend CSP remains future work because the preserved monolith still contains inline scripts/styles.
