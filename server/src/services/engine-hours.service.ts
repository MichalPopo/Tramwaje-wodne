import { queryAll, queryOne, execute } from '../db/database.js';

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

export async function listEngineHours(): Promise<EngineHoursEntry[]> {
    return await queryAll<EngineHoursEntry>(
        `SELECT eh.id, eh.equipment_id, eh.current_hours, eh.last_updated,
                e.name as equipment_name, e.type as equipment_type,
                s.name as ship_name
         FROM engine_hours eh
         JOIN equipment e ON e.id = eh.equipment_id
         LEFT JOIN ships s ON s.id = e.ship_id
         ORDER BY s.name, e.name`,
        [],
    );
}

export async function getEngineHours(equipmentId: number): Promise<EngineHoursEntry | undefined> {
    return await queryOne<EngineHoursEntry>(
        `SELECT eh.id, eh.equipment_id, eh.current_hours, eh.last_updated,
                e.name as equipment_name, e.type as equipment_type,
                s.name as ship_name
         FROM engine_hours eh
         JOIN equipment e ON e.id = eh.equipment_id
         LEFT JOIN ships s ON s.id = e.ship_id
         WHERE eh.equipment_id = ?`,
        [equipmentId],
    ) ?? undefined;
}

export async function createEngineHours(
    equipmentId: number,
    initialHours: number = 0,
): Promise<EngineHoursEntry | undefined> {
    // Verify equipment exists
    const eq = await queryOne<{ id: number }>('SELECT id FROM equipment WHERE id = ?', [equipmentId]);
    if (!eq) return undefined;

    // Check if already exists
    const existing = await queryOne<{ id: number }>('SELECT id FROM engine_hours WHERE equipment_id = ?', [equipmentId]);
    if (existing) return getEngineHours(equipmentId);

    await execute(
        'INSERT INTO engine_hours (equipment_id, current_hours) VALUES (?, ?)',
        [equipmentId, initialHours],
    );
    return getEngineHours(equipmentId);
}

export async function updateHours(
    equipmentId: number,
    newHours: number,
): Promise<EngineHoursEntry | undefined> {
    const existing = await queryOne<{ id: number }>('SELECT id FROM engine_hours WHERE equipment_id = ?', [equipmentId]);
    if (!existing) return undefined;

    await execute(
        'UPDATE engine_hours SET current_hours = ?, last_updated = datetime(\'now\') WHERE equipment_id = ?',
        [newHours, equipmentId],
    );
    return getEngineHours(equipmentId);
}

export async function addHours(
    equipmentId: number,
    hoursToAdd: number,
): Promise<EngineHoursEntry | undefined> {
    const existing = await queryOne<{ current_hours: number }>('SELECT current_hours FROM engine_hours WHERE equipment_id = ?', [equipmentId]);
    if (!existing) return undefined;

    const newHours = existing.current_hours + hoursToAdd;
    return updateHours(equipmentId, newHours);
}

// --- Service Intervals CRUD ---

export async function listServiceIntervals(equipmentId?: number): Promise<ServiceInterval[]> {
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

    const rows = await queryAll<{
        id: number; equipment_id: number; name: string;
        interval_hours: number; last_service_hours: number;
        last_service_date: string | null; notes: string | null;
        equipment_name: string; current_hours: number;
    }>(sql, params);

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

export async function createServiceInterval(
    data: {
        equipment_id: number;
        name: string;
        interval_hours: number;
        last_service_hours?: number;
        last_service_date?: string;
        notes?: string;
    },
): Promise<ServiceInterval | undefined> {
    const eq = await queryOne<{ id: number }>('SELECT id FROM equipment WHERE id = ?', [data.equipment_id]);
    if (!eq) return undefined;

    const result = await execute(
        `INSERT INTO service_intervals (equipment_id, name, interval_hours, last_service_hours, last_service_date, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [data.equipment_id, data.name, data.interval_hours,
         data.last_service_hours ?? 0, data.last_service_date ?? null, data.notes ?? null],
    );

    const intervals = await listServiceIntervals(data.equipment_id);
    return intervals.find((i: ServiceInterval) => i.id === result.lastInsertRowid);
}

// --- Service Logs ---

export async function logService(
    data: {
        interval_id: number;
        notes?: string;
        performed_by?: number;
    },
): Promise<ServiceLog | undefined> {
    // Get interval info
    const interval = await queryOne<{
        id: number; equipment_id: number; name: string;
    }>('SELECT id, equipment_id, name FROM service_intervals WHERE id = ?', [data.interval_id]);
    if (!interval) return undefined;

    // Get current engine hours for this equipment
    const eh = await queryOne<{ current_hours: number }>('SELECT current_hours FROM engine_hours WHERE equipment_id = ?', [interval.equipment_id]);
    const currentHours = eh?.current_hours ?? 0;

    // Create log
    const result = await execute(
        `INSERT INTO service_logs (interval_id, equipment_id, hours_at_service, performed_by, notes)
         VALUES (?, ?, ?, ?, ?)`,
        [data.interval_id, interval.equipment_id, currentHours, data.performed_by ?? null, data.notes ?? null],
    );

    // Update interval's last_service info
    await execute(
        `UPDATE service_intervals SET last_service_hours = ?, last_service_date = datetime('now')
         WHERE id = ?`,
        [currentHours, data.interval_id],
    );

    return await queryOne<ServiceLog>(
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
        [result.lastInsertRowid],
    ) ?? undefined;
}

export async function getServiceLogs(equipmentId?: number, limit: number = 50): Promise<ServiceLog[]> {
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

    return await queryAll<ServiceLog>(sql, params);
}

// --- Service Alerts ---

export async function getServiceAlerts(): Promise<ServiceAlert[]> {
    const intervals = await listServiceIntervals(undefined);
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

export async function getEngineHoursForAI(): Promise<string> {
    const hours = await listEngineHours();
    const alerts = await getServiceAlerts();

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
