# MBTI Town Persistent World Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` before implementing this plan task-by-task. Keep checklist state current as each slice lands.

## Goal

- **Desired outcome:** Upgrade MBTI Town from "create a fresh tiny world for every user question" into a persistent social town. The user enters as a new role, optionally with one partner and/or one friend, while the rest of the town exists as ordinary residents with relationships, history, daily routines, and memory.
- **Success checks:** A user question activates only a relevant local scene with 4-6 town residents plus the fresh visitor and optional brought-in roles, but the scene is selected from a larger persistent world. Reports cite real conversations, events, memories, and relationship changes instead of local heuristic previews.
- **Main constraint:** Do not make every town resident answer the user. The large world is context and continuity; each question still runs as a small scene slice.
- **Identity constraint:** Every user entry is a fresh visitor identity. The user's prior chats, prior scene memories, and prior relationship scores must not be coupled into the next entry. Any partner/friend brought by the user is also an ephemeral scene participant, not a persistent town resident.

## Current State

- The frontend MBTI setup flow already exists in `src/components/mbti/MbtiExperiment.tsx`.
- MBTI scoring, inferred roles, behavior weights, and scenario presets live in `src/components/mbti/mbtiModel.ts`.
- `convex/mbti.ts` already creates non-default experiment worlds, inserts a MBTI scene, seeds experiment events, collects AI Town messages/memories/events, and finalizes a report.
- `convex/schema.ts` already has `mbtiExperiments` and `mbtiEvents`.
- The main gap is architectural: every experiment still creates a new isolated world, so there is no town-level continuity, resident history, or user relationship progression.

## Product Direction

The right model is:

1. A persistent town exists first.
2. Dozens of residents have identities, MBTI-weighted behavior tendencies, relationships, locations, schedules, and memory.
3. The user enters as a fresh visitor identity every time.
4. A user question creates a local scene request, not a new universe.
5. The system selects a location and 4-6 relevant town residents, then adds the fresh visitor and optional brought-in roles.
6. The scene runs inside the persistent town.
7. Important outcomes can update town-resident memory or town-resident relationships, but cannot create cross-entry memory for the user or the user's brought-in partner/friend.

This should feel like the user is entering an ongoing society, not summoning characters to answer a prompt.

## Phase 1: Stabilize Existing Experiment Baseline

- [x] Confirm `npm run build` passes or record current TypeScript/Convex blockers.
- [x] Confirm a single existing MBTI experiment can create a world, insert agents, produce messages, collect memories/events, and finalize. A completed run exists with 40 chat messages, 7 archived conversations, 13 memories, 6 inner thoughts, and 20 events; current Convex CLI data refresh failed on network authorization and should be retried before release signoff.
- [x] Add a short developer note in the plan or README describing the current "fresh experiment world" path.
- [x] Avoid UI redesign in this phase. Superseded after Phase 4 by explicit product requests for town canvas, role markers, evidence panels, and question-guidance visibility.

**Objective:** Establish a known-good baseline before changing world lifecycle.

**Likely files or systems:** `convex/mbti.ts`, `convex/schema.ts`, `src/components/mbti/MbtiExperiment.tsx`, `package.json`.

**Dependencies:** Convex backend and local LLM/embedding services must be reachable for full simulation validation.

**Verification:** `npm run build`; one manual run from frontend; inspect `mbtiExperiments`, `messages`, `innerThoughts`, `memories`, `mbtiEvents`.

**Current verification note:** Local `npx convex codegen`, `npm test -- --runInBand --forceExit`, `npm run build`, `git diff --check`, and `curl -I http://127.0.0.1:5173/ai-town` pass. Convex CLI runtime inspection also succeeds: the latest running experiment has persisted `questionFocus.eventPlans`, concrete `mbtiEvents`, a `socialEvents.mbtiEventId` trigger record, and messages in the same world.

**Rollback or containment:** If the persistent-town work breaks, keep this path as a temporary fallback behind an explicit "isolated experiment" mode.

## Phase 2: Add Persistent Town Data Model

- [x] Add `mbtiTownProfiles` for reusable town definitions.
- [x] Add `mbtiTownResidents` for resident identity, role, MBTI weights, traits, default location, schedule tags, and active/inactive state.
- [x] Add `mbtiRelationships` for pairwise familiarity, trust, warmth, tension, influence, lastInteractionAt, and summary.
- [x] Add `mbtiTownMemories` for long-term town memory separate from raw conversation logs.
- [x] Add `mbtiSceneRequests` for each user question entering the town.
- [x] Represent user-provided partner/friend as `ephemeralParticipantKeys` on a scene request, not as `mbtiTownResidents`.
- [x] Keep existing AI Town `worlds`, `players`, `agents`, `messages`, and `memories` as runtime substrate rather than replacing them.

**Objective:** Represent a long-lived social field independently from one-off experiment sessions.

**Likely files or systems:** `convex/schema.ts`, new `convex/mbtiTown.ts` or split modules under `convex/mbti/`.

**Dependencies:** Decide whether the first version has one default town or supports multiple saved towns. Default to one town until product evidence says otherwise.

**Verification:** Convex schema generation succeeds; seed/query mutations can create, list, and read a town profile with residents, relationships, and memories.

**Rollback or containment:** New tables should be additive. Existing `mbtiExperiments` can continue working while town tables are unused.

## Phase 3: Seed a Real Town, Not a Prompt Cast

- [x] Create a seed set of 24-36 ordinary residents.
- [x] Include role variety: cafe owner, teacher, clinic worker, repair person, student, retiree, local organizer, quiet neighbor, gossip hub, mediator, skeptic, avoidant resident.
- [x] Give each resident behavior weights and concrete traits; avoid "I am ENFP so..." copy.
- [x] Seed 60-100 relationship edges with short history summaries.
- [x] Seed 20-40 town memories: public events, old conflicts, favors, rumors, debts, shared routines.
- [x] Seed 5-8 locations with scene affordances: cafe, square, clinic, school, riverside, apartment hallway, workshop, community office.

**Objective:** Build enough pre-existing social texture that user scenes have context.

**Likely files or systems:** new seed data under `data/` or `convex/mbtiSeeds.ts`; seed mutations in Convex.

**Dependencies:** Phase 2 tables must exist. Keep seed content original to this project.

**Verification:** A seeded town query returns residents, relationship graph density, location distribution, and recent memory snippets. Manual review should show residents are not just MBTI stereotypes.

**Current verification note:** `data/mbtiPersistentTown.test.ts` now validates resident count, relationship count, memory count, facility coverage, valid resident references, valid location references, and local scene slicing.

**Rollback or containment:** Seed data is replaceable. Keep it versioned and re-runnable, with a reset mutation gated for development.

## Phase 4: Convert User Questions Into Scene Requests

- [x] Replace "create a new world for each question" with "ensure persistent town world, then create scene request".
- [x] Add user entry modes: solo visitor, visitor with ephemeral partner, visitor with ephemeral friend, visitor with both.
- [x] Classify question into scene type: relationship, friendship pressure, workplace conflict, family, uncertainty, repair, decision.
- [x] Select a location based on scene type and current town state.
- [x] Select 4-6 active residents using relation relevance, resident role, personality contrast, memory relevance, and current availability.
- [x] Treat non-selected residents as background context only.
- [x] Store the selected cast and rationale in `mbtiSceneRequests`.
- [x] Store the user's brought-in partner/friend only as ephemeral participants for this scene.
- [x] Add an入镇前 LLM planner that converts the user question into an implicit `questionFocus` plan for event scheduling, evidence targets, and final evaluation.
- [x] Require the入镇前 LLM planner to output concrete `eventPlans` with scene, participants, trigger, information goal, and judgment signal, so events are not abstract labels.
- [x] Keep the original question out of user/partner/friend/resident character definitions; roles enter only with identity and relationship background.
- [x] Surface a visible question guidance rail so users can see how the hidden plan pushes the scene through planning, events, focused meetings, and evidence recovery.

**Objective:** Make a user question become one believable local scene inside the town.

**Likely files or systems:** `convex/mbti.ts`, new scene selector module, `src/components/mbti/MbtiExperiment.tsx`.

**Dependencies:** Phase 3 seed town must provide residents, relationships, memories, and locations.

**Verification:** For several questions, inspect selected location/cast/rationale. Confirm the same question can choose different but defensible casts depending on town history.

**Rollback or containment:** Keep old `createExperiment` mutation available temporarily. New mutation can be named separately, such as `enterPersistentTownScene`, until validated.

## Phase 5: Run Scenes Against Persistent World State

- [x] Map selected residents into AI Town players/agents if they are not already active in the runtime world.
- [x] Insert the user as a human-like/newcomer player with MBTI behavior weights and question context.
- [x] If partner/friend is user-provided, create temporary scene agents only; do not reuse prior companion records.
- [x] Start only the selected scene conversation or nearby interactions.
- [x] Inject relevant relationship summaries and town memories into agent identity/plan prompts.
- [x] Add scheduled pressure events that change context during the scene, not just static report text.
- [x] Drive seeded events from the implicit question plan, so the scene receives pressure, misunderstanding, evaluation, and repair windows related to the user's question.
- [x] When a question event involves the visitor and a target role, force a focused meetup so the event actually creates usable mainline interaction evidence.
- [x] Add a recurring resident-interaction schedule so active town residents enter the mainline instead of only standing on the map or moving as background.
- [x] Keep active conversations paced so characters do not stay silent for more than roughly 2 minutes.
- [x] Keep the user's main brought-in relationship on a protected focus loop, so ordinary residents add context without starving the core user/partner or user/friend evidence.
- [x] Let scene completion write relationship deltas and memory candidates.
- [x] Reject or ignore any memory candidate that tries to persist the visitor's identity, prior chats, or brought-in companion across entries.

**Objective:** Preserve the AI Town simulation loop while making it operate on persistent social state.

**Likely files or systems:** `convex/aiTown/agentInputs.ts`, `convex/mbti.ts`, `convex/agent/conversation.ts`, `convex/agent/memory.ts`, `convex/thoughts.ts`, `convex/events.ts`.

**Dependencies:** Scene request selection must be stable enough to feed runtime inputs.

**Verification:** A scene produces messages, archived conversations, inner thoughts, social events, and memory candidates tied back to a `mbtiSceneRequest`.

**Rollback or containment:** If persistent runtime reuse is too risky, first emulate persistence by seeding a new world from persistent town state, then write outcomes back. Move to a single long-lived runtime world after behavior is trustworthy.

## Phase 6: Memory Consolidation and Relationship Evolution

- [x] Add a consolidation action that turns raw messages/events into structured town memories.
- [x] Update pairwise relationship edges after each scene with small bounded deltas.
- [x] Update only resident-resident relationship edges by default; do not track user-specific familiarity, trust, warmth, tension, or influence across entries.
- [x] Store why a change happened, not only the numeric delta.
- [x] Add decay or staleness markers so old impressions can be revised.
- [x] Prevent every detail from becoming long-term memory; keep only decisions, repeated patterns, emotional shifts, favors, conflicts, and public events.
- [x] Keep scene evidence queryable for the completed request, but do not feed previous user scene evidence into future user entries unless the user explicitly imports it.

**Objective:** Make future scenes depend on what happened before.

**Likely files or systems:** new memory consolidation module, `convex/schema.ts`, `convex/agent/memory.ts`, report generation in `convex/mbti.ts`.

**Dependencies:** Phase 5 must produce enough raw evidence.

**Verification:** Run two related scenes in sequence. The second scene should reference or be influenced by the first through stored memory/relationship state.

**Rollback or containment:** Store memory candidates before applying them. If consolidation quality is poor, show candidates in developer UI before committing.

## Phase 7: Evidence UI for a Living Town

- [x] Replace "experiment run" framing with "current town scene" plus "town memory".
- [x] Show selected location, active participants, and why they were selected.
- [x] Show the入镇前演化计划 as system context, separate from role definitions.
- [x] Show event progress in user-readable language, including what happened and the recorded result, instead of only exposing statuses such as `observed`.
- [x] Merge event plan, actual record, matched chat evidence, and current judgment into one card per planned event, so users do not compare duplicate "plan" and "result" blocks.
- [x] Distinguish scheduled/triggered event records from real chat evidence. A planned event can show "有事件记录，等聊天" without being counted as behavior evidence.
- [x] Keep the question guidance rail visible after page refresh by reading persisted `mbtiExperiments.questionFocus`, not only frontend session state.
- [x] Show answer options with probabilities, direct plain-language answers, supporting reasons, and observable signals instead of only a single abstract conclusion paragraph.
- [x] Show relevant prior memories before the scene starts.
- [x] After completion, show evidence: messages, events, inner thoughts, relationship changes, new memories.
- [x] Add a town relationship panel for residents and current scene participants; avoid implying the current visitor inherits previous user relationship history.
- [x] Preserve "not enough evidence" states when a scene is too short or too quiet.
- [x] Show lightweight markers for the fresh visitor, brought-in roles, and active town residents on the town canvas.

**Objective:** Help the user understand how the answer emerged from town history, not from a direct model opinion.

**Likely files or systems:** `src/components/mbti/MbtiExperiment.tsx`, `src/components/PlayerDetails.tsx`, `src/components/Messages.tsx`, CSS.

**Dependencies:** Backend queries must expose scene request, selected cast, memories, and relationship deltas.

**Verification:** Manual browser check on desktop and mobile widths; no overlapping UI; evidence sections should stay readable with empty, running, complete, and failed states.

**Rollback or containment:** Keep the existing MBTI experiment UI sections while adding persistent-town panels incrementally.

## Recommended Starting Slice

Start with **Phase 1**, then immediately implement the additive schema and seed/query layer from **Phase 2**. Do not start by rewriting the UI or deleting the existing experiment-world path. The fastest trustworthy feedback is a seeded town query that proves the project can represent residents, relationships, memories, and scene requests before runtime integration.

## Risks

- **Highest execution risk:** Reusing one live AI Town world for many scenes may create cleanup, scheduling, stale-agent, and accidental user-memory carryover problems. If this gets unstable, use a hybrid first step: persistent data model plus per-scene runtime world, then write only town-resident outcomes back into persistent town state.
- **Assumption that could break the plan:** The current Convex/AI Town runtime must allow enough custom agent identity, memory, and prompt injection to make residents behave consistently across scenes.
- **Follow-up work:** Once the persistent model works, add evaluation prompts that compare "fresh isolated world" vs "persistent town" for naturalness, continuity, user-centeredness, and evidence quality.
