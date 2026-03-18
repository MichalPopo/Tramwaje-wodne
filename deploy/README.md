# 🚢 Tramwaje Wodne — Wariant B: PC + Cloudflare Tunnel

## Jak to działa

```
[Twój PC] ──── Cloudflare Tunnel ────▶ [Internet]
   │                                        │
   ├─ API (port 3001)              panel.twojafirma.pl
   └─ Frontend (port 5173)         (HTTPS, za darmo)
```

---

## ⚡ Szybki start (codzienne użycie)

1. **Kliknij 2x na `START.bat`** w folderze projektu
2. **Uruchom tunnel** (po jednorazowej konfiguracji):
   ```
   cloudflared tunnel run tramwaje
   ```
3. Gotowe! Otwórz `https://panel.twojafirma.pl` na telefonie

---

## 🔧 Jednorazowa konfiguracja (30 min)

### Krok 1: Zainstaluj cloudflared na swoim PC

Pobierz: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

Lub przez winget:
```powershell
winget install Cloudflare.cloudflared
```

### Krok 2: Zaloguj się do Cloudflare

```powershell
cloudflared tunnel login
```
Otworzy się przeglądarka → zaloguj się → wybierz domenę.

### Krok 3: Utwórz tunnel

```powershell
cloudflared tunnel create tramwaje
```
Zapamiętaj **TUNNEL_ID** z outputu.

### Krok 4: Skonfiguruj tunnel

Utwórz plik `%USERPROFILE%\.cloudflared\config.yml`:
```yaml
tunnel: TUNNEL_ID
credentials-file: C:\Users\TWOJ_USER\.cloudflared\TUNNEL_ID.json

ingress:
  - hostname: panel.twojafirma.pl
    service: http://localhost:5173
  - hostname: api.twojafirma.pl
    service: http://localhost:3001
  - service: http_status:404
```

### Krok 5: DNS w Cyberfolks

W panelu Cyberfolks → DNS → dodaj rekordy:
```
panel    CNAME    TUNNEL_ID.cfargotunnel.com
api      CNAME    TUNNEL_ID.cfargotunnel.com
```

### Krok 6: Skonfiguruj CORS i API URL

W pliku `server/.env` ustaw:
```
CORS_ORIGIN=https://panel.twojafirma.pl
```

W pliku `client/src/api.ts` zmień BASE_URL na produkcji:
```
const BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3001/api'
    : 'https://api.twojafirma.pl/api';
```

### Krok 7: Uruchom!

```powershell
# Terminal 1: Start serwera (lub kliknij START.bat)
cd d:\TramwajeWodne

# Terminal 2: Start tunnel
cloudflared tunnel run tramwaje
```

---

## 📱 Instalacja na telefonie

1. Otwórz `https://panel.twojafirma.pl` w Chrome
2. Kliknij `⋮` (menu) → **„Dodaj do ekranu głównego"**
3. Pojawi się ikona jak normalna apka
4. Otwiera się w trybie pełnoekranowym (bez paska przeglądarki)

---

## ❓ FAQ

**Czy muszę mieć PC włączony?**
Tak — system działa na Twoim PC. Jak wyłączysz, panel nie działa.

**Czy to bezpieczne?**
Tak — Cloudflare Tunnel szyfruje połączenie (HTTPS), a login/hasło chroni dostęp.

**Ile osób może korzystać jednocześnie?**
Bez problemu 10-20 osób. sql.js i Express dają radę.

**Jak zaktualizować?**
Zamknij START.bat → edytuj pliki → uruchom ponownie.
