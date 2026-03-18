import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import type { Database } from 'sql.js';
import { createTestDatabase } from '../db/database.js';
import { getAlerts, type WaterLevelData } from '../services/water-level.service.js';

describe('Water Level — Moduł 2.7: Monitoring poziomu wody', () => {
    let db: Database;

    beforeAll(async () => {
        db = await createTestDatabase();
    });

    afterAll(() => {
        db.close();
    });

    // ============================================================
    // ALERT LOGIC
    // ============================================================
    describe('Alert logic', () => {
        it('should return OK alert when water level is normal', () => {
            const data: WaterLevelData = {
                station_id: '154190090',
                station_name: 'Tolkmicko',
                river: 'Zalew Wiślany',
                water_level: 500,
                water_level_date: '2026-03-11 10:00',
                water_temp: 8.5,
                water_temp_date: '2026-03-11 10:00',
                ice_phenomenon: 0,
                fetched_at: new Date().toISOString(),
            };

            const alerts = getAlerts(data);
            expect(alerts.length).toBe(1);
            expect(alerts[0].level).toBe('ok');
            expect(alerts[0].message).toContain('OK');
        });

        it('should return warning when water level is below 460cm', () => {
            const data: WaterLevelData = {
                station_id: '154190090',
                station_name: 'Tolkmicko',
                river: 'Zalew Wiślany',
                water_level: 455,
                water_level_date: '2026-03-11 10:00',
                water_temp: null,
                water_temp_date: null,
                ice_phenomenon: 0,
                fetched_at: new Date().toISOString(),
            };

            const alerts = getAlerts(data);
            expect(alerts.length).toBe(1);
            expect(alerts[0].level).toBe('warning');
            expect(alerts[0].message).toContain('455');
            expect(alerts[0].message).toContain('Kutrzeb');
        });

        it('should return danger when water level is below 440cm', () => {
            const data: WaterLevelData = {
                station_id: '154190090',
                station_name: 'Tolkmicko',
                river: 'Zalew Wiślany',
                water_level: 430,
                water_level_date: '2026-03-11 10:00',
                water_temp: null,
                water_temp_date: null,
                ice_phenomenon: 0,
                fetched_at: new Date().toISOString(),
            };

            const alerts = getAlerts(data);
            expect(alerts.length).toBe(1);
            expect(alerts[0].level).toBe('danger');
            expect(alerts[0].message).toContain('KRYTYCZNIE');
            expect(alerts[0].ship_name).toBe('Kutrzeba');
        });

        it('should return no level alerts when water_level is null', () => {
            const data: WaterLevelData = {
                station_id: '154190090',
                station_name: 'Tolkmicko',
                river: 'Zalew Wiślany',
                water_level: null,
                water_level_date: null,
                water_temp: null,
                water_temp_date: null,
                ice_phenomenon: 0,
                fetched_at: new Date().toISOString(),
            };

            const alerts = getAlerts(data);
            expect(alerts.length).toBe(0);
        });
    });

    // ============================================================
    // ICE PHENOMENA
    // ============================================================
    describe('Ice phenomena alerts', () => {
        it('should add ice warning for minor ice phenomena (code 1-3)', () => {
            const data: WaterLevelData = {
                station_id: '154190090',
                station_name: 'Tolkmicko',
                river: 'Zalew Wiślany',
                water_level: 500,
                water_level_date: '2026-03-11 10:00',
                water_temp: 0.5,
                water_temp_date: '2026-03-11 10:00',
                ice_phenomenon: 1,
                fetched_at: new Date().toISOString(),
            };

            const alerts = getAlerts(data);
            // Should have OK level alert + ice warning
            expect(alerts.length).toBe(2);
            const iceAlert = alerts.find(a => a.message.includes('lodowe'));
            expect(iceAlert).toBeDefined();
            expect(iceAlert!.level).toBe('warning');
            expect(iceAlert!.message).toContain('Lód brzegowy');
        });

        it('should add ice danger for severe ice phenomena (code >= 4)', () => {
            const data: WaterLevelData = {
                station_id: '154190090',
                station_name: 'Tolkmicko',
                river: 'Zalew Wiślany',
                water_level: 490,
                water_level_date: '2026-03-11 10:00',
                water_temp: -1,
                water_temp_date: '2026-03-11 10:00',
                ice_phenomenon: 4,
                fetched_at: new Date().toISOString(),
            };

            const alerts = getAlerts(data);
            const iceAlert = alerts.find(a => a.message.includes('lodowe'));
            expect(iceAlert).toBeDefined();
            expect(iceAlert!.level).toBe('danger');
            expect(iceAlert!.message).toContain('Pokrywa lodowa');
        });

        it('should not add ice alert when ice_phenomenon is 0', () => {
            const data: WaterLevelData = {
                station_id: '154190090',
                station_name: 'Tolkmicko',
                river: 'Zalew Wiślany',
                water_level: 500,
                water_level_date: '2026-03-11 10:00',
                water_temp: 5,
                water_temp_date: '2026-03-11 10:00',
                ice_phenomenon: 0,
                fetched_at: new Date().toISOString(),
            };

            const alerts = getAlerts(data);
            const iceAlert = alerts.find(a => a.message.includes('lodowe'));
            expect(iceAlert).toBeUndefined();
        });
    });

    // ============================================================
    // COMBINED SCENARIOS
    // ============================================================
    describe('Combined scenarios', () => {
        it('should return both danger level and ice danger alerts', () => {
            const data: WaterLevelData = {
                station_id: '154190090',
                station_name: 'Tolkmicko',
                river: 'Zalew Wiślany',
                water_level: 430,
                water_level_date: '2026-03-11 10:00',
                water_temp: -2,
                water_temp_date: '2026-03-11 10:00',
                ice_phenomenon: 6,
                fetched_at: new Date().toISOString(),
            };

            const alerts = getAlerts(data);
            expect(alerts.length).toBe(2);
            expect(alerts[0].level).toBe('danger');
            expect(alerts[1].level).toBe('danger');
        });

        it('should handle exact boundary values', () => {
            // Exactly 460 → should be OK (not below 460)
            const dataAt460: WaterLevelData = {
                station_id: '154190090',
                station_name: 'Tolkmicko',
                river: 'Zalew Wiślany',
                water_level: 460,
                water_level_date: null,
                water_temp: null,
                water_temp_date: null,
                ice_phenomenon: 0,
                fetched_at: new Date().toISOString(),
            };

            const alertsAt460 = getAlerts(dataAt460);
            expect(alertsAt460[0].level).toBe('ok');

            // Exactly 440 → should be warning (not below 440)
            const dataAt440: WaterLevelData = {
                ...dataAt460,
                water_level: 440,
            };

            const alertsAt440 = getAlerts(dataAt440);
            expect(alertsAt440[0].level).toBe('warning');

            // 439 → danger
            const dataAt439: WaterLevelData = {
                ...dataAt460,
                water_level: 439,
            };

            const alertsAt439 = getAlerts(dataAt439);
            expect(alertsAt439[0].level).toBe('danger');
        });
    });

    // ============================================================
    // CACHE TABLE
    // ============================================================
    describe('Cache table', () => {
        it('should have water_level_cache table available', () => {
            const result = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='water_level_cache'");
            expect(result.length).toBe(1);
            expect(result[0].values[0][0]).toBe('water_level_cache');
        });

        it('should be able to INSERT and SELECT from cache', () => {
            const testData = JSON.stringify({
                station_id: '154190090',
                station_name: 'Tolkmicko',
                water_level: 490,
            });

            db.run('INSERT INTO water_level_cache (data) VALUES (?)', [testData]);

            const result = db.exec('SELECT data FROM water_level_cache ORDER BY id DESC LIMIT 1');
            expect(result.length).toBe(1);
            const parsed = JSON.parse(result[0].values[0][0] as string);
            expect(parsed.station_name).toBe('Tolkmicko');
            expect(parsed.water_level).toBe(490);

            // Cleanup
            db.run('DELETE FROM water_level_cache');
        });
    });
});
