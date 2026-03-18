# 🚢 Mapa Funkcjonalności — Tramwaje Wodne

> **Źródło prawdy** o planowanych funkcjonalnościach MVP.
> Skopiowane z oryginalnej koncepcji, z aktualizacjami statusu.

---

## Etap 1 — MVP (9 modułów) ✅

### 1.1 Dashboard — Admin
Countdown do sezonu, postęp prac (% per statek), zadania na dziś/tydzień, pogoda z oknami roboczymi, alerty (opóźnienia, deadline'y, zgłoszenia pracowników).

### 1.2 Panel Pracownika
| Funkcja | Opis |
|---------|------|
| Moje zadania na dziś | Lista z priorytetami i opisem |
| Raportowanie wykonania | "Zrobione" + godziny + zdjęcie |
| Zgłoszenie problemu | Zdjęcie + opis → do Admina do zatwierdzenia |
| Skanowanie QR | Skan kodu na urządzeniu → instrukcja + historia |
| Timer pracy | Start/stop lub ręczne wpisanie |
| AI czat (ograniczony) | Pytania techniczne, instrukcje obsługi |

### 1.3 Zarządzanie zadaniami (CRUD)
Szybkie dodawanie (2 kliknięcia), filtrowanie (statek/kategoria/status/priorytet/osoba), zmiana statusu, logowanie czasu (szacowany vs. faktyczny), zdjęcia/notatki, zależności (pogodowe, sekwencyjne, logistyczne).

### 1.4 AI Asystent (Gemini)
| Funkcja | Opis |
|---------|------|
| Czat kontekstowy | Zna statki, zadania, pogodę, zespół, magazyn, instrukcje |
| Parsowanie zadań z NLP | "Trzeba zespawać barierkę" → tworzy zadanie |
| Planowanie dnia | "Co robić jutro?" → plan per osoba + pogoda |
| Harmonogramowanie | Tygodniowy plan z zależnościami i ścieżką krytyczną |
| Estymacja czasu | Na podstawie wymiarów statku i historii |
| Skanowanie dokumentów | Zdjęcie certyfikatu/faktury → ekstrakcja danych |
| Skanowanie tabliczek | Zdjęcie → model, nr seryjny → baza wiedzy |
| Generowanie list zakupów | Agregacja z zadań, odejmowanie stanu magazynowego |

### 1.5 Integracja pogodowa
Prognoza 7-dniowa dla Tolkmicka, okna malowania (temp > 10°C, wilg. < 70%, brak deszczu), okna spawania (wiatr < 5 m/s, brak deszczu). Dane dostępne dla AI.

### 1.6 Magazyn narzędzi i materiałów
| Funkcja | Opis |
|---------|------|
| Inwentarz narzędzi | Co mamy: spawarka, szlifierka, klucze itd. |
| Stan materiałów | Farba 5L, olej 10L, filtry X szt. |
| Lista zakupów per zadanie | AI generuje, odejmuje stan magazynowy |
| **Konsolidacja zakupów** | AI agreguje potrzeby z wielu zadań, grupuje po sklepach, planuje wyjazd zakupowy z optymalną trasą i wlicza czas dojazdu w harmonogram |

### 1.7 Auth i zarządzanie zespołem
Login (email + hasło), JWT, role (Admin/Pracownik), dodawanie/usuwanie członków zespołu.

### 1.8 Dane statków (wbudowane)
Karty techniczne Zefira i Kutrzeby. Wzbogacane przez skanowanie dokumentów i tabliczek.

### 1.9 Notatki głosowe
Klik mikrofonu → mówisz → AI transkrybuje → tworzy zadanie lub notatkę.

---

## Etap 2 (10 modułów)

### 2.1 Widok Gantt / Timeline
Oś czasu, strzałki zależności, ścieżka krytyczna, filtrowanie per statek/osoba.

### 2.2 Certyfikaty i inspekcje
Rejestr certyfikatów z datami ważności, alerty ("za 30 dni wygasa X"), checklisty inspekcyjne, skanowanie świadectw → AI wyciąga dane i terminy.

### 2.3 QR kody na sprzęcie + Baza Wiedzy
| Funkcja | Opis |
|---------|------|
| QR na urządzeniu | Naklejka na pompie/generatorze/zaworze |
| Skan → karta urządzenia | Model, nr seryjny, historia napraw, ostatni serwis |
| **Instrukcje obsługi** | Krok po kroku ze zdjęciami: "Jak wymienić pompę", "Jak wymienić rozrusznik" |
| Tworzenie instrukcji | Admin (Michał) opisuje/nagrywa → AI formatuje |
| Powiązanie QR ↔ instrukcja | Skan QR na pompie → od razu instrukcja wymiany |
| Delegowanie | Pracownik skanuje QR → widzi instrukcję → robi sam |
| Rosnąca baza | Im więcej instrukcji, tym więcej można delegować |
| AI odpowiada z bazy | Pracownik pyta: "Jak wymienić filtr w D41P?" → AI odpowiada na podstawie instrukcji |  (Przypis użytkownika. System musi posiadać system generacji kodów QR)

### 2.4 Baza dostawców + optymalizacja zakupów
Lista dostawców z kategoriami produktów, powiązanie z zadaniami, AI grupuje zakupy po lokalizacjach/sklepach.

### 2.5 Budżet i koszty
Koszty per zadanie (plan vs. fakt), per statek, budżet sezonu, historia kosztów wykonanych zadań + strona podsumowania z filtrowaniem historii, po datach, kategorii, statku

### 2.6 Google Calendar Sync
Synchronizacja deadline'ów, dźwigów, stoczni, rejsów, startu sezonu.

### 2.7 Monitoring poziomu wody
Dane z IMGW, alerty o niskim poziomie (Kutrzeba 0.65m zanurzenia), uwzględnianie przy rejsach próbnych.

### 2.8 Dokumentacja fotograficzna
Galeria per zadanie z timestampem, porównania przed/po, historia wizualna.

### 2.9 Licznik motogodzin + interwały serwisowe
| Funkcja | Opis |
|---------|------|
| Motogodziny per silnik | Śledzenie dla każdego silnika i generatora |
| Interwały serwisowe | Wymiana oleju co X h, przegląd pompy co Y h |
| Alerty | "Za 20 motogodzin wymiana oleju D41P" |
| AI planowanie | Serwis dodawany do harmonogramu z wyprzedzeniem |

### 2.10 Zbiorniki i zużycie
| Zbiornik | Funkcje |
|----------|---------|
| ⛽ Paliwo | Logowanie tankowań, zużycie per rejs, średnie per trasa, alert niski poziom |
| 💧 Woda pitna | Poziom, alert niski stan, planowanie uzupełnienia |
| 🚽 Nieczystości | Poziom, alert "czas opróżnić" |
| AI kontekst | "Przed jutrzejszym rejsem S3 uzupełnij wodę na Zefirze" |

---

## Etap 3 — Aplikacja Mobilna (7 modułów)

> **Cel:** Natywna apka Android (React Native/Expo) działająca po WiFi,
> dająca pracownikom pełną funkcjonalność w terenie, a adminowi szybki podgląd.
> Pierwszy etap: tylko WiFi. Przyszłość: pośrednik w chmurze (Supabase/Firebase).

### 3.1 Panel Pracownika (telefon)
| Funkcja | Opis |
|---------|------|
| Moje zadania na dziś/jutro/później | Pogrupowane po dniach z algorytmu schedulingu |
| Zmiana statusu zadania | „Zrobione" + godziny + zdjęcie |
| Logowanie czasu pracy | Timer start/stop lub ręczne wpisanie |
| Zgłoszenie problemu | Zdjęcie + opis → powiadomienie admina |
| Podgląd magazynu | Stan narzędzi i materiałów + edycja ilości |
| AI czat | Pytania techniczne, instrukcje za pomocą Gemini API (przez LTE) |

### 3.2 Panel Admina — Light (telefon)
| Funkcja | Opis |
|---------|------|
| Podsumowanie dnia | Ile zadań, kto pracuje, co zablokowane |
| Powiadomienia | Zgłoszenia pracowników, zdjęcia do sprawdzenia |
| Quick approve/reject | Zatwierdzanie bez wchodzenia w pełny panel |
| AI czat | „Jaki jest stan projektu?" — kontekstowe odpowiedzi |

> ⚠️ Gantt, tworzenie zadań, konfiguracja → **tylko na komputerze** (desktop-first).

### 3.3 Synchronizacja WiFi
| Element | Mechanizm |
|---------|-----------|
| Baza danych | SQLite na telefonie ↔ SQLite na serwerze (sync po WiFi) |
| Sync queue | Zmiany offline → kolejka → push do serwera po połączeniu |
| Konflikty | Strategia „server wins" + log konfliktów do przeglądu |
| Zdjęcia | Kompresja na telefonie → upload po WiFi |
| Auto-detect | Apka wykrywa obecność serwera w sieci i synchronizuje automatycznie |

### 3.4 Offline-first architektura
| Komponent | Opis |
|-----------|------|
| Lokalna baza | SQLite (Room na Androidzie) — pełna kopia zadań, magazynu, instrukcji |
| Service Workers | Cache instrukcji, bazy wiedzy, checklist |
| Queue mutations | Każda zmiana (status, czas, zdjęcie) trafia do kolejki sync |
| Wskaźnik sync | UI pokazuje „ostatnia synchronizacja: 2h temu" |

### 3.5 Gemini AI na telefonie
Klucze API Gemini wbudowane w apkę (z rotacją kluczy — już zaimplementowane na serwerze).
Telefon z LTE sam odpytuje Gemini — nie potrzebuje serwera domowego do AI.
Kontekst: lokalna baza zadań, magazynu, instrukcji.

### 3.6 Powiadomienia lokalne
Przypomnienia o zadaniach na dziś (z algorytmu schedulingu), deadline'y, alerty serwisowe.
Push notifications przez Firebase Cloud Messaging (gdy w zasięgu internetu).

### 3.7 Technologia i deployment
| Decyzja | Wybór |
|---------|-------|
| Framework | React Native + Expo (reużycie logiki z obecnego frontu) |
| Język | TypeScript (ten sam co web) |
| Nawigacja | React Navigation (stack + bottom tabs) |
| Baza lokalna | SQLite (expo-sqlite lub WatermelonDB) |
| Build | EAS Build (Expo Application Services) |
| Dystrybucja | APK do ręcznej instalacji (bez Google Play na start) |

---

## Etap 4 (8 modułów)

### 4.1 Szablony sezonowe
Kopiowanie planu z zeszłego sezonu, AI porównanie ("w zeszłym roku malowanie zajęło 45h"), biblioteka szablonów.

### 4.2 Grafik załogi (sezon)
Grafik dzienny (kto na którym statku), urlopy/zastępstwa, AI optymalizacja przypisań.

### 4.3 Tracking godzin pracy
Timer per osoba, podsumowanie miesięczne, historia per pracownik.

### 4.4 Checklisty przed rejsem
| Funkcja | Opis |
|---------|------|
| Checklista per statek | Sprzęt ratunkowy ✓, światła ✓, radio ✓, paliwo ✓ |
| Wypełnianie na telefonie | Odhaczanie przed każdym rejsem |
| Zapis | Kto, kiedy wypełnił (na potrzeby kontroli) | Możliwość edycji i tworzenia własnych checklist

### 4.5 AI uczące się z historii
| Funkcja | Opis |
|---------|------|
| Korekta estymacji | "Niedoszacowaliście o 20%, korygujemy" |
| Podpowiedzi cenowe | "Ostatnio kupowaliście filtry za 120 zł w sklepie X" |
| Trendy | "Co roku malowanie kadłuba zajmuje dłużej — rozważ piaskowanie" |

### 4.6 Powiadomienia push
Deadline'y, okna pogodowe, zgłoszenia pracowników.

### 4.7 Tryb offline (PWA → natywna apka)
Migracja z PWA na natywną apkę, pełny offline z sync (zbudowane w Etapie 3).

### 4.8 Historia i raporty
Archiwum sezonów, raporty (godziny, koszty, zadania), eksport PDF/CSV.

---

## Decyzje architektoniczne

> **Scheduling Engine zamiast onboard LLM** — zarządzanie zależnościami (DAG/topological sort),
> harmonogramowanie (Critical Path Method) i planowanie dnia i tygodnia to problemy algorytmiczne,
> nie językowe. Gemini API zostaje do konwersacji, a deterministyczny kod robi planowanie.
> (Decyzja: 2026-03-09, powód: 6GB VRAM RTX 3060 = zbyt mały na dobry model po polsku)
