import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { NudgeService } from './nudge.service';

describe('NudgeService (Story 5.1)', () => {
  let dbServiceMock: any;
  let telegramMock: any;
  let nudgeService: NudgeService;

  beforeEach(() => {
    dbServiceMock = {
      getPrisma: mock(() => ({
        schedulingRound: {
          findMany: mock(() => Promise.resolve([
            { id: 'round-1', groupId: 'group-1', topic: 'Team Lunch', status: 'active' }
          ]))
        }
      })),
      getNonRespondersForRound: mock(() => Promise.resolve([
        { userId: 'user-1' },
        { userId: 'user-2' }
      ])),
      getOrCreateNudgeTracking: mock((roundId, userId) => Promise.resolve({
        roundId,
        userId,
        nudgeCount: 0,
        lastNudgeAt: null
      })),
      incrementNudgeCount: mock(() => Promise.resolve({}))
    };

    telegramMock = {
      sendMessage: mock(() => Promise.resolve({}))
    };

    // Fast check interval for testing
    nudgeService = new NudgeService(dbServiceMock as any, telegramMock as any, {
      nudgeIntervalHours: 0 // Nudge immediately for testing
    });
    
    // Mock global setTimeout to avoid waiting during tests
    global.setTimeout = ((fn: any) => { fn(); return {} as any; }) as any;
  });

  test('should detect non-responders and send nudges with topic', async () => {
    await (nudgeService as any).checkAndNudgeNonResponders();

    // Should find non-responders for round-1
    expect(dbServiceMock.getNonRespondersForRound).toHaveBeenCalledWith('round-1', 'group-1');
    
    // Should send nudges to both non-responders
    expect(telegramMock.sendMessage).toHaveBeenCalledTimes(2);
    
    // Should include the topic in the message
    expect(telegramMock.sendMessage).toHaveBeenCalledWith(
      'user-1',
      expect.stringContaining('Team Lunch'),
      expect.any(Object)
    );
    expect(telegramMock.sendMessage).toHaveBeenCalledWith(
      'user-2',
      expect.stringContaining('Team Lunch'),
      expect.any(Object)
    );
    
    // Should update nudge tracking
    expect(dbServiceMock.incrementNudgeCount).toHaveBeenCalledTimes(2);
    expect(dbServiceMock.incrementNudgeCount).toHaveBeenCalledWith('round-1', 'user-1');
    expect(dbServiceMock.incrementNudgeCount).toHaveBeenCalledWith('round-1', 'user-2');
  });

  test('should respect max nudge count', async () => {
    dbServiceMock.getOrCreateNudgeTracking.mockReturnValue(Promise.resolve({
      roundId: 'round-1',
      userId: 'user-1',
      nudgeCount: 3, // Max count reached
      lastNudgeAt: new Date(Date.now() - 48 * 60 * 60 * 1000) // 2 days ago
    }));

    await (nudgeService as any).checkAndNudgeNonResponders();

    // Should NOT send nudge if max reached
    expect(telegramMock.sendMessage).not.toHaveBeenCalled();
    expect(dbServiceMock.incrementNudgeCount).not.toHaveBeenCalled();
  });

  test('should respect nudge interval', async () => {
    // Set interval to 24 hours
    (nudgeService as any).config.nudgeIntervalHours = 24;
    
    dbServiceMock.getOrCreateNudgeTracking.mockReturnValue(Promise.resolve({
      roundId: 'round-1',
      userId: 'user-1',
      nudgeCount: 1,
      lastNudgeAt: new Date(Date.now() - 12 * 60 * 60 * 1000) // Only 12 hours ago
    }));

    await (nudgeService as any).checkAndNudgeNonResponders();

    // Should NOT send nudge if interval hasn't passed
    expect(telegramMock.sendMessage).not.toHaveBeenCalled();
  });
});
