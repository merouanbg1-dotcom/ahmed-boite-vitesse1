# Ahmed Boîte Vitesse — site + administration

Site public (FR / AR / EN) + interface admin en temps réel.
Base de données : **Supabase**. Hébergement : **Vercel**. Aucun serveur à gérer.

```
index.html          → le site public (accueil, rendez-vous, pièces, suivi)
admin/index.html    → l'interface admin  (adresse : votre-site/admin)
config.js           → les 2 clés Supabase à coller (étape 2)
images/             → logo et photos
supabase/schema.sql → la base de données (étape 1)
vercel.json         → réglages Vercel
```

---

## Étape 1 — Créer la base Supabase (5 min)

1. Allez sur **supabase.com** › *Start your project* › connectez-vous (GitHub ou email).
2. *New project* : nom `ahmed-boite-vitesse`, choisissez un mot de passe de base, région **Frankfurt (eu-central-1)** (la plus proche de l'Algérie). *Create*.
3. Menu de gauche › **SQL Editor** › *New query* › collez **tout** le fichier `supabase/schema.sql` › **Run**.
   Vous devez voir « Success ». (On peut le relancer sans risque.)
4. Menu › **Authentication** › *Users* › **Add user** › *Create new user* :
   email + mot de passe du patron, cochez **Auto Confirm User**.
5. Retournez dans **SQL Editor** et lancez (avec le bon email) :

   ```sql
   insert into public.admins (user_id, full_name)
   select id, 'Ahmed' from auth.users where email = 'VOTRE_EMAIL@exemple.com';
   ```
   Refaites 4 + 5 pour chaque employé qui doit accéder à l'admin.
6. Sécurité : **Authentication** › *Sign In / Providers* › désactivez **Allow new users to sign up**
   (seuls les comptes que vous créez pourront se connecter).

## Étape 2 — Coller les clés dans `config.js` (1 min)

Supabase › **Project Settings** › **API** (ou *Data API*) :

- *Project URL* → `supabaseUrl`
- clé **anon / public** → `supabaseAnonKey`

```js
window.ABV_CONFIG = {
  supabaseUrl: 'https://abcdefgh.supabase.co',
  supabaseAnonKey: 'eyJhbGciOi...',
  siteUrl: 'https://ahmed-boite-vitesse.vercel.app'   // l'adresse finale du site
};
```

> La clé *anon* est faite pour être publique : la sécurité vient des règles du fichier SQL
> (le public peut seulement envoyer un rendez-vous et suivre SON dossier avec code + téléphone).
> Ne mettez **jamais** la clé `service_role` dans ce fichier.

## Étape 3 — Mettre en ligne sur Vercel (3 min)

**Méthode simple (GitHub)**
1. Sur **github.com** › *New repository* › nom `ahmed-boite-vitesse` › *Create*.
2. *uploading an existing file* › glissez **le contenu** du dossier (index.html, admin, images, config.js, vercel.json…) › *Commit*.
3. Sur **vercel.com** › connectez-vous avec GitHub › *Add New… › Project* › choisissez le dépôt › **Deploy**
   (aucun réglage : Framework = *Other*, pas de commande de build).
4. Vercel donne l'adresse, ex. `https://ahmed-boite-vitesse.vercel.app`.
   Mettez-la dans `siteUrl` de `config.js` (modifiez le fichier sur GitHub : Vercel se met à jour tout seul).

**Méthode ligne de commande** (si Node.js est installé) :
```bash
npm i -g vercel
cd ahmed-boite-vitesse
vercel --prod
```

**Nom de domaine** (ex. `ahmedboitevitesse.com`) : Vercel › Project › *Settings* › *Domains* › *Add*.

---

## Utilisation au quotidien

Ouvrez **votre-site/admin** et connectez-vous.

| Écran | À quoi ça sert |
|---|---|
| **Tableau de bord** | Nouveaux RDV, RDV du jour, véhicules à l'atelier, devis en attente, véhicules prêts |
| **Rendez-vous** | Les demandes du site arrivent **en direct** (son + alerte). Confirmer / annuler, WhatsApp au client, **Créer le dossier** quand la voiture arrive |
| **Dossiers & suivi** | Chaque voiture a un code (ex. `ABV-1001`). Changez l'étape, écrivez le diagnostic, **envoyez le devis** : le client le voit sur le site et peut le valider ; vous êtes alerté en direct. Boutons WhatsApp prêts : lien de suivi, devis, véhicule prêt |
| **Factures** | Nouvelle facture (ou « Créer la facture » depuis un dossier) : client, lignes, remise, TVA, droit de timbre, paiement, statut. Numéro automatique `FAC-2026-0001` (repart à 1 chaque année). **Télécharger le PDF** en un clic ; « Imprimer » pour les noms en arabe |
| **Paramètres** | Nom, adresse, téléphones, **RC, NIF, NIS, AI**, RIB, TVA par défaut : imprimés sur chaque facture |
| **Pièces** | Ajouter / modifier / masquer les pièces du site, photo (téléversée), stock, prix interne (jamais affiché) |

**Côté client** : *Suivi* sur le site → code du dossier + téléphone → il voit l'étape, le diagnostic,
le montant du devis et peut le valider. La page se met à jour toute seule.

Astuce : sur le téléphone du patron, ouvrez `votre-site/admin` dans Chrome › menu ⋮ › *Ajouter à l'écran d'accueil*
et cliquez *Activer les notifications* dans l'admin.

> **Déjà installé avant l'ajout des factures ?** Relancez simplement tout `supabase/schema.sql`
> dans le SQL Editor : il ajoute les nouvelles tables sans toucher aux données existantes.

> Les totaux des factures sont recalculés par la base (impossible de les fausser depuis le navigateur).
> Faites vérifier par votre comptable le taux de TVA et le droit de timbre à appliquer.

## Modifier les infos

- Numéros, horaires, lien TikTok, coordonnées : `index.html`, bloc `const INFO` en haut du script.
- Textes FR / AR / EN : `index.html`, bloc `const T`.
- Couleurs : `index.html`, bloc `:root` en haut du style.

## Limites connues

- Supabase gratuit : le projet se met en pause après 7 jours **sans aucune visite** ; il suffit de le relancer
  depuis le tableau Supabase (ou passer au plan Pro).
- Le site sans `config.js` rempli fonctionne quand même (RDV envoyés par WhatsApp), mais sans admin ni suivi.
