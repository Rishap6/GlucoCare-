import { NextResponse } from 'next/server';
import { prisma } from '@/lib/dbDB';
import { hashPassword } from '@/lib/auth';
import { extractRequestMeta, safeAuditLog } from '@/lib/audit';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^(\+91[\s-]?)?[6-9]\d{9}$/;

export async function POST(request: Request) {
    const configuredSecret = process.env.ADMIN_BOOTSTRAP_SECRET;
    const providedSecret = request.headers.get('x-admin-bootstrap-secret');

    if (!configuredSecret) {
        return NextResponse.json({ error: 'Admin bootstrap is not configured' }, { status: 403 });
    }

    if (!providedSecret || providedSecret !== configuredSecret) {
        return NextResponse.json({ error: 'Invalid bootstrap secret' }, { status: 403 });
    }

    const existingAdmin = await prisma.user.findFirst({ where: { role: 'admin' } });
    if (existingAdmin) {
        return NextResponse.json({ error: 'Admin account already exists' }, { status: 409 });
    }

    const body = await request.json();
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const phone = String(body.phone || '').trim();
    const password = String(body.password || '');
    const requestMeta = extractRequestMeta(request.headers);

    if (!name || !email || !phone || !password) {
        return NextResponse.json({ error: 'name, email, phone, password are required' }, { status: 400 });
    }

    if (!EMAIL_REGEX.test(email)) {
        return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    if (!PHONE_REGEX.test(phone)) {
        return NextResponse.json({ error: 'Invalid phone number format' }, { status: 400 });
    }

    if (password.length < 8) {
        return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const duplicate = await prisma.user.findUnique({ where: { email } });
    if (duplicate) {
        return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);

    const admin = await prisma.user.create({
        data: {
            name,
            email,
            phone,
            role: 'admin',
            password: passwordHash,
            isActive: true
        }
    });

    await safeAuditLog(prisma, {
        actorUserId: admin.id,
        targetUserId: admin.id,
        action: 'admin_bootstrap_created',
        entityType: 'user',
        entityId: admin.id,
        metadata: {
            role: admin.role,
            email: admin.email
        },
        ...requestMeta
    });

    return NextResponse.json({
        success: true,
        user: {
            id: admin.id,
            name: admin.name,
            email: admin.email,
            role: admin.role
        }
    }, { status: 201 });
}
