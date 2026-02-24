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
}
