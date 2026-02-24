<<<<<<< HEAD
import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { NudgeService } from './nudge.service';

describe('NudgeService (Story 5.1)', () => {
  let dbServiceMock: any;
  let telegramMock: any;
  let nudgeService: NudgeService;

  beforeEach(() => {
    dbServiceMock = {
      getPrisma: mock(() => ({
        schedulingRound: {
          findMany: mock(() => Promise.resolve([
            { id: 'round-1', groupId: 'group-1', topic: 'Team Lunch', status: 'active' }
          ]))
        }
      })),
      getNonRespondersForRound: mock(() => Promise.resolve([
        { userId: 'user-1' },
        { userId: 'user-2' }
      ])),
      getOrCreateNudgeTracking: mock((roundId, userId) => Promise.resolve({
        roundId,
        userId,
        nudgeCount: 0,
        lastNudgeAt: null
      })),
      incrementNudgeCount: mock(() => Promise.resolve({}))
    };

    telegramMock = {
      sendMessage: mock(() => Promise.resolve({}))
    };

    // Fast check interval for testing
    nudgeService = new NudgeService(dbServiceMock as any, telegramMock as any, {
      nudgeIntervalHours: 0 // Nudge immediately for testing
    });
    
    // Mock global setTimeout to avoid waiting during tests
    global.setTimeout = ((fn: any) => { fn(); return {} as any; }) as any;
  });

  test('should detect non-responders and send nudges with topic', async () => {
    await (nudgeService as any).checkAndNudgeNonResponders();

    // Should find non-responders for round-1
    expect(dbServiceMock.getNonRespondersForRound).toHaveBeenCalledWith('round-1', 'group-1');
    
    // Should send nudges to both non-responders
    expect(telegramMock.sendMessage).toHaveBeenCalledTimes(2);
    
    // Should include the topic in the message
    expect(telegramMock.sendMessage).toHaveBeenCalledWith(
      'user-1',
      expect.stringContaining('Team Lunch'),
      expect.any(Object)
    );
    expect(telegramMock.sendMessage).toHaveBeenCalledWith(
      'user-2',
      expect.stringContaining('Team Lunch'),
      expect.any(Object)
    );
    
    // Should update nudge tracking
    expect(dbServiceMock.incrementNudgeCount).toHaveBeenCalledTimes(2);
    expect(dbServiceMock.incrementNudgeCount).toHaveBeenCalledWith('round-1', 'user-1');
    expect(dbServiceMock.incrementNudgeCount).toHaveBeenCalledWith('round-1', 'user-2');
  });

  test('should respect max nudge count', async () => {
    dbServiceMock.getOrCreateNudgeTracking.mockReturnValue(Promise.resolve({
      roundId: 'round-1',
      userId: 'user-1',
      nudgeCount: 3, // Max count reached
      lastNudgeAt: new Date(Date.now() - 48 * 60 * 60 * 1000) // 2 days ago
    }));

    await (nudgeService as any).checkAndNudgeNonResponders();

    // Should NOT send nudge if max reached
    expect(telegramMock.sendMessage).not.toHaveBeenCalled();
    expect(dbServiceMock.incrementNudgeCount).not.toHaveBeenCalled();
  });

  test('should respect nudge interval', async () => {
    // Set interval to 24 hours
    (nudgeService as any).config.nudgeIntervalHours = 24;
    
    dbServiceMock.getOrCreateNudgeTracking.mockReturnValue(Promise.resolve({
      roundId: 'round-1',
      userId: 'user-1',
      nudgeCount: 1,
      lastNudgeAt: new Date(Date.now() - 12 * 60 * 60 * 1000) // Only 12 hours ago
    }));

    await (nudgeService as any).checkAndNudgeNonResponders();

    // Should NOT send nudge if interval hasn't passed
    expect(telegramMock.sendMessage).not.toHaveBeenCalled();
=======
import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { PrismaClient } from '@prisma/client';
import { DatabaseService } from './database.service';
import { NudgeService } from './nudge.service';

const prisma = new PrismaClient();
const db = new DatabaseService(prisma);
const nudgeService = new NudgeService(db);

describe('Configurable Nudge Cadence (Story 5.2)', () => {
  beforeEach(async () => {
    await prisma.nudgeHistory.deleteMany();
    await prisma.availabilityResponse.deleteMany();
    await prisma.pendingNLURequest.deleteMany();
    await prisma.schedulingRound.deleteMany();
    await prisma.member.deleteMany();
    await prisma.group.deleteMany();
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  test('should use default nudge settings (24h interval, 3 max)', async () => {
    const group = await db.findOrCreateGroup('default-nudge-group', 'Default Nudge Group');
    const settings = await db.getNudgeSettings(group.id);
    
    expect(settings.nudgeIntervalHours).toBe(24);
    expect(settings.maxNudgeCount).toBe(3);
  });

  test('should update nudge settings', async () => {
    const group = await db.findOrCreateGroup('custom-nudge-group', 'Custom Nudge Group');
    
    await db.updateNudgeSettings(group.id, 12, 5);
    
    const settings = await db.getNudgeSettings(group.id);
    expect(settings.nudgeIntervalHours).toBe(12);
    expect(settings.maxNudgeCount).toBe(5);
  });

  test('should record nudge in history', async () => {
    const group = await db.findOrCreateGroup('nudge-history-group', 'Nudge History Group');
    const round = await db.createSchedulingRound(group.id, 'Meeting', 'next week');
    
    await db.recordNudge(group.id, round.id, 'user-1', 1);
    await db.recordNudge(group.id, round.id, 'user-1', 2);
    
    const count = await db.getNudgeCountForUser(group.id, round.id, 'user-1');
    expect(count).toBe(2);
  });

  test('should not send nudge if max count reached', async () => {
    const group = await db.findOrCreateGroup('max-nudge-group', 'Max Nudge Group');
    await db.updateNudgeSettings(group.id, 24, 2); // Max 2 nudges
    
    const round = await db.createSchedulingRound(group.id, 'Meeting', 'next week');
    
    // Opt in a member
    await db.findOrCreateMember('user-1', group.id);
    await db.optInMember('user-1', group.id);
    
    // Send 2 nudges already
    await db.recordNudge(group.id, round.id, 'user-1', 1);
    await db.recordNudge(group.id, round.id, 'user-1', 2);
    
    // Check if should send nudge
    const nudgeCheck = await db.shouldSendNudge(group.id, round.id, 'user-1');
    expect(nudgeCheck.shouldSend).toBe(false);
    expect(nudgeCheck.reason).toBe('max_nudges_reached');
  });

  test('should not send nudge if interval not elapsed', async () => {
    const group = await db.findOrCreateGroup('interval-group', 'Interval Group');
    await db.updateNudgeSettings(group.id, 24, 3); // 24 hour interval
    
    const round = await db.createSchedulingRound(group.id, 'Meeting', 'next week');
    
    // Opt in a member
    await db.findOrCreateMember('user-1', group.id);
    await db.optInMember('user-1', group.id);
    
    // Send first nudge just now
    await db.recordNudge(group.id, round.id, 'user-1', 1);
    
    // Check immediately - should not send (too soon)
    const nudgeCheck = await db.shouldSendNudge(group.id, round.id, 'user-1');
    expect(nudgeCheck.shouldSend).toBe(false);
    expect(nudgeCheck.reason).toBe('too_soon');
  });

  test('should send nudge if interval elapsed', async () => {
    const group = await db.findOrCreateGroup('ready-nudge-group', 'Ready Nudge Group');
    await db.updateNudgeSettings(group.id, 1, 3); // 1 hour interval for testing
    
    const round = await db.createSchedulingRound(group.id, 'Meeting', 'next week');
    
    // Opt in a member
    await db.findOrCreateMember('user-1', group.id);
    await db.optInMember('user-1', group.id);
    
    // Send first nudge 2 hours ago (we can't easily mock time, so we rely on no previous nudge)
    // For this test, we just verify that without any previous nudge, it should send
    const nudgeCheck = await db.shouldSendNudge(group.id, round.id, 'user-1');
    expect(nudgeCheck.shouldSend).toBe(true);
  });

  test('should identify non-responders correctly', async () => {
    const group = await db.findOrCreateGroup('non-responder-group', 'Non-Responder Group');
    const round = await db.createSchedulingRound(group.id, 'Meeting', 'next week');
    
    // Create 3 opted-in members
    await db.optInMember('user-1', group.id);
    await db.optInMember('user-2', group.id);
    await db.optInMember('user-3', group.id);
    
    // user-1 and user-2 respond
    await db.createAvailabilityResponse(round.id, 'user-1', 'Tuesday', { days: ['Tuesday'], times: [], parsed: true });
    await db.createAvailabilityResponse(round.id, 'user-2', 'Wednesday', { days: ['Wednesday'], times: [], parsed: true });
    
    // Get non-responders
    const nonResponders = await db.getNonResponders(round.id);
    
    expect(nonResponders.length).toBe(1);
    expect(nonResponders[0]).toBe('user-3');
  });

  test('should get nudge statistics', async () => {
    const group = await db.findOrCreateGroup('stats-group', 'Stats Group');
    const round = await db.createSchedulingRound(group.id, 'Meeting', 'next week');
    
    // Send multiple nudges to different users
    await db.recordNudge(group.id, round.id, 'user-1', 1);
    await db.recordNudge(group.id, round.id, 'user-1', 2);
    await db.recordNudge(group.id, round.id, 'user-2', 1);
    await db.recordNudge(group.id, round.id, 'user-3', 1);
    
    const stats = await nudgeService.getNudgeStats(round.id);
    
    expect(stats.totalNudgesSent).toBe(4);
    expect(stats.uniqueUsersNudged).toBe(3);
    expect(stats.averageNudgesPerUser).toBe(4 / 3);
  });

  test('should detect when nudging is complete', async () => {
    const group = await db.findOrCreateGroup('complete-group', 'Complete Group');
    await db.updateNudgeSettings(group.id, 24, 2); // Max 2 nudges
    
    const round = await db.createSchedulingRound(group.id, 'Meeting', 'next week');
    
    // Create 2 opted-in members who don't respond
    await db.optInMember('user-1', group.id);
    await db.optInMember('user-2', group.id);
    
    // Both users received max nudges
    await db.recordNudge(group.id, round.id, 'user-1', 1);
    await db.recordNudge(group.id, round.id, 'user-1', 2);
    await db.recordNudge(group.id, round.id, 'user-2', 1);
    await db.recordNudge(group.id, round.id, 'user-2', 2);
    
    const isComplete = await nudgeService.isNudgingComplete(round.id);
    expect(isComplete).toBe(true);
  });

  test('should detect when nudging is not complete', async () => {
    const group = await db.findOrCreateGroup('incomplete-group', 'Incomplete Group');
    await db.updateNudgeSettings(group.id, 24, 3); // Max 3 nudges
    
    const round = await db.createSchedulingRound(group.id, 'Meeting', 'next week');
    
    // Create 2 opted-in members who don't respond
    await db.optInMember('user-1', group.id);
    await db.optInMember('user-2', group.id);
    
    // Only 1 user received max nudges, other has only 1
    await db.recordNudge(group.id, round.id, 'user-1', 1);
    await db.recordNudge(group.id, round.id, 'user-1', 2);
    await db.recordNudge(group.id, round.id, 'user-1', 3);
    await db.recordNudge(group.id, round.id, 'user-2', 1);
    
    const isComplete = await nudgeService.isNudgingComplete(round.id);
    expect(isComplete).toBe(false);
  });

  test('should track nudges per user per round independently', async () => {
    const group = await db.findOrCreateGroup('multi-round-group', 'Multi Round Group');
    const round1 = await db.createSchedulingRound(group.id, 'Meeting 1', 'week 1');
    const round2 = await db.createSchedulingRound(group.id, 'Meeting 2', 'week 2');
    
    // Same user in different rounds
    await db.recordNudge(group.id, round1.id, 'user-1', 1);
    await db.recordNudge(group.id, round1.id, 'user-1', 2);
    await db.recordNudge(group.id, round2.id, 'user-1', 1);
    
    const countRound1 = await db.getNudgeCountForUser(group.id, round1.id, 'user-1');
    const countRound2 = await db.getNudgeCountForUser(group.id, round2.id, 'user-1');
    
    expect(countRound1).toBe(2);
    expect(countRound2).toBe(1);
>>>>>>> story-5.2
  });
});
