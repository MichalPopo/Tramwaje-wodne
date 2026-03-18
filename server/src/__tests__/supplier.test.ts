import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Database } from 'sql.js';
import { createTestDatabase } from '../db/database.js';
import {
    listSuppliers, getSupplier, createSupplier, updateSupplier, deleteSupplier,
    linkInventoryItem, unlinkInventoryItem, getShoppingListBySupplier,
    getSupplierContext,
} from '../services/supplier.service.js';
import { addTaskMaterial } from '../services/inventory.service.js';

describe('Suppliers — Faza 2.4: Baza dostawców', () => {
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
        it('should have 4 seeded suppliers', () => {
            const suppliers = listSuppliers({}, db);
            expect(suppliers.length).toBe(4);
        });

        it('should include LAKMA in seeded suppliers', () => {
            const suppliers = listSuppliers({}, db);
            const lakma = suppliers.find(s => s.name.includes('LAKMA'));
            expect(lakma).toBeDefined();
            expect(lakma!.city).toBe('Elbląg');
            expect(lakma!.categories).toContain('material');
        });

        it('should have seeded supplier-inventory links', () => {
            const detail = getSupplier(2, db); // LAKMA
            expect(detail).toBeDefined();
            expect(detail!.inventory_links.length).toBe(2); // farba nawierzchniowa + podkładowa
        });

        it('seed links should have prices', () => {
            const detail = getSupplier(2, db); // LAKMA
            const link = detail!.inventory_links.find(l => l.inventory_name.includes('nawierzchniowa'));
            expect(link).toBeDefined();
            expect(link!.unit_price).toBe(45.00);
        });
    });

    // ============================================================
    // CRUD
    // ============================================================
    describe('CRUD operations', () => {
        let createdId: number;

        it('should create a new supplier', () => {
            const supplier = createSupplier({
                name: 'Testowy Dostawca',
                contact_person: 'Test Person',
                phone: '123-456-789',
                email: 'test@test.pl',
                city: 'Gdańsk',
                categories: ['tool', 'part'],
                notes: 'Testowy',
            }, db);

            expect(supplier).toBeDefined();
            expect(supplier.name).toBe('Testowy Dostawca');
            expect(supplier.city).toBe('Gdańsk');
            expect(supplier.categories).toEqual(['tool', 'part']);
            expect(supplier.is_active).toBe(true);
            createdId = supplier.id;
        });

        it('should get supplier by ID with detail', () => {
            const detail = getSupplier(createdId, db);
            expect(detail).toBeDefined();
            expect(detail!.name).toBe('Testowy Dostawca');
            expect(detail!.inventory_links).toEqual([]);
        });

        it('should return undefined for non-existent ID', () => {
            const detail = getSupplier(99999, db);
            expect(detail).toBeUndefined();
        });

        it('should update a supplier', () => {
            const updated = updateSupplier(createdId, {
                city: 'Sopot',
                phone: '999-888-777',
            }, db);

            expect(updated).toBeDefined();
            expect(updated!.city).toBe('Sopot');
            expect(updated!.phone).toBe('999-888-777');
            expect(updated!.name).toBe('Testowy Dostawca'); // unchanged
        });

        it('should deactivate a supplier', () => {
            const updated = updateSupplier(createdId, {
                is_active: false,
            }, db);
            expect(updated!.is_active).toBe(false);
        });

        it('should return undefined when updating non-existent supplier', () => {
            const result = updateSupplier(99999, { name: 'test' }, db);
            expect(result).toBeUndefined();
        });

        it('should delete a supplier', () => {
            const testSupplier = createSupplier({ name: 'Do usunięcia' }, db);
            const deleted = deleteSupplier(testSupplier.id, db);
            expect(deleted).toBe(true);

            const found = getSupplier(testSupplier.id, db);
            expect(found).toBeUndefined();
        });

        it('should return false when deleting non-existent supplier', () => {
            const result = deleteSupplier(99999, db);
            expect(result).toBe(false);
        });
    });

    // ============================================================
    // FILTERING
    // ============================================================
    describe('Filtering', () => {
        it('should filter by city', () => {
            const suppliers = listSuppliers({ city: 'Elbląg' }, db);
            expect(suppliers.length).toBeGreaterThan(0);
            suppliers.forEach(s => expect(s.city).toBe('Elbląg'));
        });

        it('should filter by category', () => {
            const suppliers = listSuppliers({ category: 'tool' }, db);
            expect(suppliers.length).toBeGreaterThan(0);
            suppliers.forEach(s => expect(s.categories).toContain('tool'));
        });

        it('should filter by search term', () => {
            const suppliers = listSuppliers({ search: 'LAKMA' }, db);
            expect(suppliers.length).toBe(1);
            expect(suppliers[0].name).toContain('LAKMA');
        });

        it('should filter active suppliers only', () => {
            const active = listSuppliers({ is_active: true }, db);
            active.forEach(s => expect(s.is_active).toBe(true));
        });

        it('should filter inactive suppliers', () => {
            const inactive = listSuppliers({ is_active: false }, db);
            inactive.forEach(s => expect(s.is_active).toBe(false));
        });
    });

    // ============================================================
    // INVENTORY LINKING
    // ============================================================
    describe('Inventory linking', () => {
        it('should link inventory item to supplier', () => {
            // Link olej silnikowy (id=5) to Auto-Parts (id=4)
            const link = linkInventoryItem(4, 5, 28.50, 'Olej 15W-40 1L', db);
            expect(link).toBeDefined();
            expect(link!.supplier_id).toBe(4);
            expect(link!.inventory_id).toBe(5);
            expect(link!.unit_price).toBe(28.50);
        });

        it('should show linked items in supplier detail', () => {
            const detail = getSupplier(4, db);
            expect(detail!.inventory_links.length).toBeGreaterThan(0);
        });

        it('should return undefined for duplicate link', () => {
            // Try to re-link olej (id=5) to Auto-Parts (id=4)
            const link = linkInventoryItem(4, 5, 30, undefined, db);
            expect(link).toBeUndefined();
        });

        it('should return undefined for non-existent supplier', () => {
            const link = linkInventoryItem(99999, 1, undefined, undefined, db);
            expect(link).toBeUndefined();
        });

        it('should return undefined for non-existent inventory item', () => {
            const link = linkInventoryItem(1, 99999, undefined, undefined, db);
            expect(link).toBeUndefined();
        });

        it('should unlink inventory item', () => {
            const detail = getSupplier(4, db);
            const linkToRemove = detail!.inventory_links[0];
            const removed = unlinkInventoryItem(linkToRemove.id, db);
            expect(removed).toBe(true);
        });

        it('should return false when unlinking non-existent link', () => {
            const result = unlinkInventoryItem(99999, db);
            expect(result).toBe(false);
        });
    });

    // ============================================================
    // SHOPPING LIST BY SUPPLIER
    // ============================================================
    describe('Shopping list by supplier', () => {
        it('should return array', () => {
            const groups = getShoppingListBySupplier(db);
            expect(Array.isArray(groups)).toBe(true);
        });

        it('should group by supplier when materials have linked suppliers', () => {
            // Add task material linked to inventory item 3 (farba nawierzchniowa)
            // which is linked to supplier 2 (LAKMA)
            addTaskMaterial(1, {
                name: 'Farba nawierzchniowa (biała)',
                quantity_needed: 20,
                unit: 'L',
                inventory_id: 3,
            }, db);

            const groups = getShoppingListBySupplier(db);
            if (groups.length > 0) {
                const group = groups[0];
                expect(group).toHaveProperty('supplier_id');
                expect(group).toHaveProperty('supplier_name');
                expect(group).toHaveProperty('city');
                expect(group).toHaveProperty('items');
                expect(group).toHaveProperty('total_estimated_cost');
            }
        });
    });

    // ============================================================
    // AI CONTEXT
    // ============================================================
    describe('AI supplier context', () => {
        it('should return a string', () => {
            const context = getSupplierContext(db);
            expect(typeof context).toBe('string');
        });

        it('should mention active suppliers', () => {
            const context = getSupplierContext(db);
            expect(context).toContain('DOSTAWCY');
            expect(context).toContain('LAKMA');
            expect(context).toContain('Elbląg');
        });
    });
});
