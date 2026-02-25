import { Context } from 'telegraf';
import { OpenCodeNLUService } from './opencode-nlu.service';
import { ConsensusService, type ConsensusRepositories } from './consensus.service';
import {
  GroupRepository,
  MemberRepository,
  RoundRepository,
  ResponseRepository,
  NLUQueueRepository,
  NudgeRepository,
  ConsensusRepository
} from '../db';

export interface Repositories {
  groups: GroupRepository;
  members: MemberRepository;
  rounds: RoundRepository;
  responses: ResponseRepository;
  nluQueue: NLUQueueRepository;
  nudges: NudgeRepository;
  consensus: ConsensusRepository;
}

export class BotHandlers {
  private nluService: OpenCodeNLUService;
  private consensusService: ConsensusService;

  constructor(private repos: Repositories, nluService?: OpenCodeNLUService) {
    this.nluService = nluService || new OpenCodeNLUService();
    this.consensusService = new ConsensusService(repos);
  }

  async handleStart(ctx: Context): Promise<void> {
    const chat = ctx.chat;
    const user = ctx.from;
    if (!chat || !user) return;

    if (chat.type === 'private') {
      const payload = (ctx as any).startPayload as string | undefined;

      if (payload && payload.startsWith('optin_')) {
        const telegramGroupId = payload.replace('optin_', '');
        const group = await this.repos.groups.findByTelegramId(telegramGroupId);

        if (group) {
          await this.repos.members.optIn(user.id.toString(), group.id);
          await ctx.reply(`✅ Success! You have been opted-in to scheduling for the group: **${group.name}**.

You will now receive DMs when a new scheduling round starts.`);
          return;
        } else {
          await ctx.reply('❌ Sorry, I couldn\'t find that group. Make sure I\'ve been added to the group and /start has been used there.');
          return;
        }
      }

      await ctx.reply('Welcome! I\'m the Zins Community Bot. I help coordinate group schedules.\n\nTo use me:\n1. Add me to a Telegram group\n2. Use /start in that group\n3. Click the opt-in link I provide');
    } else {
      // Group chat - register the group
      const group = await this.repos.groups.findOrCreate(
        chat.id.toString(),
        chat.title || 'Unknown Group'
      );

      await ctx.reply(
        `🎉 Hello! I've registered **${group.name}** for scheduling.\n\n` +
        `Members can opt-in by clicking the button below to receive direct messages for availability.`,
        {
          reply_markup: {
            inline_keyboard: [
              [{
                text: '✅ Opt-In Now',
                url: `https://t.me/${ctx.botInfo.username}?start=optin_${chat.id}`
              }]
            ]
          }
        }
      );
    }
  }

  async handleStatus(ctx: Context): Promise<void> {
    const chat = ctx.chat;
    if (!chat || chat.type === 'private') {
      await ctx.reply('This command only works in group chats.');
      return;
    }

    const group = await this.repos.groups.findByTelegramId(chat.id.toString());
    if (!group) {
      await ctx.reply('This group is not registered. Use /start to register it.');
      return;
    }

    const { hasActiveRound, round } = await this.repos.rounds.getActiveStatus(group.id);
    const optedInCount = await this.repos.members.countOptedInByGroup(group.id);

    if (!hasActiveRound) {
      await ctx.reply('No active scheduling round in this group.');
      return;
    }

    await ctx.reply(
      `📅 Active Scheduling Round\n\n` +
      `Topic: ${round!.topic}\n` +
      `Started: ${round!.createdAt.toLocaleDateString()}\n` +
      `Opted-in members: ${optedInCount}`
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

    const group = await this.repos.groups.findOrCreate(
      chat.id.toString(),
      chat.title || 'Unknown Group'
    );

    const member = await this.repos.members.optIn(user.id.toString(), group.id);

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

    const group = await this.repos.groups.findByTelegramId(chat.id.toString());
    if (!group) {
      await ctx.reply('This group is not registered. Use /start to register it.');
      return;
    }

    // Check if user is opted-in
    const isOptedIn = await this.repos.members.isOptedIn(user.id.toString(), group.id);
    if (!isOptedIn) {
      await ctx.reply(
        `❌ @${user.username || user.first_name}, you must opt-in first before starting a scheduling round.\n` +
        `Use the opt-in button or message me directly.`
      );
      return;
    }

    // Check if there's already an active round
    const activeRound = await this.repos.rounds.findActiveByGroup(group.id);
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
    const round = await this.repos.rounds.create(group.id, parsed.topic, parsed.timeframe);

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
    const optedInMembers = await this.repos.members.findOptedInByGroup(groupId);

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
        timeframe: 'TBD' // Default timeframe since user no longer requires it
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

    const group = await this.repos.groups.findByTelegramId(chat.id.toString());
    if (!group) {
      await ctx.reply('This group is not registered. Use /start to register it.');
      return;
    }

    // Check if user is opted-in
    const isOptedIn = await this.repos.members.isOptedIn(user.id.toString(), group.id);
    if (!isOptedIn) {
      await ctx.reply(
        `❌ @${user.username || user.first_name}, you must opt-in first to cancel a scheduling round.\n` +
        `Use the opt-in button or message me directly.`
      );
      return;
    }

    // Check if there's an active round
    const activeRound = await this.repos.rounds.findActiveByGroup(group.id);
    if (!activeRound) {
      await ctx.reply('No active scheduling round to cancel in this group.');
      return;
    }

    // Cancel the round
    await this.repos.rounds.cancel(activeRound.id);

    await ctx.reply(
      `✅ **Scheduling Round Cancelled**\n\n` +
      `Topic: ${activeRound.topic}\n\n` +
      `The scheduling round has been cancelled by @${user.username || user.first_name}.`,
      { parse_mode: 'Markdown' }
    );
  }

  async handleMembers(ctx: Context): Promise<void> {
    const chat = ctx.chat;
    if (!chat || chat.type === 'private') {
      await ctx.reply('This command only works in group chats.');
      return;
    }

    const group = await this.repos.groups.findByTelegramId(chat.id.toString());
    if (!group) {
      await ctx.reply('This group is not registered. Use /start to register it.');
      return;
    }

    const { optedIn, notOptedIn } = await this.repos.members.getOptInStatusByGroup(group.id);

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

  async handleSettings(ctx: Context): Promise<void> {
    const chat = ctx.chat;
    if (!chat || chat.type === 'private') {
      await ctx.reply('This command only works in group chats.');
      return;
    }

    const group = await this.repos.groups.findByTelegramId(chat.id.toString());
    if (!group) {
      await ctx.reply('This group is not registered. Use /start to register it.');
      return;
    }

    const settings = await this.repos.groups.getNudgeSettings(group.id);

    await ctx.reply(
      `⚙️ **Group Settings**\n\n` +
      `**Nudge Interval:** ${settings.nudgeIntervalHours} hours\n` +
      `**Max Nudges:** ${settings.maxNudgeCount}\n\n` +
      `To change settings, contact an admin.`
    );
  }

  async handleHelp(ctx: Context): Promise<void> {
    const helpMessage = `🤖 **Zins Community Bot - Help**\n\n` +
      `I help groups find the best times to meet. Here are all available commands:\n\n` +
      `**Group Commands:**\n` +
      `/start - Register this group and see welcome message\n` +
      `/schedule <topic> - Start a new scheduling round\n` +
      `/cancel - Cancel the active scheduling round\n` +
      `/status - Check current scheduling round status\n` +
      `/members - List opted-in and not opted-in members\n` +
      `/settings - View and modify group settings\n\n` +
      `**Private Chat Commands:**\n` +
      `/help - Show this help message\n` +
      `/optin - Opt-in to receive scheduling DMs\n\n` +
      `**How it works:**\n` +
      `1️⃣ Add me to your group\n` +
      `2️⃣ Use /start in the group\n` +
      `3️⃣ Members opt-in by messaging me\n` +
      `4️⃣ Start scheduling with /schedule\n` +
      `5️⃣ I'll DM members for availability\n` +
      `6️⃣ We find the best time to meet!\n\n` +
      `Need help? Just ask!`;

    await ctx.reply(helpMessage, { parse_mode: 'Markdown' });
  }

  // Story 4.2, 4.3, 4.4: Handle availability responses with NLU parsing and confirmation
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

    // Story 4.3: Check if user has a pending confirmation
    const pendingResponse = await this.repos.responses.findPendingByUser(userId);

    if (pendingResponse) {
      // Story 4.3: User is responding to a confirmation request
      const normalizedText = messageText.toLowerCase().trim();

      if (normalizedText === 'yes' || normalizedText === 'y' || normalizedText === 'correct' || normalizedText === 'right') {
        // Story 4.3: Confirm the availability
        await this.repos.responses.confirm(pendingResponse.roundId, userId);
        
        // Story 6.1: Recalculate consensus immediately after confirmation
        const roundId = pendingResponse.roundId;
        const consensusResult = await this.consensusService.calculateConsensus(roundId);
        
        if (consensusResult.achieved) {
          // Story 6.1: Consensus achieved! Notify the user
          const timeSlot = consensusResult.timeSlot!;
          await ctx.reply(
            `🎉 **Great news!**\n\n` +
            `The meeting has been confirmed based on your availability and others':\n\n` +
            `📅 **${timeSlot.day}**\n` +
            `🕐 **${timeSlot.startTime} - ${timeSlot.endTime}**\n\n` +
            `(${Math.round(consensusResult.percentage)}% of members can attend)`,
            { parse_mode: 'Markdown' }
          );
          
          // Announce in the group chat
          await this.announceMeetingConfirmed(roundId, timeSlot, consensusResult.percentage);
        } else {
          await ctx.reply(
            `✅ **Availability Confirmed!**\n\n` +
            `Your availability has been recorded. Thank you!`,
            { parse_mode: 'Markdown' }
          );
        }
        return;
      } else {
        // Story 4.3: User is correcting their availability - re-parse and confirm again
        const parsedAvailability = await this.parseAvailabilityWithVagueCheck(messageText, pendingResponse.roundId, userId);
        await this.repos.responses.update(
          pendingResponse.roundId,
          userId,
          messageText,
          parsedAvailability
        );

        await this.sendConfirmationRequest(ctx, messageText, parsedAvailability);
        return;
      }
    }

    // Story 4.2: New availability response - find active round for this user
    const member = await this.findMemberWithActiveRound(userId);
    if (!member) {
      await ctx.reply(
        `❌ You don't have any active scheduling rounds.\n` +
        `Please wait for a scheduling round to start in your group.`
      );
      return;
    }

    // Story 4.4: Check for vague responses
    const parsedAvailability = await this.parseAvailabilityWithVagueCheck(messageText, member.roundId, userId);

    // Store the response
    await this.repos.responses.create(
      member.roundId,
      userId,
      messageText,
      parsedAvailability
    );

    // Story 4.3: Send confirmation request
    await this.sendConfirmationRequest(ctx, messageText, parsedAvailability);
  }

  // Story 4.4: Parse availability with vague response detection
  private async parseAvailabilityWithVagueCheck(
    text: string,
    roundId: string,
    userId: string
  ): Promise<any> {
    let parsedAvailability: any;

    try {
      const nluResult = await this.nluService.parseAvailability(text);

      if (nluResult.success && nluResult.parsed) {
        parsedAvailability = {
          slots: nluResult.parsed,
          isVague: nluResult.isVague,
          source: 'opencode'
        };

        // Story 4.4: Check if this is a vague response and track it
        if (nluResult.isVague) {
          const vagueCount = await this.repos.responses.countVagueResponses(userId, roundId);

          if (vagueCount >= 2) {
            // Too many vague responses - accept it anyway
            parsedAvailability.acceptedAnyway = true;
            parsedAvailability.vagueCount = vagueCount + 1;
          } else {
            parsedAvailability.vagueCount = vagueCount + 1;
            parsedAvailability.needsMoreSpecific = true;
          }
        }
      } else {
        // NLU returned but couldn't parse - use fallback
        parsedAvailability = this.parseNaturalLanguageAvailability(text);
        parsedAvailability.source = 'fallback';
        parsedAvailability.nluError = nluResult.error;
      }
    } catch (error) {
      // Story 4.5: API failure - queue for retry (NFR6)
      console.error('OpenCode API failure:', error);

      // Queue the request for retry
      await this.repos.nluQueue.queue(
        roundId,
        userId,
        text,
        error instanceof Error ? error.message : 'API unavailable'
      );

      // Use fallback parser for immediate response
      parsedAvailability = this.parseNaturalLanguageAvailability(text);
      parsedAvailability.source = 'fallback';
      parsedAvailability.nluError = error instanceof Error ? error.message : 'API unavailable';
      parsedAvailability.queuedForRetry = true;
    }

    return parsedAvailability;
  }

  private async findMemberWithActiveRound(userId: string): Promise<{ roundId: string; groupId: string } | null> {
    // Get all memberships for this user
    const memberships = await this.repos.members.findByUserId(userId);

    // Check each group for active rounds
    for (const membership of memberships) {
      const activeRound = await this.repos.rounds.findActiveByGroup(membership.groupId);
      if (activeRound) {
        return { roundId: activeRound.id, groupId: membership.groupId };
      }
    }

    return null;
  }

  private parseNaturalLanguageAvailability(text: string): any {
    // Simple mock parsing for demonstration
    // In production, this would use OpenCode NLU
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const foundDays: string[] = [];

    const lowerText = text.toLowerCase();
    days.forEach(day => {
      if (lowerText.includes(day)) {
        foundDays.push(day.charAt(0).toUpperCase() + day.slice(1));
      }
    });

    // Extract time patterns (simple regex)
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

    // Story 4.4: Add vague response warning if needed
    if (parsed.needsMoreSpecific) {
      interpretation += `\n⚠️ **Need more details:**\n`;
      interpretation += `Your response is a bit vague. Could you provide specific days and times?\n`;
      interpretation += `For example: "Tuesday and Thursday after 3pm"\n`;
    }

    if (parsed.queuedForRetry) {
      interpretation = `⏳ **Processing Delayed**\n\n`;
      interpretation += `I couldn't connect to the language processing service right now. `;
      interpretation += `I've saved your response and will process it automatically when the service is back.\n\n`;
      interpretation += `For now, here's what I understood using basic parsing:\n\n`;

      if (parsed.days && parsed.days.length > 0) {
        interpretation += `📅 Days: ${parsed.days.join(', ')}\n`;
      }
      if (parsed.times && parsed.times.length > 0) {
        interpretation += `🕐 Times: ${parsed.times.join(', ')}\n`;
      }
    }

    interpretation += `\nIs this correct? Reply **"yes"** to confirm, or send corrected availability.`;

    await ctx.reply(interpretation, { parse_mode: 'Markdown' });
  }

  // Story 6.1: Announce meeting confirmation in the group chat
  private async announceMeetingConfirmed(
    roundId: string,
    timeSlot: { day: string; startTime: string; endTime: string },
    percentage: number
  ): Promise<void> {
    try {
      const round = await this.repos.rounds.findById(roundId);
      if (!round) {
        console.error(`Cannot announce meeting: Round ${roundId} not found`);
        return;
      }

      const group = await this.repos.groups.findById(round.groupId);
      if (!group) {
        console.error(`Cannot announce meeting: Group ${round.groupId} not found`);
        return;
      }

      // Get the Telegram bot instance from somewhere - this is a placeholder
      // In a real implementation, we'd need access to the bot instance
      console.log(`[Story 6.1] Would announce in group ${group.telegramId}:`);
      console.log(`  Topic: ${round.topic}`);
      console.log(`  Time: ${timeSlot.day} ${timeSlot.startTime} - ${timeSlot.endTime}`);
      console.log(`  Consensus: ${Math.round(percentage)}%`);
      
      // The actual announcement would be:
      // await bot.telegram.sendMessage(group.telegramId, message, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Failed to announce meeting confirmation:', error);
    }
  }
}
