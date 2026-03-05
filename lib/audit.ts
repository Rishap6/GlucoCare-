import { PrismaClient } from '@prisma/client';

type AuditLogInput = {
    actorUserId?: string | null;
    targetUserId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    metadata?: Record<string, unknown> | null;
    ipAddress?: string | null;
    userAgent?: string | null;
};

export function extractRequestMeta(headers: Headers) {
    const forwardedFor = headers.get('x-forwarded-for');
    const ipAddress = forwardedFor
        ? forwardedFor.split(',')[0]?.trim() || null
        : headers.get('x-real-ip');

    const userAgent = headers.get('user-agent');

    return {
        ipAddress,
        userAgent
    };
}

export async function safeAuditLog(prisma: PrismaClient, input: AuditLogInput) {
    try {
        await prisma.auditEvent.create({
            data: {
                actorUserId: input.actorUserId || null,
                targetUserId: input.targetUserId || null,
                action: input.action,
                entityType: input.entityType,
                entityId: input.entityId || null,
                metadata: input.metadata ? JSON.stringify(input.metadata) : null,
                ipAddress: input.ipAddress || null,
                userAgent: input.userAgent || null
            }
        });
    } catch (error) {
        console.error('Audit log failed', error);
    }
}