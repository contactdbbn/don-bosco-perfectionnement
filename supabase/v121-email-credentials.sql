-- Don Bosco - Perfectionnement V121 — suivi des envois d'identifiants
alter table public.profiles
  add column if not exists credentials_email_sent_at timestamptz;

comment on column public.profiles.credentials_email_sent_at is
  'Date et heure du dernier envoi par email des identifiants temporaires du compte.';
