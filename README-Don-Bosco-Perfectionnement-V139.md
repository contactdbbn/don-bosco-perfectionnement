# Don Bosco - Perfectionnement

Application web/PWA de gestion des présences, des créneaux, des demandes et des notifications pour l'association **Don Bosco - Perfectionnement**.

Version fonctionnelle documentée : **V139**.

---

## 1. Présentation du projet

L'application permet de gérer :

- les adhérents et leurs comptes ;
- les encadrants ;
- les administrateurs ;
- les créneaux de pratique ;
- les présences et absences ;
- les demandes de changement de créneau ;
- les demandes de changement de statut ;
- le calendrier annuel ;
- les événements ;
- les objectifs ;
- le suivi individuel ;
- les messages entre adhérents et administrateurs ;
- les notifications Push ;
- les notifications programmées ;
- le bandeau d'information ;
- l'export PDF de certaines données encadrant.

L'application est conçue comme une application web responsive utilisable sur ordinateur, tablette et téléphone, avec possibilité d'installation en PWA.

---

# 2. Technologies

## Front-end

- HTML5
- CSS3
- JavaScript côté navigateur
- application monopage avec navigation interne par vues
- Service Worker pour les fonctionnalités PWA et Push

Fichiers principaux :

```text
index.html
app.js
styles.css
sw.js
```

## Backend

Le backend repose sur **Supabase** :

- Supabase Authentication pour les comptes ;
- PostgreSQL pour les données ;
- Row Level Security (RLS) pour les droits d'accès ;
- Edge Functions pour les notifications Push et les traitements serveur ;
- pg_cron / pg_net pour les traitements périodiques.

## Déploiement

Le site public est prévu pour GitHub Pages :

```text
https://contactdbbn.github.io/don-bosco-perfectionnement/
```

Le dépôt utilise la branche :

```text
main
```

---

# 3. Architecture générale

```text
Navigateur
   │
   ├── index.html
   ├── app.js
   ├── styles.css
   └── sw.js
          │
          ▼
      Supabase
          │
          ├── Auth
          ├── PostgreSQL
          ├── RLS
          └── Edge Functions
                 │
                 └── Push Web / FCM
```

L'application conserve une partie de son état côté navigateur mais synchronise les données persistantes avec Supabase.

Les opérations sensibles doivent être protégées côté Supabase et/ou dans les Edge Functions ; un contrôle JavaScript dans l'interface ne doit pas être considéré comme une sécurité suffisante.

---

# 4. Rôles

Trois rôles sont utilisés.

## Adhérent

Accès notamment à :

- Présences
- Mon suivi
- Mes demandes
- Objectifs
- Calendrier
- Événements
- Profil
- Message pour l'administrateur lorsque cette fonctionnalité est disponible.

L'adhérent peut :

- répondre Présent / Absent ;
- consulter ses réponses ;
- demander un changement de créneau ;
- demander certaines modifications après verrouillage ;
- consulter ses demandes ;
- consulter ses objectifs ;
- participer aux échanges de messages avec l'administrateur.

Les noms affichés dans le mode adhérent sont anonymisés :

```text
Prénom + première lettre du nom
```

Exemple :

```text
Jean D.
```

Les encadrants et administrateurs disposent de l'affichage complet des noms.

## Encadrant

Accès notamment à :

- TDB
- Objectifs
- Mon suivi
- Présences
- Demandes
- Calendrier
- Événements
- Profil

L'encadrant peut consulter les présences avec les noms complets.

Le mode encadrant permet également de conserver des notes privées liées au suivi par créneau.

## Administrateur

Accès notamment à :

- Utilisateurs
- TDB
- Présences
- Demandes
- Calendrier
- Événements
- Notifications
- Messages

L'administrateur gère les comptes, les rôles, les événements, les demandes et les paramètres de notification.

L'administrateur peut basculer vers un mode adhérent sans devoir se reconnecter.

---

# 5. Créneaux

L'application gère trois créneaux :

```text
Créneau 1
Créneau 2
Créneau 3
```

Les créneaux sont affichés avec leur nom plutôt qu'avec un simple numéro lorsque cela est pertinent.

Chaque créneau possède une capacité administrable.

La capacité peut être configurée jusqu'à 30 personnes.

Le seuil de référence utilisé pour la gestion des places disponibles est :

```text
20 personnes
```

Ce seuil correspond à l'objectif de pratique sans attente.

Les créneaux sont triés alphabétiquement lorsque l'interface présente une liste de créneaux.

Les adhérents sont triés alphabétiquement.

Les comptes administrateur et encadrant peuvent être associés à un créneau, mais un administrateur/encadrant sans créneau ne doit pas apparaître comme adhérent dans les listes de présence.

---

# 6. Gestion des utilisateurs

La page **Utilisateurs** permet notamment de gérer :

- les adhérents ;
- les encadrants ;
- les administrateurs ;
- l'activation/désactivation des comptes ;
- les rôles ;
- le créneau habituel ;
- les informations de connexion utiles à l'administration.

Les informations de suivi du compte comprennent notamment :

- changement du mot de passe ;
- dernière connexion ;
- date d'envoi des identifiants lorsque cette fonction est utilisée.

Le mot de passe utilisateur n'est pas affiché à l'administrateur.

---

# 7. Comptes et authentification

Les comptes utilisent Supabase Authentication.

Lorsqu'un compte est créé avec le mot de passe temporaire prévu par l'application :

```text
123456
```

l'utilisateur doit changer son mot de passe.

Le profil conserve l'état correspondant, notamment :

```text
must_change_password
password_changed_at
force_logout_at
```

L'utilisateur dispose dans son profil des fonctions permettant notamment de :

- changer son mot de passe ;
- se déconnecter.

L'administrateur peut demander un nouvel envoi des identifiants lorsqu'une configuration d'e-mail valide est disponible.

---

# 8. Présences

Les statuts de présence sont :

```text
Présent
Absent
À confirmer
```

Un adhérent peut renseigner son propre statut.

Les autres adhérents ne voient pas les informations nominatives complètes des autres membres.

Les administrateurs et encadrants disposent des informations nécessaires au suivi des présences.

## Verrouillage

Les dates passées sont normalement verrouillées pour les adhérents.

Une demande de modification peut toutefois être créée selon les règles prévues par l'application.

À partir de 19h30 le jour du cours, ou lorsque le délai correspondant est dépassé, une modification directe peut être bloquée et remplacée par une demande.

---

# 9. Suivi

La page **Mon suivi** permet à l'adhérent de consulter ses réponses sur les dates concernées.

Elle présente les dates Cours / Libre pertinentes, indépendamment de certaines limitations du filtre de semaine.

Le suivi peut également permettre de demander un changement de créneau.

Les demandes annulées ne doivent plus apparaître dans les listes opérationnelles de présence ou de suivi.

---

# 10. Changement de créneau

Un adhérent peut demander à participer à un autre créneau.

Le système tient compte notamment :

- du créneau habituel ;
- du créneau demandé ;
- du statut de présence ;
- du nombre de places ;
- des autres demandes ;
- du nombre de changements antérieurs ;
- de l'heure de création de la demande.

La priorité est déterminée notamment par :

1. le nombre de changements déjà effectués ;
2. puis l'horodatage de la demande.

Une demande peut être :

```text
En cours
Acceptée
Refusée
Annulée
```

Une demande acceptée peut entraîner le changement effectif de créneau pour la date concernée.

Une demande annulée ou refusée n'est pas traitée comme une demande active.

---

# 11. Traitement automatique des demandes

Le traitement automatique est prévu pour la prochaine date pertinente de type :

```text
Cours
Libre
```

et non pour une date future arbitrairement éloignée.

Pour les traitements forcés, les règles de disponibilité portent sur le créneau cible concerné.

La capacité est réservée au fur et à mesure des acceptations d'un même traitement.

Exemple :

```text
19 / 20 places occupées
Demande A → acceptée
Demande B → refusée
```

Cela évite d'accepter deux demandes pour une seule place restante.

Les demandes portant sur une date plus éloignée restent en attente jusqu'au traitement correspondant.

---

# 12. Calendrier

La période initiale de référence est :

```text
01/09/2026 → 31/08/2027
```

Elle est prévue pour être administrable.

Le calendrier affiche notamment les semaines sous les types :

```text
Cours
Libre
Vacances
Férié
```

Les lundis peuvent être initialisés avec des semaines de cours.

Les autres jours ne sont pas transformés automatiquement en cours ; les événements permettent d'ajouter les informations particulières.

Le libellé utilisé dans l'application est :

```text
Libre
```

et non « Pas de cours ».

---

# 13. Événements

La page **Calendrier** reste dédiée au calendrier.

La page **Événements** regroupe les paramètres et listes d'événements dans des sections repliables.

Sections :

1. Types de semaines
2. Jours fériés
3. Cours annulés
4. Libre
5. Autres événements

Les sections sont fermées par défaut.

Les titres peuvent afficher le nombre d'éléments :

```text
Types de semaines (N)
Jours fériés (N)
...
```

Les événements de type Libre ajoutés manuellement restent distingués du type de semaine Libre.

Seul l'administrateur peut ajouter, modifier ou supprimer les événements.

Les encadrants et adhérents disposent d'un accès en consultation.

---

# 14. Cours annulés

Un cours annulé est traité comme une période sans cours / Libre dans les fonctions concernées.

L'administrateur peut enregistrer la date et les informations correspondantes.

Une date de déclaration peut être conservée ou utiliser la valeur par défaut prévue par l'application.

---

# 15. Objectifs

Les objectifs sont accessibles selon le rôle.

Pour les adhérents, la page Objectifs permet notamment :

- de consulter les objectifs ;
- d'ajouter des commentaires lorsque la fonctionnalité est disponible ;
- d'utiliser les réactions prévues par l'application.

Les réactions vertes/rouges sont liées au statut Présent lorsque cette règle est applicable.

Certains commentaires peuvent être anonymes.

---

# 16. Mon suivi encadrant

L'encadrant dispose d'un suivi spécifique.

Il peut notamment gérer :

- les objectifs de cours ;
- des notes privées par créneau.

Les notes privées :

- ne sont pas visibles par les adhérents ;
- sont associées au suivi de l'encadrant ;
- ne dépendent pas nécessairement de la semaine actuellement sélectionnée.

---

# 17. Tableau de bord

Le tableau de bord présente les indicateurs utiles au fonctionnement de l'association.

Les informations de présence peuvent être comparées à la capacité ou au seuil de référence.

Le tableau de bord encadrant/admin peut également présenter le rapprochement entre :

```text
présence réelle
```

et

```text
présence déclarée
```

pour les dates de cours passées.

Ce tableau est également intégré à l'export PDF encadrant.

---

# 18. Export PDF encadrant

Depuis le profil encadrant, l'export PDF permet de sélectionner les parties à exporter.

Les sections prévues sont notamment :

- TDB
- Objectifs
- Mon suivi

Le document peut également intégrer le tableau :

```text
Présence réelle / présence déclarée
```

pour les cours passés.

L'export utilise la fonction d'impression du navigateur afin d'éviter les blocages de fenêtres popup.

---

# 19. Messagerie

L'application comporte une fonction de communication entre adhérents et administrateurs.

## Côté adhérent

L'adhérent peut envoyer :

```text
Message pour l'administrateur
```

Les messages sont présentés sous forme de discussion.

## Côté administrateur

La page **Messages** permet :

- de consulter les conversations ;
- d'envoyer un nouveau message à un adhérent ;
- de répondre ;
- d'ajouter des commentaires ;
- d'afficher ou masquer les messages.

Un nouveau message est visible par défaut.

L'administrateur peut masquer un message.

Si aucun message visible n'existe pour un adhérent, la page Messages est masquée dans son interface.

Les échanges distinguent les messages provenant de l'administrateur et ceux provenant de l'adhérent.

---

# 20. Sécurité des messages

La table des messages et celle des commentaires utilisent des politiques RLS.

Un adhérent doit uniquement pouvoir :

- consulter ses propres conversations autorisées ;
- créer ses propres messages/commentaires ;
- ne pas modifier les messages appartenant à un autre utilisateur ou écrits par l'administrateur.

L'administrateur possède les droits nécessaires à la gestion des conversations.

Les colonnes de suivi comprennent notamment :

```text
sender_profile_id
sender_role
```

pour distinguer l'auteur et son rôle.

---

# 21. Notifications Push

L'application utilise les notifications Web Push.

Les principaux éléments techniques sont :

```text
sw.js
push_subscriptions
push_notification_log
notification_settings
```

Le navigateur doit autoriser les notifications et disposer d'un abonnement Push actif.

Le service Worker est responsable de la réception côté navigateur.

Les Edge Functions sont responsables de l'envoi.

---

# 22. Statut des notifications utilisateur

La page **Utilisateurs** affiche maintenant uniquement l'état synthétique des notifications :

```text
Actif
Inactif
Jamais activé
```

### Actif

Un abonnement Push actif est enregistré pour le compte.

### Inactif

Le compte possède un état Push mais celui-ci n'est actuellement pas actif.

### Jamais activé

Aucun abonnement Push n'a encore été enregistré pour le compte.

L'objectif de cette information est de permettre à l'administrateur de distinguer un compte ayant déjà utilisé les notifications d'un compte qui ne les a jamais activées.

---

# 23. Types de notifications

Les notifications gérées par l'application comprennent notamment :

```text
Rappel de présence
Nouvelle demande de créneau
Nouvelle demande de changement de statut
Décision de demande de créneau
Décision de demande de changement de statut
Présence confirmée
```

Certaines notifications peuvent être envoyées automatiquement.

Certaines peuvent être déclenchées manuellement depuis l'interface d'administration.

---

# 24. Notifications programmées

L'administrateur peut configurer des notifications programmées.

Le système prévoit jusqu'à trois programmes personnalisables.

Pour chaque programme, les paramètres peuvent comprendre :

- titre/contenu ;
- jours d'envoi ;
- type de semaine ;
- destinataires.

Les types de semaine utilisables sont notamment :

```text
Cours
Libre
Vacances
Férié
```

Les destinataires peuvent être :

```text
Adhérents
Encadrants
Administrateurs
```

---

# 25. Notifications manuelles

L'administrateur peut saisir un message et demander son envoi immédiat.

La notification manuelle permet de sélectionner les destinataires selon les rôles disponibles.

L'application utilise une Edge Function pour effectuer l'envoi.

Une fonction de secours existe dans le traitement Push afin de conserver la possibilité d'envoyer une notification lorsque le service de notification personnalisée rencontre un problème.

---

# 26. Bandeau d'information

L'administrateur dispose d'un bandeau d'information global.

Il peut :

- activer le bandeau ;
- le désactiver ;
- modifier son texte.

Le bandeau est prévu pour être visible sur les pages concernées de l'application.

---

# 27. Organisation de la page Notifications

La page Notifications est organisée en sous-parties :

## Adhérents

Notifications programmées destinées aux adhérents.

## Encadrants et administrateurs

Notifications destinées aux encadrants et administrateurs.

Cette partie contient également les paramètres des notifications liées aux actions.

Une plage générale d'envoi peut être définie afin de limiter les envois à certaines périodes :

- jours autorisés ;
- heure de début ;
- heure de fin.

## Bandeau - Push

Cette partie regroupe :

- les notifications manuelles ;
- le bandeau d'information ;
- l'envoi immédiat.

---

# 28. Fenêtres d'envoi

Les notifications automatiques sont contrôlées par une fenêtre d'envoi.

Le système utilise l'heure locale de Paris/Europe-Paris.

Exemple :

```text
12:00 → 13:00
```

Une notification peut être :

```text
ACTIVE
```

ou

```text
INACTIVE
```

selon le jour et l'heure du traitement.

Le cron Supabase est exécuté régulièrement, historiquement toutes les cinq minutes.

Une fenêtre suffisamment large doit donc être configurée si une notification doit pouvoir être déclenchée à différents moments de la journée.

---

# 29. Rappel de présence

Le rappel de présence vise les personnes qui n'ont pas encore répondu.

Il peut concerner :

- les adhérents ;
- les administrateurs/encadrants associés au créneau selon la configuration.

Le système détermine la prochaine date de cours pertinente et vérifie les réponses manquantes.

Le journal Push permet de suivre les tentatives et d'éviter les doublons.

---

# 30. Notifications liées aux demandes

Pour une nouvelle demande de créneau, le système recherche les demandes en attente et les destinataires correspondants.

Les journaux peuvent afficher par exemple :

```text
[push][new_slot_request]
fenêtre=ACTIVE/INACTIVE
demandes_en_attente=N
destinataires=N
```

Une fenêtre INACTIVE signifie que le traitement a été exécuté en dehors de la plage d'envoi autorisée ; ce message ne signifie pas nécessairement qu'il y a un problème avec l'abonnement Push.

---

# 31. Journalisation Push

Les Edge Functions écrivent des informations de diagnostic dans les logs Supabase.

Les logs permettent notamment de distinguer :

- démarrage du dispatch ;
- jour/heure ;
- fenêtre active ou inactive ;
- nombre de demandes ;
- nombre de destinataires ;
- profil ciblé ;
- abonnement ciblé ;
- résultat HTTP ;
- erreurs VAPID ;
- erreurs d'envoi.

La table de journalisation Push est utilisée pour la déduplication des notifications.

---

# 32. VAPID

Les notifications Web Push utilisent une paire de clés VAPID.

La clé privée est conservée dans les secrets de l'Edge Function et ne doit jamais être placée dans le code JavaScript public.

La fonction `push-notifications` contient la normalisation nécessaire pour traiter le format de clé utilisé par l'environnement Supabase.

Le format de clé privée doit rester cohérent avec la fonction de conversion/import utilisée par la version déployée.

En cas d'erreur du type :

```text
expected valid PKCS#8 data
```

ou :

```text
Key is not extractable
```

il faut vérifier en priorité :

- la valeur du secret VAPID ;
- le format de la clé privée ;
- la fonction Edge réellement déployée ;
- l'absence de caractères ou d'encodage incorrect dans le secret.

---

# 33. Edge Functions

Les fonctions importantes du projet comprennent notamment :

```text
supabase/functions/push-notifications/
supabase/functions/custom-notifications/
supabase/functions/send-account-email/
```

## push-notifications

Responsable notamment de :

- dispatch des notifications ;
- rappels de présence ;
- notifications liées aux demandes ;
- notifications de décision ;
- notifications de présence ;
- notifications manuelles ;
- envoi Push.

## custom-notifications

Responsable notamment de :

- notifications programmées personnalisables ;
- notifications manuelles personnalisées ;
- gestion des destinataires selon les rôles.

## send-account-email

Responsable de l'envoi des informations de compte lorsqu'elle est configurée.

Elle nécessite les secrets correspondant au fournisseur d'e-mail utilisé.

---

# 34. Cron Supabase

Un cron est utilisé pour déclencher périodiquement le traitement des notifications.

Le principe est :

```text
pg_cron
   ↓
pg_net
   ↓
Edge Function push-notifications
   ↓
lecture des paramètres
   ↓
détermination des destinataires
   ↓
Push Web
```

La fréquence historique du projet est de cinq minutes.

Les appels cron utilisent un secret de protection transmis à la fonction.

---

# 35. Base de données

Les principales tables utilisées par le projet comprennent notamment :

```text
members
profiles
attendance
slot_change_requests
status_change_requests
absence_periods
objective_comments
objective_reactions
admin_messages
admin_message_comments
push_subscriptions
push_notification_log
notification_settings
custom_notification_programs
```

D'autres tables de configuration peuvent exister selon les migrations installées.

---

# 36. Table members

Informations principales :

```text
id
name
habitual_slot
active
change_count
role
created_at
updated_at
```

`role` permet notamment de distinguer les adhérents des encadrants et administrateurs lors des traitements de présence.

Une synchronisation avec le rôle du profil existe afin de conserver une information cohérente.

---

# 37. Table profiles

Informations principales :

```text
id
member_id
display_name
role
active
created_at
updated_at
auth_email
must_change_password
password_changed_at
force_logout_at
credentials_email_sent_at
```

Le profil relie le compte Supabase Auth aux informations métier de l'application.

---

# 38. Row Level Security

Les règles RLS sont essentielles.

Elles protègent notamment :

- les profils ;
- les membres ;
- les présences ;
- les demandes ;
- les messages ;
- les commentaires de messages ;
- les abonnements Push.

Après toute modification du modèle de données, il faut vérifier les politiques RLS correspondantes.

Une erreur typique :

```text
New row violates row-level security policy
```

signifie généralement que l'opération SQL est techniquement correcte mais que la politique RLS refuse l'utilisateur courant.

---

# 39. Réinitialisation de la base

Une réinitialisation complète doit respecter les dépendances de clés étrangères.

Les tables qui référencent `members.id` doivent être traitées avant la suppression des membres.

Des dépendances existent notamment avec :

```text
profiles
attendance
slot_change_requests
absence_periods
status_change_requests
objective_comments
objective_reactions
```

Il ne faut pas supprimer manuellement des lignes dans `auth.users` pour simuler un compte applicatif.

Les comptes Auth doivent être gérés via Supabase Authentication.

---

# 40. E-mails d'identifiants

La fonction d'envoi des identifiants peut transmettre :

- le lien vers l'application ;
- le mot de passe temporaire ;
- les informations nécessaires à la première connexion.

La configuration historique utilise Resend.

Secrets attendus :

```text
RESEND_API_KEY
EMAIL_FROM
APP_URL
```

Le domaine d'expédition doit être validé auprès du fournisseur d'e-mail avant de pouvoir envoyer depuis ce domaine.

---

# 41. PWA et Service Worker

Le fichier :

```text
sw.js
```

gère notamment la partie PWA et Push.

Après une modification du Service Worker ou du code Push, un ancien Service Worker peut rester actif sur certains appareils.

En cas de comportement incohérent après redéploiement :

1. recharger l'application ;
2. vérifier le Service Worker ;
3. vérifier l'autorisation de notification ;
4. vérifier l'abonnement Push ;
5. vérifier les logs Supabase.

---

# 42. Cache navigateur

L'application utilise des paramètres de version sur `app.js`, par exemple :

```text
app.js?v=20260917-v139
```

L'objectif est d'éviter qu'un navigateur conserve une ancienne version du JavaScript après une mise en ligne.

Lors d'un nouveau déploiement, le numéro de version doit être augmenté.

Un rechargement forcé :

```text
Ctrl + F5
```

peut être nécessaire pour tester une nouvelle version.

---

# 43. Déploiement GitHub Pages

Principe général :

```text
Modification locale
      ↓
tests
      ↓
GitHub / main
      ↓
GitHub Pages
      ↓
application publique
```

Le contenu front-end doit être placé à l'emplacement prévu par le dépôt.

Après publication :

- vérifier le site public ;
- effectuer un rechargement forcé ;
- vérifier la version JavaScript chargée ;
- tester les fonctions principales.

---

# 44. Déploiement Supabase

Les modifications backend doivent être déployées séparément du front-end.

Pour une modification SQL :

```text
Supabase
→ SQL Editor
→ exécuter la migration
```

Pour une Edge Function :

```text
Supabase
→ Edge Functions
→ fonction concernée
→ déploiement
```

Il faut toujours distinguer :

```text
modification front-end
modification SQL
modification Edge Function
```

Une modification de l'un ne déploie pas automatiquement les deux autres.

---

# 45. Méthode de maintenance

Avant chaque nouvelle version :

1. conserver une copie de la version précédente ;
2. modifier uniquement les fichiers nécessaires ;
3. incrémenter le numéro de version ;
4. mettre à jour le cache-busting ;
5. vérifier la syntaxe JavaScript ;
6. vérifier les fichiers SQL ;
7. vérifier les Edge Functions ;
8. générer un ZIP contenant uniquement les fichiers ajoutés/modifiés lorsque demandé ;
9. tester en local lorsque possible ;
10. publier ;
11. tester sur ordinateur ;
12. tester sur téléphone pour les fonctions Push/PWA.

---

# 46. Diagnostic des notifications

## Notification non reçue

Vérifier dans l'ordre :

1. autorisation des notifications du navigateur ;
2. abonnement Push ;
3. état dans Utilisateurs ;
4. présence du Service Worker ;
5. plage d'envoi ;
6. jour autorisé ;
7. destinataire ;
8. logs de l'Edge Function ;
9. secret VAPID ;
10. journal Push.

## Log :

```text
fenêtre=INACTIVE
```

Cela signifie que l'envoi est bloqué par la plage horaire/journalière configurée.

## Log :

```text
demandes_en_attente=1 destinataires=2
```

Cela signifie que le système a trouvé une demande et deux destinataires, mais ne signifie pas à lui seul qu'une notification a été envoyée.

## Erreur VAPID

Exemples :

```text
expected valid PKCS#8 data
Key is not extractable
Vapid private key should be 32 bytes long when decoded
```

Vérifier le format du secret VAPID et que la dernière version de l'Edge Function est bien déployée.

---

# 47. Diagnostic des messages

Erreur :

```text
New row violates row-level security policy
```

Vérifier :

- que la migration des messages/commentaires est installée ;
- que la politique RLS correspond au rôle ;
- que `member_id` correspond au profil connecté ;
- que le message appartient bien à l'adhérent ;
- que le message est visible lorsque la politique l'exige ;
- que le front-end et le schéma Supabase sont de la même version.

Les messages adhérent et les commentaires adhérent ne doivent pas être resynchronisés comme s'ils étaient des messages administrateur.

---

# 48. Évolutions de version

Le projet a évolué par versions successives.

Principales étapes documentées :

- V50 : base du projet et préparation du déploiement ;
- V52–V63 : intégration Supabase, comptes et suivi des mots de passe ;
- V77–V79 : déploiement public, PWA et Push ;
- V106–V115 : notifications et traitement des changements de créneau ;
- V116–V120 : calendrier et événements ;
- V121 : envoi des identifiants ;
- V122–V126 : créneaux, navigation par rôle, anonymisation et filtrage des adhérents ;
- V128–V129 : demandes de créneau depuis Mon suivi ;
- V130–V133 : notifications personnalisées, messagerie, export PDF et corrections de synchronisation ;
- V134–V136 : corrections des notifications, fenêtres d'envoi et VAPID ;
- V137–V139 : affichage du statut Push sur la page Utilisateurs.

La numérotation est historique : elle ne doit pas être interprétée comme une liste exhaustive des modifications de chaque version.

---

# 49. Structure recommandée du dépôt

```text
don-bosco-perfectionnement/
│
├── index.html
├── app.js
├── styles.css
├── sw.js
├── README.md
│
└── supabase/
    │
    ├── *.sql
    │
    └── functions/
        ├── push-notifications/
        │   └── index.ts
        │
        ├── custom-notifications/
        │   └── index.ts
        │
        └── send-account-email/
            └── index.ts
```

Les fichiers SQL de migration doivent être conservés afin de disposer de l'historique des changements de schéma.

---

# 50. Principes de sécurité

Ne jamais :

- mettre une clé privée VAPID dans `app.js` ;
- mettre une clé de service Supabase dans le front-end ;
- stocker directement un mot de passe utilisateur dans une table métier ;
- considérer le masquage d'une interface comme une protection RLS ;
- supprimer directement les comptes Auth par une modification SQL non maîtrisée.

Toujours :

- utiliser Supabase Auth pour les comptes ;
- utiliser RLS pour protéger les données ;
- conserver les secrets côté Edge Functions ;
- vérifier les rôles côté serveur pour les opérations sensibles ;
- contrôler les permissions des Edge Functions ;
- conserver des sauvegardes avant les opérations de maintenance importantes.

---

# 51. Tests fonctionnels essentiels

Après un nouveau déploiement, tester au minimum :

## Adhérent

- connexion ;
- changement de mot de passe ;
- Présences ;
- anonymisation ;
- Mon suivi ;
- demande de changement de créneau ;
- Mes demandes ;
- Objectifs ;
- Calendrier ;
- Événements ;
- Messages ;
- activation Push.

## Encadrant

- connexion ;
- TDB ;
- Objectifs ;
- Mon suivi ;
- Présences ;
- Demandes ;
- Calendrier ;
- Événements ;
- export PDF.

## Administrateur

- Utilisateurs ;
- gestion des rôles ;
- Présences ;
- Demandes ;
- Calendrier ;
- Événements ;
- Notifications ;
- Messages ;
- envoi Push ;
- statut Push des utilisateurs.

---

# 52. État de référence V139

La V139 correspond à l'état actuellement documenté dans ce README.

La page Utilisateurs affiche pour chaque compte le statut synthétique des notifications :

```text
Actif
Inactif
Jamais activé
```

Le principe retenu est volontairement simple : la page Utilisateurs ne doit pas afficher de commande permettant à l'administrateur de forcer l'activation du Push. L'activation initiale dépend de l'appareil/navigateur de l'utilisateur.

---

# 53. Conclusion

Don Bosco - Perfectionnement est une application de gestion associative combinant :

- gestion des comptes ;
- gestion des rôles ;
- gestion des créneaux ;
- présence ;
- suivi ;
- demandes ;
- calendrier ;
- événements ;
- objectifs ;
- messagerie ;
- notifications Web Push ;
- automatisations serveur ;
- export PDF ;
- PWA.

Le fonctionnement repose sur une séparation claire entre :

```text
Interface web
    +
Supabase PostgreSQL / RLS
    +
Supabase Authentication
    +
Edge Functions
    +
Web Push
```

Cette architecture permet de faire évoluer séparément l'interface, les données et les traitements serveur tout en conservant une application adaptée à l'utilisation quotidienne sur ordinateur et téléphone.
