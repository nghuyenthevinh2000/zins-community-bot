import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { NLURetryService } from './nlu-retry.service';
import { OpenCodeNLUService } from './opencode-nlu.service';

// Mock the entire OpenCodeNLUService class
mock.module('./opencode-nlu.service', () => {
  return {
    OpenCodeNLUService: class {
      parseAvailability = mock(() => Promise.resolve({ success: true, parsed: [], isVague: false }));
      close = mock(() => Promise.resolve());
    }
  };
});

describe('NLURetryService (Story 4.5)', () => {
  let dbServiceMock: any;
  let telegramMock: any;
  let retryService: NLURetryService;

  beforeEach(() => {
    dbServiceMock = {
      nluQueue: {
        findPendingForRetry: mock(() => Promise.resolve([])),
        markCompleted: mock(() => Promise.resolve({})),
        markFailed: mock(() => Promise.resolve({})),
        updateRetry: mock(() => Promise.resolve({})),
      } as any,
      responses: {
        findByRoundAndUser: mock(() => Promise.resolve({})),
        update: mock(() => Promise.resolve({})),
      } as any
    };

    telegramMock = {
      sendMessage: mock(() => Promise.resolve({})),
    };

    retryService = new NLURetryService(dbServiceMock as any, telegramMock as any);
  });

  test('should process pending requests and notify user on success', async () => {
    const pendingRequests = [
      {
        id: 'req-1',
        roundId: 'round-1',
        userId: 'user-1',
        rawResponse: 'I am free Tuesday',
        retryCount: 0
      }
    ];

    dbServiceMock.nluQueue.findPendingForRetry.mockReturnValue(Promise.resolve(pendingRequests));
    dbServiceMock.responses.findByRoundAndUser.mockReturnValue(Promise.resolve({}));

    // Mock nluService.parseAvailability
    const nluResult = {
      success: true,
      parsed: [{ startTime: new Date(), endTime: new Date(), explanation: 'Tuesday' }],
      isVague: false
    };
    (retryService as any).nluService.parseAvailability = mock(() => Promise.resolve(nluResult));

    await (retryService as any).processPendingRequests();

    expect(dbServiceMock.responses.update).toHaveBeenCalled();
    expect(dbServiceMock.nluQueue.markCompleted).toHaveBeenCalledWith('req-1');
    expect(telegramMock.sendMessage).toHaveBeenCalledWith(
      'user-1',
      expect.stringContaining('Your availability has been processed'),
      expect.any(Object)
    );
  });

  test('should schedule retry on API failure', async () => {
    const pendingRequests = [
      {
        id: 'req-2',
        roundId: 'round-1',
        userId: 'user-2',
        rawResponse: 'I am free Wednesday',
        retryCount: 0
      }
    ];

    dbServiceMock.nluQueue.findPendingForRetry.mockReturnValue(Promise.resolve(pendingRequests));

    // Mock nluService.parseAvailability to throw
    (retryService as any).nluService.parseAvailability = mock(() => Promise.reject(new Error('API Down')));

    await (retryService as any).processPendingRequests();

    expect(dbServiceMock.nluQueue.updateRetry).toHaveBeenCalledWith('req-2', 1, 'API Down');
    expect(dbServiceMock.nluQueue.markCompleted).not.toHaveBeenCalled();
    expect(telegramMock.sendMessage).not.toHaveBeenCalled();
  });

  test('should mark as failed after max retries', async () => {
    const pendingRequests = [
      {
        id: 'req-3',
        roundId: 'round-1',
        userId: 'user-3',
        rawResponse: 'I am free Thursday',
        retryCount: 4 // Next will be 5
      }
    ];

    dbServiceMock.nluQueue.findPendingForRetry.mockReturnValue(Promise.resolve(pendingRequests));

    // Mock nluService.parseAvailability to return failure
    (retryService as any).nluService.parseAvailability = mock(() => Promise.resolve({ success: false, error: 'Still failing' }));

    await (retryService as any).processPendingRequests();

    expect(dbServiceMock.nluQueue.markFailed).toHaveBeenCalledWith('req-3', 'Still failing');
    expect(dbServiceMock.nluQueue.updateRetry).not.toHaveBeenCalled();
  });
});
