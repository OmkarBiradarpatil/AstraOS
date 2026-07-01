# Vercel Deployment Notes

Current root `vercel.json` deploys the frontend from `apps/web`.

Required frontend env after backend is live:

```text
VITE_API_BASE_URL=https://<render-service>.onrender.com/api
VITE_CLERK_PUBLISHABLE_KEY=
```

The preserved `apps/web/index.html` remains the active UI entry until route-by-route migration is complete.

