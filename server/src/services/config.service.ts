import { queryOne, execute } from '../db/database.js';

// --- Config service (key-value store) ---

export async function getConfig(key: string): Promise<string | undefined> {
    const row = await queryOne<{ value: string }>(
        'SELECT value FROM config WHERE key = ?',
        [key],
    );
    return row?.value;
}

export async function setConfig(key: string, value: string): Promise<void> {
    // Upsert
    await execute(
        `INSERT INTO config (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [key, value],
    );
}

// --- Convenience: season start ---

export async function getSeasonStart(): Promise<string> {
    return (await getConfig('season_start')) ?? '2026-04-26';
}

export async function setSeasonStart(date: string): Promise<void> {
    await setConfig('season_start', date);
}
