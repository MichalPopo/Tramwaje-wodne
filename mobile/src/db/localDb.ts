/**
 * Local SQLite database for offline-first architecture.
 * Caches tasks, inventory, and AI conversations locally.
 * Queue mutations for later sync when online.
 */
import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
    if (!db) {
        db = await SQLite.openDatabaseAsync('tramwaje_wodne.db');
        await initSchema();
    }
    return db;
}

async function initSchema(): Promise<void> {
    const database = db!;
    
    await database.execAsync(`
        -- Tasks cache
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'pending',
            priority TEXT DEFAULT 'medium',
            category TEXT DEFAULT 'inne',
            ship_id INTEGER,
            ship_name TEXT,
            estimated_hours REAL,
            actual_hours REAL DEFAULT 0,
            created_at TEXT,
            updated_at TEXT,
            start_date TEXT,
            end_date TEXT,
            assignees TEXT, -- JSON array of {id, name}
            synced_at TEXT
        );

        -- Task assignments for current user
        CREATE TABLE IF NOT EXISTS my_tasks (
            task_id INTEGER PRIMARY KEY,
            gantt_start TEXT,
            gantt_end TEXT,
            data TEXT -- full JSON blob
        );

        -- Inventory cache
        CREATE TABLE IF NOT EXISTS inventory (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            category TEXT,
            quantity REAL DEFAULT 0,
            unit TEXT DEFAULT 'szt',
            min_quantity REAL DEFAULT 0,
            synced_at TEXT
        );

        -- Sync queue — mutations to push to server
        CREATE TABLE IF NOT EXISTS sync_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL, -- 'status_change', 'time_log', 'report_problem', 'inventory_adjust'
            endpoint TEXT NOT NULL,
            method TEXT NOT NULL DEFAULT 'POST',
            payload TEXT NOT NULL, -- JSON
            created_at TEXT NOT NULL,
            retries INTEGER DEFAULT 0,
            last_error TEXT
        );

        -- Problem reports (offline)
        CREATE TABLE IF NOT EXISTS problem_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER,
            title TEXT NOT NULL,
            description TEXT,
            photo_uri TEXT,
            priority TEXT DEFAULT 'high',
            created_at TEXT NOT NULL,
            synced INTEGER DEFAULT 0
        );

        -- Sync metadata
        CREATE TABLE IF NOT EXISTS sync_meta (
            key TEXT PRIMARY KEY,
            value TEXT
        );

        -- Notifications log
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL, -- 'deadline', 'sync', 'report', 'reminder'
            title TEXT NOT NULL,
            body TEXT,
            data TEXT, -- JSON
            read INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
        );
    `);
}

// ========== Tasks ==========

export async function cacheTasks(tasks: any[]): Promise<void> {
    const database = await getDb();
    await database.execAsync('DELETE FROM tasks');
    for (const t of tasks) {
        await database.runAsync(
            `INSERT OR REPLACE INTO tasks (id, title, description, status, priority, category, ship_id, ship_name, estimated_hours, actual_hours, created_at, updated_at, assignees, synced_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            t.id, t.title, t.description, t.status, t.priority, t.category,
            t.ship_id, t.ship_name, t.estimated_hours, t.actual_hours,
            t.created_at, t.updated_at, JSON.stringify(t.assignees || []),
            new Date().toISOString()
        );
    }
    await setMeta('last_tasks_sync', new Date().toISOString());
}

export async function getCachedTasks(): Promise<any[]> {
    const database = await getDb();
    const rows = await database.getAllAsync('SELECT * FROM tasks ORDER BY priority DESC, created_at DESC');
    return rows.map((r: any) => ({
        ...r,
        assignees: r.assignees ? JSON.parse(r.assignees) : [],
    }));
}

export async function cacheMyTasks(tasks: any[]): Promise<void> {
    const database = await getDb();
    await database.execAsync('DELETE FROM my_tasks');
    for (const t of tasks) {
        await database.runAsync(
            'INSERT OR REPLACE INTO my_tasks (task_id, gantt_start, gantt_end, data) VALUES (?, ?, ?, ?)',
            t.id, t.gantt_start || null, t.gantt_end || null, JSON.stringify(t)
        );
    }
    await setMeta('last_my_tasks_sync', new Date().toISOString());
}

export async function getCachedMyTasks(): Promise<any[]> {
    const database = await getDb();
    const rows = await database.getAllAsync('SELECT * FROM my_tasks');
    return rows.map((r: any) => JSON.parse(r.data));
}

// ========== Inventory ==========

export async function cacheInventory(items: any[]): Promise<void> {
    const database = await getDb();
    await database.execAsync('DELETE FROM inventory');
    for (const item of items) {
        await database.runAsync(
            'INSERT OR REPLACE INTO inventory (id, name, category, quantity, unit, min_quantity, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            item.id, item.name, item.category, item.quantity, item.unit, item.min_quantity,
            new Date().toISOString()
        );
    }
    await setMeta('last_inventory_sync', new Date().toISOString());
}

export async function getCachedInventory(): Promise<any[]> {
    const database = await getDb();
    return database.getAllAsync('SELECT * FROM inventory ORDER BY name');
}

// ========== Sync Queue ==========

export async function addToSyncQueue(
    type: string, endpoint: string, method: string, payload: any
): Promise<void> {
    const database = await getDb();
    await database.runAsync(
        'INSERT INTO sync_queue (type, endpoint, method, payload, created_at) VALUES (?, ?, ?, ?, ?)',
        type, endpoint, method, JSON.stringify(payload), new Date().toISOString()
    );
}

export async function getSyncQueue(): Promise<any[]> {
    const database = await getDb();
    return database.getAllAsync('SELECT * FROM sync_queue ORDER BY created_at ASC');
}

export async function removeSyncItem(id: number): Promise<void> {
    const database = await getDb();
    await database.runAsync('DELETE FROM sync_queue WHERE id = ?', id);
}

export async function updateSyncItemError(id: number, error: string): Promise<void> {
    const database = await getDb();
    await database.runAsync(
        'UPDATE sync_queue SET retries = retries + 1, last_error = ? WHERE id = ?',
        error, id
    );
}

export async function getSyncQueueCount(): Promise<number> {
    const database = await getDb();
    const row: any = await database.getFirstAsync('SELECT COUNT(*) as count FROM sync_queue');
    return row?.count || 0;
}

// ========== Problem Reports ==========

export async function addProblemReport(report: {
    task_id?: number; title: string; description: string; photo_uri?: string; priority?: string;
}): Promise<number> {
    const database = await getDb();
    const result = await database.runAsync(
        'INSERT INTO problem_reports (task_id, title, description, photo_uri, priority, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        report.task_id || null, report.title, report.description,
        report.photo_uri || null, report.priority || 'high',
        new Date().toISOString()
    );
    return result.lastInsertRowId;
}

export async function getUnsyncedReports(): Promise<any[]> {
    const database = await getDb();
    return database.getAllAsync('SELECT * FROM problem_reports WHERE synced = 0');
}

export async function markReportSynced(id: number): Promise<void> {
    const database = await getDb();
    await database.runAsync('UPDATE problem_reports SET synced = 1 WHERE id = ?', id);
}

// ========== Notifications ==========

export async function addNotification(notification: {
    type: string; title: string; body?: string; data?: any;
}): Promise<void> {
    const database = await getDb();
    await database.runAsync(
        'INSERT INTO notifications (type, title, body, data, created_at) VALUES (?, ?, ?, ?, ?)',
        notification.type, notification.title, notification.body || null,
        notification.data ? JSON.stringify(notification.data) : null,
        new Date().toISOString()
    );
}

export async function getNotifications(limit = 50): Promise<any[]> {
    const database = await getDb();
    const rows = await database.getAllAsync(
        'SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?', limit
    );
    return rows.map((r: any) => ({
        ...r,
        data: r.data ? JSON.parse(r.data) : null,
    }));
}

export async function markNotificationRead(id: number): Promise<void> {
    const database = await getDb();
    await database.runAsync('UPDATE notifications SET read = 1 WHERE id = ?', id);
}

export async function getUnreadCount(): Promise<number> {
    const database = await getDb();
    const row: any = await database.getFirstAsync('SELECT COUNT(*) as count FROM notifications WHERE read = 0');
    return row?.count || 0;
}

// ========== Sync Metadata ==========

export async function setMeta(key: string, value: string): Promise<void> {
    const database = await getDb();
    await database.runAsync(
        'INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)',
        key, value
    );
}

export async function getMeta(key: string): Promise<string | null> {
    const database = await getDb();
    const row: any = await database.getFirstAsync('SELECT value FROM sync_meta WHERE key = ?', key);
    return row?.value || null;
}
