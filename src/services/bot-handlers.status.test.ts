import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { BotHandlers } from './bot-handlers.service';
import type { Repositories } from './bot-handlers.service';

// Mock the entire OpenCodeNLUService class
mock.module('./opencode-nlu.service', () => {
  return {
    OpenCodeNLUService: class {
      parseAvailability = mock(() => Promise.resolve({ success: true, parsed: [], isVague: false }));
      close = mock(() => Promise.resolve());
    }
  };
});

describe('BotHandlers.handleStatus (Story 7.1)', () => {
  let reposMock: Repositories;
  let consensusServiceMock: any;
  let handlers: BotHandlers;
  let ctxMock: any;

  beforeEach(() => {
    reposMock = {
      groups: {
        findByTelegramId: mock(() => Promise.resolve({ id: 'group-1', name: 'Test Group' })),
        getConsensusThreshold: mock(() => Promise.resolve(75))
      } as any,
      members: {
        findOptedInByGroup: mock(() => Promise.resolve([
          { userId: 'user-1' }, { userId: 'user-2' }, { userId: 'user-3' }, { userId: 'user-4' }
        ]))
      } as any,
      rounds: {
        getActiveStatus: mock(() => Promise.resolve({ hasActiveRound: true, round: { id: 'round-1', topic: 'Test Topic', createdAt: new Date() } }))
      } as any,
      responses: {
        findConfirmedByRound: mock(() => Promise.resolve([{ userId: 'user-1' }, { userId: 'user-2' }]))
      } as any,
      nluQueue: {} as any,
      nudges: {} as any,
      reminders: {} as any,
      consensus: {} as any
    };

    consensusServiceMock = {
      calculateConsensus: mock(() => Promise.resolve({
        hasConsensus: false,
        percentage: 50,
        respondedMembers: 2,
        totalOptedInMembers: 4,
        timeSlot: { agreementPercentage: 50, day: 'Monday' }
      }))
    };

    handlers = new BotHandlers(reposMock);
    (handlers as any).consensusService = consensusServiceMock;

    ctxMock = {
      chat: { id: 123, type: 'group' },
      from: { id: 456 },
      reply: mock(() => Promise.resolve({}))
    };
  });

  test('should fail if in private chat', async () => {
    ctxMock.chat.type = 'private';
    await handlers.handleStatus(ctxMock);
    expect(ctxMock.reply).toHaveBeenCalledWith('This command only works in group chats.');
  });

  test('should return error if group not registered', async () => {
    reposMock.groups.findByTelegramId = mock(() => Promise.resolve(null));
    await handlers.handleStatus(ctxMock);
    expect(ctxMock.reply).toHaveBeenCalledWith('This group is not registered. Use /start to register it.');
  });

  test('should return message if no active round', async () => {
    reposMock.rounds.getActiveStatus = mock(() => Promise.resolve({ hasActiveRound: false, round: null }));
    await handlers.handleStatus(ctxMock);
    expect(ctxMock.reply).toHaveBeenCalledWith('No active scheduling round in this group.');
  });

  test('should display participation and consensus state when active round exists', async () => {
    await handlers.handleStatus(ctxMock);

    expect(ctxMock.reply).toHaveBeenCalledWith(
      expect.stringContaining('Scheduling Round Status'),
      expect.any(Object)
    );
    expect(ctxMock.reply).toHaveBeenCalledWith(
      expect.stringContaining('2 of 4 members responded'),
      expect.any(Object)
    );
    expect(ctxMock.reply).toHaveBeenCalledWith(
      expect.stringContaining('Pending:'),
      expect.any(Object)
    );
    expect(ctxMock.reply).toHaveBeenCalledWith(
      expect.stringContaining('Current best: 50%'),
      expect.any(Object)
    );
    expect(ctxMock.reply).toHaveBeenCalledWith(
      expect.stringContaining('Waiting for more responses to reach 75%'),
      expect.any(Object)
    );
  });
  test('should display success message when consensus achieved', async () => {
    const consensusServiceMockLocal = {
      calculateConsensus: mock(() => Promise.resolve({
        hasConsensus: true,
        percentage: 75,
        timeSlot: {
          day: 'Tuesday',
          startTime: new Date('2024-01-01T10:00:00Z'),
          endTime: new Date('2024-01-01T11:00:00Z'),
          agreementPercentage: 75
        },
        respondedMembers: 3,
        totalOptedInMembers: 4
      }))
    };
    (handlers as any).consensusService = consensusServiceMockLocal;

    await handlers.handleStatus(ctxMock);

    expect(ctxMock.reply).toHaveBeenCalledWith(
      expect.stringContaining('CONSENSUS ACHIEVED!'),
      expect.any(Object)
    );
    expect(ctxMock.reply).toHaveBeenCalledWith(
      expect.stringContaining('Tuesday'),
      expect.any(Object)
    );
    expect(ctxMock.reply).toHaveBeenCalledWith(
      expect.stringContaining('10:00 AM'),
      expect.any(Object)
    );
  });
});
