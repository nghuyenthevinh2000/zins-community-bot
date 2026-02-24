import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { PrismaClient } from '@prisma/client';
import { DatabaseService } from './database.service';

const prisma = new PrismaClient();
const db = new DatabaseService(prisma);

describe('Handle Vague Responses & Push for Specifics (Story 4.4)', () => {
  beforeEach(async () => {
    await prisma.availabilityResponse.deleteMany();
    await prisma.schedulingRound.deleteMany();
    await prisma.member.deleteMany();
    await prisma.group.deleteMany();
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  test('should count vague responses for a user', async () => {
    const group = await db.findOrCreateGroup('vague-test-group', 'Vague Test Group');
    const round = await db.createSchedulingRound(group.id, 'Meeting', 'next week');
    const memberId = 'vague-user-1';

    await db.createAvailabilityResponse(
      round.id,
      memberId,
      'sometime next week',
      { days: [], times: [], raw: 'sometime next week', parsed: false }
    );

    let vagueCount = await db.getVagueResponseCount(memberId, round.id);
    expect(vagueCount).toBe(1);

    await db.createAvailabilityResponse(
      round.id,
      memberId,
      'whenever works',
      { days: [], times: [], raw: 'whenever works', parsed: false }
    );

    vagueCount = await db.getVagueResponseCount(memberId, round.id);
    expect(vagueCount).toBe(2);
  });

  test('should reset vague count after specific response', async () => {
    const group = await db.findOrCreateGroup('specific-test-group', 'Specific Test Group');
    const round = await db.createSchedulingRound(group.id, 'Meeting', 'next week');
    const memberId = 'specific-user';

    await db.createAvailabilityResponse(
      round.id,
      memberId,
      'sometime',
      { days: [], times: [], raw: 'sometime', parsed: false }
    );

    await db.createAvailabilityResponse(
      round.id,
      memberId,
      'Tuesday after 6pm',
      { days: ['Tuesday'], times: ['6pm'], raw: 'Tuesday after 6pm', parsed: true }
    );

    const vagueCount = await db.getVagueResponseCount(memberId, round.id);
    expect(vagueCount).toBe(0);
  });

  test('should update response status to confirmed_vague', async () => {
    const group = await db.findOrCreateGroup('status-test-group', 'Status Test Group');
    const round = await db.createSchedulingRound(group.id, 'Meeting', 'next week');
    const memberId = 'status-user';

    await db.createAvailabilityResponse(
      round.id,
      memberId,
      'sometime',
      { days: [], times: [], raw: 'sometime', parsed: false }
    );

    await db.updateAvailabilityResponseStatus(round.id, memberId, 'confirmed_vague');

    const response = await db.getAvailabilityResponse(round.id, memberId);
    expect(response).not.toBeNull();
    expect(response!.status).toBe('confirmed_vague');
  });

  test('should track vague responses per user per round independently', async () => {
    const group = await db.findOrCreateGroup('multi-user-group', 'Multi User Group');
    const round = await db.createSchedulingRound(group.id, 'Meeting', 'next week');
    
    const memberId1 = 'user-1';
    const memberId2 = 'user-2';

    await db.createAvailabilityResponse(
      round.id,
      memberId1,
      'sometime',
      { days: [], times: [], raw: 'sometime', parsed: false }
    );

    await db.createAvailabilityResponse(
      round.id,
      memberId2,
      'Tuesday 6pm',
      { days: ['Tuesday'], times: ['6pm'], raw: 'Tuesday 6pm', parsed: true }
    );

    const vagueCount1 = await db.getVagueResponseCount(memberId1, round.id);
    const vagueCount2 = await db.getVagueResponseCount(memberId2, round.id);

    expect(vagueCount1).toBe(1);
    expect(vagueCount2).toBe(0);
  });

  test('should handle progressive vague response prompting logic', async () => {
    const group = await db.findOrCreateGroup('progressive-group', 'Progressive Group');
    const round = await db.createSchedulingRound(group.id, 'Meeting', 'next week');
    const memberId = 'progressive-user';

    await db.createAvailabilityResponse(
      round.id,
      memberId,
      'sometime next week',
      { days: [], times: [], raw: 'sometime next week', parsed: false }
    );

    let vagueCount = await db.getVagueResponseCount(memberId, round.id);
    expect(vagueCount).toBe(1);

    await db.createAvailabilityResponse(
      round.id,
      memberId,
      'whenever',
      { days: [], times: [], raw: 'whenever', parsed: false }
    );

    vagueCount = await db.getVagueResponseCount(memberId, round.id);
    expect(vagueCount).toBe(2);

    await db.createAvailabilityResponse(
      round.id,
      memberId,
      'maybe Tuesday',
      { days: ['Tuesday'], times: [], raw: 'maybe Tuesday', parsed: true }
    );

    vagueCount = await db.getVagueResponseCount(memberId, round.id);
    expect(vagueCount).toBe(3);

    await db.createAvailabilityResponse(
      round.id,
      memberId,
      'flexible',
      { days: [], times: [], raw: 'flexible', parsed: false }
    );

    vagueCount = await db.getVagueResponseCount(memberId, round.id);
    expect(vagueCount).toBe(4);
  });
});
