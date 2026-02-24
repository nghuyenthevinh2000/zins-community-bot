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
