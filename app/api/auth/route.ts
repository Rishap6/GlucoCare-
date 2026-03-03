import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { action } = body;

        // VERY BASIC AND INSECURE password handling purely to mock auth until Supabase is used

        if (action === 'register') {
            const { password, ...userData } = body;

            const user = await prisma.user.create({
                data: {
                    name: body.name,
                    email: body.email,
                    phone: body.phone,
                    role: body.role,
                    password: password, // MOCK ONLY
                    specialization: body.specialization || null,
                    medicalRegistrationNo: body.medicalRegistrationNo || null,
                    age: body.age || null,
                    gender: body.gender || null
                }
            });
            return NextResponse.json({ success: true, user });
        }

        if (action === 'login') {
            const { email, password } = body;
            const user = await prisma.user.findUnique({ where: { email } });

            if (!user || user.password !== password) {
                return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
            }

            return NextResponse.json({ success: true, role: user.role, id: user.id });
        }

    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
