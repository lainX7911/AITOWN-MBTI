# MBTI Social Simulation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a clean AI Town variant where a user can take an MBTI-weight test, ask a social question, run repeated personality simulations, and inspect evidence-backed conclusions.

**Architecture:** Keep the imported AI Town baseline intact as the simulation foundation, but build the MBTI experiment as a separate feature surface first. The first milestone is frontend-only and deterministic enough to verify quickly; later milestones move simulation sessions, repeated runs, and report persistence into Convex.

**Tech Stack:** Vite, React, TypeScript, Tailwind CSS, Convex, existing AI Town Pixi map and agent framework.

---

## Boundaries

- Do not copy rules, characters, relationship thresholds, or story logic from `/Users/weiqiao/Desktop/somethink/think1/ai-town`.
- Do not hard-code outcomes such as breakup, repair, intimacy, betrayal, or relationship confirmation.
- MBTI letters are behavior weights, not destiny labels.
- Conclusions must come from repeated runs and show counterexamples.
- The first UI must work without requiring Convex setup so the design can be tested immediately.

## File Structure

- `docs/plans/2026-06-10-mbti-social-simulation-plan.md`: this staged implementation plan.
- `src/App.tsx`: temporary top-level switch from original AI Town home screen to MBTI experiment screen.
- `src/components/mbti/MbtiExperiment.tsx`: interactive frontend prototype for test, question, simulation, and report.
- `src/components/mbti/mbtiModel.ts`: pure TypeScript scoring, behavior-weight mapping, scenario presets, and local Monte Carlo simulation.
- `src/components/mbti/types.ts`: shared frontend experiment types.
- `src/components/mbti/MbtiExperiment.css`: focused styling for the experiment UI.

Later backend stages:

- `convex/mbti/schema.ts`: experiment session/result tables.
- `convex/mbti/profile.ts`: persisted MBTI profile calculation and validation.
- `convex/mbti/simulation.ts`: repeated run orchestration.
- `convex/mbti/report.ts`: report aggregation queries.

## Phase 1: Frontend Experiment Prototype

- [ ] Replace the initial app screen with an MBTI experiment interface that does not depend on Convex.
- [ ] Add a short weighted MBTI test with sliders for E/I, S/N, T/F, J/P.
- [ ] Let the user choose or type a social question.
- [ ] Run a local multi-run simulation across different partner/friend profiles.
- [ ] Show a report with behavior distribution, stable tendencies, conditional triggers, and counterexample paths.
- [ ] Verify `npm run build` passes.
- [ ] Start `npm run dev:frontend` and provide the local URL.

## Phase 2: Clean Simulation Model

- [ ] Expand `mbtiModel.ts` from local heuristic demo into named behavior dimensions:
  - social initiation
  - rumination
  - emotional sensitivity
  - closure need
  - conflict repair
  - exploration
  - fact checking
  - meaning projection
- [ ] Add scenario templates for relationship conflict, friendship pressure, workplace disagreement, and long-distance uncertainty.
- [ ] Add seeded randomness so reports can be reproduced by session id.
- [ ] Add unit tests for profile scoring and report aggregation.

## Phase 3: Convex Persistence

- [ ] Add `mbtiProfiles`, `mbtiExperiments`, `mbtiRuns`, and `mbtiReports` tables.
- [ ] Save each user test result and question as an experiment session.
- [ ] Persist each run with partner/friend profile, event sequence, behavior choice, relationship deltas, and outcome.
- [ ] Query reports by session id.
- [ ] Keep this data separate from AI Town's existing world/player/agent tables.

## Phase 4: AI Town Integration

- [ ] Create temporary experiment worlds from a neutral role set: self, partner, friend, observer.
- [ ] Inject MBTI behavior weights into agent prompts without writing fixed story outcomes.
- [ ] Generate generalized events from observed behavior instead of hand-authored plot triggers.
- [ ] Run multiple short simulation branches and collect evidence.

## Phase 5: Evidence Report UI

- [ ] Add a run matrix by partner/friend personality combination.
- [ ] Add trace view for individual runs.
- [ ] Add confidence indicators based on number of runs and consistency.
- [ ] Add explicit "not enough evidence" states when results are too scattered.

## First Milestone Acceptance Criteria

- The user can open the frontend and complete a full interaction in one page.
- The page produces a weighted MBTI profile, not only a four-letter label.
- The page runs at least 24 local simulation branches.
- The report separates stable tendencies, conditional outcomes, and counterexamples.
- No old `ai-town` relationship-specific characters or plot rules appear in the new project.
