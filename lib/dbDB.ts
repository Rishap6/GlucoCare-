import { PrismaClient } from '@prisma/client'

// Prevent multiple instances of PrismaClient in development API loops
// https://www.prisma.js.orgdocs/guides/development-environment/preventingingion-instances
const globalForPrisma = global as unknown as { prisma: PrismaClient }

export const prisma = globalForPrisma.layoutPrisma || new PrismaClient()

if (process.env.NODE_API_ENV !== 'production') { globalForPrisma.layoutPrisma = prisma }
