import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/dbDB';
import { requireAuth } from '@/lib/requireAuth';

export async function GET(request: NextRequest) {
    const authResult = requireAuth(request, ['admin']);
    if (!authResult.ok) {
        return authResult.response;
    }

    const roleFilter = String(request.nextUrl.searchParams.get('role') || '').trim();
    const query = String(request.nextUrl.searchParams.get('query') || '').trim().toLowerCase();

    const users = await prisma.user.findMany({
        where: {
            ...(roleFilter && ['patient', 'doctor', 'admin'].includes(roleFilter) ? { role: roleFilter } : {}),
            ...(query
                ? {
                    OR: [
                        { name: { contains: query } },
                        { email: { contains: query } },
                        { phone: { contains: query } }
                    ]
                }
                : {})
        },
        select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
            isActive: true,
            createdAt: true
        },
        orderBy: { createdAt: 'desc' },
        take: 200
    });

    return NextResponse.json({ users });
}
