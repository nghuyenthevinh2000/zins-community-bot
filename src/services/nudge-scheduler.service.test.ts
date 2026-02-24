import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { PrismaClient } from '@prisma/client';
import { DatabaseService } from './database.service';
import { NudgeSchedulerService } from './nudge-scheduler.service';

const prisma = new PrismaClient();
const db = new DatabaseService(prisma);

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
    await prisma.availabilityResponse.deleteMany();
    await prisma.pendingNLURequest.deleteMany();
    await prisma.schedulingRound.deleteMany();
    await prisma.member.deleteMany();
    await prisma.group.deleteMany();
    
    scheduler = new NudgeSchedulerService(db, mockBot);
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
    const group = await db.findOrCreateGroup('scheduler-test-group', 'Scheduler Test Group');
    const round = await db.createSchedulingRound(group.id, 'Meeting', 'next week');
    
    // Create 3 opted-in members
    await db.optInMember('user-1', group.id);
    await db.optInMember('user-2', group.id);
    await db.optInMember('user-3', group.id);
    
    // user-1 responds
    await db.createAvailabilityResponse(round.id, 'user-1', 'Tuesday', { days: ['Tuesday'], times: [] });
    
    // Get non-responders
    const nonResponders = await db.getNonResponders(round.id);
    
    expect(nonResponders.length).toBe(2);
    expect(nonResponders).toContain('user-2');
    expect(nonResponders).toContain('user-3');
  });

  test('should respect nudge interval settings', async () => {
    const group = await db.findOrCreateGroup('interval-test-group', 'Interval Test Group');
    await db.updateNudgeSettings(group.id, 2, 3); // 2 hour interval
    
    const round = await db.createSchedulingRound(group.id, 'Meeting', 'next week');
    await db.optInMember('non-responder', group.id);
    
    // No nudge sent yet, should be able to send
    const shouldSend1 = await db.shouldSendNudge(group.id, round.id, 'non-responder');
    expect(shouldSend1.shouldSend).toBe(true);
    
    // Send first nudge
    await db.recordNudge(group.id, round.id, 'non-responder', 1);
    
    // Immediately after, should not send (too soon)
    const shouldSend2 = await db.shouldSendNudge(group.id, round.id, 'non-responder');
    expect(shouldSend2.shouldSend).toBe(false);
    expect(shouldSend2.reason).toBe('too_soon');
  });

  test('should respect max nudge count', async () => {
    const group = await db.findOrCreateGroup('max-nudge-test-group', 'Max Nudge Test Group');
    await db.updateNudgeSettings(group.id, 1, 2); // Max 2 nudges
    
    const round = await db.createSchedulingRound(group.id, 'Meeting', 'next week');
    await db.optInMember('max-test-user', group.id);
    
    // Send 2 nudges
    await db.recordNudge(group.id, round.id, 'max-test-user', 1);
    await db.recordNudge(group.id, round.id, 'max-test-user', 2);
    
    // Should not send more (max reached)
    const shouldSend = await db.shouldSendNudge(group.id, round.id, 'max-test-user');
    expect(shouldSend.shouldSend).toBe(false);
    expect(shouldSend.reason).toBe('max_nudges_reached');
  });

  test('should handle multiple rounds independently', async () => {
    const group = await db.findOrCreateGroup('multi-round-test-group', 'Multi Round Test Group');
    const round1 = await db.createSchedulingRound(group.id, 'Meeting 1', 'week 1');
    const round2 = await db.createSchedulingRound(group.id, 'Meeting 2', 'week 2');
    
    await db.optInMember('multi-round-user', group.id);
    
    // Send nudge in round 1
    await db.recordNudge(group.id, round1.id, 'multi-round-user', 1);
    
    // Should still be able to send nudge in round 2
    const shouldSendRound2 = await db.shouldSendNudge(group.id, round2.id, 'multi-round-user');
    expect(shouldSendRound2.shouldSend).toBe(true);
  });
});
