import { queryAll, queryOne, execute } from '../db/database.js';
import type { Database } from 'sql.js';

// --- Types ---
export interface EquipmentRow {
    id: number;
    name: string;
    type: string;
    ship_id: number | null;
    model: string | null;
    serial_number: string | null;
    location: string | null;
    notes: string | null;
    ship_name?: string | null;
    created_at: string;
    updated_at: string;
}

export interface InstructionRow {
    id: number;
    title: string;
    equipment_id: number | null;
    description: string | null;
    created_by: number | null;
    equipment_name?: string | null;
    author_name?: string | null;
    step_count?: number;
    created_at: string;
    updated_at: string;
}

export interface InstructionStepRow {
    id: number;
    instruction_id: number;
    step_number: number;
    text: string;
    image_base64: string | null;
    created_at: string;
}

// ========================
// EQUIPMENT CRUD
// ========================

export function listEquipment(filters?: { ship_id?: number; type?: string }, db?: Database): EquipmentRow[] {
    let sql = `SELECT e.*, s.short_name AS ship_name
               FROM equipment e
               LEFT JOIN ships s ON e.ship_id = s.id
               WHERE 1=1`;
    const params: any[] = [];
    if (filters?.ship_id) { sql += ' AND e.ship_id = ?'; params.push(filters.ship_id); }
    if (filters?.type) { sql += ' AND e.type = ?'; params.push(filters.type); }
    sql += ' ORDER BY s.short_name, e.name';
    return queryAll<EquipmentRow>(sql, params, db);
}

export function getEquipment(id: number, db?: Database): EquipmentRow | undefined {
    return queryOne<EquipmentRow>(
        `SELECT e.*, s.short_name AS ship_name
         FROM equipment e LEFT JOIN ships s ON e.ship_id = s.id
         WHERE e.id = ?`, [id], db);
}

export function createEquipment(data: {
    name: string; type?: string; ship_id?: number | null;
    model?: string; serial_number?: string; location?: string; notes?: string;
}, db?: Database): EquipmentRow | undefined {
    execute(
        `INSERT INTO equipment (name, type, ship_id, model, serial_number, location, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [data.name, data.type || 'other', data.ship_id ?? null,
        data.model ?? null, data.serial_number ?? null, data.location ?? null, data.notes ?? null], db);
    return queryOne<EquipmentRow>(
        `SELECT e.*, s.short_name AS ship_name FROM equipment e LEFT JOIN ships s ON e.ship_id = s.id
         WHERE e.id = last_insert_rowid()`, [], db);
}

export function updateEquipment(id: number, data: Partial<{
    name: string; type: string; ship_id: number | null;
    model: string; serial_number: string; location: string; notes: string;
}>, db?: Database): EquipmentRow | undefined {
    const existing = getEquipment(id, db);
    if (!existing) return undefined;
    execute(
        `UPDATE equipment SET name=?, type=?, ship_id=?, model=?, serial_number=?, location=?, notes=? WHERE id=?`,
        [data.name ?? existing.name, data.type ?? existing.type, data.ship_id !== undefined ? data.ship_id : existing.ship_id,
        data.model ?? existing.model, data.serial_number ?? existing.serial_number,
        data.location ?? existing.location, data.notes ?? existing.notes, id], db);
    return getEquipment(id, db);
}

export function deleteEquipment(id: number, db?: Database): boolean {
    const existing = getEquipment(id, db);
    if (!existing) return false;
    execute('DELETE FROM equipment WHERE id = ?', [id], db);
    return true;
}

// ========================
// INSTRUCTIONS CRUD
// ========================

export function listInstructions(filters?: { equipment_id?: number }, db?: Database): InstructionRow[] {
    let sql = `SELECT i.*, e.name AS equipment_name, u.name AS author_name,
                      (SELECT COUNT(*) FROM instruction_steps s WHERE s.instruction_id = i.id) AS step_count
               FROM instructions i
               LEFT JOIN equipment e ON i.equipment_id = e.id
               LEFT JOIN users u ON i.created_by = u.id
               WHERE 1=1`;
    const params: any[] = [];
    if (filters?.equipment_id) { sql += ' AND i.equipment_id = ?'; params.push(filters.equipment_id); }
    sql += ' ORDER BY i.created_at DESC';
    return queryAll<InstructionRow>(sql, params, db);
}

export function getInstruction(id: number, db?: Database): (InstructionRow & { steps: InstructionStepRow[] }) | undefined {
    const instruction = queryOne<InstructionRow>(
        `SELECT i.*, e.name AS equipment_name, u.name AS author_name
         FROM instructions i
         LEFT JOIN equipment e ON i.equipment_id = e.id
         LEFT JOIN users u ON i.created_by = u.id
         WHERE i.id = ?`, [id], db);
    if (!instruction) return undefined;
    const steps = queryAll<InstructionStepRow>(
        'SELECT * FROM instruction_steps WHERE instruction_id = ? ORDER BY step_number', [id], db);
    return { ...instruction, steps };
}

export function createInstruction(data: {
    title: string; equipment_id?: number | null; description?: string; created_by?: number;
    steps: { text: string; image_base64?: string }[];
}, db?: Database): InstructionRow | undefined {
    execute(
        `INSERT INTO instructions (title, equipment_id, description, created_by)
         VALUES (?, ?, ?, ?)`,
        [data.title, data.equipment_id ?? null, data.description ?? null, data.created_by ?? null], db);
    const instrId = queryOne<{ id: number }>('SELECT last_insert_rowid() as id', [], db)?.id;
    if (!instrId) return undefined;
    data.steps.forEach((step, i) => {
        execute(
            `INSERT INTO instruction_steps (instruction_id, step_number, text, image_base64)
             VALUES (?, ?, ?, ?)`,
            [instrId, i + 1, step.text, step.image_base64 ?? null], db);
    });
    return queryOne<InstructionRow>(
        `SELECT i.*, e.name AS equipment_name, u.name AS author_name,
                (SELECT COUNT(*) FROM instruction_steps s WHERE s.instruction_id = i.id) AS step_count
         FROM instructions i LEFT JOIN equipment e ON i.equipment_id = e.id
         LEFT JOIN users u ON i.created_by = u.id WHERE i.id = ?`, [instrId], db);
}

export function deleteInstruction(id: number, db?: Database): boolean {
    const existing = queryOne<{ id: number }>('SELECT id FROM instructions WHERE id = ?', [id], db);
    if (!existing) return false;
    execute('DELETE FROM instruction_steps WHERE instruction_id = ?', [id], db);
    execute('DELETE FROM instructions WHERE id = ?', [id], db);
    return true;
}

// ========================
// AI CONTEXT
// ========================

export function getEquipmentContext(db?: Database): string {
    const equipment = queryAll<EquipmentRow>(
        `SELECT e.*, s.short_name AS ship_name FROM equipment e LEFT JOIN ships s ON e.ship_id = s.id ORDER BY e.name`,
        [], db);
    const instructions = queryAll<InstructionRow>(
        `SELECT i.title, e.name AS equipment_name FROM instructions i LEFT JOIN equipment e ON i.equipment_id = e.id`,
        [], db);

    if (equipment.length === 0) return '';

    let ctx = '\n\n## Urządzenia na statkach\n';
    for (const eq of equipment) {
        ctx += `- ${eq.name} (${eq.type})${eq.ship_name ? ` — ${eq.ship_name}` : ''}`;
        if (eq.model) ctx += `, model: ${eq.model}`;
        if (eq.serial_number) ctx += `, SN: ${eq.serial_number}`;
        if (eq.location) ctx += `, lokalizacja: ${eq.location}`;
        ctx += '\n';
    }

    if (instructions.length > 0) {
        ctx += '\n## Instrukcje obsługi (baza wiedzy)\n';
        for (const instr of instructions) {
            ctx += `- "${instr.title}"${instr.equipment_name ? ` (${instr.equipment_name})` : ''}\n`;
        }
        ctx += '\nGdy pracownik pyta o obsługę sprzętu, odpowiadaj na podstawie tych instrukcji.\n';
    }

    return ctx;
}
