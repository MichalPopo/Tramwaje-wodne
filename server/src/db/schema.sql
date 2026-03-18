-- ============================================================
-- Tramwaje Wodne — Schemat bazy danych (MVP)
-- ============================================================

-- 1. UŻYTKOWNICY
CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    email       TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password    TEXT NOT NULL,
    name        TEXT NOT NULL,
    role        TEXT NOT NULL CHECK(role IN ('admin', 'worker')),
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. STATKI
CREATE TABLE IF NOT EXISTS ships (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    short_name  TEXT NOT NULL,
    specs       TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 3. ZADANIA
CREATE TABLE IF NOT EXISTS tasks (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    title               TEXT NOT NULL,
    description         TEXT,
    ship_id             INTEGER REFERENCES ships(id) ON DELETE SET NULL,
    ship_scope          TEXT CHECK(ship_scope IN ('single', 'both', 'infrastructure')),
    category            TEXT NOT NULL CHECK(category IN (
                            'spawanie', 'malowanie', 'mechanika_silnikowa',
                            'elektryka', 'hydraulika', 'stolarka',
                            'inspekcja', 'logistyka', 'rejs_probny', 'inne'
                        )),
    status              TEXT NOT NULL DEFAULT 'todo' CHECK(status IN (
                            'todo', 'in_progress', 'blocked', 'done'
                        )),
    blocked_reason      TEXT,
    priority            TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN (
                            'critical', 'high', 'normal', 'low'
                        )),
    estimated_hours     REAL,
    actual_hours        REAL DEFAULT 0,
    estimated_cost      REAL,
    actual_cost         REAL DEFAULT 0,
    deadline            TEXT,
    planned_start       TEXT,
    split_group_id      INTEGER,
    weather_dependent   INTEGER NOT NULL DEFAULT 0,
    weather_min_temp    REAL,
    weather_max_humidity REAL,
    weather_max_wind    REAL,
    weather_no_rain     INTEGER DEFAULT 0,
    logistics_notes     TEXT,
    created_by          INTEGER REFERENCES users(id),
    is_report           INTEGER NOT NULL DEFAULT 0,
    report_approved     INTEGER,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 4. PRZYPISANIA OSÓB DO ZADAŃ
CREATE TABLE IF NOT EXISTS task_assignments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(task_id, user_id)
);

-- 5. ZALEŻNOŚCI MIĘDZY ZADANIAMI
CREATE TABLE IF NOT EXISTS task_dependencies (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id         INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    depends_on_id   INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    UNIQUE(task_id, depends_on_id),
    CHECK(task_id != depends_on_id)
);

-- 6. LOGI CZASU PRACY
CREATE TABLE IF NOT EXISTS time_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    hours       REAL NOT NULL,
    note        TEXT,
    logged_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 7. ZAŁĄCZNIKI
CREATE TABLE IF NOT EXISTS attachments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    type        TEXT NOT NULL CHECK(type IN ('photo', 'voice_note', 'document')),
    filename    TEXT NOT NULL,
    original_name TEXT,
    mime_type   TEXT,
    note        TEXT,
    tag         TEXT CHECK(tag IN ('before', 'after', 'progress', NULL)),
    uploaded_by INTEGER REFERENCES users(id),
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 8. MAGAZYN
CREATE TABLE IF NOT EXISTS inventory_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    category    TEXT NOT NULL CHECK(category IN ('tool', 'material', 'part')),
    unit        TEXT,
    quantity    REAL NOT NULL DEFAULT 0,
    min_quantity REAL,
    location    TEXT,
    ship_id     INTEGER REFERENCES ships(id) ON DELETE SET NULL,
    notes       TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 9. MATERIAŁY PER ZADANIE (task_materials)
CREATE TABLE IF NOT EXISTS task_materials (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id         INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    inventory_id    INTEGER REFERENCES inventory_items(id) ON DELETE SET NULL,
    name            TEXT NOT NULL,
    quantity_needed REAL NOT NULL,
    unit            TEXT,
    purchased       INTEGER NOT NULL DEFAULT 0,
    actual_unit_price REAL,
    notes           TEXT
);

-- 10. HISTORIA CZATU AI (ai_conversations + ai_messages)
CREATE TABLE IF NOT EXISTS ai_conversations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    content         TEXT NOT NULL,
    metadata        TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 11. CACHE POGODY (weather_cache)
CREATE TABLE IF NOT EXISTS weather_cache (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    data        TEXT NOT NULL,
    fetched_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 12. KONFIGURACJA (config)
CREATE TABLE IF NOT EXISTS config (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL
);

-- INDEKSY
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_ship ON tasks(ship_id);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_task_assignments_user ON task_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_time_logs_task ON time_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_time_logs_user ON time_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_attachments_task ON attachments(task_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conv ON ai_messages(conversation_id);

-- 13. CERTYFIKATY
CREATE TABLE IF NOT EXISTS certificates (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    ship_id       INTEGER REFERENCES ships(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    issuer        TEXT,
    number        TEXT,
    issue_date    TEXT,
    expiry_date   TEXT NOT NULL,
    notes         TEXT,
    status        TEXT NOT NULL DEFAULT 'active'
                  CHECK(status IN ('active','expired','renewed')),
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 14. SZABLONY INSPEKCJI
CREATE TABLE IF NOT EXISTS inspection_templates (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    ship_id       INTEGER REFERENCES ships(id) ON DELETE CASCADE,
    items         TEXT NOT NULL DEFAULT '[]',
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 15. WYKONANE INSPEKCJE
CREATE TABLE IF NOT EXISTS inspections (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id   INTEGER REFERENCES inspection_templates(id) ON DELETE CASCADE,
    ship_id       INTEGER REFERENCES ships(id) ON DELETE CASCADE,
    inspector_id  INTEGER REFERENCES users(id),
    results       TEXT NOT NULL DEFAULT '[]',
    date          TEXT NOT NULL DEFAULT (datetime('now')),
    notes         TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- TRIGGERY updated_at
CREATE TRIGGER IF NOT EXISTS update_users_timestamp AFTER UPDATE ON users
BEGIN UPDATE users SET updated_at = datetime('now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS update_tasks_timestamp AFTER UPDATE ON tasks
BEGIN UPDATE tasks SET updated_at = datetime('now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS update_ships_timestamp AFTER UPDATE ON ships
BEGIN UPDATE ships SET updated_at = datetime('now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS update_inventory_timestamp AFTER UPDATE ON inventory_items
BEGIN UPDATE inventory_items SET updated_at = datetime('now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS update_certificates_timestamp AFTER UPDATE ON certificates
BEGIN UPDATE certificates SET updated_at = datetime('now') WHERE id = NEW.id; END;

-- 16. URZĄDZENIA (sprzęt na statkach)
CREATE TABLE IF NOT EXISTS equipment (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL DEFAULT 'other',
    ship_id         INTEGER REFERENCES ships(id) ON DELETE SET NULL,
    model           TEXT,
    serial_number   TEXT,
    location        TEXT,
    notes           TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 17. INSTRUKCJE OBSŁUGI
CREATE TABLE IF NOT EXISTS instructions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    title           TEXT NOT NULL,
    equipment_id    INTEGER REFERENCES equipment(id) ON DELETE SET NULL,
    description     TEXT,
    created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 18. KROKI INSTRUKCJI
CREATE TABLE IF NOT EXISTS instruction_steps (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    instruction_id  INTEGER NOT NULL REFERENCES instructions(id) ON DELETE CASCADE,
    step_number     INTEGER NOT NULL,
    text            TEXT NOT NULL,
    image_base64    TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TRIGGER IF NOT EXISTS update_equipment_timestamp AFTER UPDATE ON equipment
BEGIN UPDATE equipment SET updated_at = datetime('now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS update_instructions_timestamp AFTER UPDATE ON instructions
BEGIN UPDATE instructions SET updated_at = datetime('now') WHERE id = NEW.id; END;

-- 19. DOSTAWCY
CREATE TABLE IF NOT EXISTS suppliers (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    contact_person  TEXT,
    phone           TEXT,
    email           TEXT,
    address         TEXT,
    city            TEXT,
    categories      TEXT NOT NULL DEFAULT '[]',
    notes           TEXT,
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 20. POWIĄZANIE DOSTAWCA ↔ POZYCJA MAGAZYNOWA
CREATE TABLE IF NOT EXISTS supplier_inventory (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id     INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    inventory_id    INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    unit_price      REAL,
    currency        TEXT DEFAULT 'PLN',
    notes           TEXT,
    UNIQUE(supplier_id, inventory_id)
);

CREATE TRIGGER IF NOT EXISTS update_suppliers_timestamp AFTER UPDATE ON suppliers
BEGIN UPDATE suppliers SET updated_at = datetime('now') WHERE id = NEW.id; END;

CREATE INDEX IF NOT EXISTS idx_supplier_inventory_supplier ON supplier_inventory(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_inventory_item ON supplier_inventory(inventory_id);

-- 21. CACHE POZIOMU WODY (IMGW)
CREATE TABLE IF NOT EXISTS water_level_cache (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    data            TEXT NOT NULL,
    fetched_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 22. MOTOGODZINY (per silnik/generator)
CREATE TABLE IF NOT EXISTS engine_hours (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    equipment_id    INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
    current_hours   REAL NOT NULL DEFAULT 0,
    last_updated    TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(equipment_id)
);

-- 23. INTERWAŁY SERWISOWE
CREATE TABLE IF NOT EXISTS service_intervals (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    equipment_id    INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    interval_hours  REAL NOT NULL,
    last_service_hours REAL DEFAULT 0,
    last_service_date TEXT,
    notes           TEXT
);

-- 24. LOGI SERWISOWE
CREATE TABLE IF NOT EXISTS service_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    interval_id     INTEGER NOT NULL REFERENCES service_intervals(id) ON DELETE CASCADE,
    equipment_id    INTEGER NOT NULL REFERENCES equipment(id),
    hours_at_service REAL NOT NULL,
    performed_by    INTEGER REFERENCES users(id),
    notes           TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_engine_hours_equipment ON engine_hours(equipment_id);
CREATE INDEX IF NOT EXISTS idx_service_intervals_equipment ON service_intervals(equipment_id);
CREATE INDEX IF NOT EXISTS idx_service_logs_interval ON service_logs(interval_id);

-- 25. ZBIORNIKI
CREATE TABLE IF NOT EXISTS tanks (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ship_id         INTEGER NOT NULL REFERENCES ships(id) ON DELETE CASCADE,
    type            TEXT NOT NULL CHECK(type IN ('fuel', 'fresh_water', 'waste_water')),
    name            TEXT NOT NULL,
    capacity        REAL NOT NULL,
    current_level   REAL NOT NULL DEFAULT 0,
    alert_threshold REAL DEFAULT 20,
    unit            TEXT NOT NULL DEFAULT 'L',
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 26. LOGI ZBIORNIKÓW
CREATE TABLE IF NOT EXISTS tank_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    tank_id         INTEGER NOT NULL REFERENCES tanks(id) ON DELETE CASCADE,
    change_amount   REAL NOT NULL,
    level_after     REAL NOT NULL,
    log_type        TEXT NOT NULL CHECK(log_type IN ('refill', 'consumption', 'drain', 'manual')),
    route_info      TEXT,
    notes           TEXT,
    logged_by       INTEGER REFERENCES users(id),
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tanks_ship ON tanks(ship_id);
CREATE INDEX IF NOT EXISTS idx_tank_logs_tank ON tank_logs(tank_id);

CREATE TRIGGER IF NOT EXISTS update_tanks_timestamp AFTER UPDATE ON tanks
BEGIN UPDATE tanks SET updated_at = datetime('now') WHERE id = NEW.id; END;
