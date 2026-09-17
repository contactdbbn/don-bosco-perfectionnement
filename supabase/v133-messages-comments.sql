-- V133 : correction synchronisation des commentaires de messages
-- À exécuter si V132 n'a pas encore été exécutée. Si V132 l'a déjà été,
-- ce script est également idempotent et corrige/recrée les politiques RLS.
alter table public.admin_messages add column if not exists sender_profile_id uuid references public.profiles(id);
alter table public.admin_messages add column if not exists sender_role text not null default 'member';

create table if not exists public.admin_message_comments (
  id bigint primary key,
  message_id bigint not null references public.admin_messages(id) on delete cascade,
  member_id bigint not null references public.members(id) on delete cascade,
  content text not null,
  sender_profile_id uuid references public.profiles(id),
  sender_role text not null default 'member',
  created_at timestamptz not null default now()
);

alter table public.admin_message_comments drop constraint if exists admin_message_comments_sender_role_check;
alter table public.admin_message_comments add constraint admin_message_comments_sender_role_check check (sender_role in ('member','admin','coach'));
create index if not exists admin_message_comments_message_idx on public.admin_message_comments(message_id,created_at);

alter table public.admin_message_comments enable row level security;

drop policy if exists admin_message_comments_member_select on public.admin_message_comments;
create policy admin_message_comments_member_select on public.admin_message_comments
for select to authenticated
using (
  exists (
    select 1 from public.admin_messages m
    where m.id = public.admin_message_comments.message_id
      and m.member_id = (select p.member_id from public.profiles p where p.id = auth.uid())
      and m.visible = true
  )
);

drop policy if exists admin_message_comments_member_insert on public.admin_message_comments;
create policy admin_message_comments_member_insert on public.admin_message_comments
for insert to authenticated
with check (
  public.admin_message_comments.member_id = (select p.member_id from public.profiles p where p.id = auth.uid())
  and public.admin_message_comments.sender_role = 'member'
  and exists (
    select 1 from public.admin_messages m
    where m.id = public.admin_message_comments.message_id
      and m.member_id = public.admin_message_comments.member_id
      and m.visible = true
  )
);

drop policy if exists admin_message_comments_admin on public.admin_message_comments;
create policy admin_message_comments_admin on public.admin_message_comments
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select,insert,update,delete on public.admin_message_comments to authenticated;
