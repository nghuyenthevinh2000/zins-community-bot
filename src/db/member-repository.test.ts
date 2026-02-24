import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { PrismaClient } from '@prisma/client';
import { MemberRepository } from './member-repository';
import { GroupRepository } from './group-repository';

const prisma = new PrismaClient();
const memberRepo = new MemberRepository();
const groupRepo = new GroupRepository();

describe('MemberRepository - Member Tracking & Opt-In Status (Story 2.2)', () => {
  beforeEach(async () => {
    await prisma.member.deleteMany();
    await prisma.group.deleteMany();
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  test('should track opted-in and non-opted-in members separately', async () => {
    const group = await groupRepo.findOrCreate('group-123', 'Test Group');
    
    // Create opted-in members
    await memberRepo.optIn('user-1', group.id);
    await memberRepo.optIn('user-2', group.id);
    await memberRepo.optIn('user-3', group.id);
    
    // Create non-opted-in members (registered but not opted in)
    await memberRepo.findOrCreate('user-4', group.id);
    await memberRepo.findOrCreate('user-5', group.id);
    
    const allMembers = await memberRepo.getOptInStatusByGroup(group.id);
    
    expect(allMembers.optedIn.length).toBe(3);
    expect(allMembers.notOptedIn.length).toBe(2);
    expect(allMembers.optedIn.map(m => m.userId).sort()).toEqual(['user-1', 'user-2', 'user-3']);
    expect(allMembers.notOptedIn.map(m => m.userId).sort()).toEqual(['user-4', 'user-5']);
  });

  test('should report correct opted-in member count', async () => {
    const group = await groupRepo.findOrCreate('group-456', 'Test Group 2');
    
    // Initially no opted-in members
    let count = await memberRepo.countOptedInByGroup(group.id);
    expect(count).toBe(0);
    
    // Add opted-in members
    await memberRepo.optIn('user-a', group.id);
    await memberRepo.optIn('user-b', group.id);
    
    count = await memberRepo.countOptedInByGroup(group.id);
    expect(count).toBe(2);
    
    // Add non-opted-in member (shouldn't affect count)
    await memberRepo.findOrCreate('user-c', group.id);
    count = await memberRepo.countOptedInByGroup(group.id);
    expect(count).toBe(2);
  });

  test('should only include opted-in members when scheduling round initiates', async () => {
    const group = await groupRepo.findOrCreate('group-789', 'Test Group 3');
    
    // Create a mix of opted-in and non-opted-in members
    await memberRepo.optIn('opted-in-1', group.id);
    await memberRepo.optIn('opted-in-2', group.id);
    await memberRepo.findOrCreate('not-opted-in-1', group.id);
    await memberRepo.findOrCreate('not-opted-in-2', group.id);
    
    // Get opted-in members that should receive DMs
    const optedInMembers = await memberRepo.findOptedInByGroup(group.id);
    
    // Verify only opted-in members are returned
    expect(optedInMembers.length).toBe(2);
    expect(optedInMembers.every(m => m.optedIn === true)).toBe(true);
    expect(optedInMembers.map(m => m.userId).sort()).toEqual(['opted-in-1', 'opted-in-2']);
  });

  test('should handle group with no opted-in members', async () => {
    const group = await groupRepo.findOrCreate('empty-group', 'Empty Group');
    
    // Add non-opted-in members only
    await memberRepo.findOrCreate('user-x', group.id);
    await memberRepo.findOrCreate('user-y', group.id);
    
    const optedInMembers = await memberRepo.findOptedInByGroup(group.id);
    const count = await memberRepo.countOptedInByGroup(group.id);
    
    expect(optedInMembers.length).toBe(0);
    expect(count).toBe(0);
  });

  test('should properly track opt-in status changes', async () => {
    const group = await groupRepo.findOrCreate('group-tracking', 'Tracking Group');
    
    // Member initially not opted in
    let member = await memberRepo.findOrCreate('dynamic-user', group.id);
    expect(member.optedIn).toBe(false);
    
    let isOptedIn = await memberRepo.isOptedIn('dynamic-user', group.id);
    expect(isOptedIn).toBe(false);
    
    // Member opts in
    member = await memberRepo.optIn('dynamic-user', group.id);
    expect(member.optedIn).toBe(true);
    expect(member.optedInAt).toBeDefined();
    
    isOptedIn = await memberRepo.isOptedIn('dynamic-user', group.id);
    expect(isOptedIn).toBe(true);
    
    // Verify count updates
    const count = await memberRepo.countOptedInByGroup(group.id);
    expect(count).toBe(1);
  });

  test('should track members independently across groups', async () => {
    const group1 = await groupRepo.findOrCreate('group-alpha', 'Group Alpha');
    const group2 = await groupRepo.findOrCreate('group-beta', 'Group Beta');
    
    // Same user opts into both groups
    await memberRepo.optIn('multi-group-user', group1.id);
    await memberRepo.optIn('multi-group-user', group2.id);
    
    // Different users opt into only one group
    await memberRepo.optIn('group1-only', group1.id);
    await memberRepo.optIn('group2-only', group2.id);
    
    // Verify independent counts
    const count1 = await memberRepo.countOptedInByGroup(group1.id);
    const count2 = await memberRepo.countOptedInByGroup(group2.id);
    
    expect(count1).toBe(2);
    expect(count2).toBe(2);
    
    // Verify members are correctly tracked per group
    const members1 = await memberRepo.findOptedInByGroup(group1.id);
    const members2 = await memberRepo.findOptedInByGroup(group2.id);
    
    expect(members1.map(m => m.userId).sort()).toEqual(['group1-only', 'multi-group-user']);
    expect(members2.map(m => m.userId).sort()).toEqual(['group2-only', 'multi-group-user']);
  });
});
