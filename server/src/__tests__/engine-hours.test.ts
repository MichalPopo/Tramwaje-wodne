import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Database } from 'sql.js';
import { createTestDatabase } from '../db/database.js';
import {
    listEngineHours, getEngineHours, createEngineHours,
    updateHours, addHours,
    listServiceIntervals, createServiceInterval,
    logService, getServiceLogs, getServiceAlerts,
    getEngineHoursForAI,
} from '../services/engine-hours.service.js';

describe('Engine Hours — Moduł 2.9: Motogodziny + interwały serwisowe', () => {
    let db: Database;
    let equipmentId: number;

    beforeAll(async () => {
        db = await createTestDatabase();
        // Find first seeded equipment
        const result = db.exec('SELECT id FROM equipment LIMIT 1');
        equipmentId = result[0].values[0][0] as number;
    });

    afterAll(() => {
        db.close();
    });

    // ============================================================
    // TABLES EXIST
    // ============================================================
    describe('Database tables', () => {
        it('should have engine_hours table', () => {
            const result = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='engine_hours'");
            expect(result.length).toBe(1);
        });

        it('should have service_intervals table', () => {
            const result = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='service_intervals'");
            expect(result.length).toBe(1);
        });

        it('should have service_logs table', () => {
            const result = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='service_logs'");
            expect(result.length).toBe(1);
        });
    });

    // ============================================================
    // ENGINE HOURS CRUD
    // ============================================================
    describe('Engine hours CRUD', () => {
        it('should create engine hours for an equipment', () => {
            const entry = createEngineHours(equipmentId, 150, db);
            expect(entry).toBeDefined();
            expect(entry!.current_hours).toBe(150);
            expect(entry!.equipment_id).toBe(equipmentId);
        });

        it('should return existing when creating duplicate', () => {
            const entry = createEngineHours(equipmentId, 999, db);
            expect(entry).toBeDefined();
            expect(entry!.current_hours).toBe(150); // original value, not 999
        });

        it('should return undefined for non-existent equipment', () => {
            const entry = createEngineHours(99999, 0, db);
            expect(entry).toBeUndefined();
        });

        it('should list engine hours', () => {
            const list = listEngineHours(db);
            expect(list.length).toBeGreaterThan(0);
            expect(list[0].equipment_name).toBeDefined();
        });

        it('should get engine hours by equipment ID', () => {
            const entry = getEngineHours(equipmentId, db);
            expect(entry).toBeDefined();
            expect(entry!.current_hours).toBe(150);
        });

        it('should update hours to absolute value', () => {
            const entry = updateHours(equipmentId, 200, db);
            expect(entry).toBeDefined();
            expect(entry!.current_hours).toBe(200);
        });

        it('should add hours incrementally', () => {
            const entry = addHours(equipmentId, 10.5, db);
            expect(entry).toBeDefined();
            expect(entry!.current_hours).toBe(210.5);
        });

        it('should return undefined when updating non-existent', () => {
            expect(updateHours(99999, 100, db)).toBeUndefined();
            expect(addHours(99999, 10, db)).toBeUndefined();
        });
    });

    // ============================================================
    // SERVICE INTERVALS
    // ============================================================
    describe('Service intervals', () => {
        let intervalId: number;

        it('should create a service interval', () => {
            const interval = createServiceInterval({
                equipment_id: equipmentId,
                name: 'Wymiana oleju',
                interval_hours: 100,
                last_service_hours: 200,
            }, db);

            expect(interval).toBeDefined();
            expect(interval!.name).toBe('Wymiana oleju');
            expect(interval!.interval_hours).toBe(100);
            intervalId = interval!.id;
        });

        it('should calculate hours_since_service correctly', () => {
            const intervals = listServiceIntervals(equipmentId, db);
            const interval = intervals.find(i => i.id === intervalId);
            expect(interval).toBeDefined();
            // current_hours = 210.5, last_service_hours = 200
            expect(interval!.hours_since_service).toBeCloseTo(10.5);
            expect(interval!.hours_until_due).toBeCloseTo(89.5);
            expect(interval!.is_overdue).toBe(false);
            expect(interval!.is_due_soon).toBe(false); // 89.5 > 20% of 100 = 20
        });

        it('should detect due_soon status', () => {
            // Set hours to 290 → since=90, until=10 → 10 <= 20% of 100
            updateHours(equipmentId, 290, db);
            const intervals = listServiceIntervals(equipmentId, db);
            const interval = intervals.find(i => i.id === intervalId);
            expect(interval!.is_due_soon).toBe(true);
            expect(interval!.is_overdue).toBe(false);
        });

        it('should detect overdue status', () => {
            // Set hours to 310 → since=110, until=-10
            updateHours(equipmentId, 310, db);
            const intervals = listServiceIntervals(equipmentId, db);
            const interval = intervals.find(i => i.id === intervalId);
            expect(interval!.is_overdue).toBe(true);
        });

        it('should return undefined for non-existent equipment', () => {
            const interval = createServiceInterval({
                equipment_id: 99999,
                name: 'Test',
                interval_hours: 50,
            }, db);
            expect(interval).toBeUndefined();
        });
    });

    // ============================================================
    // SERVICE ALERTS
    // ============================================================
    describe('Service alerts', () => {
        it('should return overdue alert', () => {
            // Equipment is at 310h, interval every 100h, last at 200h → overdue
            const alerts = getServiceAlerts(db);
            expect(alerts.length).toBeGreaterThan(0);
            const overdue = alerts.find(a => a.level === 'overdue');
            expect(overdue).toBeDefined();
            expect(overdue!.message).toContain('PRZETERMINOWANY');
        });
    });

    // ============================================================
    // SERVICE LOGS
    // ============================================================
    describe('Service logging', () => {
        it('should log a completed service', () => {
            const intervals = listServiceIntervals(equipmentId, db);
            const interval = intervals[0];

            const log = logService({
                interval_id: interval.id,
                notes: 'Wymieniony olej silnikowy',
            }, db);

            expect(log).toBeDefined();
            expect(log!.interval_id).toBe(interval.id);
            expect(log!.hours_at_service).toBe(310); // current hours
            expect(log!.notes).toBe('Wymieniony olej silnikowy');
        });

        it('should update interval after service', () => {
            const intervals = listServiceIntervals(equipmentId, db);
            const interval = intervals[0];

            // After service, last_service_hours should be 310
            expect(interval.last_service_hours).toBe(310);
            expect(interval.is_overdue).toBe(false); // reset
        });

        it('should list service logs', () => {
            const logs = getServiceLogs(equipmentId, 10, db);
            expect(logs.length).toBeGreaterThan(0);
            expect(logs[0].interval_name).toBeDefined();
        });

        it('should return undefined for non-existent interval', () => {
            const log = logService({ interval_id: 99999 }, db);
            expect(log).toBeUndefined();
        });
    });

    // ============================================================
    // AI CONTEXT
    // ============================================================
    describe('AI context', () => {
        it('should return a string with engine data', () => {
            const context = getEngineHoursForAI(db);
            expect(typeof context).toBe('string');
            expect(context).toContain('Motogodziny');
        });

        it('should mention engine hours values', () => {
            const context = getEngineHoursForAI(db);
            expect(context).toContain('310.0h');
        });
    });
});
