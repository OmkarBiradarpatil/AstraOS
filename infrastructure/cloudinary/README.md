# Cloudinary Plan

The backend owns upload signatures.

Upload folder:

```text
astraos/{clerkUserId}/{featureFolder}
```

Every upload signature should include:

- owner id in context
- content type
- byte size
- requested resource type
- request id in logs

Never expose `CLOUDINARY_API_SECRET` to the browser.

