import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { PrismaClient } from '@prisma/client';
import { DatabaseService } from './database.service';

const prisma = new PrismaClient();
const db = new DatabaseService(prisma);

describe('Nudge & Non-Responder Tracking (Story 5.1) - Database Operations', () => {
  let group: any;
  let round: any;

  beforeEach(async () => {
    await prisma.nudgeTracking.deleteMany();
    await prisma.availabilityResponse.deleteMany();
    await prisma.schedulingRound.deleteMany();
    await prisma.member.deleteMany();
    await prisma.group.deleteMany();

    group = await db.findOrCreateGroup('group-nudge', 'Nudge Group');
    round = await db.createSchedulingRound(group.id, 'Nudge Topic', 'tomorrow');
    
    // Create 3 opted-in members
    await db.optInMember('user-n1', group.id);
    await db.optInMember('user-n2', group.id);
    await db.optInMember('user-n3', group.id);
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  test('should detect non-responders for a round', async () => {
    // One user confirms response
    await db.createAvailabilityResponse(round.id, 'user-n1', 'Free', {});
    await db.confirmAvailabilityResponse(round.id, 'user-n1');
    
    // One user responds but doesn't confirm (still a non-responder)
    await db.createAvailabilityResponse(round.id, 'user-n2', 'Busy', {});
    
    const nonResponders = await db.getNonRespondersForRound(round.id, group.id);
    
    // Should find user-n2 (not confirmed) and user-n3 (not responded at all)
    expect(nonResponders.length).toBe(2);
    expect(nonResponders.map(m => m.userId).sort()).toEqual(['user-n2', 'user-n3']);
  });

  test('should initialize and increment nudge tracking', async () => {
    const userId = 'user-n1';
    
    // Get or create
    let nudge = await db.getOrCreateNudgeTracking(round.id, userId);
    expect(nudge.nudgeCount).toBe(0);
    expect(nudge.lastNudgeAt).toBeNull();
    
    // Increment first time
    await db.incrementNudgeCount(round.id, userId);
    nudge = await db.getNudgeTracking(round.id, userId);
    expect(nudge.nudgeCount).toBe(1);
    expect(nudge.lastNudgeAt).not.toBeNull();
    
    // Increment second time
    await db.incrementNudgeCount(round.id, userId);
    nudge = await db.getNudgeTracking(round.id, userId);
    expect(nudge.nudgeCount).toBe(2);
  });

  test('should track nudges independently per user and round', async () => {
    // User 1 in Round 1
    await db.incrementNudgeCount(round.id, 'user-n1');
    
    // Create Round 2 in same group
    const round2 = await db.createSchedulingRound(group.id, 'Round 2', 'later');
    await db.incrementNudgeCount(round2.id, 'user-n1');
    await db.incrementNudgeCount(round2.id, 'user-n1');
    
    const nudge1 = await db.getNudgeTracking(round.id, 'user-n1');
    const nudge2 = await db.getNudgeTracking(round2.id, 'user-n1');
    
    expect(nudge1.nudgeCount).toBe(1);
    expect(nudge2.nudgeCount).toBe(2);
  });
});
