import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { BotHandlers } from './bot-handlers.service';
import { Repositories } from './bot-handlers.service';

// Mock the entire OpenCodeNLUService class
mock.module('./opencode-nlu.service', () => {
  return {
    OpenCodeNLUService: class {
      parseAvailability = mock(() => Promise.resolve({ success: true, parsed: [], isVague: false }));
      close = mock(() => Promise.resolve());
    }
  };
});

describe('BotHandlers.handleCancel (Story 3.3)', () => {
  let reposMock: Repositories;
  let nluServiceMock: any;
  let handlers: BotHandlers;
  let ctxMock: any;

  beforeEach(() => {
    reposMock = {
      groups: {
        findByTelegramId: mock(() => Promise.resolve(null)),
      } as any,
      members: {
        isOptedIn: mock(() => Promise.resolve(false)),
      } as any,
      rounds: {
        findActiveByGroup: mock(() => Promise.resolve(null)),
        cancel: mock(() => Promise.resolve({ id: 'round-1', topic: 'Test Topic', timeframe: 'tomorrow' })),
      } as any,
      responses: {} as any,
      nluQueue: {} as any,
      nudges: {} as any,
    };
    nluServiceMock = {
      parseAvailability: mock(() => Promise.resolve({ success: false, error: 'Mocked failure' })),
    };
    handlers = new BotHandlers(reposMock, nluServiceMock);
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
    reposMock.groups.findByTelegramId = mock(() => Promise.resolve(null));
    await handlers.handleCancel(ctxMock);
    expect(ctxMock.reply).toHaveBeenCalledWith('This group is not registered. Use /start to register it.');
  });

  test('should fail if user is not opted-in', async () => {
    reposMock.groups.findByTelegramId = mock(() => Promise.resolve({ id: 'group-1' }));
    reposMock.members.isOptedIn = mock(() => Promise.resolve(false));
    await handlers.handleCancel(ctxMock);
    expect(ctxMock.reply).toHaveBeenCalledWith(expect.stringContaining('you must opt-in first'));
  });

  test('should fail if no active round exists', async () => {
    reposMock.groups.findByTelegramId = mock(() => Promise.resolve({ id: 'group-1' }));
    reposMock.members.isOptedIn = mock(() => Promise.resolve(true));
    reposMock.rounds.findActiveByGroup = mock(() => Promise.resolve(null));
    await handlers.handleCancel(ctxMock);
    expect(ctxMock.reply).toHaveBeenCalledWith('No active scheduling round to cancel in this group.');
  });

  test('should successfully cancel an active round', async () => {
    const activeRound = { id: 'round-1', topic: 'Meeting Topic', timeframe: 'next week', status: 'active' };
    reposMock.groups.findByTelegramId = mock(() => Promise.resolve({ id: 'group-1' }));
    reposMock.members.isOptedIn = mock(() => Promise.resolve(true));
    reposMock.rounds.findActiveByGroup = mock(() => Promise.resolve(activeRound));

    await handlers.handleCancel(ctxMock);

    expect(reposMock.rounds.cancel).toHaveBeenCalledWith('round-1');
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
  let reposMock: Repositories;
  let nluServiceMock: any;
  let handlers: BotHandlers;
  let ctxMock: any;

  beforeEach(() => {
    reposMock = {
      groups: {
        findByTelegramId: mock(() => Promise.resolve({ id: 'group-1' })),
      } as any,
      members: {
        isOptedIn: mock(() => Promise.resolve(true)),
        findOptedInByGroup: mock(() => Promise.resolve([
          { userId: 'user-1' },
          { userId: 'user-2' }
        ])),
      } as any,
      rounds: {
        findActiveByGroup: mock(() => Promise.resolve(null)),
        create: mock((groupId, topic, timeframe) =>
          Promise.resolve({ id: 'round-1', groupId, topic, timeframe })),
      } as any,
      responses: {} as any,
      nluQueue: {} as any,
      nudges: {} as any,
    };
    nluServiceMock = {
      parseAvailability: mock(() => Promise.resolve({ success: false, error: 'Mocked failure' })),
    };
    handlers = new BotHandlers(reposMock, nluServiceMock);
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
    expect(reposMock.rounds.create).toHaveBeenCalledWith(
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
    expect(reposMock.members.findOptedInByGroup).toHaveBeenCalledWith('group-1');
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
    reposMock.members.isOptedIn = mock(() => Promise.resolve(false));
    await handlers.handleSchedule(ctxMock);
    expect(ctxMock.reply).toHaveBeenCalledWith(expect.stringContaining('you must opt-in first'));
  });

  test('should fail if an active round already exists', async () => {
    reposMock.rounds.findActiveByGroup = mock(() => Promise.resolve({ topic: 'Existing' }));
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
    expect(parsed).toEqual({ topic: 'Quick sync', timeframe: 'TBD' });
  });

  test('should handle unquoted topic', () => {
    const parsed = (handlers as any).parseScheduleCommand('/schedule standup');
    expect(parsed).toEqual({ topic: 'standup', timeframe: 'TBD' });
  });
});

describe('BotHandlers.handleAvailabilityResponse (Story 4.3)', () => {
  let reposMock: Repositories;
  let nluServiceMock: any;
  let handlers: BotHandlers;
  let ctxMock: any;

  beforeEach(() => {
    reposMock = {
      groups: {} as any,
      members: {
        findByUserId: mock(() => Promise.resolve([{ groupId: 'group-1' }])),
      } as any,
      rounds: {
        findActiveByGroup: mock(() => Promise.resolve({ id: 'round-1' })),
      } as any,
      responses: {
        findPendingByUser: mock(() => Promise.resolve(null)),
        confirm: mock(() => Promise.resolve({})),
        update: mock(() => Promise.resolve({})),
        create: mock(() => Promise.resolve({})),
        countVagueResponses: mock(() => Promise.resolve(0)),
        updateStatus: mock(() => Promise.resolve({})),
      } as any,
      nluQueue: {
        queue: mock(() => Promise.resolve({})),
      } as any,
      nudges: {} as any,
    };
    nluServiceMock = {
      parseAvailability: mock(() => Promise.resolve({ success: false, error: 'Mocked failure' })),
    };
    handlers = new BotHandlers(reposMock, nluServiceMock);
    ctxMock = {
      chat: { id: 456, type: 'private' },
      from: { id: 456, first_name: 'TestUser', username: 'testuser' },
      message: { text: 'I am free Monday at 6pm' },
      reply: mock(() => Promise.resolve({})),
    };
  });

  test('should handle new availability response and send confirmation request', async () => {
    await handlers.handleAvailabilityResponse(ctxMock);

    expect(reposMock.responses.create).toHaveBeenCalled();
    expect(ctxMock.reply).toHaveBeenCalledWith(
      expect.stringContaining('Is this correct? Reply **"yes"** to confirm'),
      expect.any(Object)
    );
    expect(ctxMock.reply).toHaveBeenCalledWith(
      expect.stringContaining('Monday'),
      expect.any(Object)
    );
    expect(ctxMock.reply).toHaveBeenCalledWith(
      expect.stringContaining('6pm'),
      expect.any(Object)
    );
  });

  test('should confirm availability when user says "yes"', async () => {
    reposMock.responses.findPendingByUser = mock(() => Promise.resolve({
      roundId: 'round-1',
      userId: '456'
    }));
    ctxMock.message.text = 'yes';

    await handlers.handleAvailabilityResponse(ctxMock);

    expect(reposMock.responses.confirm).toHaveBeenCalledWith('round-1', '456');
    expect(ctxMock.reply).toHaveBeenCalledWith(
      expect.stringContaining('Availability Confirmed!'),
      expect.any(Object)
    );
  });

  test('should re-parse and ask for confirmation when user provides correction', async () => {
    reposMock.responses.findPendingByUser = mock(() => Promise.resolve({
      roundId: 'round-1',
      userId: '456'
    }));
    ctxMock.message.text = 'No, I meant Tuesday';

    await handlers.handleAvailabilityResponse(ctxMock);

    expect(reposMock.responses.update).toHaveBeenCalled();
    expect(ctxMock.reply).toHaveBeenCalledWith(
      expect.stringContaining('Tuesday'),
      expect.any(Object)
    );
    expect(ctxMock.reply).toHaveBeenCalledWith(
      expect.stringContaining('Is this correct?'),
      expect.any(Object)
    );
  });

  test('should queue request and inform user when OpenCode API fails (Story 4.5)', async () => {
    // Mock nluService.parseAvailability to throw an error
    (handlers as any).nluService.parseAvailability = mock(() => Promise.reject(new Error('API Unavailable')));

    await handlers.handleAvailabilityResponse(ctxMock);

    expect(reposMock.nluQueue.queue).toHaveBeenCalledWith(
      'round-1',
      '456',
      'I am free Monday at 6pm',
      'API Unavailable'
    );

    expect(ctxMock.reply).toHaveBeenCalledWith(
      expect.stringContaining('Processing Delayed'),
      expect.any(Object)
    );

    expect(ctxMock.reply).toHaveBeenCalledWith(
      expect.stringContaining('I understood using basic parsing'),
      expect.any(Object)
    );
  });
});
