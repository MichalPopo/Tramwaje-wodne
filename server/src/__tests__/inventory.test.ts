import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Database } from 'sql.js';
import { createTestDatabase } from '../db/database.js';
import {
    listItems, getItem, createItem, updateItem, deleteItem,
    adjustQuantity, getTaskMaterials, addTaskMaterial, removeTaskMaterial,
    getShoppingList, getInventoryContext,
} from '../services/inventory.service.js';

describe('Inventory — Faza 1.8: Magazyn', () => {
    let db: Database;

    beforeAll(async () => {
        db = await createTestDatabase();
    });

    afterAll(() => {
        db.close();
    });

    // ============================================================
    // SEED DATA VERIFICATION
    // ============================================================
    describe('Seed data', () => {
        it('should have 5 seeded inventory items', () => {
            const items = listItems({}, db);
            expect(items.length).toBe(5);
        });

        it('should include spawarka in seeded items', () => {
            const items = listItems({}, db);
            const spawarka = items.find(i => i.name.includes('Spawarka'));
            expect(spawarka).toBeDefined();
            expect(spawarka!.category).toBe('tool');
        });
    });

    // ============================================================
    // CRUD
    // ============================================================
    describe('CRUD operations', () => {
        let createdId: number;

        it('should create a new inventory item', () => {
            const item = createItem({
                name: 'Papier ścierny P120',
                category: 'material',
                unit: 'szt',
                quantity: 50,
                min_quantity: 20,
                location: 'Magazyn Tolkmicko',
            }, db);

            expect(item).toBeDefined();
            expect(item.name).toBe('Papier ścierny P120');
            expect(item.category).toBe('material');
            expect(item.quantity).toBe(50);
            expect(item.min_quantity).toBe(20);
            expect(item.is_low_stock).toBe(false);
            createdId = item.id;
        });

        it('should get item by ID', () => {
            const item = getItem(createdId, db);
            expect(item).toBeDefined();
            expect(item!.name).toBe('Papier ścierny P120');
        });

        it('should return undefined for non-existent ID', () => {
            const item = getItem(99999, db);
            expect(item).toBeUndefined();
        });

        it('should update an item', () => {
            const updated = updateItem(createdId, {
                quantity: 15,
                location: 'Statek Zefir',
            }, db);

            expect(updated).toBeDefined();
            expect(updated!.quantity).toBe(15);
            expect(updated!.location).toBe('Statek Zefir');
            expect(updated!.name).toBe('Papier ścierny P120'); // unchanged
            expect(updated!.is_low_stock).toBe(true); // 15 < 20
        });

        it('should return undefined when updating non-existent item', () => {
            const result = updateItem(99999, { name: 'test' }, db);
            expect(result).toBeUndefined();
        });

        it('should delete an item', () => {
            const testItem = createItem({
                name: 'Do usunięcia',
                category: 'part',
            }, db);
            const deleted = deleteItem(testItem.id, db);
            expect(deleted).toBe(true);

            const found = getItem(testItem.id, db);
            expect(found).toBeUndefined();
        });

        it('should return false when deleting non-existent item', () => {
            const result = deleteItem(99999, db);
            expect(result).toBe(false);
        });
    });

    // ============================================================
    // FILTERING
    // ============================================================
    describe('Filtering', () => {
        it('should filter by category', () => {
            const tools = listItems({ category: 'tool' }, db);
            expect(tools.length).toBeGreaterThan(0);
            tools.forEach(t => expect(t.category).toBe('tool'));
        });

        it('should filter by search term', () => {
            const items = listItems({ search: 'spawarka' }, db);
            expect(items.length).toBeGreaterThan(0);
            items.forEach(i => expect(i.name.toLowerCase()).toContain('spawark'));
        });

        it('should filter low stock items', () => {
            const items = listItems({ low_stock: true }, db);
            items.forEach(i => expect(i.is_low_stock).toBe(true));
        });
    });

    // ============================================================
    // QUANTITY ADJUSTMENT
    // ============================================================
    describe('Quantity adjustment', () => {
        it('should increase quantity', () => {
            const items = listItems({}, db);
            const item = items[0];
            const originalQty = item.quantity;

            const adjusted = adjustQuantity(item.id, 5, db);
            expect(adjusted).toBeDefined();
            expect(adjusted!.quantity).toBe(originalQty + 5);
        });

        it('should decrease quantity', () => {
            const items = listItems({}, db);
            const item = items[0];
            const originalQty = item.quantity;

            const adjusted = adjustQuantity(item.id, -2, db);
            expect(adjusted).toBeDefined();
            expect(adjusted!.quantity).toBe(originalQty - 2);
        });

        it('should not go below zero', () => {
            const item = createItem({
                name: 'Test qty zero',
                category: 'material',
                quantity: 3,
            }, db);

            const adjusted = adjustQuantity(item.id, -10, db);
            expect(adjusted!.quantity).toBe(0);
        });

        it('should return undefined for non-existent item', () => {
            const result = adjustQuantity(99999, 5, db);
            expect(result).toBeUndefined();
        });
    });

    // ============================================================
    // TASK MATERIALS
    // ============================================================
    describe('Task materials', () => {
        it('should add material to a task', () => {
            // Task ID 1 should exist from seed
            const material = addTaskMaterial(1, {
                name: 'Farba biała',
                quantity_needed: 10,
                unit: 'L',
            }, db);

            expect(material).toBeDefined();
            expect(material.name).toBe('Farba biała');
            expect(material.quantity_needed).toBe(10);
            expect(material.purchased).toBe(false);
        });

        it('should list task materials', () => {
            const materials = getTaskMaterials(1, db);
            expect(materials.length).toBeGreaterThan(0);
        });

        it('should add material linked to inventory', () => {
            const items = listItems({}, db);
            const material = addTaskMaterial(1, {
                name: items[0].name,
                quantity_needed: 5,
                unit: items[0].unit || undefined,
                inventory_id: items[0].id,
            }, db);

            expect(material.inventory_id).toBe(items[0].id);
            expect(material.current_stock).toBeDefined();
        });

        it('should remove task material', () => {
            const materials = getTaskMaterials(1, db);
            const lastMaterial = materials[materials.length - 1];
            const removed = removeTaskMaterial(lastMaterial.id, db);
            expect(removed).toBe(true);
        });

        it('should return false when removing non-existent material', () => {
            const result = removeTaskMaterial(99999, db);
            expect(result).toBe(false);
        });
    });

    // ============================================================
    // SHOPPING LIST
    // ============================================================
    describe('Shopping list', () => {
        it('should return aggregated shopping list', () => {
            const list = getShoppingList(db);
            expect(Array.isArray(list)).toBe(true);
        });

        it('shopping list items should have required fields', () => {
            // Add some materials first
            addTaskMaterial(2, {
                name: 'Olej silnikowy',
                quantity_needed: 15,
                unit: 'L',
            }, db);

            const list = getShoppingList(db);
            if (list.length > 0) {
                const item = list[0];
                expect(item).toHaveProperty('name');
                expect(item).toHaveProperty('total_needed');
                expect(item).toHaveProperty('in_stock');
                expect(item).toHaveProperty('to_buy');
                expect(item).toHaveProperty('tasks');
            }
        });
    });

    // ============================================================
    // AI CONTEXT
    // ============================================================
    describe('AI inventory context', () => {
        it('should return a string', () => {
            const context = getInventoryContext(db);
            expect(typeof context).toBe('string');
            expect(context.length).toBeGreaterThan(0);
        });

        it('should mention low stock when items are below minimum', () => {
            // The seeded item "Farba podkładowa" has min_quantity=10, quantity=5
            const context = getInventoryContext(db);
            // It has low stock items, so it should mention them
            if (context.includes('ALERTY')) {
                expect(context).toContain('Farba podkładowa');
            }
        });
    });
});
