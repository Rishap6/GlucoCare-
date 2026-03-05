import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export type AppRole = 'patient' | 'doctor' | 'admin';

export type AuthTokenPayload = {
    userId: string;
    role: AppRole;
    email: string;
};

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-me';
const TOKEN_EXPIRY = '7d';

export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
}

export function signAuthToken(payload: AuthTokenPayload): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
    return jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
}