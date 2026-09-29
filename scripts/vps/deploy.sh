#!/bin/bash
set -euo pipefail
cd /var/www/miapp
git pull --ff-only origin main
npm ci
npm run build
cp scripts/vps/nginx.conf nginx.conf
docker build -t lapartideta-golf .
docker rm -f lapartideta-app || true
docker run -d --name lapartideta-app --restart unless-stopped \
  --network generated_default \
  -e VIRTUAL_HOST=golf.arinsaldev.com,omikigolf.com,www.omikigolf.com,app.omikigolf.com \
  -e VIRTUAL_HOST_NAME=lapartideta \
  -e VIRTUAL_PORT=80 \
  -e LETSENCRYPT_HOST=golf.arinsaldev.com,omikigolf.com,www.omikigolf.com,app.omikigolf.com \
  -e LETSENCRYPT_EMAIL=fede.baeza@gmail.com \
  lapartideta-golf
docker kill -s HUP nginx-gen
