import { queryAll, queryOne, execute } from '../db/database.js';
import type { Database } from 'sql.js';

// --- Types ---

export interface Attachment {
    id: number;
    task_id: number;
    type: string;
    filename: string;
    original_name: string | null;
    mime_type: string | null;
    note: string | null;
    tag: string | null;
    uploaded_by: number | null;
    uploader_name: string | null;
    created_at: string;
}

export interface AttachmentWithData extends Attachment {
    data_base64: string;
}

// --- Service ---

export function listAttachments(taskId: number, db?: Database): Attachment[] {
    return queryAll<Attachment & { uploader_name: string | null }>(
        `SELECT a.*, u.name as uploader_name
         FROM attachments a
         LEFT JOIN users u ON u.id = a.uploaded_by
         WHERE a.task_id = ?
         ORDER BY a.created_at DESC`,
        [taskId], db,
    );
}

export function getAttachment(id: number, db?: Database): AttachmentWithData | undefined {
    // Filename stores relative path, but we store base64 in note field for simplicity
    // Actually let's use a dedicated column approach — store data in filename as base64
    const row = queryOne<Attachment & { uploader_name: string | null }>(
        `SELECT a.*, u.name as uploader_name
         FROM attachments a
         LEFT JOIN users u ON u.id = a.uploaded_by
         WHERE a.id = ?`,
        [id], db,
    );
    if (!row) return undefined;

    return {
        ...row,
        data_base64: row.filename, // filename stores base64 data
    };
}

export function createAttachment(
    taskId: number,
    data: {
        type: 'photo' | 'document';
        data_base64: string;
        original_name?: string;
        mime_type?: string;
        note?: string;
        tag?: 'before' | 'after' | 'progress';
    },
    uploadedBy: number,
    db?: Database,
): Attachment {
    const result = execute(
        `INSERT INTO attachments (task_id, type, filename, original_name, mime_type, note, tag, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            taskId,
            data.type,
            data.data_base64, // store base64 in filename column
            data.original_name ?? `photo_${Date.now()}.jpg`,
            data.mime_type ?? 'image/jpeg',
            data.note ?? null,
            data.tag ?? null,
            uploadedBy,
        ],
        db,
    );

    return queryOne<Attachment & { uploader_name: string | null }>(
        `SELECT a.*, u.name as uploader_name
         FROM attachments a
         LEFT JOIN users u ON u.id = a.uploaded_by
         WHERE a.id = ?`,
        [result.lastInsertRowid], db,
    )!;
}

export function deleteAttachment(id: number, db?: Database): boolean {
    const result = execute('DELETE FROM attachments WHERE id = ?', [id], db);
    return result.changes > 0;
}

export function countAttachments(taskId: number, db?: Database): number {
    const row = queryOne<{ cnt: number }>(
        'SELECT COUNT(*) as cnt FROM attachments WHERE task_id = ?',
        [taskId], db,
    );
    return row?.cnt ?? 0;
}

export function updateAttachmentTag(
    id: number,
    tag: 'before' | 'after' | 'progress' | null,
    db?: Database,
): boolean {
    const result = execute('UPDATE attachments SET tag = ? WHERE id = ?', [tag, id], db);
    return result.changes > 0;
}

/**
 * Get all photo attachments for a ship, across all tasks, ordered by date (timeline).
 */
export function getShipPhotoTimeline(
    shipId: number,
    db?: Database,
): (Attachment & { task_title: string; task_status: string })[] {
    return queryAll<Attachment & { task_title: string; task_status: string }>(
        `SELECT a.*, u.name as uploader_name,
                t.title as task_title, t.status as task_status
         FROM attachments a
         LEFT JOIN users u ON u.id = a.uploaded_by
         JOIN tasks t ON t.id = a.task_id
         WHERE t.ship_id = ? AND a.type = 'photo'
         ORDER BY a.created_at ASC`,
        [shipId], db,
    );
}

/**
 * Get before/after photo pairs for a task.
 * Returns arrays of before and after photos.
 */
export function getBeforeAfterPairs(
    taskId: number,
    db?: Database,
): { before: Attachment[]; after: Attachment[]; progress: Attachment[]; untagged: Attachment[] } {
    const all = listAttachments(taskId, db).filter(a => a.type === 'photo');
    return {
        before: all.filter(a => a.tag === 'before'),
        after: all.filter(a => a.tag === 'after'),
        progress: all.filter(a => a.tag === 'progress'),
        untagged: all.filter(a => !a.tag),
    };
}
