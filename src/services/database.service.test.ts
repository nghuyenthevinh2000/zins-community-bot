import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { PrismaClient } from '@prisma/client';
import { DatabaseService } from '../services/database.service';

const prisma = new PrismaClient();
const db = new DatabaseService(prisma);

describe('Multi-Group Isolation', () => {
  beforeEach(async () => {
    // Clean up test data
    await prisma.schedulingRound.deleteMany();
    await prisma.member.deleteMany();
    await prisma.group.deleteMany();
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  test('groups should have isolated scheduling rounds', async () => {
    // Create Group A
    const groupA = await db.findOrCreateGroup('group-a-123', 'Group A');
    expect(groupA).toBeDefined();
    expect(groupA.telegramId).toBe('group-a-123');

    // Create Group B
    const groupB = await db.findOrCreateGroup('group-b-456', 'Group B');
    expect(groupB).toBeDefined();
    expect(groupB.telegramId).toBe('group-b-456');

    // Create a scheduling round for Group A
    const roundA = await db.createSchedulingRound(
      groupA.id,
      'Team Meeting',
      'next week'
    );
    expect(roundA).toBeDefined();
    expect(roundA.groupId).toBe(groupA.id);
    expect(roundA.status).toBe('active');

    // Group B should have no active rounds
    const groupBStatus = await db.getActiveRoundStatus(groupB.id);
    expect(groupBStatus.hasActiveRound).toBe(false);
    expect(groupBStatus.round).toBeNull();

    // Group A should have the active round
    const groupAStatus = await db.getActiveRoundStatus(groupA.id);
    expect(groupAStatus.hasActiveRound).toBe(true);
    expect(groupAStatus.round).toBeDefined();
    expect(groupAStatus.round!.id).toBe(roundA.id);
  });

  test('database queries should be scoped by group ID', async () => {
    // Create two groups
    const group1 = await db.findOrCreateGroup('group-1', 'Group 1');
    const group2 = await db.findOrCreateGroup('group-2', 'Group 2');

    // Create rounds in both groups
    await db.createSchedulingRound(group1.id, 'Round 1', 'today');
    await db.createSchedulingRound(group1.id, 'Round 2', 'tomorrow');
    await db.createSchedulingRound(group2.id, 'Round 3', 'next week');

    // Get rounds for group 1 - should only see group 1's rounds
    const group1Rounds = await db.getAllRoundsByGroup(group1.id);
    expect(group1Rounds.length).toBe(2);
    expect(group1Rounds.every(r => r.groupId === group1.id)).toBe(true);

    // Get rounds for group 2 - should only see group 2's rounds
    const group2Rounds = await db.getAllRoundsByGroup(group2.id);
    expect(group2Rounds.length).toBe(1);
    expect(group2Rounds[0].groupId).toBe(group2.id);

    // Active round query should also be scoped
    const activeGroup1 = await db.getActiveRoundByGroup(group1.id);
    expect(activeGroup1).toBeDefined();
    expect(activeGroup1!.groupId).toBe(group1.id);
  });

  test('members should be isolated per group', async () => {
    // Create two groups
    const group1 = await db.findOrCreateGroup('g1', 'Group 1');
    const group2 = await db.findOrCreateGroup('g2', 'Group 2');

    // Same user opts into both groups
    const userId = 'user-123';
    await db.optInMember(userId, group1.id);
    await db.optInMember(userId, group2.id);

    // Check membership in each group
    const isOptedInGroup1 = await db.isMemberOptedIn(userId, group1.id);
    const isOptedInGroup2 = await db.isMemberOptedIn(userId, group2.id);

    expect(isOptedInGroup1).toBe(true);
    expect(isOptedInGroup2).toBe(true);

    // Get opted-in members for each group
    const group1Members = await db.getOptedInMembers(group1.id);
    const group2Members = await db.getOptedInMembers(group2.id);

    expect(group1Members.length).toBe(1);
    expect(group1Members[0].userId).toBe(userId);
    expect(group2Members.length).toBe(1);
    expect(group2Members[0].userId).toBe(userId);

    // Verify they're different records
    expect(group1Members[0].id).not.toBe(group2Members[0].id);
  });

  test('cancelling a round in one group should not affect other groups', async () => {
    // Create two groups with active rounds
    const group1 = await db.findOrCreateGroup('g1', 'Group 1');
    const group2 = await db.findOrCreateGroup('g2', 'Group 2');

    const round1 = await db.createSchedulingRound(group1.id, 'Meeting 1', 'today');
    const round2 = await db.createSchedulingRound(group2.id, 'Meeting 2', 'today');

    // Cancel round in group 1
    await db.cancelRound(round1.id);

    // Group 1 should have no active rounds
    const group1Status = await db.getActiveRoundStatus(group1.id);
    expect(group1Status.hasActiveRound).toBe(false);

    // Group 2 should still have its active round
    const group2Status = await db.getActiveRoundStatus(group2.id);
    expect(group2Status.hasActiveRound).toBe(true);
    expect(group2Status.round!.id).toBe(round2.id);
  });

  test('/status command should show no active round for groups without one', async () => {
    const group = await db.findOrCreateGroup('empty-group', 'Empty Group');

    const status = await db.getActiveRoundStatus(group.id);
    
    expect(status.hasActiveRound).toBe(false);
    expect(status.round).toBeNull();
    expect(status.optedInCount).toBe(0);
  });
});
