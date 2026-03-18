import { queryAll, queryOne, execute } from '../db/database.js';
import type { Database } from 'sql.js';

// --- Types ---

export interface EngineHoursEntry {
    id: number;
    equipment_id: number;
    equipment_name: string;
    equipment_type: string;
    ship_name: string | null;
    current_hours: number;
    last_updated: string;
}

export interface ServiceInterval {
    id: number;
    equipment_id: number;
    equipment_name: string;
    name: string;
    interval_hours: number;
    last_service_hours: number;
    last_service_date: string | null;
    notes: string | null;
    hours_since_service: number;
    hours_until_due: number;
    is_overdue: boolean;
    is_due_soon: boolean; // within 20% of interval
}

export interface ServiceLog {
    id: number;
    interval_id: number;
    interval_name: string;
    equipment_id: number;
    equipment_name: string;
    hours_at_service: number;
    performed_by: number | null;
    performer_name: string | null;
    notes: string | null;
    created_at: string;
}

export interface ServiceAlert {
    level: 'overdue' | 'due_soon';
    equipment_name: string;
    service_name: string;
    hours_since: number;
    interval_hours: number;
    message: string;
}

// --- Engine Hours CRUD ---

export function listEngineHours(db?: Database): EngineHoursEntry[] {
    return queryAll<EngineHoursEntry>(
        `SELECT eh.id, eh.equipment_id, eh.current_hours, eh.last_updated,
                e.name as equipment_name, e.type as equipment_type,
                s.name as ship_name
         FROM engine_hours eh
         JOIN equipment e ON e.id = eh.equipment_id
         LEFT JOIN ships s ON s.id = e.ship_id
         ORDER BY s.name, e.name`,
        [], db,
    );
}

export function getEngineHours(equipmentId: number, db?: Database): EngineHoursEntry | undefined {
    return queryOne<EngineHoursEntry>(
        `SELECT eh.id, eh.equipment_id, eh.current_hours, eh.last_updated,
                e.name as equipment_name, e.type as equipment_type,
                s.name as ship_name
         FROM engine_hours eh
         JOIN equipment e ON e.id = eh.equipment_id
         LEFT JOIN ships s ON s.id = e.ship_id
         WHERE eh.equipment_id = ?`,
        [equipmentId], db,
    ) ?? undefined;
}

export function createEngineHours(
    equipmentId: number,
    initialHours: number = 0,
    db?: Database,
): EngineHoursEntry | undefined {
    // Verify equipment exists
    const eq = queryOne<{ id: number }>('SELECT id FROM equipment WHERE id = ?', [equipmentId], db);
    if (!eq) return undefined;

    // Check if already exists
    const existing = queryOne<{ id: number }>('SELECT id FROM engine_hours WHERE equipment_id = ?', [equipmentId], db);
    if (existing) return getEngineHours(equipmentId, db);

    execute(
        'INSERT INTO engine_hours (equipment_id, current_hours) VALUES (?, ?)',
        [equipmentId, initialHours], db,
    );
    return getEngineHours(equipmentId, db);
}

export function updateHours(
    equipmentId: number,
    newHours: number,
    db?: Database,
): EngineHoursEntry | undefined {
    const existing = queryOne<{ id: number }>('SELECT id FROM engine_hours WHERE equipment_id = ?', [equipmentId], db);
    if (!existing) return undefined;

    execute(
        'UPDATE engine_hours SET current_hours = ?, last_updated = datetime(\'now\') WHERE equipment_id = ?',
        [newHours, equipmentId], db,
    );
    return getEngineHours(equipmentId, db);
}

export function addHours(
    equipmentId: number,
    hoursToAdd: number,
    db?: Database,
): EngineHoursEntry | undefined {
    const existing = queryOne<{ current_hours: number }>('SELECT current_hours FROM engine_hours WHERE equipment_id = ?', [equipmentId], db);
    if (!existing) return undefined;

    const newHours = existing.current_hours + hoursToAdd;
    return updateHours(equipmentId, newHours, db);
}

// --- Service Intervals CRUD ---

export function listServiceIntervals(equipmentId?: number, db?: Database): ServiceInterval[] {
    let sql = `
        SELECT si.id, si.equipment_id, si.name, si.interval_hours,
               si.last_service_hours, si.last_service_date, si.notes,
               e.name as equipment_name,
               COALESCE(
                   (SELECT eh.current_hours FROM engine_hours eh WHERE eh.equipment_id = si.equipment_id),
                   0
               ) as current_hours
        FROM service_intervals si
        JOIN equipment e ON e.id = si.equipment_id`;
    const params: (string | number)[] = [];

    if (equipmentId) {
        sql += ' WHERE si.equipment_id = ?';
        params.push(equipmentId);
    }

    sql += ' ORDER BY e.name, si.name';

    const rows = queryAll<{
        id: number; equipment_id: number; name: string;
        interval_hours: number; last_service_hours: number;
        last_service_date: string | null; notes: string | null;
        equipment_name: string; current_hours: number;
    }>(sql, params, db);

    return rows.map(row => {
        const hoursSinceService = row.current_hours - row.last_service_hours;
        const hoursUntilDue = row.interval_hours - hoursSinceService;
        return {
            id: row.id,
            equipment_id: row.equipment_id,
            equipment_name: row.equipment_name,
            name: row.name,
            interval_hours: row.interval_hours,
            last_service_hours: row.last_service_hours,
            last_service_date: row.last_service_date,
            notes: row.notes,
            hours_since_service: hoursSinceService,
            hours_until_due: hoursUntilDue,
            is_overdue: hoursUntilDue <= 0,
            is_due_soon: hoursUntilDue > 0 && hoursUntilDue <= row.interval_hours * 0.2,
        };
    });
}

export function createServiceInterval(
    data: {
        equipment_id: number;
        name: string;
        interval_hours: number;
        last_service_hours?: number;
        last_service_date?: string;
        notes?: string;
    },
    db?: Database,
): ServiceInterval | undefined {
    const eq = queryOne<{ id: number }>('SELECT id FROM equipment WHERE id = ?', [data.equipment_id], db);
    if (!eq) return undefined;

    const result = execute(
        `INSERT INTO service_intervals (equipment_id, name, interval_hours, last_service_hours, last_service_date, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [data.equipment_id, data.name, data.interval_hours,
         data.last_service_hours ?? 0, data.last_service_date ?? null, data.notes ?? null],
        db,
    );

    const intervals = listServiceIntervals(data.equipment_id, db);
    return intervals.find(i => i.id === result.lastInsertRowid);
}

// --- Service Logs ---

export function logService(
    data: {
        interval_id: number;
        notes?: string;
        performed_by?: number;
    },
    db?: Database,
): ServiceLog | undefined {
    // Get interval info
    const interval = queryOne<{
        id: number; equipment_id: number; name: string;
    }>('SELECT id, equipment_id, name FROM service_intervals WHERE id = ?', [data.interval_id], db);
    if (!interval) return undefined;

    // Get current engine hours for this equipment
    const eh = queryOne<{ current_hours: number }>('SELECT current_hours FROM engine_hours WHERE equipment_id = ?', [interval.equipment_id], db);
    const currentHours = eh?.current_hours ?? 0;

    // Create log
    const result = execute(
        `INSERT INTO service_logs (interval_id, equipment_id, hours_at_service, performed_by, notes)
         VALUES (?, ?, ?, ?, ?)`,
        [data.interval_id, interval.equipment_id, currentHours, data.performed_by ?? null, data.notes ?? null],
        db,
    );

    // Update interval's last_service info
    execute(
        `UPDATE service_intervals SET last_service_hours = ?, last_service_date = datetime('now')
         WHERE id = ?`,
        [currentHours, data.interval_id], db,
    );

    return queryOne<ServiceLog>(
        `SELECT sl.id, sl.interval_id, sl.equipment_id, sl.hours_at_service,
                sl.performed_by, sl.notes, sl.created_at,
                si.name as interval_name,
                e.name as equipment_name,
                u.name as performer_name
         FROM service_logs sl
         JOIN service_intervals si ON si.id = sl.interval_id
         JOIN equipment e ON e.id = sl.equipment_id
         LEFT JOIN users u ON u.id = sl.performed_by
         WHERE sl.id = ?`,
        [result.lastInsertRowid], db,
    ) ?? undefined;
}

export function getServiceLogs(equipmentId?: number, limit: number = 50, db?: Database): ServiceLog[] {
    let sql = `
        SELECT sl.id, sl.interval_id, sl.equipment_id, sl.hours_at_service,
               sl.performed_by, sl.notes, sl.created_at,
               si.name as interval_name,
               e.name as equipment_name,
               u.name as performer_name
        FROM service_logs sl
        JOIN service_intervals si ON si.id = sl.interval_id
        JOIN equipment e ON e.id = sl.equipment_id
        LEFT JOIN users u ON u.id = sl.performed_by`;
    const params: (number)[] = [];

    if (equipmentId) {
        sql += ' WHERE sl.equipment_id = ?';
        params.push(equipmentId);
    }

    sql += ' ORDER BY sl.created_at DESC LIMIT ?';
    params.push(limit);

    return queryAll<ServiceLog>(sql, params, db);
}

// --- Service Alerts ---

export function getServiceAlerts(db?: Database): ServiceAlert[] {
    const intervals = listServiceIntervals(undefined, db);
    const alerts: ServiceAlert[] = [];

    for (const interval of intervals) {
        if (interval.is_overdue) {
            alerts.push({
                level: 'overdue',
                equipment_name: interval.equipment_name,
                service_name: interval.name,
                hours_since: interval.hours_since_service,
                interval_hours: interval.interval_hours,
                message: `⚠️ PRZETERMINOWANY: ${interval.name} na ${interval.equipment_name} — ${interval.hours_since_service.toFixed(0)}h od ostatniego serwisu (interwał: co ${interval.interval_hours}h)`,
            });
        } else if (interval.is_due_soon) {
            alerts.push({
                level: 'due_soon',
                equipment_name: interval.equipment_name,
                service_name: interval.name,
                hours_since: interval.hours_since_service,
                interval_hours: interval.interval_hours,
                message: `⏰ Zbliża się: ${interval.name} na ${interval.equipment_name} — za ${interval.hours_until_due.toFixed(0)}h (interwał: co ${interval.interval_hours}h)`,
            });
        }
    }

    // Sort: overdue first, then due_soon
    alerts.sort((a, b) => {
        if (a.level === 'overdue' && b.level !== 'overdue') return -1;
        if (a.level !== 'overdue' && b.level === 'overdue') return 1;
        return 0;
    });

    return alerts;
}

// --- AI Context ---

export function getEngineHoursForAI(db?: Database): string {
    const hours = listEngineHours(db);
    const alerts = getServiceAlerts(db);

    if (hours.length === 0) {
        return '\n## Motogodziny\n- Brak zarejestrowanych liczników.';
    }

    const lines: string[] = ['\n## Motogodziny i serwis'];

    for (const h of hours) {
        lines.push(`- ${h.equipment_name} (${h.ship_name ?? 'brak statku'}): ${h.current_hours.toFixed(1)}h`);
    }

    if (alerts.length > 0) {
        lines.push('\nALERTY SERWISOWE:');
        for (const a of alerts) {
            lines.push(`- ${a.message}`);
        }
    }

    return lines.join('\n');
}
