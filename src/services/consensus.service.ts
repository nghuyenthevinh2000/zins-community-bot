import { RoundRepository } from '../db/round-repository';
import { ResponseRepository } from '../db/response-repository';
import { MemberRepository } from '../db/member-repository';

export interface TimeSlot {
  startTime: Date;
  endTime: Date;
  attendeeUserIds: string[];
  agreementPercentage: number;
}

export interface ConsensusResult {
  hasConsensus: boolean;
  timeSlot?: TimeSlot;
  totalOptedInMembers: number;
  respondedMembers: number;
}

export class ConsensusService {
  private roundRepo: RoundRepository;
  private responseRepo: ResponseRepository;
  private memberRepo: MemberRepository;

  constructor() {
    this.roundRepo = new RoundRepository();
    this.responseRepo = new ResponseRepository();
    this.memberRepo = new MemberRepository();
  }

  /**
   * Calculate consensus for a scheduling round
   * Story 6.1: Incremental consensus calculation
   */
  async calculateConsensus(roundId: string): Promise<ConsensusResult> {
    // Get round details
    const round = await this.roundRepo.findById(roundId);
    if (!round || round.status !== 'active') {
      return {
        hasConsensus: false,
        totalOptedInMembers: 0,
        respondedMembers: 0
      };
    }

    // Get all opted-in members for this group
    const optedInMembers = await this.memberRepo.findOptedInByGroup(round.groupId);
    const totalOptedInMembers = optedInMembers.length;

    if (totalOptedInMembers === 0) {
      return {
        hasConsensus: false,
        totalOptedInMembers: 0,
        respondedMembers: 0
      };
    }

    // Get all confirmed responses for this round
    const confirmedResponses = await this.responseRepo.findConfirmedByRound(roundId);
    const respondedMembers = confirmedResponses.length;

    if (respondedMembers === 0) {
      return {
        hasConsensus: false,
        totalOptedInMembers,
        respondedMembers: 0
      };
    }

    // Calculate time slots with attendee overlap
    const timeSlots = this.calculateTimeSlots(confirmedResponses, totalOptedInMembers);

    // Find best time slot that meets threshold
    const threshold = round.consensusThreshold || 75;
    const winningSlot = this.findBestTimeSlot(timeSlots, threshold);

    if (winningSlot) {
      return {
        hasConsensus: true,
        timeSlot: winningSlot,
        totalOptedInMembers,
        respondedMembers
      };
    }

    return {
      hasConsensus: false,
      totalOptedInMembers,
      respondedMembers
    };
  }

  /**
   * Calculate time slots from availability responses
   * Groups by day and aggregates users who are available on that day
   */
  private calculateTimeSlots(
    responses: any[],
    totalOptedInMembers: number
  ): TimeSlot[] {
    const dayMap = new Map<string, { day: string; userIds: Set<string> }>();

    for (const response of responses) {
      const parsed = response.parsedAvailability as any;
      if (!parsed || !parsed.days || parsed.days.length === 0) continue;

      // For each day in the response, add user to that day's set
      for (const day of parsed.days) {
        const dayKey = day.toLowerCase();
        
        if (!dayMap.has(dayKey)) {
          dayMap.set(dayKey, { day, userIds: new Set() });
        }
        
        dayMap.get(dayKey)!.userIds.add(response.userId);
      }
    }

    // Convert to TimeSlot array with agreement percentages
    return Array.from(dayMap.values()).map(dayData => {
      // Calculate time range for this day (9am - 6pm default)
      const startTime = this.parseDayToDate(dayData.day, '9am');
      const endTime = this.parseDayToDate(dayData.day, '6pm');
      
      return {
        startTime,
        endTime,
        attendeeUserIds: Array.from(dayData.userIds),
        agreementPercentage: (dayData.userIds.size / totalOptedInMembers) * 100
      };
    });
  }

  /**
   * Find the best time slot that meets the consensus threshold
   * Story 6.3: Optimal time slot selection
   */
  private findBestTimeSlot(timeSlots: TimeSlot[], threshold: number): TimeSlot | null {
    // Filter slots that meet threshold
    const qualifyingSlots = timeSlots.filter(slot => slot.agreementPercentage >= threshold);

    if (qualifyingSlots.length === 0) {
      return null;
    }

    // Sort by agreement percentage (descending), then by earliest start time
    qualifyingSlots.sort((a, b) => {
      if (b.agreementPercentage !== a.agreementPercentage) {
        return b.agreementPercentage - a.agreementPercentage;
      }
      return a.startTime.getTime() - b.startTime.getTime();
    });

    return qualifyingSlots[0];
  }

  /**
   * Confirm a meeting for a round
   * Story 6.2: Meeting confirmation
   */
  async confirmMeeting(roundId: string, timeSlot: TimeSlot): Promise<boolean> {
    try {
      // Check if meeting is at least 30 minutes in the future (FR24)
      const now = new Date();
      const thirtyMinutesFromNow = new Date(now.getTime() + 30 * 60 * 1000);
      
      if (timeSlot.startTime < thirtyMinutesFromNow) {
        console.log(`[ConsensusService] Cannot confirm meeting - starts in less than 30 minutes`);
        return false;
      }

      // Update round with confirmed time slot
      await this.roundRepo.confirmWithTimeSlot(roundId, {
        startTime: timeSlot.startTime,
        endTime: timeSlot.endTime,
        attendeeCount: timeSlot.attendeeUserIds.length,
        attendeeUserIds: timeSlot.attendeeUserIds,
        agreementPercentage: timeSlot.agreementPercentage
      });

      return true;
    } catch (error) {
      console.error('[ConsensusService] Failed to confirm meeting:', error);
      return false;
    }
  }

  /**
   * Get slot key for deduplication
   */
  private getSlotKey(day: string, times: string[] | undefined): string {
    const timeStr = times && times.length > 0 ? times.join('-') : 'allday';
    return `${day.toLowerCase()}-${timeStr}`;
  }

  /**
   * Parse day and time to a Date object
   */
  private parseDayToDate(day: string, time: string): Date {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayIndex = days.indexOf(day.toLowerCase());
    
    if (dayIndex === -1) {
      return new Date();
    }

    const now = new Date();
    const currentDay = now.getDay();
    let daysUntil = dayIndex - currentDay;
    if (daysUntil < 0) daysUntil += 7;
    if (daysUntil === 0 && this.parseTimeToHour(time) <= now.getHours()) {
      daysUntil = 7; // Next week if time has passed today
    }

    const targetDate = new Date(now);
    targetDate.setDate(now.getDate() + daysUntil);
    targetDate.setHours(this.parseTimeToHour(time), 0, 0, 0);
    
    return targetDate;
  }

  /**
   * Parse time string to hour
   */
  private parseTimeToHour(time: string): number {
    const lower = time.toLowerCase();
    
    if (lower.includes('morning')) return 9;
    if (lower.includes('afternoon')) return 14;
    if (lower.includes('evening')) return 18;
    if (lower.includes('night')) return 20;
    
    // Try to parse numeric time
    const match = lower.match(/(\d{1,2})(?::\d{2})?\s*(am|pm)?/);
    if (match) {
      let hour = parseInt(match[1], 10);
      const period = match[2];
      
      if (period === 'pm' && hour !== 12) hour += 12;
      if (period === 'am' && hour === 12) hour = 0;
      
      return hour;
    }
    
    return 9; // Default to 9am
  }
}
