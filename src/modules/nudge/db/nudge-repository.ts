import { PrismaClient, type NudgeTracking, type NudgeHistory } from '@prisma/client';
import { getPrismaClient } from '../../../core/db/client';

export class NudgeRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = getPrismaClient();
  }

  async findOrCreateTracking(roundId: string, userId: string): Promise<NudgeTracking> {
    return this.prisma.nudgeTracking.upsert({
      where: { roundId_userId: { roundId, userId } },
      update: {},
      create: {
        roundId,
        userId,
        nudgeCount: 0,
        lastNudgeAt: null
      }
    });
  }

  async incrementTracking(roundId: string, userId: string): Promise<NudgeTracking> {
    return this.prisma.nudgeTracking.upsert({
      where: { roundId_userId: { roundId, userId } },
      update: {
        nudgeCount: { increment: 1 },
        lastNudgeAt: new Date()
      },
      create: {
        roundId,
        userId,
        nudgeCount: 1,
        lastNudgeAt: new Date()
      }
    });
  }

  async findTracking(roundId: string, userId: string): Promise<NudgeTracking | null> {
    return this.prisma.nudgeTracking.findUnique({
      where: { roundId_userId: { roundId, userId } }
    });
  }

  async findAllTrackingByRound(roundId: string): Promise<NudgeTracking[]> {
    return this.prisma.nudgeTracking.findMany({
      where: { roundId }
    });
  }

  async recordHistory(groupId: string, roundId: string, userId: string, nudgeNumber: number): Promise<NudgeHistory> {
    return this.prisma.nudgeHistory.create({
      data: {
        groupId,
        roundId,
        userId,
        nudgeNumber
      }
    });
  }

  async countHistoryForUser(groupId: string, roundId: string, userId: string): Promise<number> {
    return this.prisma.nudgeHistory.count({
      where: { groupId, roundId, userId }
    });
  }

  async findLastHistoryForUser(groupId: string, roundId: string, userId: string): Promise<NudgeHistory | null> {
    return this.prisma.nudgeHistory.findFirst({
      where: { groupId, roundId, userId },
      orderBy: { sentAt: 'desc' }
    });
  }

  async getNonResponders(roundId: string, groupId: string): Promise<{ userId: string }[]> {
    const optedInMembers = await this.prisma.member.findMany({
      where: { groupId, optedIn: true },
      select: { userId: true }
    });

    const respondedUserIds = await this.prisma.availabilityResponse.findMany({
      where: { roundId, status: 'confirmed' },
      select: { userId: true }
    });

    const respondedIds = new Set(respondedUserIds.map(r => r.userId));

    return optedInMembers.filter(m => !respondedIds.has(m.userId));
  }

  async getNonRespondersByRound(roundId: string): Promise<string[]> {
    const round = await this.prisma.schedulingRound.findUnique({
      where: { id: roundId },
      include: {
        group: {
          include: {
            members: { where: { optedIn: true } }
          }
        }
      }
    });

    if (!round) return [];

    const optedInMemberIds = round.group.members.map(m => m.userId);

    const responses = await this.prisma.availabilityResponse.findMany({
      where: { roundId },
      select: { userId: true }
    });
    const respondedUserIds = new Set(responses.map(r => r.userId));

    return optedInMemberIds.filter(userId => !respondedUserIds.has(userId));
  }
}
