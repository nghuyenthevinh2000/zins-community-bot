import { Context } from 'telegraf';
import { DatabaseService } from './database.service';

export class BotHandlers {
  constructor(private db: DatabaseService) { }

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

  async handleSchedule(ctx: Context): Promise<void> {
    const chat = ctx.chat;
    const user = ctx.from;

    if (!chat || chat.type === 'private') {
      await ctx.reply('This command only works in group chats.');
      return;
    }

    if (!user) {
      await ctx.reply('Unable to identify user.');
      return;
    }

    const group = await this.db.getGroupByTelegramId(chat.id.toString());
    if (!group) {
      await ctx.reply('This group is not registered. Use /start to register it.');
      return;
    }

    // Check if user is opted-in
    const isOptedIn = await this.db.isMemberOptedIn(user.id.toString(), group.id);
    if (!isOptedIn) {
      await ctx.reply(
        `❌ @${user.username || user.first_name}, you must opt-in first before starting a scheduling round.\n` +
        `Use the opt-in button or message me directly.`
      );
      return;
    }

    // Check if there's already an active round
    const activeRound = await this.db.getActiveRoundByGroup(group.id);
    if (activeRound) {
      await ctx.reply(
        `⚠️ There's already an active scheduling round:\n` +
        `Topic: ${activeRound.topic}\n\n` +
        `Use /cancel to end the current round before starting a new one.`
      );
      return;
    }

    // Parse the command text
    const messageText = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    const parsed = this.parseScheduleCommand(messageText);

    if (!parsed) {
      await ctx.reply(
        `❌ Invalid format. Use:\n` +
        `/schedule "topic"\n\n` +
        `Example: /schedule "Team standup"`
      );
      return;
    }

    // Create the scheduling round
    const round = await this.db.createSchedulingRound(group.id, parsed.topic, parsed.timeframe);

    await ctx.reply(
      `✅ **Scheduling Round Started!**\n\n` +
      `Topic: ${round.topic}\n\n` +
      `I'll DM all opted-in members to collect their availability.`,
      { parse_mode: 'Markdown' }
    );

    // Send availability request DMs to all opted-in members (NFR2: within 30 seconds)
    await this.sendAvailabilityRequests(ctx.telegram, group.id, round.topic, parsed.timeframe || 'the upcoming days');
  }

  private async sendAvailabilityRequests(
    telegram: any,
    groupId: string,
    topic: string,
    timeframe: string
  ): Promise<void> {
    const optedInMembers = await this.db.getOptedInMembers(groupId);
    
    if (optedInMembers.length === 0) {
      console.log(`No opted-in members for group ${groupId}`);
      return;
    }

    console.log(`Sending availability requests to ${optedInMembers.length} members for topic: ${topic}`);

    // Send DMs with rate limiting (NFR8: 1 msg/s per chat = 1000ms delay)
    for (const member of optedInMembers) {
      try {
        await telegram.sendMessage(
          member.userId,
          `📅 **Availability Request**\n\n` +
          `A new scheduling round has started!\n\n` +
          `**Topic:** ${topic}\n` +
          `**Timeframe:** ${timeframe}\n\n` +
          `Please reply with your availability in natural language (e.g., "I'm free Tuesday after 6pm").`,
          { parse_mode: 'Markdown' }
        );
        console.log(`Availability request sent to user ${member.userId}`);
        
        // Rate limit: wait 1 second between messages (NFR8)
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Failed to send DM to user ${member.userId}:`, error);
      }
    }
  }

  private parseScheduleCommand(text: string): { topic: string; timeframe: string } | null {
    // Try to parse both topic and timeframe: /schedule "topic" on timeframe
    const fullMatch = text.match(/^\/schedule\s+(.+?)\s+on\s+(.+)$/i);
    if (fullMatch) {
      let topic = fullMatch[1].trim();
      let timeframe = fullMatch[2].trim();

      // Remove surrounding quotes from topic if they exist
      if ((topic.startsWith('"') && topic.endsWith('"')) || (topic.startsWith("'") && topic.endsWith("'"))) {
        topic = topic.slice(1, -1);
      }

      return { topic, timeframe };
    }

    // Fallback to just topic: /schedule "topic"
    const topicMatch = text.match(/^\/schedule\s+(.+)$/i);
    if (topicMatch) {
      let topic = topicMatch[1].trim();

      // Remove surrounding quotes if they exist
      if ((topic.startsWith('"') && topic.endsWith('"')) || (topic.startsWith("'") && topic.endsWith("'"))) {
        topic = topic.slice(1, -1);
      }

      return {
        topic,
        timeframe: 'the upcoming days' // Default timeframe
      };
    }

    return null;
  }

  async handleCancel(ctx: Context): Promise<void> {
    const chat = ctx.chat;
    const user = ctx.from;

    if (!chat || chat.type === 'private') {
      await ctx.reply('This command only works in group chats.');
      return;
    }

    if (!user) {
      await ctx.reply('Unable to identify user.');
      return;
    }

    const group = await this.db.getGroupByTelegramId(chat.id.toString());
    if (!group) {
      await ctx.reply('This group is not registered. Use /start to register it.');
      return;
    }

    // Check if user is opted-in
    const isOptedIn = await this.db.isMemberOptedIn(user.id.toString(), group.id);
    if (!isOptedIn) {
      await ctx.reply(
        `❌ @${user.username || user.first_name}, you must opt-in first to cancel a scheduling round.\n` +
        `Use the opt-in button or message me directly.`
      );
      return;
    }

    // Check if there's an active round
    const activeRound = await this.db.getActiveRoundByGroup(group.id);
    if (!activeRound) {
      await ctx.reply('No active scheduling round to cancel in this group.');
      return;
    }

    // Cancel the round
    await this.db.cancelRound(activeRound.id);

    await ctx.reply(
      `✅ **Scheduling Round Cancelled**\n\n` +
      `Topic: ${activeRound.topic}\n` +
      `Timeframe: ${activeRound.timeframe}\n\n` +
      `The scheduling round has been cancelled by @${user.username || user.first_name}.`,
      { parse_mode: 'Markdown' }
    );
  }

  async handleAvailabilityResponse(ctx: Context): Promise<void> {
    const user = ctx.from;
    if (!user) return;

    // Get the message text
    const messageText = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    if (!messageText) {
      await ctx.reply('Please send your availability as a text message.');
      return;
    }

    // For now, acknowledge the response (Story 4.2 will add NLU parsing)
    await ctx.reply(
      `✅ **Availability Received**\n\n` +
      `You said: "${messageText}"\n\n` +
      `Thank you! Your response has been recorded. ` +
      `The bot will process all responses to find the best meeting time.`,
      { parse_mode: 'Markdown' }
    );

    console.log(`Availability response from user ${user.id}: ${messageText}`);
  }

  async handleMembers(ctx: Context): Promise<void> {
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

    const { optedIn, notOptedIn } = await this.db.getAllMembersWithOptInStatus(group.id);

    const optedInCount = optedIn.length;
    const notOptedInCount = notOptedIn.length;
    const totalCount = optedInCount + notOptedInCount;

    let message = `👥 **Member Status**\n\n`;
    message += `**Opted-in (${optedInCount}):**\n`;

    if (optedInCount > 0) {
      optedIn.forEach((member, index) => {
        message += `${index + 1}. User ID: ${member.userId}\n`;
      });
    } else {
      message += `_No members have opted in yet_\n`;
    }

    message += `\n**Not opted-in (${notOptedInCount}):**\n`;

    if (notOptedInCount > 0) {
      notOptedIn.forEach((member, index) => {
        message += `${index + 1}. User ID: ${member.userId}\n`;
      });
    } else {
      message += `_All registered members have opted in_\n`;
    }

    message += `\n**Total tracked:** ${totalCount} members`;

    await ctx.reply(message, { parse_mode: 'Markdown' });
  }
}
