#!/bin/bash
# ============================================================
# Tramwaje Wodne — Setup serwera (Ubuntu 22.04+)
# Uruchom RAZ na nowym serwerze: bash setup-server.sh
# ============================================================

set -e

echo "🚢 Tramwaje Wodne — Setup serwera"
echo "=================================="

# 1. Aktualizacja systemu
echo "📦 Aktualizacja systemu..."
sudo apt update && sudo apt upgrade -y

# 2. Node.js 20 LTS
echo "📦 Instalacja Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 3. PM2
echo "📦 Instalacja PM2..."
sudo npm install -g pm2
pm2 startup systemd -u $USER --hp $HOME

# 4. Caddy (reverse proxy + auto-SSL)
echo "📦 Instalacja Caddy..."
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy

# 5. Firewall
echo "🛡️ Firewall..."
sudo ufw allow 22    # SSH
sudo ufw allow 80    # HTTP (redirect → HTTPS)
sudo ufw allow 443   # HTTPS
sudo ufw --force enable

echo ""
echo "✅ Serwer gotowy!"
echo "   Następny krok: skopiuj pliki i uruchom deploy.sh"
echo ""
echo "   Na swoim komputerze:"
echo "   scp -r server/ client/ deploy/ USER@SERWER:/opt/tramwajewodne/"
echo ""
echo "   Na serwerze:"
echo "   cd /opt/tramwajewodne"
echo "   bash deploy/deploy.sh"
