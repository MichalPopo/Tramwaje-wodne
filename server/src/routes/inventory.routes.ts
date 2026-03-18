import { Router } from 'express';
import { authMiddleware, roleGuard } from '../middleware/auth.js';
import {
    listItems, getItem, createItem, updateItem, deleteItem, adjustQuantity,
    getTaskMaterials, addTaskMaterial, removeTaskMaterial, toggleMaterialPurchased,
    getShoppingList,
} from '../services/inventory.service.js';
import { z, ZodError } from 'zod';

const router = Router();

// All inventory routes require auth
router.use(authMiddleware);

// --- Validation schemas ---

const createItemSchema = z.object({
    name: z.string().min(2).max(200),
    category: z.enum(['tool', 'material', 'part']),
    unit: z.string().max(20).optional(),
    quantity: z.number().min(0).optional(),
    min_quantity: z.number().min(0).optional(),
    location: z.string().max(200).optional(),
    ship_id: z.number().int().positive().optional(),
    notes: z.string().max(1000).optional(),
});

const updateItemSchema = createItemSchema.partial();

const adjustQuantitySchema = z.object({
    delta: z.number(),
    note: z.string().max(500).optional(),
});

const addMaterialSchema = z.object({
    name: z.string().min(2).max(200),
    quantity_needed: z.number().positive(),
    unit: z.string().max(20).optional(),
    inventory_id: z.number().int().positive().optional(),
    notes: z.string().max(500).optional(),
});

// --- Inventory CRUD ---

/**
 * GET /api/inventory
 * List all inventory items with optional filters
 */
router.get('/', async (req, res) => {
    const filters: Record<string, unknown> = {};
    if (req.query.category) filters.category = req.query.category;
    if (req.query.ship_id) filters.ship_id = parseInt(req.query.ship_id as string, 10);
    if (req.query.search) filters.search = req.query.search;
    if (req.query.low_stock === 'true') filters.low_stock = true;

    const items = await listItems(filters as any);
    res.json({ items });
});

/**
 * GET /api/inventory/low-stock
 * Get items below minimum quantity
 */
router.get('/low-stock', async (_req, res) => {
    const items = await listItems({ low_stock: true });
    res.json({ items });
});

/**
 * GET /api/inventory/shopping-list
 * 🔒 Admin only — aggregated shopping list from task materials
 */
router.get('/shopping-list', roleGuard('admin'), async (_req, res) => {
    const list = await getShoppingList();
    res.json({ items: list });
});

/**
 * GET /api/inventory/:id
 */
router.get('/:id', async (req, res) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id) || id <= 0) {
        res.status(400).json({ error: 'Nieprawidłowe ID' });
        return;
    }

    const item = await getItem(id);
    if (!item) {
        res.status(404).json({ error: 'Pozycja nie znaleziona' });
        return;
    }

    res.json({ item });
});

/**
 * POST /api/inventory
 * 🔒 Admin only — add new inventory item
 */
router.post('/', roleGuard('admin'), async (req, res) => {
    try {
        const data = createItemSchema.parse(req.body);
        const item = await createItem(data);
        res.status(201).json({ item });
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
 * PUT /api/inventory/:id
 * 🔒 Admin only — update inventory item
 */
router.put('/:id', roleGuard('admin'), async (req, res) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id) || id <= 0) {
        res.status(400).json({ error: 'Nieprawidłowe ID' });
        return;
    }

    try {
        const data = updateItemSchema.parse(req.body);
        const item = await updateItem(id, data);
        if (!item) {
            res.status(404).json({ error: 'Pozycja nie znaleziona' });
            return;
        }
        res.json({ item });
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
 * DELETE /api/inventory/:id
 * 🔒 Admin only
 */
router.delete('/:id', roleGuard('admin'), async (req, res) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id) || id <= 0) {
        res.status(400).json({ error: 'Nieprawidłowe ID' });
        return;
    }

    const deleted = await deleteItem(id);
    if (!deleted) {
        res.status(404).json({ error: 'Pozycja nie znaleziona' });
        return;
    }

    res.status(204).send();
});

/**
 * PATCH /api/inventory/:id/quantity
 * Adjust quantity (+ or -). Workers can report usage.
 */
router.patch('/:id/quantity', async (req, res) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id) || id <= 0) {
        res.status(400).json({ error: 'Nieprawidłowe ID' });
        return;
    }

    try {
        const { delta } = adjustQuantitySchema.parse(req.body);
        const item = await adjustQuantity(id, delta);
        if (!item) {
            res.status(404).json({ error: 'Pozycja nie znaleziona' });
            return;
        }
        res.json({ item });
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

// --- Task Materials ---

/**
 * GET /api/inventory/tasks/:taskId/materials
 */
router.get('/tasks/:taskId/materials', async (req, res) => {
    const taskId = parseInt(req.params.taskId as string, 10);
    if (isNaN(taskId) || taskId <= 0) {
        res.status(400).json({ error: 'Nieprawidłowe ID zadania' });
        return;
    }

    const materials = await getTaskMaterials(taskId);
    res.json({ materials });
});

/**
 * POST /api/inventory/tasks/:taskId/materials
 * 🔒 Admin only
 */
router.post('/tasks/:taskId/materials', roleGuard('admin'), async (req, res) => {
    const taskId = parseInt(req.params.taskId as string, 10);
    if (isNaN(taskId) || taskId <= 0) {
        res.status(400).json({ error: 'Nieprawidłowe ID zadania' });
        return;
    }

    try {
        const data = addMaterialSchema.parse(req.body);
        const material = await addTaskMaterial(taskId, data);
        res.status(201).json({ material });
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
 * PATCH /api/inventory/materials/:id/purchased
 * Toggle purchased status
 */
router.patch('/materials/:id/purchased', async (req, res) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id) || id <= 0) {
        res.status(400).json({ error: 'Nieprawidłowe ID' });
        return;
    }

    const purchased = req.body.purchased;
    if (typeof purchased !== 'boolean') {
        res.status(400).json({ error: 'Pole purchased musi być boolean' });
        return;
    }

    const updated = await toggleMaterialPurchased(id, purchased);
    if (!updated) {
        res.status(404).json({ error: 'Materiał nie znaleziony' });
        return;
    }

    res.json({ success: true });
});

/**
 * DELETE /api/inventory/materials/:id
 * 🔒 Admin only
 */
router.delete('/materials/:id', roleGuard('admin'), async (req, res) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id) || id <= 0) {
        res.status(400).json({ error: 'Nieprawidłowe ID' });
        return;
    }

    const deleted = await removeTaskMaterial(id);
    if (!deleted) {
        res.status(404).json({ error: 'Materiał nie znaleziony' });
        return;
    }

    res.status(204).send();
});

export default router;
