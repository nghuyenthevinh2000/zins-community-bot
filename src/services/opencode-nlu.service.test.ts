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

  test('should store parsed availability in database', async () => {
    const group = await db.findOrCreateGroup('test-group-4-2', 'Test Group 4.2');
    const round = await db.createSchedulingRound(group.id, 'Team Meeting', 'next week');
    const memberId = 'user-123';
    
    // Parse availability
    const referenceDate = new Date('2026-02-24');
    const parseResult = await nlu.parseAvailabilityFallback("Tuesday after 6pm", referenceDate);
    
    expect(parseResult.success).toBe(true);
    expect(parseResult.parsed).toBeDefined();
    expect(parseResult.parsed!.length).toBeGreaterThan(0);
    
    // Store in database
    const slot = parseResult.parsed![0];
    const response = await db.createAvailabilityResponse(
      round.id,
      memberId,
      "Tuesday after 6pm",
      slot.startTime,
      slot.endTime,
      false,
      'confirmed'
    );
    
    expect(response.roundId).toBe(round.id);
    expect(response.memberId).toBe(memberId);
    expect(response.rawText).toBe("Tuesday after 6pm");
    expect(response.parsedStartTime).toBeDefined();
    expect(response.parsedEndTime).toBeDefined();
    expect(response.isVague).toBe(false);
    expect(response.status).toBe('confirmed');
  });

  test('should retrieve availability responses by round', async () => {
    const group = await db.findOrCreateGroup('test-group-responses', 'Test Group Responses');
    const round = await db.createSchedulingRound(group.id, 'Planning Meeting', 'next week');
    
    // Create multiple responses
    await db.createAvailabilityResponse(round.id, 'user-1', 'Monday morning', new Date(), new Date(), false, 'confirmed');
    await db.createAvailabilityResponse(round.id, 'user-2', 'Tuesday afternoon', new Date(), new Date(), false, 'confirmed');
    await db.createAvailabilityResponse(round.id, 'user-3', 'Wednesday', new Date(), new Date(), false, 'confirmed');
    
    const responses = await db.getAvailabilityResponsesByRound(round.id);
    
    expect(responses.length).toBe(3);
    expect(responses.map(r => r.memberId).sort()).toEqual(['user-1', 'user-2', 'user-3']);
  });

  test('should check if member has already responded to a round', async () => {
    const group = await db.findOrCreateGroup('test-group-check', 'Test Group Check');
    const round = await db.createSchedulingRound(group.id, 'Standup', 'tomorrow');
    const memberId = 'user-check';
    
    // Initially not responded
    let hasResponded = await db.hasMemberResponded(memberId, round.id);
    expect(hasResponded).toBe(false);
    
    // Create response
    await db.createAvailabilityResponse(round.id, memberId, 'Monday morning', new Date(), new Date(), false, 'confirmed');
    
    // Now should have responded
    hasResponded = await db.hasMemberResponded(memberId, round.id);
    expect(hasResponded).toBe(true);
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

  test('should update availability response', async () => {
    const group = await db.findOrCreateGroup('test-group-update', 'Test Group Update');
    const round = await db.createSchedulingRound(group.id, 'Review', 'next week');
    
    // Create initial response
    const response = await db.createAvailabilityResponse(
      round.id,
      'user-update',
      'Monday morning',
      new Date('2026-02-24T09:00:00'),
      new Date('2026-02-24T12:00:00'),
      false,
      'pending'
    );
    
    expect(response.status).toBe('pending');
    
    // Update to confirmed
    const updated = await db.updateAvailabilityResponse(response.id, {
      status: 'confirmed',
      parsedStartTime: new Date('2026-02-24T14:00:00')
    });
    
    expect(updated.status).toBe('confirmed');
    expect(updated.parsedStartTime?.getHours()).toBe(14);
  });

  test('should get latest response by member for a round', async () => {
    const group = await db.findOrCreateGroup('test-group-latest', 'Test Group Latest');
    const round = await db.createSchedulingRound(group.id, 'Sync', 'next week');
    const memberId = 'user-latest';
    
    // Create first response
    await db.createAvailabilityResponse(round.id, memberId, 'Monday morning', new Date(), new Date(), false, 'confirmed');
    
    // Create second response (correction)
    await new Promise(resolve => setTimeout(resolve, 10)); // Small delay to ensure different timestamps
    const secondResponse = await db.createAvailabilityResponse(
      round.id, 
      memberId, 
      'Actually, Tuesday afternoon', 
      new Date('2026-02-25T12:00:00'), 
      new Date('2026-02-25T18:00:00'), 
      false, 
      'confirmed'
    );
    
    // Get latest should return the second one
    const latest = await db.getAvailabilityResponseByMemberAndRound(memberId, round.id);
    expect(latest).not.toBeNull();
    expect(latest!.rawText).toBe('Actually, Tuesday afternoon');
  });
});
