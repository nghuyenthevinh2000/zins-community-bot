import { RoundRepository, ResponseRepository, MemberRepository, ConsensusRepository, GroupRepository } from '../db';
import { type TimeSlot } from '../db';

export interface ConsensusResult {
  hasConsensus: boolean;
  timeSlot?: TimeSlot;
  totalOptedInMembers: number;
  respondedMembers: number;
}

export class ConsensusService {
  constructor(private repos: {
    rounds: RoundRepository;
    responses: ResponseRepository;
    members: MemberRepository;
    consensus: ConsensusRepository;
    groups: GroupRepository;
  }) { }

  /**
   * Calculate consensus for a scheduling round
   * Story 6.1: Incremental consensus calculation
   */
  async calculateConsensus(roundId: string): Promise<ConsensusResult> {
    // Get round details
    const round = await this.repos.rounds.findById(roundId);
    if (!round || round.status !== 'active') {
      return {
        hasConsensus: false,
        totalOptedInMembers: 0,
        respondedMembers: 0
      };
    }

    // Get all opted-in members for this group
    const optedInMembers = await this.repos.members.findOptedInByGroup(round.groupId);
    const totalOptedInMembers = optedInMembers.length;

    if (totalOptedInMembers === 0) {
      return {
        hasConsensus: false,
        totalOptedInMembers: 0,
        respondedMembers: 0
      };
    }

    // Get all confirmed responses for this round
    const confirmedResponses = await this.repos.responses.findConfirmedByRound(roundId);
    const respondedMembers = confirmedResponses.length;

    if (respondedMembers === 0) {
      return {
        hasConsensus: false,
        totalOptedInMembers,
        respondedMembers: 0
      };
    }

    // Calculate time slots with attendee overlap
    console.log(`[Consensus] ${respondedMembers} confirmed responses. Confirmed responses:`, JSON.stringify(confirmedResponses.map(r => ({ userId: r.userId, parsedAvailability: r.parsedAvailability })), null, 2));
    const timeSlots = this.calculateTimeSlots(confirmedResponses, totalOptedInMembers);
    console.log(`[Consensus] Calculated ${timeSlots.length} time slots:`, JSON.stringify(timeSlots.map(s => ({ day: s.day, agreementPercentage: s.agreementPercentage, attendees: s.attendeeUserIds }))));

    // Find best time slot that meets threshold
    const threshold = await this.getConsensusThreshold(round.groupId);
    const winningSlot = this.findBestTimeSlot(timeSlots, threshold);

    if (winningSlot) {
      // Save the result
      await this.repos.consensus.updateAchieved(
        roundId,
        winningSlot,
        winningSlot.agreementPercentage,
        respondedMembers,
        totalOptedInMembers
      );

      return {
        hasConsensus: true,
        timeSlot: winningSlot,
        totalOptedInMembers,
        respondedMembers
      };
    }

    // Not enough consensus yet - save the best slots
    const sortedSlots = timeSlots.sort((a, b) => b.attendeeUserIds.length - a.attendeeUserIds.length);
    const topSlots = sortedSlots.slice(0, 3);
    await this.repos.consensus.updateFailed(
      roundId,
      topSlots,
      respondedMembers,
      totalOptedInMembers
    );

    return {
      hasConsensus: false,
      totalOptedInMembers,
      respondedMembers
    };
  }

  /**
   * Get consensus threshold for a group (default 75%)
   */
  async getConsensusThreshold(groupId: string): Promise<number> {
    try {
      return await this.repos.groups.getConsensusThreshold(groupId);
    } catch (error) {
      console.error(`[ConsensusService] Error fetching threshold for group ${groupId}:`, error);
      return 75; // Default fallback
    }
  }
  /**
   * Calculate time slots from availability responses
   * Groups by day and aggregates users who are available on that day
   */
  private calculateTimeSlots(
    responses: any[],
    totalOptedInMembers: number
  ): TimeSlot[] {
    const dayMap = new Map<string, { day: string; userIds: Set<string>; preferredTimes: Set<string> }>();

    for (const response of responses) {
      const parsed = response.parsedAvailability as any;
      if (!parsed) continue;

      if (parsed.slots && Array.isArray(parsed.slots) && parsed.slots.length > 0) {
        for (const slot of parsed.slots) {
          if (!slot.startTime) continue;

          const start = new Date(slot.startTime);
          if (isNaN(start.getTime())) continue;

          const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          const dayName = days[start.getDay()];
          if (!dayName) continue;

          const dayKey = dayName.toLowerCase();

          if (!dayMap.has(dayKey)) {
            dayMap.set(dayKey, { day: dayName, userIds: new Set(), preferredTimes: new Set() });
          }
          const slotEntry = dayMap.get(dayKey)!;
          slotEntry.userIds.add(response.userId);
          // Capture the specific time from the NLU slot
          if (slot.startTime) {
            const startDate = new Date(slot.startTime);
            const hour = startDate.getHours();
            const period = hour >= 12 ? 'pm' : 'am';
            const displayHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
            slotEntry.preferredTimes.add(`${displayHour}${period}`);
          }
        }
      }

      if (parsed.days && Array.isArray(parsed.days) && parsed.days.length > 0) {
        // For each day in the response, add user to that day's set
        for (const day of parsed.days) {
          const dayKey = day.toLowerCase();

          if (!dayMap.has(dayKey)) {
            dayMap.set(dayKey, { day, userIds: new Set(), preferredTimes: new Set() });
          }

          const dayEntry = dayMap.get(dayKey)!;
          dayEntry.userIds.add(response.userId);
          // Capture any user-specified times from the fallback parser
          if (parsed.times && Array.isArray(parsed.times)) {
            for (const t of parsed.times) {
              if (typeof t === 'string' && t.trim()) {
                dayEntry.preferredTimes.add(t.trim());
              }
            }
          }
        }
      }
    }

    // Convert to TimeSlot array with agreement percentages
    return Array.from(dayMap.values()).map(dayData => {
      // Use the preferred time from responses if available, otherwise default to 9am
      const preferredTime = dayData.preferredTimes.size > 0
        ? Array.from(dayData.preferredTimes)[0]!
        : '9am';
      const startTime = this.parseDayToDate(dayData.day, preferredTime);
      const endTime = this.parseDayToDate(dayData.day, '6pm');

      return {
        day: dayData.day,
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

    return qualifyingSlots[0] || null;
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

      console.log(`[ConsensusService] Confirming meeting for round ${roundId}`);
      // Assuming we have roundRepo here - in actual implementation we inject it
      await this.repos.rounds.confirmWithTimeSlot(roundId, {
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
      let hour = parseInt(match[1] || '0', 10);
      const period = match[2];

      if (period === 'pm' && hour !== 12) hour += 12;
      if (period === 'am' && hour === 12) hour = 0;

      return hour;
    }

    return 9; // Default to 9am
  }
}
