import {
  GroupRepository,
  MemberRepository,
  RoundRepository,
  ResponseRepository,
  ConsensusRepository,
  type TimeSlot,
  type ConsensusCalculation
} from '../db';

export interface ConsensusRepositories {
  groups: GroupRepository;
  members: MemberRepository;
  rounds: RoundRepository;
  responses: ResponseRepository;
  consensus: ConsensusRepository;
}

export class ConsensusService {
  constructor(private repos: ConsensusRepositories) {}

  /**
   * Calculate consensus after a new availability response is confirmed
   * Story 6.1: Incremental Consensus Calculation
   */
  async calculateConsensus(roundId: string): Promise<ConsensusCalculation> {
    // Get round details
    const round = await this.repos.rounds.findById(roundId);
    if (!round) {
      throw new Error('Round not found');
    }

    // Get group's consensus threshold
    const consensusThreshold = await this.getConsensusThreshold(round.groupId);

    // Get all confirmed responses for this round
    const confirmedResponses = await this.repos.responses.findConfirmedByRound(roundId);

    // Get total opted-in members count
    const totalOptedInCount = await this.repos.members.countOptedInByGroup(round.groupId);

    if (confirmedResponses.length === 0) {
      return {
        achieved: false,
        percentage: 0,
        respondersCount: 0,
        totalOptedInCount
      };
    }

    // Extract time slots from all responses
    const allTimeSlots = this.extractTimeSlots(confirmedResponses);

    // Calculate overlaps
    const overlappingSlots = this.calculateOverlaps(allTimeSlots);

    // Find the best slot that meets the threshold
    const bestSlot = this.findBestConsensusSlot(
      overlappingSlots,
      totalOptedInCount,
      consensusThreshold
    );

    if (bestSlot) {
      // Consensus achieved!
      const percentage = (bestSlot.userIds.length / totalOptedInCount) * 100;

      // Save the result
      await this.repos.consensus.updateAchieved(
        roundId,
        bestSlot,
        percentage,
        confirmedResponses.length,
        totalOptedInCount
      );

      // Mark round as confirmed
      await this.repos.rounds.confirm(roundId);

      return {
        achieved: true,
        timeSlot: bestSlot,
        percentage,
        respondersCount: confirmedResponses.length,
        totalOptedInCount
      };
    }

    // No consensus yet - save the best slots we found
    const sortedSlots = overlappingSlots.sort((a, b) => b.userIds.length - a.userIds.length);
    const topSlots = sortedSlots.slice(0, 3); // Keep top 3

    await this.repos.consensus.updateFailed(
      roundId,
      topSlots,
      confirmedResponses.length,
      totalOptedInCount
    );

    return {
      achieved: false,
      percentage: topSlots.length > 0
        ? (topSlots[0].userIds.length / totalOptedInCount) * 100
        : 0,
      respondersCount: confirmedResponses.length,
      totalOptedInCount,
      bestSlots: topSlots
    };
  }

  /**
   * Get consensus threshold for a group (default 75%)
   */
  async getConsensusThreshold(groupId: string): Promise<number> {
    const group = await this.repos.groups.findById(groupId);
    return group?.consensusThreshold ?? 75;
  }

  /**
   * Check if consensus has already been achieved for a round
   */
  async isConsensusAchieved(roundId: string): Promise<boolean> {
    return this.repos.consensus.isConsensusAchieved(roundId);
  }

  /**
   * Get current consensus status for a round
   */
  async getConsensusStatus(roundId: string): Promise<{
    achieved: boolean;
    confirmedTimeSlot?: TimeSlot;
    percentage?: number;
    respondersCount: number;
    totalOptedInCount: number;
  } | null> {
    const result = await this.repos.consensus.findByRound(roundId);
    if (!result) return null;

    return {
      achieved: result.status === 'achieved',
      confirmedTimeSlot: result.confirmedTimeSlot as TimeSlot | undefined,
      percentage: result.consensusPercentage ?? undefined,
      respondersCount: result.respondersCount ?? 0,
      totalOptedInCount: result.totalOptedInCount ?? 0
    };
  }

  /**
   * Extract time slots from availability responses
   */
  private extractTimeSlots(responses: any[]): TimeSlot[] {
    const slots: TimeSlot[] = [];

    for (const response of responses) {
      const userId = response.userId;
      const parsed = response.parsedAvailability as any;

      if (!parsed) continue;

      // Handle OpenCode NLU format (slots array)
      if (parsed.slots && Array.isArray(parsed.slots)) {
        for (const slot of parsed.slots) {
          if (slot.startTime && slot.endTime) {
            const start = new Date(slot.startTime);
            const end = new Date(slot.endTime);
            slots.push({
              day: start.toLocaleDateString('en-US', { weekday: 'long' }),
              startTime: start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
              endTime: end.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
              userIds: [userId]
            });
          }
        }
      }

      // Handle simple parsing format (days + times)
      if (parsed.days && parsed.times) {
        for (const day of parsed.days) {
          for (const time of parsed.times) {
            // Parse time to create start/end
            const timeStr = time as string;
            const match = timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
            if (match) {
              let hour = parseInt(match[1]);
              const minute = parseInt(match[2] || '0');
              const period = match[3]?.toLowerCase();

              if (period === 'pm' && hour !== 12) hour += 12;
              if (period === 'am' && hour === 12) hour = 0;

              const startTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
              const endHour = (hour + 1) % 24;
              const endTime = `${endHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;

              slots.push({
                day,
                startTime,
                endTime,
                userIds: [userId]
              });
            }
          }
        }
      }
    }

    return slots;
  }

  /**
   * Calculate overlapping time slots
   */
  private calculateOverlaps(slots: TimeSlot[]): TimeSlot[] {
    const overlaps: Map<string, TimeSlot> = new Map();

    // Group slots by day
    const byDay = new Map<string, TimeSlot[]>();
    for (const slot of slots) {
      if (!byDay.has(slot.day)) {
        byDay.set(slot.day, []);
      }
      byDay.get(slot.day)!.push(slot);
    }

    // Find overlaps within each day
    for (const [day, daySlots] of byDay) {
      for (let i = 0; i < daySlots.length; i++) {
        for (let j = i + 1; j < daySlots.length; j++) {
          const slot1 = daySlots[i];
          const slot2 = daySlots[j];

          // Check for time overlap
          if (this.timesOverlap(slot1, slot2)) {
            const overlapKey = `${day}_${slot1.startTime}_${slot1.endTime}`;
            const existing = overlaps.get(overlapKey);

            if (existing) {
              // Add unique user IDs
              for (const userId of slot1.userIds) {
                if (!existing.userIds.includes(userId)) {
                  existing.userIds.push(userId);
                }
              }
              for (const userId of slot2.userIds) {
                if (!existing.userIds.includes(userId)) {
                  existing.userIds.push(userId);
                }
              }
            } else {
              overlaps.set(overlapKey, {
                day,
                startTime: slot1.startTime,
                endTime: slot1.endTime,
                userIds: [...new Set([...slot1.userIds, ...slot2.userIds])]
              });
            }
          }
        }
      }
    }

    return Array.from(overlaps.values());
  }

  /**
   * Check if two time slots overlap
   */
  private timesOverlap(slot1: TimeSlot, slot2: TimeSlot): boolean {
    const start1 = this.timeToMinutes(slot1.startTime);
    const end1 = this.timeToMinutes(slot1.endTime);
    const start2 = this.timeToMinutes(slot2.startTime);
    const end2 = this.timeToMinutes(slot2.endTime);

    return start1 < end2 && end1 > start2;
  }

  /**
   * Convert time string to minutes for comparison
   */
  private timeToMinutes(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Find the best slot that meets the consensus threshold
   */
  private findBestConsensusSlot(
    slots: TimeSlot[],
    totalMembers: number,
    threshold: number
  ): TimeSlot | null {
    const minRequired = Math.ceil((threshold / 100) * totalMembers);

    // Sort by number of users (descending)
    const sorted = slots.sort((a, b) => b.userIds.length - a.userIds.length);

    // Find first slot that meets threshold
    for (const slot of sorted) {
      if (slot.userIds.length >= minRequired) {
        return slot;
      }
    }

    return null;
  }
}
