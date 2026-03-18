import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Database } from 'sql.js';
import { createTestDatabase } from '../db/database.js';
import {
    listTanks, getTank, createTank, updateTank,
    logTankChange, getTankLogs, getTankAlerts,
    getConsumptionStats, getTanksForAI,
} from '../services/tanks.service.js';

describe('Tanks — Moduł 2.10: Zbiorniki i zużycie', () => {
    let db: Database;
    let shipId: number;
    let fuelTankId: number;
    let wasteTankId: number;

    beforeAll(async () => {
        db = await createTestDatabase();
        // Get first seeded ship
        const result = db.exec('SELECT id FROM ships LIMIT 1');
        shipId = result[0].values[0][0] as number;
    });

    afterAll(() => {
        db.close();
    });

    // ============================================================
    // TABLES
    // ============================================================
    describe('Database tables', () => {
        it('should have tanks table', () => {
            const result = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='tanks'");
            expect(result.length).toBe(1);
        });

        it('should have tank_logs table', () => {
            const result = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='tank_logs'");
            expect(result.length).toBe(1);
        });
    });

    // ============================================================
    // CRUD
    // ============================================================
    describe('Tank CRUD', () => {
        it('should create a fuel tank', () => {
            const tank = await createTank({
                ship_id: shipId,
                type: 'fuel',
                name: 'Zbiornik paliwa główny',
                capacity: 500,
                current_level: 400,
            }, db);

            expect(tank).toBeDefined();
            expect(tank!.name).toBe('Zbiornik paliwa główny');
            expect(tank!.capacity).toBe(500);
            expect(tank!.current_level).toBe(400);
            expect(tank!.percent).toBe(80);
            expect(tank!.is_low).toBe(false);
            fuelTankId = tank!.id;
        });

        it('should create a waste water tank', () => {
            const tank = await createTank({
                ship_id: shipId,
                type: 'waste_water',
                name: 'Zbiornik nieczystości',
                capacity: 200,
                current_level: 180,
                alert_threshold: 20,
            }, db);

            expect(tank).toBeDefined();
            expect(tank!.percent).toBe(90);
            expect(tank!.is_high).toBe(true); // 90% >= (100 - 20) = 80%
            wasteTankId = tank!.id;
        });

        it('should return undefined for non-existent ship', () => {
            const tank = await createTank({
                ship_id: 99999,
                type: 'fuel',
                name: 'Test',
                capacity: 100,
            }, db);
            expect(tank).toBeUndefined();
        });

        it('should list tanks with filters', () => {
            const all = await listTanks(undefined, db);
            expect(all.length).toBe(2);

            const fuelOnly = await listTanks({ type: 'fuel' }, db);
            expect(fuelOnly.every(t => t.type === 'fuel')).toBe(true);
        });

        it('should get tank by ID', () => {
            const tank = await getTank(fuelTankId, db);
            expect(tank).toBeDefined();
            expect(tank!.name).toBe('Zbiornik paliwa główny');
        });

        it('should update tank', () => {
            const tank = await updateTank(fuelTankId, { alert_threshold: 25 }, db);
            expect(tank).toBeDefined();
            expect(tank!.alert_threshold).toBe(25);
        });

        it('should return undefined when updating non-existent', () => {
            const result = await updateTank(99999, { name: 'test' }, db);
            expect(result).toBeUndefined();
        });
    });

    // ============================================================
    // LEVEL LOGGING
    // ============================================================
    describe('Level logging', () => {
        it('should log a consumption event', () => {
            const log = await logTankChange({
                tank_id: fuelTankId,
                change_amount: -50,
                log_type: 'consumption',
                route_info: 'S3 Tolkmicko–Krynica',
                notes: 'Rejs próbny',
            }, db);

            expect(log).toBeDefined();
            expect(log!.change_amount).toBe(-50);
            expect(log!.level_after).toBe(350); // 400 - 50
        });

        it('should update tank level after logging', () => {
            const tank = await getTank(fuelTankId, db);
            expect(tank!.current_level).toBe(350);
        });

        it('should clamp level to 0 (not go negative)', () => {
            const log = await logTankChange({
                tank_id: fuelTankId,
                change_amount: -9999,
                log_type: 'consumption',
            }, db);

            expect(log!.level_after).toBe(0);
            const tank = await getTank(fuelTankId, db);
            expect(tank!.current_level).toBe(0);
        });

        it('should clamp level to capacity (not exceed)', () => {
            const log = await logTankChange({
                tank_id: fuelTankId,
                change_amount: 9999,
                log_type: 'refill',
            }, db);

            expect(log!.level_after).toBe(500); // capacity
            const tank = await getTank(fuelTankId, db);
            expect(tank!.current_level).toBe(500);
        });

        it('should return undefined for non-existent tank', () => {
            const log = await logTankChange({
                tank_id: 99999,
                change_amount: 10,
                log_type: 'manual',
            }, db);
            expect(log).toBeUndefined();
        });

        it('should list logs', () => {
            const logs = await getTankLogs(fuelTankId, 10, db);
            expect(logs.length).toBeGreaterThan(0);
            expect(logs[0].tank_name).toBeDefined();
        });
    });

    // ============================================================
    // ALERTS
    // ============================================================
    describe('Alerts', () => {
        it('should alert on high waste water', () => {
            const alerts = await getTankAlerts(db);
            const wasteAlert = alerts.find(a => a.tank_type === 'waste_water');
            expect(wasteAlert).toBeDefined();
            expect(wasteAlert!.level).toBe('danger'); // 90% >= 90
        });

        it('should alert on low fuel when below threshold', () => {
            // Set fuel to 10% = 50L (threshold 25% since we updated it)
            await updateTank(fuelTankId, { current_level: 50 }, db);
            const alerts = await getTankAlerts(db);
            const fuelAlert = alerts.find(a => a.tank_type === 'fuel');
            expect(fuelAlert).toBeDefined();
            expect(fuelAlert!.message).toContain('KRYTYCZNIE');
        });

        it('should not alert when levels are OK', () => {
            await updateTank(fuelTankId, { current_level: 400 }, db); // 80%
            await updateTank(wasteTankId, { current_level: 20 }, db); // 10%
            const alerts = await getTankAlerts(db);
            expect(alerts.length).toBe(0);
        });
    });

    // ============================================================
    // CONSUMPTION STATS
    // ============================================================
    describe('Consumption stats', () => {
        it('should return consumption stats', () => {
            const stats = await getConsumptionStats(fuelTankId, db);
            expect(typeof stats.total_consumed).toBe('number');
            expect(typeof stats.avg_per_trip).toBe('number');
            expect(typeof stats.trips_count).toBe('number');
        });
    });

    // ============================================================
    // AI CONTEXT
    // ============================================================
    describe('AI context', () => {
        it('should return a string with tank data', () => {
            const context = getTanksForAI(db);
            expect(typeof context).toBe('string');
            expect(context).toContain('Zbiorniki');
        });

        it('should include tank names and levels', () => {
            const context = getTanksForAI(db);
            expect(context).toContain('Zbiornik paliwa główny');
        });
    });
});
