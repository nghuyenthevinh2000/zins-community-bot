import { PrismaClient, type Group, type Member, type SchedulingRound, type AvailabilityResponse } from '@prisma/client';

export class DatabaseService {
  constructor(private prisma: PrismaClient) { }

  getPrisma(): PrismaClient {
    return this.prisma;
  }

  // Group operations
  async findOrCreateGroup(telegramId: string, name: string): Promise<Group> {
    const existing = await this.prisma.group.findUnique({
      where: { telegramId }
    });

    if (existing) {
      return existing;
    }

    return this.prisma.group.create({
      data: { telegramId, name }
    });
  }

  async getGroupByTelegramId(telegramId: string): Promise<Group | null> {
    return this.prisma.group.findUnique({
      where: { telegramId }
    });
  }

  // Member operations - always scoped by group
  async findOrCreateMember(userId: string, groupId: string): Promise<Member> {
    const existing = await this.prisma.member.findUnique({
      where: { userId_groupId: { userId, groupId } }
    });

    if (existing) {
      return existing;
    }

    return this.prisma.member.create({
      data: { userId, groupId, optedIn: false }
    });
  }

  async optInMember(userId: string, groupId: string): Promise<Member> {
    return this.prisma.member.upsert({
      where: { userId_groupId: { userId, groupId } },
      update: { optedIn: true, optedInAt: new Date() },
      create: { userId, groupId, optedIn: true, optedInAt: new Date() }
    });
  }

  async getOptedInMembers(groupId: string): Promise<Member[]> {
    return this.prisma.member.findMany({
      where: { groupId, optedIn: true }
    });
  }

  async isMemberOptedIn(userId: string, groupId: string): Promise<boolean> {
    const member = await this.prisma.member.findUnique({
      where: { userId_groupId: { userId, groupId } }
    });
    return member?.optedIn ?? false;
  }

  async getOptedInMemberCount(groupId: string): Promise<number> {
    return this.prisma.member.count({
      where: { groupId, optedIn: true }
    });
  }

  async getAllMembersWithOptInStatus(groupId: string): Promise<{ optedIn: Member[]; notOptedIn: Member[] }> {
    const [optedIn, notOptedIn] = await Promise.all([
      this.prisma.member.findMany({
        where: { groupId, optedIn: true }
      }),
      this.prisma.member.findMany({
        where: { groupId, optedIn: false }
      })
    ]);

    return { optedIn, notOptedIn };
  }

  // Scheduling rounds - always scoped by group
  async createSchedulingRound(
    groupId: string,
    topic: string,
    timeframe: string
  ): Promise<SchedulingRound> {
    return this.prisma.schedulingRound.create({
      data: { groupId, topic, timeframe, status: 'active' }
    });
  }

  async getActiveRoundByGroup(groupId: string): Promise<SchedulingRound | null> {
    return this.prisma.schedulingRound.findFirst({
      where: { groupId, status: 'active' },
      orderBy: { createdAt: 'desc' }
    });
  }

  async getAllRoundsByGroup(groupId: string): Promise<SchedulingRound[]> {
    return this.prisma.schedulingRound.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' }
    });
  }

  async cancelRound(roundId: string): Promise<SchedulingRound> {
    return this.prisma.schedulingRound.update({
      where: { id: roundId },
      data: { status: 'cancelled' }
    });
  }

  async confirmRound(roundId: string): Promise<SchedulingRound> {
    return this.prisma.schedulingRound.update({
      where: { id: roundId },
      data: { status: 'confirmed' }
    });
  }

  // Multi-group isolation check
  async getActiveRoundStatus(groupId: string): Promise<{
    hasActiveRound: boolean;
    round: SchedulingRound | null;
    optedInCount: number;
  }> {
    const [round, optedInMembers] = await Promise.all([
      this.getActiveRoundByGroup(groupId),
      this.getOptedInMembers(groupId)
    ]);

    return {
      hasActiveRound: !!round,
      round,
      optedInCount: optedInMembers.length
    };
  }

  // Availability Response operations
  async createAvailabilityResponse(
    roundId: string,
    userId: string,
    rawResponse: string,
    parsedAvailability: any
  ): Promise<any> {
    return this.prisma.availabilityResponse.upsert({
      where: { roundId_userId: { roundId, userId } },
      update: {
        rawResponse,
        parsedAvailability,
        status: 'pending',
        confirmedAt: null
      },
      create: {
        roundId,
        userId,
        rawResponse,
        parsedAvailability,
        status: 'pending'
      }
    });
  }


  async confirmAvailabilityResponse(roundId: string, userId: string): Promise<any> {
    return this.prisma.availabilityResponse.update({
      where: { roundId_userId: { roundId, userId } },
      data: { status: 'confirmed', confirmedAt: new Date() }
    });
  }

  async getAvailabilityResponse(roundId: string, userId: string): Promise<any | null> {
    return this.prisma.availabilityResponse.findUnique({
      where: { roundId_userId: { roundId, userId } }
    });
  }

  async getPendingAvailabilityResponse(userId: string): Promise<any | null> {
    return this.prisma.availabilityResponse.findFirst({
      where: { userId, status: 'pending' },
      include: { round: true },
      orderBy: { createdAt: 'desc' }
    });
  }


  async updateAvailabilityResponse(
    roundId: string,
    userId: string,
    rawResponse: string,
    parsedAvailability: any
  ): Promise<any> {
    return this.prisma.availabilityResponse.update({
      where: { roundId_userId: { roundId, userId } },
      data: {
        rawResponse,
        parsedAvailability,
        status: 'pending',
        confirmedAt: null
      }
    });
  }

  // Pending NLU Request operations (for API failure recovery - NFR6)
  async queuePendingNLURequest(
    roundId: string,
    userId: string,
    rawResponse: string,
    lastError?: string
  ): Promise<any> {
    // Calculate next retry with exponential backoff (starts at 1 minute)
    const nextRetryAt = new Date(Date.now() + 60 * 1000);
    
    return this.prisma.pendingNLURequest.upsert({
      where: { 
        id: await this.getPendingRequestId(roundId, userId)
      },
      update: {
        retryCount: { increment: 1 },
        nextRetryAt,
        lastError: lastError || undefined,
        status: 'pending'
      },
      create: {
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

  private async getPendingRequestId(roundId: string, userId: string): Promise<string> {
    const existing = await this.prisma.pendingNLURequest.findFirst({
      where: { roundId, userId, status: { not: 'completed' } }
    });
    return existing?.id || 'new';
  }

  async getPendingNLURequestsForRetry(): Promise<any[]> {
    return this.prisma.pendingNLURequest.findMany({
      where: {
        status: 'pending',
        nextRetryAt: { lte: new Date() },
        retryCount: { lt: 5 } // Max 5 retries
      },
      orderBy: { nextRetryAt: 'asc' }
    });
  }

  async markNLURequestCompleted(id: string): Promise<any> {
    return this.prisma.pendingNLURequest.update({
      where: { id },
      data: { status: 'completed' }
    });
  }

  async markNLURequestFailed(id: string, error: string): Promise<any> {
    return this.prisma.pendingNLURequest.update({
      where: { id },
      data: { status: 'failed', lastError: error }
    });
  }

  async updateNLURequestRetry(id: string, retryCount: number, lastError?: string): Promise<any> {
    // Exponential backoff: 1min, 2min, 4min, 8min, 16min
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

  async deleteNLURequest(id: string): Promise<any> {
    return this.prisma.pendingNLURequest.delete({
      where: { id }
    });
  }
}
