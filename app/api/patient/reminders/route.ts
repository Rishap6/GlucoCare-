import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/dbDB';
import { requireAuth } from '@/lib/requireAuth';

export async function GET(request: NextRequest) {
    const authResult = requireAuth(request, ['patient']);
    if (!authResult.ok) {
        return authResult.response;
    }

    const now = new Date();
    const fromDate = new Date(now);
    fromDate.setDate(fromDate.getDate() - 14);

    const reminders = await prisma.reminder.findMany({
        where: {
            patientId: authResult.auth.userId,
            OR: [
                { isDone: false },
                {
                    isDone: true,
                    createdAt: {
                        gte: fromDate
                    }
                }
            ]
        },
        include: {
            doctor: {
                select: {
                    id: true,
                    name: true
                }
            }
        },
        orderBy: [{ isDone: 'asc' }, { remindAt: 'asc' }],
        take: 50
    });

    const dueNowCount = reminders.filter((item) => !item.isDone && item.remindAt <= now).length;

    return NextResponse.json({ reminders, dueNowCount, now: now.toISOString() });
}
