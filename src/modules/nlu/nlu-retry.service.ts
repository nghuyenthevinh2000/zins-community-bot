import { ResponseRepository, NLUQueueRepository } from '../../db';
import { OpenCodeNLUService } from './opencode-nlu.service';

export interface NLURetryRepositories {
  responses: ResponseRepository;
  nluQueue: NLUQueueRepository;
}

export class NLURetryService {
  private nluService: OpenCodeNLUService;
  private isRunning = false;
  private retryInterval: NodeJS.Timeout | null = null;

  constructor(
    private repos: NLURetryRepositories,
    private telegram: any
  ) {
    this.nluService = new OpenCodeNLUService();
  }

  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('NLU Retry Service started');
    
    // Check for pending requests every 30 seconds
    this.retryInterval = setInterval(() => {
      this.processPendingRequests();
    }, 30000);
    
    // Process immediately on start
    this.processPendingRequests();
  }

  stop(): void {
    this.isRunning = false;
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
      this.retryInterval = null;
    }
    console.log('NLU Retry Service stopped');
  }

  private async processPendingRequests(): Promise<void> {
    try {
      const pendingRequests = await this.repos.nluQueue.findPendingForRetry();
      
      if (pendingRequests.length === 0) return;
      
      console.log(`Processing ${pendingRequests.length} pending NLU requests`);
      
      for (const request of pendingRequests) {
        await this.processRequest(request);
        
        // Small delay between requests to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error('Error processing pending NLU requests:', error);
    }
  }

  private async processRequest(request: any): Promise<void> {
    const { id, roundId, userId, rawResponse, retryCount } = request;
    
    try {
      console.log(`Retrying NLU parse for user ${userId}, attempt ${retryCount + 1}`);
      
      // Try to parse with OpenCode
      const nluResult = await this.nluService.parseAvailability(rawResponse);
      
      if (nluResult.success && nluResult.parsed) {
        // Success! Update the availability response
        const parsedAvailability = {
          slots: nluResult.parsed,
          isVague: nluResult.isVague,
          source: 'opencode',
          retried: true,
          retryCount: retryCount + 1
        };
        
        // Update the existing availability response
        const existingResponse = await this.repos.responses.findByRoundAndUser(roundId, userId);
        if (existingResponse) {
          await this.repos.responses.update(
            roundId,
            userId,
            rawResponse,
            parsedAvailability
          );
        }
        
        // Mark the pending request as completed
        await this.repos.nluQueue.markCompleted(id);
        
        // Notify user of successful processing
        await this.notifyUserOfSuccess(userId, nluResult.parsed);
        
        console.log(`Successfully processed queued NLU request for user ${userId}`);
      } else {
        // Still failed - update retry count with exponential backoff
        const newRetryCount = retryCount + 1;
        
        if (newRetryCount >= 5) {
          // Max retries reached
          await this.repos.nluQueue.markFailed(id, nluResult.error || 'Max retries reached');
          console.log(`Max retries reached for user ${userId}`);
        } else {
          // Schedule next retry
          await this.repos.nluQueue.updateRetry(
            id,
            newRetryCount,
            nluResult.error || 'Parse unsuccessful'
          );
          console.log(`Scheduled retry ${newRetryCount} for user ${userId}`);
        }
      }
    } catch (error) {
      // API still down - update retry count
      const newRetryCount = retryCount + 1;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (newRetryCount >= 5) {
        await this.repos.nluQueue.markFailed(id, errorMessage);
        console.log(`Max retries reached for user ${userId} with error: ${errorMessage}`);
      } else {
        await this.repos.nluQueue.updateRetry(id, newRetryCount, errorMessage);
        console.log(`API still unavailable, scheduled retry ${newRetryCount} for user ${userId}`);
      }
    }
  }

  private async notifyUserOfSuccess(userId: string, parsedSlots: any[]): Promise<void> {
    try {
      let message = `✅ **Your availability has been processed!**\n\n`;
      message += `I was able to connect to the language service and re-parse your availability:\n\n`;
      
      if (parsedSlots.length > 0) {
        parsedSlots.forEach((slot, index) => {
          const start = new Date(slot.startTime).toLocaleString();
          const end = new Date(slot.endTime).toLocaleString();
          message += `${index + 1}. ${start} - ${end}\n`;
          if (slot.explanation) {
            message += `   _${slot.explanation}_\n`;
          }
        });
      } else {
        message += `I parsed your response but couldn't identify specific time slots.\n`;
      }
      
      message += `\nYour availability has been updated in the scheduling round.`;
      
      await this.telegram.sendMessage(userId, message, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error(`Failed to notify user ${userId} of successful processing:`, error);
    }
  }
}
