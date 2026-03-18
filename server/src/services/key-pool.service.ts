import { GoogleGenerativeAI } from '@google/generative-ai';
import { queryAll, execute } from '../db/database.js';
import type { Database } from 'sql.js';

// --- Types ---

export interface ApiKeyInfo {
    id: number;
    api_key: string;
    label: string;
    is_active: boolean;
    total_requests: number;
    total_errors: number;
    cooldown_until: string | null;
    last_used: string | null;
    created_at: string;
}

export interface ApiKeyStatus extends Omit<ApiKeyInfo, 'api_key'> {
    masked_key: string;
    is_available: boolean;
}

// --- Key management (DB-backed) ---

function ensureTable(db?: Database): void {
    execute(`CREATE TABLE IF NOT EXISTS gemini_api_keys (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        api_key         TEXT NOT NULL UNIQUE,
        label           TEXT NOT NULL DEFAULT '',
        is_active       INTEGER NOT NULL DEFAULT 1,
        total_requests  INTEGER NOT NULL DEFAULT 0,
        total_errors    INTEGER NOT NULL DEFAULT 0,
        cooldown_until  TEXT,
        last_used       TEXT,
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    )`, [], db);
}

export function listKeys(db?: Database): ApiKeyStatus[] {
    ensureTable(db);
    const rows = queryAll<ApiKeyInfo>('SELECT * FROM gemini_api_keys ORDER BY id', [], db);
    return rows.map(keyToStatus);
}

export function addKey(apiKey: string, label: string, db?: Database): ApiKeyStatus {
    ensureTable(db);
    const result = execute(
        'INSERT INTO gemini_api_keys (api_key, label) VALUES (?, ?)',
        [apiKey.trim(), label || `Klucz #${Date.now()}`], db,
    );
    const row = queryAll<ApiKeyInfo>('SELECT * FROM gemini_api_keys WHERE id = ?', [result.lastInsertRowid], db)[0];
    return keyToStatus(row);
}

export function removeKey(id: number, db?: Database): boolean {
    ensureTable(db);
    const result = execute('DELETE FROM gemini_api_keys WHERE id = ?', [id], db);
    return result.changes > 0;
}

export function toggleKey(id: number, active: boolean, db?: Database): boolean {
    ensureTable(db);
    const result = execute('UPDATE gemini_api_keys SET is_active = ? WHERE id = ?', [active ? 1 : 0, id], db);
    return result.changes > 0;
}

function keyToStatus(row: ApiKeyInfo): ApiKeyStatus {
    const masked = row.api_key.slice(0, 6) + '•••' + row.api_key.slice(-4);
    const cooldownEnd = row.cooldown_until ? new Date(row.cooldown_until).getTime() : 0;
    return {
        id: row.id,
        masked_key: masked,
        label: row.label,
        is_active: !!row.is_active,
        total_requests: row.total_requests,
        total_errors: row.total_errors,
        cooldown_until: row.cooldown_until,
        last_used: row.last_used,
        created_at: row.created_at,
        is_available: !!row.is_active && Date.now() > cooldownEnd,
    };
}

// --- Key Pool (rotation logic) ---

const COOLDOWN_429_MS = 60_000;       // 1 min for rate limit
const COOLDOWN_QUOTA_MS = 3600_000;   // 1h for daily quota

export function getAvailableGeminiClient(db?: Database): { client: GoogleGenerativeAI; keyId: number } {
    ensureTable(db);

    // First: try DB keys
    const rows = queryAll<ApiKeyInfo>(
        `SELECT * FROM gemini_api_keys
         WHERE is_active = 1
         AND (cooldown_until IS NULL OR cooldown_until < datetime('now'))
         ORDER BY total_requests ASC`,
        [], db,
    );

    if (rows.length > 0) {
        const key = rows[0]; // use least-used key
        execute(
            "UPDATE gemini_api_keys SET last_used = datetime('now'), total_requests = total_requests + 1 WHERE id = ?",
            [key.id], db,
        );
        return { client: new GoogleGenerativeAI(key.api_key), keyId: key.id };
    }

    // Fallback: env variable
    const envKey = process.env.GEMINI_API_KEY;
    if (envKey) {
        return { client: new GoogleGenerativeAI(envKey), keyId: -1 };
    }

    throw new Error('Brak dostępnych kluczy API Gemini. Dodaj klucz w Ustawienia → Klucze API.');
}

/**
 * Get raw API key string (for REST API calls like search grounding).
 */
export function getAvailableRawKey(db?: Database): { rawKey: string; keyId: number } {
    const { client, keyId } = getAvailableGeminiClient(db);
    // Extract key: for DB keys, re-read from DB; for env key, use env
    if (keyId < 0) {
        return { rawKey: process.env.GEMINI_API_KEY!, keyId };
    }
    const row = queryAll<ApiKeyInfo>('SELECT api_key FROM gemini_api_keys WHERE id = ?', [keyId], db)[0];
    return { rawKey: row.api_key, keyId };
}

export function reportKeyError(keyId: number, statusCode: number, db?: Database): void {
    if (keyId < 0) return; // env key, skip

    ensureTable(db);

    if (statusCode === 429) {
        // Rate limit — short cooldown
        execute(
            `UPDATE gemini_api_keys
             SET cooldown_until = datetime('now', '+${Math.floor(COOLDOWN_429_MS / 1000)} seconds'),
                 total_errors = total_errors + 1
             WHERE id = ?`,
            [keyId], db,
        );
    } else if (statusCode === 403) {
        // Quota exceeded — long cooldown
        execute(
            `UPDATE gemini_api_keys
             SET cooldown_until = datetime('now', '+${Math.floor(COOLDOWN_QUOTA_MS / 1000)} seconds'),
                 total_errors = total_errors + 1
             WHERE id = ?`,
            [keyId], db,
        );
    } else {
        // Other error — just count
        execute(
            'UPDATE gemini_api_keys SET total_errors = total_errors + 1 WHERE id = ?',
            [keyId], db,
        );
    }
}

export function clearCooldown(id: number, db?: Database): boolean {
    ensureTable(db);
    const result = execute(
        'UPDATE gemini_api_keys SET cooldown_until = NULL WHERE id = ?',
        [id], db,
    );
    return result.changes > 0;
}
