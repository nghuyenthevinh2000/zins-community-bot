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


  // Story 5.1: Nudge tracking operations
  async getOrCreateNudgeTracking(roundId: string, userId: string): Promise<any> {
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

  async incrementNudgeCount(roundId: string, userId: string): Promise<any> {
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

  async getNudgeTracking(roundId: string, userId: string): Promise<any | null> {
    return this.prisma.nudgeTracking.findUnique({
      where: { roundId_userId: { roundId, userId } }
    });
  }

  async getNonRespondersForRound(roundId: string, groupId: string): Promise<any[]> {
    // Get all opted-in members who haven't confirmed their availability
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

  async getAllNudgeTrackingForRound(roundId: string): Promise<any[]> {
    return this.prisma.nudgeTracking.findMany({
      where: { roundId }
    });
  }

  // Story 5.2: Nudge operations
  async getNudgeSettings(groupId: string): Promise<{ nudgeIntervalHours: number; maxNudgeCount: number }> {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: { nudgeIntervalHours: true, maxNudgeCount: true }
    });

    return {
      nudgeIntervalHours: group?.nudgeIntervalHours ?? 24,
      maxNudgeCount: group?.maxNudgeCount ?? 3
    };
  }

  async updateNudgeSettings(
    groupId: string,
    nudgeIntervalHours: number,
    maxNudgeCount: number
  ): Promise<any> {
    return this.prisma.group.update({
      where: { id: groupId },
      data: { nudgeIntervalHours, maxNudgeCount }
    });
  }

  async recordNudge(groupId: string, roundId: string, userId: string, nudgeNumber: number): Promise<any> {
    return this.prisma.nudgeHistory.create({
      data: {
        groupId,
        roundId,
        userId,
        nudgeNumber
      }
    });
  }

  async getNudgeCountForUser(groupId: string, roundId: string, userId: string): Promise<number> {
    return this.prisma.nudgeHistory.count({
      where: { groupId, roundId, userId }
    });
  }

  async getLastNudgeTime(groupId: string, roundId: string, userId: string): Promise<Date | null> {
    const lastNudge = await this.prisma.nudgeHistory.findFirst({
      where: { groupId, roundId, userId },
      orderBy: { sentAt: 'desc' }
    });

    return lastNudge?.sentAt ?? null;
  }

  async shouldSendNudge(
    groupId: string,
    roundId: string,
    userId: string
  ): Promise<{ shouldSend: boolean; reason?: string }> {
    const settings = await this.getNudgeSettings(groupId);
    const nudgeCount = await this.getNudgeCountForUser(groupId, roundId, userId);

    // Check if max nudges reached
    if (nudgeCount >= settings.maxNudgeCount) {
      return { shouldSend: false, reason: 'max_nudges_reached' };
    }

    // Check if enough time has passed since last nudge
    const lastNudgeTime = await this.getLastNudgeTime(groupId, roundId, userId);
    if (lastNudgeTime) {
      const hoursSinceLastNudge = (Date.now() - lastNudgeTime.getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastNudge < settings.nudgeIntervalHours) {
        return { shouldSend: false, reason: 'too_soon' };
      }
    }

    return { shouldSend: true };
  }

  async getNonResponders(roundId: string): Promise<string[]> {
    // Get all opted-in members for this round's group
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

    // Get users who have responded
    const responses = await this.prisma.availabilityResponse.findMany({
      where: { roundId },
      select: { userId: true }
    });
    const respondedUserIds = new Set(responses.map(r => r.userId));

    // Return users who are opted in but haven't responded
    return optedInMemberIds.filter(userId => !respondedUserIds.has(userId));
  }

}
