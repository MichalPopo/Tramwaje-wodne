import { Router } from 'express';
import { authMiddleware, roleGuard } from '../middleware/auth.js';
import {
    listSuppliers, getSupplier, createSupplier, updateSupplier, deleteSupplier,
    linkInventoryItem, unlinkInventoryItem, getShoppingListBySupplier,
} from '../services/supplier.service.js';
import { z, ZodError } from 'zod';

const router = Router();

// All supplier routes require auth
router.use(authMiddleware);

// --- Validation schemas ---

const createSupplierSchema = z.object({
    name: z.string().min(2).max(200),
    contact_person: z.string().max(200).optional(),
    phone: z.string().max(50).optional(),
    email: z.string().email().max(200).optional().or(z.literal('')),
    address: z.string().max(300).optional(),
    city: z.string().max(100).optional(),
    categories: z.array(z.enum(['tool', 'material', 'part'])).optional(),
    notes: z.string().max(1000).optional(),
});

const updateSupplierSchema = createSupplierSchema.partial().extend({
    is_active: z.boolean().optional(),
});

const linkInventorySchema = z.object({
    inventory_id: z.number().int().positive(),
    unit_price: z.number().min(0).optional(),
    notes: z.string().max(500).optional(),
});

// --- Shopping list by supplier (must be before /:id) ---

/**
 * GET /api/suppliers/shopping-list
 * 🔒 Admin only — shopping list grouped by supplier
 */
router.get('/shopping-list', roleGuard('admin'), async (_req, res) => {
    const groups = await getShoppingListBySupplier();
    res.json({ groups });
});

// --- CRUD ---

/**
 * GET /api/suppliers
 * List all suppliers with optional filters
 */
router.get('/', async (req, res) => {
    const filters: Record<string, unknown> = {};
    if (req.query.city) filters.city = req.query.city;
    if (req.query.category) filters.category = req.query.category;
    if (req.query.search) filters.search = req.query.search;
    if (req.query.active === 'true') filters.is_active = true;
    if (req.query.active === 'false') filters.is_active = false;

    const suppliers = await listSuppliers(filters as any);
    res.json({ suppliers });
});

/**
 * GET /api/suppliers/:id
 * Get supplier detail with inventory links
 */
router.get('/:id', async (req, res) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id) || id <= 0) {
        res.status(400).json({ error: 'Nieprawidłowe ID' });
        return;
    }

    const supplier = await getSupplier(id);
    if (!supplier) {
        res.status(404).json({ error: 'Dostawca nie znaleziony' });
        return;
    }

    res.json({ supplier });
});

/**
 * POST /api/suppliers
 * 🔒 Admin only — add new supplier
 */
router.post('/', roleGuard('admin'), async (req, res) => {
    try {
        const data = createSupplierSchema.parse(req.body);
        // Filter out empty email
        const cleanData = { ...data, email: data.email || undefined };
        const supplier = await createSupplier(cleanData);
        res.status(201).json({ supplier });
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
 * PUT /api/suppliers/:id
 * 🔒 Admin only — update supplier
 */
router.put('/:id', roleGuard('admin'), async (req, res) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id) || id <= 0) {
        res.status(400).json({ error: 'Nieprawidłowe ID' });
        return;
    }

    try {
        const data = updateSupplierSchema.parse(req.body);
        const cleanData = { ...data, email: data.email || undefined };
        const supplier = await updateSupplier(id, cleanData);
        if (!supplier) {
            res.status(404).json({ error: 'Dostawca nie znaleziony' });
            return;
        }
        res.json({ supplier });
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
 * DELETE /api/suppliers/:id
 * 🔒 Admin only
 */
router.delete('/:id', roleGuard('admin'), async (req, res) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id) || id <= 0) {
        res.status(400).json({ error: 'Nieprawidłowe ID' });
        return;
    }

    const deleted = await deleteSupplier(id);
    if (!deleted) {
        res.status(404).json({ error: 'Dostawca nie znaleziony' });
        return;
    }

    res.status(204).send();
});

// --- Inventory linking ---

/**
 * POST /api/suppliers/:id/inventory
 * 🔒 Admin only — link inventory item to supplier
 */
router.post('/:id/inventory', roleGuard('admin'), async (req, res) => {
    const supplierId = parseInt(req.params.id as string, 10);
    if (isNaN(supplierId) || supplierId <= 0) {
        res.status(400).json({ error: 'Nieprawidłowe ID dostawcy' });
        return;
    }

    try {
        const data = linkInventorySchema.parse(req.body);
        const link = await linkInventoryItem(supplierId, data.inventory_id, data.unit_price, data.notes);
        if (!link) {
            res.status(400).json({ error: 'Nie można powiązać — dostawca/pozycja nie istnieje lub powiązanie już istnieje' });
            return;
        }
        res.status(201).json({ link });
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
 * DELETE /api/suppliers/inventory/:linkId
 * 🔒 Admin only — remove inventory link
 */
router.delete('/inventory/:linkId', roleGuard('admin'), async (req, res) => {
    const linkId = parseInt(req.params.linkId as string, 10);
    if (isNaN(linkId) || linkId <= 0) {
        res.status(400).json({ error: 'Nieprawidłowe ID powiązania' });
        return;
    }

    const deleted = await unlinkInventoryItem(linkId);
    if (!deleted) {
        res.status(404).json({ error: 'Powiązanie nie znalezione' });
        return;
    }

    res.status(204).send();
});

export default router;
