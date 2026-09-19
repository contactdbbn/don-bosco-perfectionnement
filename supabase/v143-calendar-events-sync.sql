-- Don Bosco - Perfectionnement V143
-- Correction de la synchronisation Supabase des événements de calendrier.
-- À exécuter dans Supabase SQL Editor avant le déploiement de V143.

-- La table existe déjà dans le projet ; cette migration ne recrée pas les données.
-- Elle remet explicitement les droits/RLS nécessaires pour les événements.

grant select, insert, update, delete on table public.calendar_events to authenticated;

grant select, insert, update on table public.calendar_settings to authenticated;

drop policy if exists calendar_events_select_authenticated on public.calendar_events;
create policy calendar_events_select_authenticated
on public.calendar_events
for select
to authenticated
using (true);

drop policy if exists calendar_events_insert_staff on public.calendar_events;
create policy calendar_events_insert_staff
on public.calendar_events
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin','coach')
      and coalesce(p.active, true) = true
  )
  and (created_by is null or created_by = auth.uid())
);

drop policy if exists calendar_events_update_staff on public.calendar_events;
create policy calendar_events_update_staff
on public.calendar_events
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin','coach')
      and coalesce(p.active, true) = true
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin','coach')
      and coalesce(p.active, true) = true
  )
  and (created_by is null or created_by = auth.uid())
);

drop policy if exists calendar_events_delete_staff on public.calendar_events;
create policy calendar_events_delete_staff
on public.calendar_events
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin','coach')
      and coalesce(p.active, true) = true
  )
);

-- Politique minimale pour l'enregistrement de la période du calendrier.
drop policy if exists calendar_settings_select_authenticated on public.calendar_settings;
create policy calendar_settings_select_authenticated
on public.calendar_settings
for select
to authenticated
using (true);

drop policy if exists calendar_settings_write_staff on public.calendar_settings;
create policy calendar_settings_write_staff
on public.calendar_settings
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin','coach')
      and coalesce(p.active, true) = true
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin','coach')
      and coalesce(p.active, true) = true
  )
);
