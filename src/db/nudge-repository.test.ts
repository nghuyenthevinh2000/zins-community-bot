import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { PrismaClient } from '@prisma/client';
import { NudgeRepository } from './nudge-repository';
import { RoundRepository } from './round-repository';
import { GroupRepository } from './group-repository';
import { MemberRepository } from './member-repository';
import { ResponseRepository } from './response-repository';

const prisma = new PrismaClient();
const nudgeRepo = new NudgeRepository();
const roundRepo = new RoundRepository();
const groupRepo = new GroupRepository();
const memberRepo = new MemberRepository();
const responseRepo = new ResponseRepository();

describe('NudgeRepository - Nudge & Non-Responder Tracking (Story 5.1)', () => {
  let group: any;
  let round: any;

  beforeEach(async () => {
    await prisma.nudgeHistory.deleteMany();
    await prisma.nudgeTracking.deleteMany();
    await prisma.availabilityResponse.deleteMany();
    await prisma.schedulingRound.deleteMany();
    await prisma.member.deleteMany();
    await prisma.group.deleteMany();

    group = await groupRepo.findOrCreate('group-nudge', 'Nudge Group');
    round = await roundRepo.create(group.id, 'Nudge Topic', 'tomorrow');
    
    // Create 3 opted-in members
    await memberRepo.optIn('user-n1', group.id);
    await memberRepo.optIn('user-n2', group.id);
    await memberRepo.optIn('user-n3', group.id);
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  test('should detect non-responders for a round', async () => {
    // One user confirms response
    await responseRepo.create(round.id, 'user-n1', 'Free', {});
    await responseRepo.confirm(round.id, 'user-n1');
    
    // One user responds but doesn't confirm (still a non-responder)
    await responseRepo.create(round.id, 'user-n2', 'Busy', {});
    
    const nonResponders = await nudgeRepo.getNonResponders(round.id, group.id);
    
    // Should find user-n2 (not confirmed) and user-n3 (not responded at all)
    expect(nonResponders.length).toBe(2);
    expect(nonResponders.map(m => m.userId).sort()).toEqual(['user-n2', 'user-n3']);
  });

  test('should initialize and increment nudge tracking', async () => {
    const userId = 'user-n1';
    
    // Get or create
    let nudge = await nudgeRepo.findOrCreateTracking(round.id, userId);
    expect(nudge.nudgeCount).toBe(0);
    expect(nudge.lastNudgeAt).toBeNull();
    
    // Increment first time
    await nudgeRepo.incrementTracking(round.id, userId);
    nudge = await nudgeRepo.findTracking(round.id, userId);
    expect(nudge).not.toBeNull();
    expect(nudge!.nudgeCount).toBe(1);
    expect(nudge!.lastNudgeAt).not.toBeNull();
    
    // Increment second time
    await nudgeRepo.incrementTracking(round.id, userId);
    nudge = await nudgeRepo.findTracking(round.id, userId);
    expect(nudge!.nudgeCount).toBe(2);
  });

  test('should track nudges independently per user and round', async () => {
    // User 1 in Round 1
    await nudgeRepo.incrementTracking(round.id, 'user-n1');
    
    // Create Round 2 in same group
    const round2 = await roundRepo.create(group.id, 'Round 2', 'later');
    await nudgeRepo.incrementTracking(round2.id, 'user-n1');
    await nudgeRepo.incrementTracking(round2.id, 'user-n1');
    
    const nudge1 = await nudgeRepo.findTracking(round.id, 'user-n1');
    const nudge2 = await nudgeRepo.findTracking(round2.id, 'user-n1');
    
    expect(nudge1).not.toBeNull();
    expect(nudge2).not.toBeNull();
    expect(nudge1!.nudgeCount).toBe(1);
    expect(nudge2!.nudgeCount).toBe(2);
  });

  test('should record and retrieve nudge history', async () => {
    const userId = 'user-n1';
    
    // Record some nudges
    await nudgeRepo.recordHistory(group.id, round.id, userId, 1);
    await nudgeRepo.recordHistory(group.id, round.id, userId, 2);
    
    // Count nudges for user
    const count = await nudgeRepo.countHistoryForUser(group.id, round.id, userId);
    expect(count).toBe(2);
    
    // Get last nudge time
    const lastNudge = await nudgeRepo.findLastHistoryForUser(group.id, round.id, userId);
    expect(lastNudge).not.toBeNull();
    expect(lastNudge!.nudgeNumber).toBe(2);
  });

  test('should get non-responders by round', async () => {
    // One user confirms
    await responseRepo.create(round.id, 'user-n1', 'Free', {});
    await responseRepo.confirm(round.id, 'user-n1');
    
    const nonResponders = await nudgeRepo.getNonRespondersByRound(round.id);
    
    // Should find user-n2 and user-n3 (not confirmed)
    expect(nonResponders.length).toBe(2);
    expect(nonResponders.sort()).toEqual(['user-n2', 'user-n3']);
  });
});
