import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Database } from 'sql.js';
import { createTestDatabase, queryOne, execute } from '../db/database.js';
import {
    hashPassword,
    comparePassword,
    generateToken,
    verifyToken,
    registerUser,
    loginUser,
    getUserById,
    findUserByEmail,
} from '../services/auth.service.js';

// Set JWT_SECRET for tests
process.env.JWT_SECRET = 'test-secret-must-be-at-least-32-characters-long!!';
process.env.JWT_EXPIRES_IN = '1h';

describe('Auth — Faza 1.2', () => {
    let db: Database;

    beforeAll(async () => {
        db = await createTestDatabase();
    });

    afterAll(() => {
        db.close();
    });

    // Clean up test users before each test
    beforeEach(() => {
        execute("DELETE FROM users WHERE email LIKE '%@test.com'", [], db);
    });

    // ============================================================
    // AUTH SERVICE — Password hashing
    // ============================================================
    describe('Password hashing', () => {
        it('should hash a password with bcrypt', async () => {
            const hash = await hashPassword('testpassword123');
            expect(hash).toBeDefined();
            expect(hash).not.toBe('testpassword123');
            expect(hash.startsWith('$2a$') || hash.startsWith('$2b$')).toBe(true);
        });

        it('should produce different hashes for the same password', async () => {
            const hash1 = await hashPassword('samepassword');
            const hash2 = await hashPassword('samepassword');
            expect(hash1).not.toBe(hash2); // Salt differs
        });

        it('should verify correct password', async () => {
            const hash = await hashPassword('correctpassword');
            const result = await comparePassword('correctpassword', hash);
            expect(result).toBe(true);
        });

        it('should reject wrong password', async () => {
            const hash = await hashPassword('correctpassword');
            const result = await comparePassword('wrongpassword', hash);
            expect(result).toBe(false);
        });
    });

    // ============================================================
    // AUTH SERVICE — JWT
    // ============================================================
    describe('JWT', () => {
        it('should generate a valid JWT token', () => {
            const token = generateToken({
                userId: 1,
                email: 'test@test.com',
                role: 'admin',
            });
            expect(token).toBeDefined();
            expect(typeof token).toBe('string');
            expect(token.split('.')).toHaveLength(3); // header.payload.signature
        });

        it('should verify a valid token and return payload', () => {
            const token = generateToken({
                userId: 42,
                email: 'kapitan@tramwaje.pl',
                role: 'admin',
            });
            const payload = verifyToken(token);
            expect(payload.userId).toBe(42);
            expect(payload.email).toBe('kapitan@tramwaje.pl');
            expect(payload.role).toBe('admin');
        });

        it('should reject an invalid token', () => {
            expect(() => verifyToken('invalid.token.here')).toThrow();
        });

        it('should reject a token with wrong secret', () => {
            // Manually create a token with different secret
            const jwt = require('jsonwebtoken');
            const wrongToken = jwt.sign(
                { userId: 1, email: 'test@test.com', role: 'admin' },
                'different-secret-key-also-32-chars-long!!'
            );
            expect(() => verifyToken(wrongToken)).toThrow();
        });

        it('should reject JWT_SECRET shorter than 32 chars', () => {
            const original = process.env.JWT_SECRET;
            process.env.JWT_SECRET = 'short';
            expect(() => generateToken({
                userId: 1,
                email: 'test@test.com',
                role: 'admin',
            })).toThrow('JWT_SECRET must be set and at least 32 characters long');
            process.env.JWT_SECRET = original;
        });
    });

    // ============================================================
    // AUTH SERVICE — User registration
    // ============================================================
    describe('User registration', () => {
        it('should register a new user', async () => {
            const user = await registerUser(
                'newuser@test.com',
                'securepassword123',
                'Jan Kowalski',
                'worker',
                db
            );
            expect(user.id).toBeGreaterThan(0);
            expect(user.email).toBe('newuser@test.com');
            expect(user.name).toBe('Jan Kowalski');
            expect(user.role).toBe('worker');
            expect(user.is_active).toBe(true);
            // Password should NOT be in the safe user
            expect((user as unknown as Record<string, unknown>).password).toBeUndefined();
        });

        it('should hash password in database (not store plaintext)', async () => {
            await registerUser(
                'hashcheck@test.com',
                'myplaintextpassword',
                'Test User',
                'worker',
                db
            );
            const row = queryOne<{ password: string }>(
                "SELECT password FROM users WHERE email = 'hashcheck@test.com'",
                [],
                db
            );
            expect(row).toBeDefined();
            expect(row!.password).not.toBe('myplaintextpassword');
            expect(row!.password.startsWith('$2a$') || row!.password.startsWith('$2b$')).toBe(true);
        });

        it('should reject duplicate email', async () => {
            await registerUser('dupe@test.com', 'password123', 'First', 'worker', db);
            await expect(
                registerUser('dupe@test.com', 'password456', 'Second', 'admin', db)
            ).rejects.toThrow('DUPLICATE_EMAIL');
        });

        it('should allow different roles (admin and worker)', async () => {
            const admin = await registerUser('admin@test.com', 'pass12345678', 'Admin', 'admin', db);
            const worker = await registerUser('worker@test.com', 'pass12345678', 'Worker', 'worker', db);
            expect(admin.role).toBe('admin');
            expect(worker.role).toBe('worker');
        });
    });

    // ============================================================
    // AUTH SERVICE — User login
    // ============================================================
    describe('User login', () => {
        beforeEach(async () => {
            execute("DELETE FROM users WHERE email LIKE '%@test.com'", [], db);
            await registerUser('login@test.com', 'password123', 'Login User', 'admin', db);
        });

        it('should login with valid credentials', async () => {
            const result = await loginUser('login@test.com', 'password123', db);
            expect(result.token).toBeDefined();
            expect(result.token.split('.')).toHaveLength(3);
            expect(result.user.email).toBe('login@test.com');
            expect(result.user.name).toBe('Login User');
            expect(result.user.role).toBe('admin');
            // Verify token is valid
            const payload = verifyToken(result.token);
            expect(payload.userId).toBe(result.user.id);
        });

        it('should reject wrong password', async () => {
            await expect(
                loginUser('login@test.com', 'wrongpassword', db)
            ).rejects.toThrow('INVALID_CREDENTIALS');
        });

        it('should reject non-existent email', async () => {
            await expect(
                loginUser('noexist@test.com', 'password123', db)
            ).rejects.toThrow('INVALID_CREDENTIALS');
        });

        it('should reject disabled account (same error as invalid credentials)', async () => {
            // Deactivate the user
            execute(
                "UPDATE users SET is_active = 0 WHERE email = 'login@test.com'",
                [],
                db
            );
            await expect(
                loginUser('login@test.com', 'password123', db)
            ).rejects.toThrow('INVALID_CREDENTIALS');
        });
    });

    // ============================================================
    // AUTH SERVICE — getUserById
    // ============================================================
    describe('getUserById', () => {
        it('should return safe user for existing ID', async () => {
            const registered = await registerUser(
                'byid@test.com', 'pass12345678', 'By ID', 'worker', db
            );
            const user = getUserById(registered.id, db);
            expect(user).toBeDefined();
            expect(user!.email).toBe('byid@test.com');
            expect((user as unknown as Record<string, unknown>).password).toBeUndefined();
        });

        it('should return undefined for non-existent ID', () => {
            const user = getUserById(99999, db);
            expect(user).toBeUndefined();
        });
    });

    // ============================================================
    // AUTH SERVICE — findUserByEmail
    // ============================================================
    describe('findUserByEmail', () => {
        it('should return full user row (with password) for existing email', async () => {
            await registerUser('find@test.com', 'pass12345678', 'Find Me', 'admin', db);
            const user = findUserByEmail('find@test.com', db);
            expect(user).toBeDefined();
            expect(user!.password).toBeDefined(); // Raw row includes password
            expect(user!.email).toBe('find@test.com');
        });

        it('should return undefined for non-existent email', () => {
            const user = findUserByEmail('nonexistent@test.com', db);
            expect(user).toBeUndefined();
        });
    });
});
