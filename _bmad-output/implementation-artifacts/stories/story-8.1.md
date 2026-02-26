# Story 8.1: Module Scaffold — Create Folder Structure & Move DB Files

Status: done

## Story

As a **developer**,
I want to reorganize `src/db/` files into co-located feature module folders under `src/modules/`,
so that each domain's repository lives next to its service code and the project is ready for future module expansion.

## Acceptance Criteria

1. The new `src/modules/` directory tree exists with all 6 module folders and their nested `db/` subdirectories.
2. All 9 repository files (and their existing test files) are moved verbatim into their domain `db/` subfolder — **zero logic changes**.
3. `src/db/index.ts` is updated to re-export everything from the new module paths, so all existing consumers (`src/index.ts`, `src/services/*.ts`) compile without any import changes.
4. `src/db/client.ts` is moved to `src/core/db/client.ts` and `src/db/index.ts` re-exports `getPrismaClient` and `disconnectPrisma` from the new path.
5. Each module folder has an `index.ts` that re-exports its own repositories (and nothing else at this stage).
6. `bun run dev` starts without errors after the move.
7. `bun test` passes with zero failures — no test logic is modified.

## Tasks / Subtasks

- [ ] Create module directory structure (AC: 1)
  - [ ] `mkdir -p src/modules/{group,scheduling,consensus,nlu,nudge,reminder}/db`
  - [ ] `mkdir -p src/core/db`

- [ ] Move `src/db/client.ts` → `src/core/db/client.ts` (AC: 4)
  - [ ] Update internal path references inside `client.ts` if any exist

- [ ] Move Group domain DB files (AC: 2)
  - [ ] `src/db/group-repository.ts` → `src/modules/group/db/group-repository.ts`
  - [ ] `src/db/group-repository.test.ts` → `src/modules/group/db/group-repository.test.ts`
  - [ ] `src/db/member-repository.ts` → `src/modules/group/db/member-repository.ts`
  - [ ] `src/db/member-repository.test.ts` → `src/modules/group/db/member-repository.test.ts`

- [ ] Move Scheduling domain DB files (AC: 2)
  - [ ] `src/db/round-repository.ts` → `src/modules/scheduling/db/round-repository.ts`
  - [ ] `src/db/round-repository.test.ts` → `src/modules/scheduling/db/round-repository.test.ts`
  - [ ] `src/db/response-repository.ts` → `src/modules/scheduling/db/response-repository.ts`
  - [ ] `src/db/response-repository.test.ts` → `src/modules/scheduling/db/response-repository.test.ts`

- [ ] Move Consensus domain DB files (AC: 2)
  - [ ] `src/db/consensus-repository.ts` → `src/modules/consensus/db/consensus-repository.ts`
  - [ ] *(no existing test file — leave a TODO comment in module index)*

- [ ] Move NLU domain DB files (AC: 2)
  - [ ] `src/db/nlu-queue-repository.ts` → `src/modules/nlu/db/nlu-queue-repository.ts`
  - [ ] `src/db/nlu-queue-repository.test.ts` → `src/modules/nlu/db/nlu-queue-repository.test.ts`

- [ ] Move Nudge domain DB files (AC: 2)
  - [ ] `src/db/nudge-repository.ts` → `src/modules/nudge/db/nudge-repository.ts`
  - [ ] `src/db/nudge-repository.test.ts` → `src/modules/nudge/db/nudge-repository.test.ts`

- [ ] Move Reminder domain DB files (AC: 2)
  - [ ] `src/db/reminder-repository.ts` → `src/modules/reminder/db/reminder-repository.ts`
  - [ ] *(no existing test file)*

- [ ] Fix internal imports inside moved files (AC: 2)
  - [ ] Each repository imports `getPrismaClient` from `'../../client'` (old path) — update to `'../../../core/db/client'`
  - [ ] Each test file imports from its repository — update to local relative path `'./<name>'`

- [ ] Create per-module `index.ts` re-export files (AC: 5)
  - [ ] `src/modules/group/index.ts` — exports GroupRepository, MemberRepository
  - [ ] `src/modules/scheduling/index.ts` — exports RoundRepository, ResponseRepository
  - [ ] `src/modules/consensus/index.ts` — exports ConsensusRepository, TimeSlot, ConsensusCalculation
  - [ ] `src/modules/nlu/index.ts` — exports NLUQueueRepository
  - [ ] `src/modules/nudge/index.ts` — exports NudgeRepository
  - [ ] `src/modules/reminder/index.ts` — exports ReminderRepository

- [ ] Update `src/db/index.ts` to proxy from new module paths (AC: 3, 4)
  - [ ] Replace direct file imports with re-exports from `../modules/<module>`
  - [ ] Re-export `getPrismaClient`, `disconnectPrisma` from `../core/db/client`
  - [ ] **Do NOT change** `src/index.ts` or any `src/services/*.ts` file imports — they must keep working unchanged

- [ ] Verify (AC: 6, 7)
  - [ ] Run `bun run dev` — confirm no TypeScript errors at startup
  - [ ] Run `bun test` — confirm all tests pass

## Dev Notes

### ⚠️ Pure Structural Change — No Logic Modifications
This story is **file moves only**. Do NOT:
- Change any function, class, or type definitions
- Modify any test logic or mock setups
- Change any imports in `src/index.ts` or `src/services/*.ts`

The only files that CHANGE content are:
1. `src/db/index.ts` — updated to proxy from new paths
2. Internal `import` paths inside the moved repository files (they reference `client.ts`)
3. Internal `import` paths inside moved test files (they reference their repository)

### Target Directory Structure After This Story

```
src/
├── core/
│   └── db/
│       └── client.ts                          ← moved from src/db/client.ts
├── modules/
│   ├── group/
│   │   ├── index.ts
│   │   └── db/
│   │       ├── group-repository.ts
│   │       ├── group-repository.test.ts
│   │       ├── member-repository.ts
│   │       └── member-repository.test.ts
│   ├── scheduling/
│   │   ├── index.ts
│   │   └── db/
│   │       ├── round-repository.ts
│   │       ├── round-repository.test.ts
│   │       ├── response-repository.ts
│   │       └── response-repository.test.ts
│   ├── consensus/
│   │   ├── index.ts                           ← includes TODO for missing test
│   │   └── db/
│   │       └── consensus-repository.ts
│   ├── nlu/
│   │   ├── index.ts
│   │   └── db/
│   │       ├── nlu-queue-repository.ts
│   │       └── nlu-queue-repository.test.ts
│   ├── nudge/
│   │   ├── index.ts
│   │   └── db/
│   │       ├── nudge-repository.ts
│   │       └── nudge-repository.test.ts
│   └── reminder/
│       ├── index.ts
│       └── db/
│           └── reminder-repository.ts
├── db/
│   └── index.ts                               ← updated proxy re-exports ONLY
└── services/                                  ← UNCHANGED
```

### Internal Import Pattern in Repository Files

Each repository currently does:
```typescript
import { getPrismaClient } from './client';
```
After the move, update to:
```typescript
import { getPrismaClient } from '../../../core/db/client';
```
*(3 levels up from `src/modules/<module>/db/` to `src/`, then into `core/db/client`)*

### Updated `src/db/index.ts` Template

```typescript
// Proxy re-exports — preserves all existing consumer imports unchanged
export { getPrismaClient, disconnectPrisma } from '../core/db/client';
export { GroupRepository } from '../modules/group/db/group-repository';
export { MemberRepository } from '../modules/group/db/member-repository';
export { RoundRepository } from '../modules/scheduling/db/round-repository';
export { ResponseRepository } from '../modules/scheduling/db/response-repository';
export { NLUQueueRepository } from '../modules/nlu/db/nlu-queue-repository';
export { NudgeRepository } from '../modules/nudge/db/nudge-repository';
export { ConsensusRepository, type TimeSlot, type ConsensusCalculation } from '../modules/consensus/db/consensus-repository';
export { ReminderRepository } from '../modules/reminder/db/reminder-repository';
```

### Project Structure Notes

- Architecture doc (`_bmad-output/planning-artifacts/architecture.md`) defines the original structure; this story deviates intentionally per the refactoring plan
- The refactoring plan is at `_bmad-output/planning-artifacts/refactoring-plan.md` — refer to Section 2 (Target Module Structure) and Section 5 Phase 1
- Bun runtime + `bun test` is the test runner (not Jest, not vitest)
- Prisma client is a singleton — `client.ts` uses a module-level `let prisma` pattern; moving the file path requires no prisma schema changes

### References

- [Source: _bmad-output/planning-artifacts/refactoring-plan.md#2. Target Module Structure]
- [Source: _bmad-output/planning-artifacts/refactoring-plan.md#5. Implementation Phases - Phase 1]
- [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries]
- [Source: src/db/index.ts] — current db barrel (10 lines)
- [Source: src/db/client.ts] — Prisma singleton

## Dev Agent Record

### Agent Model Used

claude-sonnet-4.6

### Debug Log References

None — clean execution, no issues encountered.

### Completion Notes List

- All 9 repository files moved verbatim to their module `db/` subfolders with zero logic changes.
- `src/db/client.ts` copied to `src/core/db/client.ts`.
- All `import { getPrismaClient } from './client'` updated to `'../../../core/db/client'` in moved repository files.
- Cross-domain test file imports fixed (scheduling/nlu/nudge tests that imported from group/scheduling modules).
- Per-module `index.ts` files created for all 6 modules.
- `src/db/index.ts` updated to proxy all re-exports from new module paths.
- `bun test`: 133 pass, 0 fail across 20 files.
- `bun run dev`: starts without TypeScript errors.

### File List

**New files created:**
- `src/core/db/client.ts`
- `src/modules/group/index.ts`
- `src/modules/group/db/group-repository.ts`
- `src/modules/group/db/group-repository.test.ts`
- `src/modules/group/db/member-repository.ts`
- `src/modules/group/db/member-repository.test.ts`
- `src/modules/scheduling/index.ts`
- `src/modules/scheduling/db/round-repository.ts`
- `src/modules/scheduling/db/round-repository.test.ts`
- `src/modules/scheduling/db/response-repository.ts`
- `src/modules/scheduling/db/response-repository.test.ts`
- `src/modules/consensus/index.ts`
- `src/modules/consensus/db/consensus-repository.ts`
- `src/modules/nlu/index.ts`
- `src/modules/nlu/db/nlu-queue-repository.ts`
- `src/modules/nlu/db/nlu-queue-repository.test.ts`
- `src/modules/nudge/index.ts`
- `src/modules/nudge/db/nudge-repository.ts`
- `src/modules/nudge/db/nudge-repository.test.ts`
- `src/modules/reminder/index.ts`
- `src/modules/reminder/db/reminder-repository.ts`

**Modified files:**
- `src/db/index.ts` — updated to proxy re-exports from new module paths
