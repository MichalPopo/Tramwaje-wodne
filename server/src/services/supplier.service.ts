import { queryAll, queryOne, execute } from '../db/database.js';

// --- Types ---

interface SupplierRow {
    id: number;
    name: string;
    contact_person: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
    categories: string;
    notes: string | null;
    is_active: number;
    created_at: string;
    updated_at: string;
}

interface SupplierInventoryRow {
    id: number;
    supplier_id: number;
    inventory_id: number;
    unit_price: number | null;
    currency: string;
    notes: string | null;
}

export interface Supplier {
    id: number;
    name: string;
    contact_person: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
    categories: string[];
    notes: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface SupplierDetail extends Supplier {
    inventory_links: SupplierInventoryLink[];
}

export interface SupplierInventoryLink {
    id: number;
    supplier_id: number;
    inventory_id: number;
    inventory_name: string;
    inventory_category: string;
    unit_price: number | null;
    currency: string;
    notes: string | null;
}

export interface SupplierShoppingGroup {
    supplier_id: number;
    supplier_name: string;
    city: string | null;
    address: string | null;
    phone: string | null;
    items: {
        name: string;
        unit: string | null;
        to_buy: number;
        unit_price: number | null;
        estimated_cost: number | null;
        tasks: string[];
    }[];
    total_estimated_cost: number;
}

// --- Helpers ---

function toSupplier(row: SupplierRow): Supplier {
    let categories: string[] = [];
    try {
        categories = JSON.parse(row.categories);
    } catch { /* ignore */ }
    return {
        ...row,
        categories,
        is_active: Boolean(row.is_active),
    };
}

// --- CRUD ---

interface ListFilters {
    city?: string;
    category?: string;
    search?: string;
    is_active?: boolean;
}

export async function listSuppliers(filters: ListFilters = {}): Promise<Supplier[]> {
    let sql = 'SELECT * FROM suppliers WHERE 1=1';
    const params: (string | number | null)[] = [];

    if (filters.city) {
        sql += ' AND city = ?';
        params.push(filters.city);
    }
    if (filters.category) {
        sql += ' AND categories LIKE ?';
        const escaped = filters.category.replace(/[%_]/g, '\\$&');
        params.push(`%"${escaped}"%`);
    }
    if (filters.search) {
        sql += ' AND (name LIKE ? ESCAPE \'\\\' OR contact_person LIKE ? ESCAPE \'\\\' OR city LIKE ? ESCAPE \'\\\')';
        const escaped = filters.search.replace(/[%_]/g, '\\$&');
        params.push(`%${escaped}%`, `%${escaped}%`, `%${escaped}%`);
    }
    if (filters.is_active !== undefined) {
        sql += ' AND is_active = ?';
        params.push(filters.is_active ? 1 : 0);
    }

    sql += ' ORDER BY name';

    return (await queryAll<SupplierRow>(sql, params)).map(toSupplier);
}

export async function getSupplier(id: number): Promise<SupplierDetail | undefined> {
    const row = await queryOne<SupplierRow>('SELECT * FROM suppliers WHERE id = ?', [id]);
    if (!row) return undefined;

    const links = await queryAll<SupplierInventoryRow & { inventory_name: string; inventory_category: string }>(
        `SELECT si.*, i.name as inventory_name, i.category as inventory_category
         FROM supplier_inventory si
         JOIN inventory_items i ON i.id = si.inventory_id
         WHERE si.supplier_id = ?
         ORDER BY i.name`,
        [id],
    );

    return {
        ...toSupplier(row),
        inventory_links: links.map(l => ({
            id: l.id,
            supplier_id: l.supplier_id,
            inventory_id: l.inventory_id,
            inventory_name: l.inventory_name,
            inventory_category: l.inventory_category,
            unit_price: l.unit_price,
            currency: l.currency,
            notes: l.notes,
        })),
    };
}

export async function createSupplier(
    data: {
        name: string;
        contact_person?: string;
        phone?: string;
        email?: string;
        address?: string;
        city?: string;
        categories?: string[];
        notes?: string;
    },
): Promise<Supplier> {
    const result = await execute(
        `INSERT INTO suppliers (name, contact_person, phone, email, address, city, categories, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            data.name,
            data.contact_person ?? null,
            data.phone ?? null,
            data.email ?? null,
            data.address ?? null,
            data.city ?? null,
            JSON.stringify(data.categories ?? []),
            data.notes ?? null,
        ],
    );
    const row = await queryOne<SupplierRow>('SELECT * FROM suppliers WHERE id = ?', [result.lastInsertRowid]);
    return toSupplier(row!);
}

export async function updateSupplier(
    id: number,
    data: {
        name?: string;
        contact_person?: string | null;
        phone?: string | null;
        email?: string | null;
        address?: string | null;
        city?: string | null;
        categories?: string[];
        notes?: string | null;
        is_active?: boolean;
    },
): Promise<Supplier | undefined> {
    const existing = await queryOne<SupplierRow>('SELECT * FROM suppliers WHERE id = ?', [id]);
    if (!existing) return undefined;

    const updated = {
        name: data.name ?? existing.name,
        contact_person: data.contact_person !== undefined ? data.contact_person : existing.contact_person,
        phone: data.phone !== undefined ? data.phone : existing.phone,
        email: data.email !== undefined ? data.email : existing.email,
        address: data.address !== undefined ? data.address : existing.address,
        city: data.city !== undefined ? data.city : existing.city,
        categories: data.categories !== undefined ? JSON.stringify(data.categories) : existing.categories,
        notes: data.notes !== undefined ? data.notes : existing.notes,
        is_active: data.is_active !== undefined ? (data.is_active ? 1 : 0) : existing.is_active,
    };

    await execute(
        `UPDATE suppliers SET name=?, contact_person=?, phone=?, email=?, address=?, city=?, categories=?, notes=?, is_active=?
         WHERE id = ?`,
        [updated.name, updated.contact_person, updated.phone, updated.email, updated.address, updated.city, updated.categories, updated.notes, updated.is_active, id],
    );

    const row = await queryOne<SupplierRow>('SELECT * FROM suppliers WHERE id = ?', [id]);
    return row ? toSupplier(row) : undefined;
}

export async function deleteSupplier(id: number): Promise<boolean> {
    const result = await execute('DELETE FROM suppliers WHERE id = ?', [id]);
    return result.changes > 0;
}

// --- Inventory linking ---

export async function linkInventoryItem(
    supplierId: number,
    inventoryId: number,
    unitPrice?: number,
    notes?: string,
): Promise<SupplierInventoryLink | undefined> {
    // Check supplier exists
    const supplier = await queryOne<SupplierRow>('SELECT id FROM suppliers WHERE id = ?', [supplierId]);
    if (!supplier) return undefined;

    // Check inventory exists
    const inv = await queryOne<{ id: number }>('SELECT id FROM inventory_items WHERE id = ?', [inventoryId]);
    if (!inv) return undefined;

    const result = await execute(
        `INSERT OR IGNORE INTO supplier_inventory (supplier_id, inventory_id, unit_price, notes)
         VALUES (?, ?, ?, ?)`,
        [supplierId, inventoryId, unitPrice ?? null, notes ?? null],
    );

    if (result.changes === 0) return undefined; // duplicate

    const link = await queryOne<SupplierInventoryRow & { inventory_name: string; inventory_category: string }>(
        `SELECT si.*, i.name as inventory_name, i.category as inventory_category
         FROM supplier_inventory si
         JOIN inventory_items i ON i.id = si.inventory_id
         WHERE si.id = ?`,
        [result.lastInsertRowid],
    );

    return link ? {
        id: link.id,
        supplier_id: link.supplier_id,
        inventory_id: link.inventory_id,
        inventory_name: link.inventory_name,
        inventory_category: link.inventory_category,
        unit_price: link.unit_price,
        currency: link.currency,
        notes: link.notes,
    } : undefined;
}

export async function unlinkInventoryItem(linkId: number): Promise<boolean> {
    const result = await execute('DELETE FROM supplier_inventory WHERE id = ?', [linkId]);
    return result.changes > 0;
}

// --- Shopping list by supplier ---

export async function getShoppingListBySupplier(): Promise<SupplierShoppingGroup[]> {
    // Get all unpurchased task materials that have inventory links to suppliers
    const rows = await queryAll<{
        supplier_id: number;
        supplier_name: string;
        city: string | null;
        address: string | null;
        phone: string | null;
        item_name: string;
        unit: string | null;
        total_needed: number;
        in_stock: number;
        unit_price: number | null;
        task_titles: string;
    }>(
        `SELECT
            s.id as supplier_id,
            s.name as supplier_name,
            s.city,
            s.address,
            s.phone,
            i.name as item_name,
            i.unit,
            SUM(tm.quantity_needed) as total_needed,
            COALESCE(i.quantity, 0) as in_stock,
            si.unit_price,
            GROUP_CONCAT(DISTINCT t.title) as task_titles
         FROM task_materials tm
         JOIN tasks t ON t.id = tm.task_id
         JOIN inventory_items i ON i.id = tm.inventory_id
         JOIN supplier_inventory si ON si.inventory_id = i.id
         JOIN suppliers s ON s.id = si.supplier_id
         WHERE tm.purchased = 0 AND t.status != 'done' AND s.is_active = 1
         GROUP BY s.id, i.id, si.unit_price
         ORDER BY s.name, i.name`,
        [],
    );

    // Group by supplier
    const groupMap = new Map<number, SupplierShoppingGroup>();

    for (const row of rows) {
        const toBuy = Math.max(0, row.total_needed - row.in_stock);
        if (toBuy <= 0) continue;

        let group = groupMap.get(row.supplier_id);
        if (!group) {
            group = {
                supplier_id: row.supplier_id,
                supplier_name: row.supplier_name,
                city: row.city,
                address: row.address,
                phone: row.phone,
                items: [],
                total_estimated_cost: 0,
            };
            groupMap.set(row.supplier_id, group);
        }

        const estimatedCost = row.unit_price ? toBuy * row.unit_price : null;
        group.items.push({
            name: row.item_name,
            unit: row.unit,
            to_buy: toBuy,
            unit_price: row.unit_price,
            estimated_cost: estimatedCost,
            tasks: row.task_titles.split(','),
        });

        if (estimatedCost) {
            group.total_estimated_cost += estimatedCost;
        }
    }

    return Array.from(groupMap.values());
}

// --- AI Context ---

export async function getSupplierContext(): Promise<string> {
    const suppliers = await listSuppliers({ is_active: true });
    if (suppliers.length === 0) return '';

    const lines = suppliers.map(s => {
        const cats = s.categories.join(', ');
        return `  🏪 ${s.name} (${s.city || 'brak miasta'}) — kategorie: ${cats}${s.phone ? ', tel: ' + s.phone : ''}`;
    });

    return `\nDOSTAWCY:\n${lines.join('\n')}`;
}
