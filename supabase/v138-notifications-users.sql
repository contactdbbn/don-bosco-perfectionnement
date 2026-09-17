-- V138 : accès administrateur au suivi et à la réactivation des abonnements Push.
-- Permet à la page Utilisateurs de lire l'état réel des abonnements et de
-- réactiver un abonnement déjà enregistré, sans pouvoir créer une permission
-- navigateur à distance.

alter table public.push_subscriptions enable row level security;

create index if not exists push_subscriptions_profile_active_idx
  on public.push_subscriptions(profile_id, active);

create index if not exists push_subscriptions_disabled_by_user_idx
  on public.push_subscriptions(profile_id, disabled_by_user);

drop policy if exists push_subscriptions_admin_select on public.push_subscriptions;
create policy push_subscriptions_admin_select
  on public.push_subscriptions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
        and p.active = true
    )
  );

drop policy if exists push_subscriptions_admin_update on public.push_subscriptions;
create policy push_subscriptions_admin_update
  on public.push_subscriptions
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
        and p.active = true
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
        and p.active = true
    )
  );
