import { Router, Request, Response } from 'express';
import { authMiddleware, roleGuard } from '../middleware/auth.js';
import { queryAll, queryOne, execute } from '../db/database.js';

const router = Router();

router.use(authMiddleware);

interface ShipRow {
    id: number;
    name: string;
    short_name: string;
    specs: string;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

/**
 * GET /api/ships
 * List all ships with specs
 */
router.get('/', (_req: Request, res: Response) => {
    const ships = queryAll<ShipRow>('SELECT * FROM ships ORDER BY id');
    const result = ships.map(s => ({
        ...s,
        specs: JSON.parse(s.specs || '{}'),
    }));
    res.json({ ships: result });
});

/**
 * GET /api/ships/:id
 * Single ship detail
 */
router.get('/:id', (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
        res.status(400).json({ error: 'Nieprawidłowe ID statku' });
        return;
    }

    const ship = queryOne<ShipRow>('SELECT * FROM ships WHERE id = ?', [id]);
    if (!ship) {
        res.status(404).json({ error: 'Statek nie znaleziony' });
        return;
    }

    const taskStats = queryOne<{ total: number; done: number; in_progress: number }>(
        `SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done,
            SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress
         FROM tasks WHERE ship_id = ?`, [id],
    );

    res.json({
        ship: {
            ...ship,
            specs: JSON.parse(ship.specs || '{}'),
            task_stats: taskStats,
        },
    });
});

/**
 * POST /api/ships
 * Create a new ship (admin only)
 */
router.post('/', roleGuard('admin'), (req: Request, res: Response) => {
    const { name, short_name, specs, notes } = req.body;

    if (!name || !short_name) {
        res.status(400).json({ error: 'Nazwa i skrót są wymagane' });
        return;
    }

    const specsJson = typeof specs === 'string' ? specs : JSON.stringify(specs || {});

    const result = execute(
        `INSERT INTO ships (name, short_name, specs, notes) VALUES (?, ?, ?, ?)`,
        [name, short_name, specsJson, notes || null],
    );

    const ship = queryOne<ShipRow>('SELECT * FROM ships WHERE id = ?', [result.lastInsertRowid]);

    res.status(201).json({
        ship: {
            ...ship!,
            specs: JSON.parse(ship!.specs || '{}'),
        },
    });
});

/**
 * PUT /api/ships/:id
 * Update ship data (admin only)
 */
router.put('/:id', roleGuard('admin'), (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
        res.status(400).json({ error: 'Nieprawidłowe ID statku' });
        return;
    }

    const existing = queryOne<ShipRow>('SELECT * FROM ships WHERE id = ?', [id]);
    if (!existing) {
        res.status(404).json({ error: 'Statek nie znaleziony' });
        return;
    }

    const { name, short_name, specs, notes } = req.body;

    const newName = name ?? existing.name;
    const newShortName = short_name ?? existing.short_name;
    const newSpecs = specs !== undefined
        ? (typeof specs === 'string' ? specs : JSON.stringify(specs))
        : existing.specs;
    const newNotes = notes !== undefined ? notes : existing.notes;

    execute(
        `UPDATE ships SET name = ?, short_name = ?, specs = ?, notes = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [newName, newShortName, newSpecs, newNotes, id],
    );

    const ship = queryOne<ShipRow>('SELECT * FROM ships WHERE id = ?', [id]);

    res.json({
        ship: {
            ...ship!,
            specs: JSON.parse(ship!.specs || '{}'),
        },
    });
});

/**
 * DELETE /api/ships/:id
 * Delete ship (admin only, only if no tasks)
 */
router.delete('/:id', roleGuard('admin'), (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
        res.status(400).json({ error: 'Nieprawidłowe ID statku' });
        return;
    }

    const existing = queryOne<ShipRow>('SELECT * FROM ships WHERE id = ?', [id]);
    if (!existing) {
        res.status(404).json({ error: 'Statek nie znaleziony' });
        return;
    }

    // Check if ship has assigned tasks
    const taskCount = queryOne<{ cnt: number }>(
        'SELECT COUNT(*) as cnt FROM tasks WHERE ship_id = ?', [id],
    );

    if (taskCount && taskCount.cnt > 0) {
        res.status(409).json({
            error: `Nie można usunąć — statek ma ${taskCount.cnt} przypisanych zadań. Najpierw przenieś lub usuń zadania.`,
        });
        return;
    }

    execute('DELETE FROM ships WHERE id = ?', [id]);
    res.json({ deleted: true });
});

export default router;
