import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/dbDB';
import { requireAuth } from '@/lib/requireAuth';
import { extractRequestMeta, safeAuditLog } from '@/lib/audit';

export async function PATCH(
    request: NextRequest,
    { params }: { params: { reminderId: string } }
) {
    const authResult = requireAuth(request, ['patient']);
    if (!authResult.ok) {
        return authResult.response;
    }

    const requestMeta = extractRequestMeta(request.headers);
    const reminderId = params.reminderId;

    const body = await request.json();
    const isDone = Boolean(body.isDone);

    const existing = await prisma.reminder.findFirst({
        where: {
            id: reminderId,
            patientId: authResult.auth.userId
        }
    });

    if (!existing) {
        return NextResponse.json({ error: 'Reminder not found' }, { status: 404 });
    }

    const reminder = await prisma.reminder.update({
        where: { id: reminderId },
        data: { isDone }
    });

    await safeAuditLog(prisma, {
        actorUserId: authResult.auth.userId,
        targetUserId: authResult.auth.userId,
        action: isDone ? 'reminder_marked_done' : 'reminder_marked_pending',
        entityType: 'reminder',
        entityId: reminder.id,
        metadata: {
            title: reminder.title,
            remindAt: reminder.remindAt.toISOString()
        },
        ...requestMeta
    });

    return NextResponse.json({ success: true, reminder });
}
