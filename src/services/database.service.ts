import { PrismaClient, type Group, type Member, type SchedulingRound, type AvailabilityResponse } from '@prisma/client';

export class DatabaseService {
  constructor(private prisma: PrismaClient) {}

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

  // Availability response operations
  async createAvailabilityResponse(
    roundId: string,
    memberId: string,
    rawText: string,
    parsedStartTime?: Date,
    parsedEndTime?: Date,
    isVague: boolean = false,
    status: string = 'pending'
  ): Promise<AvailabilityResponse> {
    return this.prisma.availabilityResponse.create({
      data: {
        roundId,
        memberId,
        rawText,
        parsedStartTime,
        parsedEndTime,
        isVague,
        status
      }
    });
  }

  async updateAvailabilityResponse(
    responseId: string,
    data: Partial<AvailabilityResponse>
  ): Promise<AvailabilityResponse> {
    return this.prisma.availabilityResponse.update({
      where: { id: responseId },
      data
    });
  }

  async getAvailabilityResponsesByRound(roundId: string): Promise<AvailabilityResponse[]> {
    return this.prisma.availabilityResponse.findMany({
      where: { roundId },
      orderBy: { createdAt: 'desc' }
    });
  }

  async getAvailabilityResponseByMemberAndRound(
    memberId: string,
    roundId: string
  ): Promise<AvailabilityResponse | null> {
    return this.prisma.availabilityResponse.findFirst({
      where: { memberId, roundId },
      orderBy: { createdAt: 'desc' }
    });
  }

  async hasMemberResponded(memberId: string, roundId: string): Promise<boolean> {
    const count = await this.prisma.availabilityResponse.count({
      where: { memberId, roundId }
    });
    return count > 0;
  }
}
