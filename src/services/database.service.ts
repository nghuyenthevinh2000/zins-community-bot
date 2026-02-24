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
    // Always create a new response record (for tracking conversation history)
    return this.prisma.availabilityResponse.create({
      data: {
        roundId,
        userId,
        rawResponse,
        parsedAvailability,
        status: 'pending'
      }
    });
  }


  async confirmAvailabilityResponse(roundId: string, userId: string): Promise<any> {
    const existing = await this.prisma.availabilityResponse.findFirst({
      where: { roundId, userId },
      orderBy: { createdAt: 'desc' }
    });

    if (!existing) {
      throw new Error('Availability response not found');
    }

    return this.prisma.availabilityResponse.update({
      where: { id: existing.id },
      data: { status: 'confirmed', confirmedAt: new Date() }
    });
  }

  async getAvailabilityResponse(roundId: string, userId: string): Promise<any | null> {
    return this.prisma.availabilityResponse.findFirst({
      where: { roundId, userId },
      orderBy: { createdAt: 'desc' }
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
    const existing = await this.prisma.availabilityResponse.findFirst({
      where: { roundId, userId },
      orderBy: { createdAt: 'desc' }
    });

    if (!existing) {
      throw new Error('Availability response not found');
    }

    return this.prisma.availabilityResponse.update({
      where: { id: existing.id },
      data: {
        rawResponse,
        parsedAvailability,
        status: 'pending',
        confirmedAt: null
      }
    });
  }

  // Story 4.4: Get count of vague responses for a user in a round
  async getVagueResponseCount(userId: string, roundId: string): Promise<number> {
    // Count responses that are "pending" and don't have specific days/times
    // We use a heuristic: count responses with status 'pending' that were created 
    // after the first vague response
    const vagueResponses = await this.prisma.availabilityResponse.findMany({
      where: { 
        roundId, 
        userId,
        status: 'pending'
      },
      orderBy: { createdAt: 'desc' }
    });

    // Count consecutive vague responses (responses without proper parsed data)
    let vagueCount = 0;
    for (const response of vagueResponses) {
      const parsed = response.parsedAvailability as any;
      const hasNoDays = !parsed?.days || parsed.days.length === 0;
      const hasNoTimes = !parsed?.times || parsed.times.length === 0;
      
      // Consider vague if: no days AND no times, OR has days but no times
      if ((hasNoDays && hasNoTimes) || (!hasNoDays && hasNoTimes)) {
        vagueCount++;
      } else if (!hasNoDays && !hasNoTimes) {
        // Found a specific response with both days and times, stop counting
        break;
      }
      // If it has times but no days, still count as vague (missing day info)
    }

    return vagueCount;
  }

  // Story 4.4: Update response status (for accepting vague responses after max retries)
  async updateAvailabilityResponseStatus(
    roundId: string,
    userId: string,
    status: string
  ): Promise<any> {
    const existing = await this.prisma.availabilityResponse.findFirst({
      where: { roundId, userId },
      orderBy: { createdAt: 'desc' }
    });

    if (!existing) {
      throw new Error('Availability response not found');
    }

    return this.prisma.availabilityResponse.update({
      where: { id: existing.id },
      data: { status }
    });
  }
}
