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
bot.start((ctx) => handlers.handleStart(ctx));
bot.command('status', (ctx) => handlers.handleStatus(ctx));
bot.command('optin', (ctx) => handlers.handleOptIn(ctx));

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
