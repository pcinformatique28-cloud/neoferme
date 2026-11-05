#!/data/data/com.termux/files/usr/bin/bash
# Usage : bash deploy-termux.sh   (depuis le dossier systep/)
set -e
pkg update -y && pkg install -y git nodejs openssh
read -p "URL du dépôt PC-INFORMATIQUE (https://github.com/USER/REPO.git) : " REPO
git config --global user.email "pcinformatique28@gmail.com"
git config --global user.name "PC-INFORMATIQUE"
SRC="$(pwd)"; cd ~ && rm -rf deploy-tmp
git clone "$REPO" deploy-tmp && cd deploy-tmp
git checkout -b feature/agri-track-systep
mkdir -p systep && cp -r "$SRC"/. systep/ && rm -f systep/.env
git add systep && git commit -m "Ajout SYSTEP - Agri-Track 241"
echo ">> Mot de passe = votre Personal Access Token GitHub (pas le mot de passe du compte)"
git push -u origin feature/agri-track-systep
echo "GitHub OK."
# Cloudflare Pages (optionnel) : exporter CLOUDFLARE_API_TOKEN et CLOUDFLARE_ACCOUNT_ID avant
if [ -n "$CLOUDFLARE_API_TOKEN" ]; then
  npx --yes wrangler pages deploy systep --project-name systep --branch main
else
  echo "Cloudflare : dashboard > Workers & Pages > Créer > Pages > connecter le dépôt, dossier de sortie : systep"
fi
