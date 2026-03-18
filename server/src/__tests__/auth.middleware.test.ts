import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authMiddleware, roleGuard } from '../middleware/auth.js';

// Set env for tests
process.env.JWT_SECRET = 'test-secret-must-be-at-least-32-characters-long!!';

describe('Auth Middleware — Unit Tests', () => {
    function createMiddlewareApp() {
        const app = express();

        // Protected route using authMiddleware
        app.get('/protected', authMiddleware, (_req, res) => {
            res.json({ user: _req.user });
        });

        // Route with roleGuard but no authMiddleware (edge case)
        app.get('/role-only', roleGuard('admin'), (_req, res) => {
            res.json({ ok: true });
        });

        return app;
    }

    it('should reject "Bearer " with empty token (space only)', async () => {
        const app = createMiddlewareApp();
        const res = await request(app)
            .get('/protected')
            .set('Authorization', 'Bearer ');

        expect(res.status).toBe(401);
    });

    it('roleGuard should return 401 when req.user is not set', async () => {
        const app = createMiddlewareApp();
        const res = await request(app).get('/role-only');

        expect(res.status).toBe(401);
        expect(res.body.error).toBe('Brak autoryzacji');
    });
});
