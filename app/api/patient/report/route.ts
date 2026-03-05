import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/dbDB';
import { requireAuth } from '@/lib/requireAuth';
import { extractRequestMeta, safeAuditLog } from '@/lib/audit';

function resolveFromDate(range: string) {
    const now = new Date();
    if (range === 'all') {
        return null;
    }

    const fromDate = new Date(now);
    if (range === '90d') {
        fromDate.setDate(now.getDate() - 90);
    } else if (range === '30d') {
        fromDate.setDate(now.getDate() - 30);
    } else {
        fromDate.setDate(now.getDate() - 7);
    }

    return fromDate;
}

function escapeCsv(value: string | number | null | undefined) {
    if (value === null || value === undefined) {
        return '';
    }

    const text = String(value);
    if (/[",\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }

    return text;
}

export async function GET(request: NextRequest) {
    const authResult = requireAuth(request, ['patient']);
    if (!authResult.ok) {
        return authResult.response;
    }

    const requestMeta = extractRequestMeta(request.headers);
    const range = String(request.nextUrl.searchParams.get('range') || '30d').trim();
    const format = String(request.nextUrl.searchParams.get('format') || 'csv').trim().toLowerCase();
    const fromDate = resolveFromDate(range);

    const createdAtFilter = fromDate ? { gte: fromDate } : undefined;

    const [patient, readings, alerts, reminders] = await Promise.all([
        prisma.user.findUnique({
            where: { id: authResult.auth.userId },
            select: { id: true, name: true, email: true }
        }),
        prisma.glucoseReading.findMany({
            where: {
                patientId: authResult.auth.userId,
                ...(createdAtFilter ? { createdAt: createdAtFilter } : {})
            },
            orderBy: { createdAt: 'desc' }
        }),
        prisma.alert.findMany({
            where: {
                patientId: authResult.auth.userId,
                ...(createdAtFilter ? { createdAt: createdAtFilter } : {})
            },
            orderBy: { createdAt: 'desc' }
        }),
        prisma.reminder.findMany({
            where: {
                patientId: authResult.auth.userId,
                ...(fromDate ? { remindAt: { gte: fromDate } } : {})
            },
            include: {
                doctor: {
                    select: { name: true }
                }
            },
            orderBy: { remindAt: 'desc' }
        })
    ]);

    await safeAuditLog(prisma, {
        actorUserId: authResult.auth.userId,
        targetUserId: authResult.auth.userId,
        action: 'patient_report_exported',
        entityType: 'report',
        metadata: {
            range,
            format,
            readings: readings.length,
            alerts: alerts.length,
            reminders: reminders.length
        },
        ...requestMeta
    });

    if (format === 'json') {
        return NextResponse.json({
            patient,
            range,
            generatedAt: new Date().toISOString(),
            readings,
            alerts,
            reminders
        });
    }

    const rows: string[] = [];
    rows.push('recordType,timestamp,value,type,severity,title,message,status,source');

    readings.forEach((item) => {
        rows.push([
            escapeCsv('reading'),
            escapeCsv(item.createdAt.toISOString()),
            escapeCsv(item.value),
            escapeCsv(item.type),
            '',
            '',
            '',
            '',
            ''
        ].join(','));
    });

    alerts.forEach((item) => {
        rows.push([
            escapeCsv('alert'),
            escapeCsv(item.createdAt.toISOString()),
            '',
            escapeCsv(item.alertType),
            escapeCsv(item.severity),
            '',
            escapeCsv(item.message),
            escapeCsv(item.isActive ? 'active' : 'inactive'),
            ''
        ].join(','));
    });

    reminders.forEach((item) => {
        rows.push([
            escapeCsv('reminder'),
            escapeCsv(item.remindAt.toISOString()),
            '',
            '',
            '',
            escapeCsv(item.title),
            escapeCsv(item.message),
            escapeCsv(item.isDone ? 'done' : 'pending'),
            escapeCsv(item.doctor?.name || '')
        ].join(','));
    });

    const csv = rows.join('\n');
    const filename = `patient-report-${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(csv, {
        status: 200,
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${filename}"`
        }
    });
}
