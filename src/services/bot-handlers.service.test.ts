import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { BotHandlers } from './bot-handlers.service';
import { DatabaseService } from './database.service';

describe('BotHandlers.handleCancel (Story 3.3)', () => {
  let dbServiceMock: any;
  let handlers: BotHandlers;
  let ctxMock: any;

  beforeEach(() => {
    dbServiceMock = {
      getGroupByTelegramId: mock(() => Promise.resolve(null)),
      isMemberOptedIn: mock(() => Promise.resolve(false)),
      getActiveRoundByGroup: mock(() => Promise.resolve(null)),
      cancelRound: mock(() => Promise.resolve({ id: 'round-1', topic: 'Test Topic', timeframe: 'tomorrow' })),
    };
    handlers = new BotHandlers(dbServiceMock as any);
    ctxMock = {
      chat: { id: 123, type: 'group' },
      from: { id: 456, first_name: 'TestUser', username: 'testuser' },
      reply: mock(() => Promise.resolve({})),
    };
  });

  test('should fail if not in group chat', async () => {
    ctxMock.chat.type = 'private';
    await handlers.handleCancel(ctxMock);
    expect(ctxMock.reply).toHaveBeenCalledWith('This command only works in group chats.');
  });

  test('should fail if group is not registered', async () => {
    dbServiceMock.getGroupByTelegramId.mockReturnValue(Promise.resolve(null));
    await handlers.handleCancel(ctxMock);
    expect(ctxMock.reply).toHaveBeenCalledWith('This group is not registered. Use /start to register it.');
  });

  test('should fail if user is not opted-in', async () => {
    dbServiceMock.getGroupByTelegramId.mockReturnValue(Promise.resolve({ id: 'group-1' }));
    dbServiceMock.isMemberOptedIn.mockReturnValue(Promise.resolve(false));
    await handlers.handleCancel(ctxMock);
    expect(ctxMock.reply).toHaveBeenCalledWith(expect.stringContaining('you must opt-in first'));
  });

  test('should fail if no active round exists', async () => {
    dbServiceMock.getGroupByTelegramId.mockReturnValue(Promise.resolve({ id: 'group-1' }));
    dbServiceMock.isMemberOptedIn.mockReturnValue(Promise.resolve(true));
    dbServiceMock.getActiveRoundByGroup.mockReturnValue(Promise.resolve(null));
    await handlers.handleCancel(ctxMock);
    expect(ctxMock.reply).toHaveBeenCalledWith('No active scheduling round to cancel in this group.');
  });

  test('should successfully cancel an active round', async () => {
    const activeRound = { id: 'round-1', topic: 'Meeting Topic', timeframe: 'next week' };
    dbServiceMock.getGroupByTelegramId.mockReturnValue(Promise.resolve({ id: 'group-1' }));
    dbServiceMock.isMemberOptedIn.mockReturnValue(Promise.resolve(true));
    dbServiceMock.getActiveRoundByGroup.mockReturnValue(Promise.resolve(activeRound));
    
    await handlers.handleCancel(ctxMock);
    
    expect(dbServiceMock.cancelRound).toHaveBeenCalledWith('round-1');
    expect(ctxMock.reply).toHaveBeenCalledWith(
      expect.stringContaining('Scheduling Round Cancelled'),
      expect.objectContaining({ parse_mode: 'Markdown' })
    );
    expect(ctxMock.reply).toHaveBeenCalledWith(
      expect.stringContaining('Meeting Topic'),
      expect.any(Object)
    );
  });
});
