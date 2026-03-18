import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { queryAll, queryOne, execute } from '../db/database.js';
import type { Database } from 'sql.js';

const BCRYPT_ROUNDS = 12;
// Dummy hash for timing-safe comparison when user doesn't exist
const DUMMY_HASH = '$2a$12$000000000000000000000uGzGP8Ux5TRzU4HKbTfIGJr8L456e2';

function getJwtSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
        throw new Error('JWT_SECRET must be set and at least 32 characters long');
    }
    return secret;
}

function getJwtExpiry(): string {
    return process.env.JWT_EXPIRES_IN || '24h';
}

// --- Types ---

interface UserRow {
    id: number;
    email: string;
    password: string;
    name: string;
    role: string;
    is_active: number;
    created_at: string;
    updated_at: string;
}

export interface JwtPayload {
    userId: number;
    email: string;
    role: string;
}

export interface SafeUser {
    id: number;
    email: string;
    name: string;
    role: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

// --- Helpers ---

/** Strip password from user row and convert is_active to boolean */
function toSafeUser(row: UserRow): SafeUser {
    return {
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
        is_active: Boolean(row.is_active),
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

// --- Service functions ---

export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function comparePassword(
    password: string,
    hash: string
): Promise<boolean> {
    return bcrypt.compare(password, hash);
}

export function generateToken(payload: JwtPayload): string {
    return jwt.sign(
        payload as unknown as object,
        getJwtSecret(),
        { expiresIn: getJwtExpiry() } as jwt.SignOptions
    );
}

export function verifyToken(token: string): JwtPayload {
    return jwt.verify(token, getJwtSecret()) as JwtPayload;
}

export function findUserByEmail(
    email: string,
    database?: Database
): UserRow | undefined {
    return queryOne<UserRow>(
        'SELECT * FROM users WHERE email = ?',
        [email.toLowerCase().trim()],
        database
    );
}

export function findUserById(
    id: number,
    database?: Database
): UserRow | undefined {
    return queryOne<UserRow>(
        'SELECT * FROM users WHERE id = ?',
        [id],
        database
    );
}

export async function registerUser(
    email: string,
    password: string,
    name: string,
    role: string,
    database?: Database
): Promise<SafeUser> {
    const normalizedEmail = email.toLowerCase().trim();

    // Check for duplicate email
    const existing = findUserByEmail(normalizedEmail, database);
    if (existing) {
        throw new Error('DUPLICATE_EMAIL');
    }

    const hashedPassword = await hashPassword(password);

    const result = execute(
        'INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)',
        [normalizedEmail, hashedPassword, name.trim(), role],
        database
    );

    const user = findUserById(result.lastInsertRowid, database);
    if (!user) {
        throw new Error('Failed to create user');
    }

    return toSafeUser(user);
}

export async function loginUser(
    email: string,
    password: string,
    database?: Database
): Promise<{ token: string; user: SafeUser }> {
    const user = findUserByEmail(email, database);

    // Timing-safe: always run bcrypt even if user doesn't exist
    const hashToCompare = user ? user.password : DUMMY_HASH;
    const passwordValid = await comparePassword(password, hashToCompare);

    if (!user || !passwordValid) {
        throw new Error('INVALID_CREDENTIALS');
    }

    if (!user.is_active) {
        // Don't reveal account exists — same error as invalid credentials
        throw new Error('INVALID_CREDENTIALS');
    }

    const token = generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
    });

    return { token, user: toSafeUser(user) };
}

export function getUserById(
    id: number,
    database?: Database
): SafeUser | undefined {
    const user = findUserById(id, database);
    if (!user) return undefined;
    return toSafeUser(user);
}

export function listUsers(database?: Database): SafeUser[] {
    const rows = queryAll<UserRow>(
        'SELECT * FROM users ORDER BY id',
        [],
        database,
    );
    return rows.map(toSafeUser);
}

export function toggleUserActive(
    id: number,
    isActive: boolean,
    database?: Database,
): SafeUser | undefined {
    const user = findUserById(id, database);
    if (!user) return undefined;

    execute(
        'UPDATE users SET is_active = ? WHERE id = ?',
        [isActive ? 1 : 0, id],
        database,
    );

    return getUserById(id, database);
}

/**
 * Change user password.
 * Admin can change any user's password (no old password needed).
 * Regular user must provide their old password.
 */
export async function changePassword(
    targetUserId: number,
    newPassword: string,
    requestingUser: { id: number; role: string },
    oldPassword?: string,
    database?: Database
): Promise<boolean> {
    const user = findUserById(targetUserId, database);
    if (!user) return false;

    // Non-admin changing their own password must provide old password
    if (requestingUser.role !== 'admin' || requestingUser.id === targetUserId) {
        if (requestingUser.id !== targetUserId) return false; // worker can't change others
        if (!oldPassword) throw new Error('OLD_PASSWORD_REQUIRED');
        const valid = await comparePassword(oldPassword, user.password);
        if (!valid) throw new Error('INVALID_OLD_PASSWORD');
    }

    const hashed = await hashPassword(newPassword);
    execute('UPDATE users SET password = ? WHERE id = ?', [hashed, targetUserId], database);
    return true;
}

// Export for testing
export { toSafeUser, getJwtSecret, UserRow };
