import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { PrismaClient } from '@prisma/client';
import { GroupRepository } from './group-repository';

const prisma = new PrismaClient();
const groupRepo = new GroupRepository();

describe('GroupRepository - Group CRUD Operations (Story 1.2)', () => {
  beforeEach(async () => {
    await prisma.group.deleteMany();
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  test('should find or create a group', async () => {
    // Create new group
    const group = await groupRepo.findOrCreate('telegram-123', 'Test Group');
    expect(group.telegramId).toBe('telegram-123');
    expect(group.name).toBe('Test Group');
    
    // Find existing group
    const existing = await groupRepo.findOrCreate('telegram-123', 'Different Name');
    expect(existing.id).toBe(group.id);
    expect(existing.name).toBe('Test Group'); // Should not update name
  });

  test('should find group by telegram ID', async () => {
    const created = await groupRepo.findOrCreate('telegram-456', 'Find Me');
    
    const found = await groupRepo.findByTelegramId('telegram-456');
    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
    expect(found!.name).toBe('Find Me');
  });

  test('should return null for non-existent telegram ID', async () => {
    const found = await groupRepo.findByTelegramId('non-existent');
    expect(found).toBeNull();
  });

  test('should find group by ID', async () => {
    const created = await groupRepo.findOrCreate('telegram-789', 'By ID');
    
    const found = await groupRepo.findById(created.id);
    expect(found).not.toBeNull();
    expect(found!.telegramId).toBe('telegram-789');
  });
});

describe('GroupRepository - Nudge Settings (Story 5.2)', () => {
  beforeEach(async () => {
    await prisma.group.deleteMany();
  });

  test('should update and retrieve nudge settings', async () => {
    const group = await groupRepo.findOrCreate('settings-group', 'Settings Group');
    
    // Default settings
    let settings = await groupRepo.getNudgeSettings(group.id);
    expect(settings.nudgeIntervalHours).toBe(24);
    expect(settings.maxNudgeCount).toBe(3);
    
    // Update settings
    await groupRepo.updateNudgeSettings(group.id, 12, 5);
    
    // Verify updated
    settings = await groupRepo.getNudgeSettings(group.id);
    expect(settings.nudgeIntervalHours).toBe(12);
    expect(settings.maxNudgeCount).toBe(5);
  });
});
