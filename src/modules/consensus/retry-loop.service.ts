import { Context } from 'telegraf';
import { RoundRepository, MemberRepository, ResponseRepository, NudgeRepository, ConsensusRepository } from '../../db';
import { ConsensusService, type ConsensusResult } from './consensus.service';

export interface NoConsensusResult {
  handled: boolean;
  action: 'retried' | 'max_retries_reached' | 'not_all_responded';
  message?: string;
}

export class RetryLoopService {
  private consensusService: ConsensusService;

  constructor(
    private repos: {
      rounds: RoundRepository;
      members: MemberRepository;
      responses: ResponseRepository;
      nudges: NudgeRepository;
      consensus: ConsensusRepository;
    }
  ) {
    this.consensusService = new ConsensusService(repos);
  }

  /**
   * Handle no-consensus scenario
   * Story 6.4: Retry Loop on No Consensus
   */
  async handleNoConsensus(roundId: string, bot: any): Promise<NoConsensusResult> {
    // Get round details
    const round = await this.repos.rounds.findById(roundId);
    if (!round || round.status !== 'active') {
      return { handled: false, action: 'not_all_responded' };
    }

    // Calculate current consensus state
    const consensus = await this.consensusService.calculateConsensus(roundId);
    
    // Check if all opted-in members have responded
    const allResponded = consensus.respondedMembers >= consensus.totalOptedInMembers;
    
    if (!allResponded) {
      return { handled: false, action: 'not_all_responded' };
    }

    if (consensus.hasConsensus) {
      return { handled: false, action: 'not_all_responded' };
    }

    // All members responded but no consensus
    const retryCount = round.retryCount || 0;
    const maxRetries = round.maxRetries || 2;

    if (retryCount >= maxRetries) {
      // Max retries reached - mark as no consensus
      await this.repos.rounds.markAsNoConsensus(roundId);
      
      // Notify group
      await this.notifyGroupNoConsensus(round, bot, true);
      
      return { 
        handled: true, 
        action: 'max_retries_reached',
        message: `Max retries (${maxRetries}) reached. Round marked as no consensus.`
      };
    }

    // Increment retry count
    await this.repos.rounds.resetForRetry(roundId);

    // Notify group that no consensus was reached and requesting alternative times
    await this.notifyGroupNoConsensus(round, bot, false);

    // Send DMs to all opted-in members requesting alternative availability
    await this.requestAlternativeAvailability(roundId, round, bot);

    return { 
      handled: true, 
      action: 'retried',
      message: `Retry ${retryCount + 1}/${maxRetries}: Requesting alternative availability.`
    };
  }

  /**
   * Check and handle no-consensus after each response
   * This should be called after availability confirmation
   */
  async checkAndHandleNoConsensus(roundId: string, bot: any): Promise<NoConsensusResult> {
    return this.handleNoConsensus(roundId, bot);
  }

  /**
   * Notify group that no consensus was reached
   */
  private async notifyGroupNoConsensus(
    round: any, 
    bot: any, 
    isFinal: boolean
  ): Promise<void> {
    const groupTelegramId = round.group.telegramId;
    
    let message: string;
    
    if (isFinal) {
      message = 
        `❌ **No Consensus Reached**\n\n` +
        `Topic: ${round.topic}\n\n` +
        `All members have responded ${round.maxRetries || 2} times, but no suitable time ` +
        `was found that meets the consensus threshold (${round.consensusThreshold || 75}%).\n\n` +
        `The scheduling round has been closed. You can start a new round with a different topic or timeframe.`;
    } else {
      const retryNum = (round.retryCount || 0) + 1;
      const maxRetries = round.maxRetries || 2;
      
      message = 
        `⚠️ **No Consensus Yet** (Attempt ${retryNum}/${maxRetries})\n\n` +
        `Topic: ${round.topic}\n\n` +
        `All members have responded, but no time slot meets the consensus threshold ` +
        `(${round.consensusThreshold || 75}%).\n\n` +
        `I'm sending DMs to everyone to request **alternative availability**. ` +
        `Please provide different days/times that might work better.`;
    }

    await bot.telegram.sendMessage(groupTelegramId, message, { parse_mode: 'Markdown' });
  }

  /**
   * Send DMs to all opted-in members requesting alternative availability
   */
  private async requestAlternativeAvailability(
    roundId: string, 
    round: any, 
    bot: any
  ): Promise<void> {
    // Get all opted-in members
    const optedInMembers = await this.repos.members.findOptedInByGroup(round.groupId);
    
    const retryNum = (round.retryCount || 0) + 1;
    const maxRetries = round.maxRetries || 2;

    for (const member of optedInMembers) {
      try {
        // Clear previous responses for this member so they can provide new availability
        // Note: We don't delete them, we just mark the round to accept new responses
        // The member can send a new message with different availability
        
        const message = 
          `🔄 **Alternative Availability Request** (${retryNum}/${maxRetries})\n\n` +
          `The group couldn't find a consensus for "${round.topic}" with the previous responses.\n\n` +
          `**Please provide alternative days and times** that might work for you. ` +
          `Consider:\n` +
          `• Different days of the week\n` +
          `• Different time ranges\n` +
          `• Backup options\n\n` +
          `Your previous response has been saved, but you can now provide additional availability.`;

        await bot.telegram.sendMessage(member.userId, message, { parse_mode: 'Markdown' });
        
        // Wait 1 second between DMs to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`[RetryLoopService] Failed to send DM to ${member.userId}:`, error);
      }
    }
  }

  /**
   * Get retry statistics for a round
   */
  async getRetryStats(roundId: string): Promise<{
    retryCount: number;
    maxRetries: number;
    canRetry: boolean;
  }> {
    const round = await this.repos.rounds.findById(roundId);
    if (!round) {
      return { retryCount: 0, maxRetries: 0, canRetry: false };
    }

    const retryCount = round.retryCount || 0;
    const maxRetries = round.maxRetries || 2;

    return {
      retryCount,
      maxRetries,
      canRetry: retryCount < maxRetries && round.status === 'active'
    };
  }
}
