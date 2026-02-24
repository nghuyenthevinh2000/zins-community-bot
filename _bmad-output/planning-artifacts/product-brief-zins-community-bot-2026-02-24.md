---
stepsCompleted: [1, 2, 3, 4, 5, 6]
inputDocuments: []
date: 2026-02-24
author: Vinh
---

# Product Brief: zins-community-bot

## Executive Summary

**zins-community-bot** is an AI-powered Telegram bot platform designed to boost engagement and reduce friction in small social community groups of busy people. The platform provides a growing suite of community tools, starting with its flagship feature: **fault-tolerant meeting scheduling**. Unlike traditional scheduling tools that require absolute consensus, the bot uses a majority-consensus model (≥75% agreement) — ensuring meetings actually happen even when not everyone is available. All interactions occur via **private DMs**, keeping group chat clean. The platform is designed to be extensible, with future tools to further strengthen community bonds and reduce coordination overhead.

---

## Core Vision

### Problem Statement

Small social community groups of busy professionals struggle to stay connected and engaged on Telegram. Coordination tasks — starting with meeting scheduling — create excessive chat noise, get buried, and require perfect consensus that's impossible among busy people. The result: activities silently die, participation drops, and community bonds weaken over time.

### Problem Impact

- **Meeting attrition**: Without effective coordination, planned meetings simply never materialize
- **Community erosion**: Repeated coordination failures lead to disengagement and weakened group connection
- **Organizer burnout**: The burden of coordination falls on one person who must chase responses manually
- **Chat pollution**: Polls and scheduling messages clutter the group chat, causing important messages to be lost

### Why Existing Solutions Fall Short

- **Doodle / Calendly**: Designed for 1-on-1 scheduling with absolute consensus; don't scale to group coordination with tolerance for minority absence
- **Telegram Polls**: Create excessive noise in group chat; low response rates because members are less reactive to group messages than direct DMs
- **Manual Coordination**: Time-consuming, unreliable, and puts unfair burden on the organizer
- **No integrated platform**: Existing tools are standalone — they don't live where the community does and can't grow into a broader engagement toolkit

### Proposed Solution

An extensible, AI-powered Telegram bot platform that provides community engagement tools, starting with:

**🗓️ Tool #1 — Fault-Tolerant Meeting Scheduler:**
1. **Privately DMs each group member** to collect available time slots — no group chat clutter
2. **Applies a majority-consensus algorithm** (≥75% agreement threshold) to find optimal meeting times
3. **Announces the confirmed meeting** back to the group only when consensus is reached
4. **Nudges non-responders** to maximize participation without public pressure

**Future tools** will extend the platform to address other community engagement pain points as they are identified.

### Key Differentiators

- **Platform, Not a Point Solution**: Extensible architecture designed to host multiple community tools over time
- **Majority Consensus Model**: Meetings happen when ≥3/4 members agree — no single person can block scheduling
- **Private DM Collection**: Availability gathered via direct messages, increasing response rates and keeping chat clean
- **Zero-Friction Integration**: Lives natively in Telegram — no external apps or links
- **Built for Small Social Groups**: Optimized for the 3–10 person sweet spot where enterprise tools are overkill

---

## Target Users

### Primary Users

**👤 The Organizer (Group Leader)**

*"I just want our weekly meetup to happen without me spending an hour chasing everyone."*

- **Who they are**: The group founder/leader of a small social community (3–10 members) on Telegram. They voluntarily take on the coordination role because no one else will.
- **Current pain**: Spends significant time each week sending individual messages, tagging people in the group, and getting poor engagement in return. The emotional toll of repeatedly failed coordination erodes their motivation to keep the community alive.
- **Workarounds today**: Manual DMs, group tags, Telegram polls — all noisy, unreliable, and exhausting.
- **What success looks like**: Triggers a meeting request and the bot handles the rest. A meeting gets confirmed automatically without them chasing a single person.
- **"Aha!" moment**: The first time a meeting is confirmed and announced to the group without any manual follow-up.

### Secondary Users

**👥 The Group Member**

*"I'd respond if it were easy and came to me directly."*

- **Who they are**: Busy professionals in the social community who want to participate but are low-reactive to group messages. They care about the community but scheduling feels like a chore.
- **Current pain**: Group polls and tags get buried in chat. Each failed meeting attempt kills their motivation to engage further, creating a vicious cycle of disengagement.
- **What success looks like**: A quick, private DM from the bot asking for availability — tap a few options, done. No group noise, no guilt.
- **"Aha!" moment**: How painlessly quick it is to respond, and seeing that meetings actually happen now.

### User Journey

| Stage | Organizer | Group Member |
|---|---|---|
| **Onboarding** | Adds bot to Telegram group; bot requires each member to interact with it to opt-in | Interacts with the bot (required to continue messaging in the group), establishing DM access |
| **Trigger** | Initiates a meeting scheduling request via the bot | Receives a private DM from the bot with time slot options |
| **Interaction** | Waits — no chasing required | Selects available time slots from the DM (quick, low-effort) |
| **Resolution** | Bot announces confirmed meeting in group when ≥75% consensus is reached | Sees meeting confirmation in group chat |
| **"Aha!" moment** | First meeting confirmed without lifting a finger | Realizes responding took 30 seconds and the meeting actually happened |
| **Long-term** | Community engagement strengthens; organizer stays motivated | Regular, predictable meetups become part of their routine |

---

## Success Metrics

### User Success

- **100% meeting success rate**: Every scheduling request initiated through the bot results in a confirmed meeting, enabled by the fault-tolerant majority-consensus model (≥75% agreement)
- **Zero manual follow-ups**: The organizer never has to chase members for responses — the bot handles all availability collection and nudging via private DMs

### Business Objectives

N/A — this is a personal community tool, not a commercial product at this stage.

### Key Performance Indicators

N/A — success is binary: meetings happen automatically, or they don't.

---

## MVP Scope

### Core Features (v1)

1. **Bot Onboarding & Opt-In**: Bot is added to Telegram group; requires each member to interact with it to opt-in, establishing private DM access
2. **Meeting Request Initiation**: Organizer triggers a scheduling request via the bot in the group chat
3. **Private Availability Collection**: Bot DMs each opted-in member individually to collect available time slots
4. **Nudging Non-Responders**: Bot sends follow-up DMs to members who haven't responded within a configurable window
5. **Majority-Consensus Algorithm**: Bot calculates optimal meeting time using ≥75% agreement threshold — meeting is confirmed even if minority members are unavailable
6. **Group Announcement**: Bot announces the confirmed meeting time and attendee list back to the group chat
7. **Meeting Reminders**: Bot sends reminders to confirmed attendees before the scheduled meeting

### Out of Scope for MVP

- Recurring/automated weekly scheduling (manual trigger only in v1)
- Calendar integration (Google Calendar, Outlook, etc.)
- AI-powered features beyond consensus calculation
- Multi-language support
- Analytics or reporting dashboard
- Multiple simultaneous scheduling requests

### MVP Success Criteria

- Every scheduling request initiated results in a confirmed meeting (100% success rate)
- Organizer performs zero manual follow-ups during the scheduling process
- Members find the DM interaction quick and frictionless

### Future Vision

- Additional community engagement tools beyond scheduling (specific tools TBD)
- Recurring/automated scheduling capabilities
- Calendar service integrations
- Analytics on community engagement health
- Expansion to other messaging platforms beyond Telegram
