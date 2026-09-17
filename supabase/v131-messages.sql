-- V131 : messages bidirectionnels et nouveaux champs d'expéditeur
alter table public.admin_messages add column if not exists sender_profile_id uuid references public.profiles(id);
alter table public.admin_messages add column if not exists sender_role text not null default 'member';
update public.admin_messages set sender_role='member' where sender_role is null or sender_role='';
update public.admin_messages set sender_profile_id=(select p.id from public.profiles p where p.member_id=admin_messages.member_id and p.role='member' order by p.created_at limit 1) where sender_profile_id is null;
alter table public.admin_messages drop constraint if exists admin_messages_sender_role_check;
alter table public.admin_messages add constraint admin_messages_sender_role_check check (sender_role in ('member','admin','coach'));
create index if not exists admin_messages_sender_idx on public.admin_messages(sender_profile_id,created_at);
