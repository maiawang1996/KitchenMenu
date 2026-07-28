# KitchenMenu cloud backup

This project supports shared cloud sync through the `/api/snapshot` route.

## Required Vercel env vars

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- optional: `KITCHENMENU_SUPABASE_TABLE` (default `kitchenmenu_snapshots`)
- optional: `KITCHENMENU_SNAPSHOT_ROW_ID` (default `main`)
- optional: `KITCHENMENU_SUPABASE_BUCKET` (default `kitchenmenu-images`)

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
- Recipe and inventory saves write locally and then sync to the cloud endpoint.
- Cropped recipe photos upload separately to Supabase Storage and the recipe stores the public image URL.
- Opening a fresh browser never writes defaults back to the cloud.
- Today plans and weekly menus stay local-only.
