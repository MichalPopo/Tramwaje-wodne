import { Router } from 'express';
import { authMiddleware, roleGuard } from '../middleware/auth.js';
import {
    getTaskCosts,
    getShipCosts,
    getCategoryCosts,
    getSeasonSummary,
    getMonthlyTrend,
} from '../services/budget.service.js';
import { queryOne, execute } from '../db/database.js';

const router = Router();

// All budget endpoints require auth
router.use(authMiddleware);

// GET /api/budget/summary — season summary
router.get('/summary', (_req, res) => {
    const summary = getSeasonSummary();
    res.json(summary);
});

// GET /api/budget/by-ship — costs per ship
router.get('/by-ship', (_req, res) => {
    const costs = getShipCosts();
    res.json({ costs });
});

// GET /api/budget/by-category — costs per category
router.get('/by-category', (_req, res) => {
    const costs = getCategoryCosts();
    res.json({ costs });
});

// GET /api/budget/monthly — monthly trend
router.get('/monthly', (_req, res) => {
    const trend = getMonthlyTrend();
    res.json({ trend });
});

// GET /api/budget/tasks/:id — costs for specific task
router.get('/tasks/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid task ID' });
        return;
    }
    const cost = getTaskCosts(id);
    if (!cost) {
        res.status(404).json({ error: 'Task not found' });
        return;
    }
    res.json(cost);
});

// PUT /api/budget/config — update budget settings (admin only)
router.put('/config', roleGuard('admin'), (req, res) => {
    const { season_budget, hourly_rate } = req.body as { season_budget?: number; hourly_rate?: number };

    if (season_budget != null) {
        if (typeof season_budget !== 'number' || season_budget < 0) {
            res.status(400).json({ error: 'season_budget must be a non-negative number' });
            return;
        }
        const existing = queryOne<{ key: string }>('SELECT key FROM config WHERE key = ?', ['season_budget']);
        if (existing) {
            execute('UPDATE config SET value = ? WHERE key = ?', [String(season_budget), 'season_budget']);
        } else {
            execute('INSERT INTO config (key, value) VALUES (?, ?)', ['season_budget', String(season_budget)]);
        }
    }

    if (hourly_rate != null) {
        if (typeof hourly_rate !== 'number' || hourly_rate < 0) {
            res.status(400).json({ error: 'hourly_rate must be a non-negative number' });
            return;
        }
        const existing = queryOne<{ key: string }>('SELECT key FROM config WHERE key = ?', ['hourly_rate']);
        if (existing) {
            execute('UPDATE config SET value = ? WHERE key = ?', [String(hourly_rate), 'hourly_rate']);
        } else {
            execute('INSERT INTO config (key, value) VALUES (?, ?)', ['hourly_rate', String(hourly_rate)]);
        }
    }

    const summary = getSeasonSummary();
    res.json(summary);
});

// PATCH /api/budget/materials/:id — update actual purchase price
router.patch('/materials/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid material ID' });
        return;
    }
    const { actual_unit_price } = req.body as { actual_unit_price: number | null };
    if (actual_unit_price != null && (typeof actual_unit_price !== 'number' || actual_unit_price < 0)) {
        res.status(400).json({ error: 'actual_unit_price must be a non-negative number or null' });
        return;
    }
    execute(
        'UPDATE task_materials SET actual_unit_price = ? WHERE id = ?',
        [actual_unit_price, id]
    );
    res.json({ ok: true });
});

export default router;
