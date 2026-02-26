import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { SchedulingService } from './scheduling.service';
import type { SchedulingRepositories } from './scheduling.service';

// Mock the OpenCodeNLUService class
mock.module('../nlu/opencode-nlu.service', () => {
  return {
    OpenCodeNLUService: class {
      parseAvailability = mock(() => Promise.resolve({ success: true, parsed: [], isVague: false }));
      close = mock(() => Promise.resolve());
    }
  };
});

describe('SchedulingService.handleCancel (Story 3.3)', () => {
  let reposMock: SchedulingRepositories;
  let nluServiceMock: any;
  let service: SchedulingService;
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
      consensus: {} as any,
      reminders: {} as any,
    };
    nluServiceMock = {
      parseAvailability: mock(() => Promise.resolve({ success: false, error: 'Mocked failure' })),
    };
    service = new SchedulingService(reposMock, nluServiceMock);
    ctxMock = {
      chat: { id: 123, type: 'group' },
      from: { id: 456, first_name: 'TestUser', username: 'testuser' },
      reply: mock(() => Promise.resolve({})),
    };
  });

  test('should fail if not in group chat', async () => {
    ctxMock.chat.type = 'private';
    await service.handleCancel(ctxMock);
    expect(ctxMock.reply).toHaveBeenCalledWith('This command only works in group chats.');
  });

  test('should fail if group is not registered', async () => {
    reposMock.groups.findByTelegramId = mock(() => Promise.resolve(null));
    await service.handleCancel(ctxMock);
    expect(ctxMock.reply).toHaveBeenCalledWith('This group is not registered. Use /start to register it.');
  });

  test('should fail if user is not opted-in', async () => {
    reposMock.groups.findByTelegramId = mock(() => Promise.resolve({ id: 'group-1' }));
    reposMock.members.isOptedIn = mock(() => Promise.resolve(false));
    await service.handleCancel(ctxMock);
    expect(ctxMock.reply).toHaveBeenCalledWith(expect.stringContaining('you must opt-in first'));
  });

  test('should fail if no active round exists', async () => {
    reposMock.groups.findByTelegramId = mock(() => Promise.resolve({ id: 'group-1' }));
    reposMock.members.isOptedIn = mock(() => Promise.resolve(true));
    reposMock.rounds.findActiveByGroup = mock(() => Promise.resolve(null));
    await service.handleCancel(ctxMock);
    expect(ctxMock.reply).toHaveBeenCalledWith('No active scheduling round to cancel in this group.');
  });

  test('should successfully cancel an active round', async () => {
    const activeRound = { id: 'round-1', topic: 'Meeting Topic', timeframe: 'next week', status: 'active' };
    reposMock.groups.findByTelegramId = mock(() => Promise.resolve({ id: 'group-1' }));
    reposMock.members.isOptedIn = mock(() => Promise.resolve(true));
    reposMock.rounds.findActiveByGroup = mock(() => Promise.resolve(activeRound));

    await service.handleCancel(ctxMock);

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

describe('SchedulingService.handleSchedule (Story 4.1)', () => {
  let reposMock: SchedulingRepositories;
  let nluServiceMock: any;
  let service: SchedulingService;
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
      consensus: {} as any,
      reminders: {} as any,
    };
    nluServiceMock = {
      parseAvailability: mock(() => Promise.resolve({ success: false, error: 'Mocked failure' })),
    };
    service = new SchedulingService(reposMock, nluServiceMock);
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
    await service.handleSchedule(ctxMock);

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
    await service.handleSchedule(ctxMock);
    expect(ctxMock.reply).toHaveBeenCalledWith(expect.stringContaining('you must opt-in first'));
  });

  test('should fail if an active round already exists', async () => {
    reposMock.rounds.findActiveByGroup = mock(() => Promise.resolve({ topic: 'Existing' }));
    await service.handleSchedule(ctxMock);
    expect(ctxMock.reply).toHaveBeenCalledWith(expect.stringContaining('already an active scheduling round'));
  });

  test('should parse topic and timeframe correctly', () => {
    const parsed = service.parseScheduleCommand('/schedule "Team sync" on next Monday');
    expect(parsed).toEqual({ topic: 'Team sync', timeframe: 'next Monday' });
  });

  test('should parse topic without timeframe', () => {
    const parsed = service.parseScheduleCommand('/schedule "Quick sync"');
    expect(parsed).toEqual({ topic: 'Quick sync', timeframe: 'TBD' });
  });

  test('should handle unquoted topic', () => {
    const parsed = service.parseScheduleCommand('/schedule standup');
    expect(parsed).toEqual({ topic: 'standup', timeframe: 'TBD' });
  });
});

describe('SchedulingService.handleStatus (Story 7.1)', () => {
  let reposMock: SchedulingRepositories;
  let service: SchedulingService;
  let ctxMock: any;

  beforeEach(() => {
    reposMock = {
      groups: {
        findByTelegramId: mock(() => Promise.resolve({ id: 'group-1', name: 'Test Group' })),
        getConsensusThreshold: mock(() => Promise.resolve(75))
      } as any,
      members: {
        findOptedInByGroup: mock(() => Promise.resolve([])),
      } as any,
      rounds: {
        getActiveStatus: mock(() => Promise.resolve({ hasActiveRound: false })),
      } as any,
      responses: {
        findConfirmedByRound: mock(() => Promise.resolve([])),
      } as any,
      consensus: {} as any,
      nluQueue: {} as any,
      nudges: {} as any,
      reminders: {} as any,
    };
    const nluServiceMock = {
      parseAvailability: mock(() => Promise.resolve({ success: false, error: 'Mocked failure' })),
    };
    service = new SchedulingService(reposMock, nluServiceMock as any);
    ctxMock = {
      chat: { id: 123, type: 'group' },
      from: { id: 456, first_name: 'TestUser', username: 'testuser' },
      reply: mock(() => Promise.resolve({})),
    };
  });

  test('should fail if not in group chat', async () => {
    ctxMock.chat.type = 'private';
    await service.handleStatus(ctxMock);
    expect(ctxMock.reply).toHaveBeenCalledWith('This command only works in group chats.');
  });

  test('should display detailed status when an active round exists', async () => {
    const group = { id: 'group-1', telegramId: '123', name: 'Test Group', consensusThreshold: 75 };
    const round = { id: 'round-1', topic: 'Status Check', createdAt: new Date() };

    reposMock.groups.findByTelegramId = mock(() => Promise.resolve(group));
    reposMock.rounds.getActiveStatus = mock(() => Promise.resolve({ hasActiveRound: true, round }));
    reposMock.members.findOptedInByGroup = mock(() => Promise.resolve([
      { userId: 'user-1' },
      { userId: 'user-2' },
      { userId: 'user-3' }
    ]));
    reposMock.responses.findConfirmedByRound = mock(() => Promise.resolve([
      { userId: 'user-1' }
    ]));

    // Mock consensus service result (no consensus yet)
    (service as any).consensusService.calculateConsensus = mock(() => Promise.resolve({
      hasConsensus: false,
      totalOptedInMembers: 3,
      respondedMembers: 1
    }));

    await service.handleStatus(ctxMock);

    expect(ctxMock.reply).toHaveBeenCalledWith(
      expect.stringContaining('Scheduling Round Status'),
      expect.objectContaining({ parse_mode: 'Markdown' })
    );

    const replyCall = ctxMock.reply.mock.calls[0];
    const message = replyCall[0];
    expect(message).toContain('1 of 3 members responded');
    expect(message).toContain('Still calculating...');
  });

  test('should inform if no active round exists', async () => {
    reposMock.groups.findByTelegramId = mock(() => Promise.resolve({ id: 'group-1' }));
    reposMock.rounds.getActiveStatus = mock(() => Promise.resolve({ hasActiveRound: false }));

    await service.handleStatus(ctxMock);

    expect(ctxMock.reply).toHaveBeenCalledWith('No active scheduling round in this group.');
  });
});

describe('SchedulingService.handleAvailabilityResponse (Story 4.3)', () => {
  let reposMock: SchedulingRepositories;
  let nluServiceMock: any;
  let service: SchedulingService;
  let ctxMock: any;

  beforeEach(() => {
    reposMock = {
      groups: {
        findById: mock(() => Promise.resolve({ id: 'group-1', consensusThreshold: 75 }))
      } as any,
      members: {
        findByUserId: mock(() => Promise.resolve([{ groupId: 'group-1' }])),
        countOptedInByGroup: mock(() => Promise.resolve(4))
      } as any,
      rounds: {
        findActiveByGroup: mock(() => Promise.resolve({ id: 'round-1' })),
        findById: mock(() => Promise.resolve({ id: 'round-1', groupId: 'group-1' })),
        confirm: mock(() => Promise.resolve())
      } as any,
      responses: {
        findPendingByUser: mock(() => Promise.resolve(null)),
        confirm: mock(() => Promise.resolve({})),
        update: mock(() => Promise.resolve({})),
        create: mock(() => Promise.resolve({})),
        countVagueResponses: mock(() => Promise.resolve(0)),
        updateStatus: mock(() => Promise.resolve({})),
        findConfirmedByRound: mock(() => Promise.resolve([]))
      } as any,
      consensus: {
        updateAchieved: mock(() => Promise.resolve()),
        updateFailed: mock(() => Promise.resolve())
      } as any,
      nluQueue: {
        queue: mock(() => Promise.resolve({})),
      } as any,
      nudges: {} as any,
      reminders: {} as any,
    };
    nluServiceMock = {
      parseAvailability: mock(() => Promise.resolve({ success: false, error: 'Mocked failure' })),
    };
    service = new SchedulingService(reposMock, nluServiceMock);
    ctxMock = {
      chat: { id: 456, type: 'private' },
      from: { id: 456, first_name: 'TestUser', username: 'testuser' },
      message: { text: 'I am free Monday at 6pm' },
      reply: mock(() => Promise.resolve({})),
    };
  });

  test('should handle new availability response and send confirmation request', async () => {
    await service.handleAvailabilityResponse(ctxMock);

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

    await service.handleAvailabilityResponse(ctxMock);

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

    await service.handleAvailabilityResponse(ctxMock);

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
    (service as any).nluService.parseAvailability = mock(() => Promise.reject(new Error('API Unavailable')));

    await service.handleAvailabilityResponse(ctxMock);

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

describe('SchedulingService.handleStatus extended (Story 7.1)', () => {
  let reposMock: SchedulingRepositories;
  let consensusServiceMock: any;
  let service: SchedulingService;
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

    const nluServiceMock = {
      parseAvailability: mock(() => Promise.resolve({ success: false, error: 'Mocked failure' })),
    };
    service = new SchedulingService(reposMock, nluServiceMock as any);
    (service as any).consensusService = consensusServiceMock;

    ctxMock = {
      chat: { id: 123, type: 'group' },
      from: { id: 456 },
      reply: mock(() => Promise.resolve({}))
    };
  });

  test('should fail if in private chat', async () => {
    ctxMock.chat.type = 'private';
    await service.handleStatus(ctxMock);
    expect(ctxMock.reply).toHaveBeenCalledWith('This command only works in group chats.');
  });

  test('should return error if group not registered', async () => {
    reposMock.groups.findByTelegramId = mock(() => Promise.resolve(null));
    await service.handleStatus(ctxMock);
    expect(ctxMock.reply).toHaveBeenCalledWith('This group is not registered. Use /start to register it.');
  });

  test('should return message if no active round', async () => {
    reposMock.rounds.getActiveStatus = mock(() => Promise.resolve({ hasActiveRound: false, round: null }));
    await service.handleStatus(ctxMock);
    expect(ctxMock.reply).toHaveBeenCalledWith('No active scheduling round in this group.');
  });

  test('should display participation and consensus state when active round exists', async () => {
    await service.handleStatus(ctxMock);

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
    (service as any).consensusService = consensusServiceMockLocal;

    await service.handleStatus(ctxMock);

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
