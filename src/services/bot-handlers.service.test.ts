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

describe('BotHandlers.handleSchedule (Story 4.1)', () => {
  let dbServiceMock: any;
  let handlers: BotHandlers;
  let ctxMock: any;

  beforeEach(() => {
    dbServiceMock = {
      getGroupByTelegramId: mock(() => Promise.resolve({ id: 'group-1' })),
      isMemberOptedIn: mock(() => Promise.resolve(true)),
      getActiveRoundByGroup: mock(() => Promise.resolve(null)),
      createSchedulingRound: mock((groupId, topic, timeframe) =>
        Promise.resolve({ id: 'round-1', groupId, topic, timeframe })),
      getOptedInMembers: mock(() => Promise.resolve([
        { userId: 'user-1' },
        { userId: 'user-2' }
      ])),
    };
    handlers = new BotHandlers(dbServiceMock as any);
    ctxMock = {
      chat: { id: 123, type: 'group' },
      from: { id: 456, first_name: 'TestUser', username: 'testuser' },
      message: { text: '/schedule "Team Meeting"' },
      reply: mock(() => Promise.resolve({})),
      telegram: {
        sendMessage: mock(() => Promise.resolve({})),
      },
    };

    // Mock global setTimeout to avoid waiting during tests
    global.setTimeout = ((fn: any) => { fn(); return {} as any; }) as any;
  });

  test('should successfully start a round and send DMs to all opted-in members', async () => {
    await handlers.handleSchedule(ctxMock);

    // Verify round creation
    expect(dbServiceMock.createSchedulingRound).toHaveBeenCalledWith(
      'group-1',
      'Team Meeting',
      expect.any(String)
    );

    // Verify confirmation message in group
    expect(ctxMock.reply).toHaveBeenCalledWith(
      expect.stringContaining('Scheduling Round Started!'),
      expect.any(Object)
    );

    // Verify DMs sent to members (Story 4.1)
    expect(dbServiceMock.getOptedInMembers).toHaveBeenCalledWith('group-1');
    expect(ctxMock.telegram.sendMessage).toHaveBeenCalledTimes(2);
    expect(ctxMock.telegram.sendMessage).toHaveBeenCalledWith(
      'user-1',
      expect.stringContaining('Team Meeting'),
      expect.any(Object)
    );
    expect(ctxMock.telegram.sendMessage).toHaveBeenCalledWith(
      'user-2',
      expect.stringContaining('Team Meeting'),
      expect.any(Object)
    );
  });

  test('should fail if user is not opted-in', async () => {
    dbServiceMock.isMemberOptedIn.mockReturnValue(Promise.resolve(false));
    await handlers.handleSchedule(ctxMock);
    expect(ctxMock.reply).toHaveBeenCalledWith(expect.stringContaining('you must opt-in first'));
  });

  test('should fail if an active round already exists', async () => {
    dbServiceMock.getActiveRoundByGroup.mockReturnValue(Promise.resolve({ topic: 'Existing' }));
    await handlers.handleSchedule(ctxMock);
    expect(ctxMock.reply).toHaveBeenCalledWith(expect.stringContaining('already an active scheduling round'));
  });

  test('should parse topic and timeframe correctly', () => {
    // Access private method for testing
    const parsed = (handlers as any).parseScheduleCommand('/schedule "Team sync" on next Monday');
    expect(parsed).toEqual({ topic: 'Team sync', timeframe: 'next Monday' });
  });

  test('should parse topic without timeframe', () => {
    const parsed = (handlers as any).parseScheduleCommand('/schedule "Quick sync"');
    expect(parsed).toEqual({ topic: 'Quick sync', timeframe: 'the upcoming days' });
  });

  test('should handle unquoted topic', () => {
    const parsed = (handlers as any).parseScheduleCommand('/schedule standup');
    expect(parsed).toEqual({ topic: 'standup', timeframe: 'the upcoming days' });
  });
});

describe('BotHandlers.handleAvailabilityResponse (Story 4.3)', () => {
  let dbServiceMock: any;
  let handlers: BotHandlers;
  let ctxMock: any;

  beforeEach(() => {
    dbServiceMock = {
      getPendingAvailabilityResponse: mock(() => Promise.resolve(null)),
      confirmAvailabilityResponse: mock(() => Promise.resolve({})),
      updateAvailabilityResponse: mock(() => Promise.resolve({})),
      createAvailabilityResponse: mock(() => Promise.resolve({})),
      getPrisma: mock(() => ({
        member: {
          findMany: mock(() => Promise.resolve([{ groupId: 'group-1' }]))
        }
      })),
      getActiveRoundByGroup: mock(() => Promise.resolve({ id: 'round-1' })),
    };
    handlers = new BotHandlers(dbServiceMock as any);
    ctxMock = {
      chat: { id: 456, type: 'private' },
      from: { id: 456, first_name: 'TestUser', username: 'testuser' },
      message: { text: 'I am free Monday' },
      reply: mock(() => Promise.resolve({})),
    };
  });

  test('should handle new availability response and send confirmation request', async () => {
    await handlers.handleAvailabilityResponse(ctxMock);

    expect(dbServiceMock.createAvailabilityResponse).toHaveBeenCalled();
    expect(ctxMock.reply).toHaveBeenCalledWith(
      expect.stringContaining('Is this correct? Reply **"yes"** to confirm'),
      expect.any(Object)
    );
    expect(ctxMock.reply).toHaveBeenCalledWith(
      expect.stringContaining('Monday'),
      expect.any(Object)
    );
  });

  test('should confirm availability when user says "yes"', async () => {
    dbServiceMock.getPendingAvailabilityResponse.mockReturnValue(Promise.resolve({
      roundId: 'round-1',
      userId: '456'
    }));
    ctxMock.message.text = 'yes';

    await handlers.handleAvailabilityResponse(ctxMock);

    expect(dbServiceMock.confirmAvailabilityResponse).toHaveBeenCalledWith('round-1', '456');
    expect(ctxMock.reply).toHaveBeenCalledWith(
      expect.stringContaining('Availability Confirmed!'),
      expect.any(Object)
    );
  });

  test('should re-parse and ask for confirmation when user provides correction', async () => {
    dbServiceMock.getPendingAvailabilityResponse.mockReturnValue(Promise.resolve({
      roundId: 'round-1',
      userId: '456'
    }));
    ctxMock.message.text = 'No, I meant Tuesday';

    await handlers.handleAvailabilityResponse(ctxMock);

    expect(dbServiceMock.updateAvailabilityResponse).toHaveBeenCalled();
    expect(ctxMock.reply).toHaveBeenCalledWith(
      expect.stringContaining('Tuesday'),
      expect.any(Object)
    );
    expect(ctxMock.reply).toHaveBeenCalledWith(
      expect.stringContaining('Is this correct?'),
      expect.any(Object)
    );
  });
});
