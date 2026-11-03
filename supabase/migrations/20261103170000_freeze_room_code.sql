-- Freeze room_code after insert.
-- Updating it was an unthrottled existence check: a unique violation meant
-- the code was already taken, and a success meant it was free.
-- Apply after 20261103153000_room_code_rate_limit.sql.
-- New projects should run supabase/schema.sql instead of this file.

begin;

create or replace function public.freeze_room_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.room_code is distinct from old.room_code then
    raise exception 'room code cannot be changed';
  end if;
  return new;
end;
$$;

revoke all on function public.freeze_room_code() from public, anon, authenticated;

drop trigger if exists sessions_freeze_room_code on public.sessions;
create trigger sessions_freeze_room_code
before update of room_code on public.sessions
for each row execute function public.freeze_room_code();

notify pgrst, 'reload schema';

commit;
