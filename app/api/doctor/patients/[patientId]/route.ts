import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/dbDB';
import { requireAuth } from '@/lib/requireAuth';
import { analyzeGlucoseReadings } from '@/lib/glucoseAnalysis';

export async function GET(
    request: NextRequest,
    { params }: { params: { patientId: string } }
) {
    const authResult = requireAuth(request, ['doctor']);
    if (!authResult.ok) {
        return authResult.response;
    }

    const { patientId } = params;
    const range = request.nextUrl.searchParams.get('range') || '30d';
    const now = new Date();
    const fromDate = new Date(now);

    if (range === '7d') {
        fromDate.setDate(now.getDate() - 7);
    } else {
        fromDate.setDate(now.getDate() - 30);
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

    const patient = await prisma.user.findFirst({
        where: {
            id: patientId,
            role: 'patient'
        },
        include: {
            patientProfile: true,
            glucoseReadings: {
                where: {
                    createdAt: {
                        gte: fromDate
                    }
                },
                orderBy: { createdAt: 'desc' }
            },
            prescriptions: {
                where: {
                    doctorId: authResult.auth.userId
                },
                orderBy: { createdAt: 'desc' },
                take: 10
            },
            alerts: {
                orderBy: { createdAt: 'desc' },
                take: 10
            }
        }
    });

    if (!patient) {
        return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    const latestReading = patient.glucoseReadings[0] || null;
    const average = patient.glucoseReadings.length > 0
        ? Number((patient.glucoseReadings.reduce((sum, item) => sum + item.value, 0) / patient.glucoseReadings.length).toFixed(1))
        : 0;

    const { riskLevel } = analyzeGlucoseReadings(
        patient.glucoseReadings.map((item) => ({
            value: item.value,
            createdAt: item.createdAt
        }))
    );

    const activeAlert = patient.alerts.find((alert) => alert.isActive) || null;

    return NextResponse.json({
        patient: {
            id: patient.id,
            name: patient.name,
            email: patient.email,
            phone: patient.phone,
            age: patient.patientProfile?.age ?? patient.age,
            gender: patient.patientProfile?.gender ?? patient.gender
        },
        readings: patient.glucoseReadings,
        alerts: patient.alerts,
        prescriptions: patient.prescriptions,
        stats: {
            latest: latestReading?.value || 0,
            average,
            status: riskLevel,
            activeAlert: activeAlert
                ? {
                    id: activeAlert.id,
                    alertType: activeAlert.alertType,
                    severity: activeAlert.severity,
                    message: activeAlert.message,
                    createdAt: activeAlert.createdAt
                }
                : null
        }
    });
}