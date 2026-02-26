import { type PrismaClient, type Reminder, type SchedulingRound, type Group, type ConsensusResult } from '@prisma/client';
import { getPrismaClient } from '../../../core/db/client';

export type ReminderWithFoundRound = Reminder & {
  round: SchedulingRound & {
    group: Group;
    consensusResult: ConsensusResult | null;
  };
};

export class ReminderRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = getPrismaClient();
  }

  async create(roundId: string, userId: string, scheduledFor: Date, type: string = 'pre_meeting'): Promise<Reminder> {
    return this.prisma.reminder.create({
      data: {
        roundId,
        userId,
        type,
        scheduledFor
      }
    });
  }

  async markAsSent(id: string): Promise<Reminder> {
    return this.prisma.reminder.update({
      where: { id },
      data: { sentAt: new Date() }
    });
  }

  async findDueReminders(before: Date = new Date()): Promise<ReminderWithFoundRound[]> {
    return this.prisma.reminder.findMany({
      where: {
        scheduledFor: { lte: before },
        sentAt: null
      },
      include: {
        round: {
          include: {
            group: true,
            consensusResult: true
          }
        }
      }
    }) as unknown as ReminderWithFoundRound[];
  }

  async findByRoundAndUser(roundId: string, userId: string): Promise<Reminder | null> {
    return this.prisma.reminder.findFirst({
      where: { roundId, userId, type: 'pre_meeting' }
    });
  }

  async findByRound(roundId: string): Promise<Reminder[]> {
    return this.prisma.reminder.findMany({
      where: { roundId }
    });
  }
}
