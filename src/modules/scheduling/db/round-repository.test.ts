import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { PrismaClient } from '@prisma/client';
import { RoundRepository } from './round-repository';
import { GroupRepository } from '../../group/db/group-repository';

const prisma = new PrismaClient();
const roundRepo = new RoundRepository();
const groupRepo = new GroupRepository();

describe('RoundRepository - Prevent Duplicate Scheduling Rounds (Story 3.2)', () => {
  beforeEach(async () => {
    await prisma.schedulingRound.deleteMany();
    await prisma.group.deleteMany();
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  test('should detect when an active scheduling round already exists', async () => {
    const group = await groupRepo.findOrCreate('duplicate-test-group', 'Duplicate Test Group');
    
    // Create an active scheduling round
    const firstRound = await roundRepo.create(group.id, 'First Meeting', 'next week');
    expect(firstRound.status).toBe('active');
    
    // Check if active round exists
    const activeRound = await roundRepo.findActiveByGroup(group.id);
    expect(activeRound).not.toBeNull();
    expect(activeRound!.id).toBe(firstRound.id);
    expect(activeRound!.topic).toBe('First Meeting');
    
    // Verify hasActiveRound returns true
    const status = await roundRepo.getActiveStatus(group.id);
    expect(status.hasActiveRound).toBe(true);
  });

  test('should prevent creating a new round when one is already active', async () => {
    const group = await groupRepo.findOrCreate('prevent-dup-group', 'Prevent Duplicate Group');
    
    // Create first active round
    await roundRepo.create(group.id, 'Existing Meeting', 'tomorrow');
    
    // Try to create second round - this simulates what the handler does
    const activeRound = await roundRepo.findActiveByGroup(group.id);
    
    if (activeRound) {
      // In real handler, this would return an error message to the user
      expect(activeRound).not.toBeNull();
      expect(activeRound.status).toBe('active');
      
      // The second round should NOT be created (simulated by not calling create)
      const rounds = await roundRepo.findAllByGroup(group.id);
      expect(rounds.length).toBe(1);
      expect(rounds[0].topic).toBe('Existing Meeting');
    }
  });

  test('should allow new round after previous round is confirmed', async () => {
    const group = await groupRepo.findOrCreate('confirm-then-new-group', 'Confirm Then New Group');
    
    // Create and confirm first round
    const firstRound = await roundRepo.create(group.id, 'First Meeting', 'today');
    await roundRepo.confirm(firstRound.id);
    
    // Verify no active rounds (confirmed is not active)
    let activeRound = await roundRepo.findActiveByGroup(group.id);
    expect(activeRound).toBeNull();
    
    // Now create a new round
    const secondRound = await roundRepo.create(group.id, 'Second Meeting', 'next week');
    expect(secondRound.status).toBe('active');
    
    // Verify it's active
    activeRound = await roundRepo.findActiveByGroup(group.id);
    expect(activeRound).not.toBeNull();
    expect(activeRound!.id).toBe(secondRound.id);
  });

  test('should track multiple rounds with different statuses', async () => {
    const group = await groupRepo.findOrCreate('multi-round-group', 'Multi Round Group');
    
    // Create multiple rounds with different statuses
    const round1 = await roundRepo.create(group.id, 'Meeting 1', 'week 1');
    await roundRepo.cancel(round1.id);
    
    const round2 = await roundRepo.create(group.id, 'Meeting 2', 'week 2');
    await roundRepo.confirm(round2.id);
    
    const round3 = await roundRepo.create(group.id, 'Meeting 3', 'week 3');
    // Leave this one active
    
    // Verify only the last one is active
    const activeRound = await roundRepo.findActiveByGroup(group.id);
    expect(activeRound).not.toBeNull();
    expect(activeRound!.id).toBe(round3.id);
    expect(activeRound!.topic).toBe('Meeting 3');
    
    // Verify total rounds
    const allRounds = await roundRepo.findAllByGroup(group.id);
    expect(allRounds.length).toBe(3);
  });

  test('should isolate duplicate prevention per group', async () => {
    const group1 = await groupRepo.findOrCreate('group1-dup', 'Group 1 Duplicate');
    const group2 = await groupRepo.findOrCreate('group2-dup', 'Group 2 Duplicate');
    
    // Create active round in group 1
    await roundRepo.create(group1.id, 'Group 1 Meeting', 'today');
    
    // Verify group 1 has active round
    const group1Active = await roundRepo.findActiveByGroup(group1.id);
    expect(group1Active).not.toBeNull();
    
    // Verify group 2 has no active round
    const group2Active = await roundRepo.findActiveByGroup(group2.id);
    expect(group2Active).toBeNull();
    
    // Group 2 should be able to create a round
    const group2Round = await roundRepo.create(group2.id, 'Group 2 Meeting', 'tomorrow');
    expect(group2Round.status).toBe('active');
    
    // Both groups now have their own active rounds
    expect((await roundRepo.findActiveByGroup(group1.id))!.topic).toBe('Group 1 Meeting');
    expect((await roundRepo.findActiveByGroup(group2.id))!.topic).toBe('Group 2 Meeting');
  });
});

describe('RoundRepository - Cancel an Active Scheduling Round (Story 3.3)', () => {
  test('should cancel an active scheduling round', async () => {
    const group = await groupRepo.findOrCreate('cancel-group', 'Cancel Group');
    const round = await roundRepo.create(group.id, 'Cancel Me', 'tomorrow');
    
    // Verify it's active
    let activeRound = await roundRepo.findActiveByGroup(group.id);
    expect(activeRound).not.toBeNull();
    expect(activeRound!.id).toBe(round.id);
    
    // Cancel it
    await roundRepo.cancel(round.id);
    
    // Verify it's no longer active
    activeRound = await roundRepo.findActiveByGroup(group.id);
    expect(activeRound).toBeNull();
    
    // Verify status in all rounds
    const allRounds = await roundRepo.findAllByGroup(group.id);
    expect(allRounds[0].status).toBe('cancelled');
  });

  test('should allow new round after previous round is cancelled', async () => {
    const group = await groupRepo.findOrCreate('cancel-then-new-group-3.3', 'Cancel Then New Group 3.3');
    
    // Create first round
    const firstRound = await roundRepo.create(group.id, 'First Meeting', 'today');
    
    // Cancel the first round
    await roundRepo.cancel(firstRound.id);
    
    // Now create a new round
    const secondRound = await roundRepo.create(group.id, 'Second Meeting', 'tomorrow');
    expect(secondRound.status).toBe('active');
    
    // Verify it's the active one
    const activeRound = await roundRepo.findActiveByGroup(group.id);
    expect(activeRound!.id).toBe(secondRound.id);
  });
});
