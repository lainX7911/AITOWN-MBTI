# Phase 8: Make The Town Keep Living

Created: 2026-06-12

## Goal

Move from an autonomy skeleton to a visible living-town loop: residents should keep forming location-based daily intent, meet through relationship pressure and memory, and let question disturbances enter only when the town state makes them plausible.

## Product Direction

The user should not feel they are driving every event. They should feel they are entering a town that already has residents, locations, routines, relationship pressure, and resurfacing memories.

## Work Slices

### Slice 1: Schedule And Location Driven Autonomy

Status, 2026-06-12: implemented. Autonomy selection now receives town locations and only treats shared schedule tags as destinations when they match real location keys. A regression test covers `morning + clinic` choosing `clinic`, not the generic time tag.

- Use resident `scheduleTags` and real town locations when selecting autonomy interaction location.
- Avoid treating time tags such as `morning`, `evening`, or `office`-style descriptors as destinations unless they are real location keys.
- Store the chosen location in the autonomy memory and resident plan.
- Verification:
  - selector test proves shared schedule location wins over generic time tag.
  - build passes.

### Slice 2: Daily Activity Stream

Status, 2026-06-12: first derived activity stream implemented. Autonomy, scene, and reflection memories can be rendered as a compact town activity stream. The observe dashboard now shows "小镇最近活动" separately from memories and event progress.

- Add a lightweight town activity record or derive an activity stream from autonomy memories.
- Show recent autonomous ticks separately from user-question scene events.
- Verification:
  - observe page can show town activity before a new user entry starts.

### Slice 3: Natural Resident Conversations

Status, 2026-06-12: first request-driven loop implemented. Autonomy ticks now create pending resident-resident conversation requests for high-priority interactions. A low-frequency cron tries to consume runnable requests in an active MBTI town world via the existing `ensureMbtiFocusConversation` input, then marks the request as started. The observation dashboard shows recent natural conversation request status.

- Use existing AI-town conversation inputs to occasionally start a resident-resident conversation from autonomy plans.
- Bound frequency and avoid interrupting active conversations.
- Verification:
  - a manual tick can create or request a resident-resident conversation without requiring a user question.

### Slice 4: Periodic Reflection

Status, 2026-06-12: first non-LLM reflection loop implemented. Repeated autonomy memories for the same resident pair can consolidate into a `sourceKind: reflection` town memory through a 10-minute cron. Reflection candidates are selected with pure tests and appear in the existing town activity stream.

- Consolidate repeated autonomy memories into a higher-level reflection memory.
- Keep reflection source and related resident keys explicit.
- Verification:
  - repeated memories can produce one reflection without duplicating every tick.

### Slice 5: Disturbance Lifecycle

Status, 2026-06-12: first explicit lifecycle slice implemented. `mbtiEvents` now distinguish `candidate` and `delayed` from `seeded`. Startup scheduling patches non-hard-scheduled events into candidate/delayed states based on live town plausibility, while triggered logic can still activate candidate or delayed events when needed.

- Add explicit candidate states: candidate, scheduled, delayed, skipped, triggered.
- Delay or skip question probes if current residents/location do not make them plausible.
- Verification:
  - same question can produce different event order after town state changes.

## Current Starting Point

The existing implementation already has a low-frequency cron tick, resident short-term plans, memory provenance, relationship deltas, a compact observation dashboard, and calibration-limited user input.

## Risk Control

Keep every slice small and testable. Do not make LLM-driven autonomy mandatory until rule-based town state changes are observable and stable.
