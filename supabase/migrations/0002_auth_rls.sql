-- Per-user data isolation. Run after 0001_init.sql.
-- Assigns ownership to existing rows (set MIGRATE_DEFAULT_USER_ID below if you
-- have pre-auth data you want to preserve), enforces NOT NULL user_id, and
-- enables RLS so each user only sees their own workspaces/nodes/edges.

-- 1. (Optional) backfill existing rows with a chosen owner before tightening
-- the column. Replace the placeholder UUID with the user_id of the account
-- that should own the legacy data, or skip entirely if the tables are empty.
-- update workspaces set user_id = '00000000-0000-0000-0000-000000000000'::uuid where user_id is null;
-- update nodes      set user_id = '00000000-0000-0000-0000-000000000000'::uuid where user_id is null;
-- update edges      set user_id = '00000000-0000-0000-0000-000000000000'::uuid where user_id is null;

-- 2. Drop pre-auth rows that were never assigned an owner. Comment this block
-- out if you ran the backfill above instead.
delete from edges      where user_id is null;
delete from nodes      where user_id is null;
delete from workspaces where user_id is null;
delete from app_meta   where user_id = '00000000-0000-0000-0000-000000000000'::uuid;

-- 3. Tighten user_id and default it to auth.uid() so client-side inserts pick
-- up the caller's identity automatically.
alter table workspaces alter column user_id set not null;
alter table workspaces alter column user_id set default auth.uid();

alter table nodes alter column user_id set not null;
alter table nodes alter column user_id set default auth.uid();

alter table edges alter column user_id set not null;
alter table edges alter column user_id set default auth.uid();

-- 4. app_meta becomes per-user. Drop the singleton default and require uid.
alter table app_meta alter column user_id drop default;

-- 5. Enable Row Level Security and add per-table policies. Each statement is
-- idempotent so the migration is safe to re-run.
alter table workspaces enable row level security;
alter table nodes      enable row level security;
alter table edges      enable row level security;
alter table app_meta   enable row level security;

drop policy if exists workspaces_select on workspaces;
drop policy if exists workspaces_insert on workspaces;
drop policy if exists workspaces_update on workspaces;
drop policy if exists workspaces_delete on workspaces;

create policy workspaces_select on workspaces
  for select using (user_id = auth.uid());
create policy workspaces_insert on workspaces
  for insert with check (user_id = auth.uid());
create policy workspaces_update on workspaces
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy workspaces_delete on workspaces
  for delete using (user_id = auth.uid());

drop policy if exists nodes_select on nodes;
drop policy if exists nodes_insert on nodes;
drop policy if exists nodes_update on nodes;
drop policy if exists nodes_delete on nodes;

create policy nodes_select on nodes
  for select using (user_id = auth.uid());
create policy nodes_insert on nodes
  for insert with check (user_id = auth.uid());
create policy nodes_update on nodes
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy nodes_delete on nodes
  for delete using (user_id = auth.uid());

drop policy if exists edges_select on edges;
drop policy if exists edges_insert on edges;
drop policy if exists edges_update on edges;
drop policy if exists edges_delete on edges;

create policy edges_select on edges
  for select using (user_id = auth.uid());
create policy edges_insert on edges
  for insert with check (user_id = auth.uid());
create policy edges_update on edges
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy edges_delete on edges
  for delete using (user_id = auth.uid());

drop policy if exists app_meta_select on app_meta;
drop policy if exists app_meta_insert on app_meta;
drop policy if exists app_meta_update on app_meta;
drop policy if exists app_meta_delete on app_meta;

create policy app_meta_select on app_meta
  for select using (user_id = auth.uid());
create policy app_meta_insert on app_meta
  for insert with check (user_id = auth.uid());
create policy app_meta_update on app_meta
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy app_meta_delete on app_meta
  for delete using (user_id = auth.uid());

-- 6. Rewrite save_state to operate on the calling user only. Uses security
-- invoker so RLS still applies inside the function body.
create or replace function save_state(payload jsonb)
returns void
language plpgsql
security invoker
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'save_state called without an authenticated user';
  end if;

  insert into app_meta (user_id, selected_workspace_id, version)
  values (
    v_uid,
    payload ->> 'selectedWorkspaceId',
    coalesce((payload ->> 'version')::int, 1)
  )
  on conflict (user_id) do update
  set selected_workspace_id = excluded.selected_workspace_id,
      version = excluded.version;

  with incoming_workspaces as (
    select
      w ->> 'id' as id,
      w ->> 'name' as name,
      coalesce((w ->> 'createdAt')::bigint, 0) as created_at
    from jsonb_array_elements(coalesce(payload -> 'workspaces', '[]'::jsonb)) as w
    where coalesce(w ->> 'id', '') <> ''
  )
  insert into workspaces (id, user_id, name, created_at)
  select iw.id, v_uid, coalesce(iw.name, 'Untitled'), iw.created_at
  from incoming_workspaces iw
  on conflict (id) do update
  set name = excluded.name,
      created_at = excluded.created_at
  where workspaces.user_id = v_uid;

  with incoming_nodes as (
    select
      n ->> 'id' as id,
      n ->> 'workspaceId' as workspace_id,
      coalesce(n -> 'position', '{"x":0,"y":0}'::jsonb) as position,
      nullif(n ->> 'width', '')::int as width,
      nullif(n ->> 'height', '')::int as height,
      coalesce(n -> 'data', '{}'::jsonb) as data
    from jsonb_array_elements(coalesce(payload -> 'nodes', '[]'::jsonb)) as n
    where coalesce(n ->> 'id', '') <> ''
      and coalesce(n ->> 'workspaceId', '') <> ''
  )
  insert into nodes (id, workspace_id, user_id, position, width, height, data, updated_at)
  select
    inodes.id,
    inodes.workspace_id,
    v_uid,
    inodes.position,
    inodes.width,
    inodes.height,
    inodes.data,
    now()
  from incoming_nodes inodes
  on conflict (id) do update
  set workspace_id = excluded.workspace_id,
      position = excluded.position,
      width = excluded.width,
      height = excluded.height,
      data = excluded.data,
      updated_at = now()
  where nodes.user_id = v_uid;

  with incoming_edges as (
    select
      e ->> 'id' as id,
      e ->> 'workspaceId' as workspace_id,
      e ->> 'source' as source,
      e ->> 'target' as target
    from jsonb_array_elements(coalesce(payload -> 'edges', '[]'::jsonb)) as e
    where coalesce(e ->> 'id', '') <> ''
      and coalesce(e ->> 'workspaceId', '') <> ''
      and coalesce(e ->> 'source', '') <> ''
      and coalesce(e ->> 'target', '') <> ''
  )
  insert into edges (id, workspace_id, user_id, source, target)
  select ie.id, ie.workspace_id, v_uid, ie.source, ie.target
  from incoming_edges ie
  on conflict (id) do update
  set workspace_id = excluded.workspace_id,
      source = excluded.source,
      target = excluded.target
  where edges.user_id = v_uid;

  delete from edges
  where user_id = v_uid
    and id not in (
      select e ->> 'id'
      from jsonb_array_elements(coalesce(payload -> 'edges', '[]'::jsonb)) as e
      where coalesce(e ->> 'id', '') <> ''
    );

  delete from nodes
  where user_id = v_uid
    and id not in (
      select n ->> 'id'
      from jsonb_array_elements(coalesce(payload -> 'nodes', '[]'::jsonb)) as n
      where coalesce(n ->> 'id', '') <> ''
    );

  delete from workspaces
  where user_id = v_uid
    and id not in (
      select w ->> 'id'
      from jsonb_array_elements(coalesce(payload -> 'workspaces', '[]'::jsonb)) as w
      where coalesce(w ->> 'id', '') <> ''
    );
end;
$$;
