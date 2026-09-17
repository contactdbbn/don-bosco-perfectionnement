-- V134 : correction synchronisation messages/commentaires + notification nouvelle demande de créneau

-- Les adhérents doivent pouvoir réutiliser UPSERT sur leurs propres messages.
alter table public.admin_messages enable row level security;
drop policy if exists admin_messages_member_update on public.admin_messages;
create policy admin_messages_member_update on public.admin_messages
for update to authenticated
using (member_id = (select p.member_id from public.profiles p where p.id=auth.uid()))
with check (member_id = (select p.member_id from public.profiles p where p.id=auth.uid()));

-- Les adhérents doivent pouvoir réutiliser UPSERT sur leurs propres commentaires.
alter table public.admin_message_comments enable row level security;
drop policy if exists admin_message_comments_member_update on public.admin_message_comments;
create policy admin_message_comments_member_update on public.admin_message_comments
for update to authenticated
using (
  sender_role = 'member'
  and member_id = (select p.member_id from public.profiles p where p.id=auth.uid())
  and exists (
    select 1 from public.admin_messages m
    where m.id = public.admin_message_comments.message_id
      and m.member_id = (select p.member_id from public.profiles p where p.id=auth.uid())
      and m.visible = true
  )
)
with check (
  sender_role = 'member'
  and member_id = (select p.member_id from public.profiles p where p.id=auth.uid())
);

-- Recrée les policies INSERT des commentaires avec une expression non ambiguë.
drop policy if exists admin_message_comments_member_insert on public.admin_message_comments;
create policy admin_message_comments_member_insert on public.admin_message_comments
for insert to authenticated
with check (
  public.admin_message_comments.member_id = (select p.member_id from public.profiles p where p.id=auth.uid())
  and public.admin_message_comments.sender_role = 'member'
  and exists (
    select 1 from public.admin_messages m
    where m.id = public.admin_message_comments.message_id
      and m.member_id = public.admin_message_comments.member_id
      and m.visible = true
  )
);

grant select,insert,update on public.admin_messages to authenticated;
grant select,insert,update,delete on public.admin_message_comments to authenticated;
