-- Optimistic concurrency for save_state. Run after 0003.
--
-- Before this migration the RPC was pure last-write-wins: two tabs (or a
-- laptop + the desktop app) could each load version N, then both save N+1,
-- and whichever committed second silently erased the other's changes.
--
-- Now the function takes a row lock on the caller's app_meta row and
-- rejects any snapshot whose version is not strictly newer than the stored
-- one by raising `stale_version`. The API layer translates that into a 409
-- and the client re-loads the latest state instead of clobbering it.
--
-- The body is otherwise identical to 0002, and the search_path pin from
-- 0003 is folded into the definition (CREATE OR REPLACE would otherwise
-- drop it).

create or replace function save_state(payload jsonb)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_incoming int := coalesce((payload ->> 'version')::int, 1);
  v_current int;
begin
  if v_uid is null then
    raise exception 'save_state called without an authenticated user';
  end if;

  -- Row lock serializes concurrent saves for the same user: the second
  -- writer blocks here until the first commits, then sees its version and
  -- fails the strict-newer check below instead of overwriting it.
  select version into v_current
  from app_meta
  where user_id = v_uid
  for update;

  if v_current is not null and v_incoming <= v_current then
    raise exception 'stale_version: incoming % <= stored %', v_incoming, v_current;
  end if;

  insert into app_meta (user_id, selected_workspace_id, version)
  values (
    v_uid,
    payload ->> 'selectedWorkspaceId',
    v_incoming
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
