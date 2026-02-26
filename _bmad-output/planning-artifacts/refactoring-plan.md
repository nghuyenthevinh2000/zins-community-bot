# Refactoring Plan: Module-Based Architecture

**Date:** 2026-02-26  
**Project:** zins-community-bot  
**Goals:**
1. Reorganize `src/services` and `src/db` into co-located feature modules
2. Clean up redundant code and tests

---

## 1. Current State Analysis

### `src/services/` (16 files)
| File | Domain |
|------|--------|
| `bot-handlers.service.ts` | **Core** – Telegram command router (999 lines, GOD class) |
| `bot-handlers.service.test.ts` | tests for above |
| `bot-handlers.status.test.ts` | duplicate/split test for status |
| `consensus.service.ts` | **Consensus** |
| `consensus.service.test.ts` | tests for above |
| `group-settings.test.ts` | **GroupSettings** – tests only, no matching service file |
| `nlu-retry.service.ts` | **NLU** – retry queue consumer |
| `nlu-retry.service.test.ts` | tests for above |
| `nudge-scheduler.service.ts` | **Nudge** – scheduling loop |
| `nudge-scheduler.service.test.ts` | tests for above |
| `nudge.service.ts` | **Nudge** – nudge sending logic |
| `opencode-nlu.service.ts` | **NLU** – OpenCode API client |
| `reminder.service.ts` | **Reminder** |
| `reminder.service.test.ts` | tests for above |
| `retry-loop.service.ts` | **Consensus** – no-consensus retry loop |
| `retry-loop.service.test.ts` | tests for above |

### `src/db/` (16 files)
| File | Domain |
|------|--------|
| `client.ts` | **Core** – Prisma singleton |
| `index.ts` | **Core** – re-export barrel |
| `group-repository.ts` | **Group** |
| `group-repository.test.ts` | tests for above |
| `member-repository.ts` | **Group** (membership) |
| `member-repository.test.ts` | tests for above |
| `round-repository.ts` | **Scheduling** |
| `round-repository.test.ts` | tests for above |
| `response-repository.ts` | **Scheduling** (availability) |
| `response-repository.test.ts` | tests for above |
| `consensus-repository.ts` | **Consensus** |
| `nlu-queue-repository.ts` | **NLU** |
| `nlu-queue-repository.test.ts` | tests for above |
| `nudge-repository.ts` | **Nudge** |
| `nudge-repository.test.ts` | tests for above |
| `reminder-repository.ts` | **Reminder** |

---

## 2. Target Module Structure

```
src/
├── core/                           # Telegram bot wire-up + entry
│   ├── bot.ts                      # Telegraf instance, command registration
│   ├── repositories.ts             # Repositories object factory (replaces index.ts plumbing)
│   └── db/
│       └── client.ts               # Prisma singleton (moved from src/db/)
│
├── modules/
│   ├── group/                      # Group registration, membership, opt-in, settings
│   │   ├── group.service.ts        # handleStart, handleOptIn, handleMembers, handleSettings
│   │   ├── group.service.test.ts
│   │   ├── db/
│   │   │   ├── group-repository.ts
│   │   │   ├── group-repository.test.ts
│   │   │   ├── member-repository.ts
│   │   │   └── member-repository.test.ts
│   │   └── index.ts                # re-exports GroupRepository, MemberRepository, GroupService
│   │
│   ├── scheduling/                 # Round lifecycle: create, cancel, status, availability
│   │   ├── scheduling.service.ts   # handleSchedule, handleCancel, handleStatus,
│   │   │                           # handleAvailabilityResponse, sendAvailabilityRequests
│   │   ├── scheduling.service.test.ts
│   │   ├── db/
│   │   │   ├── round-repository.ts
│   │   │   ├── round-repository.test.ts
│   │   │   ├── response-repository.ts
│   │   │   └── response-repository.test.ts
│   │   └── index.ts
│   │
│   ├── consensus/                  # Consensus calculation + retry-loop on no-consensus
│   │   ├── consensus.service.ts    # calculateConsensus, findBestTimeSlot, confirmMeeting
│   │   ├── consensus.service.test.ts
│   │   ├── retry-loop.service.ts   # handleNoConsensus, checkAndHandleNoConsensus
│   │   ├── retry-loop.service.test.ts
│   │   ├── db/
│   │   │   ├── consensus-repository.ts
│   │   │   └── consensus-repository.test.ts  # (new, currently missing)
│   │   └── index.ts
│   │
│   ├── nlu/                        # NLU parsing + retry queue
│   │   ├── opencode-nlu.service.ts # OpenCode API client (unchanged)
│   │   ├── nlu-retry.service.ts    # Queue consumer
│   │   ├── nlu-retry.service.test.ts
│   │   ├── db/
│   │   │   ├── nlu-queue-repository.ts
│   │   │   └── nlu-queue-repository.test.ts
│   │   └── index.ts
│   │
│   ├── nudge/                      # Nudge scheduling + sending
│   │   ├── nudge.service.ts        # processNudges (core logic)
│   │   ├── nudge-scheduler.service.ts   # setInterval wrapper
│   │   ├── nudge-scheduler.service.test.ts
│   │   ├── db/
│   │   │   ├── nudge-repository.ts
│   │   │   └── nudge-repository.test.ts
│   │   └── index.ts
│   │
│   └── reminder/                   # Pre-meeting reminders
│       ├── reminder.service.ts
│       ├── reminder.service.test.ts
│       ├── db/
│       │   └── reminder-repository.ts
│       └── index.ts
│
└── index.ts                        # Entry point: imports from core/, bootstraps everything
```

---

## 3. Key Refactoring Changes

### 3.1 Split the God Class: `bot-handlers.service.ts`
This 999-line file handles commands from ALL domains. Break it up:

| Current handler method | Moves to |
|------------------------|----------|
| `handleStart` | `modules/group/group.service.ts` |
| `handleOptIn` | `modules/group/group.service.ts` |
| `handleMembers` | `modules/group/group.service.ts` |
| `handleSettings` | `modules/group/group.service.ts` |
| `handleHelp` | `core/bot.ts` (inline or small helper) |
| `handleSchedule` | `modules/scheduling/scheduling.service.ts` |
| `handleCancel` | `modules/scheduling/scheduling.service.ts` |
| `handleStatus` | `modules/scheduling/scheduling.service.ts` |
| `handleAvailabilityResponse` | `modules/scheduling/scheduling.service.ts` |
| `parseScheduleCommand` | `modules/scheduling/scheduling.service.ts` |
| `parseAvailabilityWithVagueCheck` | `modules/scheduling/scheduling.service.ts` |
| `sendAvailabilityRequests` | `modules/scheduling/scheduling.service.ts` |
| `checkAndAnnounceConsensus` | `modules/consensus/consensus.service.ts` |
| `sendConfirmationRequest` | `modules/scheduling/scheduling.service.ts` |
| `broadcastSettingChange` | `modules/group/group.service.ts` |
| `findMemberWithActiveRound` | `modules/scheduling/scheduling.service.ts` |

### 3.2 `src/index.ts` → `src/core/bot.ts` + `src/index.ts`
- `src/index.ts` becomes a thin bootstrapper (just: create repos, wire modules, launch)
- `src/core/bot.ts` holds: `bot.command(...)` registrations, middleware

### 3.3 `Repositories` interface
- Currently defined inside `bot-handlers.service.ts` — move to `src/core/repositories.ts`
- Each module defines its own scoped repo interface (they already partially do this, e.g. `NudgeSchedulerRepositories`)

---

## 4. Redundant Code & Tests to Clean Up

### 4.1 Duplicate/Split Test Files
| File | Issue | Action |
|------|-------|--------|
| `bot-handlers.status.test.ts` | Tests `handleStatus` separately from `bot-handlers.service.test.ts` | **Merge** into `scheduling.service.test.ts` after split |
| `group-settings.test.ts` | Tests settings logic but there is **no `group-settings.service.ts`** — tests are in `bot-handlers.service.test.ts` | **Consolidate** into `group.service.test.ts` after split |

### 4.2 Dead/Redundant Code in `bot-handlers.service.ts`
| Symbol | Issue |
|--------|-------|
| `getSlotKey()` in `consensus.service.ts` | Private method that's **never called** — delete |
| `nudge.service.ts` — exported but tests only happen via `nudge-scheduler.service.test.ts` | Add direct unit test coverage or consolidate |

### 4.3 Duplicate `ReminderService` instantiation in `src/index.ts`
- `BotHandlers` constructor instantiates a `ReminderService` internally (line 45-51)
- `src/index.ts` also instantiates a second `ReminderService` (line 48)
- These are **two separate instances** sharing the same DB, causing potential double-processing
- **Fix:** After split, `index.ts` should own the single instance; `scheduling.service.ts` should receive it via DI

### 4.4 `Repositories` type scattered
- `Repositories` interface is in `bot-handlers.service.ts` 
- `NLURetryRepositories`, `NudgeSchedulerRepositories`, `ReminderRepositories` each re-declare overlapping subsets
- **Consolidate** into a single `src/core/repositories.ts` with: full `AllRepositories` type + typed per-module subsets via `Pick<>`

---

## 5. Implementation Phases

### Phase 1: Module Scaffold (no logic move, just structure)
1. Create empty folder structure: `src/modules/{group,scheduling,consensus,nlu,nudge,reminder}/db/`
2. Move DB files verbatim (no code change), update `src/db/index.ts` → re-export from modules
3. Each module gets an `index.ts` re-exporting its repos and services

### Phase 2: Split `bot-handlers.service.ts`
1. Create `group.service.ts` — extract group-related handlers
2. Create `scheduling.service.ts` — extract scheduling + availability handlers
3. Update `core/bot.ts` to wire handlers from both services
4. Keep `BotHandlers` as a facade/adapter temporarily if needed for backward compat

### Phase 3: Consolidate tests
1. Merge `bot-handlers.status.test.ts` → `scheduling.service.test.ts`
2. Merge `group-settings.test.ts` → `group.service.test.ts`
3. Delete merged source files

### Phase 4: Fix the two DI bugs
1. Remove the duplicate `ReminderService` from `BotHandlers` constructor
2. Consolidate `Repositories` interface into `src/core/repositories.ts`
3. Delete dead `getSlotKey()` method

### Phase 5: Verify
1. Run `bun run dev` — confirm bot boots
2. Run tests — all green
3. Smoke test: `/start`, `/schedule`, `/status` in Telegram

---

## 6. Files to Delete After Refactor

| File | Reason |
|------|--------|
| `src/services/bot-handlers.service.ts` | Split into group + scheduling services |
| `src/services/bot-handlers.service.test.ts` | Split into module-specific test files |
| `src/services/bot-handlers.status.test.ts` | Merged into `scheduling.service.test.ts` |
| `src/services/group-settings.test.ts` | Merged into `group.service.test.ts` |
| `src/db/index.ts` | Replaced by per-module `index.ts` re-exports |

---

## 7. Risk Notes

- **No Prisma schema changes** — this is purely structural
- **No API contract changes** — all Telegram commands remain the same
- **Test coverage** for `consensus-repository.ts` is currently **zero** — add tests in Phase 1 while moving file
- The `bot` (`any` type) passed around everywhere — NOT blocking for this refactor, but a future type-safety improvement

---

## 8. Estimated Effort

| Phase | Complexity | Notes |
|-------|-----------|-------|
| Phase 1: Scaffold | Low | Pure file moves, import path updates |
| Phase 2: Split BotHandlers | Medium | Careful extraction of 999 LOC, dependency injection |
| Phase 3: Consolidate tests | Low | Mechanical merge + delete |
| Phase 4: Fix DI bugs | Low | Small targeted fixes |
| Phase 5: Verify | Low | Manual + automated |
