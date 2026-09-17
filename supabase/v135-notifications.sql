
-- V135 : fenêtre globale d'envoi pour les notifications destinées aux encadrants/admins.
-- Elle est stockée dans la même table que les paramètres de notifications afin
-- de rester compatible avec le système existant.
insert into public.notification_settings
  (notification_type, active, days, start_time, end_time, updated_at)
values
  ('staff_delivery_window', true, array[1,2,3,4,5,6,0], '07:00', '23:00', now())
on conflict (notification_type) do nothing;

-- V135 : autoriser un adhérent à créer son propre message administrateur.
-- Cette policy est nécessaire si le message n'existe pas encore et que
-- l'application effectue un UPSERT.
alter table public.admin_messages enable row level security;
drop policy if exists admin_messages_member_insert on public.admin_messages;
create policy admin_messages_member_insert on public.admin_messages
for insert to authenticated
with check (
  public.admin_messages.member_id = (select p.member_id from public.profiles p where p.id=auth.uid())
  and public.admin_messages.sender_role = 'member'
  and public.admin_messages.visible = true
);
