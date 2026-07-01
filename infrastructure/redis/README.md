# Upstash Redis Plan

Redis is used by the backend only.

Primary keys:

```text
rl:ai:{userId}:{bucket}
rl:upload:{userId}:{bucket}
cache:dashboard:{userId}:{hash}
cache:ai:{model}:{promptHash}
lock:reminders:send_due
```

Local development uses an in-memory fallback if Upstash env vars are missing.

