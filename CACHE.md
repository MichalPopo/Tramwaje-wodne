# Tramwaje Wodne — Cache sesji deweloperskiej

> **INSTRUKCJA DLA AGENTA:** Ten plik jest źródłem prawdy o stanie projektu.
> Przeczytaj go NA POCZĄTKU każdej nowej sesji. Aktualizuj go PO KAŻDEJ zmianie.

---

## Stan projektu

| Parametr | Wartość |
|----------|---------|
| **Aktualny etap** | Etap 2 (2.1–2.5 ✅) + Etap 3 Mobile ✅ (3.1–3.7 gotowe) + nowe moduły (engine-hours, tanks, water-level, api-keys, settings) |
| **Testy** | 12 plików testowych (database, auth.service, auth.routes, auth.middleware, errorHandler, task.routes, inventory, scheduling, supplier, engine-hours, tanks, water-level) |
| **Serwer działa** | TAK — backend Render (tramwaje-wodne-api.onrender.com), frontend GH Pages, baza Turso |
| **Mobile** | ✅ Expo SDK 55, standalone APK (embedded JS bundle), offline SQLite, sync WiFi, notifications |
| **APK build** | ✅ BUILD_APK.bat (one-click: export bundle + Gradle assembleDebug) |
| **APK download** | ✅ GitHub Releases v1.0.0 → przycisk 📱 APK na stronie |
| **Seeded users** | admin@tramwajewodne.pl / Kapitan123!, pracownik@tramwajewodne.pl / Kapitan123! |
| **Klucze API** | ✅ Gemini: pool kluczy (key-pool.service.ts), ✅ Open-Meteo: nie wymaga klucza |
| **Deploy** | ✅ **Render** (backend), ✅ **GitHub Pages** (frontend SPA), ✅ **Turso** (baza danych) |
| **Frontend URL** | https://michalpopo.github.io/Tramwaje-wodne/ |
| **Backend URL** | https://tramwaje-wodne-api.onrender.com |
| **DB URL** | libsql://tramwaje-wodne-michalpopo.aws-eu-west-1.turso.io |
| **Firewall** | ✅ Reguła "Tramwaje Wodne API" — port 3001 TCP (incoming, dev only) |
| **Ostatnia aktualizacja** | 2026-03-20T11:00:00+01:00 |

### Feature map — co jest zrobione

| Etap | Feature | Status | Pliki |
|------|---------|--------|-------|
| 1.1 | Fundament | ✅ | schema.sql, seed.sql, database.ts |
| 1.2 | Auth + zarządzanie zespołem | ✅ | auth.service.ts, auth.routes.ts, auth.ts (middleware) — GET /users, PATCH /users/:id/active |
| 1.3 | Zarządzanie zadaniami | ✅ | task.service.ts, task.routes.ts, validation.ts |
| 1.4 | Dashboard + Login UI + Admin CRUD | ✅ | LoginPage, DashboardPage, TaskFormModal, index.css |
| 1.5 | Panel pracownika | ✅ | WorkerPage.tsx/css |
| 1.6 | AI Asystent (+ pogoda w kontekście) | ✅ | ai.service.ts, ai.routes.ts, AiChat.tsx/css |
| 1.7 | Pogoda | ✅ | weather.service.ts, weather.routes.ts, WeatherWidget.tsx/css |
| — | Dane statków (bonus) | ✅ | ship.routes.ts, ShipDataCards.tsx/css |
| 1.8 | Magazyn i zakupy | ✅ | inventory.service.ts, inventory.routes.ts, InventoryPage.tsx/css |
| 1.9 | Notatki głosowe | ✅ | VoiceNoteButton.tsx/css (Web Speech API) |
| 1.10 | Testy E2E | ✅ | inventory.test.ts (25 testów) |
| 1.11 | Naprawa luk audytu | ✅ | attachment.service/routes, config.service/routes, filtry Dashboard, foto upload Worker |
| 2.1 | Widok Gantt / Timeline | ✅ | scheduling.service.ts, GanttPage.tsx/css, GET /api/tasks/gantt |
| — | Ship CRUD (bonus) | ✅ | ship.routes.ts (POST/PUT/DELETE), ShipDataCards.tsx (edit/add modal) |
| 2.2 | Certyfikaty i inspekcje | ✅ | certificate.service.ts, certificate.routes.ts, CertificatesPage.tsx/css, 3 nowe tabele, AI scan zdjęć/PDF |
| 2.2+ | Inspekcje: klikalne szablony + custom checklists | ✅ | CertificatesPage.tsx (expandedTemplate, showNewTemplate modal, saveNewTemplate, deleteTemplate), CertificatesPage.css (expanded styles, template form) |
| 2.3 | QR kody + Baza Wiedzy | ✅ | equipment.service.ts, equipment.routes.ts, EquipmentPage.tsx/css, QR gen (qrcode npm), AI instrukcje, kontekst AI |
| 2.4 | Baza dostawców + optymalizacja zakupów | ✅ | supplier.service.ts, supplier.routes.ts, SuppliersPage.tsx/css, AI kontekst dostawców |
| 2.4b | Google Maps + AI dostawcy + materiały | ✅ | ai.service.ts (searchSupplier, generateTaskMaterials), AiChat.tsx (SUPPLIER_JSON), TaskFormModal.tsx (krok materiałów), SuppliersPage (Maps) |
| 2.1+ | Gantt interaktywny | ✅ | GanttPage.tsx (drag-to-move, sidebar edycji, zależności, kolory per statek, weather overlay, split/merge, timezone fix, cycle detection + broken_edges warning) |
| 2.1+ | Gantt auto-pin + archiwum | ✅ | scheduling.service.ts (auto-pin planned_start, exclude done, zero-duration guard), CompletedTasksPage.tsx/css, DashboardPage (ukrycie done) |
| — | Split/merge zadań | ✅ | task.service.ts (splitTask/mergeTasks), task.routes.ts (POST /split, POST /merge), scheduling.service.ts (weather_dependent+split_group_id w response) |
| 2.5 | Budżet i koszty | ✅ | budget.service.ts (5 agregacji: task/ship/category/season/monthly + actual_unit_price), budget.routes.ts (7 endpointów), BudgetPage.tsx/css (karty, Canvas wykresy, config editor) |
| 2.5+ | Budżet: ręczne wydatki | ✅ | expenses table (schema.sql), budget.routes.ts (GET/POST/DELETE /expenses), budget.service.ts (total_expenses w summary), api.ts (Expense type + CRUD), BudgetPage.tsx (formularz + tabela wydatków) |
| — | Audyt #9 (5 fixów) | ✅ | attachment RBAC, nav flex-wrap, schema renumbered 1-20, worker equipment link, changePassword (service+route+API+TeamPage modal) |
| — | Zarządzanie pracownikami (TeamPage) | ✅ | TeamPage.tsx (tabela, toggle active, zmiana hasła, **usuwanie użytkowników**, link z nav), auth.routes.ts (PATCH /users/:id/password, **DELETE /users/:id**) |
| — | PWA manifest | ✅ | manifest.json, icon-512.png, meta tagi w index.html (scope: /Tramwaje-wodne/) |
| — | Deployment (Render+GH Pages) | ✅ | render.yaml, GH Actions deploy, Turso cloud DB, CORS, SPA 404→index.html trick |
| — | SPA Routing fix | ✅ | Zamiana `<a href>` → `<Link to>` w 9 plikach Page (21 linków), basename `/Tramwaje-wodne/` |
| — | Missing await fix | ✅ | 26 brakujących `await` w 5 route files (api-keys, engine-hours, inventory, supplier, task) |
| — | Seed idempotency | ✅ | database.ts — seed.sql uruchamia się TYLKO na pustą bazę (sprawdzenie users count) |
| — | START.bat | ✅ | Double-click start (API + frontend) |
| — | BUILD_APK.bat | ✅ | One-click APK build (export + Gradle assembleDebug) |
| — | Admin task management (web) | ✅ | DashboardPage: TaskDetailModal (status change + time logging) |
| — | Admin task management (mobile) | ✅ | Fix: TaskDetailScreen crash, AdminTasksScreen statuses, AdminDashScreen user filter, navigation |
| — | APK download (web) | ✅ | DashboardPage: przycisk 📱 APK → GitHub Releases (`/releases/latest`) |
| — | GitHub Release v1.0.0 | ✅ | `gh release create v1.0.0` z app-debug.apk (166MB) |
| — | Poziom wody (stacja Tolkmicko) | ✅ | water-level.service.ts, water-level.routes.ts, WaterLevelWidget.tsx/css, water_level_cache table |
| — | Motogodziny + serwis | ✅ | engine-hours.service.ts, engine-hours.routes.ts, EngineHoursPage.tsx, engine_hours + service_intervals + service_logs tables |
| — | Zbiorniki paliwa/wody | ✅ | tanks.service.ts, tanks.routes.ts, TanksPage.tsx, tanks + tank_logs tables |
| — | Klucze API (pool) | ✅ | key-pool.service.ts, api-keys.routes.ts, SettingsPage.tsx (zarządzanie kluczami) |
| — | Galeria zdjęć | ✅ | PhotoGallery.tsx/css (lightbox, zoom, carousel) |

---

## Architektura

```
D:\TramwajeWodne\
├── .gitignore
├── CACHE.md                       # TEN PLIK
├── START.bat                      # ★ Double-click start (API + frontend)
├── prompt.md                      # specyfikacja projektu (105 lines)
├── server\
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts           # 95% coverage thresholds
│   ├── .env                       # PORT, JWT_SECRET, GEMINI_API_KEY, WEATHER_LAT/LON
│   ├── .env.example
│   └── src\
│       ├── index.ts               # Express — montuje 16 routerów: auth, task, ai, weather, ships, inventory, attachments, config, certificates, equipment, suppliers, budget, water-level, engine-hours, tanks, api-keys
│       ├── db\
│       │   ├── database.ts        # Turso/libsql client + conditional seed (only on empty DB)
│       │   ├── schema.sql         # 28 tabel (users, ships, tasks, task_assignments, task_dependencies, time_logs, attachments, inventory_items, task_materials, ai_conversations, ai_messages, weather_cache, config, certificates, inspection_templates, inspections, equipment, instructions, instruction_steps, suppliers, supplier_inventory, water_level_cache, engine_hours, service_intervals, service_logs, tanks, tank_logs, expenses)
│       │   └── seed.sql           # 2 statki, 9 zadań, 2 użytkowników, 5 narzędzi, 4 certyfikaty, 2 szablony inspekcji, 5 urządzeń, 1 instrukcja, 4 dostawców
│       ├── middleware\
│       │   ├── errorHandler.ts    # centralized errors
│       │   └── auth.ts            # authMiddleware + roleGuard
│       ├── routes\
│       │   ├── auth.routes.ts     # POST login, register; GET me, GET users, PATCH users/:id/active, PATCH users/:id/password, DELETE users/:id
│       │   ├── task.routes.ts     # 11 endpointów CRUD+status+time+my+today+split+merge
│       │   ├── ai.routes.ts       # POST chat, POST search-supplier (Google Search grounding); GET conversations, messages; DELETE conv
│       │   ├── weather.routes.ts  # GET forecast (Open-Meteo + SQLite cache 30min)
│       │   ├── ship.routes.ts     # GET list, detail; POST/PUT/DELETE (admin, ship CRUD)
│       │   ├── inventory.routes.ts # 11 endpointów: CRUD, quantity, materials, shopping list
│       │   ├── attachment.routes.ts # POST upload (base64), GET list/detail, DELETE
│       │   ├── config.routes.ts   # GET/PUT key-value config (np. season_start) — GET zwraca '' dla brakujących kluczy
│       │   ├── certificate.routes.ts # CRUD certyfikatów, /expiring, /scan (AI Vision), inspekcje
│       │   ├── equipment.routes.ts   # ★ CRUD urządzeń + instrukcji, QR gen, AI format instrukcji
│       │   ├── supplier.routes.ts    # ★ CRUD dostawców, powiązania z magazynem, lista zakupów wg dostawców
│       │   ├── budget.routes.ts      # ★ Summary, by-ship, by-category, monthly, task costs, config, expenses CRUD
│       │   ├── water-level.routes.ts # ★ GET / (stacja Tolkmicko, cache)
│       │   ├── engine-hours.routes.ts # ★ CRUD motogodzin, interwały serwisowe, alerty, logi serwisów
│       │   ├── tanks.routes.ts      # ★ CRUD zbiorników, logi tankowania, alerty, statystyki
│       │   └── api-keys.routes.ts   # ★ CRUD kluczy Gemini API (admin), toggle, clear cooldown
│       ├── services\
│       │   ├── auth.service.ts    # bcrypt, JWT
│       │   ├── task.service.ts    # list, create, update, delete, status, time, splitTask, mergeTasks
│       │   ├── scheduling.service.ts # ★ DAG, topological sort (graceful cycle-breaking), CPM (hour-level per-person scheduling), wouldCreateCycle(), getGanttData() (broken_edges)
│       │   ├── ai.service.ts      # Gemini 2.5 Flash Lite, system prompt, konwersacje, searchSupplier (REST API + google_search grounding)
│       │   ├── weather.service.ts # Open-Meteo fetch, WMO codes PL, okna malowania/spawania
│       │   ├── inventory.service.ts # CRUD, qty adjust, task materials, shopping list, AI context
│       │   ├── certificate.service.ts # ★ CRUD certyfikatów, expiry alerts, szablony inspekcji, wykonanie inspekcji
│       │   ├── attachment.service.ts # CRUD attachments (base64 przechowywany w kolumnie `filename` tabeli attachments)
│       │   ├── config.service.ts  # key-value config (get/set, season_start, season_budget, hourly_rate)
│       │   ├── equipment.service.ts # ★ CRUD urządzeń + instrukcji + kroków, QR, AI context builder
│       │   ├── supplier.service.ts  # ★ CRUD dostawców + powiązania + lista zakupów wg dostawców + AI context
│       │   ├── budget.service.ts    # ★ 5 agregacji kosztów (task/ship/category/season/monthly), actual_unit_price, total_expenses
│       │   ├── water-level.service.ts # ★ Stacja hydrologiczna Tolkmicko (imgw fetch + cache)
│       │   ├── engine-hours.service.ts # ★ Motogodziny urządzeń, interwały serwisowe, alerty zbliżających się serwisów
│       │   ├── tanks.service.ts     # ★ Zbiorniki paliwa/wody, logi tankowania/zużycia, alerty niskich poziomów
│       │   ├── key-pool.service.ts  # ★ Gemini API key pool z cooldown rotation
│       │   └── validation.ts      # Zod schemas (auth + tasks + ai + splitTask); dostawcy mają inline schemas w supplier.routes.ts
│       ├── types\
│       │   └── sql.js.d.ts
│       └── __tests__\
│           ├── database.test.ts        # 31 testów
│           ├── auth.service.test.ts    # 21 testów
│           ├── auth.routes.test.ts     # 20 testów
│           ├── auth.middleware.test.ts  # 2 testy
│           ├── errorHandler.test.ts    # 5 testów
│           ├── task.routes.test.ts     # 36 testów
│           ├── inventory.test.ts      # 25 testów
│           ├── scheduling.test.ts     # 17 testów (DAG, topo sort, cycle-breaking, wouldCreateCycle, CPM, same-day scheduling, API)
│           ├── supplier.test.ts      # 28 testów (CRUD, filtry, powiązania, lista zakupów, AI)
│           ├── engine-hours.test.ts   # ★ testy motogodzin i serwisów
│           ├── tanks.test.ts         # ★ testy zbiorników i logów
│           └── water-level.test.ts   # ★ testy poziomu wody
├── deploy\
│   ├── .env.production            # ★ Bezpieczny JWT (64 znaki), GEMINI jako env var
│   ├── Caddyfile                  # ★ Reverse proxy + auto-SSL + security headers
│   ├── ecosystem.config.cjs       # ★ PM2 (tsx runtime)
│   ├── deploy.sh                  # ★ One-shot deploy script
│   ├── setup-server.sh            # ★ Jednorazowy setup Ubuntu
│   └── README.md                  # ★ Instrukcja Cloudflare Tunnel krok-po-kroku
├── client\
│   ├── package.json               # Vite + React + TS
│   ├── vite.config.ts             # base: /Tramwaje-wodne/, proxy /api → :3001 (dev)
│   └── src\
│       ├── index.css              # ★ Design system (dark maritime, 404 lines)
│       ├── api.ts                 # ★ Typed API client (auth, tasks, ships, weather, ai, inventory, attachments, config, certificates, inspections, equipment, instructions, suppliers, budget, expenses, waterLevel, engineHours, tanks, apiKeys, changePassword, deleteUser)
│       ├── AuthContext.tsx         # ★ JWT auth + localStorage + auto-validate
│       ├── App.tsx                # ★ Role-based routing: 13 tras (login, dashboard, worker, inventory, gantt, certificates, equipment, suppliers, budget, team, engine-hours, tanks, settings)
│       ├── components\
│       │   ├── AiChat.tsx/css     # ★ Floating chat panel (Gemini, konwersacje, markdown, SUPPLIER_JSON parser, auto-routing do search grounding)
│       │   ├── WeatherWidget.tsx/css # ★ 7-dniowa prognoza + okna malowania/spawania
│       │   ├── WaterLevelWidget.tsx/css # ★ Stacja hydrologiczna Tolkmicko (poziom wody, alerty)
│       │   ├── ShipDataCards.tsx/css # ★ Rozwijane karty techniczne + edit/add modal (createPortal)
│       │   ├── TaskFormModal.tsx/css # ★ Quick/full task create+edit modal
│       │   ├── PhotoGallery.tsx/css  # ★ Galeria zdjęć z lightbox, zoom, nawigacja strzałkami
│       │   └── VoiceNoteButton.tsx/css # ★ Web Speech API → AI → zadanie (FAB)
│       └── pages\
│           ├── LoginPage.tsx/css   # Login UI (anchor logo, gradient)
│           ├── DashboardPage.tsx/css # Admin: countdown, stats, filtry, ships, weather, water level, ship data, tasks, AI chat
│           ├── GanttPage.tsx/css   # ★ Admin: Gantt timeline, CPM, drag-to-move, sidebar edycji, zależności, kolory per statek, weather overlay, split/merge, timezone fix
│           ├── WorkerPage.tsx/css  # Worker: grouped tasks, modal+foto, timer, time log, AI chat
│           ├── InventoryPage.tsx/css # Admin: tabela z filtrami, +/- qty, lista zakupów, CRUD modal
│           ├── CertificatesPage.tsx/css # ★ Certyfikaty tabela+badge+alerty, inspekcje (klikalne szablony, custom checklists), AI scan, ← Dashboard
│           ├── EquipmentPage.tsx/css   # ★ Urządzenia + instrukcje, QR kody, AI format, dyktowanie głosowe, ← Dashboard
│           ├── SuppliersPage.tsx/css   # ★ Dostawcy + powiązania z magazynem + zakupy wg dostawców + Google Maps iframe, ← Dashboard
│           ├── BudgetPage.tsx/css      # ★ Budżet sezonu (karty, wykresy Canvas, config, ręczne wydatki CRUD)
│           ├── EngineHoursPage.tsx     # ★ Motogodziny urządzeń, interwały serwisowe, alerty, logi serwisów
│           ├── TanksPage.tsx          # ★ Zbiorniki paliwa/wody (poziomy, logi, alerty, statystyki)
│           ├── SettingsPage.tsx/css    # ★ Ustawienia admin (klucze API, konfiguracja systemu)
│           └── TeamPage.tsx/css       # ★ Zarządzanie pracownikami (tabela, toggle active, zmiana hasła, usuwanie użytkowników)
├── feature_map.md                 # ★ Źródło prawdy — 30 modułów (Etap 1-4) z pełnymi opisami
├── TASKS.md                       # ★ Checklist tasków per etap
├── BUILD_APK.bat                  # ★ One-click APK build (export + Gradle)
├── mobile\                         # ★ Etap 3 — Aplikacja mobilna (React Native / Expo)
│   ├── App.tsx                    # Entry point: role-based tabs (admin vs worker), auth, sync monitor
│   ├── package.json               # Expo SDK 55, React Navigation, expo-sqlite, expo-secure-store, expo-notifications
│   ├── android\                   # Wygenerowane przez expo prebuild + index.android.bundle (embedded JS)
│   └── src\
│       ├── theme.ts               # Ciemny morski motyw
│       ├── api.ts                 # API client (WiFi, SecureStore, healthcheck)
│       ├── AuthContext.tsx         # JWT auth z SecureStore persistence
│       ├── notifications.ts       # ★ expo-notifications: 3 Android channels (tasks, sync, alerts), schedulowanie
│       ├── db\
│       │   └── localDb.ts         # ★ expo-sqlite: 7 tabel (tasks, my_tasks, inventory, sync_queue, problem_reports, notifications, sync_meta)
│       ├── sync\
│       │   ├── syncService.ts     # ★ Pull/push sync (server↔local SQLite), conflict resolution (server wins)
│       │   └── serverDiscovery.ts # ★ Connection monitor, auto-reconnect, auto-sync on reconnect
│       └── screens\
│           ├── LoginScreen.tsx     # Login + konfigurowalny adres serwera
│           ├── TasksScreen.tsx     # ★ Offline fallback z SQLite, report FAB, day grouping
│           ├── TaskDetailScreen.tsx # Szczegóły + status transitions + logowanie czasu
│           ├── InventoryScreen.tsx # Magazyn z wyszukiwaniem + adjust qty
│           ├── AiChatScreen.tsx    # AI czat (Gemini via server, konwersacje, sugestie)
│           ├── SettingsScreen.tsx  # ★ Sync status (online/offline dot, last sync, pending), manual sync
│           ├── ReportProblemScreen.tsx  # ★ Zgłoszenie problemu (kamera/galeria, priorytet, offline queue)
│           ├── AdminDashScreen.tsx     # ★ Admin dashboard (stats, workers, blocked alerts)
│           ├── AdminTasksScreen.tsx    # ★ Admin tasks (filter chips, quick approve/reject)
│           └── NotificationsScreen.tsx # ★ Log powiadomień (read/unread, type icons)
└── shared\
    └── types.ts
```

---

## API Endpoints

| Metoda | Endpoint | Auth | Opis |
|--------|----------|------|------|
| POST | /api/auth/login | ❌ | Login → token |
| POST | /api/auth/register | admin | Rejestracja użytkownika |
| GET | /api/auth/me | ✅ | Dane zalogowanego |
| GET | /api/tasks | ✅ | Lista zadań (filtry, search, pagination) |
| POST | /api/tasks | admin | Utwórz zadanie |
| PUT | /api/tasks/:id | admin | Edytuj zadanie |
| DELETE | /api/tasks/:id | admin | Usuń zadanie |
| PATCH | /api/tasks/:id/status | ✅ | Zmień status |
| POST | /api/tasks/:id/time | ✅ | Loguj czas (worker musi być assigned) |
| GET | /api/tasks/my | ✅ | Moje zadania (worker) |
| GET | /api/tasks/today | ✅ | Zadania na dziś |
| GET | /api/tasks/summary | ✅ | Statystyki |
| POST | /api/ai/chat | ✅ rl:30/10min | Wyślij wiadomość do AI |
| POST | /api/ai/search-supplier | ✅ rl:30/10min | Wyszukaj dostawcę (Gemini + Google Search grounding) |
| POST | /api/ai/generate-materials | ✅ rl:30/10min | AI generuje listę materiałów per zadanie (cross-ref z magazynem) |
| GET | /api/ai/conversations | ✅ | Lista konwersacji |
| GET | /api/ai/conversations/:id | ✅ | Wiadomości konwersacji |
| DELETE | /api/ai/conversations/:id | ✅ | Usuń konwersację |
| GET | /api/weather/forecast | ✅ | 7-dniowa prognoza (cache 30min) |
| GET | /api/ships | ✅ | Lista statków z JSON specs |
| GET | /api/ships/:id | ✅ | Statek + statystyki zadań |
| GET | /api/inventory | ✅ | Lista inwentarza (filtry: category, ship, search, low_stock) |
| POST | /api/inventory | admin | Dodaj pozycję magazynową |
| PUT | /api/inventory/:id | admin | Edytuj pozycję |
| DELETE | /api/inventory/:id | admin | Usuń pozycję |
| PATCH | /api/inventory/:id/quantity | ✅ | Zmień stan (+/-) |
| GET | /api/inventory/shopping-list | admin | Zagregowana lista zakupów |
| POST | /api/inventory/tasks/:taskId/materials | admin | Dodaj materiał do zadania |
| DELETE | /api/inventory/materials/:id | admin | Usuń materiał z zadania |
| GET | /api/attachments/tasks/:taskId/attachments | ✅ | Lista załączników zadania |
| POST | /api/attachments/tasks/:taskId/attachments | ✅ | Upload zdjęcia (base64) |
| GET | /api/attachments/:id | ✅ | Pobierz załącznik z danymi |
| DELETE | /api/attachments/:id | ✅ | Usuń załącznik |
| GET | /api/config/:key | ✅ | Pobierz wartość konfiguracji |
| PUT | /api/config/:key | admin | Ustaw wartość konfiguracji |
| GET | /api/tasks/gantt | ✅ | Gantt — CPM scheduling (filtry: ship_id, assignee_id), weather_dependent, split_group_id, per-task weather thresholds, **broken_edges** (cykle auto-łamane) |
| POST | /api/tasks/:id/split | admin | Rozdziel zadanie na dwie części (split_after_hours) |
| POST | /api/tasks/merge/:splitGroupId | admin | Połącz rozdzielone zadania z powrotem |
| GET | /api/health | ❌ | Healthcheck |
| GET | /api/equipment | ✅ | Lista urządzeń (filtry: ship_id, type) |
| GET | /api/equipment/:id | ✅ | Szczegóły urządzenia + instrukcje |
| POST | /api/equipment | admin | Dodaj urządzenie |
| PUT | /api/equipment/:id | admin | Edytuj urządzenie |
| DELETE | /api/equipment/:id | admin | Usuń urządzenie |
| GET | /api/equipment/qr/:id | ✅ | Generuj QR kod (SVG + DataURL) |
| GET | /api/equipment/instructions/list | ✅ | Lista instrukcji |
| GET | /api/equipment/instructions/:id | ✅ | Szczegóły instrukcji + kroki |
| POST | /api/equipment/instructions | admin | Utwórz instrukcję z krokami |
| DELETE | /api/equipment/instructions/:id | admin | Usuń instrukcję |
| POST | /api/equipment/instructions/ai-format | admin | AI formatuje tekst → kroki |
| GET | /api/suppliers | ✅ | Lista dostawców (filtry: category, search) |
| GET | /api/suppliers/:id | ✅ | Szczegóły dostawcy + powiązania |
| POST | /api/suppliers | admin | Dodaj dostawcę |
| PUT | /api/suppliers/:id | admin | Edytuj dostawcę |
| DELETE | /api/suppliers/:id | admin | Usuń dostawcę |
| POST | /api/suppliers/:id/inventory | admin | Powiąż dostawcę z pozycją magazynową |
| DELETE | /api/suppliers/inventory/:linkId | admin | Usuń powiązanie |
| GET | /api/suppliers/shopping-list | admin | Lista zakupów wg dostawców |
| GET | /api/budget/summary | ✅ | Podsumowanie budżetu (season, incl. total_expenses) |
| GET | /api/budget/by-ship | ✅ | Koszty per statek |
| GET | /api/budget/by-category | ✅ | Koszty per kategoria |
| GET | /api/budget/monthly | ✅ | Koszty per miesiąc |
| GET | /api/budget/tasks/:id | ✅ | Koszty konkretnego zadania |
| PUT | /api/budget/config | admin | Aktualizuj budżet/stawkę godzinową |
| PATCH | /api/budget/materials/:id | ✅ | Aktualizuj cenę zakupu materiału |
| GET | /api/budget/expenses | ✅ | Lista ręcznych wydatków |
| POST | /api/budget/expenses | admin | Dodaj ręczny wydatek |
| DELETE | /api/budget/expenses/:id | admin | Usuń wydatek |
| GET | /api/water-level | ✅ | Poziom wody stacja Tolkmicko |
| GET | /api/engine-hours | ✅ | Lista urządzeń z motogodzinami |
| POST | /api/engine-hours | admin | Dodaj urządzenie do śledzenia |
| PUT | /api/engine-hours/:equipmentId | admin | Edytuj urządzenie |
| POST | /api/engine-hours/:equipmentId/add | ✅ | Dodaj motogodziny |
| GET | /api/engine-hours/service-intervals | ✅ | Interwały serwisowe |
| POST | /api/engine-hours/service-intervals | admin | Dodaj interwał serwisowy |
| GET | /api/engine-hours/service-alerts | ✅ | Alerty zbliżających się serwisów |
| GET | /api/engine-hours/service-logs | ✅ | Logi wykonanych serwisów |
| POST | /api/engine-hours/service-logs | ✅ | Dodaj wpis serwisowy |
| GET | /api/tanks | ✅ | Lista zbiorników (filtry: ship_id) |
| GET | /api/tanks/alerts | ✅ | Alerty niskich poziomów |
| GET | /api/tanks/:id | ✅ | Szczegóły zbiornika |
| POST | /api/tanks | admin | Dodaj zbiornik |
| PUT | /api/tanks/:id | admin | Edytuj zbiornik |
| POST | /api/tanks/:id/log | ✅ | Dodaj log tankowania/zużycia |
| GET | /api/tanks/:id/logs | ✅ | Logi zbiornika |
| GET | /api/tanks/:id/stats | ✅ | Statystyki zbiornika |
| GET | /api/api-keys | admin | Lista kluczy API |
| POST | /api/api-keys | admin | Dodaj klucz API |
| DELETE | /api/api-keys/:id | admin | Usuń klucz API |
| PATCH | /api/api-keys/:id/toggle | admin | Włącz/wyłącz klucz |
| POST | /api/api-keys/:id/clear-cooldown | admin | Wyczyść cooldown klucza |
| GET | /api/auth/users | admin | Lista użytkowników |
| PATCH | /api/auth/users/:id/active | admin | Toggle aktywność użytkownika |
| PATCH | /api/auth/users/:id/password | ✅ | Zmień hasło (admin→dowolne, user→własne z old_password) |
| DELETE | /api/auth/users/:id | admin | Usuń użytkownika (czyści FK: task_assignments, attachments, inspections, service_logs, tank_logs, expenses) |

---

## Zmienne środowiskowe (server/.env)

```
PORT=3001
NODE_ENV=development
JWT_SECRET=dev-secret-key-change-in-production-min32chars!!
JWT_EXPIRES_IN=24h
GEMINI_API_KEY=<klucz>
OPENWEATHERMAP_API_KEY=          # nieużywany (zastąpiony Open-Meteo)
WEATHER_LAT=54.3153              # Tolkmicko
WEATHER_LON=19.5314
SEASON_START_DATE=2026-04-26
```

---

## Audyt — 30 bugów znalezionych i naprawionych

### Faza 1.1-1.3 — (23 bugi) — patrz poprzednie audyty

### Faza 1.4+1.5 — Audyt #7 (7 bugów)
24. ✅ `openTask()` — brak try/catch → uncaught API crash
25. ✅ `handleStatusChange()` — j.w.
26. ✅ `handleTimeSubmit()` — j.w.
27. ✅ `prompt()` dla blocked_reason — nie działa na mobile → inline input
28. ✅ Brak wizualnego feedbacku błędów → error toast
29. ✅ `db.run()` nie wykonywał multi-statement SQL → `db.exec()`
30. ✅ seed.sql task_assignments ignorowane przez sql.js → programmatic insert

### Audyt #8 — pełny przegląd systemu (5 bugów + 1 nitpick)
31. ✅ `createTestDatabase()` — `db.run()` zamiast `db.exec()` (cichy brak schematu)
32. ✅ CACHE.md — port 5175 vs faktyczny 5173 (kosmetyka)
33. ✅ `listTasks()` — brak `ESCAPE` w SQL LIKE (wildcards nie escape'owane)
34. ✅ `api.ts` — brak `updated_at` w interfejsie `User`
35. 🔵 Dashboard countdown — nigdy się nie odświeża (niski priorytet, zostawione)
36. 🔵 `req.user!` non-null assertions — bezpieczne w obecnym kodzie
37. ✅ `logTime()` — brak sprawdzenia assignment → worker mógł logować czas wszędzie
N1. ✅ `seed.sql` — mylący komentarz hasła (`Pracownik1!` → `Kapitan123!`)

### Audyt #9 — pełny przegląd (5 fixów)
38. ✅ Attachment RBAC — tylko uploader lub admin może usunąć
39. ✅ Dashboard nav overflow — flex-wrap
40. ✅ Schema numbering — renumeracja 1–20
41. ✅ Worker equipment link — dodano do nav pracownika
42. ✅ changePassword — admin reset + user change (PATCH /users/:id/password) + TeamPage modal

### Sesja 2026-03-11 — Gantt + Mobile (6 fixów)
43. ✅ Gantt UTC date parsing — `new Date("YYYY-MM-DD")` parsuje UTC midnight, w CET = dzień wcześniej → local parse fix
44. ✅ Gantt scheduling infinite loop — `while(true)` w `findEarliestSlot` → safety limit 365 dni + fallback
45. ✅ Gantt display — uproszczone: zawsze używa server `early_start` (single source of truth)
46. ✅ Mobile AI chat — odpowiedź AI parsowana z `{message:{content}}` zamiast plain string
47. ✅ Mobile `AbortSignal.timeout()` — nieobsługiwane w Hermes → `AbortController` + `setTimeout`
48. ✅ Firewall Windows — reguła TCP port 3001 dla połączeń LAN z telefonu
49. ✅ Gantt cykliczne zależności — topologicalSort łamał się na cyklach (throw) → graceful cycle-breaking + wouldCreateCycle() prevention + broken_edges warning w UI
50. ✅ Gantt same-day scheduling — dwa krótkie zadania (np. 4h+3h) przypisane do tej samej osoby nie mogły być na jednym dniu → refaktor z binarnego day-occupancy na hour-level tracking per person

### Audyt #10 — Poprawki krytyczne logiki (4 fixy)
51. ✅ `splitTask` / `mergeTasks` ON DELETE CASCADE data loss — chroni przed usunięciem time_logs, materiałów i załączników przy dzieleniu zadań poprzez transfer przed usunięciem.
52. ✅ Certyfikaty i Magazyn: React `<select>` strict equality — wymuszenie `value={String(s.id)}` by zapobiec auto-odznaczaniu po restrykcyjnej renderze DOM. Dodano wyświetlanie ukrytych błędów sieci (np. 400 Bad Request).
53. ✅ Lista zakupów (Niedoszacowanie) — naprawiono błędne grupowanie w `inventory.service.ts` i `supplier.service.ts` (groupBy ignorowało `inventory_id` na rzecz nazwy własnej).
54. ✅ `schema.sql` ON DELETE CASCADE — uzupełniono brakujące kaskady dla `certificates`, `inspection_templates`, `inspections`.

### Sesja 2026-03-18 — Deploy produkcyjny (10 fixów)
55. ✅ SPA routing — zamiana 21 `<a href>` → `<Link to>` w 9 plikach Page (DashboardPage, WorkerPage, TanksPage, SuppliersPage, SettingsPage, InventoryPage, EquipmentPage, EngineHoursPage, CertificatesPage)
56. ✅ Missing `await` — 26 brakujących `await` async service calls w 5 route files → `.map()` crash na każdej stronie
57. ✅ PWA manifest paths — icon-512.png i manifest.json bez `/Tramwaje-wodne/` prefix → 404
58. ✅ Service Worker 404 — rejestracja `/sw.js` który nie istnieje → usunięta
59. ✅ Deprecated meta tag — `apple-mobile-web-app-capable` → `mobile-web-app-capable`
60. ✅ Config 404 spam — `season_start` zwracał 404 zamiast pustego stringa → 10+ błędów w konsoli
61. ✅ Certificate route ordering — `GET /:id` łapał `/inspections` (NaN → 400) → `next()` dla non-numeric
62. ✅ Seed re-insert — `seed.sql` uruchamiał się przy każdym restarcie, wstawiając usunięte dane od nowa → conditional seed (only on empty DB)
63. ✅ Render deploy — render.yaml, CORS origin config, GH Actions workflow client deploy
64. ✅ Turso migration — sql.js → @libsql/client, persistent cloud database

---

## Szczegóły implementacji kluczowych komponentów

### AI Asystent (1.6)
- Model: `gemini-2.5-flash-lite` (wyższe limity RPM niż 2.0-flash)
- System prompt: dynamiczny kontekst (zadania użytkownika + dane statków)
- Konwersacje: tabele `ai_conversations` + `ai_messages`, ownership check
- Rate limit: 30 req / 10 min per IP (express-rate-limit)
- Frontend: floating FAB → slide-up panel, markdown rendering, suggestions
- Obsługa błędów: 429 (rate limit), 404 (conv not found), 503 (brak klucza)

### Pogoda (1.7)
- API: Open-Meteo (darmowe, bez klucza)
- Endpoint: `https://api.open-meteo.com/v1/forecast`
- Parametry: daily (temp, wiatr, opady, kod pogody WMO)
- Cache: SQLite `weather_cache`, 30 min TTL
- Okna pracy: malowanie (>5°C, wiatr<30, brak deszczu), spawanie (wiatr<20, brak opadów)
- WMO codes: pełne tłumaczenia na PL + emoji ikony

### Dane statków (bonus)
- Karty techniczne z rozwijalnymi specyfikacjami (JSON → grid)
- Polskie etykiety + ikony dla wszystkich parametrów
- API: `/api/ships` (lista), `/api/ships/:id` (szczegóły + task stats)

---

## Co dalej

**Do zrobienia (zgłoszone przez użytkownika):**
- [ ] **Budżet: rozdzielenie szacunków od faktycznych wydatków** — `budget.service.ts` traktuje WSZYSTKIE materiały (w tym AI-generowane szacunki) jako faktyczne wydatki. Fix: liczyć do "Wydano" tylko materiały z `purchased=1`. Dodać UI do oznaczania jako "kupione" + pole na faktyczną cenę. Zaktualizować karty budżetu (szacunki vs wydatki).
- [ ] **Lista zakupów → zakup → magazyn** — W InventoryPage lista zakupów nie ma opcji oznaczenia pozycji jako kupionej z podaniem ilości, co automatycznie dodałoby stan do magazynu (qty adjust). Potrzebny przycisk "Kupiono" z inputem ilości + auto-update `inventory_items.quantity` i `task_materials.purchased=1`.
- [x] **Mobile: Admin nie ma dostępu do logowania czasu** — `AdminTasksScreen` nie nawiguje do `TaskDetailScreen` (brak `onPress` na kartach zadań). Admin nie może logować czasu, zmieniać statusu ani widzieć szczegółów. ✅ Fix: nawigacja do `AdminTaskDetail` + statusy ujednolicone (`pending`→`todo`, `completed`→`done`) + crash fix `task.priority.charAt(0)` na undefined.
- [x] **Mobile: Admin widzi tylko pracowników, nie siebie** — lista aktywnych użytkowników filtruje po roli `worker`, pomijając adminów. ✅ Fix: filtr `u.is_active` zamiast `u.role === 'worker'`.
- [x] **Web: Admin nie może zmieniać statusu ani logować czasu** — DashboardPage miał tylko edycję przez TaskFormModal. ✅ Fix: nowy TaskDetailModal z przyciskami statusu + formularz logowania czasu.
- [x] **APK download na stronie** — przycisk 📱 APK w headerze DashboardPage → GitHub raw URL.

**Etap 2 (web):** 2.6 Google Calendar Sync (jedyny niezrobiony moduł).

**Etap 3 (mobile — GOTOWY):**
- ✅ 3.7 Setup: Expo + React Native, prebuild, Android Studio
- ✅ 3.1 Worker: Zadania z offline, magazyn, AI czat, zgłoszenia problemów
- ✅ 3.2 Admin-light: Dashboard ze statystykami, quick approve/reject
- ✅ 3.3 WiFi Sync: pull/push service, sync queue, auto-reconnect
- ✅ 3.4 Offline-first: SQLite 7 tabel, cache, queue mutations, sync indicator
- ✅ 3.5 AI: Czat przez serwer, konwersacje, sugestie
- ✅ 3.6 Powiadomienia: 3 Android channels, deadline alerts, task reminders
- ✅ 3.7 Standalone APK: embedded JS bundle, BUILD_APK.bat, działa bez Metro
- Brakuje: Firebase Cloud Messaging, kompresja zdjęć, podpis release APK

**Server CORS:** Produkcja: `origin: [GH Pages URL, localhost:5173]` — Dev: `origin: true`
**Server bind:** `0.0.0.0` (dostępny z LAN, nie tylko localhost)

**Znane problemy:**
- Lint warnings: `string | string[]` w Express route params (nie blokuje runtime — tsx transpiluje)
- Gemini API quota — pool kluczy z cooldown (key-pool.service.ts)
- Weekendy traktowane jako dni robocze (zgodnie z branżą)
- Gantt: wiele zadań per osoba per dzień → automatycznie rozkładane na kolejne dni (capacity 1/os/dzień)
- GH Pages SPA: `GET /Tramwaje-vodne/someRoute` zwraca 404 w Network tab — to normalne (404.html = index.html trick)
- Render free tier: serwer usypia po 15 min bezczynności, pierwszy request trwa ~30s
- APK (166MB) zbyt duży na git repo → dystrybucja przez GitHub Releases (limit 2GB per asset)
- `gh` CLI zainstalowane (`winget install GitHub.cli`), zalogowane jako MichalPopo

### Sesja 2026-03-20 — Gantt date pinning + archiwum ukończonych
55. ✅ Gantt auto-pin `planned_start` — po obliczeniu harmonogramu, scheduler zapisuje daty do DB → zadania nie dryfują z dnia na dzień
56. ✅ Gantt exclude done — ukończone zadania nie blokują capacity i nie pojawiają się w harmonogramie
57. ✅ CompletedTasksPage — osobna strona `/completed` z archiwum ukończonych zadań (szukanie, filtr kategorii, statystyki, cofnij do aktywnych)
58. ✅ Dashboard — ukończone zadania ukryte domyślnie, przycisk ✅ Zakończone w nawigacji
59. ✅ Testy — poprawka async/await w scheduling.test.ts (pre-existing issue)
---

## Komendy

```bash
cd D:\TramwajeWodne\server
cmd /c "npx vitest run --reporter=verbose"  # testy
cmd /c "npm run dev"                         # serwer dev

cd D:\TramwajeWodne\client
cmd /c "npx vite --host"                     # frontend dev
```
