import { DatabaseService } from './database.service';
import { NudgeService } from './nudge.service';

export class NudgeSchedulerService {
  private intervalId: NodeJS.Timeout | null = null;
  private nudgeService: NudgeService;
  private bot: any;

  constructor(
    private db: DatabaseService,
    bot: any
  ) {
    this.nudgeService = new NudgeService(db);
    this.bot = bot;
  }

  /**
   * Start the nudge scheduler
   * Runs every hour to check for and send nudges
   */
  start(): void {
    // Run immediately on start
    this.processNudges();
    
    // Then run every hour
    this.intervalId = setInterval(() => {
      this.processNudges();
    }, 60 * 60 * 1000); // Every hour

    console.log('[NudgeScheduler] Started - checking every hour');
  }

  /**
   * Stop the nudge scheduler
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[NudgeScheduler] Stopped');
    }
  }

  /**
   * Process nudges for all active rounds
   */
  private async processNudges(): Promise<void> {
    try {
      // Find all active scheduling rounds
      const activeRounds = await this.db.getPrisma().schedulingRound.findMany({
        where: { status: 'active' },
        include: { group: true }
      });

      if (activeRounds.length === 0) {
        return;
      }

      console.log(`[NudgeScheduler] Processing nudges for ${activeRounds.length} active rounds`);

      for (const round of activeRounds) {
        try {
          const result = await this.nudgeService.processNudges(round.id, this.bot);
          
          if (result.nudgesSent > 0) {
            console.log(`[NudgeScheduler] Sent ${result.nudgesSent} nudges for round ${round.id} (${round.topic})`);
          }
          
          if (result.errors.length > 0) {
            console.error(`[NudgeScheduler] Errors for round ${round.id}:`, result.errors);
          }
        } catch (error) {
          console.error(`[NudgeScheduler] Failed to process nudges for round ${round.id}:`, error);
        }
      }
    } catch (error) {
      console.error('[NudgeScheduler] Failed to process nudges:', error);
    }
  }
}
