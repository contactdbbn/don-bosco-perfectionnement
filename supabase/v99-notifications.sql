-- V99 — Paramétrage des notifications Push
create table if not exists public.notification_settings (
  notification_type text primary key,
  active boolean not null default true,
  days integer[] not null default '{0,1,2,3,4,5,6}',
  start_time time not null default '07:00',
  end_time time not null default '23:00',
  updated_at timestamptz not null default now()
);

insert into public.notification_settings(notification_type,active,days,start_time,end_time) values
('attendance_reminder',true,'{0}','18:00','18:05'),
('new_slot_request',true,'{0,1,2,3,4,5,6}','07:00','23:00'),
('new_status_request',true,'{0,1,2,3,4,5,6}','07:00','23:00'),
('slot_request_decision',true,'{0,1,2,3,4,5,6}','07:00','23:00'),
('status_request_decision',true,'{0,1,2,3,4,5,6}','07:00','23:00'),
('attendance_confirmed',true,'{0,1,2,3,4,5,6}','07:00','23:00')
on conflict (notification_type) do nothing;

alter table public.notification_settings enable row level security;
drop policy if exists notification_settings_admin_all on public.notification_settings;
create policy notification_settings_admin_all
on public.notification_settings for all to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select,insert,update,delete on public.notification_settings to authenticated;
revoke all on public.notification_settings from anon;
