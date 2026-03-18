import { queryAll, queryOne, execute } from '../db/database.js';
import type { Database } from 'sql.js';

// --- Types ---

export interface Tank {
    id: number;
    ship_id: number;
    ship_name: string;
    type: 'fuel' | 'fresh_water' | 'waste_water';
    name: string;
    capacity: number;
    current_level: number;
    alert_threshold: number;
    unit: string;
    percent: number;
    is_low: boolean;       // fuel/water below threshold
    is_high: boolean;      // waste above (100 - threshold)
    updated_at: string;
}

export interface TankLog {
    id: number;
    tank_id: number;
    tank_name: string;
    change_amount: number;
    level_after: number;
    log_type: 'refill' | 'consumption' | 'drain' | 'manual';
    route_info: string | null;
    notes: string | null;
    logged_by: number | null;
    logger_name: string | null;
    created_at: string;
}

export interface TankAlert {
    level: 'warning' | 'danger';
    tank_name: string;
    ship_name: string;
    tank_type: string;
    message: string;
}

// --- Type labels ---

const TYPE_LABELS: Record<string, { label: string; icon: string }> = {
    fuel: { label: 'Paliwo', icon: '⛽' },
    fresh_water: { label: 'Woda pitna', icon: '💧' },
    waste_water: { label: 'Nieczystości', icon: '🚽' },
};

// --- Helper ---

function enrichTank(row: {
    id: number; ship_id: number; ship_name: string; type: string;
    name: string; capacity: number; current_level: number;
    alert_threshold: number; unit: string; updated_at: string;
}): Tank {
    const percent = row.capacity > 0 ? Math.round((row.current_level / row.capacity) * 100) : 0;
    const isWaste = row.type === 'waste_water';

    return {
        ...row,
        type: row.type as Tank['type'],
        percent,
        // For waste water: alert when ABOVE threshold (e.g. > 80% = full)
        // For fuel/water: alert when BELOW threshold (e.g. < 20% = low)
        is_low: !isWaste && percent <= row.alert_threshold,
        is_high: isWaste && percent >= (100 - row.alert_threshold),
    };
}

// --- CRUD ---

export function listTanks(filters?: { ship_id?: number; type?: string }, db?: Database): Tank[] {
    let sql = `
        SELECT t.id, t.ship_id, t.type, t.name, t.capacity, t.current_level,
               t.alert_threshold, t.unit, t.updated_at,
               s.name as ship_name
        FROM tanks t
        JOIN ships s ON s.id = t.ship_id`;
    const params: (string | number)[] = [];
    const conditions: string[] = [];

    if (filters?.ship_id) {
        conditions.push('t.ship_id = ?');
        params.push(filters.ship_id);
    }
    if (filters?.type) {
        conditions.push('t.type = ?');
        params.push(filters.type);
    }

    if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY s.name, t.type, t.name';

    const rows = queryAll<{
        id: number; ship_id: number; ship_name: string; type: string;
        name: string; capacity: number; current_level: number;
        alert_threshold: number; unit: string; updated_at: string;
    }>(sql, params, db);

    return rows.map(enrichTank);
}

export function getTank(id: number, db?: Database): Tank | undefined {
    const row = queryOne<{
        id: number; ship_id: number; ship_name: string; type: string;
        name: string; capacity: number; current_level: number;
        alert_threshold: number; unit: string; updated_at: string;
    }>(
        `SELECT t.*, s.name as ship_name FROM tanks t
         JOIN ships s ON s.id = t.ship_id
         WHERE t.id = ?`,
        [id], db,
    );
    return row ? enrichTank(row) : undefined;
}

export function createTank(
    data: {
        ship_id: number;
        type: string;
        name: string;
        capacity: number;
        current_level?: number;
        alert_threshold?: number;
        unit?: string;
    },
    db?: Database,
): Tank | undefined {
    // Verify ship exists
    const ship = queryOne<{ id: number }>('SELECT id FROM ships WHERE id = ?', [data.ship_id], db);
    if (!ship) return undefined;

    const result = execute(
        `INSERT INTO tanks (ship_id, type, name, capacity, current_level, alert_threshold, unit)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [data.ship_id, data.type, data.name, data.capacity,
         data.current_level ?? 0, data.alert_threshold ?? 20, data.unit ?? 'L'],
        db,
    );

    return getTank(result.lastInsertRowid, db);
}

export function updateTank(
    id: number,
    data: Partial<{ name: string; capacity: number; current_level: number; alert_threshold: number; unit: string }>,
    db?: Database,
): Tank | undefined {
    const existing = queryOne<{ id: number }>('SELECT id FROM tanks WHERE id = ?', [id], db);
    if (!existing) return undefined;

    const fields: string[] = [];
    const params: (string | number)[] = [];

    if (data.name !== undefined) { fields.push('name = ?'); params.push(data.name); }
    if (data.capacity !== undefined) { fields.push('capacity = ?'); params.push(data.capacity); }
    if (data.current_level !== undefined) { fields.push('current_level = ?'); params.push(data.current_level); }
    if (data.alert_threshold !== undefined) { fields.push('alert_threshold = ?'); params.push(data.alert_threshold); }
    if (data.unit !== undefined) { fields.push('unit = ?'); params.push(data.unit); }

    if (fields.length === 0) return getTank(id, db);

    params.push(id);
    execute(`UPDATE tanks SET ${fields.join(', ')} WHERE id = ?`, params, db);

    return getTank(id, db);
}

// --- Log level changes ---

export function logTankChange(
    data: {
        tank_id: number;
        change_amount: number;
        log_type: 'refill' | 'consumption' | 'drain' | 'manual';
        route_info?: string;
        notes?: string;
        logged_by?: number;
    },
    db?: Database,
): TankLog | undefined {
    const tank = queryOne<{ id: number; current_level: number; capacity: number }>(
        'SELECT id, current_level, capacity FROM tanks WHERE id = ?',
        [data.tank_id], db,
    );
    if (!tank) return undefined;

    // Calculate new level (clamped to 0–capacity)
    const newLevel = Math.max(0, Math.min(tank.capacity, tank.current_level + data.change_amount));

    // Update tank level
    execute('UPDATE tanks SET current_level = ? WHERE id = ?', [newLevel, data.tank_id], db);

    // Create log entry
    const result = execute(
        `INSERT INTO tank_logs (tank_id, change_amount, level_after, log_type, route_info, notes, logged_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [data.tank_id, data.change_amount, newLevel, data.log_type,
         data.route_info ?? null, data.notes ?? null, data.logged_by ?? null],
        db,
    );

    return queryOne<TankLog>(
        `SELECT tl.*, t.name as tank_name, u.name as logger_name
         FROM tank_logs tl
         JOIN tanks t ON t.id = tl.tank_id
         LEFT JOIN users u ON u.id = tl.logged_by
         WHERE tl.id = ?`,
        [result.lastInsertRowid], db,
    ) ?? undefined;
}

export function getTankLogs(tankId: number, limit: number = 50, db?: Database): TankLog[] {
    return queryAll<TankLog>(
        `SELECT tl.*, t.name as tank_name, u.name as logger_name
         FROM tank_logs tl
         JOIN tanks t ON t.id = tl.tank_id
         LEFT JOIN users u ON u.id = tl.logged_by
         WHERE tl.tank_id = ?
         ORDER BY tl.created_at DESC
         LIMIT ?`,
        [tankId, limit], db,
    );
}

// --- Alerts ---

export function getTankAlerts(db?: Database): TankAlert[] {
    const tanks = listTanks(undefined, db);
    const alerts: TankAlert[] = [];

    for (const tank of tanks) {
        const typeInfo = TYPE_LABELS[tank.type] ?? { label: tank.type, icon: '📦' };

        if (tank.type === 'waste_water' && tank.is_high) {
            const msg = tank.percent >= 90
                ? `🚨 KRYTYCZNIE pełny: ${typeInfo.icon} ${tank.name} (${tank.ship_name}) — ${tank.percent}%! Opróżnij natychmiast!`
                : `⚠️ ${typeInfo.icon} ${tank.name} (${tank.ship_name}) — ${tank.percent}% pełny. Zaplanuj opróżnienie.`;
            alerts.push({
                level: tank.percent >= 90 ? 'danger' : 'warning',
                tank_name: tank.name,
                ship_name: tank.ship_name,
                tank_type: tank.type,
                message: msg,
            });
        } else if (tank.type !== 'waste_water' && tank.is_low) {
            const msg = tank.percent <= 10
                ? `🚨 KRYTYCZNIE niski: ${typeInfo.icon} ${tank.name} (${tank.ship_name}) — ${tank.percent}%! Uzupełnij natychmiast!`
                : `⚠️ Niski poziom: ${typeInfo.icon} ${tank.name} (${tank.ship_name}) — ${tank.percent}%. Zaplanuj uzupełnienie.`;
            alerts.push({
                level: tank.percent <= 10 ? 'danger' : 'warning',
                tank_name: tank.name,
                ship_name: tank.ship_name,
                tank_type: tank.type,
                message: msg,
            });
        }
    }

    return alerts;
}

// --- Consumption stats ---

export function getConsumptionStats(
    tankId: number,
    db?: Database,
): { total_consumed: number; avg_per_trip: number; trips_count: number } {
    const consumptions = queryAll<{ change_amount: number; route_info: string | null }>(
        `SELECT change_amount, route_info FROM tank_logs
         WHERE tank_id = ? AND log_type = 'consumption'`,
        [tankId], db,
    );

    const total = consumptions.reduce((sum, c) => sum + Math.abs(c.change_amount), 0);
    const withRoute = consumptions.filter(c => c.route_info);
    const avgPerTrip = withRoute.length > 0 ? total / withRoute.length : 0;

    return {
        total_consumed: total,
        avg_per_trip: avgPerTrip,
        trips_count: withRoute.length,
    };
}

// --- AI Context ---

export function getTanksForAI(db?: Database): string {
    const tanks = listTanks(undefined, db);
    const alerts = getTankAlerts(db);

    if (tanks.length === 0) {
        return '\n## Zbiorniki\n- Brak zarejestrowanych zbiorników.';
    }

    const lines: string[] = ['\n## Zbiorniki'];

    for (const tank of tanks) {
        const typeInfo = TYPE_LABELS[tank.type] ?? { label: tank.type, icon: '📦' };
        lines.push(`- ${typeInfo.icon} ${tank.name} (${tank.ship_name}): ${tank.current_level}/${tank.capacity}${tank.unit} (${tank.percent}%)`);
    }

    if (alerts.length > 0) {
        lines.push('\nALERTY ZBIORNIKÓW:');
        for (const a of alerts) {
            lines.push(`- ${a.message}`);
        }
    }

    return lines.join('\n');
}
