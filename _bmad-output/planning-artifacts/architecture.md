---
stepsCompleted: [step-01-init, step-02-context, step-03-starter, step-04-decisions, step-05-patterns, step-06-structure, step-07-validation, step-08-complete]
inputDocuments: [prd.md, product-brief-zins-community-bot-2026-02-24.md]
workflowType: 'architecture'
project_name: 'zins-community-bot'
user_name: 'Vinh'
date: '2026-02-24'
status: 'complete'
completedAt: '2026-02-24T14:16:29+07:00'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
31 FRs across 8 capability areas. Core architectural challenge: orchestrating a multi-step, event-driven scheduling workflow across two external APIs (Telegram, Gemini) with stateful persistence and real-time incremental consensus.

**Non-Functional Requirements:**
12 NFRs emphasizing performance (3s command ack, 5s NLU parse), reliability (survive restarts, Gemini failure recovery), integration (Telegram rate limits, webhook retry), and scalability (10+ concurrent groups).

**Scale & Complexity:**

- Primary domain: Event-driven API backend
- Complexity level: Low-Medium
- Estimated architectural components: 6-8 (Telegram adapter, Gemini NLU service, scheduling workflow engine, consensus calculator, nudging scheduler, data persistence layer, settings manager)

### Technical Constraints & Dependencies

- Telegram Bot API: webhook-based, rate-limited (30 msg/s global, 1 msg/s per chat)
- Google Gemini API: OAuth-based, external dependency for NLU
- PostgreSQL: persistence layer for all state
- No web UI — all interaction through Telegram

### Cross-Cutting Concerns Identified

- **Error handling & resilience**: Graceful degradation when Gemini or Telegram APIs are unavailable
- **Rate limiting**: Telegram message staggering across multiple groups
- **State management**: Scheduling round state must survive restarts; no in-memory-only state
- **Observability**: Tracking scheduling round progress, API call success/failure rates

## Starter Template Evaluation

### Primary Technology Domain

Event-driven API backend (Telegram Bot) — TypeScript on Bun runtime

### Selected Starter: Custom TypeScript Project

**Rationale:** For a focused API backend, a clean custom setup gives full control over architecture. Telegraf provides the bot framework — no need for an additional boilerplate layer.

**Initialization Command:**

```bash
mkdir zins-community-bot && cd zins-community-bot
bun init
bun add telegraf @google/generative-ai pg dotenv node-cron
bun add -D @types/pg prisma
npx prisma init
```

### Architectural Decisions Provided by Starter

| Category | Decision |
|---|---|
| **Runtime** | Bun (built-in TypeScript, faster startup, built-in test runner) |
| **Bot Framework** | Telegraf v4.16.3 (Telegram Bot API 7.1) |
| **AI/NLU** | `@google/generative-ai` (Gemini SDK) |
| **Database** | PostgreSQL via Prisma ORM (type-safe queries, migrations) |
| **Scheduling** | `node-cron` for nudging timers |
| **Config** | `dotenv` for environment variables |
| **Testing** | `bun:test` (built-in) |
| **Containerization** | Docker + docker-compose (PostgreSQL + bot service) |

**Note:** Project initialization using this command should be the first implementation story.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
All resolved — runtime, framework, database, AI integration, containerization

**Deferred Decisions (Post-MVP):**
- Service Account / Vertex AI migration (if API key quotas become limiting)
- CI/CD pipeline selection
- Monitoring/APM tooling

### Data Architecture

| Decision | Choice | Rationale |
|---|---|---|
| **Database** | PostgreSQL | Relational model fits structured scheduling data |
| **ORM** | Prisma | Type-safe queries, auto-generated migrations, schema-as-code |
| **Migration strategy** | Prisma Migrate | Schema versioning via `prisma migrate dev/deploy` |

### Authentication & Security

| Decision | Choice | Rationale |
|---|---|---|
| **Telegram auth** | BotFather token via `BOT_TOKEN` env var | Standard Telegram Bot API auth |
| **Gemini auth** | API key via `GEMINI_API_KEY` env var | Simplest for MVP; migrate to service account if quotas limit |
| **Secrets management** | `.env` file (dev), Docker env vars (prod) | Standard 12-factor app approach |

### API & Communication Patterns

| Decision | Choice | Rationale |
|---|---|---|
| **Bot transport** | Webhook (all environments) | Consistent behavior; lower latency; production-ready from day one |
| **Local dev tunnel** | ngrok or cloudflared | Required to expose local webhook endpoint to Telegram |
| **Error handling** | Structured error types + Gemini retry queue | Graceful degradation on API failures |
| **Rate limiting** | Telegram message staggering (1 msg/s per chat) | Built into message dispatch layer |

### Infrastructure & Deployment

| Decision | Choice | Rationale |
|---|---|---|
| **Containerization** | Docker + docker-compose | Two services: `bot` (Bun) + `postgres` |
| **Logging** | Structured JSON console output | Parseable by any log aggregator |
| **Environment config** | `dotenv` + Docker env vars | 12-factor app, no hardcoded secrets |

## Implementation Patterns & Consistency Rules

### Naming Conventions

| Area | Convention | Example |
|---|---|---|
| **DB tables** | snake_case, plural | `scheduling_rounds`, `availability_responses` |
| **DB columns** | snake_case | `group_id`, `created_at` |
| **Files** | kebab-case | `scheduling-service.ts`, `consensus-calculator.ts` |
| **Functions** | camelCase | `calculateConsensus()`, `sendNudge()` |
| **Variables** | camelCase | `consensusThreshold`, `pendingMembers` |
| **Types/Interfaces** | PascalCase | `SchedulingRound`, `AvailabilitySlot` |
| **Env vars** | SCREAMING_SNAKE_CASE | `BOT_TOKEN`, `GEMINI_API_KEY` |

### Structure Patterns

| Area | Convention |
|---|---|
| **Tests** | Co-located: `*.test.ts` next to source files |
| **Organization** | By feature/domain (not by type) |
| **Services** | `src/services/` — business logic |
| **Bot handlers** | `src/bot/` — Telegraf commands & middleware |
| **Database** | `src/db/` — Prisma client, queries |

### Format Patterns

| Area | Convention |
|---|---|
| **Dates** | ISO 8601 strings (`2026-02-24T14:00:00Z`) |
| **Error format** | `{ code: string, message: string, details?: unknown }` |
| **Logging** | `{ level, timestamp, message, context }` structured JSON |

### Process Patterns

| Area | Convention |
|---|---|
| **Error handling** | Try/catch at service boundaries; log + graceful fallback |
| **Gemini failures** | Queue unparsed response, retry with exponential backoff |
| **Telegram failures** | Log + skip, continue with remaining members |

### Enforcement Guidelines

**All AI Agents MUST:**

- Follow naming conventions exactly as specified above
- Co-locate tests with source files
- Use structured JSON logging for all output
- Handle errors at service boundaries, never let exceptions propagate silently
- Use Prisma-generated types for all database interactions

## Project Structure & Boundaries

### Complete Project Directory Structure

```
zins-community-bot/
├── README.md
├── package.json
├── tsconfig.json
├── bunfig.toml
├── .env
├── .env.example
├── .gitignore
├── Dockerfile
├── docker-compose.yml
├── prisma/
│   ├── schema.prisma
│   └── migrations/
└── src/
    ├── index.ts                    # Entry point — bot init + webhook setup
    ├── config/
    │   └── env.ts                  # Environment validation & typed config
    ├── bot/
    │   ├── bot.ts                  # Telegraf instance & middleware setup
    │   ├── commands/
    │   │   ├── schedule.ts         # /schedule command handler
    │   │   ├── status.ts           # /status command handler
    │   │   ├── cancel.ts           # /cancel command handler
    │   │   └── settings.ts         # /settings command handler
    │   └── handlers/
    │       ├── dm-handler.ts       # Private DM response handler
    │       └── opt-in-handler.ts   # Member opt-in interaction handler
    ├── services/
    │   ├── scheduling-service.ts   # Scheduling round orchestration
    │   ├── availability-service.ts # Availability collection & tracking
    │   ├── consensus-service.ts    # Incremental consensus calculation
    │   ├── nudging-service.ts      # Non-responder follow-up scheduler
    │   ├── gemini-service.ts       # Gemini NLU integration
    │   └── notification-service.ts # Group announcements & reminders
    ├── db/
    │   ├── client.ts               # Prisma client singleton
    │   ├── group-repository.ts     # Group CRUD operations
    │   ├── member-repository.ts    # Member CRUD operations
    │   ├── round-repository.ts     # Scheduling round CRUD
    │   └── response-repository.ts  # Availability response CRUD
    ├── types/
    │   ├── scheduling.ts           # SchedulingRound, AvailabilitySlot, etc.
    │   └── errors.ts               # Typed error codes
    └── utils/
        ├── logger.ts               # Structured JSON logger
        ├── rate-limiter.ts         # Telegram message staggering
        └── time-parser.ts          # Time slot overlap utilities
```

### FR → Structure Mapping

| FR Category | Directory | Key Files |
|---|---|---|
| **FR1-4: Onboarding** | `src/bot/handlers/` | `opt-in-handler.ts` |
| **FR5-8: Scheduling** | `src/bot/commands/` | `schedule.ts`, `cancel.ts` |
| **FR9-14: Availability** | `src/services/` | `availability-service.ts`, `gemini-service.ts` |
| **FR15-17: Nudging** | `src/services/` | `nudging-service.ts` |
| **FR18-21: Consensus** | `src/services/` | `consensus-service.ts` |
| **FR22-24: Confirmation** | `src/services/` | `notification-service.ts` |
| **FR25-26: Status** | `src/bot/commands/` | `status.ts` |
| **FR27-29: Settings** | `src/bot/commands/` | `settings.ts` |
| **FR30-31: Persistence** | `src/db/` | All repository files |

### Architectural Boundaries

- **Bot layer** (`src/bot/`) → Only handles Telegram I/O; delegates to services
- **Service layer** (`src/services/`) → Business logic; no direct Telegram API calls
- **Data layer** (`src/db/`) → All database access via Prisma; no business logic
- **External APIs** → Gemini isolated in `gemini-service.ts`; Telegram isolated in bot layer

### Data Flow

```
Telegram Webhook → bot/commands/* → services/* → db/* → PostgreSQL
                                   ↓
                              gemini-service.ts → Gemini API
                                   ↓
                          notification-service.ts → Telegram (announcements)
```

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:** All technology choices (Bun + Telegraf + Prisma + PostgreSQL + Gemini SDK) are compatible and work together without conflicts.

**Pattern Consistency:** Naming conventions (snake_case DB, camelCase code, kebab-case files) align with TypeScript/Prisma ecosystem standards.

**Structure Alignment:** Project structure supports all architectural decisions with clear layer separation (bot → services → db).

### Requirements Coverage ✅

**Functional Requirements:** All 31 FRs mapped to specific files and directories. No gaps.

**Non-Functional Requirements:** All 12 NFRs addressed — performance (webhook, async), reliability (PostgreSQL state, retry queue), integration (rate limiter), scalability (multi-group isolation).

### Implementation Readiness ✅

**Decision Completeness:** All critical decisions documented with specific technology choices.

**Structure Completeness:** Full directory tree with every file specified and purpose annotated.

**Pattern Completeness:** Naming, structure, format, and process patterns cover all conflict points.

### Gap Analysis

**No critical gaps.**

**Future enhancements (post-MVP):**
- Monitoring/APM tooling
- CI/CD pipeline definition
- Database seed/fixture strategy
- Service Account / Vertex AI migration path

### Architecture Completeness Checklist

- [x] Project context analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Starter template evaluated and selected
- [x] All critical architectural decisions documented
- [x] Technology stack fully specified with versions
- [x] Implementation patterns established
- [x] Complete project directory structure defined
- [x] All 31 FRs mapped to architecture
- [x] All 12 NFRs architecturally addressed
- [x] Architectural boundaries defined
- [x] Data flow documented

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High

**First Implementation Priority:** Project initialization (`bun init` + Prisma schema + Docker setup)

**AI Agent Guidelines:**
- Follow all architectural decisions exactly as documented
- Use implementation patterns consistently across all components
- Respect project structure and boundaries (bot → services → db)
- Refer to this document for all architectural questions
