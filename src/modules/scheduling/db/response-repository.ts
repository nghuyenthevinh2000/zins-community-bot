import { PrismaClient, type AvailabilityResponse } from '@prisma/client';
import { getPrismaClient } from '../../../core/db/client';

export class ResponseRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = getPrismaClient();
  }

  async create(
    roundId: string,
    userId: string,
    rawResponse: string,
    parsedAvailability: any
  ): Promise<AvailabilityResponse> {
    return this.prisma.availabilityResponse.create({
      data: {
        roundId,
        userId,
        rawResponse,
        parsedAvailability,
        status: 'pending'
      }
    });
  }

  async confirm(roundId: string, userId: string): Promise<AvailabilityResponse> {
    const existing = await this.prisma.availabilityResponse.findFirst({
      where: { roundId, userId },
      orderBy: { createdAt: 'desc' }
    });

    if (!existing) {
      throw new Error('Availability response not found');
    }

    return this.prisma.availabilityResponse.update({
      where: { id: existing.id },
      data: { status: 'confirmed', confirmedAt: new Date() }
    });
  }

  async findByRoundAndUser(roundId: string, userId: string): Promise<AvailabilityResponse | null> {
    return this.prisma.availabilityResponse.findFirst({
      where: { roundId, userId },
      orderBy: { createdAt: 'desc' }
    });
  }

  async findPendingByUser(userId: string): Promise<AvailabilityResponse | null> {
    return this.prisma.availabilityResponse.findFirst({
      where: { userId, status: 'pending' },
      include: { round: true },
      orderBy: { createdAt: 'desc' }
    });
  }

  async update(
    roundId: string,
    userId: string,
    rawResponse: string,
    parsedAvailability: any
  ): Promise<AvailabilityResponse> {
    const existing = await this.prisma.availabilityResponse.findFirst({
      where: { roundId, userId },
      orderBy: { createdAt: 'desc' }
    });

    if (!existing) {
      throw new Error('Availability response not found');
    }

    return this.prisma.availabilityResponse.update({
      where: { id: existing.id },
      data: {
        rawResponse,
        parsedAvailability,
        status: 'pending',
        confirmedAt: null
      }
    });
  }

  async updateStatus(roundId: string, userId: string, status: string): Promise<AvailabilityResponse> {
    const existing = await this.prisma.availabilityResponse.findFirst({
      where: { roundId, userId },
      orderBy: { createdAt: 'desc' }
    });

    if (!existing) {
      throw new Error('Availability response not found');
    }

    return this.prisma.availabilityResponse.update({
      where: { id: existing.id },
      data: { status }
    });
  }

  async findConfirmedByRound(roundId: string): Promise<AvailabilityResponse[]> {
    return this.prisma.availabilityResponse.findMany({
      where: { roundId, status: 'confirmed' }
    });
  }

  async countVagueResponses(userId: string, roundId: string): Promise<number> {
    const vagueResponses = await this.prisma.availabilityResponse.findMany({
      where: {
        roundId,
        userId,
        status: 'pending'
      },
      orderBy: { createdAt: 'desc' }
    });

    let vagueCount = 0;
    for (const response of vagueResponses) {
      const parsed = response.parsedAvailability as any;
      const hasNoDays = !parsed?.days || parsed.days.length === 0;
      const hasNoTimes = !parsed?.times || parsed.times.length === 0;

      if ((hasNoDays && hasNoTimes) || (!hasNoDays && hasNoTimes)) {
        vagueCount++;
      } else if (!hasNoDays && !hasNoTimes) {
        break;
      }
    }

    return vagueCount;
  }
}
