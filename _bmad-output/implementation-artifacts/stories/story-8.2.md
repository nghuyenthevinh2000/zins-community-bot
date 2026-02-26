# Story 8.2: Split BotHandlers — Extract Group Service

Status: ready-for-dev

## Prerequisite

Story 8.1 must be complete (module folders and DB files in place).

## Story

As a **developer**,
I want to extract all group-related command handlers from `src/services/bot-handlers.service.ts` into a new `src/modules/group/group.service.ts`,
so that group registration, member management, and settings logic is self-contained in the group module.

## Acceptance Criteria

1. `src/modules/group/group.service.ts` exists and contains: `handleStart`, `handleOptIn`, `handleMembers`, `handleSettings`, and `broadcastSettingChange`.
2. `GroupService` accepts a `GroupRepositories` interface (group + member repos) and a `telegram` instance via constructor. It does NOT depend on any other module's services.
3. `src/modules/group/group.service.test.ts` exists and tests all 5 handler methods with the same coverage as the originals in `bot-handlers.service.test.ts` and `group-settings.test.ts`.
4. `src/index.ts` is updated to instantiate `GroupService` and wire its handlers to the Telegraf bot commands (`start`, `optin`, `members`, `settings`).
5. `BotHandlers` in `src/services/bot-handlers.service.ts` has its group-related methods removed — it now only contains scheduling + availability + NLU helpers.
6. `bun run dev` starts without errors.
7. `bun test` passes with zero failures.

## Tasks / Subtasks

- [ ] Create `src/modules/group/group.service.ts` (AC: 1, 2)
  - [ ] Define `GroupRepositories` interface: `{ groups: GroupRepository; members: MemberRepository }`
  - [ ] Cut `handleStart()` from `BotHandlers` → paste into `GroupService`
  - [ ] Cut `handleOptIn()` from `BotHandlers` → paste into `GroupService`
  - [ ] Cut `handleMembers()` from `BotHandlers` → paste into `GroupService`
  - [ ] Cut `handleSettings()` from `BotHandlers` → paste into `GroupService`
  - [ ] Cut `broadcastSettingChange()` from `BotHandlers` → paste into `GroupService`
  - [ ] Update imports to use `GroupRepository`, `MemberRepository` from `../../modules/group` (or relative path)

- [ ] Create `src/modules/group/group.service.test.ts` (AC: 3)
  - [ ] Port existing `handleStart` tests from `bot-handlers.service.test.ts`
  - [ ] Port existing `handleOptIn` tests from `bot-handlers.service.test.ts`
  - [ ] Port existing `handleMembers` tests from `bot-handlers.service.test.ts`
  - [ ] Port all tests from `src/services/group-settings.test.ts` (settings handler tests)
  - [ ] Use the same mock pattern: `mockRepos` object with jest-compatible mock functions

- [ ] Update `src/modules/group/index.ts` (AC: 2)
  - [ ] Add export for `GroupService` and `GroupRepositories`

- [ ] Update `src/index.ts` (AC: 4)
  - [ ] Import `GroupService` from `./modules/group`
  - [ ] Instantiate: `const groupService = new GroupService({ groups: repositories.groups, members: repositories.members }, bot.telegram)`
  - [ ] Change: `bot.start(...)` → delegates to `groupService.handleStart`
  - [ ] Change: `bot.command('optin', ...)` → delegates to `groupService.handleOptIn`
  - [ ] Change: `bot.command('members', ...)` → delegates to `groupService.handleMembers`
  - [ ] Change: `bot.command('settings', ...)` → delegates to `groupService.handleSettings`

- [ ] Remove group methods from `BotHandlers` (AC: 5)
  - [ ] Delete: `handleStart`, `handleOptIn`, `handleMembers`, `handleSettings`, `broadcastSettingChange`
  - [ ] Update `BotHandlers` constructor to remove group repos it no longer needs directly
  - [ ] Update `Repositories` interface if group repos are no longer needed by `BotHandlers`

- [ ] Verify (AC: 6, 7)
  - [ ] Run `bun run dev`
  - [ ] Run `bun test`

## Dev Notes

### Methods Being Moved

| Method | Lines in `bot-handlers.service.ts` | Notes |
|--------|-------------------------------------|-------|
| `handleStart` | ~55–102 | Handles both private (optin_payload) and group (register) |
| `handleOptIn` | ~172–204 | Group chat opt-in |
| `handleMembers` | ~393–436 | Displays opted-in / not-opted-in list |
| `handleSettings` | ~438–621 | View + update threshold / interval / max_nudges |
| `broadcastSettingChange` | ~627–657 | Private helper for settings; sends to group chat via `this.bot.telegram` |

### `GroupService` Constructor Signature

```typescript
export interface GroupRepositories {
  groups: GroupRepository;
  members: MemberRepository;
}

export class GroupService {
  constructor(
    private repos: GroupRepositories,
    private telegram: any  // Telegraf telegram instance for broadcastSettingChange
  ) {}
}
```

### Test Mock Pattern (Existing Pattern — Do NOT Change)

All existing tests use `bun:test` (not Jest). The mock pattern used across the codebase:

```typescript
import { describe, test, expect, mock, beforeEach } from 'bun:test';

const mockGroups = {
  findByTelegramId: mock(() => Promise.resolve(null)),
  findOrCreate: mock(() => Promise.resolve({ id: 'g1', name: 'Test', telegramId: '-100' })),
  getConsensusThreshold: mock(() => Promise.resolve(75)),
  getAllSettings: mock(() => Promise.resolve({ consensusThreshold: 75, nudgeIntervalHours: 24, maxNudgeCount: 3 })),
  updateSettings: mock(() => Promise.resolve()),
};
const mockMembers = {
  optIn: mock(() => Promise.resolve({ userId: 'u1', groupId: 'g1' })),
  isOptedIn: mock(() => Promise.resolve(true)),
  findOptedInByGroup: mock(() => Promise.resolve([])),
  getOptInStatusByGroup: mock(() => Promise.resolve({ optedIn: [], notOptedIn: [] })),
};
```

### Orphaned Test File to Merge

`src/services/group-settings.test.ts` — tests `handleSettings` and setting validation. All tests in this file must be ported into `src/modules/group/group.service.test.ts`. Do NOT delete `group-settings.test.ts` until Story 8.4 (cleanup phase).

### What Stays in `BotHandlers`

After this story, `BotHandlers` still contains:
- `handleSchedule`, `handleCancel`, `handleStatus`
- `handleAvailabilityResponse`, `parseAvailabilityWithVagueCheck`
- `sendAvailabilityRequests`, `sendConfirmationRequest`
- `parseScheduleCommand`, `findMemberWithActiveRound`
- `checkAndAnnounceConsensus`, `handleHelp`

These are extracted in Story 8.3.

### Project Structure Notes

- Alignment: architecture doc says `src/bot/handlers/` for opt-in handlers; the refactoring plan overrides this to `src/modules/group/group.service.ts` — follow the refactoring plan
- Test files: co-located to source per architecture convention
- `handleHelp` stays in `BotHandlers` for now (moved to `src/index.ts` or a tiny inline in Story 8.3)

### References

- [Source: _bmad-output/planning-artifacts/refactoring-plan.md#3.1 Split the God Class]
- [Source: _bmad-output/planning-artifacts/refactoring-plan.md#5 Phase 2]
- [Source: src/services/bot-handlers.service.ts] — full file, group methods on lines 55–657
- [Source: src/services/group-settings.test.ts] — all tests must be ported
- [Source: src/services/bot-handlers.service.test.ts] — port group-related tests only

## Dev Agent Record

### Agent Model Used

_to be filled by dev agent_

### Debug Log References

### Completion Notes List

### File List
