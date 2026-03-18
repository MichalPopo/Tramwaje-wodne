import { Router } from 'express';
import { authMiddleware, roleGuard } from '../middleware/auth.js';
import { getConfig, setConfig } from '../services/config.service.js';
import { z, ZodError } from 'zod';

const router = Router();
router.use(authMiddleware);

/**
 * GET /api/config/:key
 * Get config value
 */
router.get('/:key', (req, res) => {
    const value = getConfig(req.params.key);
    if (value === undefined) {
        res.status(404).json({ error: 'Klucz nie znaleziony' });
        return;
    }
    res.json({ key: req.params.key, value });
});

/**
 * PUT /api/config/:key
 * 🔒 Admin only — update config value
 */
router.put('/:key', roleGuard('admin'), (req, res) => {
    try {
        const { value } = z.object({ value: z.string().min(1).max(1000) }).parse(req.body);
        setConfig(req.params.key, value);
        res.json({ key: req.params.key, value });
    } catch (error) {
        if (error instanceof ZodError) {
            res.status(400).json({ error: 'Wartość jest wymagana' });
            return;
        }
        res.status(500).json({ error: 'Wewnętrzny błąd serwera' });
    }
});

export default router;
