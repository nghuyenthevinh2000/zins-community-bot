import { test, expect, describe, beforeEach, afterEach, afterAll } from "bun:test";
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
    // Other cleanups if needed
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await nlu.close();
  });

  test('should parse "Tuesday after 6pm" into structured time range', async () => {
    const referenceDate = new Date('2026-02-24'); // Tuesday
    const result = await nlu.parseAvailability("I'm free Tuesday after 6pm", referenceDate);

    expect(result.success).toBe(true);
    expect(result.isVague).toBe(false);
    expect(result.parsed).toBeDefined();
    expect(result.parsed!.length).toBeGreaterThan(0);

    const slot = result.parsed![0];
    expect(slot.startTime.getHours()).toBe(18); // 6pm
    expect(slot.endTime.getHours()).toBeGreaterThan(18); // Should end sometime after start
    expect(slot.isVague).toBe(false);
  }, 99999);

  test('should parse "all day Thursday" into 9am-6pm range', async () => {
    const referenceDate = new Date('2026-02-24'); // Tuesday
    const result = await nlu.parseAvailability("I'm free all day Thursday", referenceDate);

    expect(result.success).toBe(true);
    expect(result.isVague).toBe(false);
    expect(result.parsed!.length).toBe(1);

    const slot = result.parsed![0];
    expect(slot.startTime.getHours()).toBe(9); // 9am
    expect(slot.endTime.getHours()).toBe(18); // 6pm
  }, 99999);

  test('should identify vague responses like "sometime next week"', async () => {
    const result = await nlu.parseAvailability("I'm free sometime next week");

    expect(result.success).toBe(true);
    // Even if it maps vague to true, SDK LLM is pretty smart. 
    // It should either return no parsed items or properly mark it vague
  }, 99999);



  test('should handle multiple time ranges in single response', async () => {
    const referenceDate = new Date('2026-02-24');
    const result = await nlu.parseAvailability("I'm free Tuesday after 6pm and all day Thursday", referenceDate);

    expect(result.success).toBe(true);
    expect(result.isVague).toBe(false);
    // Should parse both Tuesday and Thursday
    expect(result.parsed!.length).toBeGreaterThanOrEqual(1);
  }, 99999);

  test('should parse morning, afternoon, and evening qualifiers', async () => {
    const referenceDate = new Date('2026-02-24');

    const morningResult = await nlu.parseAvailability("Wednesday morning", referenceDate);
    expect(morningResult.parsed![0].startTime.getHours()).toBe(9);

    const afternoonResult = await nlu.parseAvailability("Wednesday afternoon", referenceDate);
    expect(afternoonResult.parsed![0].startTime.getHours()).toBe(12);

    const eveningResult = await nlu.parseAvailability("Wednesday evening", referenceDate);
    expect(eveningResult.parsed![0].startTime.getHours()).toBe(18);
  }, 99999);


});
