import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { PrismaClient } from '@prisma/client';
import { DatabaseService } from './database.service';

const prisma = new PrismaClient();
const db = new DatabaseService(prisma);

describe('OpenCode API Failure Recovery (Story 4.5) - Database Operations', () => {
  let group: any;
  let round: any;

  beforeEach(async () => {
    await prisma.pendingNLURequest.deleteMany();
    await prisma.availabilityResponse.deleteMany();
    await prisma.schedulingRound.deleteMany();
    await prisma.member.deleteMany();
    await prisma.group.deleteMany();

    group = await db.findOrCreateGroup('retry-group', 'Retry Group');
    round = await db.createSchedulingRound(group.id, 'Retry Meeting', 'tomorrow');
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  test('should queue a new pending NLU request', async () => {
    const userId = 'user-retry-1';
    const rawResponse = 'Free Monday';
    const error = 'API Timeout';

    const request = await db.queuePendingNLURequest(round.id, userId, rawResponse, error);

    expect(request).toBeDefined();
    expect(request.userId).toBe(userId);
    expect(request.roundId).toBe(round.id);
    expect(request.rawResponse).toBe(rawResponse);
    expect(request.lastError).toBe(error);
    expect(request.retryCount).toBe(0);
    expect(request.status).toBe('pending');
    expect(request.nextRetryAt.getTime()).toBeGreaterThan(Date.now());
  });

  test('should increment retry count and update nextRetryAt on retry', async () => {
    const userId = 'user-retry-2';
    const rawResponse = 'Free Tuesday';
    
    // Initial queue
    const initialRequest = await db.queuePendingNLURequest(round.id, userId, rawResponse);
    const initialId = initialRequest.id;

    // First retry (retryCount = 1)
    const updatedRequest = await db.updateNLURequestRetry(initialId, 1, 'Still down');
    
    expect(updatedRequest.id).toBe(initialId);
    expect(updatedRequest.retryCount).toBe(1);
    expect(updatedRequest.lastError).toBe('Still down');
    // Exponential backoff for retryCount 1: 2^1 * 60 * 1000 = 2 minutes
    const expectedDelay = 2 * 60 * 1000;
    const now = Date.now();
    expect(updatedRequest.nextRetryAt.getTime()).toBeGreaterThanOrEqual(now + expectedDelay - 5000); // 5s tolerance
  });

  test('should mark request as completed', async () => {
    const userId = 'user-retry-3';
    const request = await db.queuePendingNLURequest(round.id, userId, 'Free Wednesday');
    
    const completed = await db.markNLURequestCompleted(request.id);
    expect(completed.status).toBe('completed');
  });

  test('should mark request as failed after max retries', async () => {
    const userId = 'user-retry-4';
    const request = await db.queuePendingNLURequest(round.id, userId, 'Free Thursday');
    
    const failed = await db.updateNLURequestRetry(request.id, 5, 'Max retries reached');
    expect(failed.status).toBe('failed');
    expect(failed.retryCount).toBe(5);
  });

  test('should retrieve pending requests for retry', async () => {
    const userId = 'user-retry-5';
    // Create a request that is ready for retry (nextRetryAt in the past)
    const request = await prisma.pendingNLURequest.create({
      data: {
        roundId: round.id,
        userId,
        rawResponse: 'Free Friday',
        nextRetryAt: new Date(Date.now() - 1000), // 1 second ago
        status: 'pending',
        retryCount: 0
      }
    });

    const pending = await db.getPendingNLURequestsForRetry();
    expect(pending.some(p => p.id === request.id)).toBe(true);
  });
});
