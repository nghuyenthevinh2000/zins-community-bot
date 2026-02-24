import { PrismaClient } from '@prisma/client';

// Singleton pattern for Prisma client to prevent multiple instances
let prismaClient: PrismaClient | null = null;

export function getPrismaClient(): PrismaClient {
  if (!prismaClient) {
    prismaClient = new PrismaClient();
  }
  return prismaClient;
}

export function disconnectPrisma(): Promise<void> {
  if (prismaClient) {
    return prismaClient.$disconnect();
  }
  return Promise.resolve();
}
