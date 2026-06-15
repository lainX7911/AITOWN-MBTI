# Resident Life Goals and Observation Plan

## Context

MBTI town residents should not exist only as supporting actors for user questions. Their life and work lines need their own goals, constraints, relationships, and measurable development. User question events should observe or disturb this existing world state, not drive resident time forward or invent resident meaning on demand.

## Phase 1: Persist Resident Life Meaning

Objective: give each resident a compact, durable reason to act.

Likely files:
- `convex/schema.ts`
- `convex/mbtiTown.ts`
- `convex/mbtiTownAutonomy.ts`
- `convex/mbtiTownAutonomy.test.ts`

Implementation:
- Add a `lifeProfile` object to each resident.
- Store one long-term goal, one current pressure, and numeric state dimensions for economy, career, social, health, and stress.
- Seed sensible defaults from resident role, traits, schedule, and background.
- Keep the model lightweight enough to update during autonomy ticks.

Verification:
- Unit test seeded residents have life profiles.
- Type check Convex schema and queries.
- Existing town seed behavior remains compatible with old rows where `lifeProfile` is absent.

Rollback:
- Because the field is optional, rollback can ignore the field without data migration.

## Phase 2: Make Autonomy Change Resident State

Objective: resident actions should have consequences beyond timeline text.

Likely files:
- `convex/mbtiTownAutonomy.ts`
- `convex/mbtiTownAutonomy.test.ts`

Implementation:
- Extend autonomy selection with resident life impacts.
- On each autonomy tick, update participating residents' state dimensions.
- Tie impact direction to the selected storyline: conflict raises stress, favor/social cooperation improves social or reduces stress, routine/work moves career/economy gradually.
- Keep updates bounded and explainable.

Verification:
- Unit test an autonomy tick produces state deltas for participating residents.
- Existing relationship and memory updates still pass.

Rollback:
- Relationship/timeline behavior remains intact if resident impact updates are disabled.

## Phase 3: Observe Resident Development

Objective: make resident development visible so users can judge whether the town is alive.

Likely files:
- `convex/mbtiTown.ts`
- `src/components/mbti/MbtiExperiment.tsx`
- `src/components/mbti/MbtiExperiment.css`
- `src/components/mbti/MbtiExperiment.test.ts`

Implementation:
- Include resident life profiles in the town observation summary.
- Add a resident development section showing goal, pressure, latest intent, and state dimensions.
- Keep the panel compact and scannable.

Verification:
- Unit test key labels or mapping helpers if introduced.
- Manual check that the observation panel displays resident goals and pressures.
- Build succeeds.

Rollback:
- UI can hide the section while backend state remains available.

## Phase 4: Connect User Events to Existing Resident State

Objective: user question events should use resident reality as context.

Likely files:
- `convex/mbti.ts`
- `convex/mbtiNode.ts`
- `convex/mbtiTownPlanner.ts`
- `convex/mbti.test.ts`

Implementation:
- When generating or triggering question probes, include relevant resident goals, pressures, relationships, and recent life-line events.
- Avoid inventing facts that contradict resident state.
- Prefer residents whose existing goals or pressures naturally intersect the user's question.

Verification:
- Tests for generated probe context include resident life state.
- E2E question run shows user events grounded in resident conditions.

Rollback:
- Probe generation can fall back to existing town timeline context.

## Phase 5: Development Metrics

Objective: define whether residents are genuinely developing.

Likely files:
- `convex/mbtiTownObservation.ts`
- `src/components/mbti/MbtiExperiment.tsx`

Implementation:
- Add derived observation metrics: active goals, changed residents, relationship shifts, pressure hotspots, and stale residents.
- Show whether the last N timeline entries include resident-driven changes.

Verification:
- Unit tests for metric derivation.
- Manual observation over several autonomy ticks.

Rollback:
- Metrics are derived and can be removed without changing stored data.

## Recommended Starting Slice

Start with Phases 1-3 as one thin vertical slice:

1. Persist `lifeProfile`.
2. Update it during autonomy ticks.
3. Display it in the existing town observation panel.

This proves the resident life loop without changing user question generation yet.

## Main Risk

The main risk is turning resident state into decorative metadata. The first implementation must update state during autonomous activity and show those changes, otherwise the model does not change the system behavior.

## Assumption

The current optional-schema approach is acceptable: old resident rows may not have `lifeProfile`, and UI/backend code must tolerate missing values.
