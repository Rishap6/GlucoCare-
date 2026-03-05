import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/dbDB';
import { requireAuth } from '@/lib/requireAuth';
import { analyzeGlucoseReadings } from '@/lib/glucoseAnalysis';
import { extractRequestMeta, safeAuditLog } from '@/lib/audit';

export async function GET(request: NextRequest) {
    const authResult = requireAuth(request, ['patient']);
    if (!authResult.ok) {
        return authResult.response;
    }

    const range = request.nextUrl.searchParams.get('range') || '7d';
    const now = new Date();
    const fromDate = new Date(now);

    if (range === '30d') {
        fromDate.setDate(now.getDate() - 30);
    } else {
        fromDate.setDate(now.getDate() - 7);
    }

    const readings = await prisma.glucoseReading.findMany({
        where: {
            patientId: authResult.auth.userId,
            createdAt: {
                gte: fromDate
            }
        },
        orderBy: { createdAt: 'desc' }
    });

    const latestReadingsForRisk = await prisma.glucoseReading.findMany({
        where: { patientId: authResult.auth.userId },
        orderBy: { createdAt: 'desc' },
        take: 5
    });

    const activeAlert = await prisma.alert.findFirst({
        where: {
            patientId: authResult.auth.userId,
            isActive: true
        },
        orderBy: { createdAt: 'desc' }
    });

    const { riskLevel } = analyzeGlucoseReadings(
        latestReadingsForRisk.map((item) => ({
            value: item.value,
            createdAt: item.createdAt
        }))
    );

    const latest = readings[0] || null;
    const average = readings.length > 0
        ? Number((readings.reduce((sum, item) => sum + item.value, 0) / readings.length).toFixed(1))
        : 0;

    return NextResponse.json({
        readings,
        stats: {
            latest: latest?.value || 0,
            average,
            total: readings.length,
            riskLevel
        },
        latestAlert: activeAlert
            ? {
                id: activeAlert.id,
                alertType: activeAlert.alertType,
                severity: activeAlert.severity,
                message: activeAlert.message,
                createdAt: activeAlert.createdAt
            }
            : null
    });
}

export async function POST(request: NextRequest) {
    const authResult = requireAuth(request, ['patient']);
    if (!authResult.ok) {
        return authResult.response;
    }

    const requestMeta = extractRequestMeta(request.headers);

    const body = await request.json();
    const value = Number(body.value);
    const type = String(body.type || '').toLowerCase();
    const readingDate = body.createdAt ? new Date(body.createdAt) : new Date();

    if (!Number.isFinite(value) || value < 20 || value > 600) {
        return NextResponse.json({ error: 'Invalid glucose value' }, { status: 400 });
    }

    if (!['fasting', 'post-meal'].includes(type)) {
        return NextResponse.json({ error: 'Invalid reading type' }, { status: 400 });
    }

    if (Number.isNaN(readingDate.getTime())) {
        return NextResponse.json({ error: 'Invalid reading date' }, { status: 400 });
    }

    const reading = await prisma.glucoseReading.create({
        data: {
            patientId: authResult.auth.userId,
            value,
            type,
            createdAt: readingDate
        }
    });

    const latestReadingsForRisk = await prisma.glucoseReading.findMany({
        where: { patientId: authResult.auth.userId },
        orderBy: { createdAt: 'desc' },
        take: 5
    });

    const analysis = analyzeGlucoseReadings(
        latestReadingsForRisk.map((item) => ({
            value: item.value,
            createdAt: item.createdAt
        }))
    );

    await prisma.alert.updateMany({
        where: {
            patientId: authResult.auth.userId,
            isActive: true
        },
        data: { isActive: false }
    });

    let createdAlerts: Array<{ id: string; alertType: string; severity: string; message: string; createdAt: Date }> = [];

    if (analysis.alerts.length > 0) {
        const newAlerts = await Promise.all(
            analysis.alerts.map((alert) =>
                prisma.alert.create({
                    data: {
                        patientId: authResult.auth.userId,
                        alertType: alert.alertType,
                        severity: alert.severity,
                        message: alert.message,
                        isActive: true,
                        createdAt: new Date()
                    },
                    select: {
                        id: true,
                        alertType: true,
                        severity: true,
                        message: true,
                        createdAt: true
                    }
                })
            )
        );

        createdAlerts = newAlerts;
    }

    await safeAuditLog(prisma, {
        actorUserId: authResult.auth.userId,
        targetUserId: authResult.auth.userId,
        action: 'glucose_reading_logged',
        entityType: 'glucose_reading',
        entityId: reading.id,
        metadata: {
            value,
            type,
            riskLevel: analysis.riskLevel,
            alertCount: createdAlerts.length
        },
        ...requestMeta
    });

    return NextResponse.json({
        success: true,
        reading,
        riskLevel: analysis.riskLevel,
        alerts: createdAlerts
    }, { status: 201 });
}