
import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { PrismaClient } from '@prisma/client';
import { ConsensusService } from './consensus.service';
import { RoundRepository } from '../db/round-repository';
import { MemberRepository } from '../db/member-repository';
import { ResponseRepository } from '../db/response-repository';
import { GroupRepository } from '../db/group-repository';
import { ConsensusRepository } from '../db/consensus-repository';

const prisma = new PrismaClient();
const roundRepo = new RoundRepository();
const memberRepo = new MemberRepository();
const responseRepo = new ResponseRepository();
const groupRepo = new GroupRepository();
const consensusRepo = new ConsensusRepository();

const consensusService = new ConsensusService({
  rounds: roundRepo,
  responses: responseRepo,
  members: memberRepo,
  consensus: consensusRepo
});

describe('ConsensusService (Story 6.1 & 6.2)', () => {
  beforeEach(async () => {
    await prisma.availabilityResponse.deleteMany();
    await prisma.nudgeTracking.deleteMany();
    await prisma.nudgeHistory.deleteMany();
    await prisma.pendingNLURequest.deleteMany();
    await prisma.schedulingRound.deleteMany();
    await prisma.member.deleteMany();
    await prisma.group.deleteMany();
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  test('should calculate consensus when threshold is met', async () => {
    // Create group with 4 opted-in members (75% threshold = 3 members needed)
    const group = await groupRepo.findOrCreate('consensus-test-group', 'Consensus Test Group');
    const round = await roundRepo.create(group.id, 'Team Meeting', 'next week');

    await memberRepo.optIn('user-1', group.id);
    await memberRepo.optIn('user-2', group.id);
    await memberRepo.optIn('user-3', group.id);
    await memberRepo.optIn('user-4', group.id);

    // 3 users confirm availability for Tuesday
    await responseRepo.create(round.id, 'user-1', 'Tuesday morning', { days: ['Tuesday'], times: ['9am'], parsed: true });
    await responseRepo.create(round.id, 'user-2', 'Tuesday afternoon', { days: ['Tuesday'], times: ['2pm'], parsed: true });
    await responseRepo.create(round.id, 'user-3', 'Tuesday', { days: ['Tuesday'], times: [], parsed: true });

    // Confirm all responses
    await responseRepo.confirm(round.id, 'user-1');
    await responseRepo.confirm(round.id, 'user-2');
    await responseRepo.confirm(round.id, 'user-3');

    const consensus = await consensusService.calculateConsensus(round.id);

    expect(consensus.hasConsensus).toBe(true);
    expect(consensus.totalOptedInMembers).toBe(4);
    expect(consensus.respondedMembers).toBe(3);
    expect(consensus.timeSlot).toBeDefined();
    expect(consensus.timeSlot!.agreementPercentage).toBe(75); // 3/4 = 75%
  });

  test('should not calculate consensus when below threshold', async () => {
    const group = await groupRepo.findOrCreate('no-consensus-group', 'No Consensus Group');
    const round = await roundRepo.create(group.id, 'Team Meeting', 'next week');

    await memberRepo.optIn('user-1', group.id);
    await memberRepo.optIn('user-2', group.id);
    await memberRepo.optIn('user-3', group.id);
    await memberRepo.optIn('user-4', group.id);

    // Only 2 users confirm (50% < 75% threshold)
    await responseRepo.create(round.id, 'user-1', 'Tuesday', { days: ['Tuesday'], times: [], parsed: true });
    await responseRepo.create(round.id, 'user-2', 'Tuesday', { days: ['Tuesday'], times: [], parsed: true });

    await responseRepo.confirm(round.id, 'user-1');
    await responseRepo.confirm(round.id, 'user-2');

    const consensus = await consensusService.calculateConsensus(round.id);

    expect(consensus.hasConsensus).toBe(false);
    expect(consensus.timeSlot).toBeUndefined();
  });

  test('should confirm meeting with time slot details', async () => {
    const group = await groupRepo.findOrCreate('confirm-test-group', 'Confirm Test Group');
    const round = await roundRepo.create(group.id, 'Team Meeting', 'next week');

    await memberRepo.optIn('user-1', group.id);
    await memberRepo.optIn('user-2', group.id);
    await memberRepo.optIn('user-3', group.id);

    await responseRepo.create(round.id, 'user-1', 'Tuesday 9am', { days: ['Tuesday'], times: ['9am'], parsed: true });
    await responseRepo.create(round.id, 'user-2', 'Tuesday 10am', { days: ['Tuesday'], times: ['10am'], parsed: true });
    await responseRepo.create(round.id, 'user-3', 'Tuesday morning', { days: ['Tuesday'], times: ['morning'], parsed: true });

    await responseRepo.confirm(round.id, 'user-1');
    await responseRepo.confirm(round.id, 'user-2');
    await responseRepo.confirm(round.id, 'user-3');

    const consensus = await consensusService.calculateConsensus(round.id);
    expect(consensus.hasConsensus).toBe(true);

    // Confirm the meeting
    const confirmed = await consensusService.confirmMeeting(round.id, consensus.timeSlot!);
    expect(confirmed).toBe(true);

    // Verify round is marked as confirmed
    const updatedRound = await roundRepo.findById(round.id);
    expect(updatedRound!.status).toBe('confirmed');
    expect(updatedRound!.confirmedAt).toBeDefined();
    expect(updatedRound!.confirmedTimeSlot).toBeDefined();
  });

  test('should reject meeting confirmation less than 30 minutes away (FR24)', async () => {
    const group = await groupRepo.findOrCreate('fr24-test-group', 'FR24 Test Group');
    const round = await roundRepo.create(group.id, 'Team Meeting', 'next week');

    await memberRepo.optIn('user-1', group.id);

    await responseRepo.create(round.id, 'user-1', 'Today now', { days: ['Today'], times: ['now'], parsed: true });
    await responseRepo.confirm(round.id, 'user-1');

    const consensus = await consensusService.calculateConsensus(round.id);
    expect(consensus.hasConsensus).toBe(true);

    // Set time slot to 15 minutes from now (should be rejected)
    const soonSlot = {
      ...consensus.timeSlot!,
      startTime: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes from now
    };

    const confirmed = await consensusService.confirmMeeting(round.id, soonSlot);
    expect(confirmed).toBe(false); // Should reject meetings < 30 min away
  });

  test('should handle incremental consensus calculation (NFR4)', async () => {
    const group = await groupRepo.findOrCreate('incremental-group', 'Incremental Group');
    const round = await roundRepo.create(group.id, 'Team Meeting', 'next week');

    // 4 members, need 3 for 75%
    await memberRepo.optIn('user-1', group.id);
    await memberRepo.optIn('user-2', group.id);
    await memberRepo.optIn('user-3', group.id);
    await memberRepo.optIn('user-4', group.id);

    // Initially no consensus (0 responses)
    let consensus = await consensusService.calculateConsensus(round.id);
    expect(consensus.hasConsensus).toBe(false);

    // After 1st response (25%) - no consensus
    await responseRepo.create(round.id, 'user-1', 'Tuesday', { days: ['Tuesday'], times: [], parsed: true });
    await responseRepo.confirm(round.id, 'user-1');
    consensus = await consensusService.calculateConsensus(round.id);
    expect(consensus.hasConsensus).toBe(false);

    // After 2nd response (50%) - no consensus
    await responseRepo.create(round.id, 'user-2', 'Tuesday', { days: ['Tuesday'], times: [], parsed: true });
    await responseRepo.confirm(round.id, 'user-2');
    consensus = await consensusService.calculateConsensus(round.id);
    expect(consensus.hasConsensus).toBe(false);

    // After 3rd response (75%) - consensus reached!
    await responseRepo.create(round.id, 'user-3', 'Tuesday', { days: ['Tuesday'], times: [], parsed: true });
    await responseRepo.confirm(round.id, 'user-3');
    consensus = await consensusService.calculateConsensus(round.id);
    expect(consensus.hasConsensus).toBe(true);
    expect(consensus.respondedMembers).toBe(3);
    expect(consensus.totalOptedInMembers).toBe(4);

  });
});
