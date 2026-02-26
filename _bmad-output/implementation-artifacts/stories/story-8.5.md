# Story 8.5: Fix DI Bugs & Dead Code Cleanup

Status: ready-for-dev

## Prerequisite

Story 8.4 must be complete (`src/services/` deleted, all tests passing).

## Story

As a **developer**,
I want to fix two concrete bugs discovered during the refactoring analysis and remove dead code,
so that the bot has no duplicate service instances, no silent bugs, and a clean codebase.

## Acceptance Criteria

1. **Bug fix — Duplicate `ReminderService`**: There is only ONE `ReminderService` instance in the entire process. It is constructed in `src/index.ts` and injected where needed. The `SchedulingService` does NOT construct its own internal `ReminderService`.
2. **Bug fix — Dead method**: `getSlotKey()` in `src/modules/consensus/consensus.service.ts` is deleted (it is a private method that was never called).
3. **Improvement — Centralized `Repositories` type**: `src/core/repositories.ts` exists and exports a single `AllRepositories` interface. All services that previously defined their own partial repo interfaces now use `Pick<AllRepositories, ...>` from this central type.
4. `bun test` passes with zero failures.
5. `bun run dev` starts without errors — reminder functionality works correctly (meetings trigger one reminder, not two).

## Tasks / Subtasks

- [ ] Fix Duplicate ReminderService (AC: 1)
  - [ ] Open `src/modules/scheduling/scheduling.service.ts`
  - [ ] Confirm `SchedulingService` does NOT instantiate `new ReminderService(...)` internally
  - [ ] If it does: remove the internal instance; add `reminderService: ReminderService` to constructor params
  - [ ] Open `src/index.ts`: confirm only ONE `new ReminderService(repositories, bot.telegram)` exists
  - [ ] Confirm `reminderService.start()` is only called once
  - [ ] Confirm `reminderService.stop()` is called in both SIGINT and SIGTERM handlers

- [ ] Delete dead method `getSlotKey()` (AC: 2)
  - [ ] Open `src/modules/consensus/consensus.service.ts`
  - [ ] Find the `private getSlotKey(day: string, times: string[] | undefined): string` method
  - [ ] Confirm it has zero call sites: `grep -n "getSlotKey" src/modules/consensus/consensus.service.ts`
  - [ ] Delete the method body (approximately lines 257–260 in the original file, may differ after moves)
  - [ ] Run `bun test` — confirm no test breaks

- [ ] Create centralized `AllRepositories` type (AC: 3)
  - [ ] Create `src/core/repositories.ts`
  - [ ] Import all 8 repository classes from their module paths
  - [ ] Define and export `AllRepositories` interface:
    ```typescript
    export interface AllRepositories {
      groups: GroupRepository;
      members: MemberRepository;
      rounds: RoundRepository;
      responses: ResponseRepository;
      nluQueue: NLUQueueRepository;
      nudges: NudgeRepository;
      consensus: ConsensusRepository;
      reminders: ReminderRepository;
    }
    ```
  - [ ] Update `SchedulingRepositories` (in `scheduling.service.ts`) to `Pick<AllRepositories, 'groups' | 'members' | 'rounds' | 'responses' | 'nluQueue' | 'nudges' | 'consensus'>`
  - [ ] Update `GroupRepositories` (in `group.service.ts`) to `Pick<AllRepositories, 'groups' | 'members'>`
  - [ ] Update `NLURetryRepositories` (in `nlu-retry.service.ts`) to `Pick<AllRepositories, 'responses' | 'nluQueue'>`
  - [ ] Update `NudgeSchedulerRepositories` (in `nudge-scheduler.service.ts`) to `Pick<AllRepositories, 'rounds' | 'nudges' | 'groups' | 'responses' | 'members'>`
  - [ ] Update `ReminderRepositories` (in `reminder.service.ts`) to `Pick<AllRepositories, 'reminders' | 'responses' | 'rounds' | 'groups' | 'members'>`
  - [ ] Update `src/index.ts` to import `AllRepositories` from `./core/repositories` and type the `repositories` constant

- [ ] Final verification (AC: 4, 5)
  - [ ] Run `bun test` — zero failures
  - [ ] Run `bun run dev` — confirm startup log shows `[ReminderService] Started` exactly once
  - [ ] Grep for duplicate: `grep -r "new ReminderService" src/` — should return exactly 1 result (in `index.ts`)

## Dev Notes

### Bug 1: Duplicate ReminderService — Root Cause

In the original `src/index.ts` (before refactoring), lines 45–51 show `BotHandlers` constructor internally creates a `ReminderService`:
```typescript
// Inside BotHandlers constructor (original)
this.reminderService = new ReminderService({
  reminders: repos.reminders, responses: repos.responses,
  rounds: repos.rounds, groups: repos.groups, members: repos.members
}, bot?.telegram);
```
AND `src/index.ts` also creates one at line 48:
```typescript
const reminderService = new ReminderService(repositories, bot.telegram);
```
Both call `start()`. Both poll the DB every minute. The same reminder rows get processed twice — potential double-send.

**Fix:** After Story 8.3, `SchedulingService` should not own a `ReminderService`. It should receive `scheduleReminders()` calls by injecting the single `ReminderService` instance from `index.ts`, OR simply call `reminderService.scheduleReminders(roundId)` by passing it at construction time.

### Bug 2: Dead `getSlotKey()` Method

In `consensus.service.ts` (original), lines 257–260:
```typescript
private getSlotKey(day: string, times: string[] | undefined): string {
  const timeStr = times && times.length > 0 ? times.join('-') : 'allday';
  return `${day.toLowerCase()}-${timeStr}`;
}
```
This method is **never called anywhere** in the codebase. It was likely a leftover from an earlier implementation approach. Safe to delete without any test impact.

Verify with: `grep -rn "getSlotKey" src/` — should return zero results after deletion.

### `AllRepositories` Central Type Pattern

```typescript
// src/core/repositories.ts
import { GroupRepository } from '../modules/group/db/group-repository';
import { MemberRepository } from '../modules/group/db/member-repository';
import { RoundRepository } from '../modules/scheduling/db/round-repository';
import { ResponseRepository } from '../modules/scheduling/db/response-repository';
import { NLUQueueRepository } from '../modules/nlu/db/nlu-queue-repository';
import { NudgeRepository } from '../modules/nudge/db/nudge-repository';
import { ConsensusRepository } from '../modules/consensus/db/consensus-repository';
import { ReminderRepository } from '../modules/reminder/db/reminder-repository';

export interface AllRepositories {
  groups: GroupRepository;
  members: MemberRepository;
  rounds: RoundRepository;
  responses: ResponseRepository;
  nluQueue: NLUQueueRepository;
  nudges: NudgeRepository;
  consensus: ConsensusRepository;
  reminders: ReminderRepository;
}
```

Service-level interfaces then become:
```typescript
// In scheduling.service.ts — no more duplicated interface
import type { AllRepositories } from '../../core/repositories';
type SchedulingRepositories = Pick<AllRepositories, 'groups' | 'members' | 'rounds' | 'responses' | 'nluQueue' | 'nudges' | 'consensus'>;
```

### Verifying `checkAndAnnounceConsensus` → ReminderService Integration

After meeting consensus is reached, `checkAndAnnounceConsensus` in `SchedulingService` calls `reminderService.scheduleReminders(roundId)`. Ensure:
1. `SchedulingService` receives a `reminderService` reference (inject at construction)
2. The call is: `await this.reminderService.scheduleReminders(roundId)` (not starting a new instance)

### Project Structure Notes

After this story, the final `src/core/` looks like:
```
src/core/
├── db/
│   └── client.ts
└── repositories.ts        ← new central type file
```

No Prisma schema changes. No migration needed. Pure TypeScript/type-level change.

### References

- [Source: _bmad-output/planning-artifacts/refactoring-plan.md#4. Redundant Code & Tests to Clean Up]
- [Source: _bmad-output/planning-artifacts/refactoring-plan.md#5 Phase 4]
- [Source: src/index.ts] — lines 39–52 (original): duplicate ReminderService instantiation
- [Source: src/services/consensus.service.ts] — lines 257–260: dead `getSlotKey()` method
- [Source: src/services/bot-handlers.service.ts] — lines 17–26: original `Repositories` interface

## Dev Agent Record

### Agent Model Used

_to be filled by dev agent_

### Debug Log References

### Completion Notes List

### File List
