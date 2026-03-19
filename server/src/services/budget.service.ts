import { queryAll, queryOne } from '../db/database.js';

// --- Types ---

export interface TaskCost {
    id: number;
    title: string;
    ship_id: number | null;
    ship_name: string | null;
    category: string;
    status: string;
    estimated_cost: number;
    actual_cost: number;
    material_cost: number;
    labor_cost: number;
    total_actual: number;
    estimated_hours: number;
    actual_hours: number;
}

export interface ShipCost {
    ship_id: number | null;
    ship_name: string;
    task_count: number;
    estimated_cost: number;
    actual_cost: number;
    material_cost: number;
    labor_cost: number;
    total_actual: number;
}

export interface CategoryCost {
    category: string;
    task_count: number;
    estimated_cost: number;
    actual_cost: number;
    material_cost: number;
    labor_cost: number;
    total_actual: number;
}

export interface SeasonSummary {
    budget: number;
    hourly_rate: number;
    total_estimated: number;
    total_actual_cost: number;
    total_material_cost: number;
    total_labor_cost: number;
    total_expenses: number;
    total_spent: number;
    remaining: number;
    percent_used: number;
    task_count: number;
    done_count: number;
}

export interface MonthlyEntry {
    month: string;
    material_cost: number;
    labor_cost: number;
    total: number;
}

// --- Helpers ---

async function getConfigNumber(key: string, fallback: number): Promise<number> {
    const row = await queryOne<{ value: string }>('SELECT value FROM config WHERE key = ?', [key]);
    if (!row) return fallback;
    const n = parseFloat(row.value);
    return isNaN(n) ? fallback : n;
}

// --- Service Functions ---

export async function getTaskCosts(taskId: number): Promise<TaskCost | null> {
    const hourlyRate = await getConfigNumber('hourly_rate', 50);

    const row = await queryOne<{
        id: number; title: string; ship_id: number | null; ship_name: string | null;
        category: string; status: string; estimated_cost: number; actual_cost: number;
        estimated_hours: number; actual_hours: number;
    }>(
        `SELECT t.id, t.title, t.ship_id, s.name as ship_name, t.category, t.status,
                COALESCE(t.estimated_cost, 0) as estimated_cost,
                COALESCE(t.actual_cost, 0) as actual_cost,
                COALESCE(t.estimated_hours, 0) as estimated_hours,
                COALESCE(t.actual_hours, 0) as actual_hours
         FROM tasks t
         LEFT JOIN ships s ON s.id = t.ship_id
         WHERE t.id = ?`,
        [taskId]);
    if (!row) return null;

    // Material cost: sum of (quantity_needed × best unit_price) for task_materials
    const matRow = await queryOne<{ total: number }>(
        `SELECT COALESCE(SUM(tm.quantity_needed * COALESCE(
            tm.actual_unit_price,
            (SELECT MIN(si.unit_price) FROM supplier_inventory si WHERE si.inventory_id = tm.inventory_id AND si.unit_price IS NOT NULL),
            0
        )), 0) as total
         FROM task_materials tm WHERE tm.task_id = ?`,
        [taskId]);
    const materialCost = matRow?.total ?? 0;

    // Labor cost: actual_hours × hourly_rate
    const laborCost = row.actual_hours * hourlyRate;

    return {
        ...row,
        material_cost: Math.round(materialCost * 100) / 100,
        labor_cost: Math.round(laborCost * 100) / 100,
        total_actual: Math.round((row.actual_cost + materialCost + laborCost) * 100) / 100,
    };
}

export async function getShipCosts(): Promise<ShipCost[]> {
    const hourlyRate = await getConfigNumber('hourly_rate', 50);

    const rows = await queryAll<{
        ship_id: number | null; ship_name: string; task_count: number;
        estimated_cost: number; actual_cost: number; actual_hours: number;
    }>(
        `SELECT t.ship_id,
                COALESCE(s.name, 'Infrastruktura / oba statki') as ship_name,
                COUNT(*) as task_count,
                COALESCE(SUM(t.estimated_cost), 0) as estimated_cost,
                COALESCE(SUM(t.actual_cost), 0) as actual_cost,
                COALESCE(SUM(t.actual_hours), 0) as actual_hours
         FROM tasks t
         LEFT JOIN ships s ON s.id = t.ship_id
         GROUP BY t.ship_id
         ORDER BY ship_name`,
        []);

    const results: ShipCost[] = [];
    for (const r of rows) {
        const matRow = await queryOne<{ total: number }>(
            `SELECT COALESCE(SUM(tm.quantity_needed * COALESCE(
                tm.actual_unit_price,
                (SELECT MIN(si.unit_price) FROM supplier_inventory si WHERE si.inventory_id = tm.inventory_id AND si.unit_price IS NOT NULL),
                0
            )), 0) as total
             FROM task_materials tm
             JOIN tasks t ON t.id = tm.task_id
             WHERE ${r.ship_id ? 't.ship_id = ?' : 't.ship_id IS NULL'}`,
            r.ship_id ? [r.ship_id] : []);
        const materialCost = matRow?.total ?? 0;
        const laborCost = r.actual_hours * hourlyRate;

        results.push({
            ship_id: r.ship_id,
            ship_name: r.ship_name,
            task_count: r.task_count,
            estimated_cost: Math.round(r.estimated_cost * 100) / 100,
            actual_cost: Math.round(r.actual_cost * 100) / 100,
            material_cost: Math.round(materialCost * 100) / 100,
            labor_cost: Math.round(laborCost * 100) / 100,
            total_actual: Math.round((r.actual_cost + materialCost + laborCost) * 100) / 100,
        });
    }
    return results;
}

export async function getCategoryCosts(): Promise<CategoryCost[]> {
    const hourlyRate = await getConfigNumber('hourly_rate', 50);

    const rows = await queryAll<{
        category: string; task_count: number;
        estimated_cost: number; actual_cost: number; actual_hours: number;
    }>(
        `SELECT t.category,
                COUNT(*) as task_count,
                COALESCE(SUM(t.estimated_cost), 0) as estimated_cost,
                COALESCE(SUM(t.actual_cost), 0) as actual_cost,
                COALESCE(SUM(t.actual_hours), 0) as actual_hours
         FROM tasks t
         GROUP BY t.category
         ORDER BY estimated_cost DESC`,
        []);

    const results: CategoryCost[] = [];
    for (const r of rows) {
        const matRow = await queryOne<{ total: number }>(
            `SELECT COALESCE(SUM(tm.quantity_needed * COALESCE(
                tm.actual_unit_price,
                (SELECT MIN(si.unit_price) FROM supplier_inventory si WHERE si.inventory_id = tm.inventory_id AND si.unit_price IS NOT NULL),
                0
            )), 0) as total
             FROM task_materials tm
             JOIN tasks t ON t.id = tm.task_id
             WHERE t.category = ?`,
            [r.category]);
        const materialCost = matRow?.total ?? 0;
        const laborCost = r.actual_hours * hourlyRate;

        results.push({
            category: r.category,
            task_count: r.task_count,
            estimated_cost: Math.round(r.estimated_cost * 100) / 100,
            actual_cost: Math.round(r.actual_cost * 100) / 100,
            material_cost: Math.round(materialCost * 100) / 100,
            labor_cost: Math.round(laborCost * 100) / 100,
            total_actual: Math.round((r.actual_cost + materialCost + laborCost) * 100) / 100,
        });
    }
    return results;
}

export async function getSeasonSummary(): Promise<SeasonSummary> {
    const budget = await getConfigNumber('season_budget', 50000);
    const hourlyRate = await getConfigNumber('hourly_rate', 50);

    const stats = await queryOne<{
        task_count: number; done_count: number;
        total_estimated: number; total_actual_cost: number; total_hours: number;
    }>(
        `SELECT COUNT(*) as task_count,
                SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done_count,
                COALESCE(SUM(estimated_cost), 0) as total_estimated,
                COALESCE(SUM(actual_cost), 0) as total_actual_cost,
                COALESCE(SUM(actual_hours), 0) as total_hours
         FROM tasks`,
        [])!;

    const matRow = await queryOne<{ total: number }>(
        `SELECT COALESCE(SUM(tm.quantity_needed * COALESCE(
            tm.actual_unit_price,
            (SELECT MIN(si.unit_price) FROM supplier_inventory si WHERE si.inventory_id = tm.inventory_id AND si.unit_price IS NOT NULL),
            0
        )), 0) as total
         FROM task_materials tm`,
        []);
    const totalMaterialCost = matRow?.total ?? 0;
    const totalLaborCost = (stats?.total_hours ?? 0) * hourlyRate;

    // Manual expenses
    const expRow = await queryOne<{ total: number }>(
        'SELECT COALESCE(SUM(amount), 0) as total FROM expenses',
        []);
    const totalExpenses = expRow?.total ?? 0;

    const totalSpent = (stats?.total_actual_cost ?? 0) + totalMaterialCost + totalLaborCost + totalExpenses;

    return {
        budget,
        hourly_rate: hourlyRate,
        total_estimated: Math.round((stats?.total_estimated ?? 0) * 100) / 100,
        total_actual_cost: Math.round((stats?.total_actual_cost ?? 0) * 100) / 100,
        total_material_cost: Math.round(totalMaterialCost * 100) / 100,
        total_labor_cost: Math.round(totalLaborCost * 100) / 100,
        total_expenses: Math.round(totalExpenses * 100) / 100,
        total_spent: Math.round(totalSpent * 100) / 100,
        remaining: Math.round((budget - totalSpent) * 100) / 100,
        percent_used: budget > 0 ? Math.round((totalSpent / budget) * 10000) / 100 : 0,
        task_count: stats?.task_count ?? 0,
        done_count: stats?.done_count ?? 0,
    };
}

export async function getMonthlyTrend(): Promise<MonthlyEntry[]> {
    const hourlyRate = await getConfigNumber('hourly_rate', 50);

    // Get time logs grouped by month
    const laborRows = await queryAll<{ month: string; hours: number }>(
        `SELECT strftime('%Y-%m', logged_at) as month, SUM(hours) as hours
         FROM time_logs
         GROUP BY month
         ORDER BY month`,
        []);

    // Build a map of months
    const monthMap = new Map<string, { material: number; labor: number }>();

    for (const r of laborRows) {
        const entry = monthMap.get(r.month) || { material: 0, labor: 0 };
        entry.labor = r.hours * hourlyRate;
        monthMap.set(r.month, entry);
    }

    // Material costs by month: use task updated_at as proxy
    const matRows = await queryAll<{ month: string; cost: number }>(
        `SELECT strftime('%Y-%m', t.updated_at) as month,
                COALESCE(SUM(tm.quantity_needed * COALESCE(
                    tm.actual_unit_price,
                    (SELECT MIN(si.unit_price) FROM supplier_inventory si WHERE si.inventory_id = tm.inventory_id AND si.unit_price IS NOT NULL),
                    0
                )), 0) as cost
         FROM task_materials tm
         JOIN tasks t ON t.id = tm.task_id
         WHERE tm.purchased = 1
         GROUP BY month
         ORDER BY month`,
        []);

    for (const r of matRows) {
        const entry = monthMap.get(r.month) || { material: 0, labor: 0 };
        entry.material = r.cost;
        monthMap.set(r.month, entry);
    }

    return Array.from(monthMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, data]) => ({
            month,
            material_cost: Math.round(data.material * 100) / 100,
            labor_cost: Math.round(data.labor * 100) / 100,
            total: Math.round((data.material + data.labor) * 100) / 100,
        }));
}
