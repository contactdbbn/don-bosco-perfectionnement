V89 — correction de la confirmation email côté Auth : les comptes créés par l’administrateur sont confirmés côté serveur avant authentification.

# Don Bosco - Perfectionnement — V88

V83 reprend la V81 et conserve Supabase, GitHub Pages et les Notifications Push.

## V83 — Notifications Push : diagnostic et correction

La fonction Supabase `push-notifications` a été renforcée pour tracer précisément le traitement des notifications :
- démarrage du dispatch ;
- nombre d'abonnements actifs ;
- tentative d'envoi ;
- statut HTTP retourné par le service Push ;
- succès, refus ou erreur ;
- désactivation automatique des abonnements retournant 404/410 ;
- nombre d'envois réellement réussis.

Le journal `push_notification_log` n'est désormais créé qu'après au moins un envoi Push réussi pour l'abonnement concerné. Cela évite de marquer une notification comme envoyée lorsqu'aucun appareil n'a effectivement accepté l'envoi.

Le cron Supabase existant toutes les 5 minutes reste inchangé.

## Déploiement

1. Remplacer les fichiers de la branche `main` par ceux de cette archive.
2. Déployer/mette à jour l'Edge Function `push-notifications` avec `supabase/functions/push-notifications/index.ts`.
3. Conserver les secrets Supabase existants : `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `PUSH_CRON_SECRET` et les variables Supabase.
4. Ne pas modifier le SQL V79 si les tables `push_subscriptions` et `push_notification_log` existent déjà.
5. Après déploiement, créer une nouvelle demande de créneau et consulter les logs de l'Edge Function pendant l'exécution du cron.


## V87 — Nouvelle connexion
- Connexion en 3 niveaux : Mode → Créneau → Liste des adhérents/comptes.
- Première connexion : confirmation par adresse mail paramétrée (3 premiers + 3 derniers caractères affichés, milieu masqué), puis changement obligatoire du mot de passe.
- Connexions suivantes : sélection du nom puis saisie du mot de passe personnel.
- Nouvelle Edge Function `auth-gateway` pour charger l’annuaire de connexion et authentifier sans exposer les adresses mail complètes dans le navigateur.

## V88 — Correction connexion
- Suppression de l'ancienne définition de `performLogin` qui écrasait la nouvelle connexion V87.
- L'ancien `v53LoginOverlay` redirige désormais vers la nouvelle page de connexion.
- La déconnexion locale et Supabase ramène systématiquement vers la nouvelle page.
- Cache Service Worker et version de l'application passés en V88.


V91 : réparation automatique de `profiles.auth_email` depuis Supabase Auth pour les anciens comptes, sans bloquer la connexion si ce champ est vide.

## V100 — Corrections demandées
- Le compteur « comptes existants » par créneau inclut désormais les administrateurs actifs affectés à un créneau.
- Dans la page « Présences » uniquement, les noms sont affichés sous la forme « Prénom N. ».

## V102 — Anonymisation Présences selon le mode
- Mode Adhérent : affichage des noms sous la forme « Prénom N. » dans Présences.
- Modes Encadrant et Administrateur : affichage des noms complets dans Présences.

## V103 — Anonymisation Présences en mode Adhérent
- Le mode Adhérent anonymise systématiquement les noms dans la page Présences, y compris lors d'une bascule depuis Encadrant/Administrateur.
- Les modes Encadrant et Administrateur conservent les noms complets.
- Reconnaissance des formats « Prénom Nom » et « NOM Prénom ».
