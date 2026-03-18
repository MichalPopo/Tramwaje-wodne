import { queryOne, execute } from '../db/database.js';

// --- Types ---

export interface DailyForecast {
    date: string;
    temp_max: number;
    temp_min: number;
    weather_code: number;
    weather_label: string;
    weather_icon: string;
    wind_speed_max: number;
    wind_gusts_max: number;
    precipitation_sum: number;
    precipitation_probability_max: number;
    is_painting_window: boolean;
    is_welding_window: boolean;
}

export interface WeatherForecast {
    location: string;
    latitude: number;
    longitude: number;
    fetched_at: string;
    daily: DailyForecast[];
    painting_windows: number;
    welding_windows: number;
}

// --- WMO Weather Codes ---

const WMO_CODES: Record<number, { label: string; icon: string }> = {
    0: { label: 'Bezchmurnie', icon: '☀️' },
    1: { label: 'Prawie bezchmurnie', icon: '🌤️' },
    2: { label: 'Częściowe zachmurzenie', icon: '⛅' },
    3: { label: 'Pochmurno', icon: '☁️' },
    45: { label: 'Mgła', icon: '🌫️' },
    48: { label: 'Szadź', icon: '🌫️' },
    51: { label: 'Mżawka lekka', icon: '🌦️' },
    53: { label: 'Mżawka umiarkowana', icon: '🌦️' },
    55: { label: 'Mżawka gęsta', icon: '🌧️' },
    56: { label: 'Marznąca mżawka', icon: '🌨️' },
    57: { label: 'Marznąca mżawka gęsta', icon: '🌨️' },
    61: { label: 'Deszcz słaby', icon: '🌧️' },
    63: { label: 'Deszcz umiarkowany', icon: '🌧️' },
    65: { label: 'Deszcz silny', icon: '🌧️' },
    66: { label: 'Marznący deszcz', icon: '🌨️' },
    67: { label: 'Marznący deszcz silny', icon: '🌨️' },
    71: { label: 'Śnieg słaby', icon: '❄️' },
    73: { label: 'Śnieg umiarkowany', icon: '❄️' },
    75: { label: 'Śnieg intensywny', icon: '❄️' },
    77: { label: 'Ziarna śnieżne', icon: '❄️' },
    80: { label: 'Przelotny deszcz', icon: '🌦️' },
    81: { label: 'Przelotny deszcz umiark.', icon: '🌧️' },
    82: { label: 'Przelotny deszcz silny', icon: '🌧️' },
    85: { label: 'Przelotny śnieg', icon: '🌨️' },
    86: { label: 'Przelotny śnieg silny', icon: '🌨️' },
    95: { label: 'Burza', icon: '⛈️' },
    96: { label: 'Burza z gradem', icon: '⛈️' },
    99: { label: 'Burza z silnym gradem', icon: '⛈️' },
};

function getWeatherLabel(code: number): { label: string; icon: string } {
    return WMO_CODES[code] ?? { label: `Kod ${code}`, icon: '❓' };
}

// --- Painting / Welding window logic ---

function isPaintingWindow(day: {
    precipitation_sum: number;
    precipitation_probability_max: number;
    temp_min: number;
    wind_speed_max: number;
    weather_code: number;
}): boolean {
    // Malowanie wymaga: brak deszczu, temp > 5°C, wiatr < 30 km/h, brak mgły
    return (
        day.precipitation_sum < 0.5 &&
        day.precipitation_probability_max < 40 &&
        day.temp_min > 5 &&
        day.wind_speed_max < 30 &&
        ![45, 48, 95, 96, 99].includes(day.weather_code)
    );
}

function isWeldingWindow(day: {
    precipitation_sum: number;
    precipitation_probability_max: number;
    wind_speed_max: number;
    weather_code: number;
}): boolean {
    // Spawanie wymaga: brak deszczu, wiatr < 20 km/h (gaz ochronny!), brak burzy
    return (
        day.precipitation_sum < 0.2 &&
        day.precipitation_probability_max < 30 &&
        day.wind_speed_max < 20 &&
        ![51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(day.weather_code)
    );
}

// --- Cache ---

const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minut

interface CacheRow {
    id: number;
    data: string;
    fetched_at: string;
}

function getCachedForecast(): WeatherForecast | null {
    const row = queryOne<CacheRow>(
        'SELECT * FROM weather_cache ORDER BY id DESC LIMIT 1',
    );
    if (!row) return null;

    const fetchedAt = new Date(row.fetched_at + 'Z').getTime();
    if (Date.now() - fetchedAt > CACHE_DURATION_MS) return null;

    try {
        return JSON.parse(row.data) as WeatherForecast;
    } catch {
        return null;
    }
}

function saveForecastToCache(forecast: WeatherForecast): void {
    // Delete old entries, keep only latest
    execute('DELETE FROM weather_cache');
    execute(
        'INSERT INTO weather_cache (data) VALUES (?)',
        [JSON.stringify(forecast)],
    );
}

// --- Fetch from Open-Meteo ---

export async function getForecast(): Promise<WeatherForecast> {
    // Check cache first
    const cached = getCachedForecast();
    if (cached) return cached;

    const lat = process.env.WEATHER_LAT || '54.3153';
    const lon = process.env.WEATHER_LON || '19.5314';

    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', lat);
    url.searchParams.set('longitude', lon);
    url.searchParams.set('daily', [
        'weather_code',
        'temperature_2m_max',
        'temperature_2m_min',
        'wind_speed_10m_max',
        'wind_gusts_10m_max',
        'precipitation_sum',
        'precipitation_probability_max',
    ].join(','));
    url.searchParams.set('timezone', 'Europe/Warsaw');
    url.searchParams.set('forecast_days', '7');

    const response = await fetch(url.toString());
    if (!response.ok) {
        throw new Error(`Open-Meteo API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as {
        daily: {
            time: string[];
            weather_code: number[];
            temperature_2m_max: number[];
            temperature_2m_min: number[];
            wind_speed_10m_max: number[];
            wind_gusts_10m_max: number[];
            precipitation_sum: number[];
            precipitation_probability_max: number[];
        };
    };

    const daily: DailyForecast[] = data.daily.time.map((date, i) => {
        const dayData = {
            precipitation_sum: data.daily.precipitation_sum[i],
            precipitation_probability_max: data.daily.precipitation_probability_max[i],
            temp_min: data.daily.temperature_2m_min[i],
            wind_speed_max: data.daily.wind_speed_10m_max[i],
            weather_code: data.daily.weather_code[i],
        };
        const { label, icon } = getWeatherLabel(data.daily.weather_code[i]);

        return {
            date,
            temp_max: data.daily.temperature_2m_max[i],
            temp_min: data.daily.temperature_2m_min[i],
            weather_code: data.daily.weather_code[i],
            weather_label: label,
            weather_icon: icon,
            wind_speed_max: data.daily.wind_speed_10m_max[i],
            wind_gusts_max: data.daily.wind_gusts_10m_max[i],
            precipitation_sum: data.daily.precipitation_sum[i],
            precipitation_probability_max: data.daily.precipitation_probability_max[i],
            is_painting_window: isPaintingWindow(dayData),
            is_welding_window: isWeldingWindow(dayData),
        };
    });

    const forecast: WeatherForecast = {
        location: 'Tolkmicko',
        latitude: parseFloat(lat),
        longitude: parseFloat(lon),
        fetched_at: new Date().toISOString(),
        daily,
        painting_windows: daily.filter(d => d.is_painting_window).length,
        welding_windows: daily.filter(d => d.is_welding_window).length,
    };

    // Cache
    saveForecastToCache(forecast);

    return forecast;
}
