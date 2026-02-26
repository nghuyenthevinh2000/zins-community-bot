import { PrismaClient, type Group } from '@prisma/client';
import { getPrismaClient } from './client';

export class GroupRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = getPrismaClient();
  }

  async findOrCreate(telegramId: string, name: string): Promise<Group> {
    const existing = await this.prisma.group.findUnique({
      where: { telegramId }
    });

    if (existing) {
      return existing;
    }

    return this.prisma.group.create({
      data: { telegramId, name }
    });
  }

  async findByTelegramId(telegramId: string): Promise<Group | null> {
    return this.prisma.group.findUnique({
      where: { telegramId }
    });
  }

  async findById(id: string): Promise<Group | null> {
    return this.prisma.group.findUnique({
      where: { id }
    });
  }

  async updateNudgeSettings(
    groupId: string,
    nudgeIntervalHours: number,
    maxNudgeCount: number
  ): Promise<Group> {
    return this.prisma.group.update({
      where: { id: groupId },
      data: { nudgeIntervalHours, maxNudgeCount }
    });
  }

  async getNudgeSettings(groupId: string): Promise<{ nudgeIntervalHours: number; maxNudgeCount: number }> {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: { nudgeIntervalHours: true, maxNudgeCount: true }
    });

    return {
      nudgeIntervalHours: group?.nudgeIntervalHours ?? 24,
      maxNudgeCount: group?.maxNudgeCount ?? 3
    };
  }

  // Story 6.1: Consensus threshold settings
  async updateConsensusThreshold(groupId: string, threshold: number): Promise<Group> {
    return this.prisma.group.update({
      where: { id: groupId },
      data: { consensusThreshold: threshold }
    });
  }

  async getConsensusThreshold(groupId: string): Promise<number> {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: { consensusThreshold: true }
    });

    return group?.consensusThreshold ?? 75;
  }

  // Story 7.2: Unified settings management
  async getAllSettings(groupId: string): Promise<{
    consensusThreshold: number;
    nudgeIntervalHours: number;
    maxNudgeCount: number;
  }> {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: {
        consensusThreshold: true,
        nudgeIntervalHours: true,
        maxNudgeCount: true
      }
    });

    return {
      consensusThreshold: group?.consensusThreshold ?? 75,
      nudgeIntervalHours: group?.nudgeIntervalHours ?? 24,
      maxNudgeCount: group?.maxNudgeCount ?? 3
    };
  }

  async updateSettings(
    groupId: string,
    settings: {
      consensusThreshold?: number;
      nudgeIntervalHours?: number;
      maxNudgeCount?: number;
    }
  ): Promise<Group> {
    return this.prisma.group.update({
      where: { id: groupId },
      data: settings
    });
  }
}
