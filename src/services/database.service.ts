import { PrismaClient, type Group, type Member, type SchedulingRound, type AvailabilityResponse } from '@prisma/client';
import {
  GroupRepository,
  MemberRepository,
  RoundRepository,
  ResponseRepository,
  NLUQueueRepository,
  NudgeRepository
} from '../db';

/**
 * DatabaseService - Facade that delegates to specialized repositories
 * 
 * This service maintains backward compatibility while using the new
 * repository pattern defined in src/db/
 */
export class DatabaseService {
  private prisma: PrismaClient;
  
  // Repository instances
  public groups: GroupRepository;
  public members: MemberRepository;
  public rounds: RoundRepository;
  public responses: ResponseRepository;
  public nluQueue: NLUQueueRepository;
  public nudges: NudgeRepository;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    
    // Initialize repositories
    this.groups = new GroupRepository();
    this.members = new MemberRepository();
    this.rounds = new RoundRepository();
    this.responses = new ResponseRepository();
    this.nluQueue = new NLUQueueRepository();
    this.nudges = new NudgeRepository();
  }

  getPrisma(): PrismaClient {
    return this.prisma;
  }

  // ==================== GROUP OPERATIONS ====================
  
  async findOrCreateGroup(telegramId: string, name: string): Promise<Group> {
    return this.groups.findOrCreate(telegramId, name);
  }

  async getGroupByTelegramId(telegramId: string): Promise<Group | null> {
    return this.groups.findByTelegramId(telegramId);
  }

  // ==================== MEMBER OPERATIONS ====================

  async findOrCreateMember(userId: string, groupId: string): Promise<Member> {
    return this.members.findOrCreate(userId, groupId);
  }

  async optInMember(userId: string, groupId: string): Promise<Member> {
    return this.members.optIn(userId, groupId);
  }

  async getOptedInMembers(groupId: string): Promise<Member[]> {
    return this.members.findOptedInByGroup(groupId);
  }

  async isMemberOptedIn(userId: string, groupId: string): Promise<boolean> {
    return this.members.isOptedIn(userId, groupId);
  }

  async getOptedInMemberCount(groupId: string): Promise<number> {
    return this.members.countOptedInByGroup(groupId);
  }

  async getAllMembersWithOptInStatus(groupId: string): Promise<{ optedIn: Member[]; notOptedIn: Member[] }> {
    return this.members.getOptInStatusByGroup(groupId);
  }

  // ==================== ROUND OPERATIONS ====================

  async createSchedulingRound(groupId: string, topic: string, timeframe: string): Promise<SchedulingRound> {
    return this.rounds.create(groupId, topic, timeframe);
  }

  async getActiveRoundByGroup(groupId: string): Promise<SchedulingRound | null> {
    return this.rounds.findActiveByGroup(groupId);
  }

  async getAllRoundsByGroup(groupId: string): Promise<SchedulingRound[]> {
    return this.rounds.findAllByGroup(groupId);
  }

  async cancelRound(roundId: string): Promise<SchedulingRound> {
    return this.rounds.cancel(roundId);
  }

  async confirmRound(roundId: string): Promise<SchedulingRound> {
    return this.rounds.confirm(roundId);
  }

  async getActiveRoundStatus(groupId: string): Promise<{
    hasActiveRound: boolean;
    round: SchedulingRound | null;
    optedInCount: number;
  }> {
    const { hasActiveRound, round } = await this.rounds.getActiveStatus(groupId);
    const optedInCount = await this.members.countOptedInByGroup(groupId);
    return { hasActiveRound, round, optedInCount };
  }

  // ==================== RESPONSE OPERATIONS ====================

  async createAvailabilityResponse(
    roundId: string,
    userId: string,
    rawResponse: string,
    parsedAvailability: any
  ): Promise<AvailabilityResponse> {
    return this.responses.create(roundId, userId, rawResponse, parsedAvailability);
  }

  async confirmAvailabilityResponse(roundId: string, userId: string): Promise<AvailabilityResponse> {
    return this.responses.confirm(roundId, userId);
  }

  async getAvailabilityResponse(roundId: string, userId: string): Promise<AvailabilityResponse | null> {
    return this.responses.findByRoundAndUser(roundId, userId);
  }

  async getPendingAvailabilityResponse(userId: string): Promise<AvailabilityResponse | null> {
    return this.responses.findPendingByUser(userId);
  }

  async updateAvailabilityResponse(
    roundId: string,
    userId: string,
    rawResponse: string,
    parsedAvailability: any
  ): Promise<AvailabilityResponse> {
    return this.responses.update(roundId, userId, rawResponse, parsedAvailability);
  }

  async getVagueResponseCount(userId: string, roundId: string): Promise<number> {
    return this.responses.countVagueResponses(userId, roundId);
  }

  async updateAvailabilityResponseStatus(roundId: string, userId: string, status: string): Promise<AvailabilityResponse> {
    return this.responses.updateStatus(roundId, userId, status);
  }

  // ==================== NLU QUEUE OPERATIONS ====================

  async queuePendingNLURequest(
    roundId: string,
    userId: string,
    rawResponse: string,
    lastError?: string
  ): Promise<any> {
    return this.nluQueue.queue(roundId, userId, rawResponse, lastError);
  }

  async getPendingNLURequestsForRetry(): Promise<any[]> {
    return this.nluQueue.findPendingForRetry();
  }

  async markNLURequestCompleted(id: string): Promise<any> {
    return this.nluQueue.markCompleted(id);
  }

  async markNLURequestFailed(id: string, error: string): Promise<any> {
    return this.nluQueue.markFailed(id, error);
  }

  async updateNLURequestRetry(id: string, retryCount: number, lastError?: string): Promise<any> {
    return this.nluQueue.updateRetry(id, retryCount, lastError);
  }

  async deleteNLURequest(id: string): Promise<any> {
    return this.nluQueue.delete(id);
  }

  // ==================== NUDGE OPERATIONS ====================

  async getOrCreateNudgeTracking(roundId: string, userId: string): Promise<any> {
    return this.nudges.findOrCreateTracking(roundId, userId);
  }

  async incrementNudgeCount(roundId: string, userId: string): Promise<any> {
    return this.nudges.incrementTracking(roundId, userId);
  }

  async getNudgeTracking(roundId: string, userId: string): Promise<any | null> {
    return this.nudges.findTracking(roundId, userId);
  }

  async getNonRespondersForRound(roundId: string, groupId: string): Promise<any[]> {
    return this.nudges.getNonResponders(roundId, groupId);
  }

  async getNonResponders(roundId: string): Promise<string[]> {
    return this.nudges.getNonRespondersByRound(roundId);
  }

  async getAllNudgeTrackingForRound(roundId: string): Promise<any[]> {
    return this.nudges.findAllTrackingByRound(roundId);
  }

  async recordNudge(groupId: string, roundId: string, userId: string, nudgeNumber: number): Promise<any> {
    return this.nudges.recordHistory(groupId, roundId, userId, nudgeNumber);
  }

  async getNudgeCountForUser(groupId: string, roundId: string, userId: string): Promise<number> {
    return this.nudges.countHistoryForUser(groupId, roundId, userId);
  }

  async getLastNudgeTime(groupId: string, roundId: string, userId: string): Promise<Date | null> {
    const lastNudge = await this.nudges.findLastHistoryForUser(groupId, roundId, userId);
    return lastNudge?.sentAt ?? null;
  }

  async getNudgeSettings(groupId: string): Promise<{ nudgeIntervalHours: number; maxNudgeCount: number }> {
    return this.groups.getNudgeSettings(groupId);
  }

  async updateNudgeSettings(groupId: string, nudgeIntervalHours: number, maxNudgeCount: number): Promise<any> {
    return this.groups.updateNudgeSettings(groupId, nudgeIntervalHours, maxNudgeCount);
  }

  async shouldSendNudge(groupId: string, roundId: string, userId: string): Promise<{ shouldSend: boolean; reason?: string }> {
    const settings = await this.groups.getNudgeSettings(groupId);
    const nudgeCount = await this.nudges.countHistoryForUser(groupId, roundId, userId);

    if (nudgeCount >= settings.maxNudgeCount) {
      return { shouldSend: false, reason: 'max_nudges_reached' };
    }

    const lastNudge = await this.nudges.findLastHistoryForUser(groupId, roundId, userId);
    if (lastNudge?.sentAt) {
      const hoursSinceLastNudge = (Date.now() - lastNudge.sentAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastNudge < settings.nudgeIntervalHours) {
        return { shouldSend: false, reason: 'too_soon' };
      }
    }

    return { shouldSend: true };
  }
}
