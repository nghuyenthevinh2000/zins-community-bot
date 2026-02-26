# Story 8.4: Consolidate Orphaned Tests & Delete Dead Files

Status: done

## Prerequisite

Story 8.3 must be complete (all services in modules, `src/services/` empty, `bun test` passes).

## Story

As a **developer**,
I want to remove all files that are now obsolete after the service extraction in Stories 8.2–8.3,
so that there are no dead test files, no empty directories, and the repo is clean.

## Acceptance Criteria

1. The following source files are **permanently deleted**:
   - `src/services/bot-handlers.service.ts` *(should already be gone from 8.3; confirm)*
   - `src/services/bot-handlers.service.test.ts`
   - `src/services/bot-handlers.status.test.ts`
   - `src/services/group-settings.test.ts`
2. `src/services/` directory is **removed** (it should be empty after deletions).
3. `src/db/` directory contains **only** `index.ts` (the proxy barrel). Confirm all other db files were moved in 8.1.
4. `bun test` passes with zero failures — no test is lost; all coverage exists in the new module test files.
5. `bun run dev` starts without errors.

## Tasks / Subtasks

- [ ] Verify Story 8.3 completion (prerequisite check)
  - [ ] Confirm `bun test` passes before starting
  - [ ] Confirm `src/services/bot-handlers.service.ts` is already deleted

- [ ] Verify test coverage is fully ported (AC: 4)
  - [ ] Confirm: every test in `bot-handlers.service.test.ts` exists in either `group.service.test.ts` or `scheduling.service.test.ts`
  - [ ] Confirm: every test in `bot-handlers.status.test.ts` exists in `scheduling.service.test.ts`
  - [ ] Confirm: every test in `group-settings.test.ts` exists in `group.service.test.ts`
  - [ ] If any test is missing, add it to the appropriate module test file BEFORE deleting the source

- [ ] Delete obsolete test files (AC: 1)
  - [ ] Delete `src/services/bot-handlers.service.test.ts`
  - [ ] Delete `src/services/bot-handlers.status.test.ts`
  - [ ] Delete `src/services/group-settings.test.ts`

- [ ] Remove empty `src/services/` directory (AC: 2)
  - [ ] Confirm the directory is empty: `ls src/services/`
  - [ ] Delete directory: `rmdir src/services/`

- [ ] Verify `src/db/` is clean (AC: 3)
  - [ ] Confirm only `index.ts` remains in `src/db/`
  - [ ] If any stale files remain (moved in 8.1 but not deleted), delete them now

- [ ] Final verification (AC: 4, 5)
  - [ ] Run `bun test` — zero failures, zero skipped
  - [ ] Run `bun run dev` — no startup errors
  - [ ] Check git diff: confirm no unintended file changes

## Dev Notes

### Test Coverage Verification Checklist

Before deleting any test file, **manually verify** the following test cases exist in their new locations:

#### From `bot-handlers.service.test.ts` — Check in `group.service.test.ts`:
- [ ] `handleStart` → group registration (new_chat_members flow)
- [ ] `handleStart` → private DM with `optin_` payload
- [ ] `handleOptIn` → success case
- [ ] `handleOptIn` → private DM error case
- [ ] `handleMembers` → opted-in and not-opted-in lists

#### From `bot-handlers.service.test.ts` — Check in `scheduling.service.test.ts`:
- [ ] `handleSchedule` → happy path (round created, DMs sent)
- [ ] `handleSchedule` → duplicate round prevention
- [ ] `handleSchedule` → not opted-in user rejected
- [ ] `handleCancel` → happy path
- [ ] `handleCancel` → no active round error
- [ ] `handleAvailabilityResponse` → new response, confirmation sent
- [ ] `handleAvailabilityResponse` → pending confirmation, "yes" confirms
- [ ] `handleAvailabilityResponse` → pending confirmation, correction re-parses

#### From `bot-handlers.status.test.ts` — Check in `scheduling.service.test.ts`:
- [ ] `handleStatus` → no active round
- [ ] `handleStatus` → active round with respondent counts
- [ ] `handleStatus` → consensus achieved display
- [ ] `handleStatus` → consensus not yet achieved display

#### From `group-settings.test.ts` — Check in `group.service.test.ts`:
- [ ] `/settings` → no args, shows current settings
- [ ] `/settings threshold 60` → valid update
- [ ] `/settings threshold 40` → invalid (below 50), rejected
- [ ] `/settings interval 12` → valid update
- [ ] `/settings interval 0` → invalid, rejected
- [ ] `/settings max_nudges 5` → valid update
- [ ] `/settings max_nudges 11` → invalid (above 10), rejected
- [ ] `/settings unknown` → unknown setting error

### Safe Deletion Approach

1. Run `bun test` first (must be green)
2. Delete one file at a time
3. Run `bun test` again after each deletion — catch any unexpected dependency

### Files That Must NOT Be Deleted

- `src/db/index.ts` — the proxy barrel; consumed by existing code
- `src/modules/**/index.ts` — module re-exports
- Any `*.test.ts` in `src/modules/` — newly created test files

### Project Structure Notes

After this story, `src/` should look like:
```
src/
├── core/
│   └── db/
│       └── client.ts
├── db/
│   └── index.ts          ← proxy barrel only
├── modules/
│   ├── group/
│   ├── scheduling/
│   ├── consensus/
│   ├── nlu/
│   ├── nudge/
│   └── reminder/
└── index.ts              ← entry point
```

`src/services/` — **does not exist any more**.

### References

- [Source: _bmad-output/planning-artifacts/refactoring-plan.md#6. Files to Delete After Refactor]
- [Source: _bmad-output/planning-artifacts/refactoring-plan.md#5 Phase 3]
- [Source: src/services/group-settings.test.ts] — full test list to verify ported
- [Source: src/services/bot-handlers.status.test.ts] — full test list to verify ported

## Dev Agent Record

### Agent Model Used

_to be filled by dev agent_

### Debug Log References

### Completion Notes List

### File List
