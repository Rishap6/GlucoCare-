import { NextResponse } from 'next/server';
import { prisma } from '@/lib/dbDB';
import { AppRole, hashPassword, signAuthToken, verifyPassword } from '@/lib/auth';
import { AUTH_COOKIE_NAME, ROLE_COOKIE_NAME } from '@/lib/authSession';
import { extractRequestMeta, safeAuditLog } from '@/lib/audit';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^(\+91[\s-]?)?[6-9]\d{9}$/;

function withAuthCookies(response: NextResponse, token: string, role: AppRole) {
    const isProd = process.env.NODE_ENV === 'production';

    response.cookies.set(AUTH_COOKIE_NAME, token, {
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7
    });

    response.cookies.set(ROLE_COOKIE_NAME, role, {
        httpOnly: false,
        secure: isProd,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7
    });

    return response;
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { action } = body;
        const requestMeta = extractRequestMeta(request.headers);

        if (action === 'logout') {
            const response = NextResponse.json({ success: true });
            response.cookies.delete(AUTH_COOKIE_NAME);
            response.cookies.delete(ROLE_COOKIE_NAME);
            return response;
        }

        if (action === 'register') {
            const role = body.role as AppRole;
            const email = String(body.email || '').trim().toLowerCase();
            const password = String(body.password || '');
            const phone = String(body.phone || '').trim();

            if (!email || !password || !body.name || !body.phone || !role) {
                return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
            }

            if (!EMAIL_REGEX.test(email)) {
                return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
            }

            if (!PHONE_REGEX.test(phone)) {
                return NextResponse.json({ error: 'Invalid phone number format' }, { status: 400 });
            }

            if (!['patient', 'doctor'].includes(role)) {
                return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
            }

            if (password.length < 8) {
                return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
            }

            const existingUser = await prisma.user.findUnique({ where: { email } });
            if (existingUser) {
                return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
            }

            const passwordHash = await hashPassword(password);

            const patientAge = role === 'patient' && Number.isFinite(Number(body.age)) ? Number(body.age) : null;
            const patientGender = role === 'patient' ? String(body.gender || '') : null;

            if (role === 'patient') {
                if (!patientAge || patientAge < 1 || patientAge > 120) {
                    return NextResponse.json({ error: 'Patient age must be between 1 and 120' }, { status: 400 });
                }

                if (!['Male', 'Female', 'Other'].includes(patientGender || '')) {
                    return NextResponse.json({ error: 'Invalid patient gender' }, { status: 400 });
                }
            }

            if (role === 'doctor') {
                if (!body.specialization || !body.medicalRegistrationNo || !body.hospitalName) {
                    return NextResponse.json({ error: 'Missing doctor profile fields' }, { status: 400 });
                }
            }

            const user = await prisma.user.create({
                data: {
                    name: String(body.name).trim(),
                    email,
                    phone,
                    role,
                    password: passwordHash,
                    specialization: body.specialization || null,
                    medicalRegistrationNo: body.medicalRegistrationNo || null,
                    hospitalName: body.hospitalName || null,
                    age: patientAge,
                    gender: patientGender,
                    ...(role === 'patient'
                        ? {
                            patientProfile: {
                                create: {
                                    age: patientAge,
                                    gender: patientGender
                                }
                            }
                        }
                        : {
                            doctorProfile: {
                                create: {
                                    specialization: body.specialization || null,
                                    medicalRegistrationNo: body.medicalRegistrationNo || null,
                                    hospitalName: body.hospitalName || null
                                }
                            }
                        })
                }
            });

            const token = signAuthToken({ userId: user.id, role: user.role as AppRole, email: user.email });

            await safeAuditLog(prisma, {
                actorUserId: user.id,
                targetUserId: user.id,
                action: 'user_register_success',
                entityType: 'user',
                entityId: user.id,
                metadata: { role: user.role, email: user.email },
                ...requestMeta
            });

            const response = NextResponse.json({
                success: true,
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role
                }
            });

            return withAuthCookies(response, token, user.role as AppRole);
        }

        if (action === 'login') {
            const email = String(body.email || '').trim().toLowerCase();
            const password = String(body.password || '');

            if (!email || !password) {
                return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
            }

            if (!EMAIL_REGEX.test(email)) {
                return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
            }

            const user = await prisma.user.findUnique({ where: { email } });

            if (!user) {
                await safeAuditLog(prisma, {
                    action: 'user_login_failed',
                    entityType: 'auth',
                    metadata: { reason: 'user_not_found', email },
                    ...requestMeta
                });
                return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
            }

            const isPasswordValid = await verifyPassword(password, user.password);
            if (!isPasswordValid) {
                await safeAuditLog(prisma, {
                    actorUserId: user.id,
                    targetUserId: user.id,
                    action: 'user_login_failed',
                    entityType: 'auth',
                    entityId: user.id,
                    metadata: { reason: 'invalid_password', email },
                    ...requestMeta
                });
                return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
            }

            if (!user.isActive) {
                await safeAuditLog(prisma, {
                    actorUserId: user.id,
                    targetUserId: user.id,
                    action: 'user_login_failed',
                    entityType: 'auth',
                    entityId: user.id,
                    metadata: { reason: 'account_inactive', email },
                    ...requestMeta
                });
                return NextResponse.json({ error: 'Account is inactive. Contact administrator.' }, { status: 403 });
            }

            const token = signAuthToken({ userId: user.id, role: user.role as AppRole, email: user.email });

            await safeAuditLog(prisma, {
                actorUserId: user.id,
                targetUserId: user.id,
                action: 'user_login_success',
                entityType: 'auth',
                entityId: user.id,
                metadata: { role: user.role, email: user.email },
                ...requestMeta
            });

            const response = NextResponse.json({
                success: true,
                token,
                role: user.role,
                id: user.id,
                name: user.name
            });

            return withAuthCookies(response, token, user.role as AppRole);
        }

        return NextResponse.json({ error: 'Unsupported auth action' }, { status: 400 });

    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
