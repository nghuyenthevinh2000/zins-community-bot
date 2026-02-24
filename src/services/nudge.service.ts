import { DatabaseService } from './database.service';

export interface NudgeConfig {
  nudgeIntervalHours: number;  // Default: 24 hours
  maxNudgeCount: number;      // Default: 3 nudges
}

export class NudgeService {
  private isRunning = false;
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly defaultConfig: NudgeConfig = {
    nudgeIntervalHours: 24,
    maxNudgeCount: 3
  };

  constructor(
    private db: DatabaseService,
    private telegram: any,
    private config: Partial<NudgeConfig> = {}
  ) {
    this.config = { ...this.defaultConfig, ...config };
  }

  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('Nudge Service started');
    console.log(`Config: interval=${this.config.nudgeIntervalHours}h, maxNudges=${this.config.maxNudgeCount}`);
    
    // Check for non-responders every hour
    this.checkInterval = setInterval(() => {
      this.checkAndNudgeNonResponders();
    }, 60 * 60 * 1000); // Every hour
    
    // Check immediately on start
    this.checkAndNudgeNonResponders();
  }

  stop(): void {
    this.isRunning = false;
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    console.log('Nudge Service stopped');
  }

  private async checkAndNudgeNonResponders(): Promise<void> {
    try {
      console.log('Checking for non-responders to nudge...');
      
      // Get all active rounds
      const activeRounds = await this.db.getPrisma().schedulingRound.findMany({
        where: { status: 'active' },
        include: { group: true }
      });

      for (const round of activeRounds) {
        await this.processRoundNudges(round);
      }
    } catch (error) {
      console.error('Error checking for non-responders:', error);
    }
  }

  private async processRoundNudges(round: any): Promise<void> {
    const roundId = round.id;
    const groupId = round.groupId;
    const topic = round.topic;
    
    // Get non-responders (opted-in members who haven't confirmed)
    const nonResponders = await this.db.getNonRespondersForRound(roundId, groupId);
    
    if (nonResponders.length === 0) {
      console.log(`Round ${roundId}: All members have responded`);
      return;
    }

    console.log(`Round ${roundId}: Found ${nonResponders.length} non-responders`);

    // Calculate the nudge window
    const nudgeIntervalMs = (this.config.nudgeIntervalHours || 24) * 60 * 60 * 1000;
    const now = Date.now();

    for (const member of nonResponders) {
      const userId = member.userId;
      
      // Get or create nudge tracking for this user
      const nudgeTracking = await this.db.getOrCreateNudgeTracking(roundId, userId);
      
      // Check if we've reached max nudges
      if (nudgeTracking.nudgeCount >= (this.config.maxNudgeCount || 3)) {
        console.log(`User ${userId}: Max nudges reached (${nudgeTracking.nudgeCount})`);
        continue;
      }

      // Check if it's time to nudge (respecting the interval)
      if (nudgeTracking.lastNudgeAt) {
        const lastNudgeTime = new Date(nudgeTracking.lastNudgeAt).getTime();
        const timeSinceLastNudge = now - lastNudgeTime;
        
        if (timeSinceLastNudge < nudgeIntervalMs) {
          // Too soon to nudge again
          const hoursRemaining = Math.ceil((nudgeIntervalMs - timeSinceLastNudge) / (60 * 60 * 1000));
          console.log(`User ${userId}: Next nudge in ${hoursRemaining} hours`);
          continue;
        }
      }

      // Send the nudge
      await this.sendNudge(userId, topic, nudgeTracking.nudgeCount + 1);
      
      // Update nudge tracking
      await this.db.incrementNudgeCount(roundId, userId);
      
      // Rate limit: wait 1 second between nudges (NFR8)
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  private async sendNudge(userId: string, topic: string, nudgeNumber: number): Promise<void> {
    try {
      let message = `📅 **Friendly Reminder**\n\n`;
      
      if (nudgeNumber === 1) {
        message += `Hi there! You have a pending scheduling request for:\n\n`;
      } else if (nudgeNumber === 2) {
        message += `Just checking in! You still haven't responded to:\n\n`;
      } else {
        message += `Final reminder! Please respond to:\n\n`;
      }
      
      message += `**Topic:** ${topic}\n\n`;
      message += `Please reply with your availability so we can find the best time to meet.\n\n`;
      message += `_Nudge ${nudgeNumber}/${this.config.maxNudgeCount}_`;

      await this.telegram.sendMessage(userId, message, { parse_mode: 'Markdown' });
      console.log(`Nudge #${nudgeNumber} sent to user ${userId} for topic: ${topic}`);
    } catch (error) {
      console.error(`Failed to send nudge to user ${userId}:`, error);
    }
  }

  // Manual trigger for testing
  async triggerNudgeForRound(roundId: string): Promise<void> {
    const round = await this.db.getPrisma().schedulingRound.findUnique({
      where: { id: roundId },
      include: { group: true }
    });

    if (!round || round.status !== 'active') {
      console.log(`Round ${roundId} not found or not active`);
      return;
    }

    await this.processRoundNudges(round);
  }
}
