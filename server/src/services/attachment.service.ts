import { queryAll, queryOne, execute } from '../db/database.js';

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

export async function listAttachments(taskId: number): Promise<Attachment[]> {
    return await queryAll<Attachment & { uploader_name: string | null }>(
        `SELECT a.*, u.name as uploader_name
         FROM attachments a
         LEFT JOIN users u ON u.id = a.uploaded_by
         WHERE a.task_id = ?
         ORDER BY a.created_at DESC`,
        [taskId],
    );
}

export async function getAttachment(id: number): Promise<AttachmentWithData | undefined> {
    // Filename stores relative path, but we store base64 in note field for simplicity
    // Actually let's use a dedicated column approach — store data in filename as base64
    const row = await queryOne<Attachment & { uploader_name: string | null }>(
        `SELECT a.*, u.name as uploader_name
         FROM attachments a
         LEFT JOIN users u ON u.id = a.uploaded_by
         WHERE a.id = ?`,
        [id],
    );
    if (!row) return undefined;

    return {
        ...row,
        data_base64: row.filename, // filename stores base64 data
    };
}

export async function createAttachment(
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
): Promise<Attachment> {
    const result = await execute(
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
    );

    return (await queryOne<Attachment & { uploader_name: string | null }>(
        `SELECT a.*, u.name as uploader_name
         FROM attachments a
         LEFT JOIN users u ON u.id = a.uploaded_by
         WHERE a.id = ?`,
        [result.lastInsertRowid],
    ))!;
}

export async function deleteAttachment(id: number): Promise<boolean> {
    const result = await execute('DELETE FROM attachments WHERE id = ?', [id]);
    return result.changes > 0;
}

export async function countAttachments(taskId: number): Promise<number> {
    const row = await queryOne<{ cnt: number }>(
        'SELECT COUNT(*) as cnt FROM attachments WHERE task_id = ?',
        [taskId],
    );
    return row?.cnt ?? 0;
}

export async function updateAttachmentTag(
    id: number,
    tag: 'before' | 'after' | 'progress' | null,
): Promise<boolean> {
    const result = await execute('UPDATE attachments SET tag = ? WHERE id = ?', [tag, id]);
    return result.changes > 0;
}

/**
 * Get all photo attachments for a ship, across all tasks, ordered by date (timeline).
 */
export async function getShipPhotoTimeline(
    shipId: number,
): Promise<(Attachment & { task_title: string; task_status: string })[]> {
    return await queryAll<Attachment & { task_title: string; task_status: string }>(
        `SELECT a.*, u.name as uploader_name,
                t.title as task_title, t.status as task_status
         FROM attachments a
         LEFT JOIN users u ON u.id = a.uploaded_by
         JOIN tasks t ON t.id = a.task_id
         WHERE t.ship_id = ? AND a.type = 'photo'
         ORDER BY a.created_at ASC`,
        [shipId],
    );
}

/**
 * Get before/after photo pairs for a task.
 * Returns arrays of before and after photos.
 */
export async function getBeforeAfterPairs(
    taskId: number,
): Promise<{ before: Attachment[]; after: Attachment[]; progress: Attachment[]; untagged: Attachment[] }> {
    const all = (await listAttachments(taskId)).filter(a => a.type === 'photo');
    return {
        before: all.filter(a => a.tag === 'before'),
        after: all.filter(a => a.tag === 'after'),
        progress: all.filter(a => a.tag === 'progress'),
        untagged: all.filter(a => !a.tag),
    };
}
