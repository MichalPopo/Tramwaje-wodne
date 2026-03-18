import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Database } from 'sql.js';
import { createTestDatabase, setDatabase } from '../db/database.js';
import { app } from '../index.js';
import { generateToken, registerUser } from '../services/auth.service.js';
import {
    buildDAG,
    topologicalSort,
    resourceConstrainedSchedule,
    getGanttData,
    wouldCreateCycle,
} from '../services/scheduling.service.js';

process.env.JWT_SECRET = 'test-secret-must-be-at-least-32-characters-long!!';
process.env.JWT_EXPIRES_IN = '1h';

// ============================================================
// UNIT TESTS — pure algorithm tests (no DB)
// ============================================================

describe('Scheduling Engine — Algorithms', () => {

    // --- buildDAG ---
    describe('buildDAG', () => {
        it('should build correct adjacency lists', () => {
            const dag = buildDAG(
                [1, 2, 3],
                [
                    { task_id: 2, depends_on_id: 1 }, // 1 → 2
                    { task_id: 3, depends_on_id: 2 }, // 2 → 3
                ],
            );

            expect(dag.nodes.size).toBe(3);
            expect(dag.successors.get(1)).toEqual([2]);
            expect(dag.successors.get(2)).toEqual([3]);
            expect(dag.successors.get(3)).toEqual([]);
            expect(dag.predecessors.get(1)).toEqual([]);
            expect(dag.predecessors.get(2)).toEqual([1]);
            expect(dag.predecessors.get(3)).toEqual([2]);
        });

        it('should ignore deps for nodes not in the task set', () => {
            const dag = buildDAG(
                [1, 2],
                [
                    { task_id: 2, depends_on_id: 1 },
                    { task_id: 3, depends_on_id: 2 }, // task 3 not in set
                ],
            );

            expect(dag.nodes.size).toBe(2);
            expect(dag.successors.get(2)).toEqual([]);
        });
    });

    // --- topologicalSort ---
    describe('topologicalSort', () => {
        it('should return correct order for linear chain', () => {
            const dag = buildDAG([1, 2, 3], [
                { task_id: 2, depends_on_id: 1 },
                { task_id: 3, depends_on_id: 2 },
            ]);

            const { sorted } = topologicalSort(dag);
            expect(sorted).toEqual([1, 2, 3]);
        });

        it('should handle independent nodes (no deps)', () => {
            const dag = buildDAG([1, 2, 3], []);
            const { sorted } = topologicalSort(dag);
            // All start at same time, sorted by ID
            expect(sorted).toEqual([1, 2, 3]);
        });

        it('should handle diamond dependency (A→B, A→C, B→D, C→D)', () => {
            const dag = buildDAG([1, 2, 3, 4], [
                { task_id: 2, depends_on_id: 1 },
                { task_id: 3, depends_on_id: 1 },
                { task_id: 4, depends_on_id: 2 },
                { task_id: 4, depends_on_id: 3 },
            ]);

            const { sorted } = topologicalSort(dag);
            // 1 must come first, 4 must come last
            expect(sorted[0]).toBe(1);
            expect(sorted[sorted.length - 1]).toBe(4);
            // 2 and 3 must come after 1 and before 4
            expect(sorted.indexOf(2)).toBeGreaterThan(sorted.indexOf(1));
            expect(sorted.indexOf(3)).toBeGreaterThan(sorted.indexOf(1));
            expect(sorted.indexOf(2)).toBeLessThan(sorted.indexOf(4));
            expect(sorted.indexOf(3)).toBeLessThan(sorted.indexOf(4));
        });

        it('should gracefully handle cycles by breaking edges', () => {
            const dag = buildDAG([1, 2, 3], [
                { task_id: 2, depends_on_id: 1 },
                { task_id: 3, depends_on_id: 2 },
                { task_id: 1, depends_on_id: 3 }, // Creates cycle: 1→2→3→1
            ]);

            const result = topologicalSort(dag);
            // Should return all 3 nodes sorted (cycle was broken)
            expect(result.sorted.length).toBe(3);
            // Should report at least one broken edge
            expect(result.brokenEdges.length).toBeGreaterThanOrEqual(1);
        });
    });

    // --- wouldCreateCycle ---
    describe('wouldCreateCycle', () => {
        it('should detect that adding edge would create cycle', () => {
            const deps = [
                { task_id: 2, depends_on_id: 1 }, // 1 → 2
                { task_id: 3, depends_on_id: 2 }, // 2 → 3
            ];
            // Adding 3 → 1 (1 depends on 3) would create cycle 1→2→3→1
            expect(wouldCreateCycle(3, 1, deps, [1, 2, 3])).toBe(true);
        });

        it('should allow non-cyclic edge', () => {
            const deps = [
                { task_id: 2, depends_on_id: 1 }, // 1 → 2
            ];
            // Adding 1 → 3 (3 depends on 1) is fine, no cycle
            expect(wouldCreateCycle(1, 3, deps, [1, 2, 3])).toBe(false);
        });
    });

    // --- resourceConstrainedSchedule ---
    describe('resourceConstrainedSchedule', () => {
        it('should compute correct schedule for linear chain', () => {
            // 1(8h) → 2(16h) → 3(8h), 100 workers (effectively unlimited)
            const dag = buildDAG([1, 2, 3], [
                { task_id: 2, depends_on_id: 1 },
                { task_id: 3, depends_on_id: 2 },
            ]);
            const { sorted: topoOrder } = topologicalSort(dag);
            const durations = new Map([[1, 8], [2, 16], [3, 8]]);
            const priorities = new Map([[1, 'normal'], [2, 'normal'], [3, 'normal']]);

            const cpm = resourceConstrainedSchedule(dag, topoOrder, durations, priorities, 100);

            // Forward pass — chain tasks follow each other
            expect(cpm.get(1)!.early_start).toBe(0);
            expect(cpm.get(1)!.early_finish).toBe(8);
            expect(cpm.get(2)!.early_start).toBe(8);
            expect(cpm.get(2)!.early_finish).toBe(24);
            expect(cpm.get(3)!.early_start).toBe(24);
            expect(cpm.get(3)!.early_finish).toBe(32);

            // All on critical path
            expect(cpm.get(1)!.is_critical).toBe(true);
            expect(cpm.get(2)!.is_critical).toBe(true);
            expect(cpm.get(3)!.is_critical).toBe(true);
        });

        it('should compute correct schedule with diamond (sufficient resources)', () => {
            // 100 workers — parallel paths work like classic CPM
            const dag = buildDAG([1, 2, 3, 4], [
                { task_id: 2, depends_on_id: 1 },
                { task_id: 3, depends_on_id: 1 },
                { task_id: 4, depends_on_id: 2 },
                { task_id: 4, depends_on_id: 3 },
            ]);
            const { sorted: topoOrder } = topologicalSort(dag);
            const durations = new Map([[1, 8], [2, 16], [3, 4], [4, 8]]);
            const priorities = new Map([[1, 'normal'], [2, 'normal'], [3, 'normal'], [4, 'normal']]);

            const cpm = resourceConstrainedSchedule(dag, topoOrder, durations, priorities, 100);

            // Task 4 should start after longest predecessor path (task 2)
            expect(cpm.get(4)!.early_start).toBe(24);

            // Critical path: 1, 2, 4
            expect(cpm.get(1)!.is_critical).toBe(true);
            expect(cpm.get(2)!.is_critical).toBe(true);
            expect(cpm.get(3)!.is_critical).toBe(false);
            expect(cpm.get(4)!.is_critical).toBe(true);
        });

        it('should spread independent tasks across days with limited resources', () => {
            // 1 worker, 8h/day. Three 8h tasks = 3 days
            const dag = buildDAG([1, 2, 3], []);
            const { sorted: topoOrder } = topologicalSort(dag);
            const durations = new Map([[1, 8], [2, 8], [3, 8]]);
            const priorities = new Map([[1, 'normal'], [2, 'normal'], [3, 'normal']]);

            const cpm = resourceConstrainedSchedule(dag, topoOrder, durations, priorities, 1);

            // With 1 worker, tasks should be sequential across days
            expect(cpm.get(1)!.early_start).toBe(0);
            expect(cpm.get(2)!.early_start).toBe(8);  // next day
            expect(cpm.get(3)!.early_start).toBe(16); // day after
        });

        it('should allow two short tasks on same day for same person (4h + 3h ≤ 8h)', () => {
            // 1 person assigned to two short tasks — should fit on same day
            const dag = buildDAG([1, 2], []);
            const { sorted: topoOrder } = topologicalSort(dag);
            const durations = new Map([[1, 4], [2, 3]]); // 4h + 3h = 7h < 8h
            const priorities = new Map([[1, 'normal'], [2, 'normal']]);
            // Both assigned to person 100
            const taskAssignees = new Map([[1, [100]], [2, [100]]]);

            const cpm = resourceConstrainedSchedule(dag, topoOrder, durations, priorities, 4, taskAssignees);

            // Both should start on day 0 (hour 0) since 4+3=7 ≤ 8
            expect(cpm.get(1)!.early_start).toBe(0);
            expect(cpm.get(2)!.early_start).toBe(0);
        });

        it('should use default duration of 8h for missing values', () => {
            const dag = buildDAG([1], []);
            const { sorted: topoOrder } = topologicalSort(dag);
            const durations = new Map<number, number>(); // empty — should default to 8
            const priorities = new Map([[1, 'normal']]);

            const cpm = resourceConstrainedSchedule(dag, topoOrder, durations, priorities, 1);

            expect(cpm.get(1)!.duration).toBe(8);
            expect(cpm.get(1)!.early_finish).toBe(8);
        });
    });
});

// ============================================================
// INTEGRATION TESTS — API endpoint with DB
// ============================================================

describe('GET /api/tasks/gantt — API Integration', () => {
    let db: Database;
    let adminToken: string;
    let workerToken: string;

    beforeAll(async () => {
        db = await createTestDatabase();
        setDatabase(db);

        const admin = await registerUser('ganttadmin@test.com', 'adminpass12345', 'Gantt Admin', 'admin', db);
        adminToken = generateToken({ userId: admin.id, email: admin.email, role: admin.role });

        const worker = await registerUser('ganttworker@test.com', 'workerpass12345', 'Gantt Worker', 'worker', db);
        workerToken = generateToken({ userId: worker.id, email: worker.email, role: worker.role });
    });

    afterAll(() => {
        db.close();
    });

    it('should return gantt data with seed tasks → 200', async () => {
        const res = await request(app)
            .get('/api/tasks/gantt')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.tasks).toBeDefined();
        expect(Array.isArray(res.body.tasks)).toBe(true);
        expect(res.body.tasks.length).toBeGreaterThanOrEqual(9);
        expect(res.body.total_duration_hours).toBeGreaterThan(0);

        // Each task should have CPM fields
        const task = res.body.tasks[0];
        expect(task.early_start).toBeDefined();
        expect(task.early_finish).toBeDefined();
        expect(task.late_start).toBeDefined();
        expect(task.late_finish).toBeDefined();
        expect(task.slack).toBeDefined();
        expect(typeof task.is_critical).toBe('boolean');
        expect(Array.isArray(task.dependencies)).toBe(true);
        expect(Array.isArray(task.assignees)).toBe(true);
    });

    it('should filter by ship_id', async () => {
        const res = await request(app)
            .get('/api/tasks/gantt?ship_id=1')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        // All returned tasks should be for ship 1
        res.body.tasks.forEach((t: { ship_id: number | null }) => {
            expect(t.ship_id).toBe(1);
        });
    });

    it('should require authentication → 401', async () => {
        const res = await request(app).get('/api/tasks/gantt');
        expect(res.status).toBe(401);
    });

    it('worker should also access gantt → 200', async () => {
        const res = await request(app)
            .get('/api/tasks/gantt')
            .set('Authorization', `Bearer ${workerToken}`);

        expect(res.status).toBe(200);
    });
});
