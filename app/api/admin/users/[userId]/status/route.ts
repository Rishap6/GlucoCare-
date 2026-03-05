import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/dbDB';
import { requireAuth } from '@/lib/requireAuth';
import { extractRequestMeta, safeAuditLog } from '@/lib/audit';

export async function PATCH(
    request: NextRequest,
    { params }: { params: { userId: string } }
) {
    const authResult = requireAuth(request, ['admin']);
    if (!authResult.ok) {
        return authResult.response;
    }

    const requestMeta = extractRequestMeta(request.headers);
    const userId = params.userId;

    const body = await request.json();
    const isActive = Boolean(body.isActive);

    if (userId === authResult.auth.userId && !isActive) {
        return NextResponse.json({ error: 'You cannot deactivate your own account' }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const updated = await prisma.user.update({
        where: { id: userId },
        data: { isActive }
    });

    await safeAuditLog(prisma, {
        actorUserId: authResult.auth.userId,
        targetUserId: userId,
        action: isActive ? 'admin_user_activated' : 'admin_user_deactivated',
        entityType: 'user',
        entityId: userId,
        metadata: {
            role: existing.role,
            email: existing.email
        },
        ...requestMeta
    });

    return NextResponse.json({
        success: true,
        user: {
            id: updated.id,
            name: updated.name,
            email: updated.email,
            role: updated.role,
            isActive: updated.isActive
        }
    });
}
