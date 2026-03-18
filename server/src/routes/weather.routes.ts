import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getForecast } from '../services/weather.service.js';

const router = Router();

// All weather routes require authentication
router.use(authMiddleware);

/**
 * GET /api/weather/forecast
 * 7-day weather forecast for Tolkmicko
 */
router.get('/forecast', async (_req, res) => {
    try {
        const forecast = await getForecast();
        res.json(forecast);
    } catch (error) {
        console.error('[Weather] Error:', error);
        res.status(502).json({ error: 'Nie udało się pobrać prognozy pogody' });
    }
});

export default router;
