import { Context } from 'telegraf';
import { GroupRepository } from './db/group-repository';
import { MemberRepository } from './db/member-repository';

export interface GroupRepositories {
  groups: GroupRepository;
  members: MemberRepository;
}

export class GroupService {
  constructor(
    private repos: GroupRepositories,
    private telegram: any // Telegraf telegram instance for broadcastSettingChange
  ) {}

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

    const settingName = args[0]!.toLowerCase();
    const settingValue = parseInt(args[1]!, 10);

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
          `❌ Unknown setting: ${settingName}\n\n` +
          `**Available settings:**\n` +
          `• threshold - Consensus percentage (50-100%)\n` +
          `• interval - Hours between nudges (1-168)\n` +
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
    if (!this.telegram) return;

    const broadcastMessage =
      `🔧 **Group Setting Changed**\n\n` +
      `Changed by: ${userIdentifier}\n\n` +
      `**Setting:** ${settingName}\n` +
      `**New Value:** ${newValue}\n` +
      `**Description:** ${description}`;

    try {
      await this.telegram.sendMessage(groupTelegramId, broadcastMessage, {
        parse_mode: 'Markdown'
      });
      console.log(`[Settings] Broadcast setting change to group ${groupTelegramId}: ${settingName} = ${newValue}`);
    } catch (error) {
      console.error(`[Settings] Failed to broadcast setting change to group ${groupTelegramId}:`, error);
    }
  }
}
