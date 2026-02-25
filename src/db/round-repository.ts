import { PrismaClient, type SchedulingRound } from '@prisma/client';
import { getPrismaClient } from './client';

export class RoundRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = getPrismaClient();
  }

  async create(groupId: string, topic: string, timeframe: string): Promise<SchedulingRound> {
    return this.prisma.schedulingRound.create({
      data: { groupId, topic, timeframe, status: 'active' }
    });
  }

  async findActiveByGroup(groupId: string): Promise<SchedulingRound | null> {
    return this.prisma.schedulingRound.findFirst({
      where: { groupId, status: 'active' },
      orderBy: { createdAt: 'desc' }
    });
  }

  async findAllByGroup(groupId: string): Promise<SchedulingRound[]> {
    return this.prisma.schedulingRound.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' }
    });
  }

  async findById(id: string): Promise<SchedulingRound | null> {
    return this.prisma.schedulingRound.findUnique({
      where: { id },
      include: { group: true }
    });
  }

  async cancel(roundId: string): Promise<SchedulingRound> {
    return this.prisma.schedulingRound.update({
      where: { id: roundId },
      data: { status: 'cancelled' }
    });
  }

  async confirm(roundId: string): Promise<SchedulingRound> {
    return this.prisma.schedulingRound.update({
      where: { id: roundId },
      data: { status: 'confirmed' }
    });
  }

  async confirmWithTimeSlot(roundId: string, timeSlot: any): Promise<SchedulingRound> {
    return this.prisma.schedulingRound.update({
      where: { id: roundId },
      data: { 
        status: 'confirmed',
        confirmedAt: new Date(),
        confirmedTimeSlot: timeSlot
      }
    });
  }

  // Story 6.4: Increment retry count and reset for alternative availability
  async incrementRetryCount(roundId: string): Promise<SchedulingRound> {
    const round = await this.findById(roundId);
    if (!round) throw new Error('Round not found');
    
    return this.prisma.schedulingRound.update({
      where: { id: roundId },
      data: { 
        retryCount: { increment: 1 }
      }
    });
  }

  async resetForRetry(roundId: string): Promise<SchedulingRound> {
    return this.prisma.schedulingRound.update({
      where: { id: roundId },
      data: { 
        retryCount: { increment: 1 },
        // Keep status as 'active' to continue collection
      }
    });
  }

  async markAsNoConsensus(roundId: string): Promise<SchedulingRound> {
    return this.prisma.schedulingRound.update({
      where: { id: roundId },
      data: { 
        status: 'no_consensus'
      }
    });
  }

  async findAllActive(): Promise<SchedulingRound[]> {
    return this.prisma.schedulingRound.findMany({
      where: { status: 'active' },
      include: { group: true }
    });
  }

  async getActiveStatus(groupId: string): Promise<{
    hasActiveRound: boolean;
    round: SchedulingRound | null;
  }> {
    const round = await this.findActiveByGroup(groupId);
    return {
      hasActiveRound: !!round,
      round
    };
  }
}
