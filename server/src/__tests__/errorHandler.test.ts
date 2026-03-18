import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { errorHandler, createAppError } from '../middleware/errorHandler.js';

describe('Error Handler', () => {
    function createTestApp() {
        const app = express();

        // Route that throws operational error
        app.get('/operational', (_req, _res) => {
            throw createAppError('Not Found', 404);
        });

        // Route that throws generic error
        app.get('/generic', (_req, _res) => {
            throw new Error('Something broke');
        });

        app.use(errorHandler);
        return app;
    }

    it('createAppError should set statusCode and isOperational', () => {
        const err = createAppError('Test error', 422);
        expect(err.message).toBe('Test error');
        expect(err.statusCode).toBe(422);
        expect(err.isOperational).toBe(true);
    });

    it('should return operational error message and status code', async () => {
        const app = createTestApp();
        const res = await request(app).get('/operational');
        expect(res.status).toBe(404);
        expect(res.body.error).toBe('Not Found');
    });

    it('should hide generic error message (500) and show generic message', async () => {
        const app = createTestApp();
        const res = await request(app).get('/generic');
        expect(res.status).toBe(500);
        expect(res.body.error).toBe('Wewnętrzny błąd serwera');
    });

    it('should include stack trace in development mode for 500', async () => {
        const original = process.env.NODE_ENV;
        process.env.NODE_ENV = 'development';

        const app = createTestApp();
        const res = await request(app).get('/generic');
        expect(res.status).toBe(500);
        expect(res.body.stack).toBeDefined();

        process.env.NODE_ENV = original;
    });

    it('should NOT include stack trace in production mode', async () => {
        const original = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';

        const app = createTestApp();
        const res = await request(app).get('/generic');
        expect(res.status).toBe(500);
        expect(res.body.stack).toBeUndefined();

        process.env.NODE_ENV = original;
    });
});
