# Don Bosco - Perfectionnement — V135

Corrections et évolutions :
- Messages adhérent ↔ administrateur : saisie depuis Profil, Nouveau message côté administrateur, discussions, afficher/masquer.
- Notifications séparées en 3 sous-pages : Adhérents ; Encadrants et administrateurs ; Manuelles et bandeau.
- Restauration des notifications liées aux actions dans la sous-page Encadrants et administrateurs.
- Envoi manuel avec secours vers `push-notifications` si `custom-notifications` est indisponible.
- Export PDF Encadrant rendu non bloquant par popup : impression directe depuis une vue d'export.
- SQL `supabase/v131-messages.sql` pour les champs d'expéditeur.


## V135
- Commentaires sur chaque message, utilisables par l’adhérent et l’administrateur.
- La page Messages adhérent est masquée lorsqu’aucun message visible ne reste.
- Onglet Notifications renommé « Bandeau - Push ».
- Correction Push : normalisation de la clé privée VAPID côté Edge Function (base64url/base64, hex 64 caractères ou PKCS#8 PEM/base64) et diagnostic explicite si la clé reste invalide.
- SQL : supabase/v134-messages-comments.sql à exécuter avant le déploiement.
