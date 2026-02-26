import { ReminderRepository, ResponseRepository, RoundRepository, GroupRepository, MemberRepository } from '../../db';

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
      // Get the confirmed round details
      const round = await this.repos.rounds.findById(roundId);
      if (!round || round.status !== 'confirmed') {
        console.log(`[ReminderService] Cannot schedule reminders - round ${roundId} not confirmed`);
        return;
      }

      // Get confirmed time slot from round or consensusResult
      const timeSlot = (round.confirmedTimeSlot as any) || (await this.getConsensusTimeSlot(roundId));
      if (!timeSlot || !timeSlot.startTime) {
        console.log(`[ReminderService] Cannot schedule reminders - no confirmed time slot for round ${roundId}`);
        return;
      }

      const meetingStartTime = new Date(timeSlot.startTime);

      // Get all confirmed attendees (those who were part of the winning slot)
      const attendeeUserIds = timeSlot.attendeeUserIds || [];
      if (attendeeUserIds.length === 0) {
        console.log(`[ReminderService] No attendees to schedule reminders for in round ${roundId}`);
        return;
      }

      // Calculate reminder time
      const reminderTime = new Date(meetingStartTime.getTime() - hoursBefore * 60 * 60 * 1000);

      // Don't schedule if reminder time is in the past
      if (reminderTime < new Date()) {
        console.log(`[ReminderService] Reminder time ${reminderTime.toISOString()} is in the past, skipping scheduling`);
        return;
      }

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

  private async getConsensusTimeSlot(roundId: string): Promise<any | null> {
    const roundWithConsensus = await this.repos.rounds.findById(roundId);
    // Assuming consensusResult is included in findById or we fetch it separately
    // The current round repo findById includes group but not consensusResult in the return type
    // but Prisma might have it if we added it to schema
    const anyRound = roundWithConsensus as any;
    return anyRound?.consensusResult?.confirmedTimeSlot || null;
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
      
      if (!round) {
        console.log(`[ReminderService] Cannot send reminder - missing round data`);
        return;
      }

      const timeSlot = (round.confirmedTimeSlot as any) || round.consensusResult?.confirmedTimeSlot;
      if (!timeSlot) {
        console.log(`[ReminderService] Cannot send reminder - no confirmed time slot`);
        return;
      }

      const meetingDate = new Date(timeSlot.startTime);
      const dateStr = meetingDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
      const timeStr = meetingDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

      const message = `⏰ **Meeting Reminder**\n\n` +
        `**Topic:** ${round.topic}\n` +
        `**Group:** ${round.group?.name || 'Unknown Group'}\n` +
        `**When:** ${dateStr} at ${timeStr}\n\n` +
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
