import { queryAll, queryOne, execute } from '../db/database.js';
import type { Database } from 'sql.js';

// --- Types ---

export interface CertificateRow {
    id: number;
    ship_id: number | null;
    name: string;
    issuer: string | null;
    number: string | null;
    issue_date: string | null;
    expiry_date: string;
    notes: string | null;
    status: 'active' | 'expired' | 'renewed';
    created_at: string;
    updated_at: string;
}

export interface InspectionTemplateRow {
    id: number;
    name: string;
    ship_id: number | null;
    items: string; // JSON
    created_at: string;
}

export interface InspectionRow {
    id: number;
    template_id: number;
    ship_id: number | null;
    inspector_id: number;
    results: string; // JSON
    date: string;
    notes: string | null;
    created_at: string;
}

// --- Certificates ---

export interface CertificateFilters {
    ship_id?: number;
    status?: string;
}

export function listCertificates(filters: CertificateFilters = {}, db?: Database) {
    let sql = 'SELECT c.*, s.short_name as ship_name FROM certificates c LEFT JOIN ships s ON s.id = c.ship_id WHERE 1=1';
    const params: unknown[] = [];

    if (filters.ship_id) {
        sql += ' AND c.ship_id = ?';
        params.push(filters.ship_id);
    }
    if (filters.status) {
        sql += ' AND c.status = ?';
        params.push(filters.status);
    }

    sql += ' ORDER BY c.expiry_date ASC';

    return queryAll<CertificateRow & { ship_name: string | null }>(sql, params, db);
}

export function getCertificate(id: number, db?: Database) {
    return queryOne<CertificateRow & { ship_name: string | null }>(
        'SELECT c.*, s.short_name as ship_name FROM certificates c LEFT JOIN ships s ON s.id = c.ship_id WHERE c.id = ?',
        [id], db,
    );
}

export function createCertificate(data: {
    ship_id?: number | null;
    name: string;
    issuer?: string;
    number?: string;
    issue_date?: string;
    expiry_date: string;
    notes?: string;
}, db?: Database) {
    const result = execute(
        `INSERT INTO certificates (ship_id, name, issuer, number, issue_date, expiry_date, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            data.ship_id || null,
            data.name,
            data.issuer || null,
            data.number || null,
            data.issue_date || null,
            data.expiry_date,
            data.notes || null,
        ],
        db,
    );
    return getCertificate(result.lastInsertRowid, db);
}

export function updateCertificate(id: number, data: Partial<{
    ship_id: number | null;
    name: string;
    issuer: string | null;
    number: string | null;
    issue_date: string | null;
    expiry_date: string;
    notes: string | null;
    status: string;
}>, db?: Database) {
    const existing = getCertificate(id, db);
    if (!existing) return null;

    execute(
        `UPDATE certificates SET
            ship_id = ?, name = ?, issuer = ?, number = ?,
            issue_date = ?, expiry_date = ?, notes = ?, status = ?,
            updated_at = datetime('now')
         WHERE id = ?`,
        [
            data.ship_id !== undefined ? data.ship_id : existing.ship_id,
            data.name ?? existing.name,
            data.issuer !== undefined ? data.issuer : existing.issuer,
            data.number !== undefined ? data.number : existing.number,
            data.issue_date !== undefined ? data.issue_date : existing.issue_date,
            data.expiry_date ?? existing.expiry_date,
            data.notes !== undefined ? data.notes : existing.notes,
            data.status ?? existing.status,
            id,
        ],
        db,
    );
    return getCertificate(id, db);
}

export function deleteCertificate(id: number, db?: Database) {
    const existing = getCertificate(id, db);
    if (!existing) return false;
    execute('DELETE FROM certificates WHERE id = ?', [id], db);
    return true;
}

export function getExpiringCertificates(daysAhead: number = 30, db?: Database) {
    return queryAll<CertificateRow & { ship_name: string | null; days_remaining: number }>(
        `SELECT c.*, s.short_name as ship_name,
            CAST(julianday(c.expiry_date) - julianday('now') AS INTEGER) as days_remaining
         FROM certificates c
         LEFT JOIN ships s ON s.id = c.ship_id
         WHERE c.status = 'active'
           AND julianday(c.expiry_date) - julianday('now') <= ?
         ORDER BY c.expiry_date ASC`,
        [daysAhead], db,
    );
}

// --- Inspection Templates ---

export function listTemplates(shipId?: number, db?: Database) {
    if (shipId) {
        return queryAll<InspectionTemplateRow>(
            'SELECT * FROM inspection_templates WHERE ship_id = ? OR ship_id IS NULL ORDER BY name',
            [shipId], db,
        );
    }
    return queryAll<InspectionTemplateRow>(
        'SELECT * FROM inspection_templates ORDER BY name', [], db,
    );
}

export function getTemplate(id: number, db?: Database) {
    return queryOne<InspectionTemplateRow>(
        'SELECT * FROM inspection_templates WHERE id = ?', [id], db,
    );
}

export function createTemplate(data: {
    name: string;
    ship_id?: number | null;
    items: { label: string; required?: boolean }[];
}, db?: Database) {
    const result = execute(
        'INSERT INTO inspection_templates (name, ship_id, items) VALUES (?, ?, ?)',
        [data.name, data.ship_id || null, JSON.stringify(data.items)],
        db,
    );
    return getTemplate(result.lastInsertRowid, db);
}

export function deleteTemplate(id: number, db?: Database) {
    const existing = getTemplate(id, db);
    if (!existing) return false;
    execute('DELETE FROM inspection_templates WHERE id = ?', [id], db);
    return true;
}

// --- Inspections ---

export function listInspections(filters: { ship_id?: number; template_id?: number } = {}, db?: Database) {
    let sql = `SELECT i.*, it.name as template_name, s.short_name as ship_name, u.name as inspector_name
               FROM inspections i
               LEFT JOIN inspection_templates it ON it.id = i.template_id
               LEFT JOIN ships s ON s.id = i.ship_id
               LEFT JOIN users u ON u.id = i.inspector_id
               WHERE 1=1`;
    const params: unknown[] = [];

    if (filters.ship_id) {
        sql += ' AND i.ship_id = ?';
        params.push(filters.ship_id);
    }
    if (filters.template_id) {
        sql += ' AND i.template_id = ?';
        params.push(filters.template_id);
    }

    sql += ' ORDER BY i.date DESC';

    return queryAll<InspectionRow & { template_name: string; ship_name: string | null; inspector_name: string }>(
        sql, params, db,
    );
}

export function createInspection(data: {
    template_id: number;
    ship_id?: number | null;
    inspector_id: number;
    results: { label: string; ok: boolean; note?: string }[];
    date?: string;
    notes?: string;
}, db?: Database) {
    const result = execute(
        `INSERT INTO inspections (template_id, ship_id, inspector_id, results, date, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
            data.template_id,
            data.ship_id || null,
            data.inspector_id,
            JSON.stringify(data.results),
            data.date || new Date().toISOString().slice(0, 10),
            data.notes || null,
        ],
        db,
    );
    return queryOne<InspectionRow>(
        'SELECT * FROM inspections WHERE id = ?', [result.lastInsertRowid], db,
    );
}
