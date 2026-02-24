import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { PrismaClient } from '@prisma/client';
import { ResponseRepository } from './response-repository';
import { RoundRepository } from './round-repository';
import { GroupRepository } from './group-repository';

const prisma = new PrismaClient();
const responseRepo = new ResponseRepository();
const roundRepo = new RoundRepository();
const groupRepo = new GroupRepository();

describe('ResponseRepository - Confirm & Correct Availability Interpretation (Story 4.3)', () => {
  beforeEach(async () => {
    await prisma.availabilityResponse.deleteMany();
    await prisma.schedulingRound.deleteMany();
    await prisma.group.deleteMany();
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  test('should create and confirm availability response', async () => {
    const group = await groupRepo.findOrCreate('availability-group', 'Availability Group');
    const round = await roundRepo.create(group.id, 'Lunch', 'today');
    const userId = 'user-confirm';
    
    // Create pending response
    const raw = 'Free at 12pm';
    const parsed = { times: ['12pm'] };
    await responseRepo.create(round.id, userId, raw, parsed);
    
    // Check pending
    let pending = await responseRepo.findPendingByUser(userId);
    expect(pending).not.toBeNull();
    expect(pending!.status).toBe('pending');
    expect(pending!.rawResponse).toBe(raw);
    
    // Confirm
    await responseRepo.confirm(round.id, userId);
    
    // Verify confirmed
    const response = await responseRepo.findByRoundAndUser(round.id, userId);
    expect(response).not.toBeNull();
    expect(response!.status).toBe('confirmed');
    expect(response!.confirmedAt).not.toBeNull();
    
    // No longer pending
    pending = await responseRepo.findPendingByUser(userId);
    expect(pending).toBeNull();
  });

  test('should update existing response during correction', async () => {
    const group = await groupRepo.findOrCreate('update-group', 'Update Group');
    const round = await roundRepo.create(group.id, 'Dinner', 'tonight');
    const userId = 'user-update';
    
    // Create initial response
    await responseRepo.create(round.id, userId, 'Free at 6pm', { times: ['6pm'] });
    
    // Update (correct)
    const newRaw = 'Actually 7pm';
    const newParsed = { times: ['7pm'] };
    await responseRepo.update(round.id, userId, newRaw, newParsed);
    
    // Verify updated and still pending
    const response = await responseRepo.findByRoundAndUser(round.id, userId);
    expect(response).not.toBeNull();
    expect(response!.rawResponse).toBe(newRaw);
    expect(response!.status).toBe('pending');
    expect(response!.confirmedAt).toBeNull();
  });

  test('should count vague responses correctly', async () => {
    const group = await groupRepo.findOrCreate('vague-group', 'Vague Group');
    const round = await roundRepo.create(group.id, 'Meeting', 'tomorrow');
    const userId = 'user-vague';
    
    // Create a vague response (no specific days or times)
    await responseRepo.create(round.id, userId, 'sometime next week', { days: [], times: [] });
    
    let vagueCount = await responseRepo.countVagueResponses(userId, round.id);
    expect(vagueCount).toBe(1);
    
    // Create another vague response
    await responseRepo.create(round.id, userId, 'whenever', { days: [], times: [] });
    vagueCount = await responseRepo.countVagueResponses(userId, round.id);
    expect(vagueCount).toBe(2);
    
    // Create a specific response (has both days and times)
    await responseRepo.create(round.id, userId, 'Tuesday at 3pm', { days: ['Tuesday'], times: ['3pm'] });
    vagueCount = await responseRepo.countVagueResponses(userId, round.id);
    expect(vagueCount).toBe(0); // Reset because we found a specific one
  });

  test('should update response status independently', async () => {
    const group = await groupRepo.findOrCreate('status-group', 'Status Group');
    const round = await roundRepo.create(group.id, 'Event', 'next week');
    const userId = 'user-status';
    
    // Create response
    await responseRepo.create(round.id, userId, 'Free', {});
    
    // Update status
    await responseRepo.updateStatus(round.id, userId, 'confirmed');
    
    let response = await responseRepo.findByRoundAndUser(round.id, userId);
    expect(response!.status).toBe('confirmed');
    
    // Update to another status
    await responseRepo.updateStatus(round.id, userId, 'corrected');
    response = await responseRepo.findByRoundAndUser(round.id, userId);
    expect(response!.status).toBe('corrected');
  });
});
