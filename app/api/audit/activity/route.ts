import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/dbDB';
import { requireAuth } from '@/lib/requireAuth';

export async function GET(request: NextRequest) {
    const authResult = requireAuth(request, ['doctor', 'patient', 'admin']);
    if (!authResult.ok) {
        return authResult.response;
    }

    const limitParam = Number(request.nextUrl.searchParams.get('limit') || 20);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(Math.floor(limitParam), 1), 100) : 20;
    const action = String(request.nextUrl.searchParams.get('action') || '').trim();
    const entityType = String(request.nextUrl.searchParams.get('entityType') || '').trim();
    const from = request.nextUrl.searchParams.get('from');
    const to = request.nextUrl.searchParams.get('to');

    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;

    const createdAtFilter: { gte?: Date; lte?: Date } = {};
    if (fromDate && !Number.isNaN(fromDate.getTime())) {
        createdAtFilter.gte = fromDate;
    }
    if (toDate && !Number.isNaN(toDate.getTime())) {
        createdAtFilter.lte = toDate;
    }

    let visibilityClause: any;

    if (authResult.auth.role === 'admin') {
        visibilityClause = {};
    } else if (authResult.auth.role === 'doctor') {
        const assignments = await prisma.doctorPatientAssignment.findMany({
            where: { doctorId: authResult.auth.userId },
            select: { patientId: true }
        });

        const patientIds = assignments.map((item) => item.patientId);

        visibilityClause = {
            OR: [
                { actorUserId: authResult.auth.userId },
                { targetUserId: authResult.auth.userId },
                ...(patientIds.length > 0 ? [{ targetUserId: { in: patientIds } }] : [])
            ]
        };
    } else {
        visibilityClause = {
            OR: [
                { actorUserId: authResult.auth.userId },
                { targetUserId: authResult.auth.userId }
            ]
        };
    }

    const andConditions: any[] = [
        ...(Object.keys(visibilityClause || {}).length > 0 ? [visibilityClause] : []),
        ...(action ? [{ action }] : []),
        ...(entityType ? [{ entityType }] : []),
        ...(Object.keys(createdAtFilter).length > 0 ? [{ createdAt: createdAtFilter }] : [])
    ];

    const whereClause: any = andConditions.length > 0 ? { AND: andConditions } : {};

    const events = await prisma.auditEvent.findMany({
        where: whereClause,
        include: {
            actor: {
                select: {
                    id: true,
                    name: true,
                    role: true
                }
            },
            target: {
                select: {
                    id: true,
                    name: true,
                    role: true
                }
            }
        },
        orderBy: { createdAt: 'desc' },
        take: limit
    });

    const normalizedEvents = events.map((event) => {
        let metadata: Record<string, unknown> | null = null;
        if (event.metadata) {
            try {
                metadata = JSON.parse(event.metadata);
            } catch {
                metadata = null;
            }
        }

        return {
            id: event.id,
            action: event.action,
            entityType: event.entityType,
            entityId: event.entityId,
            metadata,
            ipAddress: event.ipAddress,
            userAgent: event.userAgent,
            createdAt: event.createdAt,
            actor: event.actor,
            target: event.target
        };
    });

    return NextResponse.json({ events: normalizedEvents });
}