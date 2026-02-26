# Story 8.3: Split BotHandlers — Extract Scheduling Service & Move Other Services

Status: ready-for-dev

## Prerequisite

Story 8.2 must be complete (GroupService extracted, group methods removed from BotHandlers).

## Story

As a **developer**,
I want to extract all scheduling and availability handlers from `src/services/bot-handlers.service.ts` into `src/modules/scheduling/scheduling.service.ts`, and move the remaining services (`ConsensusService`, `RetryLoopService`, `NLURetryService`, `NudgeService`, `NudgeSchedulerService`, `ReminderService`, `OpenCodeNLUService`) into their corresponding module folders,
so that `src/services/bot-handlers.service.ts` is fully deleted and every domain is self-contained.

## Acceptance Criteria

1. `src/modules/scheduling/scheduling.service.ts` contains: `handleSchedule`, `handleCancel`, `handleStatus`, `handleAvailabilityResponse`, `parseScheduleCommand`, `parseAvailabilityWithVagueCheck`, `sendAvailabilityRequests`, `sendConfirmationRequest`, `findMemberWithActiveRound`, and `checkAndAnnounceConsensus`.
2. `src/modules/scheduling/scheduling.service.test.ts` exists with full test coverage for all scheduling handlers, porting tests from `bot-handlers.service.test.ts` and `bot-handlers.status.test.ts`.
3. The following services are moved verbatim (no logic changes) into their module folders:
   - `consensus.service.ts` + `consensus.service.test.ts` → `src/modules/consensus/`
   - `retry-loop.service.ts` + `retry-loop.service.test.ts` → `src/modules/consensus/`
   - `opencode-nlu.service.ts` → `src/modules/nlu/`
   - `nlu-retry.service.ts` + `nlu-retry.service.test.ts` → `src/modules/nlu/`
   - `nudge.service.ts` → `src/modules/nudge/`
   - `nudge-scheduler.service.ts` + `nudge-scheduler.service.test.ts` → `src/modules/nudge/`
   - `reminder.service.ts` + `reminder.service.test.ts` → `src/modules/reminder/`
4. `src/services/bot-handlers.service.ts` is **deleted**.
5. Each module `index.ts` exports its services and repository types.
6. `src/index.ts` is updated to import all services from their new module paths and wire Telegraf commands to `GroupService` and `SchedulingService`.
7. `bun run dev` starts without errors.
8. `bun test` passes with zero failures.

## Tasks / Subtasks

- [ ] Create `src/modules/scheduling/scheduling.service.ts` (AC: 1)
  - [ ] Define `SchedulingRepositories` interface: all repos needed by scheduling handlers
  - [ ] Cut from `bot-handlers.service.ts`: `handleSchedule`, `handleCancel`, `handleStatus`
  - [ ] Cut from `bot-handlers.service.ts`: `handleAvailabilityResponse`, `sendConfirmationRequest`
  - [ ] Cut from `bot-handlers.service.ts`: `parseScheduleCommand`, `parseAvailabilityWithVagueCheck`
  - [ ] Cut from `bot-handlers.service.ts`: `sendAvailabilityRequests`, `findMemberWithActiveRound`
  - [ ] Cut from `bot-handlers.service.ts`: `checkAndAnnounceConsensus`
  - [ ] `SchedulingService` constructor: `(repos: SchedulingRepositories, nluService: OpenCodeNLUService, consensusService: ConsensusService, retryLoopService: RetryLoopService, bot: any)`

- [ ] Create `src/modules/scheduling/scheduling.service.test.ts` (AC: 2)
  - [ ] Port all scheduling tests from `src/services/bot-handlers.service.test.ts`
  - [ ] Port all tests from `src/services/bot-handlers.status.test.ts`
  - [ ] Use `bun:test` mock pattern (same as existing tests)

- [ ] Move Consensus module services (AC: 3)
  - [ ] `src/services/consensus.service.ts` → `src/modules/consensus/consensus.service.ts`
  - [ ] `src/services/consensus.service.test.ts` → `src/modules/consensus/consensus.service.test.ts`
  - [ ] `src/services/retry-loop.service.ts` → `src/modules/consensus/retry-loop.service.ts`
  - [ ] `src/services/retry-loop.service.test.ts` → `src/modules/consensus/retry-loop.service.test.ts`
  - [ ] Fix internal imports: update `'../db'` → `'../../modules/consensus/db'` (or relative)

- [ ] Move NLU module services (AC: 3)
  - [ ] `src/services/opencode-nlu.service.ts` → `src/modules/nlu/opencode-nlu.service.ts`
  - [ ] `src/services/nlu-retry.service.ts` → `src/modules/nlu/nlu-retry.service.ts`
  - [ ] `src/services/nlu-retry.service.test.ts` → `src/modules/nlu/nlu-retry.service.test.ts`
  - [ ] Fix internal imports inside moved files

- [ ] Move Nudge module services (AC: 3)
  - [ ] `src/services/nudge.service.ts` → `src/modules/nudge/nudge.service.ts`
  - [ ] `src/services/nudge-scheduler.service.ts` → `src/modules/nudge/nudge-scheduler.service.ts`
  - [ ] `src/services/nudge-scheduler.service.test.ts` → `src/modules/nudge/nudge-scheduler.service.test.ts`
  - [ ] Fix internal imports inside moved files

- [ ] Move Reminder module services (AC: 3)
  - [ ] `src/services/reminder.service.ts` → `src/modules/reminder/reminder.service.ts`
  - [ ] `src/services/reminder.service.test.ts` → `src/modules/reminder/reminder.service.test.ts`
  - [ ] Fix internal imports inside moved files

- [ ] Update each module's `index.ts` (AC: 5)
  - [ ] `src/modules/scheduling/index.ts` — exports: `SchedulingService`, `SchedulingRepositories`
  - [ ] `src/modules/consensus/index.ts` — exports: `ConsensusService`, `ConsensusResult`, `RetryLoopService`, `NoConsensusResult`
  - [ ] `src/modules/nlu/index.ts` — exports: `OpenCodeNLUService`, `NLURetryService`
  - [ ] `src/modules/nudge/index.ts` — exports: `NudgeService`, `NudgeSchedulerService`
  - [ ] `src/modules/reminder/index.ts` — exports: `ReminderService`

- [ ] Update `src/index.ts` — rewire all imports (AC: 6)
  - [ ] Remove import of `BotHandlers` from `./services/bot-handlers.service`
  - [ ] Import `SchedulingService` from `./modules/scheduling`
  - [ ] Import `NLURetryService` from `./modules/nlu`
  - [ ] Import `NudgeSchedulerService` from `./modules/nudge`
  - [ ] Import `ReminderService` from `./modules/reminder`
  - [ ] Instantiate services in correct dependency order (ConsensusService before SchedulingService)
  - [ ] Wire: `bot.command('schedule', ...)` → `schedulingService.handleSchedule`
  - [ ] Wire: `bot.command('cancel', ...)` → `schedulingService.handleCancel`
  - [ ] Wire: `bot.command('status', ...)` → `schedulingService.handleStatus`
  - [ ] Wire: `bot.command('help', ...)` → inline or keep simple reply
  - [ ] Wire: `bot.on('message', ...)` → `schedulingService.handleAvailabilityResponse`

- [ ] Delete `src/services/bot-handlers.service.ts` (AC: 4)
  - [ ] Only delete after all tests pass

- [ ] Verify (AC: 7, 8)
  - [ ] Run `bun run dev`
  - [ ] Run `bun test`

## Dev Notes

### `SchedulingService` Constructor — Dependency Injection Pattern

```typescript
import { OpenCodeNLUService } from '../nlu/opencode-nlu.service';
import { ConsensusService } from '../consensus/consensus.service';
import { RetryLoopService } from '../consensus/retry-loop.service';

export interface SchedulingRepositories {
  groups: GroupRepository;
  members: MemberRepository;
  rounds: RoundRepository;
  responses: ResponseRepository;
  nluQueue: NLUQueueRepository;
  nudges: NudgeRepository;
  consensus: ConsensusRepository;
}

export class SchedulingService {
  constructor(
    private repos: SchedulingRepositories,
    private nluService: OpenCodeNLUService,
    private consensusService: ConsensusService,
    private retryLoopService: RetryLoopService,
    private bot: any
  ) {}
}
```

### `src/index.ts` Service Initialization Order

```typescript
// 1. Repos (unchanged)
const repositories = { ... };

// 2. Leaf services (no deps on other services)
const nluService = new OpenCodeNLUService();

// 3. Consensus (depends on repos only)
const consensusService = new ConsensusService(repositories);
const retryLoopService = new RetryLoopService({
  rounds: repositories.rounds,
  members: repositories.members,
  responses: repositories.responses,
  nudges: repositories.nudges,
  consensus: repositories.consensus,
});

// 4. GroupService
const groupService = new GroupService({ groups: repositories.groups, members: repositories.members }, bot.telegram);

// 5. SchedulingService (depends on nlu + consensus services)
const schedulingService = new SchedulingService(
  repositories, nluService, consensusService, retryLoopService, bot
);

// 6. Background services
const retryService = new NLURetryService({ responses: repositories.responses, nluQueue: repositories.nluQueue }, bot.telegram);
const nudgeScheduler = new NudgeSchedulerService(repositories, bot);
const reminderService = new ReminderService(repositories, bot.telegram);
```

### Import Path Correction Table for Moved Services

When moving a service from `src/services/` to `src/modules/<module>/`, update its imports:

| Old import | New import (from `src/modules/<module>/`) |
|------------|------------------------------------------|
| `'../db'` | `'../../<module>/db/<repo-name>'` or via module index |
| `'./<other-service>'` | `'../<other-module>/<service>'` |

### Test Files to Port

| Source test file | Port into |
|-----------------|-----------|
| `src/services/bot-handlers.service.test.ts` | Split: group tests → story 8.2 done; scheduling tests → `scheduling.service.test.ts` |
| `src/services/bot-handlers.status.test.ts` | Port entirely → `scheduling.service.test.ts` |

**Do NOT delete** the old test files yet — that is Story 8.4.

### `checkAndAnnounceConsensus` — Cross-Module Dependency

This method (currently in `BotHandlers`) calls `this.consensusService` and `this.bot.telegram`. Place it in `SchedulingService` since it is called after availability confirmation. It uses:
- `this.consensusService.calculateConsensus(roundId)` 
- `this.bot.telegram.sendMessage(groupTelegramId, ...)`
- `this.repos.rounds.findById(roundId)` to get `group.telegramId`

### Project Structure Notes

- `src/services/` folder will be **empty** after this story (all files deleted or moved)
- Architecture doc shows `src/bot/commands/` for handlers — the refactoring plan takes precedence
- `handleHelp` in `BotHandlers`: simplest approach is to move the reply string inline into `src/index.ts` as a one-liner lambda

### References

- [Source: _bmad-output/planning-artifacts/refactoring-plan.md#3.1 Split the God Class]
- [Source: _bmad-output/planning-artifacts/refactoring-plan.md#5 Phase 2]
- [Source: src/services/bot-handlers.service.ts] — remaining methods after Story 8.2
- [Source: src/services/bot-handlers.status.test.ts] — port all tests
- [Source: src/index.ts] — lines 39–52 show current instantiation pattern

## Dev Agent Record

### Agent Model Used

_to be filled by dev agent_

### Debug Log References

### Completion Notes List

### File List
