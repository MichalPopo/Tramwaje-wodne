import { queryAll, queryOne, execute } from '../db/database.js';

// --- Types ---

interface InventoryRow {
    id: number;
    name: string;
    category: string;
    unit: string | null;
    quantity: number;
    min_quantity: number | null;
    location: string | null;
    ship_id: number | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

interface InventoryWithShip extends InventoryRow {
    ship_name: string | null;
}

interface TaskMaterialRow {
    id: number;
    task_id: number;
    inventory_id: number | null;
    name: string;
    quantity_needed: number;
    unit: string | null;
    purchased: number;
    notes: string | null;
}

export interface InventoryItem {
    id: number;
    name: string;
    category: string;
    unit: string | null;
    quantity: number;
    min_quantity: number | null;
    location: string | null;
    ship_id: number | null;
    ship_name: string | null;
    notes: string | null;
    is_low_stock: boolean;
    created_at: string;
    updated_at: string;
}

export interface TaskMaterial {
    id: number;
    task_id: number;
    inventory_id: number | null;
    name: string;
    quantity_needed: number;
    unit: string | null;
    purchased: boolean;
    notes: string | null;
    current_stock: number | null;
}

export interface ShoppingListItem {
    name: string;
    unit: string | null;
    total_needed: number;
    in_stock: number;
    to_buy: number;
    tasks: string[];
}

// --- Helpers ---

function toInventoryItem(row: InventoryWithShip): InventoryItem {
    return {
        ...row,
        is_low_stock: row.min_quantity !== null && row.quantity < row.min_quantity,
    };
}

function toTaskMaterial(row: TaskMaterialRow & { current_stock?: number | null }): TaskMaterial {
    return {
        ...row,
        purchased: Boolean(row.purchased),
        current_stock: row.current_stock ?? null,
    };
}

// --- Inventory CRUD ---

interface ListFilters {
    category?: string;
    ship_id?: number;
    search?: string;
    low_stock?: boolean;
}

export async function listItems(filters: ListFilters = {}): Promise<InventoryItem[]> {
    let sql = `
        SELECT i.*, s.short_name as ship_name
        FROM inventory_items i
        LEFT JOIN ships s ON s.id = i.ship_id
        WHERE 1=1
    `;
    const params: (string | number | null)[] = [];

    if (filters.category) {
        sql += ' AND i.category = ?';
        params.push(filters.category);
    }
    if (filters.ship_id) {
        sql += ' AND i.ship_id = ?';
        params.push(filters.ship_id);
    }
    if (filters.search) {
        sql += ' AND (i.name LIKE ? OR i.notes LIKE ?)';
        params.push(`%${filters.search}%`, `%${filters.search}%`);
    }
    if (filters.low_stock) {
        sql += ' AND i.min_quantity IS NOT NULL AND i.quantity < i.min_quantity';
    }

    sql += ' ORDER BY i.category, i.name';

    return (await queryAll<InventoryWithShip>(sql, params)).map(toInventoryItem);
}

export async function getItem(id: number): Promise<InventoryItem | undefined> {
    const row = await queryOne<InventoryWithShip>(
        `SELECT i.*, s.short_name as ship_name
         FROM inventory_items i
         LEFT JOIN ships s ON s.id = i.ship_id
         WHERE i.id = ?`,
        [id],
    );
    return row ? toInventoryItem(row) : undefined;
}

export async function createItem(
    data: {
        name: string;
        category: string;
        unit?: string;
        quantity?: number;
        min_quantity?: number;
        location?: string;
        ship_id?: number;
        notes?: string;
    },
): Promise<InventoryItem> {
    const result = await execute(
        `INSERT INTO inventory_items (name, category, unit, quantity, min_quantity, location, ship_id, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            data.name,
            data.category,
            data.unit ?? null,
            data.quantity ?? 0,
            data.min_quantity ?? null,
            data.location ?? null,
            data.ship_id ?? null,
            data.notes ?? null,
        ],
    );
    return (await getItem(result.lastInsertRowid))!;
}

export async function updateItem(
    id: number,
    data: {
        name?: string;
        category?: string;
        unit?: string;
        quantity?: number;
        min_quantity?: number | null;
        location?: string;
        ship_id?: number | null;
        notes?: string | null;
    },
): Promise<InventoryItem | undefined> {
    const existing = await queryOne<InventoryRow>('SELECT * FROM inventory_items WHERE id = ?', [id]);
    if (!existing) return undefined;

    const updated = {
        name: data.name ?? existing.name,
        category: data.category ?? existing.category,
        unit: data.unit !== undefined ? data.unit : existing.unit,
        quantity: data.quantity !== undefined ? data.quantity : existing.quantity,
        min_quantity: data.min_quantity !== undefined ? data.min_quantity : existing.min_quantity,
        location: data.location !== undefined ? data.location : existing.location,
        ship_id: data.ship_id !== undefined ? data.ship_id : existing.ship_id,
        notes: data.notes !== undefined ? data.notes : existing.notes,
    };

    await execute(
        `UPDATE inventory_items SET name=?, category=?, unit=?, quantity=?, min_quantity=?, location=?, ship_id=?, notes=?
         WHERE id = ?`,
        [updated.name, updated.category, updated.unit, updated.quantity, updated.min_quantity, updated.location, updated.ship_id, updated.notes, id],
    );

    return getItem(id);
}

export async function deleteItem(id: number): Promise<boolean> {
    const result = await execute('DELETE FROM inventory_items WHERE id = ?', [id]);
    return result.changes > 0;
}

export async function adjustQuantity(
    id: number,
    delta: number,
): Promise<InventoryItem | undefined> {
    const existing = await queryOne<InventoryRow>('SELECT * FROM inventory_items WHERE id = ?', [id]);
    if (!existing) return undefined;

    const newQty = Math.max(0, existing.quantity + delta);
    await execute('UPDATE inventory_items SET quantity = ? WHERE id = ?', [newQty, id]);

    return getItem(id);
}

// --- Task Materials ---

export async function getTaskMaterials(taskId: number): Promise<TaskMaterial[]> {
    const rows = await queryAll<TaskMaterialRow & { current_stock: number | null }>(
        `SELECT tm.*, i.quantity as current_stock
         FROM task_materials tm
         LEFT JOIN inventory_items i ON i.id = tm.inventory_id
         WHERE tm.task_id = ?
         ORDER BY tm.id`,
        [taskId],
    );
    return rows.map(toTaskMaterial);
}

export async function addTaskMaterial(
    taskId: number,
    data: {
        name: string;
        quantity_needed: number;
        unit?: string;
        inventory_id?: number;
        notes?: string;
    },
): Promise<TaskMaterial> {
    const result = await execute(
        `INSERT INTO task_materials (task_id, inventory_id, name, quantity_needed, unit, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [taskId, data.inventory_id ?? null, data.name, data.quantity_needed, data.unit ?? null, data.notes ?? null],
    );

    const row = await queryOne<TaskMaterialRow & { current_stock: number | null }>(
        `SELECT tm.*, i.quantity as current_stock
         FROM task_materials tm
         LEFT JOIN inventory_items i ON i.id = tm.inventory_id
         WHERE tm.id = ?`,
        [result.lastInsertRowid],
    );
    return toTaskMaterial(row!);
}

export async function removeTaskMaterial(id: number): Promise<boolean> {
    const result = await execute('DELETE FROM task_materials WHERE id = ?', [id]);
    return result.changes > 0;
}

export async function toggleMaterialPurchased(id: number, purchased: boolean): Promise<boolean> {
    const result = await execute(
        'UPDATE task_materials SET purchased = ? WHERE id = ?',
        [purchased ? 1 : 0, id],
    );
    return result.changes > 0;
}

// --- Shopping list ---

export async function getShoppingList(): Promise<ShoppingListItem[]> {
    const rows = await queryAll<{
        name: string;
        unit: string | null;
        total_needed: number;
        in_stock: number;
        task_titles: string;
        inventory_id: number | null;
    }>(
        `SELECT
            COALESCE(i.name, tm.name) as name,
            COALESCE(i.unit, tm.unit) as unit,
            SUM(tm.quantity_needed) as total_needed,
            COALESCE(i.quantity, 0) as in_stock,
            GROUP_CONCAT(DISTINCT t.title) as task_titles,
            tm.inventory_id
         FROM task_materials tm
         JOIN tasks t ON t.id = tm.task_id
         LEFT JOIN inventory_items i ON i.id = tm.inventory_id
         WHERE tm.purchased = 0 AND t.status != 'done'
         GROUP BY COALESCE(i.id, tm.name), COALESCE(i.unit, tm.unit)
         ORDER BY name`,
        [],
    );

    return rows.map(row => {
        return {
            name: row.name,
            unit: row.unit,
            total_needed: row.total_needed,
            in_stock: row.in_stock,
            to_buy: Math.max(0, row.total_needed - row.in_stock),
            tasks: row.task_titles.split(','),
        };
    });
}

// --- Context for AI ---

export async function getInventoryContext(): Promise<string> {
    const lowStock = await listItems({ low_stock: true });
    if (lowStock.length === 0) return 'Brak alertów magazynowych.';

    const lines = lowStock.map(i =>
        `  ⚠️ ${i.name}: ${i.quantity}${i.unit ? ' ' + i.unit : ''} (min: ${i.min_quantity})`
    );
    return `ALERTY MAGAZYNOWE (niski stan):\n${lines.join('\n')}`;
}
