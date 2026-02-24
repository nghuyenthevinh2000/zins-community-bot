import { Context } from 'telegraf';
import { DatabaseService } from './database.service';

export interface NudgeMessage {
  userId: string;
  roundId: string;
  topic: string;
  nudgeNumber: number;
  maxNudges: number;
}

export class NudgeService {
  constructor(private db: DatabaseService) {}

  /**
   * Process nudges for a scheduling round
   * This should be called periodically (e.g., by a cron job)
   */
  async processNudges(roundId: string, bot: any): Promise<{
    nudgesSent: number;
    usersSkipped: number;
    errors: string[];
  }> {
    const result = {
      nudgesSent: 0,
      usersSkipped: 0,
      errors: [] as string[]
    };

    try {
      // Get round details
      const round = await this.db.getPrisma().schedulingRound.findUnique({
        where: { id: roundId },
        include: { group: true }
      });

      if (!round || round.status !== 'active') {
        return { ...result, errors: ['Round not found or not active'] };
      }

      // Get nudge settings
      const settings = await this.db.getNudgeSettings(round.groupId);

      // Get non-responders
      const nonResponders = await this.db.getNonResponders(roundId);

      for (const userId of nonResponders) {
        try {
          // Check if we should send nudge
          const nudgeCheck = await this.db.shouldSendNudge(round.groupId, roundId, userId);
          
          if (!nudgeCheck.shouldSend) {
            result.usersSkipped++;
            continue;
          }

          // Get current nudge count
          const currentNudgeCount = await this.db.getNudgeCountForUser(round.groupId, roundId, userId);
          const nudgeNumber = currentNudgeCount + 1;

          // Send nudge message
          await this.sendNudgeMessage(bot, userId, {
            userId,
            roundId,
            topic: round.topic,
            nudgeNumber,
            maxNudges: settings.maxNudgeCount
          });

          // Record the nudge
          await this.db.recordNudge(round.groupId, roundId, userId, nudgeNumber);

          result.nudgesSent++;

          // Rate limiting: wait 1 second between nudges to respect Telegram limits
          await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          result.errors.push(`Failed to nudge user ${userId}: ${errorMsg}`);
        }
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Failed to process nudges: ${errorMsg}`);
    }

    return result;
  }

  private async sendNudgeMessage(
    bot: any, 
    userId: string, 
    message: NudgeMessage
  ): Promise<void> {
    const { topic, nudgeNumber, maxNudges } = message;

    // Build nudge message based on nudge number
    let nudgeText = '';
    
    if (nudgeNumber === 1) {
      nudgeText = 
        `👋 **Friendly Reminder**\n\n` +
        `You haven't responded to the scheduling request for "${topic}" yet.\n\n` +
        `Please let me know your availability so we can find the best time for everyone!`;
    } else if (nudgeNumber === 2) {
      nudgeText = 
        `⏰ **Second Reminder**\n\n` +
        `Still waiting for your availability for "${topic}".\n\n` +
        `The group is trying to schedule - your input helps us find the best time!`;
    } else if (nudgeNumber >= 3) {
      nudgeText = 
        `⚠️ **Final Reminder (${nudgeNumber}/${maxNudges})**\n\n` +
        `This is reminder ${nudgeNumber} of ${maxNudges} for "${topic}".\n\n` +
        `Please respond with your availability, or you may be excluded from this meeting.`;
    }

    await bot.telegram.sendMessage(userId, nudgeText, { parse_mode: 'Markdown' });
  }

  /**
   * Get nudge statistics for a round
   */
  async getNudgeStats(roundId: string): Promise<{
    totalNudgesSent: number;
    uniqueUsersNudged: number;
    averageNudgesPerUser: number;
  }> {
    const nudges = await this.db.getPrisma().nudgeHistory.findMany({
      where: { roundId }
    });

    const uniqueUsers = new Set(nudges.map(n => n.userId));
    
    return {
      totalNudgesSent: nudges.length,
      uniqueUsersNudged: uniqueUsers.size,
      averageNudgesPerUser: uniqueUsers.size > 0 
        ? nudges.length / uniqueUsers.size 
        : 0
    };
  }

  /**
   * Check if nudging is complete for a round (all non-responders have reached max nudges)
   */
  async isNudgingComplete(roundId: string): Promise<boolean> {
    const round = await this.db.getPrisma().schedulingRound.findUnique({
      where: { id: roundId },
      include: { group: true }
    });

    if (!round) return true;

    const settings = await this.db.getNudgeSettings(round.groupId);
    const nonResponders = await this.db.getNonResponders(roundId);

    if (nonResponders.length === 0) return true;

    // Check if all non-responders have received max nudges
    for (const userId of nonResponders) {
      const nudgeCount = await this.db.getNudgeCountForUser(round.groupId, roundId, userId);
      if (nudgeCount < settings.maxNudgeCount) {
        return false;
      }
    }

    return true;
  }
}
