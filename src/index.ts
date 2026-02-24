import { Telegraf } from 'telegraf';
import { PrismaClient } from '@prisma/client';
import { DatabaseService } from './services/database.service';
import { BotHandlers } from './services/bot-handlers.service';

const token = process.env.BOT_TOKEN;
if (!token) {
  console.warn('Warning: BOT_TOKEN is not provided in environment variables!');
}

const bot = new Telegraf(token || 'dummy_token');
const prisma = new PrismaClient();
const dbService = new DatabaseService(prisma);
const handlers = new BotHandlers(dbService);

// Bot command handlers
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
      await ctx.reply(
        `✅ **You've opted in!**\n\n` +
        `Thank you for opting in to Zins Community Bot. You'll now receive scheduling messages ` +
        `and be included in future scheduling rounds for your group.\n\n` +
        `You can use /help at any time to see available commands.`,
        { parse_mode: 'Markdown' }
      );
      console.log(`Member opted in: User ${ctx.from.id} for group ${groupId}`);
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
