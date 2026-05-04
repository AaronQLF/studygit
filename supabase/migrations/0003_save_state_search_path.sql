-- Pin the search_path on save_state to mitigate search-path-based attacks.
-- Mirrors the deployed `save_state_search_path` migration.
alter function public.save_state(jsonb) set search_path = public, pg_temp;
