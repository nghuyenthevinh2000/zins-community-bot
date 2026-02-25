import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { ConsensusService } from './consensus.service';

describe('ConsensusService (Story 6.1)', () => {
  let reposMock: any;
  let service: ConsensusService;

  beforeEach(() => {
    reposMock = {
      groups: {
        findById: mock(() => Promise.resolve({ id: 'group-1', consensusThreshold: 75 }))
      },
      members: {
        countOptedInByGroup: mock(() => Promise.resolve(4))
      },
      rounds: {
        findById: mock(() => Promise.resolve({ id: 'round-1', groupId: 'group-1' })),
        confirm: mock(() => Promise.resolve())
      },
      responses: {
        findConfirmedByRound: mock(() => Promise.resolve([]))
      },
      consensus: {
        updateAchieved: mock(() => Promise.resolve()),
        updateFailed: mock(() => Promise.resolve())
      }
    };

    service = new ConsensusService(reposMock);
  });

  test('should calculate consensus and achieve it when >= 75% responders have overlap', async () => {
    // 4 opted in. 75% of 4 = 3 required for consensus.
    const responses = [
      { userId: 'u1', parsedAvailability: { days: ['Monday'], times: ['10:00am'] } },
      { userId: 'u2', parsedAvailability: { days: ['Monday'], times: ['10:00am'] } },
      { userId: 'u3', parsedAvailability: { days: ['Monday'], times: ['10:00am'] } }
    ];
    
    reposMock.responses.findConfirmedByRound.mockReturnValue(Promise.resolve(responses));

    const result = await service.calculateConsensus('round-1');

    expect(result.achieved).toBe(true);
    expect(result.percentage).toBe(75);
    expect(result.timeSlot?.day).toBe('Monday');
    expect(result.timeSlot?.userIds.length).toBe(3);
    
    expect(reposMock.consensus.updateAchieved).toHaveBeenCalled();
    expect(reposMock.rounds.confirm).toHaveBeenCalledWith('round-1');
  });

  test('should not achieve consensus if overlap is < threshold', async () => {
    // 4 opted in. 75% = 3 required. Only 2 have overlap.
    const responses = [
      { userId: 'u1', parsedAvailability: { days: ['Monday'], times: ['10:00am'] } },
      { userId: 'u2', parsedAvailability: { days: ['Monday'], times: ['10:00am'] } }
    ];
    
    reposMock.responses.findConfirmedByRound.mockReturnValue(Promise.resolve(responses));

    const result = await service.calculateConsensus('round-1');

    expect(result.achieved).toBe(false);
    expect(result.percentage).toBe(50); // 2 out of 4 is 50%
    
    expect(reposMock.consensus.updateFailed).toHaveBeenCalled();
    expect(reposMock.rounds.confirm).not.toHaveBeenCalled();
  });

  test('calculates regardless of how many members have responded', async () => {
    // 10 opted in. 75% = 8 required. Let's say exactly 8 responded and overlap.
    reposMock.members.countOptedInByGroup.mockReturnValue(Promise.resolve(10));
    const responses = Array(8).fill(null).map((_, i) => ({
      userId: `u${i}`, 
      parsedAvailability: { days: ['Tuesday'], times: ['2:00pm'] } 
    }));
    
    reposMock.responses.findConfirmedByRound.mockReturnValue(Promise.resolve(responses));

    const result = await service.calculateConsensus('round-1');

    expect(result.achieved).toBe(true);
    expect(result.percentage).toBe(80);
    expect(result.timeSlot?.userIds.length).toBe(8);
  });
});
