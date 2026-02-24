import { Context } from 'telegraf';
import { DatabaseService } from './database.service';

export class BotHandlers {
  constructor(private db: DatabaseService) {}

  async handleStart(ctx: Context): Promise<void> {
    const chat = ctx.chat;
    if (!chat) return;

    if (chat.type === 'private') {
      await ctx.reply('Welcome! Add me to a group to start scheduling meetings.\nUse /start in a group to register it.');
    } else {
      // Group chat - register the group
      const group = await this.db.findOrCreateGroup(
        chat.id.toString(),
        chat.title || 'Unknown Group'
      );

      await ctx.reply(
        `Welcome! I've registered this group for scheduling.\n` +
        `Group ID: ${group.id}\n\n` +
        `Members can opt-in by messaging me directly or clicking the opt-in button.`
      );
    }
  }

  async handleStatus(ctx: Context): Promise<void> {
    const chat = ctx.chat;
    if (!chat || chat.type === 'private') {
      await ctx.reply('This command only works in group chats.');
      return;
    }

    const group = await this.db.getGroupByTelegramId(chat.id.toString());
    if (!group) {
      await ctx.reply('This group is not registered. Use /start to register it.');
      return;
    }

    const status = await this.db.getActiveRoundStatus(group.id);

    if (!status.hasActiveRound) {
      await ctx.reply('No active scheduling round in this group.');
      return;
    }

    const round = status.round!;
    await ctx.reply(
      `📅 Active Scheduling Round\n\n` +
      `Topic: ${round.topic}\n` +
      `Timeframe: ${round.timeframe}\n` +
      `Started: ${round.createdAt.toLocaleDateString()}\n` +
      `Opted-in members: ${status.optedInCount}`
    );
  }

  async handleOptIn(ctx: Context): Promise<void> {
    const user = ctx.from;
    if (!user) return;

    // Check if this is a DM or group chat
    const chat = ctx.chat;
    
    if (chat?.type === 'private') {
      // User messaged bot directly - they need to specify which group
      await ctx.reply(
        'To opt-in, please:\n' +
        '1. Add me to your group\n' +
        '2. Use the opt-in button in the group, or\n' +
        '3. Message me from within the group chat'
      );
      return;
    }

    // In a group chat
    if (!chat) return;

    const group = await this.db.findOrCreateGroup(
      chat.id.toString(),
      chat.title || 'Unknown Group'
    );

    const member = await this.db.optInMember(user.id.toString(), group.id);

    await ctx.reply(
      `✅ @${user.username || user.first_name} has opted in!\n` +
      `You'll receive DMs for scheduling rounds.`
    );
  }
}
