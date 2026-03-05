import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/dbDB';
import { requireAuth } from '@/lib/requireAuth';
import { extractRequestMeta, safeAuditLog } from '@/lib/audit';

export async function GET(request: NextRequest) {
    const authResult = requireAuth(request, ['doctor']);
    if (!authResult.ok) {
        return authResult.response;
    }

    const patientId = String(request.nextUrl.searchParams.get('patientId') || '').trim();
    if (!patientId) {
        return NextResponse.json({ error: 'patientId is required' }, { status: 400 });
    }

    const assignment = await prisma.doctorPatientAssignment.findUnique({
        where: {
            doctorId_patientId: {
                doctorId: authResult.auth.userId,
                patientId
            }
        }
    });

    if (!assignment) {
        return NextResponse.json({ error: 'Patient is not assigned to this doctor' }, { status: 403 });
    }

    const reminders = await prisma.reminder.findMany({
        where: {
            patientId,
            doctorId: authResult.auth.userId
        },
        orderBy: [{ isDone: 'asc' }, { remindAt: 'asc' }],
        take: 50
    });

    return NextResponse.json({ reminders });
}

export async function POST(request: NextRequest) {
    const authResult = requireAuth(request, ['doctor']);
    if (!authResult.ok) {
        return authResult.response;
    }

    const requestMeta = extractRequestMeta(request.headers);
    const body = await request.json();

    const patientId = String(body.patientId || '').trim();
    const title = String(body.title || '').trim();
    const message = String(body.message || '').trim();
    const remindAtRaw = String(body.remindAt || '').trim();
    const remindAt = new Date(remindAtRaw);

    if (!patientId || !title || !message || !remindAtRaw) {
        return NextResponse.json({ error: 'patientId, title, message and remindAt are required' }, { status: 400 });
    }

    if (title.length < 2 || title.length > 80) {
        return NextResponse.json({ error: 'Title length must be between 2 and 80 characters' }, { status: 400 });
    }

    if (message.length < 2 || message.length > 400) {
        return NextResponse.json({ error: 'Message length must be between 2 and 400 characters' }, { status: 400 });
    }

    if (Number.isNaN(remindAt.getTime())) {
        return NextResponse.json({ error: 'Invalid reminder date/time' }, { status: 400 });
    }

    const assignment = await prisma.doctorPatientAssignment.findUnique({
        where: {
            doctorId_patientId: {
                doctorId: authResult.auth.userId,
                patientId
            }
        }
    });

    if (!assignment) {
        return NextResponse.json({ error: 'Patient is not assigned to this doctor' }, { status: 403 });
    }

    const reminder = await prisma.reminder.create({
        data: {
            patientId,
            doctorId: authResult.auth.userId,
            title,
            message,
            remindAt
        }
    });

    await safeAuditLog(prisma, {
        actorUserId: authResult.auth.userId,
        targetUserId: patientId,
        action: 'reminder_created',
        entityType: 'reminder',
        entityId: reminder.id,
        metadata: {
            title,
            remindAt: reminder.remindAt.toISOString()
        },
        ...requestMeta
    });

    return NextResponse.json({ success: true, reminder }, { status: 201 });
}
