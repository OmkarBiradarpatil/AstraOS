# AstraOS Database Documentation

Date: 2026-06-07
Phase: 7 - Database Design
Backend target: Supabase Postgres, Auth, Storage, RLS, Edge Functions

## Source Files

- `supabase/migrations/202606070001_initial_schema.sql`
- `supabase/config.toml`
- `supabase/functions/*`

## Design Principles

- Every durable user-owned record has an owner.
- Supabase Auth is the identity source.
- Row Level Security is enabled on every user-owned table.
- Storage objects are private and scoped to the authenticated user's folder.
- JSONB is used only for audit metadata, import payloads, and game metadata.
- Feature data is normalized into tables instead of stored as browser-only blobs.

## Core Identity

### `profiles`

Purpose:

- Public/private profile data for the signed-in user.

Primary key:

- `id`, references `auth.users(id)`

Important constraints:

- `role` must be `student`, `creator`, `operator`, or `founder`.
- `display_name` is limited to 120 characters.

RLS:

- Users can manage only their own profile where `id = auth.uid()`.

### `user_settings`

Purpose:

- Theme, density, accent, notification email, and migration state.

Primary key:

- `user_id`, references `auth.users(id)`

RLS:

- Users can manage only their own settings.

## Dashboard And Planning

### `tasks`

Purpose:

- Focus Engine task records.

Relationships:

- `user_id -> auth.users(id)`

Constraints:

- `status`: `todo`, `doing`, `done`
- `priority`: `low`, `medium`, `high`, `critical`
- `estimate_minutes`: 5 to 720
- `title`: 2 to 160 characters

Indexes:

- `tasks_user_status_idx`
- `tasks_user_due_idx`

### `deadlines`

Purpose:

- Dashboard deadline records.
- Current Mongo implementation also stores reminder delivery state on the deadline record.

Relationships:

- `user_id -> auth.users(id)`

Constraints:

- `due_date` is required.
- `remind_before`: `1h`, `3h`, `6h`, `12h`, `1d`, `2d`, `3d`
- Mongo `reminderStatus`: `none`, `scheduled`, `sent`, `failed`
- Mongo validation sets `reminderStatus = scheduled` when `reminderEmail` and `remindAt` are present.
- Mongo validation resets reminder attempt metadata when no reminder target is present.

Indexes:

- `deadlines_user_due_idx`
- Mongo: `{ ownerId: 1, reminderStatus: 1, remindAt: 1 }` for reminder dispatch scans.

Mongo reminder metadata:

- `reminderEmail`
- `remindBefore`
- `remindAt`
- `reminderStatus`
- `reminderLastAttemptAt`
- `reminderSentAt`
- `reminderFailureReason`

### `deadline_reminders`

Purpose:

- Scheduled email reminder metadata for deadlines.

Relationships:

- `user_id -> auth.users(id)`
- `deadline_id -> deadlines(id)`

Constraints:

- `recipient_email` must match an email pattern.
- `status`: `pending`, `queued`, `sent`, `failed`, `skipped`

Indexes:

- `deadline_reminders_due_idx`

### `reminder_deliveries`

Purpose:

- Delivery attempt audit trail for email reminders.

Relationships:

- `user_id -> auth.users(id)`
- `reminder_id -> deadline_reminders(id)`

### `bookmarks`

Purpose:

- Dashboard saved links.

Indexes:

- `bookmarks_user_category_idx`

### `manual_reminders`

Purpose:

- User-created manual reminders for dashboard workflows.

Constraints:

- `type`: `deadline`, `habit`, `health`, `custom`
- `status`: `pending`, `queued`, `sent`, `failed`, `skipped`

## FocusTube

### `focus_sessions`

Purpose:

- YouTube focus session records.

Constraints:

- `video_id` must be an 11-character YouTube ID.
- `minutes_focused`: 1 to 1000

Indexes:

- `focus_sessions_user_started_idx`

### `focus_notes`

Purpose:

- Timed notes attached to focus sessions.

Relationships:

- `session_id -> focus_sessions(id)`
- Composite ownership is enforced by storing `user_id` and RLS.

## Health

### `health_water_logs`

Purpose:

- Daily hydration logs.

Constraints:

- `amount_ml`: 1 to 6000

Index:

- `health_water_user_date_idx`

### `health_sleep_logs`

Purpose:

- Sleep records.

Constraints:

- `hours`: 0 to 24
- `quality`: `poor`, `fair`, `good`, `excellent`

Index:

- `health_sleep_user_date_idx`

### `health_workout_logs`

Purpose:

- Workout records.

Constraints:

- `category`: `cardio`, `strength`, `mobility`, `sport`, `other`
- `duration_minutes`: 1 to 1440
- `calories`: 0 to 10000
- `intensity`: `low`, `medium`, `high`

Index:

- `health_workout_user_date_idx`

### `health_screen_logs`

Purpose:

- Screen-time logs.

Constraints:

- `hours`: 0 to 24
- `limit_hours`: 1 to 24

Index:

- `health_screen_user_date_idx`

## Vault

### `vault_sections`

Purpose:

- Top-level vault spaces.

Relationships:

- Owns `vault_folders`.

### `vault_folders`

Purpose:

- Folders inside sections.

Relationships:

- Composite foreign key `(section_id, user_id)` references `vault_sections(id, user_id)`.

### `vault_files`

Purpose:

- File metadata for Supabase Storage objects.

Relationships:

- Composite foreign key `(folder_id, user_id)` references `vault_folders(id, user_id)`.

Storage:

- Bucket: `vault-files`
- Path convention: `{user_id}/{file_id}/{safe_filename}`

Constraints:

- `size_bytes`: 0 to 10 MiB
- `mime_type`: up to 160 characters

Index:

- `vault_files_user_folder_idx`

### `diary_entries`

Purpose:

- Private diary entries from the Vault feature.

Index:

- `diary_entries_user_date_idx`

## Entertainment

### `ent_anime`

Purpose:

- Series records.

Relationships:

- Owns `ent_anime_episodes`.

### `ent_anime_episodes`

Purpose:

- Watched episode records.

Constraints:

- Unique `(anime_id, episode_number)`.

### `ent_bucket_items`

Purpose:

- Bucket list records.

Constraints:

- `category`: `watch`, `read`, `visit`, `learn`, `other`
- `status`: `pending`, `in-progress`, `done`

Index:

- `ent_bucket_user_status_idx`

### `ent_watch_sessions`

Purpose:

- Watch-time logs.

### `ent_game_scores`

Purpose:

- Future game score persistence.

Note:

- Competitive or shared scoreboards should be server-validated before launch.

## Assistant

### `assistant_conversations`

Purpose:

- AYNTK chat threads.

### `assistant_messages`

Purpose:

- User and assistant messages.

Relationships:

- Composite foreign key `(conversation_id, user_id)` references `assistant_conversations(id, user_id)`.

Index:

- `assistant_messages_conversation_idx`

## Import, Export, And Audit

### `legacy_imports`

Purpose:

- Stores staged localStorage imports for validated migration.

Constraints:

- Unique `(user_id, idempotency_key)`.

### `audit_events`

Purpose:

- Structured backend event log.

Fields:

- `user_id`
- `request_id`
- `event_type`
- `severity`
- `metadata`

Index:

- `audit_events_user_created_idx`

## Storage Policies

Bucket:

- `vault-files`

Policy:

- Authenticated users can manage only objects where the first path segment equals `auth.uid()`.

Example allowed path:

```text
{auth.uid()}/{file_id}/notes.pdf
```

## RLS Summary

RLS is enabled for:

- All user-owned feature tables
- `profiles`
- Storage objects in `vault-files`

Default user-owned policy:

```sql
using (user_id = auth.uid())
with check (user_id = auth.uid())
```

Profile policy:

```sql
using (id = auth.uid())
with check (id = auth.uid())
```

## Triggers

### `handle_new_user`

Runs after insert on `auth.users`.

Creates:

- `profiles`
- `user_settings`

### `set_updated_at`

Runs before update on mutable tables to keep `updated_at` current.

## Remaining Database Risks

- The migration has not been applied to a live Supabase project in this workspace.
- Email sending is scaffolded as delivery logging until provider credentials are configured.
- Legacy import currently stages validated payloads; full row-by-row normalization should be completed feature by feature after sample legacy data is reviewed.
