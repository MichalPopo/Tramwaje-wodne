import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getWaterLevel } from '../services/water-level.service.js';

const router = Router();

// All water level routes require auth
router.use(authMiddleware);

/**
 * GET /api/water-level
 * Returns current water level data from IMGW + alerts
 */
router.get('/', async (_req, res) => {
    try {
        const result = await getWaterLevel();
        res.json(result);
    } catch (error) {
        console.error('[Water Level] Error:', error);
        res.status(502).json({
            error: 'Nie udało się pobrać danych o poziomie wody z IMGW',
            details: error instanceof Error ? error.message : 'Nieznany błąd',
        });
    }
});

export default router;
