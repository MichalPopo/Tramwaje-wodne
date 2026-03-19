import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { loginUser, registerUser, getUserById, listUsers, toggleUserActive, changePassword } from '../services/auth.service.js';
import { loginSchema, registerSchema } from '../services/validation.js';
import { authMiddleware, roleGuard } from '../middleware/auth.js';
import { ZodError } from 'zod';

const router = Router();

// Rate limit login attempts: 10 per 15 minutes per IP
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Zbyt wiele prób logowania. Spróbuj ponownie za 15 minut.' },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * POST /api/auth/login
 * Public — email + password → JWT token
 */
router.post('/login', loginLimiter, async (req, res) => {
    try {
        const { email, password } = loginSchema.parse(req.body);
        const result = await loginUser(email, password);

        res.json({
            token: result.token,
            user: result.user,
        });
    } catch (error) {
        if (error instanceof ZodError) {
            res.status(400).json({
                error: 'Błąd walidacji',
                details: error.errors.map(e => ({
                    field: e.path.join('.'),
                    message: e.message,
                })),
            });
            return;
        }

        if (error instanceof Error) {
            if (error.message === 'INVALID_CREDENTIALS') {
                res.status(401).json({ error: 'Nieprawidłowy email lub hasło' });
                return;
            }
        }

        res.status(500).json({ error: 'Wewnętrzny błąd serwera' });
    }
});

/**
 * POST /api/auth/register
 * 🔒 Admin only — create new user account
 */
router.post('/register', authMiddleware, roleGuard('admin'), async (req, res) => {
    try {
        const { email, password, name, role } = registerSchema.parse(req.body);
        const user = await registerUser(email, password, name, role);

        res.status(201).json({ user });
    } catch (error) {
        if (error instanceof ZodError) {
            res.status(400).json({
                error: 'Błąd walidacji',
                details: error.errors.map(e => ({
                    field: e.path.join('.'),
                    message: e.message,
                })),
            });
            return;
        }

        if (error instanceof Error) {
            if (error.message === 'DUPLICATE_EMAIL') {
                res.status(409).json({ error: 'Użytkownik z tym emailem już istnieje' });
                return;
            }
        }

        res.status(500).json({ error: 'Wewnętrzny błąd serwera' });
    }
});

/**
 * GET /api/auth/me
 * Authenticated — returns current user data
 */
router.get('/me', authMiddleware, async (req, res) => {
    if (!req.user) {
        res.status(401).json({ error: 'Brak autoryzacji' });
        return;
    }

    // Re-fetch to get latest data
    const user = await getUserById(req.user.id);
    if (!user) {
        res.status(404).json({ error: 'Użytkownik nie znaleziony' });
        return;
    }

    res.json({ user });
});

/**
 * GET /api/auth/users
 * 🔒 Admin only — list all team members
 */
router.get('/users', authMiddleware, roleGuard('admin'), async (_req, res) => {
    const users = await listUsers();
    res.json({ users });
});

/**
 * PATCH /api/auth/users/:id/active
 * 🔒 Admin only — activate/deactivate user
 */
router.patch('/users/:id/active', authMiddleware, roleGuard('admin'), async (req, res) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id) || id <= 0) {
        res.status(400).json({ error: 'Nieprawidłowe ID użytkownika' });
        return;
    }

    // Prevent self-deactivation
    if (id === req.user!.id) {
        res.status(400).json({ error: 'Nie możesz dezaktywować swojego konta' });
        return;
    }

    const isActive = req.body.is_active;
    if (typeof isActive !== 'boolean') {
        res.status(400).json({ error: 'Pole is_active musi być boolean' });
        return;
    }

    const user = await toggleUserActive(id, isActive);
    if (!user) {
        res.status(404).json({ error: 'Użytkownik nie znaleziony' });
        return;
    }

    res.json({ user });
});

/**
 * PATCH /api/auth/users/:id/password
 * 🔒 Admin or self — change user password
 */
router.patch('/users/:id/password', authMiddleware, async (req, res) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id) || id <= 0) {
        res.status(400).json({ error: 'Nieprawidłowe ID użytkownika' });
        return;
    }

    // Only admin can change other users' passwords
    if (req.user!.role !== 'admin' && req.user!.id !== id) {
        res.status(403).json({ error: 'Brak uprawnień' });
        return;
    }

    const { new_password, old_password } = req.body as { new_password?: string; old_password?: string };
    if (!new_password || new_password.length < 8 || new_password.length > 128) {
        res.status(400).json({ error: 'Nowe hasło musi mieć 8-128 znaków' });
        return;
    }

    try {
        const ok = await changePassword(id, new_password, req.user!, old_password);
        if (!ok) {
            res.status(404).json({ error: 'Użytkownik nie znaleziony' });
            return;
        }
        res.json({ ok: true });
    } catch (error) {
        if (error instanceof Error) {
            if (error.message === 'OLD_PASSWORD_REQUIRED') {
                res.status(400).json({ error: 'Podaj aktualne hasło' });
                return;
            }
            if (error.message === 'INVALID_OLD_PASSWORD') {
                res.status(401).json({ error: 'Nieprawidłowe aktualne hasło' });
                return;
            }
        }
        res.status(500).json({ error: 'Wewnętrzny błąd serwera' });
    }
});

/**
 * DELETE /api/auth/users/:id
 * 🔒 Admin only — permanently delete user and clean up references
 */
router.delete('/users/:id', authMiddleware, roleGuard('admin'), async (req, res) => {
    const { execute } = await import('../db/database.js');
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id) || id <= 0) {
        res.status(400).json({ error: 'Nieprawidłowe ID użytkownika' });
        return;
    }

    // Prevent self-deletion
    if (id === req.user!.id) {
        res.status(400).json({ error: 'Nie możesz usunąć swojego konta' });
        return;
    }

    const target = await getUserById(id);
    if (!target) {
        res.status(404).json({ error: 'Użytkownik nie znaleziony' });
        return;
    }

    // Remove task assignments
    await execute('DELETE FROM task_assignments WHERE user_id = ?', [id]);
    // Remove time logs
    await execute('UPDATE time_logs SET user_id = NULL WHERE user_id = ?', [id]);
    // Remove expenses created by
    await execute('UPDATE expenses SET created_by = NULL WHERE created_by = ?', [id]);
    // Delete user
    await execute('DELETE FROM users WHERE id = ?', [id]);

    res.json({ deleted: true });
});

export default router;
