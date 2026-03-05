import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/dbDB';
import { requireAuth } from '@/lib/requireAuth';
import { extractRequestMeta, safeAuditLog } from '@/lib/audit';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(request: NextRequest) {
    const authResult = requireAuth(request, ['doctor']);
    if (!authResult.ok) {
        return authResult.response;
    }

    const assignments = await prisma.doctorPatientAssignment.findMany({
        where: { doctorId: authResult.auth.userId },
        include: {
            patient: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true
                }
            }
        },
        orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({ assignments });
}

export async function POST(request: NextRequest) {
    const authResult = requireAuth(request, ['doctor']);
    if (!authResult.ok) {
        return authResult.response;
    }

    const requestMeta = extractRequestMeta(request.headers);

    const body = await request.json();
    const patientId = body.patientId ? String(body.patientId) : null;
    const patientEmail = body.patientEmail ? String(body.patientEmail).trim().toLowerCase() : null;

    if (!patientId && !patientEmail) {
        return NextResponse.json({ error: 'patientId or patientEmail is required' }, { status: 400 });
    }

    if (patientEmail && !EMAIL_REGEX.test(patientEmail)) {
        return NextResponse.json({ error: 'Invalid patientEmail format' }, { status: 400 });
    }

    const patient = await prisma.user.findFirst({
        where: patientId
            ? { id: patientId, role: 'patient' }
            : { email: patientEmail!, role: 'patient' },
        select: { id: true, name: true, email: true }
    });

    if (!patient) {
        return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    const existing = await prisma.doctorPatientAssignment.findUnique({
        where: {
            doctorId_patientId: {
                doctorId: authResult.auth.userId,
                patientId: patient.id
            }
        }
    });

    if (existing) {
        return NextResponse.json({ error: 'Patient already assigned' }, { status: 409 });
    }

    const assignment = await prisma.doctorPatientAssignment.create({
        data: {
            doctorId: authResult.auth.userId,
            patientId: patient.id
        }
    });

    await safeAuditLog(prisma, {
        actorUserId: authResult.auth.userId,
        targetUserId: patient.id,
        action: 'doctor_patient_assignment_created',
        entityType: 'assignment',
        entityId: assignment.id,
        metadata: {
            doctorId: authResult.auth.userId,
            patientId: patient.id
        },
        ...requestMeta
    });

    return NextResponse.json({ success: true, assignment, patient }, { status: 201 });
}