import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
    listAttachments, getAttachment, createAttachment, deleteAttachment,
    updateAttachmentTag, getShipPhotoTimeline, getBeforeAfterPairs,
} from '../services/attachment.service.js';
import { z, ZodError } from 'zod';

const router = Router();
router.use(authMiddleware);

const uploadSchema = z.object({
    type: z.enum(['photo', 'document']),
    data_base64: z.string().min(100).max(10_000_000), // ~7.5MB max
    original_name: z.string().max(255).optional(),
    mime_type: z.string().max(100).optional(),
    note: z.string().max(500).optional(),
    tag: z.enum(['before', 'after', 'progress']).optional(),
});

/**
 * GET /api/tasks/:taskId/attachments
 */
router.get('/tasks/:taskId/attachments', async (req, res) => {
    const taskId = parseInt(req.params.taskId as string, 10);
    if (isNaN(taskId) || taskId <= 0) {
        res.status(400).json({ error: 'Nieprawidłowe ID zadania' });
        return;
    }
    const attachments = await listAttachments(taskId);
    res.json({ attachments });
});

/**
 * GET /api/attachments/:id
 * Returns attachment with base64 data
 */
router.get('/:id', async (req, res) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id) || id <= 0) {
        res.status(400).json({ error: 'Nieprawidłowe ID' });
        return;
    }

    const attachment = await getAttachment(id);
    if (!attachment) {
        res.status(404).json({ error: 'Załącznik nie znaleziony' });
        return;
    }

    res.json({ attachment });
});

/**
 * POST /api/tasks/:taskId/attachments
 * Upload attachment (photo/document as base64)
 */
router.post('/tasks/:taskId/attachments', async (req, res) => {
    const taskId = parseInt(req.params.taskId as string, 10);
    if (isNaN(taskId) || taskId <= 0) {
        res.status(400).json({ error: 'Nieprawidłowe ID zadania' });
        return;
    }

    try {
        const data = uploadSchema.parse(req.body);
        const attachment = await createAttachment(taskId, data, req.user!.id);
        res.status(201).json({ attachment });
    } catch (error) {
        if (error instanceof ZodError) {
            res.status(400).json({
                error: 'Błąd walidacji',
                details: error.errors.map(e => ({ field: e.path.join('.'), message: e.message })),
            });
            return;
        }
        res.status(500).json({ error: 'Wewnętrzny błąd serwera' });
    }
});

/**
 * DELETE /api/attachments/:id
 */
router.delete('/:id', async (req, res) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id) || id <= 0) {
        res.status(400).json({ error: 'Nieprawidłowe ID' });
        return;
    }

    // Check ownership: only uploader or admin can delete
    const attachment = await getAttachment(id);
    if (!attachment) {
        res.status(404).json({ error: 'Załącznik nie znaleziony' });
        return;
    }
    if (attachment.uploaded_by !== req.user!.id && req.user!.role !== 'admin') {
        res.status(403).json({ error: 'Brak uprawnień do usunięcia tego załącznika' });
        return;
    }

    await deleteAttachment(id);
    res.status(204).send();
});

/**
 * PATCH /api/attachments/:id/tag
 * Update attachment tag (before/after/progress/null)
 */
router.patch('/:id/tag', async (req, res) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id) || id <= 0) {
        res.status(400).json({ error: 'Nieprawidłowe ID' });
        return;
    }
    const { tag } = req.body;
    if (tag !== null && !['before', 'after', 'progress'].includes(tag)) {
        res.status(400).json({ error: 'Tag musi być: before, after, progress lub null' });
        return;
    }
    const updated = await updateAttachmentTag(id, tag);
    if (!updated) {
        res.status(404).json({ error: 'Załącznik nie znaleziony' });
        return;
    }
    res.json({ success: true });
});

/**
 * GET /api/attachments/timeline/:shipId
 * Get photo timeline for a ship
 */
router.get('/timeline/:shipId', async (req, res) => {
    const shipId = parseInt(req.params.shipId as string, 10);
    if (isNaN(shipId) || shipId <= 0) {
        res.status(400).json({ error: 'Nieprawidłowe ID statku' });
        return;
    }
    const photos = await getShipPhotoTimeline(shipId);
    // Strip base64 data from timeline response (send metadata only)
    const timeline = photos.map(({ filename, ...rest }) => rest);
    res.json({ timeline });
});

/**
 * GET /api/attachments/tasks/:taskId/before-after
 * Get before/after photo pairs for a task
 */
router.get('/tasks/:taskId/before-after', async (req, res) => {
    const taskId = parseInt(req.params.taskId as string, 10);
    if (isNaN(taskId) || taskId <= 0) {
        res.status(400).json({ error: 'Nieprawidłowe ID zadania' });
        return;
    }
    const pairs = await getBeforeAfterPairs(taskId);
    // Strip base64 from response
    const strip = (list: typeof pairs.before) => list.map(({ filename, ...rest }) => rest);
    res.json({
        before: strip(pairs.before),
        after: strip(pairs.after),
        progress: strip(pairs.progress),
        untagged: strip(pairs.untagged),
    });
});

export default router;
