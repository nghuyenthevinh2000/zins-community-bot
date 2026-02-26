import { test, expect, describe, beforeEach, afterEach, mock } from 'bun:test';
import { Context } from 'telegraf';
import { GroupService, type GroupRepositories } from './group.service';

// Mock repositories
const mockGroups = {
  findByTelegramId: mock(() => Promise.resolve(null)),
  findOrCreate: mock(() => Promise.resolve({ id: 'g1', name: 'Test Group', telegramId: '-123456789' })),
  getAllSettings: mock(() => Promise.resolve({ consensusThreshold: 75, nudgeIntervalHours: 24, maxNudgeCount: 3 })),
  updateSettings: mock(() => Promise.resolve({ id: 'g1', name: 'Test Group' })),
};

const mockMembers = {
  optIn: mock(() => Promise.resolve({ userId: 'u1', groupId: 'g1' })),
  isOptedIn: mock(() => Promise.resolve(true)),
  findOptedInByGroup: mock(() => Promise.resolve([])),
  getOptInStatusByGroup: mock(() => Promise.resolve({ optedIn: [], notOptedIn: [] })),
};

// Mock telegram
const mockTelegram = {
  sendMessage: mock(() => Promise.resolve({ message_id: 123 })),
};

describe('GroupService', () => {
  let groupService: GroupService;
  let mockRepos: GroupRepositories;

  beforeEach(() => {
    mockRepos = {
      groups: mockGroups as any,
      members: mockMembers as any,
    };
    groupService = new GroupService(mockRepos, mockTelegram);
  });

  afterEach(() => {
    // Reset all mocks
    mockGroups.findByTelegramId.mockClear();
    mockGroups.findOrCreate.mockClear();
    mockGroups.getAllSettings.mockClear();
    mockGroups.updateSettings.mockClear();
    mockMembers.optIn.mockClear();
    mockMembers.isOptedIn.mockClear();
    mockMembers.findOptedInByGroup.mockClear();
    mockMembers.getOptInStatusByGroup.mockClear();
    mockTelegram.sendMessage.mockClear();
  });

  describe('handleStart', () => {
    test('should handle opt-in payload in private chat', async () => {
      const ctx = {
        chat: { type: 'private', id: 123456 },
        from: { id: 987654321, username: 'testuser' },
        reply: mock(() => Promise.resolve({ message_id: 1 })),
        startPayload: 'optin_-123456789',
      } as any;

      mockGroups.findByTelegramId.mockImplementation(() => Promise.resolve({
        id: 'g1',
        name: 'Test Group',
        telegramId: '-123456789',
      }));

      await groupService.handleStart(ctx);

      expect(mockGroups.findByTelegramId).toHaveBeenCalledWith('-123456789');
      expect(mockMembers.optIn).toHaveBeenCalledWith('987654321', 'g1');
      expect(ctx.reply).toHaveBeenCalled();
    });

    test('should handle group registration in group chat', async () => {
      const ctx = {
        chat: { type: 'group', id: -123456789, title: 'Test Group' },
        from: { id: 987654321, username: 'testuser' },
        reply: mock(() => Promise.resolve({ message_id: 1 })),
        botInfo: { username: 'zinsbot' },
      } as any;

      await groupService.handleStart(ctx);

      expect(mockGroups.findOrCreate).toHaveBeenCalledWith('-123456789', 'Test Group');
      expect(ctx.reply).toHaveBeenCalled();
    });
  });

  describe('handleOptIn', () => {
    test('should opt in user in group chat', async () => {
      const ctx = {
        chat: { type: 'group', id: -123456789, title: 'Test Group' },
        from: { id: 987654321, username: 'testuser', first_name: 'Test' },
        reply: mock(() => Promise.resolve({ message_id: 1 })),
      } as any;

      await groupService.handleOptIn(ctx);

      expect(mockGroups.findOrCreate).toHaveBeenCalledWith('-123456789', 'Test Group');
      expect(mockMembers.optIn).toHaveBeenCalledWith('987654321', 'g1');
      expect(ctx.reply).toHaveBeenCalled();
    });

    test('should reject opt-in in private chat', async () => {
      const ctx = {
        chat: { type: 'private', id: 123456 },
        from: { id: 987654321, username: 'testuser' },
        reply: mock(() => Promise.resolve({ message_id: 1 })),
      } as any;

      await groupService.handleOptIn(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('To opt-in, please:'));
    });
  });

  describe('handleMembers', () => {
    test('should display member status', async () => {
      const ctx = {
        chat: { type: 'group', id: -123456789 },
        reply: mock(() => Promise.resolve({ message_id: 1 })),
      } as any;

      mockGroups.findByTelegramId.mockImplementation(() => Promise.resolve({
        id: 'g1',
        name: 'Test Group',
      }));
      mockMembers.getOptInStatusByGroup.mockImplementation(() => Promise.resolve({
        optedIn: [{ userId: 'u1' }, { userId: 'u2' }],
        notOptedIn: [{ userId: 'u3' }],
      }));

      await groupService.handleMembers(ctx);

      expect(mockGroups.findByTelegramId).toHaveBeenCalledWith('-123456789');
      expect(mockMembers.getOptInStatusByGroup).toHaveBeenCalledWith('g1');
      expect(ctx.reply).toHaveBeenCalled();
    });

    test('should reject in private chat', async () => {
      const ctx = {
        chat: { type: 'private', id: 123456 },
        reply: mock(() => Promise.resolve({ message_id: 1 })),
      } as any;

      await groupService.handleMembers(ctx);

      expect(ctx.reply).toHaveBeenCalledWith('This command only works in group chats.');
    });
  });

  describe('handleSettings', () => {
    test('should display current settings', async () => {
      const ctx = {
        chat: { type: 'group', id: -123456789 },
        from: { id: 987654321, username: 'testuser' },
        message: { text: '/settings' },
        reply: mock(() => Promise.resolve({ message_id: 1 })),
      } as any;

      mockGroups.findByTelegramId.mockImplementation(() => Promise.resolve({
        id: 'g1',
        name: 'Test Group',
      }));

      await groupService.handleSettings(ctx);

      expect(mockGroups.getAllSettings).toHaveBeenCalledWith('g1');
      expect(ctx.reply).toHaveBeenCalled();
    });

    test('should update consensus threshold', async () => {
      const ctx = {
        chat: { type: 'group', id: -123456789 },
        from: { id: 987654321, username: 'testuser' },
        message: { text: '/settings threshold 60' },
        reply: mock(() => Promise.resolve({ message_id: 1 })),
      } as any;

      mockGroups.findByTelegramId.mockImplementation(() => Promise.resolve({
        id: 'g1',
        name: 'Test Group',
        telegramId: '-123456789',
      }));

      await groupService.handleSettings(ctx);

      expect(mockGroups.updateSettings).toHaveBeenCalledWith('g1', { consensusThreshold: 60 });
      expect(mockTelegram.sendMessage).toHaveBeenCalledWith(
        '-123456789',
        expect.stringContaining('Consensus Threshold'),
        expect.any(Object)
      );
    });

    test('should update nudge interval', async () => {
      const ctx = {
        chat: { type: 'group', id: -123456789 },
        from: { id: 987654321, username: 'testuser' },
        message: { text: '/settings interval 12' },
        reply: mock(() => Promise.resolve({ message_id: 1 })),
      } as any;

      mockGroups.findByTelegramId.mockImplementation(() => Promise.resolve({
        id: 'g1',
        name: 'Test Group',
        telegramId: '-123456789',
      }));

      await groupService.handleSettings(ctx);

      expect(mockGroups.updateSettings).toHaveBeenCalledWith('g1', { nudgeIntervalHours: 12 });
      expect(mockTelegram.sendMessage).toHaveBeenCalledWith(
        '-123456789',
        expect.stringContaining('Nudge Interval'),
        expect.any(Object)
      );
    });

    test('should update max nudges', async () => {
      const ctx = {
        chat: { type: 'group', id: -123456789 },
        from: { id: 987654321, username: 'testuser' },
        message: { text: '/settings max_nudges 5' },
        reply: mock(() => Promise.resolve({ message_id: 1 })),
      } as any;

      mockGroups.findByTelegramId.mockImplementation(() => Promise.resolve({
        id: 'g1',
        name: 'Test Group',
        telegramId: '-123456789',
      }));

      await groupService.handleSettings(ctx);

      expect(mockGroups.updateSettings).toHaveBeenCalledWith('g1', { maxNudgeCount: 5 });
      expect(mockTelegram.sendMessage).toHaveBeenCalledWith(
        '-123456789',
        expect.stringContaining('Max Nudges'),
        expect.any(Object)
      );
    });

    test('should reject invalid threshold', async () => {
      const ctx = {
        chat: { type: 'group', id: -123456789 },
        from: { id: 987654321, username: 'testuser' },
        message: { text: '/settings threshold 30' },
        reply: mock(() => Promise.resolve({ message_id: 1 })),
      } as any;

      mockGroups.findByTelegramId.mockImplementation(() => Promise.resolve({
        id: 'g1',
        name: 'Test Group',
      }));

      await groupService.handleSettings(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Invalid threshold'));
      expect(mockGroups.updateSettings).not.toHaveBeenCalled();
    });

    test('should reject non-opted-in users', async () => {
      const ctx = {
        chat: { type: 'group', id: -123456789 },
        from: { id: 987654321, username: 'testuser' },
        message: { text: '/settings threshold 60' },
        reply: mock(() => Promise.resolve({ message_id: 1 })),
      } as any;

      mockGroups.findByTelegramId.mockImplementation(() => Promise.resolve({
        id: 'g1',
        name: 'Test Group',
      }));
      mockMembers.isOptedIn.mockImplementation(() => Promise.resolve(false));

      await groupService.handleSettings(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('must opt-in first'));
      expect(mockGroups.updateSettings).not.toHaveBeenCalled();
    });
  });
});
