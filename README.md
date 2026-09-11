# Don Bosco - Perfectionnement — V80 Notifications Push

V80 est basée sur V78 Mobile/PWA. Elle conserve le métier V77/V78 et ajoute de vraies notifications Web Push reliées à Supabase.

## Ce que V80 ajoute

- abonnement Push par appareil et par compte ;
- permission navigateur demandée après clic sur « Activer les notifications » ;
- enregistrement sécurisé de l'abonnement dans `push_subscriptions` ;
- notification de test après activation ;
- Service Worker capable de recevoir une notification même lorsque l'application n'est pas ouverte ;
- notification aux encadrants/admins lors d'une nouvelle demande ;
- notification à l'adhérent lorsqu'une demande de créneau ou de présence est traitée ;
- rappel automatique le dimanche à 18h pour les adhérents qui n'ont pas encore répondu pour la semaine suivante ;
- planification Supabase Cron toutes les 5 minutes.

## 1. SQL Supabase

Exécuter `supabase/v79.sql` dans le SQL Editor Supabase.

## 2. Clés VAPID

La clé publique est intégrée à `supabase-config.js` et peut être publiée côté navigateur.

La clé privée VAPID **ne doit jamais être publiée sur GitHub**.

La paire générée pour V80 est documentée dans le fichier de préparation secret remis séparément. Copier la clé privée uniquement dans les secrets de la fonction Supabase.

## 3. Déployer l'Edge Function

Déployer :

`supabase/functions/push-notifications/index.ts`

La fonction utilise :

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`
- `PUSH_CRON_SECRET`

Configurer `verify_jwt = false` pour cette fonction, car le déclenchement Cron est authentifié par `x-cron-secret`. Les appels utilisateur utilisent leur JWT et sont contrôlés dans la fonction.

## 4. Secrets

Dans les secrets de la fonction :

- `VAPID_PUBLIC_KEY` = la clé publique fournie avec V80
- `VAPID_PRIVATE_KEY` = la clé privée fournie séparément
- `VAPID_SUBJECT` = `https://contactdbbn.github.io/don-bosco-perfectionnement/`
- `PUSH_CRON_SECRET` = le secret fourni séparément

Ne jamais mettre ces valeurs privées dans le dépôt GitHub.

## 5. Supabase Cron

Créer dans Vault :

- `project_url` = `https://zshvrarmooukeosyxbgx.supabase.co`
- `push_cron_secret` = la valeur de `PUSH_CRON_SECRET`

Puis créer le job Cron :

```sql
select cron.schedule(
  'don-bosco-push-dispatch',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/push-notifications',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret')
    ),
    body := '{"action":"dispatch"}'::jsonb
  );
  $$
);
```

Le job est volontairement toutes les 5 minutes ; les journaux de notification empêchent les doublons.

## 6. GitHub Pages

Publier les fichiers web à la racine du dépôt `main` comme pour V78.

**Important :** le dossier `supabase/functions` et `supabase/v79.sql` peuvent rester dans le dépôt GitHub pour conserver le code source, mais aucun secret privé ne doit y être placé.

## 7. Test utilisateur

1. Ouvrir V80 en HTTPS.
2. Se connecter.
3. Appuyer sur « 🔔 Activer les notifications ».
4. Autoriser les notifications.
5. Une notification de test doit arriver.
6. Fermer complètement l'application puis refaire un test pour vérifier le Push hors premier plan.

Les notifications Web Push nécessitent HTTPS, un Service Worker actif et un abonnement `PushManager` avec une clé publique VAPID. Voir la documentation MDN et Supabase référencée dans le projet.


## V80 — correction des contrôles de présence
- Une demande de modification de présence en attente ne concerne que sa semaine/date exacte et ne bloque pas les autres dates.
- Les contrôles de présence des modes Administrateur/Encadrant sont explicitement considérés comme éditables indépendamment de l’état du compte adhérent concerné.
- Fonctionnalités Push V79 et configuration Supabase conservées.
