# Don Bosco - Perfectionnement — V108

## Ajouts V108

- Nouvelle notification Push **« Présence confirmée »**.
- Elle cible les adhérents dont le statut est **Présent** pour la semaine envoyée.
- Le message indique : **date, créneau effectif et statut**.
- Le créneau effectif tient compte du dernier changement de créneau **validé** pour la semaine.
- Ajout dans Administration → Notifications d'un bloc de configuration pour « Présence confirmée ».
- Ajout d'un bouton d'envoi manuel pour **Rappel de présence — À confirmer**.
- Ajout d'un bouton d'envoi manuel pour **Présence confirmée — Présents**.
- Le rappel manuel cible la **semaine suivante** et les comptes Adhérent sans réponse (l'état À confirmer inclut l'absence de ligne de réponse).
- Les administrateurs affectés à un créneau restent inclus dans le rappel automatique V106 ; ils ne reçoivent pas la notification « Présence confirmée » réservée aux adhérents.
- Protection anti-doublon conservée via `push_notification_log`.
- Les actions manuelles utilisent l'authentification Supabase et sont réservées aux administrateurs.
- Les autres notifications et fonctionnalités de V106 sont conservées.

## Déploiement

1. Publier les fichiers web V107 sur GitHub Pages.
2. Redéployer `supabase/functions/push-notifications`.
3. Exécuter le SQL `supabase/v99-notifications.sql` si le type `attendance_confirmed` n'existe pas encore dans `notification_settings` (l'instruction est protégée par `ON CONFLICT`).
4. Tester depuis Administration → Notifications.

## Tests manuels recommandés

- Avec un adhérent en **À confirmer** pour la semaine suivante : cliquer sur « Envoyer maintenant · À confirmer » et vérifier la réception.
- Avec un adhérent **Présent** sur la semaine affichée : cliquer sur « Envoyer maintenant · Présents » et vérifier un message du type :
  `15/09/2026 · Créneau 2 · Présent`.
- Valider ensuite un changement de créneau et relancer : la notification utilise le créneau effectif validé et la clé anti-doublon est différente.
- Relancer sans modification : aucune seconde notification identique ne doit être envoyée.


## V108 — demandes de changement de créneau visibles par l’adhérent

- La page **Présences** affiche désormais la dernière demande de changement de créneau de l’adhérent pour la semaine sélectionnée.
- Le statut affiché est **en attente de validation**, **validée**, **refusée** ou **annulée**, avec le créneau demandé.
- Lorsqu’une demande est validée, le **créneau effectif** est également affiché.
- La page **Mon suivi** affiche la même information sur chaque date Cours/Libre concernée.
- Les demandes de modification de présence (`status_change`) restent distinctes et ne sont pas confondues avec les demandes de changement de créneau (`slot_change`).
- Toutes les fonctionnalités de V107 sont conservées.
