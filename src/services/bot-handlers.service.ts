import { Context } from 'telegraf';
import { OpenCodeNLUService } from './opencode-nlu.service';
import { ConsensusService } from './consensus.service';
import { RetryLoopService } from './retry-loop.service';
import { ReminderService } from './reminder.service';
import {
  GroupRepository,
  MemberRepository,
  RoundRepository,
  ResponseRepository,
  NLUQueueRepository,
  NudgeRepository,
  ConsensusRepository,
  ReminderRepository
} from '../db';

export interface Repositories {
  groups: GroupRepository;
  members: MemberRepository;
  rounds: RoundRepository;
  responses: ResponseRepository;
  nluQueue: NLUQueueRepository;
  nudges: NudgeRepository;
  consensus: ConsensusRepository;
  reminders: ReminderRepository;
}

export class BotHandlers {
  private nluService: OpenCodeNLUService;
  private consensusService: ConsensusService;
  private retryLoopService: RetryLoopService;
  private reminderService: ReminderService;
  private bot: any; // Telegram bot instance for sending messages

  constructor(private repos: Repositories, nluService?: OpenCodeNLUService, bot?: any) {
    this.nluService = nluService || new OpenCodeNLUService();
    this.consensusService = new ConsensusService(repos);
    this.retryLoopService = new RetryLoopService({
      rounds: repos.rounds,
      members: repos.members,
      responses: repos.responses,
      nudges: repos.nudges,
      consensus: repos.consensus
    });
    this.reminderService = new ReminderService({
      reminders: repos.reminders,
      responses: repos.responses,
      rounds: repos.rounds,
      groups: repos.groups,
      members: repos.members
    }, bot?.telegram);
    this.bot = bot;
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
    if (!hasActiveRound || !round) {
      await ctx.reply('No active scheduling round in this group.');
      return;
    }

    const optedInMembers = await this.repos.members.findOptedInByGroup(group.id);
    const confirmedResponses = await this.repos.responses.findConfirmedByRound(round.id);
    
    const optedInCount = optedInMembers.length;
    const respondedCount = confirmedResponses.length;
    
    // Identify pending members
    const respondedUserIds = new Set(confirmedResponses.map(r => r.userId));
    const pendingMembers = optedInMembers.filter(m => !respondedUserIds.has(m.userId));

    // Get current consensus state
    const consensus = await this.consensusService.calculateConsensus(round.id);

    let message = `📅 **Scheduling Status**\n\n`;
    message += `**Topic:** ${round.topic}\n`;
    message += `**Started:** ${round.createdAt.toLocaleDateString()}\n\n`;
    
    message += `📊 **Progress:** ${respondedCount} of ${optedInCount} members responded\n`;
    
    if (pendingMembers.length > 0 && pendingMembers.length <= 10) {
      message += `⏳ **Pending:** ${pendingMembers.map(m => `User ${m.userId.substring(0, 4)}...`).join(', ')}\n`;
    } else if (pendingMembers.length > 10) {
      message += `⏳ **Pending:** ${pendingMembers.length} members\n`;
    } else {
      message += `✅ All opted-in members have responded!\n`;
    }

    message += `\n🤝 **Consensus State:**\n`;
    if (consensus.hasConsensus && consensus.timeSlot) {
      const timeStr = consensus.timeSlot.startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      message += `✅ Consensus reached: **${consensus.timeSlot.day} ${timeStr}** (${Math.round(consensus.timeSlot.agreementPercentage)}% agreement)`;
    } else {
      message += `⏳ No consensus yet. (Needs ${round.consensusThreshold || 75}% agreement)`;
    }

    await ctx.reply(message, { parse_mode: 'Markdown' });
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
      let topic = fullMatch[1]!.trim();
      let timeframe = fullMatch[2]!.trim();

      // Remove surrounding quotes from topic if they exist
      if ((topic.startsWith('"') && topic.endsWith('"')) || (topic.startsWith("'") && topic.endsWith("'"))) {
        topic = topic.slice(1, -1);
      }

      return { topic, timeframe };
    }

    // Fallback to just topic: /schedule "topic"
    const topicMatch = text.match(/^\/schedule\s+(.+)$/i);
    if (topicMatch) {
      let topic = topicMatch[1]!.trim();

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

    const user = ctx.from;
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
        `❌ @${user.username || user.first_name}, you must opt-in first to change group settings.\n` +
        `Use the opt-in button or message me directly.`
      );
      return;
    }

    const messageText = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    const args = messageText.split(' ').slice(1); // Remove command

    // Get current settings
    const settings = await this.repos.groups.getAllSettings(group.id);

    // If no arguments, show current settings with instructions
    if (args.length === 0) {
      await ctx.reply(
        `⚙️ **Group Settings** (Story 7.2)\n\n` +
        `**Current Settings:**\n` +
        `• Consensus Threshold: ${settings.consensusThreshold}%\n` +
        `  (Percentage of members needed to confirm a meeting)\n\n` +
        `• Nudge Interval: ${settings.nudgeIntervalHours} hours\n` +
        `  (Time between reminder messages)\n\n` +
        `• Max Nudges: ${settings.maxNudgeCount}\n` +
        `  (Maximum reminder messages per member)\n\n` +
        `**To modify settings:**\n` +
        `/settings threshold <50-100>\n` +
        `/settings interval <1-168>\n` +
        `/settings max_nudges <1-10>\n\n` +
        `**Examples:**\n` +
        `/settings threshold 60\n` +
        `/settings interval 12\n` +
        `/settings max_nudges 5`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Parse settings command
    if (args.length < 2) {
      await ctx.reply(
        `❌ Please provide a value.\n\n` +
        `**Usage:**\n` +
        `/settings threshold <50-100>\n` +
        `/settings interval <1-168>\n` +
        `/settings max_nudges <1-10>`
      );
      return;
    }

    const settingName = args[0].toLowerCase();
    const settingValue = parseInt(args[1], 10);

    if (isNaN(settingValue)) {
      await ctx.reply(
        `❌ Invalid value. Please provide a number.\n\n` +
        `**Usage:**\n` +
        `/settings threshold <50-100>\n` +
        `/settings interval <1-168>\n` +
        `/settings max_nudges <1-10>`
      );
      return;
    }

    // Validate and update settings based on the setting name
    const userIdentifier = user.username ? `@${user.username}` : `User ${user.id}`;
    
    switch (settingName) {
      case 'threshold':
        if (settingValue < 50 || settingValue > 100) {
          await ctx.reply(
            `❌ Invalid threshold. Must be between 50 and 100 percent.`
          );
          return;
        }

        await this.repos.groups.updateSettings(group.id, { consensusThreshold: settingValue });
        await ctx.reply(
          `✅ **Setting Updated**\n\n` +
          `Consensus threshold changed to ${settingValue}%.\n\n` +
          `Now at least ${settingValue}% of members must agree on a time ` +
          `for a meeting to be confirmed.`,
          { parse_mode: 'Markdown' }
        );
        
        // Broadcast change to group
        await this.broadcastSettingChange(
          group.telegramId,
          userIdentifier,
          'Consensus Threshold',
          `${settingValue}%`,
          'The percentage of members needed to confirm a meeting'
        );
        break;

      case 'interval':
        if (settingValue < 1 || settingValue > 168) {
          await ctx.reply(
            `❌ Invalid interval. Must be between 1 and 168 hours (1 week).`
          );
          return;
        }

        await this.repos.groups.updateSettings(group.id, { nudgeIntervalHours: settingValue });
        await ctx.reply(
          `✅ **Setting Updated**\n\n` +
          `Nudge interval changed to ${settingValue} hours.\n\n` +
          `Members will now be reminded every ${settingValue} hours ` +
          `if they haven't responded.`,
          { parse_mode: 'Markdown' }
        );
        
        // Broadcast change to group
        await this.broadcastSettingChange(
          group.telegramId,
          userIdentifier,
          'Nudge Interval',
          `${settingValue} hours`,
          'Time between reminder messages'
        );
        break;

      case 'max_nudges':
        if (settingValue < 1 || settingValue > 10) {
          await ctx.reply(
            `❌ Invalid count. Must be between 1 and 10.`
          );
          return;
        }

        await this.repos.groups.updateSettings(group.id, { maxNudgeCount: settingValue });
        await ctx.reply(
          `✅ **Setting Updated**\n\n` +
          `Maximum nudges changed to ${settingValue}.\n\n` +
          `The bot will send up to ${settingValue} reminders to non-responders.`,
          { parse_mode: 'Markdown' }
        );
        
        // Broadcast change to group
        await this.broadcastSettingChange(
          group.telegramId,
          userIdentifier,
          'Max Nudges',
          `${settingValue}`,
          'Maximum number of reminders per member'
        );
        break;

      default:
        await ctx.reply(
          `❌ Unknown setting: ${settingName}

` +
          `**Available settings:**
` +
          `• threshold - Consensus percentage (50-100%)
` +
          `• interval - Hours between nudges (1-168)
` +
          `• max_nudges - Maximum nudges (1-10)`
        );
    }
  }

  /**
   * Broadcast setting change to group chat
   * Identifies the user who made the change
   */
  private async broadcastSettingChange(
    groupTelegramId: string,
    userIdentifier: string,
    settingName: string,
    newValue: string,
    description: string
  ): Promise<void> {
    if (!this.bot) return;

    const broadcastMessage = 
      `🔧 **Group Setting Changed**

` +
      `Changed by: ${userIdentifier}

` +
      `**Setting:** ${settingName}
` +
      `**New Value:** ${newValue}
` +
      `**Description:** ${description}`;

    try {
      await this.bot.telegram.sendMessage(groupTelegramId, broadcastMessage, {
        parse_mode: 'Markdown'
      });
      console.log(`[Settings] Broadcast setting change to group ${groupTelegramId}: ${settingName} = ${newValue}`);
    } catch (error) {
      console.error(`[Settings] Failed to broadcast setting change to group ${groupTelegramId}:`, error);
    }
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
        await ctx.reply(
          `✅ **Availability Confirmed!**\n\n` +
          `Your availability has been recorded. Thank you!`,
          { parse_mode: 'Markdown' }
        );

        // Story 6.1 & 6.2: Check for consensus after each new response
        await this.checkAndAnnounceConsensus(pendingResponse.roundId);
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
    const weekdayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const foundDays: string[] = [];
    const lowerText = text.toLowerCase();
    const now = new Date();

    // Handle relative date terms: today, tomorrow, next week
    if (lowerText.includes('today')) {
      const name = weekdayNames[now.getDay()]!;
      foundDays.push(name.charAt(0).toUpperCase() + name.slice(1));
    }

    if (lowerText.includes('tomorrow')) {
      const tomorrow = new Date(now);
      tomorrow.setDate(now.getDate() + 1);
      const name = weekdayNames[tomorrow.getDay()]!;
      foundDays.push(name.charAt(0).toUpperCase() + name.slice(1));
    }

    if (lowerText.includes('next week')) {
      // Default to next Monday
      const nextMonday = new Date(now);
      const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
      nextMonday.setDate(now.getDate() + daysUntilMonday);
      foundDays.push('Monday');
    }

    // Handle named weekdays
    weekdayNames.forEach(day => {
      if (lowerText.includes(day)) {
        const capitalized = day.charAt(0).toUpperCase() + day.slice(1);
        if (!foundDays.includes(capitalized)) {
          foundDays.push(capitalized);
        }
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

  // Story 6.1 & 6.2: Check for consensus and announce meeting
  private async checkAndAnnounceConsensus(roundId: string): Promise<void> {
    try {
      // Calculate consensus
      const consensus = await this.consensusService.calculateConsensus(roundId);

      if (!consensus.hasConsensus || !consensus.timeSlot) {
        console.log(`[Consensus] No consensus yet for round ${roundId} (${consensus.respondedMembers}/${consensus.totalOptedInMembers} responded)`);

        // Story 6.4: Check if all members have responded but no consensus reached
        if (consensus.respondedMembers >= consensus.totalOptedInMembers && consensus.totalOptedInMembers > 0) {
          console.log(`[Consensus] All members responded but no consensus - triggering retry loop`);
          const retryResult = await this.retryLoopService.checkAndHandleNoConsensus(roundId, this.bot);
          if (retryResult.handled) {
            console.log(`[Consensus] Retry loop result: ${retryResult.action} - ${retryResult.message}`);
          }
        }
        return;
      }

      // Get round details for announcement
      const round = await this.repos.rounds.findById(roundId);
      if (!round || !this.bot) {
        console.log(`[Consensus] Cannot announce - round not found or bot not available`);
        return;
      }

      // Confirm the meeting
      const confirmed = await this.consensusService.confirmMeeting(roundId, consensus.timeSlot);
      if (!confirmed) {
        console.log(`[Consensus] Failed to confirm meeting for round ${roundId}`);
        return;
      }

      // Build announcement message
      const startTime = consensus.timeSlot.startTime;
      const attendeeCount = consensus.timeSlot.attendeeUserIds.length;
      const totalMembers = consensus.totalOptedInMembers;
      const agreementPct = Math.round(consensus.timeSlot.agreementPercentage);

      // Format the date and time nicely
      const dateStr = startTime.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric'
      });
      const timeStr = startTime.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });

      const announcement =
        `🎉 **Meeting Confirmed!**\n\n` +
        `**Topic:** ${round.topic}\n` +
        `**Date:** ${dateStr}\n` +
        `**Time:** ${timeStr}\n\n` +
        `**Attendees:** ${attendeeCount} of ${totalMembers} members (${agreementPct}% agreement)\n\n` +
        `The scheduling round has been closed. See you there!`;

      // Send announcement to the group
      const group = await this.repos.groups.findById(round.groupId);
      if (group) {
        await this.bot.telegram.sendMessage(group.telegramId, announcement, {
          parse_mode: 'Markdown'
        });
        console.log(`[Consensus] Meeting announced for round ${roundId} in group ${group.telegramId}`);

        // Story 6.5: Schedule pre-meeting reminders for confirmed attendees
        await this.reminderService.scheduleReminders(roundId, 1); // 1 hour before
      }

    } catch (error) {
      console.error('[Consensus] Error checking/announcing consensus:', error);
    }
  }
}
