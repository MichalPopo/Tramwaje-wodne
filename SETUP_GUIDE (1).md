# OpenClaw + Google Cloud (Vertex AI + OAuth) — Kompletna Instrukcja Od Zera

> [!IMPORTANT]
> Instrukcja zakłada, że zaczynasz od zupełnego zera — bez konta Google Cloud, bez projektu GCP, bez serwera.
> Po wykonaniu wszystkich kroków będziesz miał działające OpenClaw z:
> - Google OAuth (logowanie przez Google)
> - Vertex AI jako primary LLM provider (ADC, service account)
> - Google AI Studio jako fallback (GEMINI_API_KEY)
> - Łańcuch failover modeli gemini-3.x

---

> **Legenda:** Każdy rozdział/podrozdział jest oznaczony:
> - 🤖 — **Agent Antigravity może wykonać samodzielnie** (komendy terminala, edycja plików na serwerze)
> - 👤 — **Wymaga ręcznej akcji użytkownika** (przeglądarka, Google Cloud Console, panel Hostinger)
> - 🤖 + 👤 — Część kroków agent, część użytkownik

## 0. Wymagania Wstępne

| Co potrzebujesz | Opis |
|---|---|
| **Konto Google (Gmail)** | Potrzebne do Google Cloud, OAuth, AI Studio |
| **Karta kredytowa/debetowa** | Wymagana do aktywacji Google Cloud Free Trial ($300 / 90 dni) — **NIE zostanie obciążona** bez Twojej zgody |
| **VPS z Dockerem** | Serwer Linux z zainstalowanym Docker + Docker Compose + Traefik (reverse proxy) |
| **Domena / hostname** | Np. `openclaw.example.com` — do HTTPS i OAuth redirect URI |

### 0.1 Generowanie Klucza SSH (Dostęp do Serwera) — 🤖 + 👤

> [!IMPORTANT]
> Klucz SSH jest potrzebny do łączenia się z VPS i uploadowania plików (credentials, patche). Jeśli już masz klucz SSH skonfigurowany z VPS — pomiń ten krok.

**Linux / macOS / Windows (z OpenSSH):**

1. Otwórz terminal (lub PowerShell na Windows) i uruchom:
   ```bash
   ssh-keygen -t ed25519 -C "your_email@example.com"
   ```
   Zastąp `your_email@example.com` swoim prawdziwym adresem email.

2. Gdy zapyta o ścieżkę pliku:
   - **Linux/macOS** — naciśnij Enter dla domyślnej (`~/.ssh/id_ed25519`)
   - **Windows** — Enter dla domyślnej (`C:\Users\TWOJ_USER\.ssh\id_ed25519`)
   - Lub podaj własną ścieżkę, np. `~/.ssh/openclaw_vps`

3. **Ustaw passphrase** (zalecane dla bezpieczeństwa) i potwierdź.

4. Zostaną utworzone dwa pliki:
   - **Klucz prywatny**: `~/.ssh/id_ed25519` (lub podana ścieżka) — **nigdy nie udostępniaj!**
   - **Klucz publiczny**: `~/.ssh/id_ed25519.pub` — ten dodajesz do serwera

**Wyświetlenie klucza publicznego:**
```bash
cat ~/.ssh/id_ed25519.pub
```
Skopiuj całą zawartość (zaczyna się od `ssh-ed25519 AAAA...`).

**Dodanie klucza do VPS (Hostinger):**

1. Zaloguj się do panelu Hostinger → **VPS** → wybierz swój serwer
2. Przejdź do **Settings** → **SSH Keys**
3. Kliknij **„Add SSH Key"**
4. Wklej skopiowany klucz publiczny w pole **„SSH Key Content"**
5. Nadaj nazwę (np. `openclaw-local`) i zapisz

**Test połączenia:**
```bash
ssh -i ~/.ssh/id_ed25519 root@YOUR_SERVER_IP
```
Jeśli podałeś inną ścieżkę niż domyślna — użyj jej zamiast `~/.ssh/id_ed25519`.

> [!TIP]
> Żeby nie podawać `-i ~/.ssh/klucz` przy każdym połączeniu, dodaj wpis do `~/.ssh/config`:
> ```
> Host openclaw-vps
>   HostName YOUR_SERVER_IP
>   User root
>   IdentityFile ~/.ssh/id_ed25519
> ```
> Potem łączysz się po prostu: `ssh openclaw-vps`

## 1. Google Cloud — Konto i Organizacja — 👤

### 1.1 Utworzenie Konta Google Cloud — 👤

1. Wejdź na [cloud.google.com](https://cloud.google.com)
2. Kliknij **„Get started for free"** / **„Zacznij za darmo"**
3. Zaloguj się swoim kontem Google (Gmail)
4. Wypełnij formularz rejestracji:
   - **Country**: Polska (lub twój kraj)
   - **What best describes your org**: Individual / Personal project
   - Zaakceptuj regulamin
5. Podaj dane karty (Visa/Mastercard) — Google pobierze $1 autoryzacyjnie i zwróci
6. Kliknij **„Start my free trial"**

> [!NOTE]
> Dostajesz **$300 kredytów na 90 dni**. Po ich wyczerpaniu lub po 90 dniach nic nie zostanie pobrane — musisz ręcznie przejść na płatne konto.

### 1.2 Organizacja i Billing Account — 👤

Po utworzeniu konta Google Cloud automatycznie tworzy:
- **Organizację** (np. `imie-nazwisko-org` lub podobną, powiązaną z Twoim kontem)
- **Billing Account** z darmowym trialem ($300)

**Sprawdzenie Billing Account:**
1. W Google Cloud Console, kliknij **☰ menu** → **„Billing"**
2. Powinieneś widzieć billing account z kredytem $300
3. Zanotuj nazwę billing account — będzie podpięta do projektów

> [!TIP]
> Jeśli nie widzisz organizacji, wejdź w **☰ menu** → **„IAM & Admin"** → **„Identity & Organization"**. Dla kont osobistych Google automatycznie tworzy organizację generyczną.

### 1.3 Tworzenie Projektu GCP — 👤

1. Wejdź na [console.cloud.google.com](https://console.cloud.google.com)
2. Kliknij **selektor projektów** (górny pasek, obok "Google Cloud")
3. Kliknij **„NEW PROJECT"** (prawy górny róg okna dialogowego)
4. Wypełnij:
   - **Project name**: np. `my-openclaw-project`
   - **Organization**: wybierz swoją organizację (lub zostaw domyślną)
   - **Billing account**: upewnij się, że jest tu twój billing account z Free Trial
5. Kliknij **„CREATE"**
6. Poczekaj aż projekt się stworzy — pojawi się notyfikacja
7. Przejdź do nowego projektu klikając na niego w selektorze

> [!IMPORTANT]
> Zanotuj **Project ID** (nie mylić z Project Name!) — jest widoczny na stronie projektu lub w selektorze. Format: `my-openclaw-project-123456`. Będzie potrzebny w konfiguracji.

---

## 2. IAM — Role na Poziomie Organizacji — 👤

> [!CAUTION]
> Ten krok jest **kluczowy**. Bez odpowiednich ról na poziomie organizacji nie będziesz mógł tworzyć service account keys, zarządzać billing, ani wyłączać blokujących policies.

### 2.1 Nadawanie Ról Organizacyjnych — 👤

1. Wejdź na [console.cloud.google.com](https://console.cloud.google.com)
2. W selektorze projektów (górny pasek) **wybierz swoją organizację** (nie projekt!)
3. Kliknij **☰ menu** → **„IAM & Admin"** → **„IAM"**
4. Kliknij **„GRANT ACCESS"** (górny pasek)
5. W polu **„New principals"** wpisz swój email (Gmail)
6. W polu **„Select a role"** dodaj kolejno **WSZYSTKIE** poniższe role:

| # | Rola | Dlaczego potrzebna |
|---|---|---|
| 1 | **Billing Account Administrator** | Zarządzanie billing account, podpinanie do projektów |
| 2 | **Billing Account Creator** | Tworzenie nowych billing accounts |
| 3 | **Organization Administrator** | Pełne zarządzanie organizacją |
| 4 | **Organization Policy Administrator** | Wyłączanie blokujących organization policies |
| 5 | **Organization Role Viewer** | Przeglądanie ról w organizacji |
| 6 | **Project Creator** | Tworzenie nowych projektów |
| 7 | **Project Mover** | Przenoszenie projektów między folderami |
| 8 | **Service Usage Admin** | Zarządzanie API i usługami |
| 9 | **IAM Recommender Viewer** | Przeglądanie rekomendacji IAM |
| 10 | **IAM Workforce Pool Admin** | Zarządzanie pulami tożsamości |
| 11 | **Deny Reviewer** | Przeglądanie deny policies |

7. Po dodaniu wszystkich ról kliknij **„SAVE"**

> [!TIP]
> Możesz dodawać wiele ról naraz — po wybraniu jednej, kliknij **„+ ADD ANOTHER ROLE"** i wybierz następną. Nie musisz zapisywać po każdej.

### 2.2 Weryfikacja Ról — 👤

1. W **IAM & Admin → IAM** (na poziomie organizacji)
2. Znajdź swój email na liście
3. Sprawdź czy widzisz wszystkie 11 ról wymienionych powyżej
4. Jeśli brakuje jakiejś roli — kliknij ołówek (edit) i dodaj ją

---

## 3. Wyłączenie Blokujących Organization Policies — 👤

> [!CAUTION]
> Google Cloud od maja 2024 domyślnie **blokuje tworzenie kluczy service account** dla nowych organizacji. Bez wyłączenia tych policies **nie utworzysz klucza JSON** (krok 5.4) i Vertex AI nie będzie działać z ADC!

### 3.1 Wymagane Policies do Wyłączenia

Musisz wyłączyć **dwie** organization policies:

| # | Policy ID (constraint) | Nazwa w UI | Domyślny stan (nowe org) |
|---|---|---|---|
| 1 | `iam.managed.disableServiceAccountKeyCreation` | Disable service account key creation (managed) | **Enforced** ✗ |
| 2 | `iam.disableServiceAccountKeyCreation` | Disable service account key creation (legacy) | **Enforced** ✗ |

### 3.2 Jak Wyłączyć — Krok po Kroku — 👤

Powtórz poniższe dla **obu** policies:

1. W selektorze projektów (górny pasek) **wybierz swoją organizację** (NIE projekt!)
2. Kliknij **☰ menu** → **„IAM & Admin"** → **„Organization Policies"**
3. W filtrze/wyszukiwarce wpisz: **`disableServiceAccountKeyCreation`**
4. Kliknij na znalezioną policy
5. Kliknij **„MANAGE POLICY"** (lub „EDIT POLICY")
6. W polu **„Policy source"** wybierz: **„Override parent's policy"**
7. Pod **„Rules"** kliknij **„Add a rule"**
8. W nowej regule ustaw **„Enforcement"** na: **„Off"**
9. Kliknij **„SET POLICY"** (lub „Save")

> [!WARNING]
> Musisz to zrobić na **poziomie organizacji**, nie projektu! Jeśli zrobisz to na projekcie, nowe projekty nadal będą blokowane. Upewnij się, że w selektorze u góry masz wybraną **organizację**, nie konkretny projekt.

### 3.3 Weryfikacja — 👤

Po wyłączeniu obu policies:
1. Wejdź do **IAM & Admin → Organization Policies** (na organizacji)
2. Wyszukaj `disableServiceAccountKeyCreation`
3. Status obu policies powinien pokazywać **„Not enforced"**

### 3.4 Inne Policies Które Mogą Blokować

Jeśli podczas dalszej konfiguracji napotkasz błąd, sprawdź dodatkowo:

| Policy | Może blokować |
|---|---|
| `constraints/gcp.restrictServiceUsage` | Włączanie API (Vertex AI, Generative Language) |
| `constraints/serviceuser.services` | Dostęp do usług Google |
| `constraints/iam.allowedPolicyMemberDomains` | Dodawanie external members do IAM |

Wyłącz je analogicznie do 3.2 jeśli blokują konfigurację.

---

## 4. Włączenie Wymaganych API — 👤

### 4.1 Vertex AI API (primary) — 👤

1. Upewnij się, że masz wybrany **projekt** (nie organizację) w selektorze
2. W menu bocznym (☰) kliknij **„APIs & Services"** → **„Library"**
3. W polu wyszukiwania wpisz **„Vertex AI API"**
4. Kliknij na **„Vertex AI API"** w wynikach
5. Kliknij niebieski przycisk **„ENABLE"**
6. Poczekaj aż API się aktywuje

### 4.2 Generative Language API (fallback AI Studio) — 👤

1. Wróć do **„APIs & Services"** → **„Library"**
2. Wyszukaj **„Generative Language API"**
3. Kliknij **„ENABLE"**

> [!NOTE]
> Vertex AI API automatycznie włącza też sub-API (AI Platform). Generative Language API jest potrzebne dla fallbacku `google/` (AI Studio).

---

## 5. Service Account i Klucz JSON — 👤 + 🤖

### 5.1 Tworzenie Service Account — 👤

1. W menu bocznym kliknij **„IAM & Admin"** → **„Service Accounts"**
2. Kliknij **„+ CREATE SERVICE ACCOUNT"** (górny pasek)
3. Wypełnij:
   - **Service account name**: `openclaw-vertex`
   - **Service account ID**: wypełni się automatycznie (`openclaw-vertex`)
   - **Description**: `OpenClaw Vertex AI access`
4. Kliknij **„CREATE AND CONTINUE"**
5. W kroku **„Grant this service account access to project"**:
   - Kliknij **„Select a role"**
   - Wyszukaj **„Vertex AI User"** (w kategorii „Vertex AI")
   - Wybierz **„Vertex AI User"**
6. Kliknij **„CONTINUE"** → **„DONE"**

### 5.2 Generowanie Klucza JSON — 👤

> [!IMPORTANT]
> Ten krok wymaga wyłączonych organization policies z rozdziału 3! Jeśli dostaniesz błąd *„Key creation is not allowed on this service account"* — wróć do rozdziału 3 i upewnij się, że obie policies są wyłączone.

1. Na liście service accounts, kliknij na **`openclaw-vertex@...`**
2. Przejdź do zakładki **„KEYS"**
3. Kliknij **„ADD KEY"** → **„Create new key"**
4. Wybierz format **„JSON"**
5. Kliknij **„CREATE"**
6. Plik `vertex-key.json` zostanie pobrany automatycznie — **zachowaj go bezpiecznie!**

> [!WARNING]
> Klucz JSON daje pełny dostęp do Vertex AI. Nigdy nie commituj go do repozytorium ani nie udostępniaj publicznie.

### 5.3 Upload Klucza na Serwer — 🤖

```bash
# Stwórz folder na credentials
ssh root@YOUR_SERVER "mkdir -p /docker/openclaw-11dv/credentials"

# Upload klucza
scp vertex-key.json root@YOUR_SERVER:/docker/openclaw-11dv/credentials/vertex-key.json

# Ustaw uprawnienia
ssh root@YOUR_SERVER "chmod 600 /docker/openclaw-11dv/credentials/vertex-key.json"
```

> [!TIP]
> Folder `credentials/` powinien być w `.dockerignore` i `.gitignore`.

---

## 6. OAuth — Logowanie przez Google — 👤

### 6.1 Konfiguracja OAuth Consent Screen — 👤

1. W menu bocznym kliknij **„APIs & Services"** → **„OAuth consent screen"**
2. Kliknij **„CONFIGURE CONSENT SCREEN"** (lub edytuj istniejący)
3. Wybierz **User type: External** → **„CREATE"**
4. Wypełnij formularz:
   - **App name**: `OpenClaw`
   - **User support email**: twój email
   - **Developer contact info**: twój email
5. Kliknij **„SAVE AND CONTINUE"**
6. W **Scopes** kliknij **„ADD OR REMOVE SCOPES"**:
   - Zaznacz `email` i `profile`
   - Kliknij **„UPDATE"** → **„SAVE AND CONTINUE"**
7. W **Test users** kliknij **„+ ADD USERS"**:
   - Wpisz swój Gmail → **„ADD"** → **„SAVE AND CONTINUE"**

### 6.2 Tworzenie Credentials OAuth — 👤

1. **„APIs & Services"** → **„Credentials"** → **„+ CREATE CREDENTIALS"** → **„OAuth client ID"**
2. Wypełnij:
   - **Application type**: **Web application**
   - **Name**: `openclaw-oauth`
   - **Authorized redirect URIs**: kliknij **„+ ADD URI"** i wpisz:
     `https://YOUR_DOMAIN/oauth2/callback`
     *(zastąp `YOUR_DOMAIN` swoim hostnamen/domeną)*
3. Kliknij **„CREATE"**
4. **Skopiuj Client ID i Client Secret** — będą potrzebne w `.env`

### 6.3 Generowanie GEMINI_API_KEY (dla fallback AI Studio) — 👤

1. Wejdź na [aistudio.google.com](https://aistudio.google.com)
2. Kliknij **„Get API Key"** (lewy panel)
3. Kliknij **„Create API key"** → wybierz swój projekt GCP
4. Skopiuj wygenerowany klucz — wpisz go jako `GEMINI_API_KEY` w `.env`

---

## 7. Konfiguracja na Serwerze — 🤖

### 7.1 Struktura Plików

Po pełnej konfiguracji, struktura powinna wyglądać tak:

```
/docker/openclaw-11dv/
├── docker-compose.yml         # ← modyfikowany (entrypoint + volumes)
├── .env                       # ← wszystkie zmienne środowiskowe
├── emails.txt                 # lista emaili OAuth2 (kto ma dostęp)
├── credentials/
│   └── vertex-key.json        # ← klucz service account (z kroku 5.2)
├── patches/
│   ├── apply-patches.sh       # ← skrypt patchujący (entrypoint wrapper)
│   ├── models.generated.js    # ← zpatchowany katalog modeli pi-ai
│   └── getToken.js            # ← fix gaxios bug (native fetch)
└── data/
    └── .openclaw/
        ├── openclaw.json      # ← główna konfiguracja (modele, providery)
        └── agents/main/sessions/
            └── sessions.json  # ← override sesji
```

### 7.2 Plik `.env` — 🤖

Utwórz/edytuj plik `/docker/openclaw-11dv/.env`:

```ini
# ─── Port wewnętrzny OpenClaw ───
PORT=18789

# ─── Strefa czasowa ───
TZ=Europe/Warsaw

# ─── Google OAuth2 Proxy ───
GOOGLE_OAUTH_CLIENT_ID=WKLEJ_CLIENT_ID_Z_KROKU_6.2
GOOGLE_OAUTH_CLIENT_SECRET=WKLEJ_CLIENT_SECRET_Z_KROKU_6.2
OAUTH2_COOKIE_SECRET=WYGENERUJ_POLECENIEM_PONIZEJ

# ─── Vertex AI (primary) ───
VERTEX_PROJECT=YOUR_PROJECT_ID
VERTEX_LOCATION=global
VERTEX_API_KEY=

# ─── Google AI Studio (fallback) ───
GEMINI_API_KEY=WKLEJ_KLUCZ_Z_KROKU_6.3
```

**Generowanie `OAUTH2_COOKIE_SECRET`:**
```bash
python3 -c 'import os,base64; print(base64.urlsafe_b64encode(os.urandom(32)).rstrip(b"=").decode())'
```

> [!CAUTION]
> `VERTEX_LOCATION` **MUSI** być `global` dla modeli preview (gemini-3.x). Region `europe-west1` nie obsługuje preview modeli!

### 7.3 Plik `emails.txt` — 🤖

Utwórz plik `/docker/openclaw-11dv/emails.txt` z listą emaili, które mają mieć dostęp do OpenClaw:

```bash
echo "twoj.email@gmail.com" > /docker/openclaw-11dv/emails.txt
```

### 7.4 Plik `docker-compose.yml` — 🤖

Utwórz/zastąp `/docker/openclaw-11dv/docker-compose.yml`:

```yaml
services:
  # === Google OAuth gate (Traefik kieruje tutaj) ===
  oauth2-proxy:
    image: quay.io/oauth2-proxy/oauth2-proxy:latest
    restart: unless-stopped
    labels:
      - traefik.enable=true
      - traefik.http.routers.openclaw-11dv.rule=Host(`YOUR_DOMAIN`)
      - traefik.http.routers.openclaw-11dv.entrypoints=websecure
      - traefik.http.routers.openclaw-11dv.tls.certresolver=letsencrypt
      - traefik.http.services.openclaw-11dv.loadbalancer.server.port=4180
    environment:
      OAUTH2_PROXY_PROVIDER: google
      OAUTH2_PROXY_CLIENT_ID: ${GOOGLE_OAUTH_CLIENT_ID}
      OAUTH2_PROXY_CLIENT_SECRET: ${GOOGLE_OAUTH_CLIENT_SECRET}
      OAUTH2_PROXY_COOKIE_SECRET: ${OAUTH2_COOKIE_SECRET}
      OAUTH2_PROXY_AUTHENTICATED_EMAILS_FILE: /etc/oauth2-proxy/emails.txt
      OAUTH2_PROXY_REDIRECT_URL: https://YOUR_DOMAIN/oauth2/callback
      OAUTH2_PROXY_UPSTREAMS: http://openclaw:${PORT}
      OAUTH2_PROXY_HTTP_ADDRESS: 0.0.0.0:4180
      OAUTH2_PROXY_COOKIE_SECURE: "true"
      OAUTH2_PROXY_REVERSE_PROXY: "true"
      OAUTH2_PROXY_PASS_HOST_HEADER: "true"
      OAUTH2_PROXY_PROXY_WEBSOCKETS: "true"
    volumes:
      - ./emails.txt:/etc/oauth2-proxy/emails.txt:ro
    depends_on:
      - openclaw

  # === OpenClaw (schowany za oauth2-proxy) ===
  openclaw:
    image: ghcr.io/hostinger/hvps-openclaw:latest
    init: true
    labels:
      - traefik.enable=false
    environment:
      GOOGLE_APPLICATION_CREDENTIALS: /credentials/vertex-key.json
      GOOGLE_CLOUD_PROJECT: YOUR_PROJECT_ID
      GOOGLE_CLOUD_LOCATION: global
    env_file:
      - .env
    restart: unless-stopped
    entrypoint: ["/patches/apply-patches.sh"]
    command: ["node", "server.mjs"]
    volumes:
      - ./data:/data
      - ./data/linuxbrew:/home/linuxbrew
      - ./credentials/vertex-key.json:/credentials/vertex-key.json:ro
      - ./patches:/patches:ro
```

**Kluczowe zmienne:**

| Pole | Opis |
|---|---|
| `GOOGLE_APPLICATION_CREDENTIALS` | Ścieżka do klucza SA wewnątrz kontenera |
| `GOOGLE_CLOUD_PROJECT` | Twój Project ID z kroku 1.3 |
| `GOOGLE_CLOUD_LOCATION` | `global` — wymagane dla modeli preview |
| `entrypoint` | Wrapper patchujący node_modules przed startem |
| `command` | Przywraca oryginalny CMD (nadpisany przez entrypoint) |
| `./patches:/patches:ro` | Volume z plikami patchów |

> [!WARNING]
> Pamiętaj o zastąpieniu **`YOUR_DOMAIN`** swoim hostnamem/domeną w **trzech miejscach**: `traefik.http.routers...rule=Host(...)`, `OAUTH2_PROXY_REDIRECT_URL`, i URI w Google Console (krok 6.2).

---

## 8. Konfiguracja Modeli — `openclaw.json` — 🤖

### 8.1 Główna Konfiguracja — 🤖

Plik: `/docker/openclaw-11dv/data/.openclaw/openclaw.json`

Kluczowe sekcje do ustawienia (modele + failover):

```json
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "google-vertex/gemini-3.1-flash-lite-preview",
        "fallbacks": [
          "google-vertex/gemini-3-flash-preview",
          "google-vertex/gemini-3.1-pro-preview",
          "google/gemini-3.1-flash-lite-preview",
          "google/gemini-3-flash-preview",
          "google/gemini-3.1-pro-preview"
        ]
      }
    }
  }
}
```

**Łańcuch failover:**

| # | Provider | Model | Endpoint | Auth |
|---|---|---|---|---|
| 1 (primary) | `google-vertex` | `gemini-3.1-flash-lite-preview` | Vertex AI (`global`) | ADC (service account) |
| 2 | `google-vertex` | `gemini-3-flash-preview` | Vertex AI | ADC |
| 3 | `google-vertex` | `gemini-3.1-pro-preview` | Vertex AI | ADC |
| 4 | `google` | `gemini-3.1-flash-lite-preview` | AI Studio | GEMINI_API_KEY |
| 5 | `google` | `gemini-3-flash-preview` | AI Studio | GEMINI_API_KEY |
| 6 | `google` | `gemini-3.1-pro-preview` | AI Studio | GEMINI_API_KEY |

> [!NOTE]
> `google-vertex` (Vertex AI) używa ADC (Application Default Credentials) z klucza service account. Przy awarii Vertex AI, system automatycznie przechodzi na `google` (AI Studio) który używa `GEMINI_API_KEY`.

### 8.2 Override Sesji — `sessions.json` — 🤖

Plik: `/docker/openclaw-11dv/data/.openclaw/agents/main/sessions/sessions.json`

```json
{
  "agent:main:main": {
    "providerOverride": "google-vertex",
    "modelOverride": "gemini-3.1-flash-lite-preview",
    "modelProvider": "google-vertex",
    "model": "gemini-3.1-flash-lite-preview"
  }
}
```

---

## 9. Tworzenie Patchów (Na Świeżej Instalacji) — 🤖

> [!IMPORTANT]
> Na świeżej instalacji **nie masz jeszcze plików patchów**. Musisz je **utworzyć od zera**. Ten rozdział prowadzi krok po kroku przez cały proces — od uruchomienia tymczasowego kontenera, przez ekstrakcję i modyfikację plików, do finalnego restartu z patchami.

### 9.1 Dlaczego Patche Są Potrzebne

| Patch | Problem | Przyczyna |
|---|---|---|
| `models.generated.js` | Modele gemini-3.x nie są w katalogu `google-vertex` (odpowiedź: "Unknown model") | Biblioteka `@mariozechner/pi-ai` nie ma jeszcze preview modeli w katalogu dla google-vertex |
| `getToken.js` | Crash: `Cannot convert undefined or null to object` przy generowaniu tokenu OAuth2 | `gaxios@7.1.3` jest niezgodna z Node.js 22 — `extend()` deep-clone crashuje |

### 9.2 Krok 1 — Uruchom Tymczasowy Kontener (BEZ patchów) — 🤖

Na świeżej instalacji jeszcze nie masz folderu `patches/` ani `apply-patches.sh`. Musisz najpierw uruchomić kontener w wersji bazowej, żeby wyciągnąć z niego oryginalne pliki.

**Tymczasowy docker-compose** — ustaw kontener OpenClaw BEZ entrypoint/patches:

```bash
cd /docker/openclaw-11dv

# Upewnij się że docker-compose.yml ma DOMYŚLNY entrypoint (bez patchów).
# Jeśli już dodałeś entrypoint/patches z rozdziału 7.4 — tymczasowo zakomentuj te linie:
#   entrypoint: ["/patches/apply-patches.sh"]
#   command: ["node", "server.mjs"]
#   - ./patches:/patches:ro

# Uruchom kontener
docker compose up -d openclaw

# Sprawdź nazwę kontenera
docker ps --format '{{.Names}}' | grep openclaw
# Np.: openclaw-11dv-openclaw-1
```

Zanotuj **nazwę kontenera** (np. `openclaw-11dv-openclaw-1`) — będzie potrzebna dalej.

### 9.3 Krok 2 — Przygotuj Folder `patches/` — 🤖

```bash
mkdir -p /docker/openclaw-11dv/patches
```

### 9.4 Krok 3 — Wyciągnij i Zpatchuj `models.generated.js` — 🤖

**Co robimy:** Kopiujemy oryginalny katalog modeli z kontenera, a potem dodajemy brakujące modele gemini-3.x do sekcji `"google-vertex"`.

```bash
CONTAINER="openclaw-11dv-openclaw-1"  # ← podmień na swoją nazwę kontenera
OC_DIR="/usr/local/lib/node_modules/openclaw/node_modules"
MODELS_PATH="$OC_DIR/@mariozechner/pi-ai/dist/models.generated.js"

# 1. Skopiuj oryginalny plik z kontenera na host
docker cp "$CONTAINER:$MODELS_PATH" /docker/openclaw-11dv/patches/models.generated.js

# 2. Sprawdź jakie modele google-vertex już tam są
grep -c '"google-vertex"' /docker/openclaw-11dv/patches/models.generated.js
# Powinno zwrócić liczbę > 0
```

**Teraz trzeba dodać brakujące modele preview w sekcji `"google-vertex"`.**

Wejdź do kontenera i znajdź format istniejących modeli:

```bash
docker exec "$CONTAINER" sh -c "cat $MODELS_PATH" | grep -A 15 '"google-vertex"' | head -40
```

Zapisz sobie format jednego modelu (np. `gemini-2.5-flash`). Następnie **edytuj skopiowany plik** na hoście — dodaj poniższe wpisy wewnątrz obiektu `"google-vertex": { ... }`, tuż przed ostatnim `}` zamykającym tę sekcję:

```bash
nano /docker/openclaw-11dv/patches/models.generated.js
```

**Modele do dodania** (wzoruj się na formacie istniejących — klucze, typy, baseUrl muszą być takie same):

```javascript
"gemini-3.1-flash-lite-preview": {
    id: "gemini-3.1-flash-lite-preview",
    name: "Gemini 3.1 Flash-Lite Preview (Vertex)",
    api: "google-vertex",
    provider: "google-vertex",
    baseUrl: "https://{location}-aiplatform.googleapis.com",
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1048576,
    maxTokens: 65536,
},
"gemini-3-flash-preview": {
    id: "gemini-3-flash-preview",
    name: "Gemini 3 Flash Preview (Vertex)",
    api: "google-vertex",
    provider: "google-vertex",
    baseUrl: "https://{location}-aiplatform.googleapis.com",
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1048576,
    maxTokens: 65536,
},
"gemini-3.1-pro-preview": {
    id: "gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro Preview (Vertex)",
    api: "google-vertex",
    provider: "google-vertex",
    baseUrl: "https://{location}-aiplatform.googleapis.com",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1048576,
    maxTokens: 65536,
},
```

> [!CAUTION]
> **Format musi dokładnie pasować do istniejących wpisów!** Jeśli istniejące modele mają dodatkowe pola (np. `supportsSystemPrompt`, `supportsToolUse`) — dodaj je też. Sprawdź format przez `grep -A 20` na istniejącym modelu i skopiuj strukturę.

**Weryfikacja patcha:**
```bash
# Sprawdź czy nowe modele są w pliku
grep "gemini-3" /docker/openclaw-11dv/patches/models.generated.js
# Powinno pokazać 3+ linii z gemini-3.x
```

> [!TIP]
> **Dla Antigravity/agenta AI:** Zamiast ręcznej edycji, możesz użyć `node` w kontenerze do zautomatyzowania patcha:
> ```bash
> docker exec "$CONTAINER" node -e "
>   const fs = require('fs');
>   const path = '$MODELS_PATH';
>   let content = fs.readFileSync(path, 'utf8');
>   // Znajdź pozycję do wstawienia w sekcji google-vertex
>   // ... (logika dodawania modeli)
>   fs.writeFileSync(path, content);
> "
> docker cp "$CONTAINER:$MODELS_PATH" /docker/openclaw-11dv/patches/models.generated.js
> ```

### 9.5 Krok 4 — Wyciągnij i Zpatchuj `getToken.js` — 🤖

**Co robimy:** Kopiujemy oryginalny `getToken.js` i zamieniamy wywołanie `gaxios` (które crashuje na Node.js 22) na natywny `fetch`.

```bash
CONTAINER="openclaw-11dv-openclaw-1"  # ← podmień na swoją nazwę
OC_DIR="/usr/local/lib/node_modules/openclaw/node_modules"
GETTOKEN_PATH="$OC_DIR/google-auth-library/build/src/gtoken/getToken.js"

# 1. Skopiuj oryginalny plik z kontenera
docker cp "$CONTAINER:$GETTOKEN_PATH" /docker/openclaw-11dv/patches/getToken.js

# 2. Sprawdź obecność linii do zamiany
grep -n "tokenOptions.transporter.request" /docker/openclaw-11dv/patches/getToken.js
# Powinno znaleźć linię: const response = await tokenOptions.transporter.request(gaxiosOptions);
```

**Edytuj plik** — znajdź linię:
```javascript
const response = await tokenOptions.transporter.request(gaxiosOptions);
```

I **zastąp ją** tymi liniami:
```javascript
const fetchResp = await fetch(gaxiosOptions.url, {
    method: 'POST',
    body: gaxiosOptions.data,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
});
const response = { data: await fetchResp.json() };
if (!fetchResp.ok && response.data?.error) {
    throw new Error(`${response.data.error}: ${response.data.error_description}`);
}
```

**Możesz to zrobić automatycznie przez `sed`:**

```bash
cd /docker/openclaw-11dv/patches

# Backup na wszelki wypadek
cp getToken.js getToken.js.orig

# Podmień linię z gaxios na native fetch
sed -i 's|const response = await tokenOptions.transporter.request(gaxiosOptions);|const fetchResp = await fetch(gaxiosOptions.url, {\n    method: '\''POST'\'',\n    body: gaxiosOptions.data,\n    headers: { '\''Content-Type'\'': '\''application/x-www-form-urlencoded'\'' }\n});\nconst response = { data: await fetchResp.json() };\nif (!fetchResp.ok \&\& response.data?.error) {\n    throw new Error(`${response.data.error}: ${response.data.error_description}`);\n}|' getToken.js
```

**Weryfikacja patcha:**
```bash
# Sprawdź czy Native fetch jest w pliku (NIE gaxios)
grep -c "native fetch\|fetchResp" /docker/openclaw-11dv/patches/getToken.js
# Powinno zwrócić > 0

# Sprawdź czy stara linia została usunięta
grep -c "tokenOptions.transporter.request" /docker/openclaw-11dv/patches/getToken.js
# Powinno zwrócić 0
```

### 9.6 Krok 5 — Utwórz `apply-patches.sh` — 🤖

Utwórz plik `/docker/openclaw-11dv/patches/apply-patches.sh`:

```bash
cat > /docker/openclaw-11dv/patches/apply-patches.sh << 'SCRIPT'
#!/bin/sh
PATCHES_DIR="/patches"
OC_DIR="/usr/local/lib/node_modules/openclaw/node_modules"

if [ -d "$PATCHES_DIR" ]; then
  echo "[vertex-patches] Applying Vertex AI patches..."
  [ -f "$PATCHES_DIR/models.generated.js" ] && \
    cp "$PATCHES_DIR/models.generated.js" \
       "$OC_DIR/@mariozechner/pi-ai/dist/models.generated.js" && \
    echo "[vertex-patches] OK: models.generated.js"
  [ -f "$PATCHES_DIR/getToken.js" ] && \
    cp "$PATCHES_DIR/getToken.js" \
       "$OC_DIR/google-auth-library/build/src/gtoken/getToken.js" && \
    echo "[vertex-patches] OK: getToken.js"
  echo "[vertex-patches] Done."
fi
exec /entrypoint.sh "$@"
SCRIPT

chmod +x /docker/openclaw-11dv/patches/apply-patches.sh
```

### 9.7 Krok 6 — Zatrzymaj Tymczasowy Kontener i Zaktualizuj docker-compose — 🤖

```bash
cd /docker/openclaw-11dv

# Zatrzymaj tymczasowy kontener
docker compose down
```

Teraz **zaktualizuj `docker-compose.yml`** — upewnij się że sekcja `openclaw` ma:

```yaml
  openclaw:
    image: ghcr.io/hostinger/hvps-openclaw:latest
    init: true
    labels:
      - traefik.enable=false
    environment:
      GOOGLE_APPLICATION_CREDENTIALS: /credentials/vertex-key.json
      GOOGLE_CLOUD_PROJECT: YOUR_PROJECT_ID
      GOOGLE_CLOUD_LOCATION: global
    env_file:
      - .env
    restart: unless-stopped
    entrypoint: ["/patches/apply-patches.sh"]    # ← DODAJ
    command: ["node", "server.mjs"]               # ← DODAJ
    volumes:
      - ./data:/data
      - ./data/linuxbrew:/home/linuxbrew
      - ./credentials/vertex-key.json:/credentials/vertex-key.json:ro
      - ./patches:/patches:ro                     # ← DODAJ
```

### 9.8 Krok 7 — Uruchom z Patchami — 🤖

```bash
docker compose up -d

# Sprawdź czy patche się zastosowały
docker compose logs openclaw | grep 'vertex-patches'
# Oczekiwane:
# [vertex-patches] Applying Vertex AI patches...
# [vertex-patches] OK: models.generated.js
# [vertex-patches] OK: getToken.js
# [vertex-patches] Done.
```

### 9.9 Weryfikacja Patchów — Sprawdzenie w Kontenerze — 🤖

Po uruchomieniu z patchami, sprawdź czy zmiany zostały prawidłowo zastosowane:

```bash
CONTAINER=$(docker ps --format '{{.Names}}' | grep openclaw | head -1)

# 1. Czy modele preview są w katalogu?
docker exec "$CONTAINER" sh -c "grep 'gemini-3' /usr/local/lib/node_modules/openclaw/node_modules/@mariozechner/pi-ai/dist/models.generated.js | head -5"
# Powinno pokazać wpisy gemini-3.x

# 2. Czy gaxios bug jest naprawiony?
docker exec "$CONTAINER" sh -c "grep -c 'fetchResp' /usr/local/lib/node_modules/openclaw/node_modules/google-auth-library/build/src/gtoken/getToken.js"
# Powinno zwrócić > 0 (native fetch jest w pliku)

# 3. Czy Vertex AI odpowiada?
docker exec "$CONTAINER" node -e "
  import {GoogleGenAI} from '@google/genai';
  const c = new GoogleGenAI({vertexai:true, project:process.env.GOOGLE_CLOUD_PROJECT, location:'global', apiVersion:'v1'});
  const r = await c.models.generateContent({model:'gemini-3.1-flash-lite-preview', contents:[{role:'user',parts:[{text:'Say hello'}]}]});
  console.log('SUCCESS:', r.candidates[0].content.parts[0].text);
"
```

> [!NOTE]
> **Przy przyszłych aktualizacjach OpenClaw:** Gdy obraz Docker się zaktualizuje, patche mogą przestać działać (zmiana struktury plików). W takim wypadku powtórz kroki 9.2–9.8 — uruchom nowy kontener bez patchów, wyciągnij nowe wersje plików, zastosuj te same modyfikacje, i zrestartuj.

---

## 10. Uruchomienie i Weryfikacja — 🤖 + 👤

### 10.1 Uruchomienie — 🤖

```bash
cd /docker/openclaw-11dv

# Upewnij się że apply-patches.sh jest wykonywalny
chmod +x patches/apply-patches.sh

# Uruchom
docker compose up -d

# Sprawdź czy oba kontenery działają
docker ps
```

### 10.2 Sprawdzenie Logów — 🤖

```bash
# 1. Sprawdź czy patche się zastosowały
docker compose logs openclaw | grep 'vertex-patches'
# Oczekiwane:
# [vertex-patches] OK: models.generated.js
# [vertex-patches] OK: getToken.js
# [vertex-patches] Done.

# 2. Sprawdź model agenta
docker compose logs openclaw | grep 'agent model'
# Oczekiwane:
# [gateway] agent model: google-vertex/gemini-3.1-flash-lite-preview

# 3. Sprawdź env vars
docker exec <container> env | grep -E 'GOOGLE|VERTEX'
# Oczekiwane:
# GOOGLE_APPLICATION_CREDENTIALS=/credentials/vertex-key.json
# GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID
# GOOGLE_CLOUD_LOCATION=global
# VERTEX_LOCATION=global

# 4. Logi oauth2-proxy
docker compose logs oauth2-proxy --tail=30
```

### 10.3 Test Vertex AI w Kontenerze — 🤖

```bash
docker exec <container> node -e "
  import {GoogleGenAI} from '@google/genai';
  const c = new GoogleGenAI({vertexai:true, project:process.env.GOOGLE_CLOUD_PROJECT, location:'global', apiVersion:'v1'});
  const r = await c.models.generateContent({model:'gemini-3.1-flash-lite-preview', contents:[{role:'user',parts:[{text:'Say hello'}]}]});
  console.log('SUCCESS:', r.candidates[0].content.parts[0].text);
"
```

### 10.4 Test OAuth — 👤

1. Wejdź na `https://YOUR_DOMAIN/` w przeglądarce
2. Powinien pokazać się ekran logowania Google
3. Zaloguj się kontem dodanym w `emails.txt`
4. Po zalogowaniu powinieneś zobaczyć UI OpenClaw

---

## 11. Troubleshooting

| Symptom | Przyczyna | Rozwiązanie |
|---|---|---|
| `Key creation is not allowed on this service account` | Organization policy blokuje tworzenie kluczy | Wyłącz obie policies z rozdziału 3 |
| `Cannot convert undefined or null to object` | Gaxios bug, patch `getToken.js` nie zastosowany | Sprawdź logi `vertex-patches`, upewnij się że `patches/` jest zamontowany |
| `Unknown model` | Model nie w katalogu pi-ai | Sprawdź czy `models.generated.js` jest zpatchowany |
| `runuser: no command was specified` | Brak `command` w docker-compose | Dodaj `command: ["node", "server.mjs"]` |
| `VERTEX_LOCATION` na `europe-west1` | Preview modele nie działają w regionach | Zmień na `global` w `.env` i `docker-compose.yml` |
| `No project ID` | Brak `GOOGLE_CLOUD_PROJECT` | Dodaj w `environment:` w docker-compose |
| Fallback do AI Studio zamiast Vertex | Vertex auth fails silently | Sprawdź klucz SA, uprawnienia „Vertex AI User" |
| `redirect_uri_mismatch` | Redirect URI w Google Console nie pasuje | URI **musi** kończyć się na `/oauth2/callback` i pasować do domeny |
| oauth2-proxy nie startuje | Złe credentials lub cookie secret | Sprawdź logi: `docker compose logs oauth2-proxy` |
| `403` z Vertex AI | Brak roli na service account | Sprawdź rolę `Vertex AI User` na service account |
| Credentials not found | Klucz nie zamontowany w kontenerze | `docker exec <container> cat /credentials/vertex-key.json` |

---

## 12. Podsumowanie — Checklist

Użyj tej checklisty żeby upewnić się, że nic nie pominąłeś:

- [ ] Konto Google Cloud utworzone (darmowy trial $300)
- [ ] Organizacja widoczna w Cloud Console
- [ ] Billing Account podpięty do projektu
- [ ] 11 ról IAM nadanych na poziomie organizacji
- [ ] Policy `iam.managed.disableServiceAccountKeyCreation` — **wyłączona**
- [ ] Policy `iam.disableServiceAccountKeyCreation` — **wyłączona**
- [ ] Projekt GCP utworzony (zanotowany Project ID)
- [ ] Vertex AI API — **włączone**
- [ ] Generative Language API — **włączone**
- [ ] Service Account `openclaw-vertex` utworzony z rolą `Vertex AI User`
- [ ] Klucz JSON pobrany i uploadowany na serwer (`credentials/vertex-key.json`)
- [ ] OAuth Consent Screen skonfigurowany (External, scopes: email, profile)
- [ ] OAuth Client ID + Secret skopiowane
- [ ] GEMINI_API_KEY wygenerowany z AI Studio
- [ ] Plik `.env` — wypełniony wszystkimi zmiennymi
- [ ] Plik `emails.txt` — z dozwolonymi emailami
- [ ] `docker-compose.yml` — zaktualizowany (oauth2-proxy + openclaw z patchami)
- [ ] `openclaw.json` — ustawione modele z failover chain
- [ ] `sessions.json` — override sesji (opcjonalnie)
- [ ] Patche (`apply-patches.sh`, `models.generated.js`, `getToken.js`) na serwerze
- [ ] `chmod +x patches/apply-patches.sh`
- [ ] `docker compose up -d` — oba kontenery działają
- [ ] Vertex AI odpowiada w teście (krok 10.3)
- [ ] OAuth działa — logowanie przez Google prowadzi do UI OpenClaw
