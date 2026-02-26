import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { PrismaClient } from '@prisma/client';
import { GroupRepository } from '../db/group-repository';
import { MemberRepository } from '../db/member-repository';
import { BotHandlers } from './bot-handlers.service';

const prisma = new PrismaClient();

// Mock context
function createMockContext(overrides: any = {}) {
  return {
    chat: {
      type: 'group',
      id: -123456789
    },
    from: {
      id: 987654321,
      username: 'testuser'
    },
    message: {
      text: '/settings'
    },
    reply: async (message: string, options?: any) => {
      console.log('[MockReply]', message.substring(0, 100));
      return { message_id: 1 };
    },
    ...overrides
  };
}

// Mock bot for testing broadcasts
function createMockBot() {
  const sentMessages: Array<{ chatId: string | number; message: string }> = [];
  
  return {
    telegram: {
      sendMessage: async (chatId: string | number, message: string, options?: any) => {
        sentMessages.push({ chatId, message });
        console.log(`[MockBot] Broadcasting to ${chatId}: ${message.substring(0, 80)}...`);
        return { message_id: Math.floor(Math.random() * 1000) };
      }
    },
    getSentMessages: () => sentMessages,
    clearMessages: () => { sentMessages.length = 0; }
  };
}

describe('Group Settings (Story 7.2)', () => {
  let groupRepo: GroupRepository;
  let memberRepo: MemberRepository;
  let mockBot: ReturnType<typeof createMockBot>;

  beforeEach(async () => {
    await prisma.availabilityResponse.deleteMany();
    await prisma.nudgeTracking.deleteMany();
    await prisma.nudgeHistory.deleteMany();
    await prisma.pendingNLURequest.deleteMany();
    await prisma.consensusResult.deleteMany();
    await prisma.schedulingRound.deleteMany();
    await prisma.member.deleteMany();
    await prisma.group.deleteMany();

    groupRepo = new GroupRepository();
    memberRepo = new MemberRepository();
    mockBot = createMockBot();
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  function createHandlers(): BotHandlers {
    return new BotHandlers({
      groups: groupRepo,
      members: memberRepo,
      rounds: {} as any,
      responses: {} as any,
      nluQueue: {} as any,
      nudges: {} as any,
      consensus: {} as any
    }, undefined, mockBot as any);
  }

  test('should broadcast setting change to group chat', async () => {
    const group = await groupRepo.findOrCreate('-123456789', 'Broadcast Test Group');
    await memberRepo.optIn('987654321', group.id);

    const handlers = createHandlers();
    const ctx = createMockContext({
      message: { text: '/settings threshold 60' }
    });
    
    mockBot.clearMessages();
    
    await handlers.handleSettings(ctx as any);

    // Check that broadcast was sent
    const sentMessages = mockBot.getSentMessages();
    expect(sentMessages.length).toBe(1);
    expect(sentMessages[0].chatId).toBe('-123456789');
    expect(sentMessages[0].message).toContain('Group Setting Changed');
    expect(sentMessages[0].message).toContain('@testuser');
    expect(sentMessages[0].message).toContain('Consensus Threshold');
    expect(sentMessages[0].message).toContain('60%');
  });

  test('should broadcast interval change with user identifier', async () => {
    const group = await groupRepo.findOrCreate('-123456789', 'Interval Broadcast Group');
    await memberRepo.optIn('987654321', group.id);

    const handlers = createHandlers();
    const ctx = createMockContext({
      message: { text: '/settings interval 12' }
    });
    
    mockBot.clearMessages();
    
    await handlers.handleSettings(ctx as any);

    const sentMessages = mockBot.getSentMessages();
    expect(sentMessages.length).toBe(1);
    expect(sentMessages[0].message).toContain('@testuser');
    expect(sentMessages[0].message).toContain('Nudge Interval');
    expect(sentMessages[0].message).toContain('12 hours');
  });

  test('should broadcast max_nudges change', async () => {
    const group = await groupRepo.findOrCreate('-123456789', 'MaxNudges Broadcast Group');
    await memberRepo.optIn('987654321', group.id);

    const handlers = createHandlers();
    const ctx = createMockContext({
      message: { text: '/settings max_nudges 5' }
    });
    
    mockBot.clearMessages();
    
    await handlers.handleSettings(ctx as any);

    const sentMessages = mockBot.getSentMessages();
    expect(sentMessages.length).toBe(1);
    expect(sentMessages[0].message).toContain('@testuser');
    expect(sentMessages[0].message).toContain('Max Nudges');
    expect(sentMessages[0].message).toContain('5');
  });

  test('should not broadcast if user has no username', async () => {
    const group = await groupRepo.findOrCreate('-123456789', 'No Username Group');
    await memberRepo.optIn('987654321', group.id);

    const handlers = createHandlers();
    const ctx = createMockContext({
      from: { id: 987654321 }, // No username
      message: { text: '/settings threshold 60' }
    });
    
    mockBot.clearMessages();
    
    await handlers.handleSettings(ctx as any);

    const sentMessages = mockBot.getSentMessages();
    expect(sentMessages.length).toBe(1);
    expect(sentMessages[0].message).toContain('User 987654321');
  });

  test('should display all group settings', async () => {
    const group = await groupRepo.findOrCreate('-123456789', 'Settings Test Group');
    await memberRepo.optIn('987654321', group.id);

    const handlers = createHandlers();
    const ctx = createMockContext();
    let replyMessage = '';
    ctx.reply = async (message: string) => {
      replyMessage = message;
      return { message_id: 1 };
    };

    await handlers.handleSettings(ctx as any);

    expect(replyMessage).toContain('Consensus Threshold: 75%');
    expect(replyMessage).toContain('Nudge Interval: 24 hours');
    expect(replyMessage).toContain('Max Nudges: 3');
    expect(replyMessage).toContain('Story 7.2');
  });

  test('should update consensus threshold', async () => {
    const group = await groupRepo.findOrCreate('-123456789', 'Threshold Test Group');
    await memberRepo.optIn('987654321', group.id);

    const handlers = createHandlers();
    const ctx = createMockContext({
      message: { text: '/settings threshold 60' }
    });
    let replyMessage = '';
    ctx.reply = async (message: string) => {
      replyMessage = message;
      return { message_id: 1 };
    };

    await handlers.handleSettings(ctx as any);

    expect(replyMessage).toContain('Consensus threshold changed to 60%');
    
    const settings = await groupRepo.getAllSettings(group.id);
    expect(settings.consensusThreshold).toBe(60);
  });

  test('should update nudge interval', async () => {
    const group = await groupRepo.findOrCreate('-123456789', 'Interval Test Group');
    await memberRepo.optIn('987654321', group.id);

    const handlers = createHandlers();
    const ctx = createMockContext({
      message: { text: '/settings interval 12' }
    });
    let replyMessage = '';
    ctx.reply = async (message: string) => {
      replyMessage = message;
      return { message_id: 1 };
    };

    await handlers.handleSettings(ctx as any);

    expect(replyMessage).toContain('Nudge interval changed to 12 hours');
    
    const settings = await groupRepo.getAllSettings(group.id);
    expect(settings.nudgeIntervalHours).toBe(12);
  });

  test('should update max nudges', async () => {
    const group = await groupRepo.findOrCreate('-123456789', 'MaxNudges Test Group');
    await memberRepo.optIn('987654321', group.id);

    const handlers = createHandlers();
    const ctx = createMockContext({
      message: { text: '/settings max_nudges 5' }
    });
    let replyMessage = '';
    ctx.reply = async (message: string) => {
      replyMessage = message;
      return { message_id: 1 };
    };

    await handlers.handleSettings(ctx as any);

    expect(replyMessage).toContain('Maximum nudges changed to 5');
    
    const settings = await groupRepo.getAllSettings(group.id);
    expect(settings.maxNudgeCount).toBe(5);
  });

  test('should reject invalid threshold value', async () => {
    const group = await groupRepo.findOrCreate('-123456789', 'Invalid Threshold Group');
    await memberRepo.optIn('987654321', group.id);

    const handlers = createHandlers();
    const ctx = createMockContext({
      message: { text: '/settings threshold 30' }
    });
    let replyMessage = '';
    ctx.reply = async (message: string) => {
      replyMessage = message;
      return { message_id: 1 };
    };

    await handlers.handleSettings(ctx as any);

    expect(replyMessage).toContain('Invalid threshold');
    expect(replyMessage).toContain('50 and 100');
    
    // Settings should remain unchanged
    const settings = await groupRepo.getAllSettings(group.id);
    expect(settings.consensusThreshold).toBe(75);
  });

  test('should reject invalid interval value', async () => {
    const group = await groupRepo.findOrCreate('-123456789', 'Invalid Interval Group');
    await memberRepo.optIn('987654321', group.id);

    const handlers = createHandlers();
    const ctx = createMockContext({
      message: { text: '/settings interval 200' }
    });
    let replyMessage = '';
    ctx.reply = async (message: string) => {
      replyMessage = message;
      return { message_id: 1 };
    };

    await handlers.handleSettings(ctx as any);

    expect(replyMessage).toContain('Invalid interval');
    expect(replyMessage).toContain('1 and 168');
    
    const settings = await groupRepo.getAllSettings(group.id);
    expect(settings.nudgeIntervalHours).toBe(24);
  });

  test('should reject non-opted-in users', async () => {
    const group = await groupRepo.findOrCreate('-123456789', 'Non Opted-in Group');
    // Don't opt in the user

    const handlers = createHandlers();
    const ctx = createMockContext();
    let replyMessage = '';
    ctx.reply = async (message: string) => {
      replyMessage = message;
      return { message_id: 1 };
    };

    await handlers.handleSettings(ctx as any);

    expect(replyMessage).toContain('must opt-in first');
  });

  test('should show usage for unknown setting', async () => {
    const group = await groupRepo.findOrCreate('-123456789', 'Unknown Setting Group');
    await memberRepo.optIn('987654321', group.id);

    const handlers = createHandlers();
    const ctx = createMockContext({
      message: { text: '/settings unknown_setting 50' }
    });
    let replyMessage = '';
    ctx.reply = async (message: string) => {
      replyMessage = message;
      return { message_id: 1 };
    };

    await handlers.handleSettings(ctx as any);

    expect(replyMessage).toContain('Unknown setting');
    expect(replyMessage).toContain('threshold');
    expect(replyMessage).toContain('interval');
    expect(replyMessage).toContain('max_nudges');
  });

  test('should get all settings from repository', async () => {
    const group = await groupRepo.findOrCreate('-123456789', 'GetAll Test Group');
    
    // Update settings
    await groupRepo.updateSettings(group.id, {
      consensusThreshold: 80,
      nudgeIntervalHours: 48,
      maxNudgeCount: 2
    });

    const settings = await groupRepo.getAllSettings(group.id);
    
    expect(settings.consensusThreshold).toBe(80);
    expect(settings.nudgeIntervalHours).toBe(48);
    expect(settings.maxNudgeCount).toBe(2);
  });

  test('should update settings individually', async () => {
    const group = await groupRepo.findOrCreate('-123456789', 'Individual Update Group');
    
    // Update only threshold
    await groupRepo.updateSettings(group.id, { consensusThreshold: 70 });
    
    let settings = await groupRepo.getAllSettings(group.id);
    expect(settings.consensusThreshold).toBe(70);
    expect(settings.nudgeIntervalHours).toBe(24); // Unchanged
    expect(settings.maxNudgeCount).toBe(3); // Unchanged

    // Update only interval
    await groupRepo.updateSettings(group.id, { nudgeIntervalHours: 6 });
    
    settings = await groupRepo.getAllSettings(group.id);
    expect(settings.consensusThreshold).toBe(70); // Unchanged
    expect(settings.nudgeIntervalHours).toBe(6);
    expect(settings.maxNudgeCount).toBe(3); // Unchanged
  });
});
