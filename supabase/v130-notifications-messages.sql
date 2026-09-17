-- V130 — notifications programmables, bandeau et messages adhérents
create table if not exists public.custom_notification_programs (
  id integer primary key check (id between 1 and 3), active boolean not null default false,
  title text not null default '', content text not null default '', mode text not null default 'days',
  days integer[] not null default '{}', week_types text[] not null default '{}',
  send_time time not null default '12:00', recipients text[] not null default '{member}',
  updated_at timestamptz not null default now(), updated_by uuid references public.profiles(id)
);
create table if not exists public.manual_notification_settings (
  id boolean primary key default true, content text not null default '', recipients text[] not null default '{member}',
  updated_at timestamptz not null default now(), updated_by uuid references public.profiles(id)
);
create table if not exists public.information_banner (
  id boolean primary key default true, active boolean not null default false, content text not null default '',
  updated_at timestamptz not null default now(), updated_by uuid references public.profiles(id)
);
create table if not exists public.admin_messages (
  id bigint primary key, member_id bigint not null references public.members(id) on delete cascade,
  content text not null, visible boolean not null default true, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists admin_messages_member_idx on public.admin_messages(member_id,created_at);

alter table public.custom_notification_programs enable row level security;
alter table public.manual_notification_settings enable row level security;
alter table public.information_banner enable row level security;
alter table public.admin_messages enable row level security;

drop policy if exists custom_notification_admin on public.custom_notification_programs;
create policy custom_notification_admin on public.custom_notification_programs for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists manual_notification_admin on public.manual_notification_settings;
create policy manual_notification_admin on public.manual_notification_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists information_banner_read on public.information_banner;
create policy information_banner_read on public.information_banner for select to authenticated using (true);
drop policy if exists information_banner_admin on public.information_banner;
create policy information_banner_admin on public.information_banner for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists admin_messages_member on public.admin_messages;
create policy admin_messages_member on public.admin_messages for select to authenticated using (member_id = (select p.member_id from public.profiles p where p.id = auth.uid()));
create policy admin_messages_member_insert on public.admin_messages for insert to authenticated with check (member_id = (select p.member_id from public.profiles p where p.id = auth.uid()));
drop policy if exists admin_messages_admin on public.admin_messages;
create policy admin_messages_admin on public.admin_messages for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select,insert,update,delete on public.custom_notification_programs to authenticated;
grant select,insert,update,delete on public.manual_notification_settings to authenticated;
grant select,update on public.information_banner to authenticated;
grant select,insert,update on public.admin_messages to authenticated;

insert into public.custom_notification_programs(id,title,recipients) values
(1,'Notification programmée 1','{member}'),(2,'Notification programmée 2','{member}'),(3,'Notification programmée 3','{member}')
on conflict (id) do nothing;
insert into public.information_banner(id) values(true) on conflict(id) do nothing;
insert into public.manual_notification_settings(id) values(true) on conflict(id) do nothing;

-- Après avoir déployé functions/custom-notifications et défini les mêmes secrets
-- PUSH_CRON_SECRET / SUPABASE_URL / VAPID_* que pour les Push existants :
-- ce job appelle la nouvelle fonction toutes les 5 minutes.
DO $$
DECLARE jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname='don-bosco-custom-notifications';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;
  PERFORM cron.schedule('don-bosco-custom-notifications','*/5 * * * *', $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/custom-notifications',
      headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret')),
      body := '{"action":"dispatch"}'::jsonb
    );
  $job$);
END $$;
