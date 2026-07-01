# MongoDB Index Plan

Create indexes during backend model rollout:

```text
tasks: { ownerId: 1, status: 1, dueDate: 1 }
tasks: { ownerId: 1, priority: 1, status: 1 }
aiVaultDocuments: { ownerId: 1, createdAt: -1 }
aiVaultDocuments: { ownerId: 1, contentHash: 1 } unique
aiVaultDocuments: { ownerId: 1, title: "text", summary: "text" }
assistantMessages: { ownerId: 1, conversationId: 1, createdAt: 1 }
auditEvents: { ownerId: 1, createdAt: -1 }
reminders: { status: 1, remindAt: 1 }
```

