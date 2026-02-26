import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { PrismaClient } from '@prisma/client';
import { RetryLoopService } from './retry-loop.service';
import { RoundRepository } from '../../db/round-repository';
import { MemberRepository } from '../../db/member-repository';
import { ResponseRepository } from '../../db/response-repository';
import { NudgeRepository } from '../../db/nudge-repository';
import { GroupRepository } from '../../db/group-repository';
import { ConsensusRepository } from '../../db/consensus-repository';

const prisma = new PrismaClient();

// Mock bot
const mockBot = {
  telegram: {
    sendMessage: async (chatId: string | number, message: string, options?: any) => {
      console.log(`[MockBot] Sending to ${chatId}: ${message.substring(0, 50)}...`);
      return { message_id: 123 };
    }
  }
};

describe('RetryLoopService (Story 6.4)', () => {
  let retryService: RetryLoopService;
  let roundRepo: RoundRepository;
  let memberRepo: MemberRepository;
  let responseRepo: ResponseRepository;
  let nudgeRepo: NudgeRepository;
  let groupRepo: GroupRepository;
  let consensusRepo: ConsensusRepository;

  beforeEach(async () => {
    await prisma.availabilityResponse.deleteMany();
    await prisma.nudgeTracking.deleteMany();
    await prisma.nudgeHistory.deleteMany();
    await prisma.pendingNLURequest.deleteMany();
    await prisma.consensusResult.deleteMany();
    await prisma.schedulingRound.deleteMany();
    await prisma.member.deleteMany();
    await prisma.group.deleteMany();

    roundRepo = new RoundRepository();
    memberRepo = new MemberRepository();
    responseRepo = new ResponseRepository();
    nudgeRepo = new NudgeRepository();
    groupRepo = new GroupRepository();
    consensusRepo = new ConsensusRepository();

    retryService = new RetryLoopService({
      rounds: roundRepo,
      members: memberRepo,
      responses: responseRepo,
      nudges: nudgeRepo,
      consensus: consensusRepo
    });
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  test('should trigger retry loop when no consensus and all responded', async () => {
    const group = await groupRepo.findOrCreate('retry-test-group', 'Retry Test Group');
    const round = await roundRepo.create(group.id, 'Team Meeting', 'next week');
    
    // 4 members, need 3 for 75% consensus
    await memberRepo.optIn('user-1', group.id);
    await memberRepo.optIn('user-2', group.id);
    await memberRepo.optIn('user-3', group.id);
    await memberRepo.optIn('user-4', group.id);
    
    // All respond but with conflicting times (no consensus)
    await responseRepo.create(round.id, 'user-1', 'Monday', { days: ['Monday'], times: [], parsed: true });
    await responseRepo.create(round.id, 'user-2', 'Tuesday', { days: ['Tuesday'], times: [], parsed: true });
    await responseRepo.create(round.id, 'user-3', 'Wednesday', { days: ['Wednesday'], times: [], parsed: true });
    await responseRepo.create(round.id, 'user-4', 'Thursday', { days: ['Thursday'], times: [], parsed: true });
    
    await responseRepo.confirm(round.id, 'user-1');
    await responseRepo.confirm(round.id, 'user-2');
    await responseRepo.confirm(round.id, 'user-3');
    await responseRepo.confirm(round.id, 'user-4');
    
    const result = await retryService.handleNoConsensus(round.id, mockBot);
    
    expect(result.handled).toBe(true);
    expect(result.action).toBe('retried');
    expect(result.message).toContain('Retry 1');
  });

  test('should not trigger retry if not all members responded', async () => {
    const group = await groupRepo.findOrCreate('not-all-group', 'Not All Group');
    const round = await roundRepo.create(group.id, 'Team Meeting', 'next week');
    
    await memberRepo.optIn('user-1', group.id);
    await memberRepo.optIn('user-2', group.id);
    await memberRepo.optIn('user-3', group.id);
    
    // Only 2 of 3 respond
    await responseRepo.create(round.id, 'user-1', 'Monday', { days: ['Monday'], times: [], parsed: true });
    await responseRepo.create(round.id, 'user-2', 'Tuesday', { days: ['Tuesday'], times: [], parsed: true });
    
    await responseRepo.confirm(round.id, 'user-1');
    await responseRepo.confirm(round.id, 'user-2');
    
    const result = await retryService.handleNoConsensus(round.id, mockBot);
    
    expect(result.handled).toBe(false);
    expect(result.action).toBe('not_all_responded');
  });

  test('should mark as no consensus after max retries', async () => {
    const group = await groupRepo.findOrCreate('max-retry-group', 'Max Retry Group');
    const round = await roundRepo.create(group.id, 'Team Meeting', 'next week');
    
    // Set max retries to 2
    await prisma.schedulingRound.update({
      where: { id: round.id },
      data: { retryCount: 2, maxRetries: 2 }
    });
    
    await memberRepo.optIn('user-1', group.id);
    await memberRepo.optIn('user-2', group.id);
    
    await responseRepo.create(round.id, 'user-1', 'Monday', { days: ['Monday'], times: [], parsed: true });
    await responseRepo.create(round.id, 'user-2', 'Tuesday', { days: ['Tuesday'], times: [], parsed: true });
    
    await responseRepo.confirm(round.id, 'user-1');
    await responseRepo.confirm(round.id, 'user-2');
    
    const result = await retryService.handleNoConsensus(round.id, mockBot);
    
    expect(result.handled).toBe(true);
    expect(result.action).toBe('max_retries_reached');
    
    // Verify round is marked as no_consensus
    const updatedRound = await roundRepo.findById(round.id);
    expect(updatedRound!.status).toBe('no_consensus');
  });

  test('should increment retry count on retry', async () => {
    const group = await groupRepo.findOrCreate('increment-group', 'Increment Group');
    const round = await roundRepo.create(group.id, 'Team Meeting', 'next week');
    
    await memberRepo.optIn('user-1', group.id);
    await memberRepo.optIn('user-2', group.id);
    
    await responseRepo.create(round.id, 'user-1', 'Monday', { days: ['Monday'], times: [], parsed: true });
    await responseRepo.create(round.id, 'user-2', 'Tuesday', { days: ['Tuesday'], times: [], parsed: true });
    
    await responseRepo.confirm(round.id, 'user-1');
    await responseRepo.confirm(round.id, 'user-2');
    
    // First retry
    await retryService.handleNoConsensus(round.id, mockBot);
    
    let updatedRound = await roundRepo.findById(round.id);
    expect(updatedRound!.retryCount).toBe(1);
    
    // Reset responses for second retry attempt
    await prisma.availabilityResponse.deleteMany({ where: { roundId: round.id } });
    
    await responseRepo.create(round.id, 'user-1', 'Wednesday', { days: ['Wednesday'], times: [], parsed: true });
    await responseRepo.create(round.id, 'user-2', 'Thursday', { days: ['Thursday'], times: [], parsed: true });
    
    await responseRepo.confirm(round.id, 'user-1');
    await responseRepo.confirm(round.id, 'user-2');
    
    // Second retry
    await retryService.handleNoConsensus(round.id, mockBot);
    
    updatedRound = await roundRepo.findById(round.id);
    expect(updatedRound!.retryCount).toBe(2);
  });

  test('should get retry statistics', async () => {
    const group = await groupRepo.findOrCreate('stats-group', 'Stats Group');
    const round = await roundRepo.create(group.id, 'Team Meeting', 'next week');
    
    await prisma.schedulingRound.update({
      where: { id: round.id },
      data: { retryCount: 1, maxRetries: 3 }
    });
    
    const stats = await retryService.getRetryStats(round.id);
    
    expect(stats.retryCount).toBe(1);
    expect(stats.maxRetries).toBe(3);
    expect(stats.canRetry).toBe(true);
  });
});
