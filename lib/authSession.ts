import { AppRole } from './auth';

export const AUTH_COOKIE_NAME = 'gc_auth_token';
export const ROLE_COOKIE_NAME = 'gc_user_role';

export type DecodedTokenPayload = {
    userId?: string;
    role?: AppRole;
    email?: string;
    exp?: number;
};

export function decodeJwtPayload(token: string): DecodedTokenPayload | null {
    try {
        const [, payload] = token.split('.');
        if (!payload) {
            return null;
        }

        const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');

        const rawJson = typeof atob === 'function'
            ? atob(padded)
            : Buffer.from(padded, 'base64').toString('utf-8');

        const decoded = JSON.parse(rawJson);
        return decoded as DecodedTokenPayload;
    } catch {
        return null;
    }
}