# KitchenMenu cloud backup

This project supports shared cloud sync through the `/api/snapshot` route.

## Required Vercel env vars

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- optional: `KITCHENMENU_SUPABASE_TABLE` (default `kitchenmenu_snapshots`)
- optional: `KITCHENMENU_SNAPSHOT_ROW_ID` (default `main`)

## Supabase table

Run this once in Supabase SQL editor:

```sql
create table if not exists public.kitchenmenu_snapshots (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
```

## Behavior

- Visitors can open the site without logging in.
- The app loads the cloud snapshot first when available.
- Local IndexedDB/localStorage remains as fallback for offline use.
- Saves write locally and then sync to the cloud endpoint in the background.
