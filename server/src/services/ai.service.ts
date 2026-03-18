import { GoogleGenerativeAI, type Content } from '@google/generative-ai';
import { queryAll, queryOne, execute } from '../db/database.js';
import { getForecast } from './weather.service.js';
import { getInventoryContext } from './inventory.service.js';
import { getEquipmentContext } from './equipment.service.js';
import { getSupplierContext } from './supplier.service.js';
import { getWaterLevelForAI } from './water-level.service.js';
import { getEngineHoursForAI } from './engine-hours.service.js';
import { getTanksForAI } from './tanks.service.js';
import { getAvailableGeminiClient, getAvailableRawKey, reportKeyError } from './key-pool.service.js';

// --- Types ---

interface ConversationRow {
    id: number;
    user_id: number;
    title: string | null;
    created_at: string;
}

interface MessageRow {
    id: number;
    conversation_id: number;
    role: 'user' | 'assistant';
    content: string;
    metadata: string | null;
    created_at: string;
}

export interface AiChatResult {
    conversation_id: number;
    message: {
        id: number;
        role: 'assistant';
        content: string;
        created_at: string;
    };
}

// --- Gemini client (key pool with rotation) ---

const MAX_RETRIES = 3;

async function extractStatusCode(error: unknown): Promise<number> {
    if (error && typeof error === 'object') {
        const e = error as { status?: number; statusCode?: number; message?: string };
        if (e.status) return e.status;
        if (e.statusCode) return e.statusCode;
        if (e.message?.includes('429')) return 429;
        if (e.message?.includes('403')) return 403;
        if (e.message?.includes('quota')) return 403;
        if (e.message?.includes('rate')) return 429;
    }
    return 0;
}

// --- System prompt ---

async function getWeatherContext(): Promise<string> {
    try {
        const forecast = await getForecast();
        const days = forecast.daily.map(d =>
            `  ${d.date}: ${d.weather_icon} ${d.weather_label}, ${d.temp_min}–${d.temp_max}°C, wiatr ${d.wind_speed_max} km/h` +
            (d.is_painting_window ? ' 🎨malowanie OK' : '') +
            (d.is_welding_window ? ' 🔥spawanie OK' : '')
        ).join('\n');
        return `Prognoza 7-dniowa (${forecast.location}):\n${days}\nDni na malowanie: ${forecast.painting_windows}/7, spawanie: ${forecast.welding_windows}/7`;
    } catch {
        return 'Brak danych pogodowych.';
    }
}

async function buildSystemPrompt(
    userName: string,
    userRole: string,
    tasksContext: string,
    shipsContext: string,
    weatherContext: string,
    inventoryContext: string,
    equipmentContext: string,
    supplierContext: string,
    workloadContext: string,
    waterLevelContext: string,
    engineHoursContext: string,
    tanksContext: string,
): Promise<string> {
    return `Jesteś asystentem firmy "Tramwaje Wodne Zalewu Wiślanego".
Firma operuje dwa statki pasażerskie na Zalewie Wiślanym:

STATKI:
${shipsContext}

Sezon nawigacyjny: koniec kwietnia – koniec września.
Oba statki zimują w Tolkmicku. Zefir zimuje w wodzie (za ciężki). Kutrzeba wyciągany dźwigiem na brzeg.
Zespół: aktualnie 2 osoby (kapitan/właściciel + brat). Każdy pracownik może efektywnie pracować max 8h/dzień.

AKTUALNY UŻYTKOWNIK: ${userName} (rola: ${userRole})

AKTUALNE ZADANIA:
${tasksContext || 'Brak zadań.'}

OBCIĄŻENIE PRACOWNIKÓW:
${workloadContext}

POGODA (Tolkmicko):
${weatherContext}

MAGAZYN:
${inventoryContext}
${equipmentContext}
${supplierContext}
${waterLevelContext}
${engineHoursContext}
${tanksContext}
PLANOWANIE ZASOBÓW:
- Każdy pracownik może pracować max 8h/dzień — NIGDY nie planuj więcej niż 8h na osobę
- Aktualnie są 2 aktywni pracownicy — w przyszłości może być więcej (grafiki załogi w Etapie 3)
- Niektóre zadania wymagają więcej niż 1 osoby (np. podnoszenie ciężkich elementów, spawanie z asekuracją) — uwzględniaj to w estymacjach
- Duże zadania (>8h) ROZBIJAJ na mniejsze podzadania (max 8h każde), np. "Malowanie kadłuba" → "Szlifowanie", "Gruntowanie", "Malowanie 1 warstwa", "Malowanie 2 warstwa"
- Rozkładaj zadania na kilka dni uwzględniając priorytety i istniejące obciążenie
- Bierz pod uwagę sekcję "OBCIĄŻENIE PRACOWNIKÓW" — nie dodawaj zadań na pełne dni
- Przy wielu zadaniach proponuj rozproszone deadliny (nie wszystko na jutro)

INSTRUKCJE:
- Odpowiadaj po polsku, konkretnie i technicznie
- Pomagaj przy planowaniu remontów, naprawach, konserwacji, spawaniu, malowaniu, elektryce itp.
- Jeśli pytanie dotyczy konkretnego statku, wykorzystuj dane techniczne
- Uwzględniaj pogodę przy planowaniu prac pogodozależnych (malowanie, spawanie)
- Bądź praktyczny — dawaj konkretne porady krok po kroku
- Gdy nie wiesz, powiedz to wprost
- Odpowiedzi formatuj czytelnie (listy, nagłówki), ale zwięźle

AKCJE:
Gdy użytkownik prosi o STWORZENIE ZADANIA (np. "stwórz zadanie", "dodaj zadanie", "zaplanuj"):
1. Odpowiedz krótkim potwierdzeniem
2. Na KOŃCU wiadomości dodaj znacznik JSON:
[TASK_JSON]{"title":"tytuł","category":"spawanie|malowanie|mechanika_silnikowa|elektryka|hydraulika|stolarka|inspekcja|logistyka|rejs_probny|inne","priority":"critical|high|normal|low","description":"opis","ship_id":null,"estimated_hours":null}[/TASK_JSON]
- ship_id: 1 dla Zefir, 2 dla Kutrzeba, null jeśli nie dotyczy
- estimated_hours: szacunkowe godziny lub null

Gdy użytkownik prosi o DODANIE DO MAGAZYNU (np. "dodaj do magazynu", "przyjmij"):
[INVENTORY_JSON]{"item_name":"nazwa","quantity":10,"unit":"L|szt|kg|m","operation":"add|remove"}[/INVENTORY_JSON]

Gdy użytkownik prosi o ZNALEZIENIE/DODANIE DOSTAWCY (np. "znajdź dostawcę", "gdzie kupić", "szukaj sklepu"):
1. Odpowiedz informacją o znalezionym dostawcy (nazwa, adres, telefon, co sprzedaje)
2. Na KOŃCU wiadomości dodaj znacznik JSON:
[SUPPLIER_JSON]{"name":"nazwa firmy","phone":"telefon","email":"email","address":"ulica","city":"miasto","categories":["material"],"notes":"co sprzedaje"}[/SUPPLIER_JSON]
- categories: "tool" | "material" | "part" (jedna lub więcej)
- Podaj tyle danych ile znajdziesz, resztę pomiń

WAŻNE: Znaczniki JSON dodawaj TYLKO gdy użytkownik wyraźnie prosi o stworzenie/dodanie/znalezienie. Przy zwykłych pytaniach odpowiadaj normalnie bez znaczników.`;
}

async function getTasksContext(userId: number, userRole: string): Promise<string> {
    const sql = userRole === 'admin'
        ? `SELECT t.title, t.status, t.category, t.priority, t.estimated_hours, t.deadline, s.short_name as ship
           FROM tasks t LEFT JOIN ships s ON s.id = t.ship_id
           WHERE t.status != 'done'
           ORDER BY CASE t.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END
           LIMIT 20`
        : `SELECT t.title, t.status, t.category, t.priority, t.estimated_hours, t.deadline, s.short_name as ship
           FROM tasks t
           JOIN task_assignments ta ON ta.task_id = t.id
           LEFT JOIN ships s ON s.id = t.ship_id
           WHERE ta.user_id = ? AND t.status != 'done'
           ORDER BY CASE t.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END`;

    const params = userRole === 'admin' ? [] : [userId];
    const tasks = await queryAll<{ title: string; status: string; category: string; priority: string; estimated_hours: number | null; deadline: string | null; ship: string | null }>(
        sql, params,
    );

    if (tasks.length === 0) return '';

    return tasks.map(t => {
        const hours = t.estimated_hours ? `, ~${t.estimated_hours}h` : '';
        const dl = t.deadline ? `, deadline: ${t.deadline}` : '';
        return `- [${t.priority.toUpperCase()}] ${t.title} (${t.category}, ${t.status}${hours}${dl})${t.ship ? ` — ${t.ship}` : ''}`;
    }).join('\n');
}

async function getWorkloadContext(): Promise<string> {
    // Get tasks with deadlines in the next 7 days
    const rows = await queryAll<{ deadline: string; total_hours: number; task_count: number }>(
        `SELECT deadline, SUM(COALESCE(estimated_hours, 4)) as total_hours, COUNT(*) as task_count
         FROM tasks
         WHERE status IN ('pending', 'in_progress')
           AND deadline IS NOT NULL
           AND deadline >= date('now')
           AND deadline <= date('now', '+7 days')
         GROUP BY deadline
         ORDER BY deadline`,
        [],
    );

    // Also get tasks without deadline (backlog)
    const backlog = await queryAll<{ total_hours: number; task_count: number }>(
        `SELECT SUM(COALESCE(estimated_hours, 4)) as total_hours, COUNT(*) as task_count
         FROM tasks
         WHERE status IN ('pending', 'in_progress') AND deadline IS NULL`,
        [],
    );

    const MAX_DAILY_HOURS = 8; // per worker
    const WORKERS = 2;
    const TOTAL_DAILY = MAX_DAILY_HOURS * WORKERS;
    const lines: string[] = [];

    for (const row of rows) {
        const pct = Math.round((row.total_hours / TOTAL_DAILY) * 100);
        const status = row.total_hours > TOTAL_DAILY ? ' ⚠️ PRZECIĄŻONY!' : row.total_hours >= TOTAL_DAILY * 0.75 ? ' ⚠️ prawie pełny' : '';
        lines.push(`  ${row.deadline}: ${row.total_hours}h/${TOTAL_DAILY}h capacity (${row.task_count} zadań, ${pct}%)${status}`);
    }

    if (backlog.length > 0 && backlog[0].task_count > 0) {
        lines.push(`  Bez deadline’u: ${backlog[0].total_hours}h (${backlog[0].task_count} zadań)`);
    }

    if (lines.length === 0) {
        return 'Brak zaplanowanych zadań na najbliższy tydzień. Capacity: 2 pracowników × 8h = 16h/dzień.';
    }

    return lines.join('\n');
}

async function getShipsContext(): Promise<string> {
    const ships = await queryAll<{ name: string; specs: string }>(
        'SELECT name, specs FROM ships ORDER BY id', [],
    );

    return ships.map(s => {
        try {
            const specs = JSON.parse(s.specs);
            const details = Object.entries(specs)
                .map(([k, v]) => `  ${k}: ${v}`)
                .join('\n');
            return `${s.name}:\n${details}`;
        } catch {
            return `${s.name}: (dane niedostępne)`;
        }
    }).join('\n\n');
}

// --- Conversation management ---

export async function getConversations(userId: number): Promise<ConversationRow[]> {
    return await queryAll<ConversationRow>(
        'SELECT * FROM ai_conversations WHERE user_id = ? ORDER BY created_at DESC',
        [userId],
    );
}

export async function getConversationMessages(
    conversationId: number,
    userId: number,
): Promise<MessageRow[]> {
    // Verify ownership
    const conv = await queryOne<ConversationRow>(
        'SELECT * FROM ai_conversations WHERE id = ? AND user_id = ?',
        [conversationId, userId],
    );
    if (!conv) throw new Error('CONVERSATION_NOT_FOUND');

    return await queryAll<MessageRow>(
        'SELECT * FROM ai_messages WHERE conversation_id = ? ORDER BY created_at ASC',
        [conversationId],
    );
}

export async function deleteConversation(
    conversationId: number,
    userId: number,
): Promise<boolean> {
    const conv = await queryOne<ConversationRow>(
        'SELECT * FROM ai_conversations WHERE id = ? AND user_id = ?',
        [conversationId, userId],
    );
    if (!conv) return false;

    await execute('DELETE FROM ai_conversations WHERE id = ?', [conversationId]);
    return true;
}

// --- Main chat function ---

export async function sendMessage(
    userId: number,
    userName: string,
    userRole: string,
    message: string,
    conversationId?: number,
): Promise<AiChatResult> {
    // Build system prompt with dynamic context
    const tasksContext = await getTasksContext(userId, userRole);
    const shipsContext = await getShipsContext();
    const weatherContext = await getWeatherContext();
    const inventoryCtx = await getInventoryContext();
    const equipmentCtx = await getEquipmentContext();
    const supplierCtx = await getSupplierContext();
    const workloadCtx = await getWorkloadContext();
    const waterLevelCtx = await getWaterLevelForAI();
    const engineHoursCtx = await getEngineHoursForAI();
    const tanksCtx = await getTanksForAI();
    const systemPrompt = await buildSystemPrompt(userName, userRole, tasksContext, shipsContext, weatherContext, inventoryCtx, equipmentCtx, supplierCtx, workloadCtx, waterLevelCtx, engineHoursCtx, tanksCtx);

    // Get or create conversation
    let convId = conversationId;
    if (convId) {
        // Verify ownership
        const existing = await queryOne<ConversationRow>(
            'SELECT * FROM ai_conversations WHERE id = ? AND user_id = ?',
            [convId, userId],
        );
        if (!existing) throw new Error('CONVERSATION_NOT_FOUND');
    } else {
        // Create new conversation with first 50 chars of message as title
        const title = message.length > 50 ? message.slice(0, 47) + '...' : message;
        const result = await execute(
            'INSERT INTO ai_conversations (user_id, title) VALUES (?, ?)',
            [userId, title],
        );
        convId = result.lastInsertRowid;
    }

    // Save user message
    const userMsgResult = await execute(
        'INSERT INTO ai_messages (conversation_id, role, content) VALUES (?, ?, ?)',
        [convId, 'user', message],
    );

    // Load conversation history (last 20 messages for context)
    const history = await queryAll<MessageRow>(
        `SELECT role, content FROM ai_messages
         WHERE conversation_id = ? AND id != ?
         ORDER BY created_at ASC`,
        [convId, userMsgResult.lastInsertRowid],
    );

    // Build Gemini history
    const geminiHistory: Content[] = history.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
    }));

    // Call Gemini with key rotation + retry
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const { client: genAI, keyId } = await getAvailableGeminiClient();
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash-lite',
            systemInstruction: systemPrompt,
        });

        try {
            const chat = model.startChat({ history: geminiHistory });
            const result = await chat.sendMessage(message);
            const responseText = result.response.text();

            // Save assistant response
            await execute(
                'INSERT INTO ai_messages (conversation_id, role, content) VALUES (?, ?, ?)',
                [convId, 'assistant', responseText],
            );

            const assistantMsg = await queryOne<MessageRow>(
                'SELECT * FROM ai_messages WHERE conversation_id = ? AND role = ? ORDER BY id DESC LIMIT 1',
                [convId, 'assistant'],
            );

            return {
                conversation_id: convId,
                message: {
                    id: assistantMsg!.id,
                    role: 'assistant',
                    content: responseText,
                    created_at: assistantMsg!.created_at,
                },
            };
        } catch (error) {
            lastError = error;
            const status = await extractStatusCode(error);
            if (status === 429 || status === 403) {
                await reportKeyError(keyId, status);
                continue; // retry with next key
            }
            break; // non-retryable error
        }
    }

    // All retries failed — clean up
    await execute('DELETE FROM ai_messages WHERE id = ?', [userMsgResult.lastInsertRowid]);
    if (!conversationId) {
        await execute('DELETE FROM ai_conversations WHERE id = ?', [convId]);
    }
    throw lastError;
}

// --- Supplier search with Google Search grounding (REST API) ---

export async function searchSupplier(query: string): Promise<{ text: string }> {
    const { rawKey, keyId } = await getAvailableRawKey();

    const prompt = `Szukam dostawcy/sklepu w regionie Zalewu Wiślanego (Tolkmicko, Elbląg, Frombork, Malbork, Trójmiasto).
Zapytanie: ${query}

Wyszukaj w internecie i podaj PRAWDZIWE dane:
- Nazwę firmy/sklepu
- Adres
- Telefon
- Co sprzedają (w kontekście zapytania)

Jeśli znajdziesz kilku dostawców, opisz KAŻDEGO osobno.
Na KOŃCU odpowiedzi, dla KAŻDEGO dostawcy dodaj OSOBNY znacznik JSON (osobny blok per dostawca):
[SUPPLIER_JSON]{"name":"nazwa firmy 1","phone":"telefon","email":"email lub null","address":"ulica","city":"miasto","categories":["part"],"notes":"co sprzedaje"}[/SUPPLIER_JSON]
[SUPPLIER_JSON]{"name":"nazwa firmy 2","phone":"telefon","email":"email lub null","address":"ulica","city":"miasto","categories":["material"],"notes":"co sprzedaje"}[/SUPPLIER_JSON]

WAŻNE: Każdy dostawca w OSOBNYM [SUPPLIER_JSON]...[/SUPPLIER_JSON]. NIE łącz ich w tablicę.
Kategorie: "tool" (narzędzia), "material" (materiały), "part" (części).
Odpowiadaj po polsku.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${rawKey}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                tools: [{ google_search: {} }],
            }),
            signal: controller.signal,
        });

        if (!response.ok) {
            const errBody = await response.text();
            console.error('[AI Search] REST API error:', response.status, errBody);
            throw new Error(`Gemini API error: ${response.status}`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts
            ?.map((p: { text?: string }) => p.text || '')
            .join('') || 'Nie udało się znaleźć dostawcy.';

        return { text };
    } finally {
        clearTimeout(timeout);
    }
}

// --- AI Material Generation for Tasks ---

export interface MaterialSuggestion {
    name: string;
    quantity: number;
    unit: string;
    inventory_id: number | null;
    in_stock: number;
    to_buy: number;
}

export async function generateTaskMaterials(
    title: string,
    category: string,
    shipId: number | null,
    description?: string,
): Promise<{ materials: MaterialSuggestion[] }> {
    const { client: genAI, keyId } = await getAvailableGeminiClient();
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

    // Gather ship context
    let shipContext = '';
    if (shipId) {
        const ship = await queryOne<{ name: string; short_name: string; specs: string }>(
            'SELECT name, short_name, specs FROM ships WHERE id = ?',
            [shipId],
        );
        if (ship) {
            shipContext = `\nStatek: ${ship.name} (${ship.short_name})\nDane techniczne: ${ship.specs}`;
        }
    }

    // Gather inventory context
    const invItems = await queryAll<{ id: number; name: string; category: string; quantity: number; unit: string }>(
        'SELECT id, name, category, quantity, unit FROM inventory_items ORDER BY name',
        [],
    );
    const invContext = invItems.length > 0
        ? invItems.map(i => `- ${i.name}: ${i.quantity} ${i.unit} (id:${i.id})`).join('\n')
        : 'Magazyn pusty.';

    const prompt = `Jesteś ekspertem od remontów statków pasażerskich (Tramwaje Wodne Zalewu Wiślanego).

ZADANIE DO ANALIZY:
Tytuł: ${title}
Kategoria: ${category}
${description ? `Opis: ${description}` : ''}
${shipContext}

AKTUALNY STAN MAGAZYNU:
${invContext}

INSTRUKCJA:
Na podstawie zadania i danych technicznych statku, wygeneruj listę WSZYSTKICH materiałów, narzędzi i części potrzebnych do wykonania tego zadania.
Dla każdego materiału podaj realistyczną ilość.

Odpowiedz WYŁĄCZNIE poprawnym JSON (bez markdown, bez komentarzy):
[
  {"name": "nazwa materiału", "quantity": 5, "unit": "L"},
  {"name": "inny materiał", "quantity": 2, "unit": "szt"}
]

Jednostki: L (litry), szt (sztuki), kg (kilogramy), m (metry), m² (metry kw.), opak (opakowania).
Podaj od 3 do 10 pozycji. Nie dodawaj materiałów które nie mają sensu dla tego zadania.`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Parse AI response
    let aiMaterials: { name: string; quantity: number; unit: string }[] = [];
    try {
        // Extract JSON from response (might be wrapped in markdown code blocks)
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (Array.isArray(parsed)) {
                aiMaterials = parsed;
            }
        }
    } catch (err) {
        console.error('[AI Materials] Failed to parse response:', responseText, err);
        return { materials: [] };
    }

    // Cross-reference with inventory
    const materials: MaterialSuggestion[] = aiMaterials.map(m => {
        // Try to find matching inventory item (fuzzy match)
        const match = invItems.find(inv =>
            inv.name.toLowerCase().includes(m.name.toLowerCase())
            || m.name.toLowerCase().includes(inv.name.toLowerCase())
        );

        const inStock = match ? match.quantity : 0;
        const toBuy = Math.max(0, m.quantity - inStock);

        return {
            name: m.name,
            quantity: m.quantity,
            unit: m.unit || 'szt',
            inventory_id: match?.id ?? null,
            in_stock: inStock,
            to_buy: toBuy,
        };
    });

    return { materials };
}
