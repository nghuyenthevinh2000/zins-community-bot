---
stepsCompleted: [step-01-validate-prerequisites, step-02-design-epics, step-03-create-stories, step-04-final-validation]
inputDocuments: [prd.md, architecture.md]
status: 'complete'
completedAt: '2026-02-24T14:26:21+07:00'
---

# zins-community-bot - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for zins-community-bot, decomposing the requirements from the PRD and Architecture into implementable stories.

## Requirements Inventory

### Functional Requirements

- FR1: Any Telegram user can add the bot to a group chat
- FR2: The bot can require each group member to interact with it before participating (opt-in gate)
- FR3: Members can opt-in by interacting with the bot, granting it DM access
- FR4: The bot can track which members have opted-in per group
- FR5: Any opted-in member can initiate a scheduling round via `/schedule "topic" on timeframe`
- FR6: The bot can parse the topic and timeframe from the command
- FR7: The bot can acknowledge the scheduling request in the group chat
- FR8: Any opted-in member can cancel an active scheduling round via `/cancel`
- FR9: The bot can send private DMs to each opted-in member requesting availability for a specific topic
- FR10: Members can respond to the bot's DM in natural language (e.g., "I'm free Tuesday after 6pm")
- FR11: The bot can parse natural language time expressions into structured date + time ranges using OpenCode NLU
- FR12: The bot can push members to provide specific date + time ranges if their response is vague
- FR13: The bot can confirm its interpretation of a member's availability back to them
- FR14: Members can correct the bot's interpretation if it was wrong
- FR15: The bot can detect members who have not responded within a configurable time window
- FR16: The bot can send follow-up nudge DMs to non-responders
- FR17: The bot can include the topic context in nudge messages
- FR18: The bot recalculates consensus incrementally after each new availability response
- FR19: The bot immediately confirms a meeting when any time slot meets the group's consensus threshold (configurable, default ≥75%) — regardless of members who haven't yet responded
- FR20: The bot can select the optimal time slot when multiple slots meet the threshold simultaneously
- FR21: The bot can trigger a retry loop — requesting alternative times from members only if all responses are collected and no consensus is reached
- FR22: The bot can announce the confirmed meeting (topic, time, attendee list) in the group chat
- FR23: The bot can send pre-meeting reminder DMs to confirmed attendees
- FR24: Meetings can be confirmed as close as 30 minutes before the scheduled time
- FR25: Any opted-in member can check the current scheduling round status via `/status`
- FR26: The bot can display progress (responses collected, pending members, current consensus state)
- FR27: Any opted-in member can view and modify group settings via `/settings`
- FR28: The consensus threshold can be configured per group
- FR29: The nudge timing/cadence can be configured per group
- FR30: The bot can persist group registrations, member opt-ins, scheduling rounds, availability responses, and consensus results in PostgreSQL
- FR31: The bot can serve multiple groups simultaneously with isolated state

### NonFunctional Requirements

- NFR1: Bot acknowledges commands in group chat within 3 seconds
- NFR2: Bot sends DMs to all opted-in members within 30 seconds of scheduling initiation
- NFR3: OpenCode NLU parses and confirms member availability responses within 5 seconds
- NFR4: Consensus is recalculated incrementally after each new response; immediate announcement on threshold
- NFR5: Active scheduling rounds survive bot restarts — state persisted in PostgreSQL
- NFR6: Bot recovers gracefully from OpenCode API outages — queues unparsed responses and retries
- NFR7: No data loss on scheduling rounds or availability responses
- NFR8: Bot operates within Telegram Bot API rate limits (30 msg/s global, 1 msg/s per chat)
- NFR9: Bot handles Telegram API webhook delivery failures with retry logic
- NFR10: OpenCode API integration handles token expiration and automatic re-authentication
- NFR11: Bot supports 10+ concurrent groups with active scheduling rounds without degradation
- NFR12: PostgreSQL schema supports efficient queries as scheduling history grows

### Additional Requirements

**From Architecture:**
- Project initialization: Bun runtime + TypeScript + Telegraf v4.16.3 + Prisma ORM + PostgreSQL + Docker
- Webhook-based bot transport (all environments, ngrok for dev)
- Prisma schema with migrations for data model
- Structured JSON logging
- Rate limiter for Telegram message staggering
- Three-layer architecture: bot → services → db
- Co-located tests (*.test.ts)

### FR Coverage Map

| FR | Epic | Description |
|---|---|---|
| FR1 | Epic 1 | Add bot to group |
| FR2 | Epic 2 | Opt-in gate requirement |
| FR3 | Epic 2 | Member opt-in via interaction |
| FR4 | Epic 2 | Track opted-in members per group |
| FR5 | Epic 3 | Initiate scheduling via /schedule |
| FR6 | Epic 3 | Parse topic and timeframe |
| FR7 | Epic 3 | Acknowledge scheduling in group |
| FR8 | Epic 3 | Cancel active round via /cancel |
| FR9 | Epic 4 | Send private DMs for availability |
| FR10 | Epic 4 | Natural language availability responses |
| FR11 | Epic 4 | OpenCode NLU time parsing |
| FR12 | Epic 4 | Push for specific date+time ranges |
| FR13 | Epic 4 | Confirm availability interpretation |
| FR14 | Epic 4 | Allow correction of interpretation |
| FR15 | Epic 5 | Detect non-responders |
| FR16 | Epic 5 | Send nudge DMs |
| FR17 | Epic 5 | Include topic context in nudges |
| FR18 | Epic 6 | Incremental consensus recalculation |
| FR19 | Epic 6 | Immediate confirmation on threshold |
| FR20 | Epic 6 | Optimal slot selection |
| FR21 | Epic 6 | Retry loop on no consensus |
| FR22 | Epic 6 | Announce confirmed meeting |
| FR23 | Epic 6 | Pre-meeting reminder DMs |
| FR24 | Epic 6 | Confirmation as close as 30 min before |
| FR25 | Epic 7 | Check status via /status |
| FR26 | Epic 7 | Display progress info |
| FR27 | Epic 7 | View/modify settings via /settings |
| FR28 | Epic 7 | Configure consensus threshold |
| FR29 | Epic 7 | Configure nudge timing |
| FR30 | Epic 1 | PostgreSQL persistence |
| FR31 | Epic 1 | Multi-group isolated state |

## Epic List

### Epic 1: Project Foundation & Bot Setup
Users can add the bot to a group and it responds to commands.
**FRs covered:** FR1, FR30, FR31
**Arch requirements:** Bun init, Prisma schema, Docker, webhook setup, structured logging

### Epic 2: Group Onboarding & Member Management
Members can opt-in to the bot and be tracked per group.
**FRs covered:** FR2, FR3, FR4

### Epic 3: Scheduling Initiation
Any opted-in member can start or cancel a scheduling round, with the bot acknowledging in group chat.
**FRs covered:** FR5, FR6, FR7, FR8

### Epic 4: Availability Collection via DM
Members receive private DMs, respond in natural language, and the bot parses their availability using AI.
**FRs covered:** FR9, FR10, FR11, FR12, FR13, FR14

### Epic 5: Nudging & Follow-Up
The bot detects non-responders and sends configurable follow-up nudges.
**FRs covered:** FR15, FR16, FR17

### Epic 6: Consensus & Meeting Confirmation
The bot calculates incremental consensus and announces confirmed meetings with reminders.
**FRs covered:** FR18, FR19, FR20, FR21, FR22, FR23, FR24

### Epic 7: Status & Settings
Members can check scheduling progress and configure group settings.
**FRs covered:** FR25, FR26, FR27, FR28, FR29

---

## Epic 1: Project Foundation & Bot Setup

Users can add the bot to a group and it responds to commands.

### Story 1.1: Project Initialization & Docker Setup

As a **developer**,
I want the project scaffolded with Bun, TypeScript, Telegraf, Prisma, and Docker,
So that all team members have a consistent, reproducible dev environment.

**Acceptance Criteria:**

**Given** a fresh clone of the repository
**When** I run `docker-compose up`
**Then** the bot service and PostgreSQL start successfully
**And** the bot connects to the Telegram API via webhook
**And** the Prisma schema compiles without errors

### Story 1.2: Database Schema & Group Registration

As a **group organizer**,
I want to add the bot to my Telegram group,
So that my group is registered and ready for scheduling.

**Acceptance Criteria:**

**Given** the bot is running and connected to Telegram
**When** a user adds the bot to a group chat
**Then** the bot creates a `groups` record with the group's Telegram ID and name
**And** the bot sends a welcome message explaining how to opt-in
**And** the group data is persisted in PostgreSQL (survives restart)

### Story 1.3: Multi-Group Isolation

As a **bot operator**,
I want the bot to serve multiple groups with isolated state,
So that one group's scheduling never interferes with another.

**Acceptance Criteria:**

**Given** the bot is added to two separate groups (Group A and Group B)
**When** Group A has an active scheduling round
**Then** Group B shows no active round when `/status` is called
**And** all database queries are scoped to the requesting group's ID

### Story 1.4: Help Command

As an **opted-in member**,
I want to type `/help` and see a list of all available commands,
So that I can quickly discover what the bot can do.

**Acceptance Criteria:**

**Given** the bot is running in any chat (group or DM)
**When** a user sends `/help`
**Then** the bot replies with a formatted list of all commands and their descriptions
**And** the list includes: `/schedule`, `/cancel`, `/status`, `/settings`, `/optin`, `/help`
**And** each command includes a brief one-line description of what it does

## Epic 2: Group Onboarding & Member Management


Members can opt-in to the bot and be tracked per group.

### Story 2.1: Opt-In Gate & Member Registration

As a **group member**,
I want to opt-in to the bot by interacting with it,
So that the bot can send me DMs for scheduling and I'm included in future rounds.

**Acceptance Criteria:**

**Given** the bot is added to a group with a welcome message
**When** a member clicks the opt-in button or sends a DM to the bot
**Then** the bot creates a `members` record linking the user to the group
**And** the bot confirms opt-in to the member via DM
**And** the bot gains DM access to the member

### Story 2.2: Member Tracking & Opt-In Status

As a **group organizer**,
I want to see which members have opted-in,
So that I know who will be included in scheduling rounds.

**Acceptance Criteria:**

**Given** a group with some opted-in and some non-opted-in members
**When** the bot initiates a scheduling round
**Then** only opted-in members receive DMs
**And** the bot can report the count of opted-in members

## Epic 3: Scheduling Initiation

Any opted-in member can start or cancel a scheduling round, with the bot acknowledging in group chat.

### Story 3.1: Start a Scheduling Round

As an **opted-in member**,
I want to initiate a scheduling round with `/schedule "topic" on timeframe`,
So that the group can find a time to meet.

**Acceptance Criteria:**

**Given** the member is opted-in and no active round exists
**When** they send `/schedule "Team standup" on next week`
**Then** the bot parses "Team standup" as the topic and "next week" as the timeframe
**And** the bot creates a `scheduling_rounds` record with status `active`
**And** the bot acknowledges the request in the group chat within 3 seconds (NFR1)

### Story 3.2: Prevent Duplicate Scheduling Rounds

As an **opted-in member**,
I want to be informed if a scheduling round is already active,
So that I don't accidentally create a conflicting round.

**Acceptance Criteria:**

**Given** an active scheduling round exists for the group
**When** another member tries to start a new round with `/schedule`
**Then** the bot responds with a message indicating a round is already active
**And** no new round is created

### Story 3.3: Cancel an Active Scheduling Round

As an **opted-in member**,
I want to cancel the current scheduling round with `/cancel`,
So that the group can stop a round that's no longer needed.

**Acceptance Criteria:**

**Given** an active scheduling round exists
**When** a member sends `/cancel`
**Then** the bot marks the round as `cancelled` in the database
**And** the bot notifies the group chat that the round was cancelled

## Epic 4: Availability Collection via DM

Members receive private DMs, respond in natural language, and the bot parses their availability using AI.

### Story 4.1: Send Availability Request DMs

As an **opted-in member**,
I want to receive a private DM asking for my availability when a round starts,
So that I can respond privately without cluttering the group chat.

**Acceptance Criteria:**

**Given** an active scheduling round is created
**When** the round is initiated
**Then** the bot sends DMs to all opted-in members within 30 seconds (NFR2)
**And** each DM includes the topic and timeframe
**And** DMs respect Telegram rate limits (1 msg/s per chat, NFR8)

### Story 4.2: Natural Language Availability Parsing with OpenCode

As an **opted-in member**,
I want to respond with my availability in natural language,
So that I don't have to use a rigid format.

**Acceptance Criteria:**

**Given** a member received an availability request DM
**When** they reply "I'm free Tuesday after 6pm and all day Thursday"
**Then** the bot sends the response to OpenCode NLU for parsing
**And** OpenCode returns structured time ranges within 5 seconds (NFR3)
**And** the bot stores the parsed availability in `availability_responses`

### Story 4.3: Confirm & Correct Availability Interpretation

As an **opted-in member**,
I want the bot to confirm its understanding of my availability,
So that I can correct mistakes before consensus is calculated.

**Acceptance Criteria:**

**Given** the bot parsed my natural language availability
**When** the bot presents its interpretation to me
**Then** I can confirm with "yes" or correct it with new availability
**And** if I correct it, the bot re-parses and confirms again
**And** the final confirmed availability is stored in the database

### Story 4.4: Handle Vague Responses & Push for Specifics

As an **opted-in member**,
I want the bot to ask for more specific times if my response is too vague,
So that the bot can calculate meaningful time overlaps.

**Acceptance Criteria:**

**Given** a member responds with something vague like "sometime next week"
**When** OpenCode identifies the response lacks specific date+time ranges
**Then** the bot asks the member for more specific availability
**And** the conversation continues until specific ranges are provided

### Story 4.5: OpenCode API Failure Recovery

As a **bot operator**,
I want the bot to handle OpenCode API outages gracefully,
So that availability responses are not lost.

**Acceptance Criteria:**

**Given** a member sends an availability response
**When** the OpenCode API is unavailable
**Then** the bot queues the unparsed response for retry (NFR6)
**And** the bot informs the member that processing is delayed
**And** the bot retries with exponential backoff when the API returns

## Epic 5: Nudging & Follow-Up

The bot detects non-responders and sends configurable follow-up nudges.

### Story 5.1: Detect Non-Responders & Send Nudges

As a **group organizer**,
I want the bot to automatically nudge members who haven't responded,
So that more members participate and consensus is easier to reach.

**Acceptance Criteria:**

**Given** an active scheduling round with some members who haven't responded
**When** the configurable nudge time window elapses (default: 24 hours)
**Then** the bot sends a follow-up DM to each non-responder
**And** the nudge message includes the scheduling topic
**And** the nudge respects Telegram rate limits (NFR8)

### Story 5.2: Configurable Nudge Cadence

As a **group organizer**,
I want to configure how often and how many nudges are sent,
So that members aren't over-nudged or under-nudged.

**Acceptance Criteria:**

**Given** a group with custom nudge settings
**When** the nudge timer fires
**Then** nudges are sent according to the configured cadence
**And** the bot stops nudging after the configured maximum nudge count

## Epic 6: Consensus & Meeting Confirmation

The bot calculates incremental consensus and announces confirmed meetings with reminders.

### Story 6.1: Incremental Consensus Calculation

As a **group organizer**,
I want the bot to recalculate consensus after each new response,
So that a meeting is confirmed as soon as possible.

**Acceptance Criteria:**

**Given** an active scheduling round with some availability responses
**When** a new availability response is confirmed
**Then** the bot immediately recalculates time slot overlaps
**And** the bot checks if any time slot meets the group's consensus threshold (default ≥75%)
**And** consensus is calculated regardless of how many members haven't yet responded (NFR4)

### Story 6.2: Meeting Confirmation & Group Announcement

As a **group member**,
I want the bot to announce the confirmed meeting in the group chat,
So that everyone knows when and where to meet.

**Acceptance Criteria:**

**Given** a time slot meets the consensus threshold
**When** the bot confirms the meeting
**Then** the bot announces the topic, confirmed time, and attendee list in the group chat
**And** the scheduling round is marked as `confirmed` in the database
**And** meetings can be confirmed as close as 30 minutes before the scheduled time (FR24)

### Story 6.3: Optimal Time Slot Selection

As a **group organizer**,
I want the bot to select the best time slot when multiple options meet consensus,
So that the most agreeable time is chosen.

**Acceptance Criteria:**

**Given** multiple time slots meet the consensus threshold simultaneously
**When** the bot selects the optimal slot
**Then** the slot with the highest agreement percentage is selected
**And** ties are broken by earliest start time

### Story 6.4: Retry Loop on No Consensus

As a **group organizer**,
I want the bot to request alternative times if no consensus is reached,
So that the group still has a chance to meet.

**Acceptance Criteria:**

**Given** all opted-in members have responded
**When** no time slot meets the consensus threshold
**Then** the bot notifies the group that no consensus was reached
**And** the bot sends new DMs requesting alternative availability
**And** the round re-enters the availability collection phase

### Story 6.5: Pre-Meeting Reminder DMs

As a **confirmed attendee**,
I want to receive a reminder DM before the meeting,
So that I don't forget about the scheduled meeting.

**Acceptance Criteria:**

**Given** a meeting is confirmed
**When** the pre-meeting reminder time arrives (e.g., 1 hour before)
**Then** the bot sends a reminder DM to each confirmed attendee
**And** the reminder includes the topic, time, and group name

## Epic 7: Status & Settings

Members can check scheduling progress and configure group settings.

### Story 7.1: Check Scheduling Status

As an **opted-in member**,
I want to check the current scheduling round status with `/status`,
So that I can see how many people have responded and what the consensus looks like.

**Acceptance Criteria:**

**Given** an active scheduling round exists
**When** a member sends `/status`
**Then** the bot displays: responses collected, pending members, and current consensus state
**And** if no active round exists, the bot says "No active scheduling round"

### Story 7.2: View & Modify Group Settings

As an **opted-in member**,
I want to view and modify group settings with `/settings`,
So that I can customize how the bot works for my group.

**Acceptance Criteria:**

**Given** a member sends `/settings`
**When** the bot displays current settings
**Then** the bot shows: consensus threshold (default 75%), nudge timing, nudge cadence
**And** the member can modify these values
**And** updated settings are persisted in the database

### Story 7.3: Configure Consensus Threshold

As a **group organizer**,
I want to adjust the consensus threshold for my group,
So that I can make it easier or harder to reach agreement.

**Acceptance Criteria:**

**Given** a member is modifying settings
**When** they set the consensus threshold to 60%
**Then** the new threshold is saved to the group's settings
**And** future consensus calculations use the updated threshold
