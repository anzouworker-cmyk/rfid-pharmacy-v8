Smart Inventory V33.11 - Logo long en React/CSS (sans image)

Corrections incluses:
- Logo Smart Inventory reformé comme le modèle fourni: texte horizontal long, Smart en bleu marine, Inventory en bleu-vert.
- Sous-titre en majuscules espacées: INVENTORY MANAGEMENT PLATFORM avec lignes horizontales.
- Logo codé directement en React + CSS, pas une image PNG.
- Logo appliqué sur l'écran de connexion et dans la sidebar.
- Mode sidebar réduite: badge compact SI en CSS.
- Conserve les corrections V33.10: carousel publicités dashboard + suppression Couverture globale.

Déploiement:
1. git add .
2. git commit -m "V33.11 - code based long logo"
3. git push origin staging
4. Redéployer Render backend puis Vercel frontend.

Vérification backend:
https://rfid-pharmacy-v8-staging.onrender.com/health
version attendue: V33.11_CODE_LONG_LOGO

---

Smart Inventory V33.10 - Carousel publicités dashboard

Corrections incluses:
- Suppression du texte/icône “Couverture globale” au centre du donut, seul le pourcentage reste affiché.
- Le dashboard affiche maintenant toutes les publicités actives avec image.
- Défilement automatique des images publiées toutes les 5 secondes.
- Navigation manuelle avec flèches et points.
- Publier une nouvelle publicité ne désactive plus les anciennes: elles restent dans le carousel si elles sont actives.
- Conserve les corrections V33.9: CORS strict, login, upload image, migration DB ai_premium.

Déploiement:
1. git add .
2. git commit -m "V33.10 - dashboard ads carousel"
3. git push origin staging
4. Redéployer Render backend puis Vercel frontend.

Vérification backend:
https://rfid-pharmacy-v8-staging.onrender.com/health
version attendue: V33.10_DASHBOARD_AD_CAROUSEL

---

Smart Inventory V33.8 - Correction finale module publicité + diagnostic API

Corrections incluses:
- FRONTEND_ORIGINS n'est PAS "*" par défaut.
- CORS strict: le backend accepte seulement les origines listées explicitement dans FRONTEND_ORIGINS.
- Correction robuste de l'écran Publicité Dashboard.
- Correction du message "Erreur chargement publicité": le backend lit maintenant les anciennes bases Render/Postgres même si la table dashboard_content est ancienne.
- /platform/dashboard-content et /dashboard/content sont plus tolérants aux anciennes colonnes manquantes.
- /health affiche la version, les origines CORS, et les colonnes dashboard_content pour diagnostiquer Render.
- Upload image conservé: Cloudinary si configuré, stockage local sinon, fallback Data URL côté frontend.
- Validation frontend: une URL externe doit être un lien direct d'image (.png, .jpg, .jpeg, .webp). Une page Pixabay/Unsplash ne fonctionne pas comme image.
- Corrections précédentes conservées: login demo/admin, bouton configurable, dimensions dynamiques.

Comptes par défaut:
- demo / demo123
- admin / admin123

Important CORS Render:
Dans Render, il faut préciser l'origine exacte Vercel, sans slash final.
Exemple:
FRONTEND_ORIGINS=https://rfid-pharmacy-v8-staging-j27c9z1js-anzou-s-projects.vercel.app,http://localhost:5173,http://127.0.0.1:5173
CORS_ORIGIN_REGEX=

Ne pas mettre de slash final:
BON:     https://mon-site.vercel.app
MAUVAIS: https://mon-site.vercel.app/

Variables Render backend importantes:
DATABASE_URL=...
SECRET_KEY=...
BACKEND_PUBLIC_URL=https://votre-backend-render.onrender.com
RESET_BOOTSTRAP_ACCOUNTS=true
DEMO_USERNAME=demo
DEMO_PASSWORD=demo123
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
FRONTEND_ORIGINS=https://votre-frontend-vercel.app,http://localhost:5173,http://127.0.0.1:5173
CORS_ORIGIN_REGEX=

Variable Vercel frontend importante:
VITE_API_URL=https://votre-backend-render.onrender.com

Déploiement:
1) Copier/remplacer les fichiers du projet.
2) Commit/push:
   git add .
   git commit -m "V33.8 - fix ads loading and image diagnostics"
   git push origin staging
3) Redéployer Render backend.
4) Redéployer Vercel frontend.

Test rapide après Render:
Ouvrir https://votre-backend-render.onrender.com/health
La réponse doit contenir:
- version = V33.8_ADS_DIAGNOSTIC_FIX
- cors_origins avec votre URL Vercel exacte
- db.dashboard_columns avec image_url, extra_config, cta_label, cta_url


V33.9_ADS_DB_SCHEMA_FIX
- Corrige le 500 à la publication publicité causé par une ancienne table dashboard_content sans colonne ai_premium.
- Ajoute une migration automatique dashboard_content.ai_premium.
- Sauvegarde les publicités avec une insertion SQL explicite plus robuste.
