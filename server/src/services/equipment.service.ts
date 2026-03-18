import { queryAll, queryOne, execute } from '../db/database.js';

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

export async function listEquipment(filters?: { ship_id?: number; type?: string }): Promise<EquipmentRow[]> {
    let sql = `SELECT e.*, s.short_name AS ship_name
               FROM equipment e
               LEFT JOIN ships s ON e.ship_id = s.id
               WHERE 1=1`;
    const params: any[] = [];
    if (filters?.ship_id) { sql += ' AND e.ship_id = ?'; params.push(filters.ship_id); }
    if (filters?.type) { sql += ' AND e.type = ?'; params.push(filters.type); }
    sql += ' ORDER BY s.short_name, e.name';
    return await queryAll<EquipmentRow>(sql, params);
}

export async function getEquipment(id: number): Promise<EquipmentRow | undefined> {
    return await queryOne<EquipmentRow>(
        `SELECT e.*, s.short_name AS ship_name
         FROM equipment e LEFT JOIN ships s ON e.ship_id = s.id
         WHERE e.id = ?`, [id]);
}

export async function createEquipment(data: {
    name: string; type?: string; ship_id?: number | null;
    model?: string; serial_number?: string; location?: string; notes?: string;
}): Promise<EquipmentRow | undefined> {
    await execute(
        `INSERT INTO equipment (name, type, ship_id, model, serial_number, location, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [data.name, data.type || 'other', data.ship_id ?? null,
        data.model ?? null, data.serial_number ?? null, data.location ?? null, data.notes ?? null]);
    return await queryOne<EquipmentRow>(
        `SELECT e.*, s.short_name AS ship_name FROM equipment e LEFT JOIN ships s ON e.ship_id = s.id
         WHERE e.id = last_insert_rowid()`, []);
}

export async function updateEquipment(id: number, data: Partial<{
    name: string; type: string; ship_id: number | null;
    model: string; serial_number: string; location: string; notes: string;
}>): Promise<EquipmentRow | undefined> {
    const existing = await getEquipment(id);
    if (!existing) return undefined;
    await execute(
        `UPDATE equipment SET name=?, type=?, ship_id=?, model=?, serial_number=?, location=?, notes=? WHERE id=?`,
        [data.name ?? existing.name, data.type ?? existing.type, data.ship_id !== undefined ? data.ship_id : existing.ship_id,
        data.model ?? existing.model, data.serial_number ?? existing.serial_number,
        data.location ?? existing.location, data.notes ?? existing.notes, id]);
    return await getEquipment(id);
}

export async function deleteEquipment(id: number): Promise<boolean> {
    const existing = await getEquipment(id);
    if (!existing) return false;
    await execute('DELETE FROM equipment WHERE id = ?', [id]);
    return true;
}

// ========================
// INSTRUCTIONS CRUD
// ========================

export async function listInstructions(filters?: { equipment_id?: number }): Promise<InstructionRow[]> {
    let sql = `SELECT i.*, e.name AS equipment_name, u.name AS author_name,
                      (SELECT COUNT(*) FROM instruction_steps s WHERE s.instruction_id = i.id) AS step_count
               FROM instructions i
               LEFT JOIN equipment e ON i.equipment_id = e.id
               LEFT JOIN users u ON i.created_by = u.id
               WHERE 1=1`;
    const params: any[] = [];
    if (filters?.equipment_id) { sql += ' AND i.equipment_id = ?'; params.push(filters.equipment_id); }
    sql += ' ORDER BY i.created_at DESC';
    return await queryAll<InstructionRow>(sql, params);
}

export async function getInstruction(id: number): Promise<(InstructionRow & { steps: InstructionStepRow[] }) | undefined> {
    const instruction = await queryOne<InstructionRow>(
        `SELECT i.*, e.name AS equipment_name, u.name AS author_name
         FROM instructions i
         LEFT JOIN equipment e ON i.equipment_id = e.id
         LEFT JOIN users u ON i.created_by = u.id
         WHERE i.id = ?`, [id]);
    if (!instruction) return undefined;
    const steps = await queryAll<InstructionStepRow>(
        'SELECT * FROM instruction_steps WHERE instruction_id = ? ORDER BY step_number', [id]);
    return { ...instruction, steps };
}

export async function createInstruction(data: {
    title: string; equipment_id?: number | null; description?: string; created_by?: number;
    steps: { text: string; image_base64?: string }[];
}): Promise<InstructionRow | undefined> {
    await execute(
        `INSERT INTO instructions (title, equipment_id, description, created_by)
         VALUES (?, ?, ?, ?)`,
        [data.title, data.equipment_id ?? null, data.description ?? null, data.created_by ?? null]);
    const instrRow = await queryOne<{ id: number }>('SELECT last_insert_rowid() as id', []);
    const instrId = instrRow?.id;
    if (!instrId) return undefined;
    for (let i = 0; i < data.steps.length; i++) {
        const step = data.steps[i];
        await execute(
            `INSERT INTO instruction_steps (instruction_id, step_number, text, image_base64)
             VALUES (?, ?, ?, ?)`,
            [instrId, i + 1, step.text, step.image_base64 ?? null]);
    }
    return await queryOne<InstructionRow>(
        `SELECT i.*, e.name AS equipment_name, u.name AS author_name,
                (SELECT COUNT(*) FROM instruction_steps s WHERE s.instruction_id = i.id) AS step_count
         FROM instructions i LEFT JOIN equipment e ON i.equipment_id = e.id
         LEFT JOIN users u ON i.created_by = u.id WHERE i.id = ?`, [instrId]);
}

export async function deleteInstruction(id: number): Promise<boolean> {
    const existing = await queryOne<{ id: number }>('SELECT id FROM instructions WHERE id = ?', [id]);
    if (!existing) return false;
    await execute('DELETE FROM instruction_steps WHERE instruction_id = ?', [id]);
    await execute('DELETE FROM instructions WHERE id = ?', [id]);
    return true;
}

// ========================
// AI CONTEXT
// ========================

export async function getEquipmentContext(): Promise<string> {
    const equipment = await queryAll<EquipmentRow>(
        `SELECT e.*, s.short_name AS ship_name FROM equipment e LEFT JOIN ships s ON e.ship_id = s.id ORDER BY e.name`,
        []);
    const instructions = await queryAll<InstructionRow>(
        `SELECT i.title, e.name AS equipment_name FROM instructions i LEFT JOIN equipment e ON i.equipment_id = e.id`,
        []);

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
