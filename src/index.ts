import { Telegraf } from 'telegraf';
import { PrismaClient } from '@prisma/client';
import { DatabaseService } from './services/database.service';
import { BotHandlers } from './services/bot-handlers.service';
import { OpenCodeNLUService } from './services/opencode-nlu.service';

const token = process.env.BOT_TOKEN;
if (!token) {
  console.warn('Warning: BOT_TOKEN is not provided in environment variables!');
}

const bot = new Telegraf(token || 'dummy_token');
const prisma = new PrismaClient();
const dbService = new DatabaseService(prisma);
const handlers = new BotHandlers(dbService);
const nluService = new OpenCodeNLUService();

// Bot command handlers
bot.command('schedule', (ctx) => handlers.handleSchedule(ctx));
bot.command('cancel', (ctx) => handlers.handleCancel(ctx));
bot.command('status', (ctx) => handlers.handleStatus(ctx));
bot.command('optin', (ctx) => handlers.handleOptIn(ctx));
bot.command('members', (ctx) => handlers.handleMembers(ctx));

// Unified start and deep link handler
bot.start(async (ctx) => {
  const payload = ctx.payload;

  // Handle opt-in deep link
  if (payload && payload.startsWith('optin_')) {
    const groupId = payload.replace('optin_', '');

    // Check if this is a private chat (DM)
    if (ctx.chat.type === 'private') {
      try {
        const group = await dbService.getGroupByTelegramId(groupId);
        if (!group) {
          await ctx.reply('❌ Sorry, this group is not registered with the bot.');
          return;
        }

        await dbService.optInMember(ctx.from.id.toString(), group.id);

        await ctx.reply(
          `✅ **You've opted in!**\n\n` +
          `Thank you for opting in to Zins Community Bot. You'll now receive scheduling messages ` +
          `and be included in future scheduling rounds for your group.\n\n` +
          `You can use /help at any time to see available commands.`,
          { parse_mode: 'Markdown' }
        );
        console.log(`Member opted in: User ${ctx.from.id} for group ${group.name} (${group.telegramId})`);
      } catch (error) {
        console.error('Error opting in member:', error);
        await ctx.reply('❌ An error occurred while opting you in. Please try again.');
      }
    }
  } else {
    // Standard start handler
    await handlers.handleStart(ctx);
  }
});

// Handle when bot is added to a group
bot.on('new_chat_members', async (ctx) => {
  const newMembers = ctx.message.new_chat_members;
  const botInfo = await ctx.telegram.getMe();

  // Check if the bot itself was added
  const botWasAdded = newMembers.some(member => member.id === botInfo.id);

  if (botWasAdded) {
    const chat = ctx.chat;

    // Only process group chats (not private chats)
    if (chat.type !== 'group' && chat.type !== 'supergroup') {
      return;
    }

    try {
      // Create or update group record in database
      const group = await prisma.group.upsert({
        where: { telegramId: String(chat.id) },
        update: { name: chat.title },
        create: {
          telegramId: String(chat.id),
          name: chat.title,
        },
      });

      console.log(`Group registered: ${group.name} (ID: ${group.telegramId})`);

      // Send welcome message
      await ctx.reply(
        `🎉 Hello! I'm Zins Community Bot, your scheduling assistant.\n\n` +
        `I'll help your group find the best times to meet. Here's how it works:\n\n` +
        `1️⃣ **Opt-in**: Each member needs to send me a direct message or click the button below to opt-in\n` +
        `2️⃣ **Schedule**: Any opted-in member can start a scheduling round with /schedule\n` +
        `3️⃣ **Respond**: I'll DM each member to collect availability\n` +
        `4️⃣ **Confirm**: Once we reach consensus, I'll announce the meeting time\n\n` +
        `Ready to get started? Click the button below to opt-in!`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Opt-in to Scheduling', url: `https://t.me/${botInfo.username}?start=optin_${chat.id}` }]
            ]
          }
        }
      );
    } catch (error) {
      console.error('Error registering group:', error);
      await ctx.reply('❌ Sorry, there was an error setting up the bot for this group. Please try removing and re-adding me.');
    }
  }
});

// Handle DM messages for availability parsing (Story 4.2)
bot.on('message', async (ctx) => {
  // Only handle text messages in private chats
  if (ctx.chat.type !== 'private') return;
  if (!('text' in ctx.message)) return;
  
  const userId = ctx.from.id.toString();
  const text = ctx.message.text;
  
  // Skip commands
  if (text.startsWith('/')) return;
  
  try {
    // Find all groups where this user is a member and has active scheduling rounds
    const memberGroups = await prisma.member.findMany({
      where: { userId },
      include: { group: true }
    });
    
    if (memberGroups.length === 0) {
      await ctx.reply('You are not a member of any registered groups. Please join a group that uses this bot first.');
      return;
    }
    
    // Find active rounds in user's groups
    let activeRound = null;
    let memberGroup = null;
    
    for (const member of memberGroups) {
      const round = await dbService.getActiveRoundByGroup(member.groupId);
      if (round) {
        activeRound = round;
        memberGroup = member;
        break;
      }
    }
    
    if (!activeRound) {
      await ctx.reply('There are no active scheduling rounds in your groups right now. You can respond when a round is started.');
      return;
    }
    
    // Check if user already responded to this round
    const hasResponded = await dbService.hasMemberResponded(userId, activeRound.id);
    
    // Parse the availability using OpenCode NLU
    const parseResult = await nluService.parseAvailabilityFallback(text);
    
    if (parseResult.isVague || !parseResult.parsed || parseResult.parsed.length === 0) {
      // Vague response - store it and ask for specifics
      await dbService.createAvailabilityResponse(
        activeRound.id,
        userId,
        text,
        undefined,
        undefined,
        true,
        'vague'
      );
      
      await ctx.reply(
        `I received your response: "${text}"\n\n` +
        `However, I need more specific times to calculate consensus.\n` +
        `Could you please provide specific time ranges? For example:\n` +
        `• "Tuesday after 6pm"\n` +
        `• "Wednesday morning"\n` +
        `• "Thursday 2pm-4pm"`,
        { parse_mode: 'Markdown' }
      );
      return;
    }
    
    // Store the parsed availability
    const firstSlot = parseResult.parsed[0];
    await dbService.createAvailabilityResponse(
      activeRound.id,
      userId,
      text,
      firstSlot.startTime,
      firstSlot.endTime,
      false,
      'confirmed'
    );
    
    // Confirm the parsed availability
    const timeRanges = parseResult.parsed.map(slot => 
      `${slot.startTime.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} - ` +
      `${slot.endTime.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' })}`
    ).join('\n');
    
    await ctx.reply(
      `✅ **Availability Recorded!**\n\n` +
      `I understood:\n${timeRanges}\n\n` +
      `If this is correct, you're all set! If I misunderstood, just send your availability again.`
    );
    
    console.log(`Availability recorded for user ${userId} in round ${activeRound.id}`);
    
  } catch (error) {
    console.error('Error processing availability response:', error);
    await ctx.reply('❌ Sorry, there was an error processing your availability. Please try again.');
  }
});

// Basic webhook setup test
if (process.env.NODE_ENV === 'production' && process.env.WEBHOOK_DOMAIN) {
  bot.launch({
    webhook: {
      domain: process.env.WEBHOOK_DOMAIN,
      port: 3000
    }
  });
  console.log(`Bot launched with webhook on port 3000`);
} else {
  // Long polling for development fallback
  bot.launch();
  console.log('Bot launched with long polling');
}

// Enable graceful stop
process.once('SIGINT', async () => {
  bot.stop('SIGINT');
  await prisma.$disconnect();
});
process.once('SIGTERM', async () => {
  bot.stop('SIGTERM');
  await prisma.$disconnect();
});
