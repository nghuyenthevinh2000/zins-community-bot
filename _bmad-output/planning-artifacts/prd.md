---
stepsCompleted: [step-01-init, step-02-discovery, step-02b-vision, step-02c-executive-summary, step-03-success, step-04-journeys, step-05-domain, step-06-innovation, step-07-project-type, step-08-scoping, step-09-functional, step-10-nonfunctional, step-11-polish, step-12-complete]
inputDocuments: [product-brief-zins-community-bot-2026-02-24.md]
workflowType: 'prd'
briefCount: 1
researchCount: 0
brainstormingCount: 0
projectDocsCount: 0
classification:
  projectType: api_backend
  domain: general
  complexity: low
  projectContext: greenfield
---

# Product Requirements Document - zins-community-bot

**Author:** Vinh
**Date:** 2026-02-24

## Executive Summary

**zins-community-bot** is an AI-powered Telegram bot platform that eliminates coordination friction in small social community groups (3–10 members). The platform uses Google OpenCode for natural language understanding, enabling conversational interactions where members respond naturally (e.g., "I'm free Tuesday afternoon") rather than tapping rigid poll options. The flagship feature — fault-tolerant meeting scheduling — applies a majority-consensus algorithm (≥75% agreement) to guarantee meetings happen even when not all members are available, breaking the death spiral of failed coordination → demotivation → disengagement that plagues busy community groups.

The bot operates entirely through private DMs to collect availability, keeping group chat clean and dramatically improving response rates. It handles nudging, consensus calculation, and meeting announcements autonomously — delivering zero manual follow-ups for group organizers. The platform is architected as an extensible tool suite, with meeting scheduling as the first module and additional community engagement tools planned for future releases.

### What Makes This Special

The core insight is that traditional scheduling tools enforce absolute consensus — everyone must agree, or the meeting doesn't happen. This model breaks down with more than two people, especially among busy professionals with unpredictable schedules. **zins-community-bot** flips this by tolerating minority absence: if ≥75% of members converge on a time, the meeting is confirmed. Combined with AI-powered natural language understanding (OpenCode) and proactive consensus-pushing via private DMs, the bot replaces the human organizer's chase-and-nag loop entirely. One-liner: **"Stop chasing people — let AI handle it."**

## Project Classification

| Attribute | Value |
|---|---|
| **Project Type** | API Backend (Telegram Bot service) |
| **Domain** | General (community/social coordination) |
| **Complexity** | Low |
| **Project Context** | Greenfield (new build from scratch) |
| **AI Integration** | Google OpenCode via OAuth for NLU |
| **Platform** | Telegram Bot API |

## Success Criteria

### User Success

- **100% meeting materialization rate**: Every scheduling request results in a confirmed meeting, guaranteed by the fault-tolerant ≥75% consensus model
- **Zero manual follow-ups**: The organizer never chases members — the bot handles all collection, nudging, and announcements
- **Structured availability extraction**: OpenCode pushes members to provide specific date + time ranges (e.g., "I am free on Sunday from 5pm to 10pm") via natural conversation
- **Consensus retry**: If initial availability doesn't yield ≥75% overlap, the bot proactively requests alternative times from members until consensus is achieved
- **Frictionless member experience**: Members respond conversationally in natural language; the bot interprets and confirms understanding

### Business Success

N/A — personal community tool at this stage. Success = the organizer's community meets weekly without coordination friction.

### Technical Success

- **OpenCode NLU accuracy**: Bot correctly parses natural language time expressions on the first interpretation attempt
- **Bot reliability**: Bot is available and responsive during active scheduling rounds
- **Response acknowledgment**: Bot acknowledges member replies within seconds
- **Consensus calculation correctness**: Algorithm correctly identifies optimal time slots from collected availability data

### Measurable Outcomes

- **No minimum buffer required** between meeting confirmation and meeting time — confirmations as close as 30 minutes before the meeting are acceptable
- ≥75% of members respond to the bot's DM within the collection window
- Zero instances of organizer needing to manually intervene in the scheduling process


## User Journeys

### Journey 1: The Organizer — "Finally, It Just Works"

**Persona:** Vinh, group leader of a 6-person social community of busy professionals on Telegram.

**Opening Scene:** It's Sunday evening. Vinh wants to set up this week's community meetup. In the old days, he'd spend 30+ minutes sending individual messages, tagging people in the group, and waiting for responses that never come. Half the time, the meetup just silently dies. He's exhausted from being the only one keeping the community alive.

**Rising Action:** Vinh types `/schedule "Design Review" on this week` in the group chat. The bot instantly acknowledges the request and begins DM-ing each opted-in member privately, asking for their availability for "Design Review". Vinh puts his phone down — there's nothing left for him to do. Over the next few hours, the bot collects availability from members conversationally, nudges those who haven't replied, and even retries when the first round doesn't converge.

**Climax:** Vinh's phone buzzes. The bot has posted in the group: *"✅ Meeting confirmed: Design Review — Tuesday 7pm. Attending: 5/6 members."* He didn't send a single follow-up message. It just... happened.

**Resolution:** Vinh smiles. The community is meeting again this week. He's no longer the bottleneck. The group feels alive again, and he's not burned out. He's already thinking about what other coordination tasks the bot could handle next.

---

### Journey 2: The Group Member — "That Was Easy"

**Persona:** Linh, a busy marketing professional in the same community. She cares about the group but rarely responds to group messages — they get buried under work chats.

**Opening Scene:** Linh's Telegram is buzzing with work messages. There's a poll in the community group about scheduling, but it's sandwiched between 47 other messages. She doesn't even see it. Another missed meetup.

**Rising Action:** This time is different. A private DM pops up from the bot: *"Hey Linh! We're trying to set up this week's meetup for Design Review. When are you free? Just tell me your available times."* Linh types: *"I'm free on Tuesday after 6pm and Thursday evening."* The bot confirms: *"Got it — Tuesday after 6pm and Thursday evening. Thanks!"* The whole thing took 15 seconds.

**Climax:** Later, she sees the group announcement: *"✅ Meeting confirmed: Design Review — Tuesday 7pm."* She's attending — and she barely had to think about it. No group noise, no guilt about missing a poll.

**Resolution:** Linh actually shows up to the meetup. She's reconnecting with the group. The cycle of disengagement is broken — not because she changed, but because the process met her where she is.

---

### Journey 3: The Non-Responder — "Bot Won't Give Up"

**Persona:** Minh, a software engineer who's perpetually "too busy" and ignores most group messages, including bot DMs.

**Opening Scene:** Minh gets the bot's DM asking for availability. He reads it, thinks "I'll reply later," and forgets.

**Rising Action:** A few hours later, the bot nudges him: *"Hey Minh! Just checking in — we're still collecting availability for this week's Design Review. When works for you?"* Minh finally types: *"maybe sunday."* The bot responds: *"Sunday works! What time range? For example, afternoon or evening?"* Minh replies: *"evening, like 7-9."* The bot confirms: *"Got it — Sunday 7pm–9pm. Thanks!"*

**Climax:** The meeting is confirmed for a different day (Tuesday) where ≥75% converged. Minh isn't attending this one — but the meeting happened anyway. His absence didn't block anyone.

**Resolution:** Next week, Minh responds faster because he sees the system works regardless. The pressure of "if I don't respond, nothing happens" is gone — replaced by the appeal of "if I respond, I'll be included."

---

### Journey Requirements Summary

| Journey | Capabilities Revealed |
|---|---|
| **Organizer** | `/schedule "topic" on timeframe` command with topic parameter, automated DM dispatch, progress tracking, group announcement, zero-intervention workflow |
| **Group Member** | Private DM interaction, natural language parsing (OpenCode), availability confirmation, frictionless response flow |
| **Non-Responder** | Automated nudging, conversational follow-up, OpenCode-powered clarifying questions, fault-tolerant scheduling (minority exclusion doesn't block) |

## Innovation & Novel Patterns

### Detected Innovation Areas

1. **Fault-Tolerant Majority Consensus** — Traditional scheduling tools require 100% agreement, which fails at scale. zins-community-bot introduces a configurable consensus threshold (default ≥75%) that guarantees meetings happen by tolerating minority absence. This fundamentally changes the scheduling paradigm from "everyone must agree" to "most agree, let's go."

2. **AI-Driven Conversational Scheduling** — Instead of rigid polls or forms, the bot uses Google OpenCode NLU to have natural DM conversations with members, actively pushing for specific date + time ranges and clarifying vague responses. The bot isn't a passive data collector — it's a conversational agent that negotiates.

### Validation Approach

- **Configurable consensus threshold**: The ≥75% default is experimental. The threshold will be adjustable per group, allowing organizers to tune it based on group dynamics (smaller groups may need higher thresholds; larger groups may tolerate lower)
- **Iterative learning**: Real-world usage will validate whether the default threshold produces satisfying outcomes for both organizers and members
- **OpenCode NLU quality**: Validated through real conversational interactions; edge cases will surface naturally during early use

### Risk Mitigation

See consolidated risk table in [Product Scope](#product-scope).

## API Backend Specific Requirements

### Project-Type Overview

zins-community-bot is a Telegram Bot API backend service. It processes incoming messages/commands via webhook or long-polling, orchestrates conversational DM flows through Google OpenCode, and persists scheduling state in PostgreSQL. The system supports multiple groups simultaneously.

### Bot Command Specification

| Command | Description | Scope |
|---|---|---|
| `/schedule "topic" on timeframe` | Initiate a new scheduling round | Group chat (any member) |
| `/status` | Check progress of current scheduling round | Group chat (any member) |
| `/cancel` | Cancel an active scheduling request | Group chat (any member) |
| `/settings` | Configure group settings (consensus threshold, nudge timing) | Group chat (any member) |

No role-based access control — all opted-in members have equal permissions.

### Authentication & Integration

- **Telegram Bot API**: Standard BotFather token-based authentication
- **Google OpenCode API**: OAuth-based integration for natural language understanding
- **No external web API exposed** — all interaction is via Telegram bot interface

### Data Architecture (PostgreSQL)

**Core entities:**
- **Groups** — registered groups with bot, settings (consensus threshold, nudge interval)
- **Members** — opted-in members per group, DM chat IDs
- **Scheduling Rounds** — active/completed rounds per group, topic, timeframe, status
- **Availability Responses** — parsed time slots per member per round
- **Consensus Results** — confirmed meeting time, attending members

### Multi-Group Considerations

- Bot serves multiple groups simultaneously with isolated scheduling state
- Each group has independent settings (consensus threshold, nudge cadence)
- Scheduling rounds are scoped per group — no cross-group interference

### Implementation Considerations

- **Webhook vs Long-Polling**: Webhook preferred for production (lower latency, scalable)
- **OpenCode API calls**: Each member DM response triggers a OpenCode NLU call for parsing
- **Concurrency**: Multiple scheduling rounds across different groups run in parallel
- **Error handling**: Graceful degradation if OpenCode API is temporarily unavailable

## Product Scope

### MVP Strategy & Philosophy

**MVP Approach:** Problem-Solving MVP — deliver the minimum needed to prove that AI-powered fault-tolerant scheduling eliminates coordination friction for community groups.

**Resource Requirements:** Solo developer with access to Telegram Bot API and Google OpenCode API. PostgreSQL database for persistence.

### MVP Feature Set (Phase 1)

**Core User Journeys Supported:**
- Organizer: zero-intervention scheduling via `/schedule`
- Group Member: frictionless DM-based availability response
- Non-Responder: automated nudging with graceful exclusion

**Must-Have Capabilities:**
1. Bot onboarding & member opt-in (DM access gate)
2. `/schedule "topic" on timeframe` command
3. OpenCode-powered DM conversations for availability collection
4. Natural language time parsing with confirmation
5. Automated nudging for non-responders
6. Consensus retry loop (request alternative times on failure)
7. Majority-consensus algorithm (configurable threshold, default ≥75%)
8. Group announcement of confirmed meeting
9. Pre-meeting reminders
10. `/status`, `/cancel`, `/settings` commands

### Post-MVP Features

**Phase 2 (Growth):**
- Recurring/automated weekly scheduling
- Calendar integration (Google Calendar, Outlook)
- Timezone-aware scheduling for distributed groups
- Customizable consensus thresholds via `/settings`
- Scheduling history and analytics per group

**Phase 3 (Expansion):**
- Additional community engagement tools (TBD)
- Multi-platform expansion (Discord, Slack)
- AI-driven meeting agenda suggestions
- Community health analytics dashboard

### Risk Mitigation Strategy

| Risk Area | Risk | Mitigation |
|---|---|---|
| **Technical** | OpenCode misparses time expressions | Bot confirms interpretation; user corrects if wrong |
| **Technical** | Telegram API rate limits on bulk DMs | Stagger DM sends; respect rate limits per Telegram docs |
| **Technical** | Consensus threshold too low/high | Configurable per group; retry loop for alternative times |
| **Market** | Members ignore bot DMs (same as polls) | Private DM > group noise; nudging system increases response rates |
| **Resource** | Solo dev bottleneck | Lean MVP scope; PostgreSQL + standard tooling keeps complexity low |

## Functional Requirements

### Onboarding & Group Management

- **FR1:** Any Telegram user can add the bot to a group chat
- **FR2:** The bot can require each group member to interact with it before participating (opt-in gate)
- **FR3:** Members can opt-in by interacting with the bot, granting it DM access
- **FR4:** The bot can track which members have opted-in per group

### Scheduling Initiation

- **FR5:** Any opted-in member can initiate a scheduling round via `/schedule "topic" on timeframe`
- **FR6:** The bot can parse the topic and timeframe from the command
- **FR7:** The bot can acknowledge the scheduling request in the group chat
- **FR8:** Any opted-in member can cancel an active scheduling round via `/cancel`

### Availability Collection

- **FR9:** The bot can send private DMs to each opted-in member requesting availability for a specific topic
- **FR10:** Members can respond to the bot's DM in natural language (e.g., "I'm free Tuesday after 6pm")
- **FR11:** The bot can parse natural language time expressions into structured date + time ranges using OpenCode NLU
- **FR12:** The bot can push members to provide specific date + time ranges if their response is vague
- **FR13:** The bot can confirm its interpretation of a member's availability back to them
- **FR14:** Members can correct the bot's interpretation if it was wrong

### Nudging & Follow-Up

- **FR15:** The bot can detect members who have not responded within a configurable time window
- **FR16:** The bot can send follow-up nudge DMs to non-responders
- **FR17:** The bot can include the topic context in nudge messages

### Consensus Algorithm

- **FR18:** The bot recalculates consensus incrementally after each new availability response
- **FR19:** The bot immediately confirms a meeting when any time slot meets the group's consensus threshold (configurable, default ≥75%) — regardless of members who haven't yet responded
- **FR20:** The bot can select the optimal time slot when multiple slots meet the threshold simultaneously
- **FR21:** The bot can trigger a retry loop — requesting alternative times from members only if all responses are collected and no consensus is reached

### Meeting Confirmation & Reminders

- **FR22:** The bot can announce the confirmed meeting (topic, time, attendee list) in the group chat
- **FR23:** The bot can send pre-meeting reminder DMs to confirmed attendees
- **FR24:** Meetings can be confirmed as close as 30 minutes before the scheduled time

### Scheduling Status & Visibility

- **FR25:** Any opted-in member can check the current scheduling round status via `/status`
- **FR26:** The bot can display progress (responses collected, pending members, current consensus state)

### Group Settings & Configuration

- **FR27:** Any opted-in member can view and modify group settings via `/settings`
- **FR28:** The consensus threshold can be configured per group
- **FR29:** The nudge timing/cadence can be configured per group

### Data Persistence

- **FR30:** The bot can persist group registrations, member opt-ins, scheduling rounds, availability responses, and consensus results in PostgreSQL
- **FR31:** The bot can serve multiple groups simultaneously with isolated state

## Non-Functional Requirements

### Performance

- **NFR1:** Bot acknowledges commands (e.g., `/schedule`) in group chat within 3 seconds
- **NFR2:** Bot sends DMs to all opted-in members within 30 seconds of scheduling initiation
- **NFR3:** OpenCode NLU parses and confirms member availability responses within 5 seconds
- **NFR4:** Consensus is recalculated incrementally after each new availability response; as soon as any time slot meets the threshold, the meeting is immediately confirmed and announced — regardless of members who haven't yet responded

### Reliability

- **NFR5:** Active scheduling rounds survive bot restarts — round state persisted in PostgreSQL, not in-memory
- **NFR6:** Bot recovers gracefully from OpenCode API outages — queues unparsed responses and retries when API returns
- **NFR7:** No data loss on scheduling rounds or availability responses

### Integration

- **NFR8:** Bot operates within Telegram Bot API rate limits (30 messages/second globally, 1 message/second per chat)
- **NFR9:** Bot handles Telegram API webhook delivery failures with retry logic
- **NFR10:** OpenCode API integration handles token expiration and automatic re-authentication

### Scalability

- **NFR11:** Bot supports 10+ concurrent groups with active scheduling rounds without degradation
- **NFR12:** PostgreSQL schema supports efficient queries as scheduling history grows
