-- ============================================================
-- Tramwaje Wodne — Dane testowe (seed)
-- ============================================================

-- Konfiguracja
INSERT OR IGNORE INTO config (key, value) VALUES ('season_start_date', '2026-04-26');
INSERT OR IGNORE INTO config (key, value) VALUES ('company_name', 'Tramwaje Wodne Zalewu Wiślanego');
INSERT OR IGNORE INTO config (key, value) VALUES ('season_budget', '50000');
INSERT OR IGNORE INTO config (key, value) VALUES ('hourly_rate', '50');

-- Użytkownicy (hasła bcrypt, seed-only)
-- admin@tramwajewodne.pl / Kapitan123!
INSERT OR IGNORE INTO users (id, email, password, name, role) VALUES
(1, 'admin@tramwajewodne.pl', '$2b$12$LQ4DV8/7P55oxWBQkrVxxelLgjVbDaKKuTgIZR5Ns2VyC1cwwzECS', 'Kapitan Michał', 'admin');
-- pracownik@tramwajewodne.pl / Kapitan123!
INSERT OR IGNORE INTO users (id, email, password, name, role) VALUES
(2, 'pracownik@tramwajewodne.pl', '$2b$12$LQ4DV8/7P55oxWBQkrVxxelLgjVbDaKKuTgIZR5Ns2VyC1cwwzECS', 'Brat Michała', 'worker');

-- Statki
INSERT OR IGNORE INTO ships (id, name, short_name, specs) VALUES (1, 'm/s Zefir', 'Zefir', json('{"length_m":25,"width_m":6,"engine":"2 silniki","construction":"stalowa","wintering":"w wodzie, Tolkmicko","route":"S3 Tolkmicko – Krynica Morska","capacity_indoor":60,"capacity_outdoor":50}'));
INSERT OR IGNORE INTO ships (id, name, short_name, specs) VALUES (2, 'm/s Generał Kutrzeba', 'Kutrzeba', json('{"length_m":14.6,"width_m":4.6,"height_m":3.53,"draft_m":0.65,"engine":"Volvo-Penta D41P (200 HP)","generator":"KIPOR 6.5 kW (diesel)","fuel_capacity_l":3200,"construction":"aluminium (AlMg4,5)","wintering":"na brzegu (dźwig), Tolkmicko","route":"S2 Frombork – Piaski"}'));

-- Zadania testowe
INSERT OR IGNORE INTO tasks (id, title, description, ship_id, ship_scope, category, status, priority, estimated_hours, weather_dependent, weather_min_temp, weather_max_humidity, weather_no_rain, logistics_notes) VALUES
(1, 'Malowanie nadbudówki Zefira', 'Szlifowanie, gruntowanie i malowanie nadbudówki. Wymaga dobrej pogody.', 1, 'single', 'malowanie', 'todo', 'high', 40, 1, 10.0, 70.0, 1, NULL);

INSERT OR IGNORE INTO tasks (id, title, description, ship_id, ship_scope, category, status, priority, estimated_hours, weather_dependent, weather_max_wind, weather_no_rain) VALUES
(2, 'Spawanie pękniętej barierki na Kutrzebie', 'Pęknięta barierka na pokładzie wymaga zespawania.', 2, 'single', 'spawanie', 'todo', 'high', 8, 1, 5.0, 1);

INSERT OR IGNORE INTO tasks (id, title, description, ship_id, ship_scope, category, status, priority, estimated_hours, logistics_notes) VALUES
(3, 'Wymiana silnika na Kutrzebie', 'Wymiana głównego silnika. Wymaga zamówienia dźwigu.', 2, 'single', 'mechanika_silnikowa', 'todo', 'critical', 24, 'Wymaga zamówienia dźwigu');

INSERT OR IGNORE INTO tasks (id, title, description, ship_id, ship_scope, category, status, priority, estimated_hours, logistics_notes) VALUES
(4, 'Wizyta na stoczni — podpora steru Zefira', 'Skrzypiąca podpora steru wymaga wizyty na stoczni.', 1, 'single', 'mechanika_silnikowa', 'todo', 'normal', 16, 'Wymaga przetransportowania/dopłynięcia do stoczni');

INSERT OR IGNORE INTO tasks (id, title, description, ship_id, ship_scope, category, status, priority, estimated_hours, weather_dependent) VALUES
(5, 'Montaż 20 akumulatorów na Zefirze', 'Montaż nowych akumulatorów. Praca wewnętrzna.', 1, 'single', 'elektryka', 'todo', 'normal', 12, 0);

INSERT OR IGNORE INTO tasks (id, title, description, ship_id, ship_scope, category, status, priority, estimated_hours, weather_dependent, weather_min_temp, weather_no_rain) VALUES
(6, 'Wycięcie i aplikacja kleju dookoła okien Zefira', 'Usunięcie starego kleju i aplikacja nowego.', 1, 'single', 'stolarka', 'todo', 'normal', 20, 1, 10.0, 1);

INSERT OR IGNORE INTO tasks (id, title, description, ship_id, ship_scope, category, status, priority, estimated_hours) VALUES
(7, 'Kontrola rurociągów po zimie', 'Inspekcja rurociągów na obu statkach po sezonie zimowym.', NULL, 'both', 'inspekcja', 'todo', 'high', 8);

INSERT OR IGNORE INTO tasks (id, title, description, ship_id, ship_scope, category, status, priority, estimated_hours) VALUES
(8, 'Wymiana olejów', 'Wymiana olejów silnikowych i przekładniowych.', NULL, 'both', 'mechanika_silnikowa', 'todo', 'normal', 6);

INSERT OR IGNORE INTO tasks (id, title, description, ship_id, ship_scope, category, status, priority, estimated_hours) VALUES
(9, 'Rejsy próbne', 'Rejsy próbne po zakończeniu wszystkich prac remontowych.', NULL, 'both', 'rejs_probny', 'todo', 'high', 8);

-- Rejs próbny zależy od WSZYSTKICH innych zadań
INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_id) VALUES (9, 1);
INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_id) VALUES (9, 2);
INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_id) VALUES (9, 3);
INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_id) VALUES (9, 4);
INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_id) VALUES (9, 5);
INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_id) VALUES (9, 6);
INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_id) VALUES (9, 7);
INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_id) VALUES (9, 8);


-- Przykładowe narzędzia w magazynie
INSERT OR IGNORE INTO inventory_items (id, name, category, unit, quantity, location) VALUES
(1, 'Spawarka MIG/MAG', 'tool', 'szt', 1, 'Magazyn Tolkmicko');
INSERT OR IGNORE INTO inventory_items (id, name, category, unit, quantity, location) VALUES
(2, 'Szlifierka kątowa 125mm', 'tool', 'szt', 2, 'Magazyn Tolkmicko');
INSERT OR IGNORE INTO inventory_items (id, name, category, unit, quantity, location) VALUES
(3, 'Farba nawierzchniowa (biała)', 'material', 'L', 10, 'Magazyn Tolkmicko');
INSERT OR IGNORE INTO inventory_items (id, name, category, unit, quantity, min_quantity, location) VALUES
(4, 'Farba podkładowa antykorozyjna', 'material', 'L', 5, 10, 'Magazyn Tolkmicko');
INSERT OR IGNORE INTO inventory_items (id, name, category, unit, quantity, location) VALUES
(5, 'Olej silnikowy 15W-40', 'material', 'L', 20, 'Magazyn Tolkmicko');

-- Certyfikaty
INSERT OR IGNORE INTO certificates (id, ship_id, name, issuer, number, issue_date, expiry_date, notes) VALUES
(1, 1, 'Świadectwo klasy PRS', 'Polski Rejestr Statków', 'KL-2024/ZEF-001', '2024-06-15', '2026-06-15', 'Klasa PRS — pełna inspekcja kadłuba');
INSERT OR IGNORE INTO certificates (id, ship_id, name, issuer, number, issue_date, expiry_date, notes) VALUES
(2, 1, 'Świadectwo żeglugi śródlądowej', 'Urząd Żeglugi Śródlądowej', 'UZS-2024/1234', '2024-09-01', '2026-04-01', 'Wygasa przed sezonem!');
INSERT OR IGNORE INTO certificates (id, ship_id, name, issuer, number, issue_date, expiry_date, notes) VALUES
(3, 2, 'Świadectwo klasy PRS', 'Polski Rejestr Statków', 'KL-2024/KUT-002', '2025-01-10', '2027-01-10', NULL);
INSERT OR IGNORE INTO certificates (id, ship_id, name, issuer, number, issue_date, expiry_date, notes) VALUES
(4, 2, 'Certyfikat bezpieczeństwa pożarowego', 'Straż Pożarna Elbląg', 'SP/2025/042', '2025-02-20', '2026-02-20', 'Następna inspekcja gaśnic wymagana');

-- Szablony inspekcji
INSERT OR IGNORE INTO inspection_templates (id, name, ship_id, items) VALUES
(1, 'Inspekcja przeciwpożarowa', NULL, '[{"label":"Gaśnice — termin ważności","required":true},{"label":"Koce gaśnicze — stan","required":true},{"label":"Czujniki dymu — test","required":true},{"label":"Drogi ewakuacyjne — drożność","required":true},{"label":"Oświetlenie awaryjne — test","required":true},{"label":"Plan ewakuacji — aktualność","required":false}]');
INSERT OR IGNORE INTO inspection_templates (id, name, ship_id, items) VALUES
(2, 'Inspekcja kadłuba i poszycia', NULL, '[{"label":"Poszycie podwodne — korozja","required":true},{"label":"Anody ochronne — stan","required":true},{"label":"Spawy — wizualna kontrola","required":true},{"label":"Grodzie wodoszczelne — szczelność","required":true},{"label":"Podkład antykorozyjny — stan","required":true},{"label":"Farba nawodna — stan","required":false}]');

-- Urządzenia
INSERT OR IGNORE INTO equipment (id, name, type, ship_id, model, serial_number, location, notes) VALUES
(1, 'Silnik główny Volvo Penta', 'engine', 1, 'D41P', 'VP-D41P-2018-001', 'Maszynownia', 'Silnik diesla 200KM, wymiana oleju co 250h');
INSERT OR IGNORE INTO equipment (id, name, type, ship_id, model, serial_number, location, notes) VALUES
(2, 'Pompa pożarowa', 'pump', 1, 'Desmi S80-65', 'DSM-2019-042', 'Maszynownia — prawa burta', 'Pompa odśrodkowa, wydajność 30m³/h');
INSERT OR IGNORE INTO equipment (id, name, type, ship_id, model, serial_number, location, notes) VALUES
(3, 'Pompa zęzowa', 'pump', 1, 'Jabsco 36600', 'JBS-2020-117', 'Maszynownia — dno', 'Automatyczna, czujnik pływakowy');
INSERT OR IGNORE INTO equipment (id, name, type, ship_id, model, serial_number, location, notes) VALUES
(4, 'Generator prądotwórczy', 'generator', 2, 'Fischer Panda 8000i', 'FP-8K-2021-003', 'Maszynownia', '8kW, 230V');
INSERT OR IGNORE INTO equipment (id, name, type, ship_id, model, serial_number, location, notes) VALUES
(5, 'Układ sterowy hydrauliczny', 'steering', 2, 'Vetus HTP2010', 'VTS-HTP-2019-088', 'Rufowa skrzynka sterowa', 'Sprawdzać poziom oleju hydraulicznego');

-- Instrukcje
INSERT OR IGNORE INTO instructions (id, title, equipment_id, description, created_by) VALUES
(1, 'Wymiana oleju w silniku D41P', 1, 'Procedura wymiany oleju silnikowego i filtra oleju w Volvo Penta D41P. Wykonywać co 250 motogodzin.', 1);

INSERT OR IGNORE INTO instruction_steps (id, instruction_id, step_number, text) VALUES
(1, 1, 1, '⚠️ Upewnij się, że silnik jest WYŁĄCZONY i ostygł (min. 30 minut). Odłącz akumulator.');
INSERT OR IGNORE INTO instruction_steps (id, instruction_id, step_number, text) VALUES
(2, 1, 2, 'Podstaw pojemnik na zużyty olej (min. 12L) pod korek spustowy miski olejowej. Odkręć korek kluczem 19mm.');
INSERT OR IGNORE INTO instruction_steps (id, instruction_id, step_number, text) VALUES
(3, 1, 3, 'Gdy olej się spuści, odkręć stary filtr oleju (klucz taśmowy). Nasmaruj uszczelkę nowego filtra czystym olejem i zamontuj — dokręć ręcznie + 3/4 obrotu.');
INSERT OR IGNORE INTO instruction_steps (id, instruction_id, step_number, text) VALUES
(4, 1, 4, 'Zakręć korek spustowy (nowa uszczelka miedziana!). Zalej nowy olej 15W-40 przez wlew — 9.7L. Sprawdź poziom na bagnetce.');
INSERT OR IGNORE INTO instruction_steps (id, instruction_id, step_number, text) VALUES
(5, 1, 5, 'Podłącz akumulator. Uruchom silnik na 2 minuty na biegu jałowym. Zgaś, odczekaj 5 min, sprawdź poziom ponownie. Dolej jeśli potrzeba. Sprawdź czy nie ma wycieków.');

-- Dostawcy
INSERT OR IGNORE INTO suppliers (id, name, contact_person, phone, email, address, city, categories, notes) VALUES
(1, 'Sklep Żeglarski Tolkmicko', 'Jan Kowalski', '555-111-222', 'sklep@zeglarski.pl', 'ul. Portowa 12', 'Tolkmicko', '["material","part"]', 'Lokalny sklep, szybka dostawa'),
(2, 'Hurtownia Farb LAKMA', NULL, '555-333-444', 'zamowienia@lakma.pl', 'ul. Przemysłowa 8', 'Elbląg', '["material"]', 'Farby morskie i antykorozyjne'),
(3, 'SPAWMET - materiały spawalnicze', 'Piotr Nowak', '555-555-666', 'biuro@spawmet.pl', 'ul. Stalowa 3', 'Elbląg', '["tool","material"]', 'Elektrody, druty, gazy, serwis spawarek'),
(4, 'Auto-Parts Malbork', NULL, '555-777-888', 'info@autoparts.pl', 'ul. Targowa 15', 'Malbork', '["part"]', 'Części silnikowe, filtry, oleje');

-- Powiązania dostawca ↔ magazyn
INSERT OR IGNORE INTO supplier_inventory (supplier_id, inventory_id, unit_price, notes) VALUES
(2, 3, 45.00, 'Farba nawierzchniowa biała 1L'),
(2, 4, 65.00, 'Farba podkładowa antykorozyjna 1L'),
(1, 5, 32.00, 'Olej silnikowy 15W-40 1L'),
(3, 1, NULL, 'Serwis / części zamienne spawarki');

