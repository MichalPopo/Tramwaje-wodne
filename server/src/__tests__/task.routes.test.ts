import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Database } from 'sql.js';
import { createTestDatabase, execute, setDatabase } from '../db/database.js';
import { app } from '../index.js';
import { generateToken, registerUser } from '../services/auth.service.js';

process.env.JWT_SECRET = 'test-secret-must-be-at-least-32-characters-long!!';
process.env.JWT_EXPIRES_IN = '1h';

describe('Task Routes — API Integration', () => {
    let db: Database;
    let adminToken: string;
    let workerToken: string;
    let adminId: number;
    let workerId: number;

    beforeAll(async () => {
        db = await createTestDatabase();
        setDatabase(db);

        const admin = await registerUser('taskadmin@test.com', 'adminpass12345', 'Task Admin', 'admin', db);
        adminId = admin.id;
        adminToken = generateToken({ userId: admin.id, email: admin.email, role: admin.role });

        const worker = await registerUser('taskworker@test.com', 'workerpass12345', 'Task Worker', 'worker', db);
        workerId = worker.id;
        workerToken = generateToken({ userId: worker.id, email: worker.email, role: worker.role });
    });

    afterAll(() => {
        db.close();
    });

    // Helper: create a minimal task directly via DB for setup
    function seedTask(overrides: Record<string, unknown> = {}) {
        const defaults = {
            title: 'Test task',
            category: 'inne',
            status: 'todo',
            priority: 'normal',
            ship_id: 1,
            created_by: adminId,
        };
        const data = { ...defaults, ...overrides };
        const result = execute(
            `INSERT INTO tasks (title, category, status, priority, ship_id, created_by)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [data.title, data.category, data.status, data.priority, data.ship_id, data.created_by],
            db,
        );
        return result.lastInsertRowid;
    }

    // ============================================================
    // AUTH REQUIRED
    // ============================================================
    describe('Authentication required', () => {
        it('GET /api/tasks without token → 401', async () => {
            const res = await request(app).get('/api/tasks');
            expect(res.status).toBe(401);
        });

        it('POST /api/tasks without token → 401', async () => {
            const res = await request(app).post('/api/tasks').send({ title: 'test', category: 'inne' });
            expect(res.status).toBe(401);
        });
    });

    // ============================================================
    // GET /api/tasks — List
    // ============================================================
    describe('GET /api/tasks', () => {
        it('should list all tasks (seed has 9) → 200', async () => {
            const res = await request(app)
                .get('/api/tasks')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(res.body.tasks).toBeDefined();
            expect(Array.isArray(res.body.tasks)).toBe(true);
            expect(res.body.tasks.length).toBeGreaterThanOrEqual(9); // Seed has 9 tasks
        });

        it('should filter by status', async () => {
            const res = await request(app)
                .get('/api/tasks?status=todo')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            res.body.tasks.forEach((t: { status: string }) => {
                expect(t.status).toBe('todo');
            });
        });

        it('should filter by priority', async () => {
            const res = await request(app)
                .get('/api/tasks?priority=critical')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            res.body.tasks.forEach((t: { priority: string }) => {
                expect(t.priority).toBe('critical');
            });
        });

        it('should filter by ship_id', async () => {
            const res = await request(app)
                .get('/api/tasks?ship_id=1')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            res.body.tasks.forEach((t: { ship_id: number }) => {
                expect(t.ship_id).toBe(1);
            });
        });

        it('should search by title', async () => {
            const res = await request(app)
                .get('/api/tasks?search=malowanie')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(res.body.tasks.length).toBeGreaterThan(0);
            res.body.tasks.forEach((t: { title: string }) => {
                expect(t.title.toLowerCase()).toContain('malowanie');
            });
        });
    });

    // ============================================================
    // GET /api/tasks/:id — Detail
    // ============================================================
    describe('GET /api/tasks/:id', () => {
        it('should return task detail with relationships → 200', async () => {
            const res = await request(app)
                .get('/api/tasks/1')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(res.body.task.id).toBe(1);
            expect(res.body.task.title).toBeDefined();
            expect(res.body.task.assignees).toBeDefined();
            expect(res.body.task.dependencies).toBeDefined();
            expect(res.body.task.time_logs).toBeDefined();
            expect(typeof res.body.task.weather_dependent).toBe('boolean');
            expect(typeof res.body.task.is_report).toBe('boolean');
        });

        it('should return 404 for non-existent task', async () => {
            const res = await request(app)
                .get('/api/tasks/99999')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(404);
        });

        it('should return 400 for invalid ID', async () => {
            const res = await request(app)
                .get('/api/tasks/abc')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(400);
        });
    });

    // ============================================================
    // POST /api/tasks — Create
    // ============================================================
    describe('POST /api/tasks', () => {
        it('admin should create task → 201', async () => {
            const res = await request(app)
                .post('/api/tasks')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    title: 'Nowe zadanie testowe',
                    category: 'elektryka',
                    priority: 'high',
                    ship_id: 1,
                    description: 'Opis testowy',
                    estimated_hours: 5,
                    weather_dependent: true,
                    weather_min_temp: 10,
                    assignee_ids: [workerId],
                });

            expect(res.status).toBe(201);
            expect(res.body.task.title).toBe('Nowe zadanie testowe');
            expect(res.body.task.category).toBe('elektryka');
            expect(res.body.task.priority).toBe('high');
            expect(res.body.task.weather_dependent).toBe(true);
            expect(res.body.task.assignees).toHaveLength(1);
            expect(res.body.task.assignees[0].id).toBe(workerId);
        });

        it('admin should create task with dependencies → 201', async () => {
            const res = await request(app)
                .post('/api/tasks')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    title: 'Zadanie z zależnościami',
                    category: 'inspekcja',
                    dependency_ids: [1, 2],
                });

            expect(res.status).toBe(201);
            expect(res.body.task.dependencies).toHaveLength(2);
        });

        it('worker should NOT create task → 403', async () => {
            const res = await request(app)
                .post('/api/tasks')
                .set('Authorization', `Bearer ${workerToken}`)
                .send({ title: 'Próba', category: 'inne' });

            expect(res.status).toBe(403);
        });

        it('should reject invalid category → 400', async () => {
            const res = await request(app)
                .post('/api/tasks')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ title: 'Test', category: 'nieistniejaca' });

            expect(res.status).toBe(400);
        });

        it('should reject short title → 400', async () => {
            const res = await request(app)
                .post('/api/tasks')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ title: 'AB', category: 'inne' });

            expect(res.status).toBe(400);
        });
    });

    // ============================================================
    // PUT /api/tasks/:id — Update
    // ============================================================
    describe('PUT /api/tasks/:id', () => {
        let taskId: number;

        beforeEach(() => {
            taskId = seedTask({ title: 'Do aktualizacji' });
        });

        it('admin should update task → 200', async () => {
            const res = await request(app)
                .put(`/api/tasks/${taskId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ title: 'Zaktualizowany tytuł', priority: 'critical' });

            expect(res.status).toBe(200);
            expect(res.body.task.title).toBe('Zaktualizowany tytuł');
            expect(res.body.task.priority).toBe('critical');
        });

        it('admin should update assignees → 200', async () => {
            const res = await request(app)
                .put(`/api/tasks/${taskId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ assignee_ids: [workerId] });

            expect(res.status).toBe(200);
            expect(res.body.task.assignees).toHaveLength(1);
        });

        it('worker should NOT update task → 403', async () => {
            const res = await request(app)
                .put(`/api/tasks/${taskId}`)
                .set('Authorization', `Bearer ${workerToken}`)
                .send({ title: 'Worker próba' });

            expect(res.status).toBe(403);
        });

        it('should return 404 for non-existent task', async () => {
            const res = await request(app)
                .put('/api/tasks/99999')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ title: 'Nowy' });

            expect(res.status).toBe(404);
        });
    });

    // ============================================================
    // DELETE /api/tasks/:id
    // ============================================================
    describe('DELETE /api/tasks/:id', () => {
        let taskId: number;

        beforeEach(() => {
            taskId = seedTask({ title: 'Do usunięcia' });
        });

        it('admin should delete task → 204', async () => {
            const res = await request(app)
                .delete(`/api/tasks/${taskId}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(204);

            // Verify it's gone
            const check = await request(app)
                .get(`/api/tasks/${taskId}`)
                .set('Authorization', `Bearer ${adminToken}`);
            expect(check.status).toBe(404);
        });

        it('worker should NOT delete task → 403', async () => {
            const res = await request(app)
                .delete(`/api/tasks/${taskId}`)
                .set('Authorization', `Bearer ${workerToken}`);

            expect(res.status).toBe(403);
        });

        it('should return 404 for non-existent task', async () => {
            const res = await request(app)
                .delete('/api/tasks/99999')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(404);
        });
    });

    // ============================================================
    // PATCH /api/tasks/:id/status
    // ============================================================
    describe('PATCH /api/tasks/:id/status', () => {
        let taskId: number;

        beforeEach(() => {
            taskId = seedTask({ title: 'Status test' });
            // Assign worker to this task
            execute(
                'INSERT OR IGNORE INTO task_assignments (task_id, user_id) VALUES (?, ?)',
                [taskId, workerId],
                db,
            );
        });

        it('admin should change status → 200', async () => {
            const res = await request(app)
                .patch(`/api/tasks/${taskId}/status`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'in_progress' });

            expect(res.status).toBe(200);
            expect(res.body.task.status).toBe('in_progress');
        });

        it('worker should change status of assigned task → 200', async () => {
            const res = await request(app)
                .patch(`/api/tasks/${taskId}/status`)
                .set('Authorization', `Bearer ${workerToken}`)
                .send({ status: 'done' });

            expect(res.status).toBe(200);
            expect(res.body.task.status).toBe('done');
        });

        it('worker should NOT change status of unassigned task → 403', async () => {
            const otherTaskId = seedTask({ title: 'Nie moje' });
            // NOT assigned to worker

            const res = await request(app)
                .patch(`/api/tasks/${otherTaskId}/status`)
                .set('Authorization', `Bearer ${workerToken}`)
                .send({ status: 'in_progress' });

            expect(res.status).toBe(403);
        });

        it('should set blocked_reason when status is blocked', async () => {
            const res = await request(app)
                .patch(`/api/tasks/${taskId}/status`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'blocked', blocked_reason: 'Czekamy na materiały' });

            expect(res.status).toBe(200);
            expect(res.body.task.status).toBe('blocked');
            expect(res.body.task.blocked_reason).toBe('Czekamy na materiały');
        });

        it('should clear blocked_reason when status changes from blocked', async () => {
            // First block it
            await request(app)
                .patch(`/api/tasks/${taskId}/status`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'blocked', blocked_reason: 'Czekamy' });

            // Then unblock
            const res = await request(app)
                .patch(`/api/tasks/${taskId}/status`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'in_progress' });

            expect(res.status).toBe(200);
            expect(res.body.task.status).toBe('in_progress');
            expect(res.body.task.blocked_reason).toBeNull();
        });

        it('should reject invalid status → 400', async () => {
            const res = await request(app)
                .patch(`/api/tasks/${taskId}/status`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'invalid_status' });

            expect(res.status).toBe(400);
        });
    });

    // ============================================================
    // POST /api/tasks/:id/time — Time logging
    // ============================================================
    describe('POST /api/tasks/:id/time', () => {
        let taskId: number;

        beforeEach(() => {
            taskId = seedTask({ title: 'Time test' });
            // Assign worker to this task so they can log time
            execute(
                'INSERT OR IGNORE INTO task_assignments (task_id, user_id) VALUES (?, ?)',
                [taskId, workerId],
                db,
            );
        });

        it('should log time → 201', async () => {
            const res = await request(app)
                .post(`/api/tasks/${taskId}/time`)
                .set('Authorization', `Bearer ${workerToken}`)
                .send({ hours: 2.5, note: 'Szlifowanie kadłuba' });

            expect(res.status).toBe(201);
            expect(res.body.time_log.hours).toBe(2.5);
            expect(res.body.time_log.note).toBe('Szlifowanie kadłuba');

            // Verify actual_hours updated on task
            const taskRes = await request(app)
                .get(`/api/tasks/${taskId}`)
                .set('Authorization', `Bearer ${workerToken}`);
            expect(taskRes.body.task.actual_hours).toBe(2.5);
        });

        it('should reject too many hours → 400', async () => {
            const res = await request(app)
                .post(`/api/tasks/${taskId}/time`)
                .set('Authorization', `Bearer ${workerToken}`)
                .send({ hours: 25 });

            expect(res.status).toBe(400);
        });

        it('should reject zero hours → 400', async () => {
            const res = await request(app)
                .post(`/api/tasks/${taskId}/time`)
                .set('Authorization', `Bearer ${workerToken}`)
                .send({ hours: 0 });

            expect(res.status).toBe(400);
        });

        it('should return 404 for non-existent task', async () => {
            const res = await request(app)
                .post('/api/tasks/99999/time')
                .set('Authorization', `Bearer ${workerToken}`)
                .send({ hours: 1 });

            expect(res.status).toBe(404);
        });

        it('worker should NOT log time on unassigned task → 403', async () => {
            const otherTaskId = seedTask({ title: 'Nie moje zadanie' });
            // NOT assigned to worker

            const res = await request(app)
                .post(`/api/tasks/${otherTaskId}/time`)
                .set('Authorization', `Bearer ${workerToken}`)
                .send({ hours: 1 });

            expect(res.status).toBe(403);
        });

        it('admin should log time on any task → 201', async () => {
            const otherTaskId = seedTask({ title: 'Admin log' });
            // Admin is NOT assigned but should still be able to log

            const res = await request(app)
                .post(`/api/tasks/${otherTaskId}/time`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ hours: 1.5 });

            expect(res.status).toBe(201);
        });
    });

    // ============================================================
    // GET /api/tasks/my
    // ============================================================
    describe('GET /api/tasks/my', () => {
        it('should return only assigned tasks', async () => {
            const taskId = seedTask({ title: 'Moje zadanie' });
            execute(
                'INSERT INTO task_assignments (task_id, user_id) VALUES (?, ?)',
                [taskId, workerId],
                db,
            );

            const res = await request(app)
                .get('/api/tasks/my')
                .set('Authorization', `Bearer ${workerToken}`);

            expect(res.status).toBe(200);
            expect(res.body.tasks.some((t: { title: string }) => t.title === 'Moje zadanie')).toBe(true);
        });
    });

    // ============================================================
    // GET /api/tasks/today
    // ============================================================
    describe('GET /api/tasks/today', () => {
        it('should return pending/in-progress tasks with today or no deadline → 200', async () => {
            const res = await request(app)
                .get('/api/tasks/today')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body.tasks)).toBe(true);
            // All returned tasks should be todo or in_progress
            res.body.tasks.forEach((t: { status: string }) => {
                expect(['todo', 'in_progress']).toContain(t.status);
            });
        });
    });
});
