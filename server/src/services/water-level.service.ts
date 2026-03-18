import { queryOne, execute } from '../db/database.js';
import type { Database } from 'sql.js';

// --- Types ---

export interface WaterLevelData {
    station_id: string;
    station_name: string;
    river: string;
    water_level: number | null;      // cm
    water_level_date: string | null;
    water_temp: number | null;       // °C
    water_temp_date: string | null;
    ice_phenomenon: number;
    fetched_at: string;
}

export interface WaterLevelAlert {
    level: 'ok' | 'warning' | 'danger';
    message: string;
    ship_name?: string;
}

export interface WaterLevelResponse {
    data: WaterLevelData;
    alerts: WaterLevelAlert[];
}

// --- IMGW API Response type ---

interface IMGWHydroEntry {
    id_stacji: string;
    stacja: string;
    rzeka: string;
    stan_wody: string | null;
    stan_wody_data_pomiaru: string | null;
    temperatura_wody: string | null;
    temperatura_wody_data_pomiaru: string | null;
    zjawisko_lodowe: string | null;
    zjawisko_lodowe_data_pomiaru: string | null;
}

// --- Config ---

const IMGW_API_URL = 'https://danepubliczne.imgw.pl/api/data/hydro/';
const TOLKMICKO_STATION_ID = '154190090';
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minut

// Kutrzeba min draft = 0.65m = 65cm. Water level below ~450cm is dangerous for navigation.
// Normal water level in Vistula Lagoon (Zalew Wiślany) around 500cm ±30.
// Below 460cm → warning, below 440cm → danger
const WARNING_LEVEL_CM = 460;
const DANGER_LEVEL_CM = 440;

// --- Ice phenomena codes ---

const ICE_CODES: Record<number, string> = {
    0: 'Brak',
    1: 'Lód brzegowy',
    2: 'Śryż',
    3: 'Kra',
    4: 'Pokrywa lodowa',
    5: 'Pokrywa lodowa z zaklinowaniem',
    6: 'Zator lodowy',
    7: 'Pokrywa lodowa z przejściem',
    9: 'Lód gruntowy',
    41: 'Kra płynąca',
    42: 'Kra spiętrzana',
    43: 'Kra zatrzymana',
};

// --- Cache ---

interface CacheRow {
    id: number;
    data: string;
    fetched_at: string;
}

function getCached(db?: Database): WaterLevelData | null {
    const row = queryOne<CacheRow>(
        'SELECT * FROM water_level_cache ORDER BY id DESC LIMIT 1',
        [], db,
    );
    if (!row) return null;

    const fetchedAt = new Date(row.fetched_at + 'Z').getTime();
    if (Date.now() - fetchedAt > CACHE_DURATION_MS) return null;

    try {
        return JSON.parse(row.data) as WaterLevelData;
    } catch {
        return null;
    }
}

function saveToCache(data: WaterLevelData, db?: Database): void {
    execute('DELETE FROM water_level_cache', [], db);
    execute(
        'INSERT INTO water_level_cache (data) VALUES (?)',
        [JSON.stringify(data)], db,
    );
}

// --- Fetch from IMGW ---

async function fetchFromIMGW(): Promise<WaterLevelData> {
    const response = await fetch(IMGW_API_URL);
    if (!response.ok) {
        throw new Error(`IMGW API error: ${response.status} ${response.statusText}`);
    }

    const entries = await response.json() as IMGWHydroEntry[];
    const station = entries.find(e => e.id_stacji === TOLKMICKO_STATION_ID);

    if (!station) {
        throw new Error(`Stacja Tolkmicko (${TOLKMICKO_STATION_ID}) nie znaleziona w danych IMGW`);
    }

    return {
        station_id: station.id_stacji,
        station_name: station.stacja,
        river: station.rzeka,
        water_level: station.stan_wody ? parseInt(station.stan_wody, 10) : null,
        water_level_date: station.stan_wody_data_pomiaru,
        water_temp: station.temperatura_wody ? parseFloat(station.temperatura_wody) : null,
        water_temp_date: station.temperatura_wody_data_pomiaru,
        ice_phenomenon: station.zjawisko_lodowe ? parseInt(station.zjawisko_lodowe, 10) : 0,
        fetched_at: new Date().toISOString(),
    };
}

// --- Alert logic ---

export function getAlerts(data: WaterLevelData): WaterLevelAlert[] {
    const alerts: WaterLevelAlert[] = [];

    if (data.water_level !== null) {
        if (data.water_level < DANGER_LEVEL_CM) {
            alerts.push({
                level: 'danger',
                message: `⚠️ KRYTYCZNIE niski poziom wody: ${data.water_level} cm! Kutrzeba (zanurzenie 0.65m) — możliwy brak przejścia.`,
                ship_name: 'Kutrzeba',
            });
        } else if (data.water_level < WARNING_LEVEL_CM) {
            alerts.push({
                level: 'warning',
                message: `⚡ Niski poziom wody: ${data.water_level} cm. Zachowaj ostrożność na Kutrzebie (zanurzenie 0.65m).`,
                ship_name: 'Kutrzeba',
            });
        } else {
            alerts.push({
                level: 'ok',
                message: `✅ Poziom wody OK: ${data.water_level} cm — bezpieczny dla żeglugi.`,
            });
        }
    }

    // Ice warning
    if (data.ice_phenomenon > 0) {
        const iceLabel = ICE_CODES[data.ice_phenomenon] ?? `Zjawisko lodowe (kod: ${data.ice_phenomenon})`;
        alerts.push({
            level: data.ice_phenomenon >= 4 ? 'danger' : 'warning',
            message: `🧊 Zjawisko lodowe na Zalewie Wiślanym: ${iceLabel}`,
        });
    }

    return alerts;
}

// --- Public API ---

export async function getWaterLevel(db?: Database): Promise<WaterLevelResponse> {
    // Check cache first
    let data = getCached(db);

    if (!data) {
        data = await fetchFromIMGW();
        saveToCache(data, db);
    }

    return {
        data,
        alerts: getAlerts(data),
    };
}

// --- AI Context builder ---

export async function getWaterLevelForAI(db?: Database): Promise<string> {
    try {
        const { data, alerts } = await getWaterLevel(db);
        const lines: string[] = [
            `\n## Poziom wody — Zalew Wiślany (stacja ${data.station_name})`,
        ];

        if (data.water_level !== null) {
            lines.push(`- Poziom: ${data.water_level} cm (pomiar: ${data.water_level_date ?? 'brak daty'})`);
        }
        if (data.water_temp !== null) {
            lines.push(`- Temperatura wody: ${data.water_temp}°C`);
        }
        if (data.ice_phenomenon > 0) {
            const iceLabel = ICE_CODES[data.ice_phenomenon] ?? `kod ${data.ice_phenomenon}`;
            lines.push(`- Zjawisko lodowe: ${iceLabel}`);
        }

        for (const alert of alerts) {
            if (alert.level !== 'ok') {
                lines.push(`- ALERT: ${alert.message}`);
            }
        }

        lines.push(`- Przypomnienie: Kutrzeba ma zanurzenie 0.65m — uwzględnij przy planowaniu rejsów próbnych`);

        return lines.join('\n');
    } catch {
        return '\n## Poziom wody\n- Dane niedostępne (błąd IMGW API)';
    }
}
