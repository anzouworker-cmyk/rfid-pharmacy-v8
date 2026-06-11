RFID Pharmacy Web SaaS No-Data V8

Objectif:
- Application SaaS web avec login/abonnement.
- Aucune donnée métier sauvegardée dans le cloud.
- Produits et associations RFID sauvegardés localement dans le navigateur.
- Scan code-barres USB + scan EPC RFID.
- Association automatique code-barres -> EPC.
- Inventaire présent/manquant via import EPC détectés.
- Export/import CSV associations.
- Sauvegarde complète projet JSON.
- Restauration complète projet JSON.

Comptes par défaut:
demo / demo123
admin / admin123

Backend:
cd backend
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload

Frontend:
cd frontend
npm install
npm run dev

Ouvrir:
http://localhost:5173

Flux:
1. Login SaaS.
2. Importer CSV pharmacie.
3. Scanner code-barres produit puis ENTER.
4. Scanner EPC RFID puis ENTER.
5. Association sauvegardée localement.
6. Aller dans Données locales.
7. Cliquer Sauvegarder projet JSON.
8. Sur un autre PC, Restaurer projet JSON.
9. Importer fichier EPC détectés.
10. Comparer présent/manquant.
11. Exporter résultat CSV.

Important:
Les données produits/EPC restent dans le navigateur ou dans les fichiers JSON/CSV de la pharmacie.
Le serveur garde seulement les comptes et abonnements.
