import initSqlJs, { type Database } from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db: Database | null = null;
let currentDbPath: string | null = null;

const DB_DIR = join(__dirname, '..', '..', 'data');
const DB_PATH = join(DB_DIR, 'tramwajewodne.db');
const SCHEMA_PATH = join(__dirname, 'schema.sql');
const SEED_PATH = join(__dirname, 'seed.sql');

/**
 * Initialize the database connection.
 * Creates the database file if it doesn't exist.
 * Runs schema and seed SQL on first creation.
 */
export async function initDatabase(dbPath?: string): Promise<Database> {
    // Close existing connection if any (prevent memory leak on re-init)
    if (db) {
        db.close();
        db = null;
    }

    const SQL = await initSqlJs();
    const targetPath = dbPath || DB_PATH;
    const targetDir = dirname(targetPath);
    currentDbPath = targetPath;

    // Ensure directory exists
    if (!existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true });
    }

    // Load existing DB or create new one
    if (existsSync(targetPath) && !dbPath?.includes(':memory:')) {
        const buffer = readFileSync(targetPath);
        db = new SQL.Database(buffer);
    } else {
        db = new SQL.Database();
    }

    // Enable foreign keys + ensure triggers don't recurse
    db.run('PRAGMA foreign_keys=ON;');
    db.run('PRAGMA recursive_triggers=OFF;');

    // Run schema (IF NOT EXISTS makes it idempotent)
    const schema = readFileSync(SCHEMA_PATH, 'utf-8');
    db.exec(schema);

    // Migrations — add columns if missing
    try { db.run('ALTER TABLE tasks ADD COLUMN planned_start TEXT'); } catch { /* already exists */ }
    try { db.run('ALTER TABLE tasks ADD COLUMN split_group_id INTEGER'); } catch { /* already exists */ }
    try { db.run('ALTER TABLE task_materials ADD COLUMN actual_unit_price REAL'); } catch { /* already exists */ }

    // Run seed data (INSERT OR IGNORE makes it idempotent)
    const seed = readFileSync(SEED_PATH, 'utf-8');
    db.exec(seed);

    // Seed task assignments (done programmatically to avoid sql.js parsing issues)
    const assignments = [
        [1, 2], [2, 2], [5, 2], [6, 2], // Worker (Brat)
        [1, 1], [3, 1],                   // Admin (Kapitan)
    ];
    for (const [taskId, userId] of assignments) {
        try {
            db.run(
                'INSERT OR IGNORE INTO task_assignments (task_id, user_id) VALUES (?, ?)',
                [taskId, userId],
            );
        } catch { /* ignore if already exists or FK fails in tests */ }
    }

    // Save to disk
    if (!dbPath?.includes(':memory:')) {
        saveDatabase();
    }

    return db;
}

/**
 * Create an in-memory database for testing.
 * Runs schema and seed.
 */
export async function createTestDatabase(): Promise<Database> {
    const SQL = await initSqlJs();
    const testDb = new SQL.Database();

    testDb.run('PRAGMA foreign_keys=ON;');
    testDb.run('PRAGMA recursive_triggers=OFF;');

    const schema = readFileSync(SCHEMA_PATH, 'utf-8');
    testDb.exec(schema);

    const seed = readFileSync(SEED_PATH, 'utf-8');
    testDb.exec(seed);

    return testDb;
}

/**
 * Get the current database instance.
 * Throws if database is not initialized.
 */
export function getDatabase(): Database {
    if (!db) {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }
    return db;
}

/**
 * Set the database instance (used for testing).
 */
export function setDatabase(newDb: Database): void {
    db = newDb;
}

/**
 * Save the current database to disk.
 */
export function saveDatabase(): void {
    if (!db || !currentDbPath) return;
    const data = db.export();
    const buffer = Buffer.from(data);
    writeFileSync(currentDbPath, buffer);
}

/**
 * Close the database connection.
 */
export function closeDatabase(): void {
    if (db) {
        saveDatabase();
        db.close();
        db = null;
    }
}

/**
 * Helper: Run a query and return all rows.
 */
export function queryAll<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
    database?: Database
): T[] {
    const d = database || getDatabase();
    const stmt = d.prepare(sql);
    stmt.bind(params);

    const results: T[] = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject() as T);
    }
    stmt.free();
    return results;
}

/**
 * Helper: Run a query and return the first row.
 * Uses dedicated step() to avoid fetching all rows.
 */
export function queryOne<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
    database?: Database
): T | undefined {
    const d = database || getDatabase();
    const stmt = d.prepare(sql);
    stmt.bind(params);

    let result: T | undefined;
    if (stmt.step()) {
        result = stmt.getAsObject() as T;
    }
    stmt.free();
    return result;
}

/**
 * Helper: Execute a statement (INSERT, UPDATE, DELETE).
 * Returns the number of changes and the last inserted row ID.
 */
export function execute(
    sql: string,
    params: unknown[] = [],
    database?: Database
): { changes: number; lastInsertRowid: number } {
    const d = database || getDatabase();
    d.run(sql, params);

    const changesResult = queryOne<{ changes: number }>(
        'SELECT changes() as changes',
        [],
        d
    );
    const lastIdResult = queryOne<{ id: number }>(
        'SELECT last_insert_rowid() as id',
        [],
        d
    );

    // Auto-save to disk after write operations (prevents data loss on server restart)
    if (!database && currentDbPath && !currentDbPath.includes(':memory:')) {
        saveDatabase();
    }

    return {
        changes: changesResult?.changes ?? 0,
        lastInsertRowid: lastIdResult?.id ?? 0,
    };
}
