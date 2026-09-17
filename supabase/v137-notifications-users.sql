-- V137 : mémorisation explicite d'une désactivation volontaire des notifications Push.
alter table public.push_subscriptions
  add column if not exists disabled_by_user boolean not null default false;

create index if not exists push_subscriptions_profile_active_idx
  on public.push_subscriptions(profile_id, active);

create index if not exists push_subscriptions_disabled_by_user_idx
  on public.push_subscriptions(profile_id, disabled_by_user);

-- Les abonnements existants sont considérés comme non désactivés volontairement.
update public.push_subscriptions
set disabled_by_user=false
where disabled_by_user is null;
