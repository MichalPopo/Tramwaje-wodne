# Specyfikacja Projektu — Asystent Zarządzania Flotą Statków Pasażerskich

## Kontekst biznesowy

Firma "Tramwaje Wodne Zalewu Wiślanego" — rodzinna firma operująca dwa statki pasażerskie na trasach:
- Linia S2: Frombork – Piaski (obsługiwana przez m/s Generał Kutrzeba)
- Linia S3: Tolkmicko – Krynica Morska (obsługiwana przez m/s Zefir)

Sezon nawigacyjny trwa od końca kwietnia do końca września. Poza sezonem (październik–kwiecień) prowadzone są prace remontowe, konserwacyjne i przygotowawcze do kolejnego sezonu.

Oba statki zimują w Tolkmicku. Zefir zimuje w wodzie (za ciężki do wyciągnięcia). Kutrzeba jest wyciągany dźwigiem na brzeg.

## Zespół

- Michał (kapitan / właściciel) — zarządza wszystkim
- Brat Michała — współpracownik
- Dwóch pracowników

Łącznie 4 osoby. Aplikacja obsługuje dynamiczną listę członków zespołu. Dwa interfejsy: Admin (Michał) i Pracownik (ograniczony dostęp).

## Dane techniczne statków (wbudowane w aplikację)

### m/s Zefir
- Długość: 25 m, Szerokość: 6 m
- Napęd: 2 silniki
- Salon klimatyzowany: 60 miejsc przy stołach, Pokład słoneczny: 50+ miejsc
- Konstrukcja: stalowa
- Zimowanie: w wodzie, Tolkmicko
- Trasa: S3 Tolkmicko – Krynica Morska

### m/s Generał Kutrzeba
- Długość: 14.6 m, Szerokość: 4.6 m, Wysokość: 3.53 m, Zanurzenie: 0.65 m
- Napęd: Volvo-Penta D41P (200 HP)
- Generator: KIPOR 6.5 kW (diesel)
- Pojemność paliwa: 3200 l
- Konstrukcja: aluminium (AlMg4,5)
- Zimowanie: na brzegu (wyciągany dźwigiem), Tolkmicko
- Trasa: S2 Frombork – Piaski

## Stos technologiczny

- **Framework**: React + TypeScript (Vite)
- **Backend**: Node.js + Express.js
- **Baza danych**: SQLite (lekka, lokalna)
- **AI**: Gemini API przez Google AI Studio (klucz API, kredyty Google AI Ultra)
- **PWA**: Instalowalna na telefonie, offline w Etapie 3
- **Język interfejsu**: Polski
- **Auth**: JWT (email + hasło), role: admin / pracownik
- **Styl**: Ciemny motyw morski, mobile-first, duże elementy UI (obsługa w rękawicach)

## Kluczowe funkcjonalności

### Etap 1 — MVP
1. **Dashboard** — countdown do sezonu, postęp per statek, zadania dziś/tydzień, pogoda, alerty
2. **Panel Pracownika** — zadania na dziś, raportowanie wykonania, zgłaszanie problemów, timer, AI pytania techniczne
3. **Zarządzanie zadaniami** — CRUD, szybkie dodawanie (2 kliknięcia), filtry, zależności (pogodowe/sekwencyjne/logistyczne), logowanie czasu, zdjęcia
4. **AI Asystent (Gemini)** — czat kontekstowy, parsowanie zadań z NLP, planowanie dnia, harmonogramowanie, estymacja czasu, skanowanie dokumentów/tabliczek
5. **Pogoda** — 7-dniowa prognoza Tolkmicko, okna malowania/spawania, dane dla AI
6. **Magazyn** — inwentarz narzędzi/materiałów, lista zakupów per zadanie, konsolidacja zakupów (AI agreguje z wielu zadań, grupuje po sklepach, planuje wyjazd)
7. **Auth + zespół** — JWT, role admin/pracownik, zarządzanie członkami
8. **Dane statków** — karty techniczne wzbogacane przez skanowanie
9. **Notatki głosowe** — dyktowanie → AI transkrypcja → tworzenie zadań

### Etap 2
1. **Widok Gantt** — oś czasu, zależności, ścieżka krytyczna, filtrowanie
2. **Certyfikaty i inspekcje** — rejestr z datami ważności, alerty wygasania, checklisty inspekcyjne, skanowanie dokumentów → AI ekstrakcja
3. **QR kody + Baza wiedzy** — QR na urządzeniach → karta + instrukcja obsługi krok po kroku, delegowanie wiedzy pracownikom
4. **Dostawcy + optymalizacja zakupów** — baza z kategoriami, AI optymalizuje trasy zakupowe
5. **Budżet** — koszty per zadanie/statek, plan vs. rzeczywistość
6. **Google Calendar sync** — deadline'y, dźwigi, stocznia, rejsy
7. **Monitoring poziomu wody** — IMGW, alerty niskiego poziomu (Kutrzeba 0.65m)
8. **Dokumentacja fotograficzna** — galeria per zadanie, przed/po
9. **Motogodziny + interwały serwisowe** — alerty "za X h wymiana oleju"
10. **Zbiorniki** — paliwo, woda pitna, nieczystości — poziomy z alertami

### Etap 3 — Aplikacja Mobilna
1. **Panel Pracownika (telefon)** — zadania dziś/jutro/później, zmiana statusu, logowanie czasu, zdjęcia, magazyn, AI czat (Gemini przez LTE)
2. **Panel Admina — Light (telefon)** — podsumowanie dnia, powiadomienia, quick approve/reject, AI czat
3. **Synchronizacja WiFi** — SQLite telefon ↔ serwer, sync queue, strategia „server wins", auto-detect serwera w sieci
4. **Offline-first architektura** — lokalna baza SQLite, cache instrukcji/bazy wiedzy, queue mutations, wskaźnik sync
5. **Gemini AI na telefonie** — klucze API z rotacją, telefon z LTE odpytuje Gemini bezpośrednio
6. **Powiadomienia lokalne** — przypomnienia z algorytmu schedulingu, deadline'y, alerty serwisowe
7. **Technologia** — React Native + Expo, TypeScript, expo-sqlite, APK (bez Google Play na start)

### Etap 4
1. **Szablony sezonowe** — kopiuj plan z zeszłego roku, AI porównanie
2. **Grafik załogi** — kto na którym statku, urlopy/zastępstwa
3. **Tracking godzin** — timer per osoba, podsumowanie miesięczne
4. **Checklisty przed rejsem** — cyfrowe, z zapisem kto/kiedy
5. **AI uczące się z historii** — korekta estymacji, podpowiedzi cenowe, trendy
6. **Powiadomienia push** — deadline'y, pogoda, zgłoszenia
7. **Tryb offline (natywna apka)** — migracja z PWA, pełny offline z sync (zbudowane w Etapie 3)
8. **Historia i raporty** — archiwum sezonów, eksport PDF/CSV

## Zasady UX

1. **Szybkość dodawania zadań** — maks. 2 kliknięcia
2. **AI-first workflow** — główny sposob interakcji to czat z AI
3. **Widoczność pogody** — zawsze widoczna prognoza
4. **Mobile-first** — duże przyciski, czytelne fonty, obsługa jedną ręką
5. **Dwa interfejsy** — Admin (pełny) vs. Pracownik (uproszczony)

## Przykładowe dane testowe

1. Malowanie nadbudówki Zefira — pogodozależne, ~40 roboczogodzin
2. Spawanie pękniętej barierki na Kutrzebie — pogodozależne, priorytet wysoki
3. Wymiana silnika na Kutrzebie — wymaga dźwigu, priorytet krytyczny
4. Wizyta na stoczni (podpora steru Zefir) — wymaga transportu
5. Montaż 20 akumulatorów na Zefirze — praca wewnętrzna
6. Aplikacja kleju dookoła okien na Zefirze — pogodozależne
7. Kontrola rurociągów po zimie — oba statki
8. Wymiana olejów — oba statki
9. Rejsy próbne — po zakończeniu wszystkich prac
