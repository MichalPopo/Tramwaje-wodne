#!/bin/bash
# ============================================================
# Tramwaje Wodne — Skrypt deploymentu
# Uruchom na serwerze: bash deploy.sh
# ============================================================

set -e

APP_DIR="/opt/tramwajewodne"
LOG_DIR="/var/log/tramwajewodne"
BACKUP_DIR="/opt/tramwajewodne/backups"

echo "🚢 Tramwaje Wodne — Deployment"
echo "================================"

# 1. Katalogi
echo "📁 Tworzenie katalogów..."
sudo mkdir -p $APP_DIR $LOG_DIR $BACKUP_DIR
sudo chown -R $USER:$USER $APP_DIR $LOG_DIR $BACKUP_DIR

# 2. Kopiowanie plików (jeśli nie istnieją)
if [ ! -f "$APP_DIR/server/package.json" ]; then
    echo "📦 Skopiuj pliki projektu do $APP_DIR"
    echo "   scp -r server/ client/ deploy/ $USER@serwer:$APP_DIR/"
    exit 1
fi

# 3. Instalacja zależności serwera (z devDependencies dla tsx)
echo "📦 Instalacja zależności serwera..."
cd $APP_DIR/server
npm ci

echo "📦 Instalacja zależności frontendu..."
cd $APP_DIR/client
npm ci

# 4. Build frontend
echo "🔨 Build frontendu..."
cd $APP_DIR/client
npm run build

# 5. .env
if [ ! -f "$APP_DIR/server/.env" ]; then
    echo "⚠️  Skopiuj .env.production → $APP_DIR/server/.env i uzupełnij!"
    echo "   cp deploy/.env.production $APP_DIR/server/.env"
    echo "   nano $APP_DIR/server/.env"
    exit 1
fi

# 6. PM2 (uruchamia serwer przez tsx — bez potrzeby tsc build)
echo "🔄 Uruchamianie PM2..."
cd $APP_DIR
pm2 delete tramwajewodne-api 2>/dev/null || true
pm2 start deploy/ecosystem.config.cjs
pm2 save

# 7. Caddy
echo "🔒 Konfiguracja Caddy..."
sudo cp $APP_DIR/deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl restart caddy

# 8. Backup cron (co 6h, kasowanie >7 dni)
echo "💾 Konfiguracja backupu..."
CRON_CMD="0 */6 * * * cp $APP_DIR/server/data/tramwajewodne.db $BACKUP_DIR/tramwajewodne_\$(date +\%Y\%m\%d_\%H\%M).db && find $BACKUP_DIR -name '*.db' -mtime +7 -delete"
(crontab -l 2>/dev/null | grep -v "tramwajewodne.db"; echo "$CRON_CMD") | crontab -

echo ""
echo "✅ Deployment zakończony!"
echo "   API:      http://localhost:3001/api/health"
echo "   Frontend: https://tramwajewodne.pl"
echo "   PM2:      pm2 status"
echo "   Logi:     pm2 logs tramwajewodne-api"
echo "   Backup:   ls -la $BACKUP_DIR"
