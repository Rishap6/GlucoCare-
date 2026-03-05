import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/dbDB';
import { requireAuth } from '@/lib/requireAuth';
import { analyzeGlucoseReadings } from '@/lib/glucoseAnalysis';

export async function GET(request: NextRequest) {
    const authResult = requireAuth(request, ['doctor']);
    if (!authResult.ok) {
        return authResult.response;
    }

    const query = String(request.nextUrl.searchParams.get('query') || '').trim().toLowerCase();

    const assignments = await prisma.doctorPatientAssignment.findMany({
        where: { doctorId: authResult.auth.userId },
        include: {
            patient: {
                include: {
                    glucoseReadings: {
                        orderBy: { createdAt: 'desc' },
                        take: 5
                    },
                    alerts: {
                        where: { isActive: true },
                        orderBy: { createdAt: 'desc' },
                        take: 1
                    }
                }
            }
        },
        orderBy: { createdAt: 'desc' }
    });

    let patients = assignments.map((assignment) => {
        const recentReadings = assignment.patient.glucoseReadings;
        const latestReading = recentReadings[0] || null;
        const latestValue = latestReading?.value ?? null;
        const activeAlert = assignment.patient.alerts[0] || null;

        const { riskLevel } = analyzeGlucoseReadings(
            recentReadings.map((item) => ({
                value: item.value,
                createdAt: item.createdAt
            }))
        );

        return {
            id: assignment.patient.id,
            assignmentId: assignment.id,
            name: assignment.patient.name,
            email: assignment.patient.email,
            phone: assignment.patient.phone,
            latestReading: latestValue,
            latestReadingType: latestReading?.type || null,
            latestReadingAt: latestReading?.createdAt || null,
            status: latestValue === null ? 'No Data' : riskLevel,
            alert: activeAlert
                ? {
                    id: activeAlert.id,
                    alertType: activeAlert.alertType,
                    severity: activeAlert.severity,
                    message: activeAlert.message,
                    createdAt: activeAlert.createdAt
                }
                : null
        };
    });

    if (query) {
        patients = patients.filter((patient) =>
            patient.name.toLowerCase().includes(query)
            || patient.email.toLowerCase().includes(query)
            || patient.phone.toLowerCase().includes(query)
        );
    }

    return NextResponse.json({ patients });
}