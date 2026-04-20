# Déploiement du système de paiement Stripe

## 1. Variables d'environnement (Supabase Edge Functions)

Dans le dashboard Supabase → Settings → Edge Functions → Secrets, ajouter :

| Clé | Valeur |
|-----|--------|
| `STRIPE_SECRET_KEY` | `sk_live_...` (Stripe Dashboard → Developers → API keys) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` (généré à l'étape 4) |
| `STRIPE_PRICE_PDF_WATCH` | ID du prix Stripe pour le plan 2 € unique |
| `STRIPE_PRICE_FULL` | ID du prix Stripe pour l'abonnement 8 €/mois |
| `SITE_URL` | `https://entrailment.com` |

Les variables `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont injectées automatiquement.

---

## 2. Créer les produits Stripe

Dans Stripe Dashboard → Products :

**Produit 1 — PDF + Montre**
- Nom : `En Trailment — PDF + Montre`
- Prix : 2,00 € · Paiement unique
- Copier le `price_id` → `STRIPE_PRICE_PDF_WATCH`

**Produit 2 — Suivi complet**
- Nom : `En Trailment — Suivi complet`
- Prix : 8,00 € · Récurrent · Mensuel
- Copier le `price_id` → `STRIPE_PRICE_FULL`

---

## 3. Appliquer la migration SQL

Dans Supabase Dashboard → SQL Editor, exécuter le contenu de :
`supabase/migrations/20250414_subscriptions.sql`

---

## 4. Déployer les Edge Functions

```bash
# Installer Supabase CLI si besoin
npm install -g supabase

# Se connecter
supabase login

# Lier au projet
supabase link --project-ref zjxrcbnwdbakmmpctwzx

# Déployer
supabase functions deploy create-checkout-session
supabase functions deploy stripe-webhook
supabase functions deploy customer-portal
```

---

## 5. Configurer le webhook Stripe

Dans Stripe Dashboard → Developers → Webhooks → Add endpoint :

- URL : `https://zjxrcbnwdbakmmpctwzx.supabase.co/functions/v1/stripe-webhook`
- Événements à écouter :
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`

Copier le **Signing secret** (`whsec_...`) → `STRIPE_WEBHOOK_SECRET`

---

## 6. Configurer le Customer Portal Stripe

Dans Stripe Dashboard → Settings → Billing → Customer portal :
- Activer : annulation d'abonnement, mise à jour de la carte de paiement
- Enregistrer

---

## 7. Vérification

1. Ouvrir `https://entrailment.com` → Tarifs
2. Cliquer "Obtenir mon PDF + Montre" → Stripe Checkout s'ouvre
3. Payer avec la carte test `4242 4242 4242 4242`
4. Vérifier le retour vers `/?payment=success&tier=pdf_watch`
5. Vérifier dans Supabase → Table `user_subscriptions` que `tier = 'pdf_watch'`
