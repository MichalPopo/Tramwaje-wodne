import { createClient, type Client, type InValue } from '@libsql/client';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let client: Client | null = null;

const SCHEMA_PATH = join(__dirname, 'schema.sql');
const SEED_PATH = join(__dirname, 'seed.sql');

/**
 * Initialize the database connection.
 * Uses Turso (cloud) in production, local file in dev, in-memory for tests.
 */
export async function initDatabase(): Promise<Client> {
    const url = process.env.TURSO_DATABASE_URL || 'file:data/tramwajewodne.db';
    const authToken = process.env.TURSO_AUTH_TOKEN;

    console.log('[DB] TURSO_DATABASE_URL:', url.slice(0, 40) + '...');
    console.log('[DB] TURSO_AUTH_TOKEN:', authToken ? authToken.slice(0, 20) + '...' : '(not set)');

    client = createClient({
        url,
        ...(authToken ? { authToken } : {}),
    });

    // Run schema (IF NOT EXISTS makes it idempotent)
    const schema = readFileSync(SCHEMA_PATH, 'utf-8');
    await client.executeMultiple(schema);

    // Migrations — add columns if missing
    const migrations = [
        'ALTER TABLE tasks ADD COLUMN planned_start TEXT',
        'ALTER TABLE tasks ADD COLUMN split_group_id INTEGER',
        'ALTER TABLE task_materials ADD COLUMN actual_unit_price REAL',
    ];
    for (const sql of migrations) {
        try { await client.execute(sql); } catch { /* already exists */ }
    }

    // Run seed data (INSERT OR IGNORE makes it idempotent)
    const seed = readFileSync(SEED_PATH, 'utf-8');
    await client.executeMultiple(seed);

    // Seed task assignments
    const assignments = [
        [1, 2], [2, 2], [5, 2], [6, 2],
        [1, 1], [3, 1],
    ];
    for (const [taskId, userId] of assignments) {
        try {
            await client.execute({
                sql: 'INSERT OR IGNORE INTO task_assignments (task_id, user_id) VALUES (?, ?)',
                args: [taskId, userId],
            });
        } catch { /* ignore */ }
    }

    return client;
}

/**
 * Create an in-memory database for testing.
 */
export async function createTestDatabase(): Promise<Client> {
    const testClient = createClient({ url: 'file::memory:' });

    const schema = readFileSync(SCHEMA_PATH, 'utf-8');
    await testClient.executeMultiple(schema);

    const seed = readFileSync(SEED_PATH, 'utf-8');
    await testClient.executeMultiple(seed);

    return testClient;
}

/**
 * Get the current client instance.
 */
export function getClient(): Client {
    if (!client) {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }
    return client;
}

/**
 * Set the client instance (used for testing).
 */
export function setClient(newClient: Client): void {
    client = newClient;
}

/**
 * Save database — no-op for Turso (auto-persisted).
 */
export function saveDatabase(): void {
    // Turso auto-persists, nothing to do
}

/**
 * Close the database connection.
 */
export function closeDatabase(): void {
    if (client) {
        client.close();
        client = null;
    }
}

/**
 * Helper: Run a query and return all rows.
 */
export async function queryAll<T = Record<string, unknown>>(
    sql: string,
    params: InValue[] = [],
): Promise<T[]> {
    const c = getClient();
    const result = await c.execute({ sql, args: params });
    return result.rows as unknown as T[];
}

/**
 * Helper: Run a query and return the first row.
 */
export async function queryOne<T = Record<string, unknown>>(
    sql: string,
    params: InValue[] = [],
): Promise<T | undefined> {
    const c = getClient();
    const result = await c.execute({ sql, args: params });
    return (result.rows[0] as unknown as T) ?? undefined;
}

/**
 * Helper: Execute a statement (INSERT, UPDATE, DELETE).
 */
export async function execute(
    sql: string,
    params: InValue[] = [],
): Promise<{ changes: number; lastInsertRowid: number }> {
    const c = getClient();
    const result = await c.execute({ sql, args: params });
    return {
        changes: result.rowsAffected,
        lastInsertRowid: Number(result.lastInsertRowid ?? 0),
    };
}
