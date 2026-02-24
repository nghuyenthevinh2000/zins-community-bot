import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { PrismaClient } from '@prisma/client';
import { DatabaseService } from './database.service';
import { OpenCodeNLUService } from './opencode-nlu.service';

const prisma = new PrismaClient();
const db = new DatabaseService(prisma);
const nlu = new OpenCodeNLUService();

describe('Natural Language Availability Parsing (Story 4.2)', () => {
  beforeEach(async () => {
    await prisma.availabilityResponse.deleteMany();
    await prisma.schedulingRound.deleteMany();
    await prisma.member.deleteMany();
    await prisma.group.deleteMany();
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  test('should parse "Tuesday after 6pm" into structured time range', async () => {
    const referenceDate = new Date('2026-02-24'); // Tuesday
    const result = await nlu.parseAvailabilityFallback("I'm free Tuesday after 6pm", referenceDate);

    expect(result.success).toBe(true);
    expect(result.isVague).toBe(false);
    expect(result.parsed).toBeDefined();
    expect(result.parsed!.length).toBeGreaterThan(0);

    const slot = result.parsed![0];
    expect(slot.startTime.getHours()).toBe(18); // 6pm
    expect(slot.endTime.getHours()).toBe(22); // Default end time
    expect(slot.isVague).toBe(false);
  });

  test('should parse "all day Thursday" into 9am-6pm range', async () => {
    const referenceDate = new Date('2026-02-24'); // Tuesday
    const result = await nlu.parseAvailabilityFallback("I'm free all day Thursday", referenceDate);

    expect(result.success).toBe(true);
    expect(result.isVague).toBe(false);
    expect(result.parsed!.length).toBe(1);

    const slot = result.parsed![0];
    expect(slot.startTime.getHours()).toBe(9); // 9am
    expect(slot.endTime.getHours()).toBe(18); // 6pm
  });

  test('should identify vague responses like "sometime next week"', async () => {
    const result = await nlu.parseAvailabilityFallback("I'm free sometime next week");

    expect(result.success).toBe(true);
    expect(result.isVague).toBe(true);
  });



  test('should handle multiple time ranges in single response', async () => {
    const referenceDate = new Date('2026-02-24');
    const result = await nlu.parseAvailabilityFallback("I'm free Tuesday after 6pm and all day Thursday", referenceDate);

    expect(result.success).toBe(true);
    expect(result.isVague).toBe(false);
    // Should parse both Tuesday and Thursday
    expect(result.parsed!.length).toBeGreaterThanOrEqual(1);
  });

  test('should parse morning, afternoon, and evening qualifiers', async () => {
    const referenceDate = new Date('2026-02-24');

    const morningResult = await nlu.parseAvailabilityFallback("Wednesday morning", referenceDate);
    expect(morningResult.parsed![0].startTime.getHours()).toBe(9);
    expect(morningResult.parsed![0].endTime.getHours()).toBe(12);

    const afternoonResult = await nlu.parseAvailabilityFallback("Wednesday afternoon", referenceDate);
    expect(afternoonResult.parsed![0].startTime.getHours()).toBe(12);
    expect(afternoonResult.parsed![0].endTime.getHours()).toBe(18);

    const eveningResult = await nlu.parseAvailabilityFallback("Wednesday evening", referenceDate);
    expect(eveningResult.parsed![0].startTime.getHours()).toBe(18);
    expect(eveningResult.parsed![0].endTime.getHours()).toBe(22);
  });


});
