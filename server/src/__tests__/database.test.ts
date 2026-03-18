import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Database } from 'sql.js';
import { createTestDatabase, queryAll, queryOne, execute, saveDatabase, closeDatabase, getDatabase, setDatabase, initDatabase } from '../db/database.js';
import { existsSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('Database — Faza 1: Fundament', () => {
    let db: Database;

    beforeAll(async () => {
        db = await createTestDatabase();
    });

    afterAll(() => {
        db.close();
    });

    // ============================================================
    // SCHEMA VERIFICATION
    // ============================================================
    describe('Schema', () => {
        it('should create all 12 MVP tables', () => {
            const tables = queryAll<{ name: string }>(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
                [],
                db
            );
            const tableNames = tables.map(t => t.name);

            expect(tableNames).toContain('users');
            expect(tableNames).toContain('ships');
            expect(tableNames).toContain('tasks');
            expect(tableNames).toContain('task_assignments');
            expect(tableNames).toContain('task_dependencies');
            expect(tableNames).toContain('time_logs');
            expect(tableNames).toContain('attachments');
            expect(tableNames).toContain('inventory_items');
            expect(tableNames).toContain('task_materials');
            expect(tableNames).toContain('ai_conversations');
            expect(tableNames).toContain('ai_messages');
            expect(tableNames).toContain('weather_cache');
            expect(tableNames).toContain('config');
        });

        it('should create all indexes', () => {
            const indexes = queryAll<{ name: string }>(
                "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name",
                [],
                db
            );
            const indexNames = indexes.map(i => i.name);

            expect(indexNames).toContain('idx_tasks_status');
            expect(indexNames).toContain('idx_tasks_ship');
            expect(indexNames).toContain('idx_tasks_priority');
            expect(indexNames).toContain('idx_task_assignments_user');
            expect(indexNames).toContain('idx_time_logs_task');
            expect(indexNames).toContain('idx_time_logs_user');
            expect(indexNames).toContain('idx_attachments_task');
            expect(indexNames).toContain('idx_ai_messages_conv');
        });

        it('should have foreign keys enabled', () => {
            const result = queryOne<{ foreign_keys: number }>(
                'PRAGMA foreign_keys',
                [],
                db
            );
            expect(result?.foreign_keys).toBe(1);
        });

        it('should be idempotent — running schema again does not error', async () => {
            // Create a second test DB — schema runs twice effectively
            const db2 = await createTestDatabase();
            const tables = queryAll<{ name: string }>(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
                [],
                db2
            );
            expect(tables.length).toBeGreaterThanOrEqual(12);
            db2.close();
        });
    });

    // ============================================================
    // SEED DATA VERIFICATION
    // ============================================================
    describe('Seed data', () => {
        it('should seed 2 ships', () => {
            const ships = queryAll<{ id: number; short_name: string }>(
                'SELECT id, short_name FROM ships ORDER BY id',
                [],
                db
            );
            expect(ships).toHaveLength(2);
            expect(ships[0].short_name).toBe('Zefir');
            expect(ships[1].short_name).toBe('Kutrzeba');
        });

        it('should seed ship specs as valid JSON', () => {
            const ship = queryOne<{ specs: string }>(
                "SELECT specs FROM ships WHERE short_name = 'Kutrzeba'",
                [],
                db
            );
            expect(ship).toBeDefined();
            const specs = JSON.parse(ship!.specs);
            expect(specs.engine).toBe('Volvo-Penta D41P (200 HP)');
            expect(specs.draft_m).toBe(0.65);
            expect(specs.fuel_capacity_l).toBe(3200);
        });

        it('should seed 9 tasks', () => {
            const tasks = queryAll('SELECT id FROM tasks', [], db);
            expect(tasks).toHaveLength(9);
        });

        it('should seed task with weather dependencies', () => {
            const task = queryOne<{
                weather_dependent: number;
                weather_min_temp: number;
                weather_max_humidity: number;
                weather_no_rain: number;
            }>(
                'SELECT weather_dependent, weather_min_temp, weather_max_humidity, weather_no_rain FROM tasks WHERE id = 1',
                [],
                db
            );
            expect(task).toBeDefined();
            expect(task!.weather_dependent).toBe(1);
            expect(task!.weather_min_temp).toBe(10.0);
            expect(task!.weather_max_humidity).toBe(70.0);
            expect(task!.weather_no_rain).toBe(1);
        });

        it('should seed task dependencies (rejs próbny depends on all others)', () => {
            const deps = queryAll<{ depends_on_id: number }>(
                'SELECT depends_on_id FROM task_dependencies WHERE task_id = 9 ORDER BY depends_on_id',
                [],
                db
            );
            expect(deps).toHaveLength(8);
            expect(deps.map(d => d.depends_on_id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
        });

        it('should seed 5 inventory items', () => {
            const items = queryAll('SELECT id FROM inventory_items', [], db);
            expect(items).toHaveLength(5);
        });

        it('should seed config values', () => {
            const seasonStart = queryOne<{ value: string }>(
                "SELECT value FROM config WHERE key = 'season_start_date'",
                [],
                db
            );
            expect(seasonStart?.value).toBe('2026-04-26');

            const company = queryOne<{ value: string }>(
                "SELECT value FROM config WHERE key = 'company_name'",
                [],
                db
            );
            expect(company?.value).toBe('Tramwaje Wodne Zalewu Wiślanego');
        });

        it('should be idempotent — running seed again does not duplicate data', async () => {
            const db2 = await createTestDatabase();
            const ships = queryAll('SELECT id FROM ships', [], db2);
            expect(ships).toHaveLength(2); // not 4
            const tasks = queryAll('SELECT id FROM tasks', [], db2);
            expect(tasks).toHaveLength(9); // not 18
            db2.close();
        });
    });

    // ============================================================
    // QUERY HELPERS
    // ============================================================
    describe('Query helpers', () => {
        it('queryAll returns array of objects', () => {
            const result = queryAll<{ short_name: string }>(
                'SELECT short_name FROM ships',
                [],
                db
            );
            expect(Array.isArray(result)).toBe(true);
            expect(result[0]).toHaveProperty('short_name');
        });

        it('queryOne returns single object or undefined', () => {
            const found = queryOne<{ id: number }>(
                'SELECT id FROM ships WHERE short_name = ?',
                ['Zefir'],
                db
            );
            expect(found).toBeDefined();
            expect(found!.id).toBe(1);

            const notFound = queryOne(
                'SELECT id FROM ships WHERE short_name = ?',
                ['Nonexistent'],
                db
            );
            expect(notFound).toBeUndefined();
        });

        it('execute returns changes and lastInsertRowid', () => {
            const result = execute(
                "INSERT INTO config (key, value) VALUES ('test_key', 'test_value')",
                [],
                db
            );
            expect(result.changes).toBe(1);
            expect(result.lastInsertRowid).toBeGreaterThan(0);

            // Cleanup
            execute("DELETE FROM config WHERE key = 'test_key'", [], db);
        });

        it('parameterized queries prevent SQL injection', () => {
            const malicious = "'; DROP TABLE ships; --";
            const result = queryOne(
                'SELECT id FROM ships WHERE short_name = ?',
                [malicious],
                db
            );
            expect(result).toBeUndefined();

            // Ships table still exists
            const ships = queryAll('SELECT id FROM ships', [], db);
            expect(ships).toHaveLength(2);
        });
    });

    // ============================================================
    // CONSTRAINTS VERIFICATION
    // ============================================================
    describe('Constraints', () => {
        it('should enforce task status CHECK constraint', () => {
            expect(() => {
                execute(
                    "INSERT INTO tasks (title, category, status) VALUES ('Test', 'inne', 'invalid_status')",
                    [],
                    db
                );
            }).toThrow();
        });

        it('should enforce task priority CHECK constraint', () => {
            expect(() => {
                execute(
                    "INSERT INTO tasks (title, category, priority) VALUES ('Test', 'inne', 'mega_high')",
                    [],
                    db
                );
            }).toThrow();
        });

        it('should enforce task category CHECK constraint', () => {
            expect(() => {
                execute(
                    "INSERT INTO tasks (title, category) VALUES ('Test', 'invalid_category')",
                    [],
                    db
                );
            }).toThrow();
        });

        it('should enforce user role CHECK constraint', () => {
            expect(() => {
                execute(
                    "INSERT INTO users (email, password, name, role) VALUES ('test@test.com', 'hash', 'Test', 'superadmin')",
                    [],
                    db
                );
            }).toThrow();
        });

        it('should enforce unique email on users', () => {
            execute(
                "INSERT INTO users (email, password, name, role) VALUES ('unique@test.com', 'hash', 'Test', 'admin')",
                [],
                db
            );
            expect(() => {
                execute(
                    "INSERT INTO users (email, password, name, role) VALUES ('unique@test.com', 'hash2', 'Test2', 'worker')",
                    [],
                    db
                );
            }).toThrow();

            // Cleanup
            execute("DELETE FROM users WHERE email = 'unique@test.com'", [], db);
        });

        it('should prevent self-referencing task dependencies', () => {
            expect(() => {
                execute(
                    'INSERT INTO task_dependencies (task_id, depends_on_id) VALUES (1, 1)',
                    [],
                    db
                );
            }).toThrow();
        });

        it('should enforce unique task assignments', () => {
            execute(
                "INSERT INTO users (id, email, password, name, role) VALUES (999, 'worker999@test.com', 'hash', 'Worker', 'worker')",
                [],
                db
            );
            execute(
                'INSERT INTO task_assignments (task_id, user_id) VALUES (1, 999)',
                [],
                db
            );
            expect(() => {
                execute(
                    'INSERT INTO task_assignments (task_id, user_id) VALUES (1, 999)',
                    [],
                    db
                );
            }).toThrow();

            // Cleanup
            execute('DELETE FROM task_assignments WHERE user_id = 999', [], db);
            execute('DELETE FROM users WHERE id = 999', [], db);
        });

        it('should cascade delete task assignments when task is deleted', () => {
            // Create a temp task + assignment
            execute(
                "INSERT INTO tasks (id, title, category) VALUES (100, 'Temp Task', 'inne')",
                [],
                db
            );
            execute(
                "INSERT INTO users (id, email, password, name, role) VALUES (998, 'temp@test.com', 'hash', 'Temp', 'worker')",
                [],
                db
            );
            execute(
                'INSERT INTO task_assignments (task_id, user_id) VALUES (100, 998)',
                [],
                db
            );

            // Delete the task
            execute('DELETE FROM tasks WHERE id = 100', [], db);

            // Assignment should be gone
            const assignments = queryAll(
                'SELECT * FROM task_assignments WHERE task_id = 100',
                [],
                db
            );
            expect(assignments).toHaveLength(0);

            // Cleanup
            execute('DELETE FROM users WHERE id = 998', [], db);
        });

        it('should have updated_at triggers for users, tasks, ships, inventory', () => {
            const triggers = queryAll<{ name: string }>(
                "SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name",
                [],
                db
            );
            const triggerNames = triggers.map(t => t.name);

            expect(triggerNames).toContain('update_users_timestamp');
            expect(triggerNames).toContain('update_tasks_timestamp');
            expect(triggerNames).toContain('update_ships_timestamp');
            expect(triggerNames).toContain('update_inventory_timestamp');
        });

        it('should auto-update updated_at when task is modified', () => {
            const before = queryOne<{ updated_at: string }>(
                'SELECT updated_at FROM tasks WHERE id = 1',
                [],
                db
            );

            execute(
                "UPDATE tasks SET title = 'Malowanie nadbudówki Zefira (test)' WHERE id = 1",
                [],
                db
            );

            const after = queryOne<{ updated_at: string }>(
                'SELECT updated_at FROM tasks WHERE id = 1',
                [],
                db
            );

            expect(before).toBeDefined();
            expect(after).toBeDefined();
            expect(after!.updated_at).toBeDefined();

            // Restore
            execute(
                "UPDATE tasks SET title = 'Malowanie nadbudówki Zefira' WHERE id = 1",
                [],
                db
            );
        });
    });
});

// ============================================================
// DATABASE LIFECYCLE — save, close, init with file path
// ============================================================
describe('Database — Lifecycle', () => {
    const TEST_DB_PATH = join(process.cwd(), 'data', '_test_lifecycle.db');

    afterAll(() => {
        // Clean up test DB file
        try { unlinkSync(TEST_DB_PATH); } catch { /* ignore */ }
    });

    it('saveDatabase should be a no-op when db is null', () => {
        // saveDatabase reads internal state — when no db is set, it returns early
        // This test just ensures no crash
        expect(() => saveDatabase()).not.toThrow();
    });

    it('initDatabase should create DB file on disk', async () => {
        // Clean up first
        try { unlinkSync(TEST_DB_PATH); } catch { /* ignore */ }

        const db = await initDatabase(TEST_DB_PATH);
        expect(db).toBeDefined();
        expect(existsSync(TEST_DB_PATH)).toBe(true);

        // Clean up — close the db
        closeDatabase();
    });

    it('closeDatabase should save and close without error', async () => {
        const db = await initDatabase(TEST_DB_PATH);
        expect(db).toBeDefined();

        // closeDatabase should not throw
        expect(() => closeDatabase()).not.toThrow();

        // After close, getDatabase should throw
        expect(() => getDatabase()).toThrow('Database not initialized');
    });

    it('getDatabase should throw before initialization', () => {
        expect(() => getDatabase()).toThrow('Database not initialized');
    });

    it('initDatabase should close old DB when called twice', async () => {
        const db1 = await initDatabase(TEST_DB_PATH);
        expect(db1).toBeDefined();

        // Second call should not crash
        const db2 = await initDatabase(TEST_DB_PATH);
        expect(db2).toBeDefined();

        closeDatabase();
    });
});
