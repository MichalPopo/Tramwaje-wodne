import { queryOne, execute } from '../db/database.js';
import type { Database } from 'sql.js';

// --- Config service (key-value store) ---

export function getConfig(key: string, db?: Database): string | undefined {
    const row = queryOne<{ value: string }>(
        'SELECT value FROM config WHERE key = ?',
        [key], db,
    );
    return row?.value;
}

export function setConfig(key: string, value: string, db?: Database): void {
    // Upsert
    execute(
        `INSERT INTO config (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [key, value], db,
    );
}

// --- Convenience: season start ---

export function getSeasonStart(db?: Database): string {
    return getConfig('season_start', db) ?? '2026-04-26';
}

export function setSeasonStart(date: string, db?: Database): void {
    setConfig('season_start', date, db);
}
