import { PrismaClient, type PendingNLURequest } from '@prisma/client';
import { getPrismaClient } from '../../../core/db/client';

export class NLUQueueRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = getPrismaClient();
  }

  async queue(
    roundId: string,
    userId: string,
    rawResponse: string,
    lastError?: string
  ): Promise<PendingNLURequest> {
    const nextRetryAt = new Date(Date.now() + 60 * 1000);

    const existing = await this.prisma.pendingNLURequest.findFirst({
      where: { roundId, userId, status: { not: 'completed' } }
    });

    if (existing) {
      return this.prisma.pendingNLURequest.update({
        where: { id: existing.id },
        data: {
          retryCount: { increment: 1 },
          nextRetryAt,
          lastError: lastError || undefined,
          status: 'pending'
        }
      });
    }

    return this.prisma.pendingNLURequest.create({
      data: {
        roundId,
        userId,
        rawResponse,
        retryCount: 0,
        nextRetryAt,
        lastError: lastError || undefined,
        status: 'pending'
      }
    });
  }

  async findPendingForRetry(): Promise<PendingNLURequest[]> {
    return this.prisma.pendingNLURequest.findMany({
      where: {
        status: 'pending',
        nextRetryAt: { lte: new Date() },
        retryCount: { lt: 5 }
      },
      orderBy: { nextRetryAt: 'asc' }
    });
  }

  async markCompleted(id: string): Promise<PendingNLURequest> {
    return this.prisma.pendingNLURequest.update({
      where: { id },
      data: { status: 'completed' }
    });
  }

  async markFailed(id: string, error: string): Promise<PendingNLURequest> {
    return this.prisma.pendingNLURequest.update({
      where: { id },
      data: { status: 'failed', lastError: error }
    });
  }

  async updateRetry(id: string, retryCount: number, lastError?: string): Promise<PendingNLURequest> {
    const delayMs = Math.min(Math.pow(2, retryCount) * 60 * 1000, 16 * 60 * 1000);
    const nextRetryAt = new Date(Date.now() + delayMs);

    return this.prisma.pendingNLURequest.update({
      where: { id },
      data: {
        retryCount,
        nextRetryAt,
        lastError: lastError || undefined,
        status: retryCount >= 5 ? 'failed' : 'pending'
      }
    });
  }

  async delete(id: string): Promise<PendingNLURequest> {
    return this.prisma.pendingNLURequest.delete({
      where: { id }
    });
  }
}
