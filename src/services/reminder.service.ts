import { ReminderRepository, ResponseRepository, RoundRepository, GroupRepository, MemberRepository } from '../db';

export interface ReminderRepositories {
  reminders: ReminderRepository;
  responses: ResponseRepository;
  rounds: RoundRepository;
  groups: GroupRepository;
  members: MemberRepository;
}

export class ReminderService {
  private isRunning = false;
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly defaultReminderHours = 1; // Default: 1 hour before meeting

  constructor(
    private repos: ReminderRepositories,
    private telegram: any
  ) {}

  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    console.log('[ReminderService] Started - checking every minute');

    // Check for due reminders every minute
    this.checkInterval = setInterval(() => {
      this.processDueReminders();
    }, 60 * 1000); // Every minute

    // Process immediately on start
    this.processDueReminders();
  }

  stop(): void {
    this.isRunning = false;
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    console.log('[ReminderService] Stopped');
  }

  /**
   * Schedule reminders for a confirmed meeting
   * Story 6.5: Pre-meeting reminder DMs
   */
  async scheduleReminders(roundId: string, hoursBefore: number = this.defaultReminderHours): Promise<void> {
    try {
      // Get the confirmed time slot
      const round = await this.repos.rounds.findById(roundId);
      if (!round || round.status !== 'confirmed') {
        console.log(`[ReminderService] Cannot schedule reminders - round ${roundId} not confirmed`);
        return;
      }

      // Get consensus result with confirmed time slot
      const consensusResult = await this.repos.rounds.findById(roundId);
      if (!consensusResult) {
        console.log(`[ReminderService] Cannot schedule reminders - no consensus result for round ${roundId}`);
        return;
      }

      // Get all confirmed attendees (those who responded)
      const confirmedResponses = await this.repos.responses.findConfirmedByRound(roundId);
      const attendeeUserIds = confirmedResponses.map(r => r.userId);

      // Calculate reminder time (e.g., 1 hour before meeting)
      // Note: This is a simplified version. In production, you'd parse the actual meeting time
      const now = new Date();
      const reminderTime = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now for testing
      // In production: reminderTime = new Date(meetingTime.getTime() - hoursBefore * 60 * 60 * 1000);

      // Schedule reminder for each attendee
      for (const userId of attendeeUserIds) {
        await this.repos.reminders.create(roundId, userId, reminderTime, 'pre_meeting');
        console.log(`[ReminderService] Scheduled reminder for user ${userId} at ${reminderTime.toISOString()}`);
      }

      console.log(`[ReminderService] Scheduled ${attendeeUserIds.length} reminders for round ${roundId}`);
    } catch (error) {
      console.error('[ReminderService] Failed to schedule reminders:', error);
    }
  }

  /**
   * Process due reminders and send DMs
   */
  private async processDueReminders(): Promise<void> {
    try {
      const now = new Date();
      const dueReminders = await this.repos.reminders.findDueReminders(now);

      if (dueReminders.length === 0) {
        return;
      }

      console.log(`[ReminderService] Processing ${dueReminders.length} due reminders`);

      for (const reminder of dueReminders) {
        await this.sendReminder(reminder);

        // Rate limit: wait 1 second between messages (NFR8)
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error('[ReminderService] Error processing reminders:', error);
    }
  }

  /**
   * Send a reminder DM to a user
   */
  private async sendReminder(reminder: any): Promise<void> {
    try {
      const { round, userId } = reminder;
      
      if (!round || !round.consensusResult) {
        console.log(`[ReminderService] Cannot send reminder - missing round or consensus data`);
        return;
      }

      const timeSlot = round.consensusResult.confirmedTimeSlot as any;
      if (!timeSlot) {
        console.log(`[ReminderService] Cannot send reminder - no confirmed time slot`);
        return;
      }

      const message = `⏰ **Meeting Reminder**\n\n` +
        `**Topic:** ${round.topic}\n` +
        `**Group:** ${round.group.name}\n` +
        `**When:** ${timeSlot.day} at ${timeSlot.startTime}\n\n` +
        `See you there! 👋`;

      await this.telegram.sendMessage(userId, message, { parse_mode: 'Markdown' });

      // Mark reminder as sent
      await this.repos.reminders.markAsSent(reminder.id);

      console.log(`[ReminderService] Reminder sent to user ${userId} for round ${round.id}`);
    } catch (error) {
      console.error(`[ReminderService] Failed to send reminder to user ${reminder.userId}:`, error);
    }
  }

  /**
   * Manual trigger for testing
   */
  async triggerRemindersForRound(roundId: string): Promise<number> {
    const reminders = await this.repos.reminders.findByRound(roundId);
    let sentCount = 0;

    for (const reminder of reminders) {
      if (!reminder.sentAt) {
        await this.sendReminder(reminder);
        sentCount++;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return sentCount;
  }
}
