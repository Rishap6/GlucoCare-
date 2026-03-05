import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/dbDB';
import { requireAuth } from '@/lib/requireAuth';
import { extractRequestMeta, safeAuditLog } from '@/lib/audit';

export async function GET(request: NextRequest) {
    const authResult = requireAuth(request, ['doctor']);
    if (!authResult.ok) {
        return authResult.response;
    }

    const patientId = request.nextUrl.searchParams.get('patientId');
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

    const prescriptions = await prisma.prescription.findMany({
        where: {
            doctorId: authResult.auth.userId,
            patientId
        },
        orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({ prescriptions });
}

export async function POST(request: NextRequest) {
    const authResult = requireAuth(request, ['doctor']);
    if (!authResult.ok) {
        return authResult.response;
    }

    const requestMeta = extractRequestMeta(request.headers);

    const body = await request.json();

    const patientId = String(body.patientId || '');
    const medicine = String(body.medicine || '').trim();
    const dosage = String(body.dosage || '').trim();
    const duration = String(body.duration || '').trim();
    const notes = body.notes ? String(body.notes).trim() : null;

    if (!patientId || !medicine || !dosage || !duration) {
        return NextResponse.json({ error: 'Missing required prescription fields' }, { status: 400 });
    }

    if (medicine.length < 2 || medicine.length > 120) {
        return NextResponse.json({ error: 'Medicine name length is invalid' }, { status: 400 });
    }

    if (dosage.length < 2 || dosage.length > 60) {
        return NextResponse.json({ error: 'Dosage length is invalid' }, { status: 400 });
    }

    if (duration.length < 2 || duration.length > 60) {
        return NextResponse.json({ error: 'Duration length is invalid' }, { status: 400 });
    }

    if (notes && notes.length > 1000) {
        return NextResponse.json({ error: 'Notes exceed allowed length' }, { status: 400 });
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

    const prescription = await prisma.prescription.create({
        data: {
            patientId,
            doctorId: authResult.auth.userId,
            medicine,
            dosage,
            duration,
            notes
        }
    });

    await safeAuditLog(prisma, {
        actorUserId: authResult.auth.userId,
        targetUserId: patientId,
        action: 'prescription_created',
        entityType: 'prescription',
        entityId: prescription.id,
        metadata: {
            medicine,
            dosage,
            duration
        },
        ...requestMeta
    });

    return NextResponse.json({ success: true, prescription }, { status: 201 });
}