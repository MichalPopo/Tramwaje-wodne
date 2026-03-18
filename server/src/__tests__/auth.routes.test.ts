import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Database } from 'sql.js';
import { createTestDatabase, execute, setDatabase } from '../db/database.js';
import { app } from '../index.js';
import { generateToken, registerUser } from '../services/auth.service.js';

// Set env for tests
process.env.JWT_SECRET = 'test-secret-must-be-at-least-32-characters-long!!';
process.env.JWT_EXPIRES_IN = '1h';

describe('Auth Routes — API Integration', () => {
    let db: Database;
    let adminToken: string;

    beforeAll(async () => {
        db = await createTestDatabase();
        setDatabase(db);

        // Create admin user for register tests
        const admin = await registerUser(
            'admin@routes-test.com',
            'adminpassword123',
            'Admin Test',
            'admin',
            db
        );
        adminToken = generateToken({
            userId: admin.id,
            email: admin.email,
            role: admin.role,
        });
    });

    afterAll(() => {
        db.close();
    });

    beforeEach(() => {
        // Clean up non-admin test users
        execute(
            "DELETE FROM users WHERE email NOT IN ('admin@routes-test.com')",
            [],
            db
        );
    });

    // ============================================================
    // POST /api/auth/login
    // ============================================================
    describe('POST /api/auth/login', () => {
        beforeEach(async () => {
            // Register a user to login with
            await registerUser(
                'loginroute@test.com',
                'password123',
                'Login Route User',
                'worker',
                db
            );
        });

        it('should login with valid credentials → 200 + token', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: 'loginroute@test.com', password: 'password123' });

            expect(res.status).toBe(200);
            expect(res.body.token).toBeDefined();
            expect(res.body.token.split('.')).toHaveLength(3);
            expect(res.body.user.email).toBe('loginroute@test.com');
            expect(res.body.user.name).toBe('Login Route User');
            expect(res.body.user.role).toBe('worker');
            // Password should never be returned
            expect(res.body.user.password).toBeUndefined();
        });

        it('should reject wrong password → 401', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: 'loginroute@test.com', password: 'wrongpassword' });

            expect(res.status).toBe(401);
            expect(res.body.error).toBeDefined();
        });

        it('should reject non-existent email → 401', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: 'nobody@test.com', password: 'password123' });

            expect(res.status).toBe(401);
        });

        it('should reject invalid email format → 400', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: 'not-an-email', password: 'password123' });

            expect(res.status).toBe(400);
            expect(res.body.details).toBeDefined();
        });

        it('should reject empty body → 400', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({});

            expect(res.status).toBe(400);
        });

        it('should reject disabled account → 401 (same as invalid)', async () => {
            execute(
                "UPDATE users SET is_active = 0 WHERE email = 'loginroute@test.com'",
                [],
                db
            );
            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: 'loginroute@test.com', password: 'password123' });

            expect(res.status).toBe(401);
        });
    });

    // ============================================================
    // POST /api/auth/register
    // ============================================================
    describe('POST /api/auth/register', () => {
        it('should register new user (admin auth) → 201', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    email: 'newworker@test.com',
                    password: 'securepass123',
                    name: 'Nowy Pracownik',
                    role: 'worker',
                });

            expect(res.status).toBe(201);
            expect(res.body.user.email).toBe('newworker@test.com');
            expect(res.body.user.name).toBe('Nowy Pracownik');
            expect(res.body.user.role).toBe('worker');
            expect(res.body.user.is_active).toBe(true);
            expect(res.body.user.password).toBeUndefined();
        });

        it('should reject without auth token → 401', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send({
                    email: 'noauth@test.com',
                    password: 'password123',
                    name: 'No Auth',
                    role: 'worker',
                });

            expect(res.status).toBe(401);
        });

        it('should reject worker trying to register → 403', async () => {
            // Create worker and get their token
            const worker = await registerUser(
                'w@test.com', 'pass12345678', 'Worker', 'worker', db
            );
            const workerToken = generateToken({
                userId: worker.id,
                email: worker.email,
                role: worker.role,
            });

            const res = await request(app)
                .post('/api/auth/register')
                .set('Authorization', `Bearer ${workerToken}`)
                .send({
                    email: 'attempt@test.com',
                    password: 'password123',
                    name: 'Attempt',
                    role: 'worker',
                });

            expect(res.status).toBe(403);
        });

        it('should reject duplicate email → 409', async () => {
            await registerUser('dup@test.com', 'pass12345678', 'First', 'worker', db);

            const res = await request(app)
                .post('/api/auth/register')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    email: 'dup@test.com',
                    password: 'password456',
                    name: 'Second',
                    role: 'worker',
                });

            expect(res.status).toBe(409);
        });

        it('should reject short password → 400', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    email: 'short@test.com',
                    password: '123',
                    name: 'Short Pass',
                    role: 'worker',
                });

            expect(res.status).toBe(400);
            expect(res.body.details).toBeDefined();
        });

        it('should reject invalid role → 400', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    email: 'badrole@test.com',
                    password: 'password123',
                    name: 'Bad Role',
                    role: 'superadmin',
                });

            expect(res.status).toBe(400);
        });
    });

    // ============================================================
    // GET /api/auth/me
    // ============================================================
    describe('GET /api/auth/me', () => {
        it('should return current user data → 200', async () => {
            const res = await request(app)
                .get('/api/auth/me')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(res.body.user.email).toBe('admin@routes-test.com');
            expect(res.body.user.role).toBe('admin');
            expect(res.body.user.password).toBeUndefined();
        });

        it('should reject without token → 401', async () => {
            const res = await request(app).get('/api/auth/me');
            expect(res.status).toBe(401);
        });

        it('should reject with invalid token → 401', async () => {
            const res = await request(app)
                .get('/api/auth/me')
                .set('Authorization', 'Bearer invalid.token.here');

            expect(res.status).toBe(401);
        });

        it('should reject with expired token → 401', async () => {
            const jwt = require('jsonwebtoken');
            const expiredToken = jwt.sign(
                { userId: 1, email: 'test@test.com', role: 'admin' },
                process.env.JWT_SECRET,
                { expiresIn: '0s' }
            );

            // Small delay to ensure token expires
            await new Promise(resolve => setTimeout(resolve, 100));

            const res = await request(app)
                .get('/api/auth/me')
                .set('Authorization', `Bearer ${expiredToken}`);

            expect(res.status).toBe(401);
            expect(res.body.error).toContain('wygasł');
        });

        it('should reject token for non-existent user → 401', async () => {
            const fakeToken = generateToken({
                userId: 99999,
                email: 'deleted@test.com',
                role: 'admin',
            });

            const res = await request(app)
                .get('/api/auth/me')
                .set('Authorization', `Bearer ${fakeToken}`);

            expect(res.status).toBe(401);
        });

        it('should reject empty Bearer header (Bearer with space only) → 401', async () => {
            const res = await request(app)
                .get('/api/auth/me')
                .set('Authorization', 'Bearer ');

            expect(res.status).toBe(401);
        });

        it('should reject disabled user via middleware → 403', async () => {
            // Create user, get token, then disable
            const user = await registerUser(
                'disabletest@test.com', 'pass12345678', 'Disable Test', 'worker', db
            );
            const token = generateToken({
                userId: user.id,
                email: user.email,
                role: user.role,
            });
            // Disable user
            execute(
                `UPDATE users SET is_active = 0 WHERE id = ${user.id}`,
                [],
                db
            );
            const res = await request(app)
                .get('/api/auth/me')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(403);
            expect(res.body.error).toContain('dezaktywowane');
        });
    });

    // ============================================================
    // Health check (regression — should still work)
    // ============================================================
    describe('GET /api/health (regression)', () => {
        it('should return 200 ok', async () => {
            const res = await request(app).get('/api/health');
            expect(res.status).toBe(200);
            expect(res.body.status).toBe('ok');
        });
    });
});
