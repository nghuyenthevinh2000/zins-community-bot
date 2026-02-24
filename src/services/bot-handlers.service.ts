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

    const userId = user.id.toString();
    const chat = ctx.chat;

    if (!chat || chat.type !== 'private') return;

    const messageText = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    if (!messageText) {
      await ctx.reply('Please send your availability as a text message.');
      return;
    }
    // Check if user has a pending confirmation
    const pendingResponse = await this.db.getPendingAvailabilityResponse(userId);

    if (pendingResponse) {
      const normalizedText = messageText.toLowerCase().trim();

      if (normalizedText === 'yes' || normalizedText === 'y' || normalizedText === 'correct' || normalizedText === 'right') {
        await this.db.confirmAvailabilityResponse(pendingResponse.roundId, userId);
        await ctx.reply(
          `✅ **Availability Confirmed!**\n\n` +
          `Your availability has been recorded. Thank you!`,
          { parse_mode: 'Markdown' }
        );
        return;
      } else {
        // User is correcting - re-parse and confirm again
        const parsedAvailability = this.parseNaturalLanguageAvailability(messageText);
        await this.db.updateAvailabilityResponse(
          pendingResponse.roundId,
          userId,
          messageText,
          parsedAvailability
        );

        await this.sendConfirmationRequest(ctx, messageText, parsedAvailability);
        return;
      }
    }

    // New availability response
    const member = await this.findMemberWithActiveRound(userId);
    if (!member) {
      await ctx.reply(
        `❌ You don't have any active scheduling rounds.\n` +
        `Please wait for a scheduling round to start in your group.`
      );
      return;
    }

    // Parse availability
    const parsedAvailability = this.parseNaturalLanguageAvailability(messageText);
    
    // Story 4.4: Check if response is vague
    const isVague = this.isVagueResponse(parsedAvailability, messageText);
    
    if (isVague) {
      // Count how many vague responses user has given for this round
      const vagueCount = await this.db.getVagueResponseCount(userId, member.roundId);
      
      // Store the vague response
      await this.db.createAvailabilityResponse(
        member.roundId,
        userId,
        messageText,
        parsedAvailability
      );
      
      // Progressive prompting based on vague count
      if (vagueCount === 0) {
        // First vague response - gentle prompt
        await ctx.reply(
          `🤔 I received: "${messageText}"\n\n` +
          `To find the best meeting time, I need more specific availability. ` +
          `Could you please tell me:\n` +
          `• Which specific days work for you?\n` +
          `• What times on those days?\n\n` +
          `For example: "Tuesday after 6pm" or "Wednesday morning"`,
          { parse_mode: 'Markdown' }
        );
      } else if (vagueCount === 1) {
        // Second vague response - more specific prompt
        await ctx.reply(
          `📝 Thanks for your response, but I still need more details.\n\n` +
          `Please provide:\n` +
          `• Day of the week (Monday, Tuesday, etc.)\n` +
          `• Time range (morning, afternoon, evening, or specific hours)\n\n` +
          `Examples:\n` +
          `• "I'm free Thursday afternoon"\n` +
          `• "Friday 2pm-5pm works for me"\n` +
          `• "Monday or Wednesday evening"`,
          { parse_mode: 'Markdown' }
        );
      } else if (vagueCount === 2) {
        // Third vague response - final attempt with examples
        await ctx.reply(
          `⚠️ I'm having trouble understanding your availability.\n\n` +
          `To schedule effectively, I need to know:\n` +
          `1. Which days you're available\n` +
          `2. What times on those days\n\n` +
          `Try something like:\n` +
          `✅ "I'm free Tuesday 6pm-8pm and Thursday 7pm-9pm"\n` +
          `✅ "Monday afternoon works for me"\n` +
          `✅ "Friday or Saturday morning"\n\n` +
          `Please try one more time with specific days and times!`,
          { parse_mode: 'Markdown' }
        );
      } else {
        // Fourth or more vague responses - accept but warn
        await ctx.reply(
          `✅ I've recorded your response: "${messageText}"\n\n` +
          `⚠️ Note: Your availability wasn't very specific, so it may be harder ` +
          `to find a time that works for everyone. If you can provide more details ` +
          `later, just send me a new message!`,
          { parse_mode: 'Markdown' }
        );
        
        // Mark this vague response as the "final" one
        await this.db.updateAvailabilityResponseStatus(
          member.roundId,
          userId,
          'confirmed_vague'
        );
      }
      return;
    }

    // Not vague - store and confirm normally
    await this.db.createAvailabilityResponse(
      member.roundId,
      userId,
      messageText,
      parsedAvailability
    );

    await this.sendConfirmationRequest(ctx, messageText, parsedAvailability);
  }

  private async findMemberWithActiveRound(userId: string): Promise<{ roundId: string; groupId: string } | null> {
    const memberships = await this.db.getPrisma().member.findMany({
      where: { userId },
      select: { groupId: true }
    });

    for (const membership of memberships) {
      const activeRound = await this.db.getActiveRoundByGroup(membership.groupId);
      if (activeRound) {
        return { roundId: activeRound.id, groupId: membership.groupId };
      }
    }

    return null;
  }

  private parseNaturalLanguageAvailability(text: string): any {
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const foundDays: string[] = [];

    const lowerText = text.toLowerCase();
    days.forEach(day => {
      if (lowerText.includes(day)) {
        foundDays.push(day.charAt(0).toUpperCase() + day.slice(1));
      }
    });

    const timeMatches = text.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/gi) || [];

    return {
      days: foundDays,
      times: timeMatches,
      raw: text,
      parsed: foundDays.length > 0 || timeMatches.length > 0
    };
  }

  private async sendConfirmationRequest(ctx: Context, rawText: string, parsed: any): Promise<void> {
    let interpretation = `**I understood:**\n`;

    if (parsed.days && parsed.days.length > 0) {
      interpretation += `📅 Days: ${parsed.days.join(', ')}\n`;
    }

    if (parsed.times && parsed.times.length > 0) {
      interpretation += `🕐 Times: ${parsed.times.join(', ')}\n`;
    }

    if ((!parsed.days || parsed.days.length === 0) && (!parsed.times || parsed.times.length === 0)) {
      interpretation += `I couldn't identify specific days or times. I'll record: "${rawText}"\n`;
    }

    interpretation += `\nIs this correct? Reply **"yes"** to confirm, or send corrected availability.`;

    await ctx.reply(interpretation, { parse_mode: 'Markdown' });
  }

  // Story 4.4: Helper method to detect vague responses
  private isVagueResponse(parsed: any, rawText: string): boolean {
    // If no days or times were parsed, it's vague
    const hasNoDays = !parsed.days || parsed.days.length === 0;
    const hasNoTimes = !parsed.times || parsed.times.length === 0;
    
    if (hasNoDays && hasNoTimes) {
      return true;
    }
    
    // Check for vague terms in the raw text
    const vagueTerms = [
      'sometime', 'whenever', 'anytime', 'soon', 'later', 
      'maybe', 'not sure', 'depends', 'flexible', 'whenever works',
      'any time', 'all day', 'whole day'
    ];
    
    const lowerText = rawText.toLowerCase();
    const containsVagueTerm = vagueTerms.some(term => lowerText.includes(term));
    
    // If only has days but no times, it's vague
    if (!hasNoDays && hasNoTimes) {
      return true;
    }
    
    // If contains vague terms, it's vague
    if (containsVagueTerm) {
      return true;
    }
    
    return false;
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
