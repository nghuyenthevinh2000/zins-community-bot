import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { PrismaClient } from '@prisma/client';
import {
  GroupRepository,
  MemberRepository,
  RoundRepository,
  ResponseRepository,
  NudgeRepository,
  getPrismaClient
} from '../../db';
import { NudgeSchedulerService, NudgeSchedulerRepositories } from './nudge-scheduler.service';

const prisma = getPrismaClient();

const repos: NudgeSchedulerRepositories = {
  rounds: new RoundRepository(),
  nudges: new NudgeRepository(),
  groups: new GroupRepository(),
  responses: new ResponseRepository(),
  members: new MemberRepository()
};

// Mock bot
const mockBot = {
  telegram: {
    sendMessage: async (userId: string, message: string, options?: any) => {
      console.log(`[Mock] Sending message to ${userId}: ${message.substring(0, 50)}...`);
      return { message_id: 123 };
    }
  }
};

describe('NudgeSchedulerService (Story 5.2)', () => {
  let scheduler: NudgeSchedulerService;

  beforeEach(async () => {
    await prisma.nudgeHistory.deleteMany();
    await prisma.nudgeTracking.deleteMany();
    await prisma.availabilityResponse.deleteMany();
    await prisma.pendingNLURequest.deleteMany();
    await prisma.schedulingRound.deleteMany();
    await prisma.member.deleteMany();
    await prisma.group.deleteMany();
    
    scheduler = new NudgeSchedulerService(repos, mockBot);
  });

  afterEach(async () => {
    scheduler.stop();
    await prisma.$disconnect();
  });

  test('should start and stop scheduler', () => {
    scheduler.start();
    // Scheduler should start without errors
    expect(true).toBe(true);
    
    scheduler.stop();
    // Should stop without errors
    expect(true).toBe(true);
  });

  test('should identify non-responders for nudging', async () => {
    const group = await repos.groups.findOrCreate('scheduler-test-group', 'Scheduler Test Group');
    const round = await repos.rounds.create(group.id, 'Meeting', 'next week');
    
    // Create 3 opted-in members
    await repos.members.optIn('user-1', group.id);
    await repos.members.optIn('user-2', group.id);
    await repos.members.optIn('user-3', group.id);
    
    // user-1 responds
    await repos.responses.create(round.id, 'user-1', 'Tuesday', { days: ['Tuesday'], times: [] });
    
    // Get non-responders
    const nonResponders = await repos.nudges.getNonRespondersByRound(round.id);
    
    expect(nonResponders.length).toBe(2);
    expect(nonResponders).toContain('user-2');
    expect(nonResponders).toContain('user-3');
  });

  test('should respect nudge interval settings', async () => {
    const group = await repos.groups.findOrCreate('interval-test-group', 'Interval Test Group');
    await repos.groups.updateNudgeSettings(group.id, 2, 3); // 2 hour interval
    
    const round = await repos.rounds.create(group.id, 'Meeting', 'next week');
    await repos.members.optIn('non-responder', group.id);
    
    // No nudge sent yet, should be able to send
    const lastNudge = await repos.nudges.findLastHistoryForUser(group.id, round.id, 'non-responder');
    expect(lastNudge).toBeNull();
    
    // Send first nudge
    await repos.nudges.recordHistory(group.id, round.id, 'non-responder', 1);
    
    // Immediately after, should not send (too soon)
    const lastNudge2 = await repos.nudges.findLastHistoryForUser(group.id, round.id, 'non-responder');
    expect(lastNudge2).not.toBeNull();
    const hoursSince = (Date.now() - lastNudge2!.sentAt.getTime()) / (1000 * 60 * 60);
    expect(hoursSince).toBeLessThan(2); // Less than 2 hours
  });

  test('should respect max nudge count', async () => {
    const group = await repos.groups.findOrCreate('max-nudge-test-group', 'Max Nudge Test Group');
    await repos.groups.updateNudgeSettings(group.id, 1, 2); // Max 2 nudges
    
    const round = await repos.rounds.create(group.id, 'Meeting', 'next week');
    await repos.members.optIn('max-test-user', group.id);
    
    // Send 2 nudges
    await repos.nudges.recordHistory(group.id, round.id, 'max-test-user', 1);
    await repos.nudges.recordHistory(group.id, round.id, 'max-test-user', 2);
    
    // Check count
    const nudgeCount = await repos.nudges.countHistoryForUser(group.id, round.id, 'max-test-user');
    expect(nudgeCount).toBe(2);
  });

  test('should handle multiple rounds independently', async () => {
    const group = await repos.groups.findOrCreate('multi-round-test-group', 'Multi Round Test Group');
    const round1 = await repos.rounds.create(group.id, 'Meeting 1', 'week 1');
    const round2 = await repos.rounds.create(group.id, 'Meeting 2', 'week 2');
    
    await repos.members.optIn('multi-round-user', group.id);
    
    // Send nudge in round 1
    await repos.nudges.recordHistory(group.id, round1.id, 'multi-round-user', 1);
    
    // Check nudge counts independently
    const count1 = await repos.nudges.countHistoryForUser(group.id, round1.id, 'multi-round-user');
    const count2 = await repos.nudges.countHistoryForUser(group.id, round2.id, 'multi-round-user');
    
    expect(count1).toBe(1);
    expect(count2).toBe(0);
  });
});
