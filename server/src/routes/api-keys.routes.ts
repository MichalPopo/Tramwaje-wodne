import { Router } from 'express';
import { authMiddleware, roleGuard } from '../middleware/auth.js';
import { listKeys, addKey, removeKey, toggleKey, clearCooldown } from '../services/key-pool.service.js';
import { z, ZodError } from 'zod';

const router = Router();
router.use(authMiddleware);
router.use(roleGuard('admin'));

/**
 * GET /api/api-keys
 * List all API keys (masked)
 */
router.get('/', (_req, res) => {
    const keys = listKeys();
    res.json({ keys });
});

/**
 * POST /api/api-keys
 * Add a new API key
 */
const addSchema = z.object({
    api_key: z.string().min(10).max(200),
    label: z.string().max(100).optional(),
});

router.post('/', (req, res) => {
    try {
        const data = addSchema.parse(req.body);
        const key = addKey(data.api_key, data.label || '');
        res.status(201).json({ key });
    } catch (error) {
        if (error instanceof ZodError) {
            res.status(400).json({ error: 'Nieprawidłowy klucz API' });
            return;
        }
        // Duplicate key
        if ((error as Error).message?.includes('UNIQUE')) {
            res.status(409).json({ error: 'Ten klucz API już istnieje' });
            return;
        }
        res.status(500).json({ error: 'Błąd serwera' });
    }
});

/**
 * DELETE /api/api-keys/:id
 */
router.delete('/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: 'Nieprawidłowe ID' }); return; }
    const deleted = removeKey(id);
    if (!deleted) { res.status(404).json({ error: 'Klucz nie znaleziony' }); return; }
    res.status(204).send();
});

/**
 * PATCH /api/api-keys/:id/toggle
 */
router.patch('/:id/toggle', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: 'Nieprawidłowe ID' }); return; }
    const { active } = req.body;
    const updated = toggleKey(id, !!active);
    if (!updated) { res.status(404).json({ error: 'Klucz nie znaleziony' }); return; }
    res.json({ success: true });
});

/**
 * POST /api/api-keys/:id/clear-cooldown
 */
router.post('/:id/clear-cooldown', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: 'Nieprawidłowe ID' }); return; }
    const cleared = clearCooldown(id);
    if (!cleared) { res.status(404).json({ error: 'Klucz nie znaleziony' }); return; }
    res.json({ success: true });
});

export default router;
