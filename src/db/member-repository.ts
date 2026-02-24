import { PrismaClient, type Member } from '@prisma/client';
import { getPrismaClient } from './client';

export class MemberRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = getPrismaClient();
  }

  async findOrCreate(userId: string, groupId: string): Promise<Member> {
    const existing = await this.prisma.member.findUnique({
      where: { userId_groupId: { userId, groupId } }
    });

    if (existing) {
      return existing;
    }

    return this.prisma.member.create({
      data: { userId, groupId, optedIn: false }
    });
  }

  async optIn(userId: string, groupId: string): Promise<Member> {
    return this.prisma.member.upsert({
      where: { userId_groupId: { userId, groupId } },
      update: { optedIn: true, optedInAt: new Date() },
      create: { userId, groupId, optedIn: true, optedInAt: new Date() }
    });
  }

  async findOptedInByGroup(groupId: string): Promise<Member[]> {
    return this.prisma.member.findMany({
      where: { groupId, optedIn: true }
    });
  }

  async isOptedIn(userId: string, groupId: string): Promise<boolean> {
    const member = await this.prisma.member.findUnique({
      where: { userId_groupId: { userId, groupId } }
    });
    return member?.optedIn ?? false;
  }

  async countOptedInByGroup(groupId: string): Promise<number> {
    return this.prisma.member.count({
      where: { groupId, optedIn: true }
    });
  }

  async getOptInStatusByGroup(groupId: string): Promise<{ optedIn: Member[]; notOptedIn: Member[] }> {
    const [optedIn, notOptedIn] = await Promise.all([
      this.prisma.member.findMany({
        where: { groupId, optedIn: true }
      }),
      this.prisma.member.findMany({
        where: { groupId, optedIn: false }
      })
    ]);

    return { optedIn, notOptedIn };
  }

  async findByUserId(userId: string): Promise<Member[]> {
    return this.prisma.member.findMany({
      where: { userId }
    });
  }
}
