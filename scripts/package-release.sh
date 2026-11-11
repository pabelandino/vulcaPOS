#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Building vulcapos:latest (compiled image, no TypeScript or React source in the final stage)"
docker compose -f docker-compose.yml -f docker-compose.prod.yml build app

mkdir -p release
rm -f release/vulcapos-app.tar.gz
docker save vulcapos:latest | gzip > release/vulcapos-app.tar.gz
cp deploy/docker-compose.yml deploy/LEEME.md deploy/.env.example release/
cp .env.example release/.env.example

echo "Release ready in release/"
echo "Copy that folder to the other machine. It does not include the source code."
