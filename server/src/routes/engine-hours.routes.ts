import { Router } from 'express';
import { authMiddleware, roleGuard } from '../middleware/auth.js';
import {
    listEngineHours, createEngineHours, updateHours, addHours,
    listServiceIntervals, createServiceInterval,
    logService, getServiceLogs, getServiceAlerts,
} from '../services/engine-hours.service.js';

const router = Router();

router.use(authMiddleware);

// ===== ENGINE HOURS =====

/**
 * GET /api/engine-hours
 * List all engine hours counters
 */
router.get('/', (_req, res) => {
    const entries = listEngineHours();
    res.json({ engine_hours: entries });
});

/**
 * POST /api/engine-hours
 * Create a new engine hours counter (admin only)
 * Body: { equipment_id: number, initial_hours?: number }
 */
router.post('/', roleGuard('admin'), (req, res) => {
    const { equipment_id, initial_hours } = req.body;
    if (!equipment_id || typeof equipment_id !== 'number') {
        return res.status(400).json({ error: 'equipment_id jest wymagany' });
    }

    const entry = createEngineHours(equipment_id, initial_hours ?? 0);
    if (!entry) {
        return res.status(404).json({ error: 'Urządzenie nie znalezione' });
    }
    res.status(201).json(entry);
});

/**
 * PUT /api/engine-hours/:equipmentId
 * Update engine hours (set absolute value)
 * Body: { hours: number }
 */
router.put('/:equipmentId', roleGuard('admin'), (req, res) => {
    const equipmentId = parseInt(req.params.equipmentId as string, 10);
    const { hours } = req.body;

    if (typeof hours !== 'number' || hours < 0) {
        return res.status(400).json({ error: 'hours musi być liczbą >= 0' });
    }

    const entry = updateHours(equipmentId, hours);
    if (!entry) {
        return res.status(404).json({ error: 'Licznik nie znaleziony' });
    }
    res.json(entry);
});

/**
 * POST /api/engine-hours/:equipmentId/add
 * Add hours to counter
 * Body: { hours: number }
 */
router.post('/:equipmentId/add', (req, res) => {
    const equipmentId = parseInt(req.params.equipmentId, 10);
    const { hours } = req.body;

    if (typeof hours !== 'number' || hours <= 0) {
        return res.status(400).json({ error: 'hours musi być liczbą > 0' });
    }

    const entry = addHours(equipmentId, hours);
    if (!entry) {
        return res.status(404).json({ error: 'Licznik nie znaleziony' });
    }
    res.json(entry);
});

// ===== SERVICE INTERVALS =====

/**
 * GET /api/engine-hours/service-intervals
 * List all service intervals, optionally filtered by equipment
 */
router.get('/service-intervals', (req, res) => {
    const equipmentId = req.query.equipment_id ? parseInt(req.query.equipment_id as string, 10) : undefined;
    const intervals = listServiceIntervals(equipmentId);
    res.json({ intervals });
});

/**
 * POST /api/engine-hours/service-intervals
 * Create a new service interval (admin only)
 * Body: { equipment_id, name, interval_hours, last_service_hours?, last_service_date?, notes? }
 */
router.post('/service-intervals', roleGuard('admin'), (req, res) => {
    const { equipment_id, name, interval_hours } = req.body;
    if (!equipment_id || !name || !interval_hours) {
        return res.status(400).json({ error: 'equipment_id, name i interval_hours są wymagane' });
    }

    const interval = createServiceInterval(req.body);
    if (!interval) {
        return res.status(404).json({ error: 'Urządzenie nie znalezione' });
    }
    res.status(201).json(interval);
});

// ===== SERVICE ALERTS =====

/**
 * GET /api/engine-hours/service-alerts
 * Get all service alerts (overdue + due soon)
 */
router.get('/service-alerts', (_req, res) => {
    const alerts = getServiceAlerts();
    res.json({ alerts });
});

// ===== SERVICE LOGS =====

/**
 * GET /api/engine-hours/service-logs
 * List service logs, optionally filtered by equipment
 */
router.get('/service-logs', (req, res) => {
    const equipmentId = req.query.equipment_id ? parseInt(req.query.equipment_id as string, 10) : undefined;
    const logs = getServiceLogs(equipmentId);
    res.json({ logs });
});

/**
 * POST /api/engine-hours/service-logs
 * Log a completed service
 * Body: { interval_id: number, notes?, performed_by? }
 */
router.post('/service-logs', (req, res) => {
    const { interval_id } = req.body;
    if (!interval_id || typeof interval_id !== 'number') {
        return res.status(400).json({ error: 'interval_id jest wymagany' });
    }

    const log = logService({
        interval_id,
        notes: req.body.notes,
        performed_by: req.body.performed_by ?? req.user!.id,
    });
    if (!log) {
        return res.status(404).json({ error: 'Interwał serwisowy nie znaleziony' });
    }
    res.status(201).json(log);
});

export default router;
