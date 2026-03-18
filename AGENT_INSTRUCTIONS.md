# 🤖 Instrukcja dla agenta AI — Tramwaje Wodne

> **Ten plik jest obowiązkowy do przeczytania NA POCZĄTKU każdej sesji.**

---

## Święte pliki projektu

W tym projekcie istnieją **3 pliki źródłowe**, które stanowią fundament nawigacji i ciągłości pracy między sesjami. Agent MUSI je przeczytać i respektować.

### 1. `CACHE.md` — Stan projektu (przeczytaj PIERWSZY)

**Co zawiera:** Kompletny obraz stanu projektu — co jest zrobione, jakie pliki istnieją, jakie API są dostępne, jakie bugi naprawiono, jakie komendy uruchamiać.

**Zasady:**
- ✅ **Przeczytaj na początku sesji** — zanim dotkniesz kodu
- ✅ **Aktualizuj PO KAŻDEJ zmianie** — nowy plik? nowy endpoint? naprawiony bug? → wpisz do CACHE
- ✅ **Zachowaj strukturę** — drzewko katalogów, tabela endpointów, tabela feature map muszą być aktualne
- ❌ **NIGDY nie zostawiaj stale informacji** — jeśli dodałeś service X, to musi być w drzewku i w tabeli
- ❌ **Nie oznaczaj czegoś jako "zrobione" bez weryfikacji** (testy passing)

### 2. `feature_map.md` — Źródło prawdy o funkcjonalnościach

**Co zawiera:** Pełne opisy 27 modułów w 3 etapach — tabele, szczegóły, wymagania. To jest "co chcemy zbudować".

**Zasady:**
- ✅ **Traktuj jako specyfikację** — nie implementuj nic, czego tu nie ma (chyba że user explicite doda)
- ✅ **Zachowaj pełne opisy** — NIGDY nie skracaj tabel i opisów do haseł. Każdy moduł ma swoje szczegóły i one MUSZĄ być zachowane
- ✅ **Aktualizuj decyzje architektoniczne** na dole pliku
- ❌ **Nie zmieniaj numeracji etapów** bez zgody usera
- ❌ **Nie kasuj detali** — jeśli moduł 2.3 ma tabelę QR z 8 wierszami, to te 8 wierszy muszą zostać

### 3. `TASKS.md` — Checklist tasków

**Co zawiera:** Rozbite sub-taski na checklistę `[ ]`/`[x]`, pogrupowane per etap i moduł.

**Zasady:**
- ✅ **Oznaczaj `[x]` dopiero po ukończeniu** (kod + testy)
- ✅ **Dodawaj sub-taski** gdy planujesz nowy moduł
- ✅ **Utrzymuj spójność** z feature_map.md — te same opisy, ta sama numeracja

---

## Workflow sesji

```
1. PRZECZYTAJ CACHE.md → wiesz co jest, co nie
2. PRZECZYTAJ feature_map.md → wiesz co planujemy
3. PRZECZYTAJ TASKS.md → wiesz co zrobić next
4. PRACUJ nad kolejnym taskiem
5. PO KAŻDEJ ZMIANIE aktualizuj:
   - CACHE.md (nowe pliki, endpointy, bugi)
   - TASKS.md (oznacz [x] to co zrobione)
6. NA KONIEC SESJI upewnij się, że CACHE.md jest aktualny
7. PO UKOŃCZENIU ZADAŃ: Wypchnij wszystkie zmiany na GitHuba (komendy `git add .`, `git commit -m "Opis"` oraz `git push origin main`)
```

---

## Typowe błędy do unikania

1. **Nie aktualizowanie CACHE po zmianach** — następna sesja nie będzie wiedzieć o nowych plikach
2. **Skracanie feature_map do haseł** — tracisz szczegóły implementacji, które potem "unikają" przy audycie
3. **Implementowanie bez sprawdzenia feature_map** — możesz pominąć wymagane sub-funkcje
4. **Hardkodowanie wartości** zamiast konfiguracji (np. data sezonu była hardcoded)
5. **Zapominanie o testach** — nie oznaczaj tasku jako done bez `npx vitest run`
6. **Brak synchronizacji z chmurą** — pamiętaj o rutynowym `git push` po zrealizowaniu checkpointu, aby User nie stracił kodu w razie awarii.

---

## Kontekst projektu

- **Język UI:** polski
- **Stack:** React+Vite (frontend), Express+TypeScript (backend), SQLite (sql.js)
- **AI:** Gemini API (konwersacyjne), brak onboard LLM
- **Lokalizacja:** Tolkmicko, statki: m/s Zefir, m/s Gen. Kutrzeba
- **Sezon:** ~koniec kwietnia → jesień, prace przygotowawcze zimą/wiosną
