import { Router } from 'express';
import { authMiddleware, roleGuard } from '../middleware/auth.js';
import {
    listTanks, getTank, createTank, updateTank,
    logTankChange, getTankLogs, getTankAlerts,
    getConsumptionStats,
} from '../services/tanks.service.js';

const router = Router();

router.use(authMiddleware);

/**
 * GET /api/tanks
 * List all tanks, optionally filtered by ship or type
 */
router.get('/', (req, res) => {
    const ship_id = req.query.ship_id ? parseInt(req.query.ship_id as string, 10) : undefined;
    const type = req.query.type as string | undefined;
    const tanks = listTanks({ ship_id, type });
    res.json({ tanks });
});

/**
 * GET /api/tanks/alerts
 * Get all tank alerts
 */
router.get('/alerts', (_req, res) => {
    const alerts = getTankAlerts();
    res.json({ alerts });
});

/**
 * GET /api/tanks/:id
 * Get a single tank
 */
router.get('/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const tank = getTank(id);
    if (!tank) return res.status(404).json({ error: 'Zbiornik nie znaleziony' });
    res.json(tank);
});

/**
 * POST /api/tanks
 * Create a new tank (admin only)
 * Body: { ship_id, type, name, capacity, current_level?, alert_threshold?, unit? }
 */
router.post('/', roleGuard('admin'), (req, res) => {
    const { ship_id, type, name, capacity } = req.body;
    if (!ship_id || !type || !name || !capacity) {
        return res.status(400).json({ error: 'ship_id, type, name i capacity są wymagane' });
    }

    const tank = createTank(req.body);
    if (!tank) return res.status(404).json({ error: 'Statek nie znaleziony' });
    res.status(201).json(tank);
});

/**
 * PUT /api/tanks/:id
 * Update a tank (admin only)
 * Body: { name?, capacity?, current_level?, alert_threshold?, unit? }
 */
router.put('/:id', roleGuard('admin'), (req, res) => {
    const id = parseInt(req.params.id, 10);
    const tank = updateTank(id, req.body);
    if (!tank) return res.status(404).json({ error: 'Zbiornik nie znaleziony' });
    res.json(tank);
});

/**
 * POST /api/tanks/:id/log
 * Log a level change (refill, consumption, drain, manual)
 * Body: { change_amount, log_type, route_info?, notes? }
 */
router.post('/:id/log', (req, res) => {
    const tankId = parseInt(req.params.id, 10);
    const { change_amount, log_type } = req.body;

    if (typeof change_amount !== 'number' || !log_type) {
        return res.status(400).json({ error: 'change_amount i log_type są wymagane' });
    }

    const log = logTankChange({
        tank_id: tankId,
        change_amount,
        log_type,
        route_info: req.body.route_info,
        notes: req.body.notes,
        logged_by: req.user!.id,
    });

    if (!log) return res.status(404).json({ error: 'Zbiornik nie znaleziony' });
    res.status(201).json(log);
});

/**
 * GET /api/tanks/:id/logs
 * Get tank change logs
 */
router.get('/:id/logs', (req, res) => {
    const tankId = parseInt(req.params.id, 10);
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const logs = getTankLogs(tankId, limit);
    res.json({ logs });
});

/**
 * GET /api/tanks/:id/stats
 * Get consumption statistics for a tank
 */
router.get('/:id/stats', (req, res) => {
    const tankId = parseInt(req.params.id, 10);
    const stats = getConsumptionStats(tankId);
    res.json(stats);
});

export default router;
