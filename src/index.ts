import { Telegraf } from 'telegraf';
import * as dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const token = process.env.BOT_TOKEN;
if (!token) {
  console.warn('Warning: BOT_TOKEN is not provided in environment variables!');
}

const bot = new Telegraf(token || 'dummy_token');
const prisma = new PrismaClient();

bot.start((ctx) => ctx.reply('Welcome! Zins Community Bot is running.'));

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
