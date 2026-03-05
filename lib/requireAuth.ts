import { NextRequest, NextResponse } from 'next/server';
import { AppRole, AuthTokenPayload, verifyAuthToken } from './auth';
import { AUTH_COOKIE_NAME } from './authSession';

type RequireAuthSuccess = {
    ok: true;
    auth: AuthTokenPayload;
};

type RequireAuthFailure = {
    ok: false;
    response: NextResponse;
};

export function requireAuth(request: NextRequest, allowedRoles?: AppRole[]): RequireAuthSuccess | RequireAuthFailure {
    const authHeader = request.headers.get('authorization');
    const cookieToken = request.cookies.get(AUTH_COOKIE_NAME)?.value;

    const tokenFromHeader = authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.slice('Bearer '.length)
        : null;

    const token = tokenFromHeader || cookieToken;

    if (!token) {
        return {
            ok: false,
            response: NextResponse.json({ error: 'Missing authorization token' }, { status: 401 })
        };
    }

    try {
        const auth = verifyAuthToken(token);

        if (allowedRoles && !allowedRoles.includes(auth.role)) {
            return {
                ok: false,
                response: NextResponse.json({ error: 'Forbidden' }, { status: 403 })
            };
        }

        return { ok: true, auth };
    } catch {
        return {
            ok: false,
            response: NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
        };
    }
}