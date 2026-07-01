# End-to-End Tests

The active Playwright harness lives in `apps/web/tests/e2e` because the browser
dependencies are installed with the Vite web app.

Run from the repository root:

```bash
npm run test:e2e:install
npm run test:e2e
```

The preserved-shell suite verifies critical page switching, dashboard workflows,
FocusTube queue/playback wiring, responsive overflow, screenshots, and an
accessibility smoke snapshot.
