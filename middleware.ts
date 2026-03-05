import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, ROLE_COOKIE_NAME, decodeJwtPayload } from '@/lib/authSession';

function isTokenExpired(exp?: number): boolean {
    if (!exp) {
        return true;
    }

    const nowInSeconds = Math.floor(Date.now() / 1000);
    return exp <= nowInSeconds;
}

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (!pathname.startsWith('/dashboard') && !pathname.startsWith('/activity') && !pathname.startsWith('/admin')) {
        return NextResponse.next();
    }

    const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
    const roleFromCookie = request.cookies.get(ROLE_COOKIE_NAME)?.value;

    if (!token) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    const decoded = decodeJwtPayload(token);
    if (!decoded || isTokenExpired(decoded.exp)) {
        const response = NextResponse.redirect(new URL('/login', request.url));
        response.cookies.delete(AUTH_COOKIE_NAME);
        response.cookies.delete(ROLE_COOKIE_NAME);
        return response;
    }

    const role = roleFromCookie || decoded.role;

    if (pathname.startsWith('/dashboard/doctor') && role !== 'doctor') {
        if (role === 'admin') {
            return NextResponse.redirect(new URL('/admin', request.url));
        }
        return NextResponse.redirect(new URL('/dashboard/patient', request.url));
    }

    if (pathname.startsWith('/dashboard/patient') && role !== 'patient') {
        if (role === 'admin') {
            return NextResponse.redirect(new URL('/admin', request.url));
        }
        return NextResponse.redirect(new URL('/dashboard/doctor', request.url));
    }

    if (pathname.startsWith('/admin') && role !== 'admin') {
        if (role === 'doctor') {
            return NextResponse.redirect(new URL('/dashboard/doctor', request.url));
        }
        return NextResponse.redirect(new URL('/dashboard/patient', request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/dashboard/:path*', '/activity/:path*', '/admin/:path*']
};