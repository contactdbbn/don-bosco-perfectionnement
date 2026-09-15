-- Don Bosco - Perfectionnement V126
-- Rend le rôle disponible sur members pour que le mode adhérent puisse
-- exclure les administrateurs et encadrants même lorsque RLS masque les
-- autres lignes de profiles.

alter table public.members
  add column if not exists role text not null default 'member';

update public.members m
set role = case
  when lower(coalesce(p.role::text,'')) in ('admin','administrateur') then 'admin'
  when lower(coalesce(p.role::text,'')) in ('coach','encadrant') then 'coach'
  else 'member'
end
from public.profiles p
where p.member_id = m.id;

alter table public.members
drop constraint if exists members_role_check;

alter table public.members
add constraint members_role_check check (role in ('member','coach','admin'));

create or replace function public.sync_member_role_from_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.member_id is not null then
    update public.members
    set role = case
      when lower(coalesce(new.role::text,'')) in ('admin','administrateur') then 'admin'
      when lower(coalesce(new.role::text,'')) in ('coach','encadrant') then 'coach'
      else 'member'
    end,
    updated_at = now()
    where id = new.member_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_member_role_from_profile on public.profiles;
create trigger trg_sync_member_role_from_profile
after insert or update of role, member_id on public.profiles
for each row execute function public.sync_member_role_from_profile();

comment on column public.members.role is
  'Rôle de l’utilisateur associé : member, coach ou admin. Synchronisé depuis profiles.';
