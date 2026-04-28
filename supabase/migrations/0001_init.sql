create extension if not exists "pgcrypto";

create table if not exists workspaces (
  id text primary key,
  user_id uuid,
  name text not null,
  created_at bigint not null
);

create table if not exists nodes (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  user_id uuid,
  position jsonb not null,
  width int,
  height int,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists nodes_workspace_idx on nodes(workspace_id);

create table if not exists edges (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  user_id uuid,
  source text not null,
  target text not null
);
create index if not exists edges_workspace_idx on edges(workspace_id);

create table if not exists app_meta (
  user_id uuid primary key default '00000000-0000-0000-0000-000000000000'::uuid,
  selected_workspace_id text,
  version int not null default 1
);

create or replace function save_state(payload jsonb)
returns void
language plpgsql
as $$
declare
  singleton_user_id constant uuid := '00000000-0000-0000-0000-000000000000'::uuid;
begin
  insert into app_meta (user_id, selected_workspace_id, version)
  values (
    singleton_user_id,
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
  select iw.id, null, coalesce(iw.name, 'Untitled'), iw.created_at
  from incoming_workspaces iw
  on conflict (id) do update
  set name = excluded.name,
      created_at = excluded.created_at;

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
    null,
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
      updated_at = now();

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
  select ie.id, ie.workspace_id, null, ie.source, ie.target
  from incoming_edges ie
  on conflict (id) do update
  set workspace_id = excluded.workspace_id,
      source = excluded.source,
      target = excluded.target;

  delete from edges
  where id not in (
    select e ->> 'id'
    from jsonb_array_elements(coalesce(payload -> 'edges', '[]'::jsonb)) as e
    where coalesce(e ->> 'id', '') <> ''
  );

  delete from nodes
  where id not in (
    select n ->> 'id'
    from jsonb_array_elements(coalesce(payload -> 'nodes', '[]'::jsonb)) as n
    where coalesce(n ->> 'id', '') <> ''
  );

  delete from workspaces
  where id not in (
    select w ->> 'id'
    from jsonb_array_elements(coalesce(payload -> 'workspaces', '[]'::jsonb)) as w
    where coalesce(w ->> 'id', '') <> ''
  );
end;
$$;
