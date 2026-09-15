# Don Bosco - Perfectionnement V121

## Email des identifiants
- Depuis la page **Utilisateurs**, seul l’administrateur peut envoyer les identifiants de chaque compte existant.
- L’action réinitialise le mot de passe temporaire à **123456**, impose son changement à la première connexion, puis envoie un email avec le lien de l’application et le mot de passe temporaire.
- La date du dernier envoi est affichée sur la fiche du compte.
- La date est stockée dans `public.profiles.credentials_email_sent_at`.
- Fonction Supabase ajoutée : `send-account-email`.

### Configuration Supabase requise
Déployer la fonction et renseigner les secrets :
- `RESEND_API_KEY` : clé API Resend
- `EMAIL_FROM` : expéditeur vérifié, par exemple `Don Bosco - Perfectionnement <noreply@votre-domaine.fr>`
- `APP_URL` : `https://contactdbbn.github.io/don-bosco-perfectionnement/`

Exécuter également `supabase/v121-email-credentials.sql` dans Supabase SQL Editor.
