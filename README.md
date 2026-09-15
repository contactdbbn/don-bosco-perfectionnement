# Don Bosco - Perfectionnement V115

## Correction du traitement forcé à 13h30

V115 corrige le traitement forcé de V114 sur deux points :

- **Seul le prochain jour de présence Cours ou Libre est traité.** Les semaines suivantes restent en attente. Une semaine `Cours annulé` compte comme `Libre`, conformément aux règles de présence.
- Pour une demande vers un créneau cible, le contrôle porte **uniquement sur les adhérents actifs de ce créneau cible**.
- Pour ce contrôle, seuls les statuts **Présent** ou **Absent** sont considérés comme une réponse définitive. **À confirmer bloque** donc la demande.
- Les demandes sont traitées dans l'ordre de priorité : nombre de changements déjà effectués, puis date/heure de la demande.
- La capacité de contrôle reste fixée à **20 présents** : une demande est acceptée si le créneau cible est sous 20, puis les suivantes sont refusées lorsque le créneau atteint 20.
- Les demandes d'une semaine qui n'est pas la prochaine date Cours/Libre ne sont pas modifiées.

Les autres fonctionnalités de V114 sont conservées.


## Correction V115
- Cache-busting corrigé : index.html charge explicitement app.js?v=20260915-v115.
- Service Worker passé en cache don-bosco-v115 et shell mis à jour vers app.js?v=20260915-v115.
- Cette correction évite que le navigateur/service worker continue à exécuter une ancienne version du traitement forcé.


## Correction V115
- Une demande acceptée réserve immédiatement une place dans le créneau cible pendant le traitement. Ainsi, avec 19/20 et deux demandes, une seule est acceptée et la suivante est refusée, même si le demandeur est encore « À confirmer ».
