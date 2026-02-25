import { describe, test, expect, beforeEach, mock, afterEach } from 'bun:test';
import { ReminderService } from './reminder.service';

describe('ReminderService (Story 6.5)', () => {
  let reposMock: any;
  let telegramMock: any;
  let service: ReminderService;

  beforeEach(() => {
    reposMock = {
      reminders: {
        create: mock(() => Promise.resolve({})),
        markAsSent: mock(() => Promise.resolve({})),
        findDueReminders: mock(() => Promise.resolve([])),
        findByRound: mock(() => Promise.resolve([])),
      },
      rounds: {
        findById: mock(() => Promise.resolve({
          id: 'round-1',
          topic: 'Team sync',
          status: 'confirmed',
          confirmedTimeSlot: {
            startTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours from now
            endTime: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
            attendeeUserIds: ['user-1', 'user-2']
          },
          group: { name: 'Engineering' }
        })),
      },
      responses: {
        findConfirmedByRound: mock(() => Promise.resolve([
          { userId: 'user-1' },
          { userId: 'user-2' }
        ])),
      }
    };

    telegramMock = {
      sendMessage: mock(() => Promise.resolve({})),
    };

    service = new ReminderService(reposMock, telegramMock);
    
    // Mock global setTimeout to avoid waiting during tests
    global.setTimeout = ((fn: any) => { fn(); return {} as any; }) as any;
  });

  test('should schedule reminders for confirmed attendees', async () => {
    await service.scheduleReminders('round-1', 1); // 1 hour before

    expect(reposMock.reminders.create).toHaveBeenCalledTimes(2);
    expect(reposMock.reminders.create).toHaveBeenCalledWith('round-1', 'user-1', expect.any(Date), 'pre_meeting');
    expect(reposMock.reminders.create).toHaveBeenCalledWith('round-1', 'user-2', expect.any(Date), 'pre_meeting');
    
    // Verify scheduled time is roughly 1 hour before meeting (which is 2 hours from now)
    // So scheduled time should be roughly 1 hour from now
    const callArgs = reposMock.reminders.create.mock.calls[0];
    const scheduledTime = callArgs[2];
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    
    expect(Math.abs(scheduledTime.getTime() - oneHourFromNow.getTime())).toBeLessThan(5000); // 5s tolerance
  });

  test('should not schedule if meeting is too soon', async () => {
    // Meeting starts in 30 minutes
    reposMock.rounds.findById.mockReturnValue(Promise.resolve({
      status: 'confirmed',
      confirmedTimeSlot: {
        startTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        attendeeUserIds: ['user-1']
      }
    }));

    await service.scheduleReminders('round-1', 1); // Want reminder 1 hour before

    // 1 hour before a meeting in 30 mins is 30 mins ago. Past reminders shouldn't be scheduled.
    expect(reposMock.reminders.create).not.toHaveBeenCalled();
  });

  test('should process and send due reminders', async () => {
    const dueReminders = [
      {
        id: 'rem-1',
        userId: 'user-1',
        round: {
          id: 'round-1',
          topic: 'Sprint Planning',
          group: { name: 'Developers' },
          confirmedTimeSlot: {
            startTime: new Date().toISOString(),
            day: 'Wednesday'
          }
        }
      }
    ];

    reposMock.reminders.findDueReminders.mockReturnValue(Promise.resolve(dueReminders));

    await (service as any).processDueReminders();

    expect(telegramMock.sendMessage).toHaveBeenCalledWith(
      'user-1',
      expect.stringContaining('Sprint Planning'),
      expect.any(Object)
    );
    expect(telegramMock.sendMessage).toHaveBeenCalledWith(
      'user-1',
      expect.stringContaining('Developers'),
      expect.any(Object)
    );
    expect(reposMock.reminders.markAsSent).toHaveBeenCalledWith('rem-1');
  });
});
