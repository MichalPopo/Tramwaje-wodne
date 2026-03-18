import type { Request, Response, NextFunction } from 'express';
import { verifyToken, getUserById } from '../services/auth.service.js';
import type { SafeUser } from '../services/auth.service.js';

// Extend Express Request to include user
declare global {
    namespace Express {
        interface Request {
            user?: SafeUser;
        }
    }
}

/**
 * JWT authentication middleware.
 * Verifies the Bearer token and attaches user to request.
 */
export function authMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Brak tokenu autoryzacji' });
        return;
    }

    const token = authHeader.slice(7); // Remove 'Bearer '

    if (!token) {
        res.status(401).json({ error: 'Pusty token' });
        return;
    }

    try {
        const payload = verifyToken(token);
        const user = getUserById(payload.userId);

        if (!user) {
            res.status(401).json({ error: 'Użytkownik nie istnieje' });
            return;
        }

        if (!user.is_active) {
            res.status(403).json({ error: 'Konto jest dezaktywowane' });
            return;
        }

        req.user = user;
        next();
    } catch (error) {
        if (error instanceof Error && error.name === 'TokenExpiredError') {
            res.status(401).json({ error: 'Token wygasł' });
            return;
        }
        res.status(401).json({ error: 'Nieprawidłowy token' });
    }
}

/**
 * Role-based access control middleware.
 * Must be used AFTER authMiddleware.
 */
export function roleGuard(...allowedRoles: string[]) {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({ error: 'Brak autoryzacji' });
            return;
        }

        if (!allowedRoles.includes(req.user.role)) {
            res.status(403).json({ error: 'Brak uprawnień' });
            return;
        }

        next();
    };
}
