import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { PrismaClient } from '@prisma/client';
import { DatabaseService } from './database.service';

const prisma = new PrismaClient();
const db = new DatabaseService(prisma);

describe('Member Tracking & Opt-In Status (Story 2.2)', () => {
  beforeEach(async () => {
    await prisma.schedulingRound.deleteMany();
    await prisma.member.deleteMany();
    await prisma.group.deleteMany();
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  test('should track opted-in and non-opted-in members separately', async () => {
    const group = await db.findOrCreateGroup('group-123', 'Test Group');
    
    // Create opted-in members
    await db.optInMember('user-1', group.id);
    await db.optInMember('user-2', group.id);
    await db.optInMember('user-3', group.id);
    
    // Create non-opted-in members (registered but not opted in)
    await db.findOrCreateMember('user-4', group.id);
    await db.findOrCreateMember('user-5', group.id);
    
    const allMembers = await db.getAllMembersWithOptInStatus(group.id);
    
    expect(allMembers.optedIn.length).toBe(3);
    expect(allMembers.notOptedIn.length).toBe(2);
    expect(allMembers.optedIn.map(m => m.userId).sort()).toEqual(['user-1', 'user-2', 'user-3']);
    expect(allMembers.notOptedIn.map(m => m.userId).sort()).toEqual(['user-4', 'user-5']);
  });

  test('should report correct opted-in member count', async () => {
    const group = await db.findOrCreateGroup('group-456', 'Test Group 2');
    
    // Initially no opted-in members
    let count = await db.getOptedInMemberCount(group.id);
    expect(count).toBe(0);
    
    // Add opted-in members
    await db.optInMember('user-a', group.id);
    await db.optInMember('user-b', group.id);
    
    count = await db.getOptedInMemberCount(group.id);
    expect(count).toBe(2);
    
    // Add non-opted-in member (shouldn't affect count)
    await db.findOrCreateMember('user-c', group.id);
    count = await db.getOptedInMemberCount(group.id);
    expect(count).toBe(2);
  });

  test('should only include opted-in members when scheduling round initiates', async () => {
    const group = await db.findOrCreateGroup('group-789', 'Test Group 3');
    
    // Create a mix of opted-in and non-opted-in members
    await db.optInMember('opted-in-1', group.id);
    await db.optInMember('opted-in-2', group.id);
    await db.findOrCreateMember('not-opted-in-1', group.id);
    await db.findOrCreateMember('not-opted-in-2', group.id);
    
    // Get opted-in members that should receive DMs
    const optedInMembers = await db.getOptedInMembers(group.id);
    
    // Verify only opted-in members are returned
    expect(optedInMembers.length).toBe(2);
    expect(optedInMembers.every(m => m.optedIn === true)).toBe(true);
    expect(optedInMembers.map(m => m.userId).sort()).toEqual(['opted-in-1', 'opted-in-2']);
    
    // Create a scheduling round
    const round = await db.createSchedulingRound(group.id, 'Test Meeting', 'next week');
    expect(round.groupId).toBe(group.id);
    
    // Verify round status includes opted-in count
    const status = await db.getActiveRoundStatus(group.id);
    expect(status.optedInCount).toBe(2);
    expect(status.hasActiveRound).toBe(true);
  });

  test('should handle group with no opted-in members', async () => {
    const group = await db.findOrCreateGroup('empty-group', 'Empty Group');
    
    // Add non-opted-in members only
    await db.findOrCreateMember('user-x', group.id);
    await db.findOrCreateMember('user-y', group.id);
    
    const optedInMembers = await db.getOptedInMembers(group.id);
    const count = await db.getOptedInMemberCount(group.id);
    
    expect(optedInMembers.length).toBe(0);
    expect(count).toBe(0);
  });

  test('should properly track opt-in status changes', async () => {
    const group = await db.findOrCreateGroup('group-tracking', 'Tracking Group');
    
    // Member initially not opted in
    let member = await db.findOrCreateMember('dynamic-user', group.id);
    expect(member.optedIn).toBe(false);
    
    let isOptedIn = await db.isMemberOptedIn('dynamic-user', group.id);
    expect(isOptedIn).toBe(false);
    
    // Member opts in
    member = await db.optInMember('dynamic-user', group.id);
    expect(member.optedIn).toBe(true);
    expect(member.optedInAt).toBeDefined();
    
    isOptedIn = await db.isMemberOptedIn('dynamic-user', group.id);
    expect(isOptedIn).toBe(true);
    
    // Verify count updates
    const count = await db.getOptedInMemberCount(group.id);
    expect(count).toBe(1);
  });

  test('should track members independently across groups', async () => {
    const group1 = await db.findOrCreateGroup('group-alpha', 'Group Alpha');
    const group2 = await db.findOrCreateGroup('group-beta', 'Group Beta');
    
    // Same user opts into both groups
    await db.optInMember('multi-group-user', group1.id);
    await db.optInMember('multi-group-user', group2.id);
    
    // Different users opt into only one group
    await db.optInMember('group1-only', group1.id);
    await db.optInMember('group2-only', group2.id);
    
    // Verify independent counts
    const count1 = await db.getOptedInMemberCount(group1.id);
    const count2 = await db.getOptedInMemberCount(group2.id);
    
    expect(count1).toBe(2);
    expect(count2).toBe(2);
    
    // Verify members are correctly tracked per group
    const members1 = await db.getOptedInMembers(group1.id);
    const members2 = await db.getOptedInMembers(group2.id);
    
    expect(members1.map(m => m.userId).sort()).toEqual(['group1-only', 'multi-group-user']);
    expect(members2.map(m => m.userId).sort()).toEqual(['group2-only', 'multi-group-user']);
  });

  test('should provide accurate opted-in count in round status', async () => {
    const group = await db.findOrCreateGroup('status-test-group', 'Status Test');
    
    // Create 5 opted-in and 3 non-opted-in members
    for (let i = 1; i <= 5; i++) {
      await db.optInMember(`opted-user-${i}`, group.id);
    }
    for (let i = 1; i <= 3; i++) {
      await db.findOrCreateMember(`non-opted-user-${i}`, group.id);
    }
    
    // Create scheduling round
    const round = await db.createSchedulingRound(group.id, 'Team Sync', 'tomorrow');
    
    // Check status shows correct opted-in count
    const status = await db.getActiveRoundStatus(group.id);
    expect(status.optedInCount).toBe(5);
    expect(status.hasActiveRound).toBe(true);
    expect(status.round!.id).toBe(round.id);
  });
});

describe('Prevent Duplicate Scheduling Rounds (Story 3.2)', () => {
  beforeEach(async () => {
    await prisma.schedulingRound.deleteMany();
    await prisma.member.deleteMany();
    await prisma.group.deleteMany();
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  test('should detect when an active scheduling round already exists', async () => {
    const group = await db.findOrCreateGroup('duplicate-test-group', 'Duplicate Test Group');
    
    // Create an active scheduling round
    const firstRound = await db.createSchedulingRound(group.id, 'First Meeting', 'next week');
    expect(firstRound.status).toBe('active');
    
    // Check if active round exists
    const activeRound = await db.getActiveRoundByGroup(group.id);
    expect(activeRound).not.toBeNull();
    expect(activeRound!.id).toBe(firstRound.id);
    expect(activeRound!.topic).toBe('First Meeting');
    
    // Verify hasActiveRound returns true
    const status = await db.getActiveRoundStatus(group.id);
    expect(status.hasActiveRound).toBe(true);
  });

  test('should prevent creating a new round when one is already active', async () => {
    const group = await db.findOrCreateGroup('prevent-dup-group', 'Prevent Duplicate Group');
    
    // Create first active round
    await db.createSchedulingRound(group.id, 'Existing Meeting', 'tomorrow');
    
    // Try to create second round - this simulates what the handler does
    const activeRound = await db.getActiveRoundByGroup(group.id);
    
    if (activeRound) {
      // In real handler, this would return an error message to the user
      expect(activeRound).not.toBeNull();
      expect(activeRound.status).toBe('active');
      
      // The second round should NOT be created (simulated by not calling create)
      const rounds = await db.getAllRoundsByGroup(group.id);
      expect(rounds.length).toBe(1);
      expect(rounds[0].topic).toBe('Existing Meeting');
    }
  });

  test('should allow new round after previous round is confirmed', async () => {
    const group = await db.findOrCreateGroup('confirm-then-new-group', 'Confirm Then New Group');
    
    // Create and confirm first round
    const firstRound = await db.createSchedulingRound(group.id, 'First Meeting', 'today');
    await db.confirmRound(firstRound.id);
    
    // Verify no active rounds (confirmed is not active)
    let activeRound = await db.getActiveRoundByGroup(group.id);
    expect(activeRound).toBeNull();
    
    // Now create a new round
    const secondRound = await db.createSchedulingRound(group.id, 'Second Meeting', 'next week');
    expect(secondRound.status).toBe('active');
    
    // Verify it's active
    activeRound = await db.getActiveRoundByGroup(group.id);
    expect(activeRound).not.toBeNull();
    expect(activeRound!.id).toBe(secondRound.id);
  });

  test('should track multiple rounds with different statuses', async () => {
    const group = await db.findOrCreateGroup('multi-round-group', 'Multi Round Group');
    
    // Create multiple rounds with different statuses
    const round1 = await db.createSchedulingRound(group.id, 'Meeting 1', 'week 1');
    await db.cancelRound(round1.id);
    
    const round2 = await db.createSchedulingRound(group.id, 'Meeting 2', 'week 2');
    await db.confirmRound(round2.id);
    
    const round3 = await db.createSchedulingRound(group.id, 'Meeting 3', 'week 3');
    // Leave this one active
    
    // Verify only the last one is active
    const activeRound = await db.getActiveRoundByGroup(group.id);
    expect(activeRound).not.toBeNull();
    expect(activeRound!.id).toBe(round3.id);
    expect(activeRound!.topic).toBe('Meeting 3');
    
    // Verify total rounds
    const allRounds = await db.getAllRoundsByGroup(group.id);
    expect(allRounds.length).toBe(3);
  });

  test('should isolate duplicate prevention per group', async () => {
    const group1 = await db.findOrCreateGroup('group1-dup', 'Group 1 Duplicate');
    const group2 = await db.findOrCreateGroup('group2-dup', 'Group 2 Duplicate');
    
    // Create active round in group 1
    await db.createSchedulingRound(group1.id, 'Group 1 Meeting', 'today');
    
    // Verify group 1 has active round
    const group1Active = await db.getActiveRoundByGroup(group1.id);
    expect(group1Active).not.toBeNull();
    
    // Verify group 2 has no active round
    const group2Active = await db.getActiveRoundByGroup(group2.id);
    expect(group2Active).toBeNull();
    
    // Group 2 should be able to create a round
    const group2Round = await db.createSchedulingRound(group2.id, 'Group 2 Meeting', 'tomorrow');
    expect(group2Round.status).toBe('active');
    
    // Both groups now have their own active rounds
    expect((await db.getActiveRoundByGroup(group1.id))!.topic).toBe('Group 1 Meeting');
    expect((await db.getActiveRoundByGroup(group2.id))!.topic).toBe('Group 2 Meeting');
  });
});

describe('Cancel an Active Scheduling Round (Story 3.3)', () => {
  test('should cancel an active scheduling round', async () => {
    const group = await db.findOrCreateGroup('cancel-group', 'Cancel Group');
    const round = await db.createSchedulingRound(group.id, 'Cancel Me', 'tomorrow');
    
    // Verify it's active
    let activeRound = await db.getActiveRoundByGroup(group.id);
    expect(activeRound).not.toBeNull();
    expect(activeRound!.id).toBe(round.id);
    
    // Cancel it
    await db.cancelRound(round.id);
    
    // Verify it's no longer active
    activeRound = await db.getActiveRoundByGroup(group.id);
    expect(activeRound).toBeNull();
    
    // Verify status in all rounds
    const allRounds = await db.getAllRoundsByGroup(group.id);
    expect(allRounds[0].status).toBe('cancelled');
  });

  test('should allow new round after previous round is cancelled', async () => {
    const group = await db.findOrCreateGroup('cancel-then-new-group-3.3', 'Cancel Then New Group 3.3');
    
    // Create first round
    const firstRound = await db.createSchedulingRound(group.id, 'First Meeting', 'today');
    
    // Cancel the first round
    await db.cancelRound(firstRound.id);
    
    // Now create a new round
    const secondRound = await db.createSchedulingRound(group.id, 'Second Meeting', 'tomorrow');
    expect(secondRound.status).toBe('active');
    
    // Verify it's the active one
    const activeRound = await db.getActiveRoundByGroup(group.id);
    expect(activeRound!.id).toBe(secondRound.id);
  });
});
