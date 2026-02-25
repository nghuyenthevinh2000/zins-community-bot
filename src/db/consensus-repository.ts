import { PrismaClient, type ConsensusResult } from '@prisma/client';
import { getPrismaClient } from './client';

export interface TimeSlot {
  day: string;
  startTime: string;
  endTime: string;
  userIds: string[];
}

export interface ConsensusCalculation {
  achieved: boolean;
  timeSlot?: TimeSlot;
  percentage: number;
  respondersCount: number;
  totalOptedInCount: number;
  bestSlots?: TimeSlot[];
}

export class ConsensusRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = getPrismaClient();
  }

  async findOrCreate(roundId: string): Promise<ConsensusResult> {
    const existing = await this.prisma.consensusResult.findUnique({
      where: { roundId }
    });

    if (existing) {
      return existing;
    }

    return this.prisma.consensusResult.create({
      data: {
        roundId,
        status: 'pending'
      }
    });
  }

  async updateAchieved(
    roundId: string,
    timeSlot: TimeSlot,
    percentage: number,
    respondersCount: number,
    totalOptedInCount: number
  ): Promise<ConsensusResult> {
    return this.prisma.consensusResult.upsert({
      where: { roundId },
      update: {
        status: 'achieved',
        confirmedTimeSlot: timeSlot as any,
        consensusPercentage: percentage,
        respondersCount,
        totalOptedInCount,
        confirmedAt: new Date()
      },
      create: {
        roundId,
        status: 'achieved',
        confirmedTimeSlot: timeSlot as any,
        consensusPercentage: percentage,
        respondersCount,
        totalOptedInCount,
        confirmedAt: new Date()
      }
    });
  }

  async updateFailed(
    roundId: string,
    bestSlots: TimeSlot[],
    respondersCount: number,
    totalOptedInCount: number
  ): Promise<ConsensusResult> {
    return this.prisma.consensusResult.upsert({
      where: { roundId },
      update: {
        status: 'failed',
        bestTimeSlots: bestSlots as any,
        respondersCount,
        totalOptedInCount
      },
      create: {
        roundId,
        status: 'failed',
        bestTimeSlots: bestSlots as any,
        respondersCount,
        totalOptedInCount
      }
    });
  }

  async findByRound(roundId: string): Promise<ConsensusResult | null> {
    return this.prisma.consensusResult.findUnique({
      where: { roundId }
    });
  }

  async isConsensusAchieved(roundId: string): Promise<boolean> {
    const result = await this.findByRound(roundId);
    return result?.status === 'achieved';
  }
}
