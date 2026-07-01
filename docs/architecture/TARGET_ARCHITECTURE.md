# AstraOS Target Architecture

Date: 2026-06-07

## Target Shape

```text
AstraOS/
  apps/
    web/
    admin/
    future-mobile/
  backend/
    api/
    controllers/
    services/
    middleware/
    jobs/
    models/
    validators/
    utils/
  packages/
    shared-ui/
    shared-types/
    shared-utils/
  docs/
    architecture/
    deployment/
    audits/
  infrastructure/
    vercel/
    render/
    mongodb/
    redis/
    cloudinary/
  tests/
    unit/
    integration/
    e2e/
```

## Migration Principle

The preserved monolithic UI remains the source of visual truth until every replacement feature has:

- matching browser behavior
- matching visual screenshots
- typed API client coverage
- backend ownership checks
- regression tests

## Current Delta

- `apps/web` exists and remains active.
- `backend` now exists as the Express target-stack API scaffold.
- `packages/shared-types` and `packages/shared-utils` now exist.
- `apps/admin`, `apps/future-mobile`, `packages/shared-ui`, and cross-app `tests` remain future scaffolds.

