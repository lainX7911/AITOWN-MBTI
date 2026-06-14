# MBTI Autonomous Living Town Plan

## Background

The current MBTI town has already moved beyond a fresh isolated experiment: it has persistent town profiles, residents, relationships, town memories, scene requests, event plans, evidence records, user responses, and reports.

The next product direction is narrower and more important: the town should be the primary actor. A user question should enter an already living social field as a disturbance, not create a hand-driven sequence of user choices.

This plan supersedes the product direction in `2026-06-11-dynamic-probe-response-loop-plan.md` where that plan expands per-event user response. Keep its useful data structures and evidence separation, but stop making frequent user choices the central interaction model.

## Goal

- Desired outcome:
  - Convert MBTI Town from "scheduled probe events plus user responses" into "persistent residents with autonomous daily life, memory, reflection, relationship change, and lightweight question-driven disturbances."
  - Keep event plans as a hidden probe pool, not as a user-facing choice path.
  - Let the user's persona enter the town with minimal calibration, then let residents and the simulated user persona respond automatically unless a high-value calibration point is needed.

- Success checks:
  - The town can run resident-resident interactions even when no user question is actively being answered.
  - A user question creates an entry scene and observation goal, but most later behavior is selected by resident state, memory, relationship graph, and plans.
  - Reports cite autonomous interactions: who approached whom, which memory was used, what residents discussed without direct prompting, what relationships changed, and where the simulated user persona may need calibration.
  - During a typical run, the user answers only entry calibration plus at most a small number of critical checks.

- Main constraint:
  - Do not delete existing `mbtiEvents`, `questionFocus.eventPlans`, `mbtiUserResponses`, or report evidence structures. Reframe and reuse them so current work remains salvageable.

## Product Rules

1. The persistent town is the base product; an experiment is only a temporary observation window.
2. Residents must have autonomous routines and interaction choices independent of the user question.
3. Events are allowed, but only as environmental disturbances or probe opportunities. They must not prescribe resident conclusions or force the user through a branching questionnaire.
4. The simulated "我" may act from the user's MBTI profile and entry calibration, but must be marked as simulated evidence unless the user confirms it.
5. User prompts during runtime should be rare calibration interrupts, not per-event control.
6. Reports must separate autonomous town evidence, simulated user behavior, confirmed user calibration, and missing evidence.

## Current State To Preserve

- `convex/mbtiTown.ts` already stores persistent town profiles, residents, relationships, memories, and scene requests.
- `convex/mbtiTownPlanner.ts` already creates question focus, startup questions, and event plans.
- `convex/mbti.ts` already schedules scene events, daily events, focus conversations, resident interactions, evidence collection, report generation, memory consolidation, and relationship deltas.
- `convex/agent/memory.ts` already summarizes conversations into vector memories and can create reflection memories.
- `convex/agent/conversation.ts` already retrieves related memories and injects identity/current goal into conversation prompts.
- `src/components/mbti/MbtiExperiment.tsx` already shows planning, evidence, history, memory, and response UI.

## Parallel Thread Coordination

Another development thread checkpointed the current direction and confirmed the working tree was clean before this plan was added. Its conclusion matches this plan:

- Keep `eventPlans` and `mbtiEvents`, but position them as background disturbance probes, not as a questionnaire.
- Keep entry-stage calibration questions, planner retries, clear planner failure reasons, town-entry loading feedback, strong question-event relevance, evidence chains, chat/memory/behavior records, and final confidence warnings.
- Keep the recent change that avoids expanding a user-response form for events that have not triggered.
- Stop expanding per-event user choice, event-card questionnaires, full `eventPlans` confirmation, real-response coverage as main-flow pressure, and "no user answer means no result" behavior.
- Pause the two-stage route where user answers are required before generating all events. It can remain as a checkpoint, but should not define the next implementation direction.

The immediate next implementation plan should therefore be smaller than full town autonomy: first downgrade the existing user-response system into a "critical uncertainty calibration" system. Only after that boundary is stable should the resident autonomy tick and autonomous planning work proceed.

## Phase 1: Freeze The Old Interaction Direction

Status, 2026-06-12: first slice implemented. The runtime response UI and report copy now frame user input as optional calibration instead of per-event required response. The older dynamic response plan has a superseded-direction note.

- Objective:
  - Stop expanding the "event happens -> user must choose -> next event" product route while preserving code already built for evidence and calibration.

- Likely files or systems:
  - `docs/plans/2026-06-11-dynamic-probe-response-loop-plan.md`
  - `src/components/mbti/MbtiExperiment.tsx`
  - `convex/mbti.ts`
  - `convex/schema.ts`

- Work items:
  - Add a short status note to the old dynamic response plan marking it superseded for product direction.
  - Keep `mbtiUserResponses`, but rename product meaning in UI/copy from "required event response" to "calibration check" or "reality check."
  - Audit current pending user-response states and identify which are still needed for report confidence.
  - Remove or hide any UI affordance that implies every event needs user input.

- Dependencies:
  - Coordinate with the other thread before touching its in-flight files. If that thread has uncommitted changes, checkpoint first.

- Verification:
  - `git diff --check`
  - TypeScript compile after code edits.
  - Manual UI check that events can be observed without forcing a response card for every event.

- Rollback or containment:
  - This phase should be mostly copy and feature-flag work. If it causes confusion, leave the old response UI behind a development toggle.

## Phase 2: Add A Town Autonomy Tick

Status, 2026-06-12: autonomy tick implemented in `convex/mbtiTownAutonomy.ts` and wired to a low-frequency Convex cron every 5 minutes. The public mutation still supports dry-run debugging. The tick can select a resident-resident interaction from persistent town state, write a bounded town memory, apply relationship deltas, and update short-lived resident plans. Pure selector tests cover scoring and next-tick memory reuse.

- Objective:
  - Create a background loop for resident life that is not dependent on an active user question.

- Likely files or systems:
  - `convex/mbtiTown.ts`
  - new `convex/mbtiTownAutonomy.ts`
  - `convex/crons.ts`
  - `convex/schema.ts`

- Work items:
  - Add a town autonomy action that selects a small number of resident interactions per tick.
  - Inputs to the selector:
    - resident status and location
    - relationship warmth/trust/tension
    - recent town memories
    - stale memories that may resurface
    - schedule tags and location affordances
  - Outputs:
    - daily activity records
    - resident-resident conversation requests
    - low-intensity social events
    - memory candidates
    - relationship delta candidates
  - Add guardrails so the loop is bounded and cheap: low frequency, capped residents, capped LLM calls, no infinite scheduler chains.

- Dependencies:
  - Existing town seed data and relationship graph must be usable without active experiment context.

- Verification:
  - Unit tests for resident selection scoring.
  - Manual Convex run: seed town, run autonomy tick, verify a social event or memory candidate appears.
  - Confirm no user question is required.

- Rollback or containment:
  - Keep autonomy disabled by default until verified. Enable with an environment flag or admin mutation.

## Phase 3: Promote Resident Plans From Static Strings To Short-Lived State

Status, 2026-06-12: first persistent resident plan slice implemented. `mbtiTownResidents` now has optional `autonomyPlan`; `runAutonomyTick` writes short-lived intent, target location, social appetite, seek/avoid resident keys, and topic seed for the selected residents. Scene selection folds that plan into resident context so selected town residents carry recent autonomous intent into their prompt.

- Objective:
  - Replace "plan as prompt text" with lightweight resident intent that can guide movement, conversation, and memory use.

- Likely files or systems:
  - `convex/schema.ts`
  - `convex/mbtiTown.ts`
  - `convex/aiTown/agentOperations.ts`
  - `convex/agent/conversation.ts`

- Work items:
  - Add or derive short-lived resident state:
    - current intent
    - current location target
    - social appetite
    - avoid/seek residents
    - open topic seed
    - last plan update time
  - Generate plans from town memory and relationship context, not from the user's latest question.
  - Use this state in `agentDoSomething` before random destination/activity selection.
  - Keep the existing `agent.plan` prompt line, but make it reflect the latest resident state.

- Dependencies:
  - Phase 2 autonomy tick provides the first place to update plans outside user scenes.

- Verification:
  - A resident with high tension toward another resident should be less likely to casually approach them unless the plan says repair/confront/avoid.
  - A resident with a location schedule tag should move to plausible locations more often than random.
  - Existing AI Town movement still works.

- Rollback or containment:
  - Fall back to current random itinerary if no resident state exists.

## Phase 4: Reframe Question Entry As A Disturbance, Not A Script

Status, 2026-06-12: scheduling slice implemented. Initial `mbtiEvents` are still created as the disturbance candidate pool, but experiment startup now hard-schedules only the first scene event plus a small number of high-signal probes. Candidate scoring also reads live town state: active resident plans, plausible resident participants, and high-tension resident pairs. The rest remain available as candidates/evidence targets rather than becoming a forced event path.

- Objective:
  - Keep the question planner, but turn its output into observation goals and disturbance candidates rather than a fixed event path.

- Likely files or systems:
  - `convex/mbtiTownPlanner.ts`
  - `convex/mbtiTown.ts`
  - `convex/mbti.ts`
  - `src/components/mbti/MbtiExperiment.tsx`

- Work items:
  - Keep startup questions, but limit them to entry calibration.
  - Store `questionFocus` as:
    - observation goal
    - uncertainty variables
    - disturbance candidates
    - report criteria
  - Replace "schedule every event in order" with "make candidates available to the autonomy selector."
  - Let resident state decide which disturbance becomes socially plausible:
    - who is nearby
    - who has related memory
    - who has relationship tension
    - who would naturally comment, support, oppose, avoid, or spread information
  - Keep hard scheduling only for the first entry scene and rare high-signal probes.

- Dependencies:
  - Phase 2 and Phase 3 should exist so disturbances can be selected by live state.

- Verification:
  - Same user question should not always trigger the same event order.
  - A disturbance should be skipped or delayed if no plausible participant exists.
  - Report still knows which question variable the disturbance tested.

- Rollback or containment:
  - Keep the current deterministic event schedule as fallback for short demos.

## Phase 5: Reduce Runtime User Input To Calibration Checks

Status, 2026-06-12: first UI gating slice implemented. Runtime event cards no longer expose a response panel for every triggered event. The UI now selects at most two unhandled, evidence-bearing calibration nodes, while existing user calibrations remain visible on their original event cards.

- Objective:
  - Preserve user truth where it matters without turning the product into a questionnaire.

- Likely files or systems:
  - `convex/schema.ts`
  - `convex/mbti.ts`
  - `src/components/mbti/MbtiExperiment.tsx`
  - `src/components/mbti/types.ts`

- Work items:
  - Classify user input prompts:
    - entry calibration: allowed
    - confidence repair: allowed
    - simulation drift check: allowed
    - per-event choice: discouraged by default
  - Add a calibration budget per run, for example `maxRuntimeCalibrationPrompts`.
  - Trigger runtime calibration only when:
    - simulated "我" behavior strongly affects conclusion
    - evidence conflicts with entry calibration
    - report confidence would otherwise be misleading
    - user explicitly requests more control
  - Mark all non-confirmed simulated user actions as `simulated_persona_evidence`.

- Dependencies:
  - Current `mbtiUserResponses` can be reused, but labels and report semantics need adjustment.

- Verification:
  - A normal run can complete without any runtime user response.
  - A low-confidence run can ask one targeted calibration question and show how it changes the report.
  - Reports do not present simulated "我" behavior as confirmed user truth.

- Rollback or containment:
  - Keep manual response mode as an advanced/debug mode.

## Phase 6: Memory, Reflection, And Relationship Consolidation

Status, 2026-06-12: first consolidation slice implemented. Autonomy ticks now persist memory provenance (`sourceKind`, `sourceReason`) and relationship delta details, then apply bounded familiarity/trust/warmth/tension/influence updates with a trace in the relationship summary. Selector tests cover reuse of autonomy-created memory on the next tick.

- Objective:
  - Make social continuity come from accumulated town state, not from event scripts.

- Likely files or systems:
  - `convex/agent/memory.ts`
  - `convex/mbti.ts`
  - `convex/mbtiTown.ts`
  - new `convex/mbtiTownMemory.ts`

- Work items:
  - Lower or adapt the reflection trigger for town residents so reflections happen in observable development cycles.
  - Consolidate resident-resident conversation outcomes into `mbtiTownMemories`.
  - Apply relationship deltas from actual interactions:
    - warmth
    - trust
    - tension
    - familiarity
    - influence
  - Record why a relationship changed, and which memory/event/message caused it.
  - Avoid persisting a user's fresh visitor identity across separate entries unless the product explicitly adds a returning-user mode.

- Dependencies:
  - Phase 2 autonomous interactions must produce raw material.

- Verification:
  - Run autonomy tick sequence twice. Second run should be influenced by first-run memory or relationship delta.
  - Reflection memories should appear under controlled thresholds.
  - No prior fresh visitor identity is reused in a new entry.

- Rollback or containment:
  - Store memory/relationship candidates first; apply only bounded deltas.

## Phase 7: Observation UI For A Living Town

Status, 2026-06-12: first observation-dashboard slice implemented. `getDefaultTown` now returns a compact town observation summary, and the observe screen shows resident intent, relationship pressure, and resurfacing memories above event progress. Copy explicitly frames events as disturbances rather than a per-event questionnaire.

- Objective:
  - Shift the interface from "event task list" to "town observation dashboard."

- Likely files or systems:
  - `src/components/mbti/MbtiExperiment.tsx`
  - `src/components/mbti/MbtiExperiment.css`
  - `src/components/mbti/types.ts`

- Work items:
  - Show:
    - town is currently active or paused
    - resident activity stream
    - active relationships under pressure
    - memories resurfacing
    - current visitor entry scene
    - disturbances that emerged naturally
    - calibration checks, if any
  - Demote per-event response cards to a compact calibration queue.
  - Add report sections:
    - autonomous town evidence
    - simulated user persona behavior
    - confirmed user calibration
    - missing or weak evidence
  - Keep existing history and evidence views but rename them around town continuity.

- Dependencies:
  - Backend queries need to expose autonomy events, resident plans, memory changes, and calibration status.

- Verification:
  - Desktop and mobile manual checks.
  - No UI copy should imply every event requires user choice.
  - Completed report should be understandable without exposing internal planner jargon.

- Rollback or containment:
  - Add the new observation sections alongside existing panels first, then remove old wording after behavior is validated.

## Recommended Starting Phase

Start with Phase 1, then Phase 2. The fastest trustworthy feedback is not a new UI: it is proving that the town can produce a resident-resident social event or memory candidate without a user question.

## Main Risk

The highest execution risk is confusing "autonomous" with "uncontrolled." The town still needs bounded scheduling, evidence labeling, and report confidence rules. The goal is fewer user-directed branches, not less structure.

## Assumption That Could Break The Plan

This plan assumes the product wants each user entry to remain a fresh visitor identity. If the product later needs a returning user with persistent personal relationships, the memory isolation rules and report semantics need a separate design pass.

## Coordination Note For Parallel Work

Any in-progress work that strengthens per-event user choice should be checkpointed and then reviewed against this plan. Reusable parts are:

- probe/event metadata
- `mbtiUserResponses` storage
- confidence levels
- evidence separation
- report sections for missing information

Work to pause or hide by default:

- requiring a user response for every event
- expanding branching-choice UI
- treating user selections as the main driver of town evolution
- making report conclusions depend primarily on per-event choices
