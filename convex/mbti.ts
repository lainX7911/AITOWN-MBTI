import { v } from 'convex/values';
import { makeFunctionReference } from 'convex/server';
import { api, internal } from './_generated/api';
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  MutationCtx,
  query,
  mutation,
} from './_generated/server';
import { Doc, Id } from './_generated/dataModel';
import { createEngine } from './aiTown/main';
import { insertInput } from './aiTown/insertInput';
import { ENGINE_ACTION_DURATION } from './constants';
import { chatCompletion, getLLMConfig } from './util/llm';
import { startConversationMessage } from './agent/conversation';
import * as map from '../data/gentle';

const MBTI_SCENE_MESSAGE_INTERVAL_MS = 110 * 1000;
const MBTI_BACKGROUND_WANDER_INTERVAL_MS = 30 * 1000;
const MBTI_SCENE_EVENT_MIN_GAP_MS = 45 * 1000;
const MBTI_TOWN_DAILY_EVENT_INTERVAL_MS = 60 * 1000;
const MBTI_FOCUS_CONVERSATION_INTERVAL_MS = 75 * 1000;
const MBTI_RESIDENT_INTERACTION_INTERVAL_MS = 90 * 1000;
const MBTI_EXPERIMENTS_TO_KEEP = 12;
const MBTI_COMPLETED_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;
const MBTI_STALE_ACTIVE_RETENTION_MS = 2 * 60 * 60 * 1000;
const MBTI_RUNTIME_DELETE_GRACE_MS = 30 * 1000;
const MBTI_DELETE_BATCH_SIZE = 20;
const ensureResidentInteractionRef = makeFunctionReference<'action'>('mbti:ensureResidentInteraction') as any;

const weights = v.object({
  e: v.number(),
  i: v.number(),
  s: v.number(),
  n: v.number(),
  t: v.number(),
  f: v.number(),
  j: v.number(),
  p: v.number(),
});

const behaviors = v.object({
  socialInitiation: v.number(),
  withdrawal: v.number(),
  factChecking: v.number(),
  meaningProjection: v.number(),
  logicFraming: v.number(),
  emotionalSensitivity: v.number(),
  closureNeed: v.number(),
  openness: v.number(),
  repairDrive: v.number(),
  rumination: v.number(),
});

const rolePreset = v.object({
  enabled: v.boolean(),
  role: v.string(),
  label: v.string(),
  mapping: v.optional(v.string()),
  mbtiCode: v.string(),
  traits: v.string(),
  reason: v.string(),
});

const townResident = v.object({
  key: v.string(),
  name: v.string(),
  role: v.string(),
  mbtiCode: v.string(),
  weights,
  traits: v.array(v.string()),
  background: v.string(),
  context: v.optional(v.string()),
  defaultLocationKey: v.string(),
  scheduleTags: v.array(v.string()),
});

const questionFocus = v.object({
  coreQuestion: v.string(),
  drivingTension: v.string(),
  observationGoal: v.string(),
  analysisDimensions: v.optional(v.array(v.string())),
  designRationale: v.optional(v.string()),
  theoreticalBasis: v.optional(v.array(v.string())),
  evidenceTargets: v.array(v.string()),
  eventBeats: v.array(v.string()),
  startupQuestions: v.optional(v.array(v.object({
    question: v.string(),
    options: v.array(v.string()),
  }))),
  outcomeHypotheses: v.optional(v.array(v.object({
    label: v.string(),
    plainConclusion: v.string(),
    supportSignals: v.array(v.string()),
    weakSignals: v.array(v.string()),
  }))),
  eventPlans: v.optional(v.array(v.object({
    title: v.string(),
    severity: v.optional(v.string()),
    scene: v.string(),
    trigger: v.string(),
    participants: v.array(v.string()),
    observationAxis: v.optional(v.string()),
    questionLink: v.optional(v.string()),
    informationGoal: v.string(),
    judgmentSignal: v.string(),
    responseOptions: v.optional(v.array(v.string())),
  }))),
  resolutionCriteria: v.string(),
});

export const debugExperimentMap = query({
  args: {},
  handler: async () => ({
    tileSetUrl: map.tilesetpath,
    width: map.mapwidth,
    height: map.mapheight,
    firstTile: map.bgtiles[0]?.[0]?.[0],
  }),
});

type RoleSeed = {
  enabled: boolean;
  role: string;
  label: string;
  mapping?: string;
  mbtiCode: string;
  traits: string;
  reason: string;
};

type TownResidentInput = {
  key: string;
  name: string;
  role: string;
  mbtiCode: string;
  traits: string[];
  background: string;
  context?: string;
  defaultLocationKey: string;
  scheduleTags: string[];
};

type QuestionFocusInput = {
  coreQuestion: string;
  drivingTension: string;
  observationGoal: string;
  analysisDimensions?: string[];
  designRationale?: string;
  theoreticalBasis?: string[];
  evidenceTargets: string[];
  eventBeats: string[];
  startupQuestions?: Array<{
    question: string;
    options: string[];
  }>;
  outcomeHypotheses?: Array<{
    label: string;
    plainConclusion: string;
    supportSignals: string[];
    weakSignals: string[];
  }>;
  eventPlans?: Array<{
    title: string;
    severity?: string;
    scene: string;
    trigger: string;
    participants: string[];
    observationAxis?: string;
    questionLink?: string;
    informationGoal: string;
    judgmentSignal: string;
    responseOptions?: string[];
  }>;
  resolutionCriteria: string;
};

type MbtiReport = {
  generatedAt: number;
  summary: string;
  personalityFit: string;
  evidence: string[];
  conclusion: string;
  answerOptions?: Array<{
    label: string;
    probability: number;
    answer: string;
    why: string;
    signals: string[];
  }>;
  evidenceLevel?: 'level_0' | 'level_1' | 'level_2' | 'level_3';
  realUserResponseCount?: number;
  requiredUserResponseCount?: number;
  missingUserResponseCount?: number;
  confidenceNotice?: string;
  limits: string;
};

export const createExperiment = mutation({
  args: {
    question: v.string(),
    profile: v.object({
      code: v.string(),
      weights,
      behaviors,
    }),
    rolePresets: v.array(rolePreset),
    townResidents: v.optional(v.array(townResident)),
    townBackgroundResidents: v.optional(v.array(townResident)),
    townId: v.optional(v.id('mbtiTownProfiles')),
    sceneRequestId: v.optional(v.id('mbtiSceneRequests')),
    sceneLocationKey: v.optional(v.string()),
    questionFocus: v.optional(questionFocus),
    observation: v.object({
      label: v.string(),
      runCount: v.number(),
      durationMs: v.optional(v.number()),
      targetEventCount: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const durationMs = normalizeObservationDuration(args.observation.durationMs, args.observation.runCount);
    const targetEventCount = normalizeTargetEventCount(args.observation.targetEventCount, durationMs);
    const engineId = await createEngine(ctx);
    const engine = (await ctx.db.get(engineId))!;
    const worldId = await ctx.db.insert('worlds', {
      nextId: 0,
      agents: [],
      conversations: [],
      players: [],
    });
    await ctx.db.insert('worldStatus', {
      engineId,
      isDefault: false,
      lastViewed: now,
      status: 'running',
      worldId,
    });
    const mapId = await ctx.db.insert('maps', {
      worldId,
      width: map.mapwidth,
      height: map.mapheight,
      tileSetUrl: map.tilesetpath,
      tileSetDimX: map.tilesetpxw,
      tileSetDimY: map.tilesetpxh,
      tileDim: map.tiledim,
      bgTiles: map.bgtiles,
      objectTiles: map.objmap,
      animatedSprites: map.animatedsprites,
    });

    const enabledRoles = args.rolePresets.filter((role) => role.enabled);
    const socialRoles = buildSocialFieldRoles(enabledRoles);
    const townResidents = args.townResidents ?? [];
    const townBackgroundResidents = args.townBackgroundResidents ?? [];
    const sceneParticipants = [
      ...socialRoles.map((role, index) => ({
        name: role.label.trim() || `对象${index + 1}`,
        character: characterForIndex(index),
        identity: buildRoleIdentity(role),
        plan: `按你和“我”的真实关系自然相处。`,
      })),
      ...townResidents.map((resident, index) => ({
        name: resident.name,
        character: characterForIndex(index + socialRoles.length),
        identity: buildTownResidentIdentity(resident),
        plan: `你今天照常在小镇活动。遇到别人时按自己的性格和关系自然聊天。`,
      })),
    ];
    const eventSeed = deterministicSeed(args.question, args.profile.code);
    const experimentId = await ctx.db.insert('mbtiExperiments', {
      createdAt: now,
      updatedAt: now,
      status: 'creating',
      question: args.question,
      profile: args.profile,
      rolePresets: args.rolePresets,
      observation: {
        ...args.observation,
        durationMs,
        targetEventCount,
      },
      worldId,
      engineId,
      mapId,
      townId: args.townId,
      sceneRequestId: args.sceneRequestId,
      questionFocus: args.questionFocus,
      agentInputIds: [],
      socialField: {
        minimumAgents: Math.max(2, 1 + sceneParticipants.length),
        createdRoles: [
          'self',
          ...socialRoles.map((role) => role.role),
          ...townResidents.map((resident) => `resident:${resident.key}`),
        ],
        eventSeed,
      },
    });

    const sceneInputId = await insertInput(ctx, worldId, 'createMbtiScene', {
      self: {
        name: '我',
        character: 'f5',
        identity: buildSelfIdentity(args.question, args.profile, socialRoles, args.questionFocus),
        plan: buildSelfPlan(args.questionFocus),
      },
      sceneLocationKey: args.sceneLocationKey,
      roles: sceneParticipants,
      backgroundResidents: townBackgroundResidents.map((resident, index) => ({
        name: resident.name,
        character: characterForIndex(index + sceneParticipants.length),
        identity: buildTownResidentIdentity(resident, true),
      })),
    });
    const seededEvents = buildSeededEvents(
      args.question,
      socialRoles,
      townResidents,
      args.sceneLocationKey,
      eventSeed,
      targetEventCount,
      args.questionFocus,
    );
    for (const event of seededEvents) {
      await ctx.db.insert('mbtiEvents', {
        experimentId,
        worldId,
        createdAt: now,
        tickOffset: event.tickOffset,
        kind: event.kind,
        title: event.title,
        description: event.description,
        involvedRoles: event.involvedRoles,
        testedVariable: event.testedVariable,
        testedHypotheses: event.testedHypotheses,
        questionLink: event.questionLink,
        informationGoal: event.informationGoal,
        expectedSignals: event.expectedSignals,
        responseOptions: event.responseOptions,
        biasDirection: event.biasDirection,
        probeOrigin: event.probeOrigin,
        ...optionalAdaptiveReason(event),
        residentRoles: event.residentRoles,
        residentParticipationGoal: event.residentParticipationGoal,
        status: 'seeded',
      });
    }

    await ctx.db.patch(experimentId, {
      updatedAt: Date.now(),
      status: 'awaiting_user_responses',
      agentInputIds: [sceneInputId],
    });
    if (args.sceneRequestId) {
      await ctx.db.patch(args.sceneRequestId, {
        updatedAt: Date.now(),
        status: 'planned',
        worldId,
        experimentId,
      });
    }

    return {
      experimentId,
      worldId,
      engineId,
      agentInputIds: [sceneInputId],
    };
  },
});

export const startExperimentEvolution = mutation({
  args: {
    experimentId: v.id('mbtiExperiments'),
  },
  handler: async (ctx, args) => {
    const experiment = await ctx.db.get(args.experimentId);
    if (!experiment) {
      throw new Error('Experiment not found.');
    }
    if (experiment.status === 'running') {
      return { started: false, status: experiment.status };
    }
    if (experiment.status !== 'awaiting_user_responses') {
      throw new Error(`Experiment cannot be started from status ${experiment.status}.`);
    }
    await ctx.db.patch(args.experimentId, {
      updatedAt: Date.now(),
      status: 'running',
    });
    if (experiment.sceneRequestId) {
      await ctx.db.patch(experiment.sceneRequestId, {
        updatedAt: Date.now(),
        status: 'running',
        worldId: experiment.worldId,
        experimentId: experiment._id,
      });
    }
    await scheduleExperimentEvolution(ctx, experiment);
    return { started: true, status: 'running' };
  },
});

async function scheduleExperimentEvolution(
  ctx: MutationCtx,
  experiment: Doc<'mbtiExperiments'>,
) {
  const engine = await ctx.db.get(experiment.engineId);
  if (!engine) {
    throw new Error('Experiment engine not found.');
  }
  const durationMs = normalizeObservationDuration(
    experiment.observation.durationMs,
    experiment.observation.runCount,
  );
  const events = await ctx.db
    .query('mbtiEvents')
    .withIndex('experimentId', (q) => q.eq('experimentId', experiment._id))
    .collect();
  const eventWindowMs = Math.max(MBTI_SCENE_EVENT_MIN_GAP_MS, durationMs - 45 * 1000);
  const eventStepMs = Math.max(
    MBTI_SCENE_EVENT_MIN_GAP_MS,
    Math.floor(eventWindowMs / Math.max(1, events.length)),
  );
  for (const [index, event] of events.entries()) {
    const triggerDelay = Math.min(durationMs - 15 * 1000, eventStepMs * (index + 1));
    if (triggerDelay > 0) {
      await ctx.scheduler.runAfter(triggerDelay, internal.mbti.triggerSceneEvent, {
        experimentId: experiment._id,
        eventId: event._id,
      });
    }
  }
  await ctx.scheduler.runAfter(0, internal.aiTown.main.runStep, {
    worldId: experiment.worldId,
    generationNumber: engine.generationNumber,
    maxDuration: ENGINE_ACTION_DURATION,
  });
  await ctx.scheduler.runAfter(MBTI_SCENE_MESSAGE_INTERVAL_MS, internal.mbti.keepConversationPaced, {
    experimentId: experiment._id,
    attempt: 1,
  });
  await ctx.scheduler.runAfter(MBTI_BACKGROUND_WANDER_INTERVAL_MS, internal.mbti.wanderBackgroundResidents, {
    experimentId: experiment._id,
    attempt: 1,
  });
  await ctx.scheduler.runAfter(MBTI_TOWN_DAILY_EVENT_INTERVAL_MS, internal.mbti.triggerTownDailyEvent, {
    experimentId: experiment._id,
    attempt: 1,
  });
  const focusName = experiment.rolePresets.find((role) => role.enabled)?.label.trim();
  if (focusName) {
    await ctx.scheduler.runAfter(MBTI_FOCUS_CONVERSATION_INTERVAL_MS, internal.mbti.ensureFocusConversation, {
      experimentId: experiment._id,
      focusName,
      attempt: 1,
    });
    await ctx.scheduler.runAfter(
      MBTI_RESIDENT_INTERACTION_INTERVAL_MS,
      ensureResidentInteractionRef,
      {
        experimentId: experiment._id,
        focusName,
        attempt: 1,
      },
    );
    for (
      let attempt = 2;
      attempt * MBTI_RESIDENT_INTERACTION_INTERVAL_MS < durationMs;
      attempt++
    ) {
      await ctx.scheduler.runAfter(
        attempt * MBTI_RESIDENT_INTERACTION_INTERVAL_MS,
        ensureResidentInteractionRef,
        {
          experimentId: experiment._id,
          focusName,
          attempt,
        },
      );
    }
  }
  await ctx.scheduler.runAfter(durationMs, internal.mbti.finalizeExperiment, {
    experimentId: experiment._id,
  });
}

export const ensureResidentInteraction: any = internalAction({
  args: {
    experimentId: v.id('mbtiExperiments'),
    focusName: v.string(),
    attempt: v.number(),
  },
  handler: async (ctx, args) => {
    const evidence: any = await ctx.runQuery(internal.mbti.collectExperimentEvidence, {
      experimentId: args.experimentId,
    });
    if (!evidence || evidence.experiment.status !== 'running') {
      return null;
    }
    const residentNames: string[] = evidence.playerDescriptions
      .filter(
        (description: { description: string }) =>
          description.description.includes('常驻小镇') &&
          !description.description.includes('背景居民'),
      )
      .map((description: { name: string }) => description.name)
      .filter((name: string) => name !== '我' && name !== args.focusName);
    if (residentNames.length === 0) {
      return { started: false, reason: 'no-active-resident' };
    }
    const residentName: string = residentNames[(args.attempt - 1) % residentNames.length];
    const targetName = args.attempt % 2 === 0 ? args.focusName : '我';
    await ctx.runMutation(api.aiTown.main.sendInput, {
      worldId: evidence.experiment.worldId,
      name: 'ensureMbtiFocusConversation',
      args: {
        participantNames: [targetName, residentName],
      },
    });
    await ctx.runMutation(internal.mbti.recordPacingEvent, {
      worldId: evidence.experiment.worldId,
      title: '居民介入主线',
      description: `${residentName} 主动和${targetName}聊起刚才发生的事，让小镇居民不再只是旁观。`,
      participantIds: [targetName, residentName],
    });
    return { started: true, residentName, targetName };
  },
});

export const ensureFocusConversation = internalAction({
  args: {
    experimentId: v.id('mbtiExperiments'),
    focusName: v.string(),
    attempt: v.number(),
  },
  handler: async (ctx, args) => {
    const evidence = await ctx.runQuery(internal.mbti.collectExperimentEvidence, {
      experimentId: args.experimentId,
    });
    if (!evidence || evidence.experiment.status !== 'running') {
      return null;
    }
    await ctx.runMutation(api.aiTown.main.sendInput, {
      worldId: evidence.experiment.worldId,
      name: 'ensureMbtiFocusConversation',
      args: {
        participantNames: ['我', args.focusName],
      },
    });
    await ctx.runMutation(internal.mbti.recordPacingEvent, {
      worldId: evidence.experiment.worldId,
      title: '主线关系会面',
      description: `系统把“我”和“${args.focusName}”重新拉回同一段互动，避免常驻居民分散主线关系证据。`,
      participantIds: ['我', args.focusName],
    });
    const durationMs = evidence.experiment.observation.durationMs ?? durationForRunCount(24);
    if (args.attempt * MBTI_FOCUS_CONVERSATION_INTERVAL_MS < durationMs) {
      await ctx.scheduler.runAfter(MBTI_FOCUS_CONVERSATION_INTERVAL_MS, internal.mbti.ensureFocusConversation, {
        experimentId: args.experimentId,
        focusName: args.focusName,
        attempt: args.attempt + 1,
      });
    }
    return { checked: true };
  },
});

export const triggerSceneEvent = internalAction({
  args: {
    experimentId: v.id('mbtiExperiments'),
    eventId: v.id('mbtiEvents'),
  },
  handler: async (ctx, args) => {
    const payload = await ctx.runQuery(internal.mbti.getSceneEventPayload, {
      experimentId: args.experimentId,
      eventId: args.eventId,
    });
    if (!payload) {
      return null;
    }
    await ctx.runMutation(internal.mbti.updateEventStatus, {
      eventId: args.eventId,
      status: 'moving',
    });
    const rawParticipantNames = (payload.event.involvedRoles as string[]).map(displayParticipantName);
    const participantNames = Array.from(new Set(rawParticipantNames)).slice(0, 3);
    await ctx.runMutation(api.aiTown.main.sendInput, {
      worldId: payload.experiment.worldId,
      name: 'moveMbtiEventParticipants',
      args: {
        participantNames,
        locationKey: payload.locationKey,
        activity: travelActivityForSceneEvent(
          payload.event.title,
          payload.locationKey,
        ),
      },
    });
    await ctx.scheduler.runAfter(14 * 1000, internal.mbti.realizeSceneEvent, {
      experimentId: args.experimentId,
      eventId: args.eventId,
    });
    return { prepared: true };
  },
});

export const realizeSceneEvent = internalAction({
  args: {
    experimentId: v.id('mbtiExperiments'),
    eventId: v.id('mbtiEvents'),
  },
  handler: async (ctx, args) => {
    const payload = await ctx.runQuery(internal.mbti.getSceneEventPayload, {
      experimentId: args.experimentId,
      eventId: args.eventId,
    });
    if (!payload) {
      return null;
    }
    const rawParticipantNames = (payload.event.involvedRoles as string[]).map(displayParticipantName);
    const participantNames = Array.from(new Set(rawParticipantNames)).slice(0, 3);
    await ctx.runMutation(api.aiTown.main.sendInput, {
      worldId: payload.experiment.worldId,
      name: 'applyMbtiSceneActivity',
      args: {
        participantNames,
        activity: activityForSceneEvent(payload.event.title, payload.event.kind),
      },
    });
    const focusPartner = participantNames.find((name) => name !== '我');
    const focusParticipants = participantNames.includes('我')
      ? ['我', focusPartner].filter(
          (name): name is string => Boolean(name),
        )
      : [];
    if (focusParticipants.length === 2) {
      await ctx.runMutation(internal.mbti.updateEventStatus, {
        eventId: args.eventId,
        status: 'conversation_pending',
      });
      await ctx.runMutation(api.aiTown.main.sendInput, {
        worldId: payload.experiment.worldId,
        name: 'ensureMbtiFocusConversation',
        args: {
          participantNames: focusParticipants,
        },
      });
    }
    await ctx.runMutation(internal.mbti.recordTriggeredSceneEvent, {
      experimentId: args.experimentId,
      eventId: args.eventId,
      worldId: payload.experiment.worldId,
      title: payload.event.title,
      description:
        focusParticipants.length === 2
          ? `${payload.event.description} 系统已把${focusParticipants.join('和')}拉回同一段主线互动。`
          : payload.event.description,
      participantIds: participantNames,
    });
    await ctx.scheduler.runAfter(8 * 1000, internal.mbti.nudgeTriggeredEventEvidence, {
      experimentId: args.experimentId,
      eventId: args.eventId,
      attempt: 1,
    });
    return { triggered: true };
  },
});

export const triggerTownDailyEvent = internalAction({
  args: {
    experimentId: v.id('mbtiExperiments'),
    attempt: v.number(),
  },
  handler: async (ctx, args) => {
    const evidence = await ctx.runQuery(internal.mbti.collectExperimentEvidence, {
      experimentId: args.experimentId,
    });
    if (!evidence || evidence.experiment.status !== 'running' || !evidence.world) {
      return null;
    }
    const backgroundNames = evidence.playerDescriptions
      .filter((description: { description: string }) => description.description.includes('背景居民'))
      .map((description: { name: string }) => description.name);
    const selectedNames = selectDailyEventParticipants(backgroundNames, args.attempt);
    const dailyEvent = dailyTownEvent(args.attempt);
    if (selectedNames.length > 0) {
      await ctx.runMutation(api.aiTown.main.sendInput, {
        worldId: evidence.experiment.worldId,
        name: 'applyMbtiSceneActivity',
        args: {
          participantNames: selectedNames,
          activity: {
            description: dailyEvent.activity,
            emoji: dailyEvent.emoji,
            until: Date.now() + 45 * 1000,
          },
        },
      });
    }
    await ctx.runMutation(internal.mbti.recordPacingEvent, {
      worldId: evidence.experiment.worldId,
      title: dailyEvent.title,
      description: `${dailyEvent.description}${selectedNames.length > 0 ? ` 相关居民：${selectedNames.join('、')}。` : ''}`,
      participantIds: selectedNames,
    });
    const durationMs = evidence.experiment.observation.durationMs ?? durationForRunCount(24);
    if (args.attempt * MBTI_TOWN_DAILY_EVENT_INTERVAL_MS < durationMs) {
      await ctx.scheduler.runAfter(MBTI_TOWN_DAILY_EVENT_INTERVAL_MS, internal.mbti.triggerTownDailyEvent, {
        experimentId: args.experimentId,
        attempt: args.attempt + 1,
      });
    }
    return { triggered: true };
  },
});

export const getSceneEventPayload = internalQuery({
  args: {
    experimentId: v.id('mbtiExperiments'),
    eventId: v.id('mbtiEvents'),
  },
  handler: async (ctx, args) => {
    const experiment = await ctx.db.get(args.experimentId);
    const event = await ctx.db.get(args.eventId);
    if (
      !experiment ||
      !event ||
      experiment.status !== 'running' ||
      !['seeded', 'moving', 'conversation_pending'].includes(event.status)
    ) {
      return null;
    }
    const sceneRequest = experiment.sceneRequestId
      ? await ctx.db.get(experiment.sceneRequestId)
      : null;
    return { experiment, event, locationKey: sceneRequest?.selectedLocationKey };
  },
});

export const getTriggeredEventEvidencePayload = internalQuery({
  args: {
    experimentId: v.id('mbtiExperiments'),
    eventId: v.id('mbtiEvents'),
  },
  handler: async (ctx, args) => {
    const experiment = await ctx.db.get(args.experimentId);
    const event = await ctx.db.get(args.eventId);
    if (!experiment || !event) {
      return null;
    }
    const world = await ctx.db.get(experiment.worldId);
    if (!world) {
      return null;
    }
    const record = await ctx.db
      .query('socialEvents')
      .withIndex('by_world_time', (q) => q.eq('worldId', experiment.worldId))
      .filter((q) => q.eq(q.field('mbtiEventId'), args.eventId))
      .first();
    if (!record) {
      return null;
    }
    const playerDescriptions = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', experiment.worldId))
      .collect();
    const messages = await ctx.db
      .query('messages')
      .withIndex('conversationId', (q) => q.eq('worldId', experiment.worldId))
      .take(120);
    const playerNameById = Object.fromEntries(
      playerDescriptions.map((description) => [description.playerId, description.name]),
    );
    return { experiment, event, messages, playerNameById, record, world };
  },
});

export const recordTriggeredSceneEvent = internalMutation({
  args: {
    experimentId: v.id('mbtiExperiments'),
    eventId: v.id('mbtiEvents'),
    worldId: v.id('worlds'),
    title: v.string(),
    description: v.string(),
    participantIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const participantIds = await resolveParticipantIds(ctx, args.worldId, args.participantIds);
    const now = Date.now();
    const existingUserResponse = await ctx.db
      .query('mbtiUserResponses')
      .withIndex('experiment_event', (q) =>
        q.eq('experimentId', args.experimentId).eq('mbtiEventId', args.eventId),
      )
      .first();
    const nextStatus = existingUserResponse?.responseStatus === 'responded'
      ? 'responded'
      : existingUserResponse?.responseStatus === 'skipped'
      ? 'skipped'
      : 'pending_user_response';
    await ctx.db.patch(args.eventId, { status: nextStatus });
    const socialEventId = await ctx.db.insert('socialEvents', {
      worldId: args.worldId,
      createdAt: now,
      title: args.title,
      description: args.description,
      roomName: '常驻 MBTI 小镇',
      participantIds: participantIds as any,
      mbtiEventId: args.eventId,
      intensity: 62,
    });
    await recordEventEvidenceDoc(ctx, {
      experimentId: args.experimentId,
      mbtiEventId: args.eventId,
      worldId: args.worldId,
      occurredAt: now,
      kind: 'social_event',
      sourceId: socialEventId,
      participantIds,
      summary: args.title,
      reason: '事件已真实触发并写入小镇事件记录。',
    });
  },
});

export const nudgeTriggeredEventEvidence = internalAction({
  args: {
    experimentId: v.id('mbtiExperiments'),
    eventId: v.id('mbtiEvents'),
    attempt: v.number(),
  },
  handler: async (ctx, args) => {
    const payload = await ctx.runQuery(internal.mbti.getTriggeredEventEvidencePayload, {
      experimentId: args.experimentId,
      eventId: args.eventId,
    });
    if (!payload || payload.experiment.status !== 'running') {
      return null;
    }
    const participantIds = payload.record.participantIds as string[];
    if (participantIds.length < 2) {
      const recordedBehavior = await maybeRecordUserEventBehavior(ctx, payload);
      if (recordedBehavior) {
        await ctx.runMutation(internal.mbti.updateEventStatus, {
          eventId: args.eventId,
          status: 'observed',
        });
      }
      return { nudged: false, reason: 'not-enough-participants' };
    }
    const participantNames = participantIds
      .map((id) => payload.playerNameById[id])
      .filter((name): name is string => Boolean(name));
    if (participantNames.length >= 2 && args.attempt === 1) {
      await ctx.runMutation(api.aiTown.main.sendInput, {
        worldId: payload.experiment.worldId,
        name: 'ensureMbtiFocusConversation',
        args: {
          participantNames: participantNames.includes('我')
            ? ['我', participantNames.find((name) => name !== '我') ?? participantNames[1]]
            : participantNames.slice(0, 2),
        },
      });
    }
    const conversation = payload.world.conversations.find((item: any) =>
      participantIds.filter((id) =>
        item.participants?.some((participant: { playerId: string }) => participant.playerId === id),
      ).length >= 2,
    );
    if (!conversation) {
      if (args.attempt < 3) {
        await ctx.scheduler.runAfter(8 * 1000, internal.mbti.nudgeTriggeredEventEvidence, {
          experimentId: args.experimentId,
          eventId: args.eventId,
          attempt: args.attempt + 1,
        });
      } else {
        const recordedBehavior = await maybeRecordUserEventBehavior(ctx, payload);
        if (recordedBehavior) {
          await ctx.runMutation(internal.mbti.updateEventStatus, {
            eventId: args.eventId,
            status: 'observed',
          });
          return { nudged: true, reason: 'behavior-recorded-without-conversation' };
        }
      }
      await ctx.runMutation(internal.mbti.updateEventStatus, {
        eventId: args.eventId,
        status: 'conversation_pending',
      });
      return { nudged: false, reason: 'conversation-not-ready' };
    }
    const conversationParticipantIds = conversation.participants.map((participant: { playerId: string }) => participant.playerId);
    const userPlayerId = conversationParticipantIds.find((id: string) => payload.playerNameById[id] === '我');
    const sceneSpeakerId = conversationParticipantIds.find((id: string) => id !== userPlayerId)
      ?? conversationParticipantIds[0];
    const userReplyPlayerId = userPlayerId
      ?? conversationParticipantIds.find((id: string) => id !== sceneSpeakerId)
      ?? conversationParticipantIds[1];
    const messagePrefix = `mbti-event-${args.eventId}-`;
    const existingMessage = payload.messages.find((message) =>
      message.conversationId === conversation.id &&
      message.messageUuid.startsWith(messagePrefix),
    );
    if (existingMessage) {
      return { nudged: false, reason: 'already-has-event-message' };
    }
    const text = await eventConversationText(
      ctx,
      payload.experiment.worldId,
      conversation.id,
      sceneSpeakerId,
      userReplyPlayerId,
      payload.event.title,
      payload.event.description,
    );
    const now = Date.now();
    const messageUuid = `${messagePrefix}${args.attempt}-${now}`;
    await ctx.runMutation(api.messages.writeMessage, {
      worldId: payload.experiment.worldId,
      conversationId: conversation.id,
      messageUuid,
      playerId: sceneSpeakerId,
      text,
    });
    await ctx.runMutation(internal.mbti.recordEventEvidence, {
      experimentId: args.experimentId,
      eventId: args.eventId,
      worldId: payload.experiment.worldId,
      occurredAt: now,
      kind: 'message',
      sourceId: messageUuid,
      participantIds: [sceneSpeakerId],
      summary: text,
      reason: '事件触发后由现场参与人先揭示具体情况。',
    });
    const replyText = await eventConversationReplyText(
      ctx,
      payload.experiment.worldId,
      conversation.id,
      userReplyPlayerId,
      sceneSpeakerId,
      payload.event.title,
      payload.event.description,
    );
    const replyAt = now + 1;
    const replyUuid = `${messagePrefix}${args.attempt}-reply-${now}`;
    await ctx.runMutation(api.messages.writeMessage, {
      worldId: payload.experiment.worldId,
      conversationId: conversation.id,
      messageUuid: replyUuid,
      playerId: userReplyPlayerId,
      text: replyText,
    });
    await ctx.runMutation(internal.mbti.recordEventEvidence, {
      experimentId: args.experimentId,
      eventId: args.eventId,
      worldId: payload.experiment.worldId,
      occurredAt: replyAt,
      kind: 'message',
      sourceId: replyUuid,
      participantIds: [userReplyPlayerId],
      summary: replyText,
      reason: '事件触发后用户的最小回应，防止单句事件对话。',
    });
    await ctx.runMutation(internal.mbti.updateEventStatus, {
      eventId: args.eventId,
      status: 'observed',
    });
    await maybeRecordUserEventBehavior(ctx, payload);
    return { nudged: true };
  },
});

export const wanderBackgroundResidents = internalAction({
  args: {
    experimentId: v.id('mbtiExperiments'),
    attempt: v.number(),
  },
  handler: async (ctx, args) => {
    const evidence = await ctx.runQuery(internal.mbti.collectExperimentEvidence, {
      experimentId: args.experimentId,
    });
    if (!evidence || evidence.experiment.status !== 'running') {
      return null;
    }
    await ctx.runMutation(api.aiTown.main.sendInput, {
      worldId: evidence.experiment.worldId,
      name: 'wanderMbtiBackgroundResidents',
      args: {},
    });
    const durationMs = evidence.experiment.observation.durationMs ?? durationForRunCount(24);
    if (args.attempt * MBTI_BACKGROUND_WANDER_INTERVAL_MS < durationMs) {
      await ctx.scheduler.runAfter(MBTI_BACKGROUND_WANDER_INTERVAL_MS, internal.mbti.wanderBackgroundResidents, {
        experimentId: args.experimentId,
        attempt: args.attempt + 1,
      });
    }
    return { checked: true };
  },
});

export const keepConversationPaced = internalAction({
  args: {
    experimentId: v.id('mbtiExperiments'),
    attempt: v.number(),
  },
  handler: async (ctx, args) => {
    const evidence = await ctx.runQuery(internal.mbti.collectExperimentEvidence, {
      experimentId: args.experimentId,
    });
    if (!evidence || evidence.experiment.status !== 'running' || !evidence.world) {
      return null;
    }
    const now = Date.now();
    const activeConversation = (evidence.world.conversations as any[]).find(
      (conversation) => conversation.participants?.length === 2,
    );
    if (activeConversation) {
      const lastMessageAt = activeConversation.lastMessage?.timestamp ?? 0;
      const shouldNudge =
        !activeConversation.isTyping &&
        (!lastMessageAt || now - lastMessageAt >= MBTI_SCENE_MESSAGE_INTERVAL_MS);
      if (shouldNudge) {
        const participantIds = activeConversation.participants.map(
          (participant: { playerId: string }) => participant.playerId,
        );
        const lastAuthor = activeConversation.lastMessage?.author;
        const speakerId = participantIds.find((id: string) => id !== lastAuthor) ?? participantIds[0];
        const otherPlayerId = participantIds.find((id: string) => id !== speakerId) ?? participantIds[1];
        const text = await pacedConversationText(
          ctx,
          evidence.experiment.worldId,
          activeConversation.id,
          speakerId,
          otherPlayerId,
        );
        await ctx.runMutation(api.messages.writeMessage, {
          worldId: evidence.experiment.worldId,
          conversationId: activeConversation.id,
          messageUuid: `mbti-pace-${args.experimentId}-${args.attempt}-${now}`,
          playerId: speakerId,
          text,
        });
        await ctx.runMutation(internal.mbti.recordPacingEvent, {
          worldId: evidence.experiment.worldId,
          title: '对话节奏补充',
          description: '系统检测到本轮场景接近 2 分钟没有新交流，补充一次自然短句，避免观察窗口空转。',
          participantIds,
        });
      }
    }
    const durationMs = evidence.experiment.observation.durationMs ?? durationForRunCount(24);
    if (args.attempt * MBTI_SCENE_MESSAGE_INTERVAL_MS < durationMs) {
      await ctx.scheduler.runAfter(MBTI_SCENE_MESSAGE_INTERVAL_MS, internal.mbti.keepConversationPaced, {
        experimentId: args.experimentId,
        attempt: args.attempt + 1,
      });
    }
    return { checked: true };
  },
});

export const recordPacingEvent = internalMutation({
  args: {
    worldId: v.id('worlds'),
    title: v.string(),
    description: v.string(),
    participantIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const participantIds = await resolveParticipantIds(ctx, args.worldId, args.participantIds);
    await ctx.db.insert('socialEvents', {
      worldId: args.worldId,
      createdAt: Date.now(),
      title: args.title,
      description: args.description,
      roomName: '常驻 MBTI 小镇',
      participantIds: participantIds as any,
      intensity: 35,
    });
  },
});

async function maybeRecordUserEventBehavior(
  ctx: Parameters<typeof startConversationMessage>[0],
  payload: {
    experiment: Doc<'mbtiExperiments'>;
    event: Doc<'mbtiEvents'>;
    record: Doc<'socialEvents'>;
    playerNameById: Record<string, string>;
  },
) {
  const selfPlayerId = (payload.record.participantIds as string[]).find(
    (id) => payload.playerNameById[id] === '我',
  );
  if (!selfPlayerId) {
    return false;
  }
  const behaviorPrefix = `event-action:${payload.event._id}`;
  const existingBehavior = await ctx.runQuery(internal.mbti.getExistingEventBehavior, {
    experimentId: payload.experiment._id,
    eventId: payload.event._id,
  });
  if (existingBehavior) {
    return true;
  }
  const behavior = await chooseUserEventBehavior(payload.experiment, payload.event);
  if (!behavior) {
    return false;
  }
  await ctx.runMutation(internal.mbti.recordUserEventBehavior, {
    experimentId: payload.experiment._id,
    eventId: payload.event._id,
    worldId: payload.experiment.worldId,
    playerId: selfPlayerId,
    label: behaviorPrefix,
    description: behavior,
  });
  return true;
}

export const getExistingEventBehavior = internalQuery({
  args: {
    experimentId: v.id('mbtiExperiments'),
    eventId: v.id('mbtiEvents'),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('mbtiBehaviorEvents')
      .withIndex('experiment_event', (q) =>
        q.eq('experimentId', args.experimentId).eq('mbtiEventId', args.eventId),
      )
      .filter((q) => q.eq(q.field('label'), `event-action:${args.eventId}`))
      .first();
  },
});

export const recordUserEventBehavior = internalMutation({
  args: {
    experimentId: v.id('mbtiExperiments'),
    eventId: v.id('mbtiEvents'),
    worldId: v.id('worlds'),
    playerId: v.string(),
    label: v.string(),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('mbtiBehaviorEvents', {
      experimentId: args.experimentId,
      mbtiEventId: args.eventId,
      worldId: args.worldId,
      createdAt: Date.now(),
      playerId: args.playerId as any,
      label: args.label,
      description: args.description,
    });
    await recordEventEvidenceDoc(ctx, {
      experimentId: args.experimentId,
      mbtiEventId: args.eventId,
      worldId: args.worldId,
      occurredAt: Date.now(),
      kind: 'behavior',
      sourceId: args.label,
      participantIds: [args.playerId],
      summary: args.description,
      reason: '事件触发后记录到的用户可观察行为。',
    });
  },
});

export const updateEventStatus = internalMutation({
  args: {
    eventId: v.id('mbtiEvents'),
    status: v.union(
      v.literal('seeded'),
      v.literal('moving'),
      v.literal('conversation_pending'),
      v.literal('triggered'),
      v.literal('pending_user_response'),
      v.literal('observed'),
      v.literal('responded'),
      v.literal('skipped'),
      v.literal('expired_to_stage_report'),
      v.literal('resolved'),
      v.literal('failed'),
    ),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) {
      return { updated: false };
    }
    if (
      ['responded', 'skipped', 'expired_to_stage_report', 'resolved'].includes(event.status) &&
      !['responded', 'skipped', 'expired_to_stage_report', 'resolved'].includes(args.status)
    ) {
      return { updated: false, reason: 'already-resolved' };
    }
    await ctx.db.patch(args.eventId, { status: args.status });
    return { updated: true };
  },
});

export const recordEventEvidence = internalMutation({
  args: {
    experimentId: v.id('mbtiExperiments'),
    eventId: v.id('mbtiEvents'),
    worldId: v.id('worlds'),
    occurredAt: v.number(),
    kind: v.union(
      v.literal('social_event'),
      v.literal('message'),
      v.literal('behavior'),
      v.literal('thought'),
    ),
    sourceId: v.optional(v.string()),
    participantIds: v.array(v.string()),
    summary: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    return await recordEventEvidenceDoc(ctx, {
      experimentId: args.experimentId,
      mbtiEventId: args.eventId,
      worldId: args.worldId,
      occurredAt: args.occurredAt,
      kind: args.kind,
      sourceId: args.sourceId,
      participantIds: args.participantIds,
      summary: args.summary,
      reason: args.reason,
    });
  },
});

async function recordEventEvidenceDoc(
  ctx: MutationCtx,
  args: {
    experimentId: Id<'mbtiExperiments'>;
    mbtiEventId: Id<'mbtiEvents'>;
    worldId: Id<'worlds'>;
    occurredAt: number;
    kind: 'social_event' | 'message' | 'behavior' | 'thought';
    sourceId?: string;
    participantIds: string[];
    summary: string;
    reason: string;
  },
) {
  if (args.sourceId) {
    const existing = await ctx.db
      .query('mbtiEventEvidence')
      .withIndex('source', (q) =>
        q.eq('worldId', args.worldId).eq('kind', args.kind).eq('sourceId', args.sourceId),
      )
      .first();
    if (existing) {
      return { inserted: false, evidenceId: existing._id };
    }
  }
  const evidenceId = await ctx.db.insert('mbtiEventEvidence', {
    experimentId: args.experimentId,
    mbtiEventId: args.mbtiEventId,
    worldId: args.worldId,
    createdAt: Date.now(),
    occurredAt: args.occurredAt,
    kind: args.kind,
    sourceId: args.sourceId,
    participantIds: args.participantIds as any,
    summary: compactForPrompt(args.summary, 220),
    reason: args.reason,
  });
  return { inserted: true, evidenceId };
}

async function chooseUserEventBehavior(
  experiment: Doc<'mbtiExperiments'>,
  event: Doc<'mbtiEvents'>,
) {
  const deterministic = deterministicUserBehavior(experiment, event);
  try {
    const { content } = await chatCompletion({
      messages: [
        {
          role: 'system',
          content: [
            '你是 MBTI 小镇里“我”这个用户人格代理的行为决策器。',
            '你只能判断事件触发后，“我”有没有做出一个可观察的具体动作。',
            '行为必须是外部可见动作，不是心理、准备、到达、移动、参与、想法、聊天意愿或系统状态。',
            '如果没有明确动作，输出 {"action": "none"}。',
            '如果有动作，只输出 JSON：{"action":"一句中文具体动作，12-40字"}。',
          ].join('\n'),
        },
        {
          role: 'user',
          content: [
            `人格代码：${experiment.profile.code}`,
            `行为倾向：${JSON.stringify(experiment.profile.behaviors)}`,
            `用户问题：${experiment.question}`,
            `事件标题：${event.title}`,
            `事件内容：${event.description}`,
            `候选行为可以包括：追问具体事实、改选替代方案、请求旁人确认、明确拒绝、暂时退出现场、继续原计划并设边界。`,
            `不要写“前往、到达、停留、准备回应、开始沟通”。`,
          ].join('\n'),
        },
      ],
      max_tokens: 80,
      temperature: 0.2,
    });
    const parsed = parseActionJson(content);
    return parsed ?? deterministic;
  } catch (error) {
    console.warn('MBTI user event behavior generation failed, using deterministic behavior', error);
    return deterministic;
  }
}

function parseActionJson(content: string) {
  const jsonText = content.trim().match(/\{[\s\S]*\}/)?.[0] ?? content.trim();
  try {
    const parsed = JSON.parse(jsonText) as { action?: unknown };
    if (parsed.action === 'none') {
      return null;
    }
    if (typeof parsed.action !== 'string') {
      return null;
    }
    return normalizeActionText(parsed.action);
  } catch {
    return null;
  }
}

function deterministicUserBehavior(experiment: Doc<'mbtiExperiments'>, event: Doc<'mbtiEvents'>) {
  const behavior = experiment.profile.behaviors;
  const text = `${experiment.question} ${event.description}`;
  if ((behavior.factChecking ?? 0) >= 62) {
    return normalizeActionText(/缺货|资料|信息|导航|系统|通知|误会/.test(text)
      ? '我当场核对具体情况，再决定是否调整原计划。'
      : '我追问刚才发生的具体原因。');
  }
  if ((behavior.withdrawal ?? 0) >= 68 || (behavior.rumination ?? 0) >= 70) {
    return normalizeActionText('我先离开当前场面，暂停继续处理这件事。');
  }
  if ((behavior.repairDrive ?? 0) >= 62 || (behavior.socialInitiation ?? 0) >= 62) {
    return normalizeActionText('我请对方把刚才的情况说清楚。');
  }
  return null;
}

function normalizeActionText(action: string) {
  const trimmed = action.trim().replace(/^我[:：]\s*/, '我');
  if (!trimmed || /前往|到达|停留|准备|开始沟通|事件参与|进入.*现场/.test(trimmed)) {
    return null;
  }
  return trimmed.length > 44 ? `${trimmed.slice(0, 44)}。` : trimmed;
}

async function pacedConversationText(
  ctx: Parameters<typeof startConversationMessage>[0],
  worldId: Doc<'mbtiExperiments'>['worldId'],
  conversationId: string,
  speakerId: string,
  otherPlayerId: string,
) {
  try {
    return await startConversationMessage(
      ctx,
      worldId,
      conversationId as any,
      speakerId as any,
      otherPlayerId as any,
    );
  } catch (error) {
    console.warn('MBTI paced conversation generation failed, using fallback line', error);
    return '我刚刚有点走神，我们继续说吧。';
  }
}

async function eventConversationText(
  ctx: Parameters<typeof startConversationMessage>[0],
  worldId: Doc<'mbtiExperiments'>['worldId'],
  conversationId: string,
  speakerId: string,
  otherPlayerId: string,
  eventTitle: string,
  eventDescription: string,
) {
  try {
    return await startConversationMessage(
      ctx,
      worldId,
      conversationId as any,
      speakerId as any,
      otherPlayerId as any,
      {
        sceneInstruction: eventSceneInstruction(eventTitle, eventDescription),
      },
    );
  } catch (error) {
    console.warn('MBTI event conversation generation failed, using fallback line', error);
    return `刚才这个“${eventTitle}”有点打乱节奏，我先把眼前这一步处理好。${compactEventFallback(eventDescription)}`;
  }
}

async function eventConversationReplyText(
  ctx: Parameters<typeof startConversationMessage>[0],
  worldId: Doc<'mbtiExperiments'>['worldId'],
  conversationId: string,
  speakerId: string,
  otherPlayerId: string,
  eventTitle: string,
  eventDescription: string,
) {
  try {
    return await startConversationMessage(
      ctx,
      worldId,
      conversationId as any,
      speakerId as any,
      otherPlayerId as any,
      {
        sceneInstruction: [
          eventSceneInstruction(eventTitle, eventDescription),
          `你现在要接住对方刚才关于这个事件的话，给出一句具体回应。`,
          `不要结束对话，不要转移到无关寒暄。`,
        ].join('\n'),
      },
    );
  } catch (error) {
    console.warn('MBTI event reply generation failed, using fallback line', error);
    return `这件事确实会耽误安排，我们先把能确认的部分说清楚。`;
  }
}

function eventSceneInstruction(eventTitle: string, eventDescription: string) {
  const detail = compactEventFallback(eventDescription).replace(/^我注意到的是：/, '').trim();
  return [
    `你正在回应刚刚触发的事件“${eventTitle}”。`,
    detail ? `事件具体内容：${detail}` : `事件背景：${compactForPrompt(eventDescription, 180)}`,
    `这句话必须自然接住这个事件，只谈眼前发生的事；不要跳到无关寒暄，不要解释实验，不要总结人格。`,
    `如果你是“我”，就表达自己对这件事的即时反应或下一步打算；如果你不是“我”，就引导对方聊聊刚才发生的具体事。`,
  ].join('\n');
}

function compactEventFallback(description: string) {
  const match = description.match(/具体事情：([^。]+)/);
  const detail = match?.[1]?.trim();
  return detail ? `我注意到的是：${detail}。` : '';
}

function compactForPrompt(text: string, maxLength: number) {
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

async function resolveParticipantIds(ctx: MutationCtx, worldId: Doc<'worlds'>['_id'], participants: string[]) {
  const descriptions = await ctx.db
    .query('playerDescriptions')
    .withIndex('worldId', (q) => q.eq('worldId', worldId))
    .collect();
  const ids = [];
  for (const participant of participants) {
    if (participant.startsWith('p:')) {
      ids.push(participant);
      continue;
    }
    const description = descriptions.find((item) => item.name === participant);
    if (description) {
      ids.push(description.playerId);
    }
  }
  return ids;
}

export const getExperiment = query({
  args: {
    experimentId: v.id('mbtiExperiments'),
  },
  handler: async (ctx, args) => {
    const experiment = await ctx.db.get(args.experimentId);
    if (!experiment) {
      return null;
    }
    const worldStatus = await ctx.db
      .query('worldStatus')
      .withIndex('worldId', (q) => q.eq('worldId', experiment.worldId))
      .unique();
    const engine = await ctx.db.get(experiment.engineId);
    const world = await ctx.db.get(experiment.worldId);
    const messages = (await ctx.db
      .query('messages')
      .withIndex('conversationId', (q) => q.eq('worldId', experiment.worldId))
      .order('desc')
      .take(240)).reverse();
    const playerDescriptions = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', experiment.worldId))
      .collect();
    const events = await ctx.db
      .query('mbtiEvents')
      .withIndex('experimentId', (q) => q.eq('experimentId', experiment._id))
      .collect();
    const innerThoughts = await ctx.db
      .query('innerThoughts')
      .withIndex('player', (q) => q.eq('worldId', experiment.worldId))
      .take(120);
    const socialEvents = await ctx.db
      .query('socialEvents')
      .withIndex('by_world_time', (q) => q.eq('worldId', experiment.worldId))
      .take(160);
    const behaviorEvents = await ctx.db
      .query('mbtiBehaviorEvents')
      .withIndex('world_time', (q) => q.eq('worldId', experiment.worldId))
      .take(240);
    const eventEvidence = await ctx.db
      .query('mbtiEventEvidence')
      .withIndex('world_time', (q) => q.eq('worldId', experiment.worldId))
      .take(320);
    const userResponses = await ctx.db
      .query('mbtiUserResponses')
      .withIndex('experiment_time', (q) => q.eq('experimentId', experiment._id))
      .collect();
    const archivedConversations = await ctx.db
      .query('archivedConversations')
      .withIndex('worldId', (q) => q.eq('worldId', experiment.worldId))
      .take(12);
    const memories = [];
    for (const player of world?.players ?? []) {
      const playerMemories = await ctx.db
        .query('memories')
        .withIndex('playerId', (q) => q.eq('playerId', player.id))
        .take(6);
      memories.push(...playerMemories);
    }
    return {
      experiment,
      engine,
      worldStatus,
      world,
      messages,
      playerDescriptions,
      events,
      eventEvidence,
      userResponses,
      behaviorEvents,
      innerThoughts,
      socialEvents,
      archivedConversations,
      memories,
    };
  },
});

export const submitUserResponse = mutation({
  args: {
    experimentId: v.id('mbtiExperiments'),
    mbtiEventId: v.id('mbtiEvents'),
    selectedOption: v.string(),
    confidence: v.number(),
    emotions: v.array(v.string()),
    freeText: v.string(),
    scenarioFit: v.union(
      v.literal('fits'),
      v.literal('partial'),
      v.literal('not_fit'),
    ),
    correctionText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const experiment = await ctx.db.get(args.experimentId);
    const event = await ctx.db.get(args.mbtiEventId);
    if (!experiment || !event || event.experimentId !== experiment._id) {
      throw new Error('Invalid MBTI user response target.');
    }
    const now = Date.now();
    const existing = await ctx.db
      .query('mbtiUserResponses')
      .withIndex('experiment_event', (q) =>
        q.eq('experimentId', args.experimentId).eq('mbtiEventId', args.mbtiEventId),
      )
      .first();
    const payload = {
      updatedAt: now,
      selectedOption: args.selectedOption.trim().slice(0, 80),
      confidence: Math.max(1, Math.min(7, Math.round(args.confidence))),
      emotions: args.emotions.map((emotion) => emotion.trim()).filter(Boolean).slice(0, 6),
      freeText: args.freeText.trim().slice(0, 1200),
      scenarioFit: args.scenarioFit,
      correctionText: args.correctionText?.trim().slice(0, 1200) || undefined,
      responseStatus: 'responded' as const,
    };
    if (existing) {
      await ctx.db.patch(existing._id, payload);
      if (!['seeded', 'moving', 'conversation_pending'].includes(event.status)) {
        await ctx.db.patch(args.mbtiEventId, { status: 'responded' });
      }
      await refreshDecisionState(ctx, args.experimentId);
      return { responseId: existing._id, updated: true };
    }
    const responseId = await ctx.db.insert('mbtiUserResponses', {
      experimentId: args.experimentId,
      mbtiEventId: args.mbtiEventId,
      createdAt: now,
      ...payload,
    });
    if (!['seeded', 'moving', 'conversation_pending'].includes(event.status)) {
      await ctx.db.patch(args.mbtiEventId, { status: 'responded' });
    }
    await refreshDecisionState(ctx, args.experimentId);
    return { responseId, updated: false };
  },
});

export const skipUserResponse = mutation({
  args: {
    experimentId: v.id('mbtiExperiments'),
    mbtiEventId: v.id('mbtiEvents'),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const experiment = await ctx.db.get(args.experimentId);
    const event = await ctx.db.get(args.mbtiEventId);
    if (!experiment || !event || event.experimentId !== experiment._id) {
      throw new Error('Invalid MBTI user response target.');
    }
    const now = Date.now();
    const existing = await ctx.db
      .query('mbtiUserResponses')
      .withIndex('experiment_event', (q) =>
        q.eq('experimentId', args.experimentId).eq('mbtiEventId', args.mbtiEventId),
      )
      .first();
    const payload = {
      updatedAt: now,
      selectedOption: '跳过此情境',
      confidence: 1,
      emotions: [] as string[],
      freeText: args.reason?.trim().slice(0, 1200) || '用户选择暂不回应这个情境。',
      scenarioFit: 'partial' as const,
      correctionText: args.reason?.trim().slice(0, 1200) || undefined,
      responseStatus: 'skipped' as const,
    };
    if (existing) {
      await ctx.db.patch(existing._id, payload);
    } else {
      await ctx.db.insert('mbtiUserResponses', {
        experimentId: args.experimentId,
        mbtiEventId: args.mbtiEventId,
        createdAt: now,
        ...payload,
      });
    }
    if (!['seeded', 'moving', 'conversation_pending'].includes(event.status)) {
      await ctx.db.patch(args.mbtiEventId, { status: 'skipped' });
    }
    await refreshDecisionState(ctx, args.experimentId);
    return { skipped: true };
  },
});

async function refreshDecisionState(ctx: MutationCtx, experimentId: Id<'mbtiExperiments'>) {
  const [events, responses] = await Promise.all([
    ctx.db
      .query('mbtiEvents')
      .withIndex('experimentId', (q) => q.eq('experimentId', experimentId))
      .collect(),
    ctx.db
      .query('mbtiUserResponses')
      .withIndex('experiment_time', (q) => q.eq('experimentId', experimentId))
      .collect(),
  ]);
  const respondedEventIds = new Set(
    responses
      .filter((response) => response.responseStatus === 'responded')
      .map((response) => String(response.mbtiEventId)),
  );
  const respondedVariables = new Set<string>();
  for (const event of events) {
    if (respondedEventIds.has(String(event._id)) && event.testedVariable) {
      respondedVariables.add(event.testedVariable);
    }
  }
  const required = Math.max(1, Math.min(5, events.length || 1));
  const responded = Math.min(required, respondedEventIds.size);
  const unresolvedVariables = events
    .map((event) => event.testedVariable)
    .filter((variable): variable is string => Boolean(variable && !respondedVariables.has(variable)));
  const latestCorrection = responses
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .find((response) => response.correctionText || response.scenarioFit !== 'fits');
  const decisionState = {
    updatedAt: Date.now(),
    resolvedVariables: Array.from(respondedVariables).slice(0, 8),
    uncertainVariables: Array.from(new Set(unresolvedVariables)).slice(0, 8),
    confirmedConstraints: inferConfirmedConstraints(responses).slice(0, 8),
    sensitiveConditions: inferSensitiveConditions(events, responses).slice(0, 8),
    responseCoverage: {
      responded,
      required,
      missing: Math.max(0, required - responded),
    },
    lastUserCorrection: latestCorrection?.correctionText || undefined,
  };
  await ctx.db.patch(experimentId, {
    updatedAt: Date.now(),
    decisionState,
  });
  await maybeCreateAdaptiveProbe(ctx, experimentId, events, responses, decisionState);
}

async function maybeCreateAdaptiveProbe(
  ctx: MutationCtx,
  experimentId: Id<'mbtiExperiments'>,
  events: Doc<'mbtiEvents'>[],
  responses: Doc<'mbtiUserResponses'>[],
  decisionState: NonNullable<Doc<'mbtiExperiments'>['decisionState']>,
) {
  const experiment = await ctx.db.get(experimentId);
  if (!experiment || experiment.status !== 'running') {
    return;
  }
  const latestResponse = responses.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (!latestResponse || latestResponse.responseStatus !== 'responded') {
    return;
  }
  const needsCalibration = latestResponse.scenarioFit !== 'fits' || Boolean(latestResponse.correctionText);
  const targetVariable = needsCalibration
    ? adaptiveVariableFromResponse(latestResponse, decisionState)
    : decisionState.uncertainVariables[0];
  if (!targetVariable) {
    return;
  }
  const hasExistingAdaptive = events.some((event) =>
    event.testedVariable === targetVariable &&
    (event.probeOrigin === 'adaptive' || event.probeOrigin === 'calibration') &&
    !['responded', 'skipped', 'expired_to_stage_report', 'resolved', 'failed'].includes(event.status),
  );
  if (hasExistingAdaptive) {
    return;
  }
  const createdAdaptiveCount = events.filter((event) => event.probeOrigin === 'adaptive' || event.probeOrigin === 'calibration').length;
  if (createdAdaptiveCount >= 3) {
    return;
  }
  const residentParticipation = residentParticipationForProbe(
    targetVariable,
    latestResponse.correctionText || latestResponse.freeText,
    createdAdaptiveCount,
  );
  const adaptiveResidents = await adaptiveResidentParticipants(ctx, experiment, createdAdaptiveCount);
  const adaptiveResidentNames = adaptiveResidents.map((resident) => resident.name);
  const adaptiveInvolvedRoles = [
    'self',
    ...adaptiveResidentNames,
  ];
  const now = Date.now();
  const title = needsCalibration
    ? `校准探针：${compactForPrompt(targetVariable, 18)}`
    : `追问探针：${compactForPrompt(targetVariable, 18)}`;
  const adaptiveReason = needsCalibration
    ? `用户修正了情境理解：${latestResponse.correctionText || latestResponse.freeText || '情境不完全贴合'}`
    : `用户已回应部分变量，下一步优先测试仍不确定的“${targetVariable}”。`;
  const eventId = await ctx.db.insert('mbtiEvents', {
    experimentId,
    worldId: experiment.worldId,
    createdAt: now,
    tickOffset: 2 + events.length * 2,
    kind: needsCalibration ? 'evaluation' : 'opportunity',
    title,
    description: [
      `场景：小镇公共地点，居民围绕刚才暴露出的真实约束继续推进一次校准。`,
      `事件强度：中等`,
      `具体事情：居民把“${targetVariable}”具体化成一个新的现实条件，请我判断这个条件是否会改变原来的选择。`,
      `参与者：我${adaptiveResidentNames.length ? `、${adaptiveResidentNames.join('、')}` : '、当前场景居民'}`,
      `观察维度：${targetVariable}`,
      `问题关联：根据用户真实回应动态生成，用来验证刚刚确认或修正的解释是否稳定。`,
      `想获得的信息：${adaptiveReason}`,
      `可评判信号：用户是否坚持原选择、提出条件边界、改选过渡方案或指出系统仍误解了自己。`,
    ].join(' '),
    involvedRoles: adaptiveInvolvedRoles,
    testedVariable: targetVariable,
    testedHypotheses: (experiment.questionFocus?.outcomeHypotheses ?? []).map((hypothesis) => hypothesis.label).slice(0, 4),
    questionLink: '根据用户真实回应动态生成，用来验证当前解释是否稳定。',
    informationGoal: adaptiveReason,
    expectedSignals: ['坚持原选择', '提出条件边界', '改选过渡方案', '指出系统误解'],
    biasDirection: 'balanced',
    probeOrigin: needsCalibration ? 'calibration' : 'adaptive',
    adaptiveReason,
    residentRoles: adaptiveResidentNames.length
      ? residentParticipation.roles.map((role, index) => `${role}：${adaptiveResidentNames[index % adaptiveResidentNames.length]}`)
      : residentParticipation.roles,
    residentParticipationGoal: residentParticipation.goal,
    status: 'seeded',
  });
  await ctx.scheduler.runAfter(MBTI_SCENE_EVENT_MIN_GAP_MS, internal.mbti.triggerSceneEvent, {
    experimentId,
    eventId,
  });
}

async function adaptiveResidentParticipants(
  ctx: MutationCtx,
  experiment: Doc<'mbtiExperiments'>,
  offset: number,
): Promise<Array<{ key: string; name: string }>> {
  if (experiment.townId && experiment.sceneRequestId) {
    const townId = experiment.townId;
    const sceneRequest = await ctx.db.get(experiment.sceneRequestId);
    const selectedKeys = sceneRequest?.selectedResidentKeys ?? [];
    if (selectedKeys.length > 0) {
      const residents = await ctx.db
        .query('mbtiTownResidents')
        .withIndex('town_status', (q) => q.eq('townId', townId).eq('status', 'active'))
        .collect();
      const selectedResidents = selectedKeys
        .map((key) => residents.find((resident) => resident.key === key))
        .filter((resident): resident is Doc<'mbtiTownResidents'> => Boolean(resident));
      if (selectedResidents.length > 0) {
        return rotateResidents(selectedResidents, offset).slice(0, Math.min(2, selectedResidents.length));
      }
    }
  }
  const createdResidentRoles = experiment.socialField.createdRoles
    .filter((role) => role.startsWith('resident:'))
    .map((role) => role.replace(/^resident:/, ''))
    .filter(Boolean);
  return rotateResidents(
    createdResidentRoles.map((key, index) => ({
      key,
      name: `常驻居民${index + 1}`,
    })),
    offset,
  ).slice(0, Math.min(2, createdResidentRoles.length));
}

function rotateResidents<T>(residents: T[], offset: number) {
  if (residents.length === 0) {
    return residents;
  }
  return residents.map((_, index) => residents[(index + offset) % residents.length]);
}

function adaptiveVariableFromResponse(
  response: Doc<'mbtiUserResponses'>,
  decisionState: NonNullable<Doc<'mbtiExperiments'>['decisionState']>,
) {
  const text = `${response.freeText} ${response.correctionText ?? ''}`;
  if (/现金|收入|房贷|医保|医疗|钱|预算|缓冲/.test(text)) {
    return '经济缓冲与现金流底线';
  }
  if (/家人|父母|孩子|伴侣|照顾|责任/.test(text)) {
    return '家庭责任与关系压力';
  }
  if (/合同|竞业|签约|法律|资格|身份/.test(text)) {
    return '合同资格与外部限制';
  }
  if (/主导权|自主|控制|被管|决策/.test(text)) {
    return '自主性与主导权边界';
  }
  return decisionState.uncertainVariables[0] ?? decisionState.sensitiveConditions[0] ?? '用户修正后的关键条件';
}

function inferConfirmedConstraints(responses: Doc<'mbtiUserResponses'>[]) {
  const text = responses.map((response) => `${response.freeText} ${response.correctionText ?? ''}`).join(' ');
  const constraints = [];
  if (/现金|存款|收入|房贷|医保|医疗|钱|预算|缓冲/.test(text)) {
    constraints.push('现金流或经济缓冲是已确认约束');
  }
  if (/家人|父母|孩子|伴侣|照顾|责任/.test(text)) {
    constraints.push('家庭或关系责任是已确认约束');
  }
  if (/合同|竞业|签约|法律|资格|身份/.test(text)) {
    constraints.push('合同、资格或身份条件是已确认约束');
  }
  if (/主导权|自主|控制|被管|决策/.test(text)) {
    constraints.push('自主性或主导权是已确认高敏感条件');
  }
  return constraints;
}

function inferSensitiveConditions(events: Doc<'mbtiEvents'>[], responses: Doc<'mbtiUserResponses'>[]) {
  const responseText = responses.map((response) => `${response.selectedOption} ${response.freeText} ${response.correctionText ?? ''}`).join(' ');
  const eventText = events.map((event) => `${event.testedVariable ?? ''} ${event.informationGoal ?? ''}`).join(' ');
  const text = `${responseText} ${eventText}`;
  const conditions = [];
  if (/风险|稳定|收入|现金|钱/.test(text)) {
    conditions.push('经济风险');
  }
  if (/家人|伴侣|关系|评价|反对/.test(text)) {
    conditions.push('关系压力');
  }
  if (/自主|主导|控制|意义|成长/.test(text)) {
    conditions.push('自主与意义');
  }
  if (/时间|长期|未来|后果|执行/.test(text)) {
    conditions.push('长期执行代价');
  }
  return conditions;
}

export const finalizeExperiment = internalAction({
  args: {
    experimentId: v.id('mbtiExperiments'),
  },
  handler: async (ctx, args) => {
    const evidence = await ctx.runQuery(internal.mbti.collectExperimentEvidence, {
      experimentId: args.experimentId,
    });
    if (!evidence || evidence.experiment.status !== 'running') {
      return null;
    }
    const reportEvidence = {
      ...evidence,
      behaviorEvents: (evidence as { behaviorEvents?: Doc<'mbtiBehaviorEvents'>[] }).behaviorEvents ?? [],
    };
    const fallbackReport = buildDeterministicReport(reportEvidence);
    let report = fallbackReport;
    try {
      const { content } = await chatCompletion({
        messages: [
          {
            role: 'user',
            content: buildReportPrompt(reportEvidence, fallbackReport),
          },
        ],
        max_tokens: 700,
        temperature: 0.2,
      });
      report = {
        ...fallbackReport,
        summary: content.trim() || fallbackReport.summary,
      };
    } catch (error) {
      console.warn('MBTI experiment report LLM failed, using deterministic report', error);
    }
    await ctx.runMutation(internal.mbti.completeExperiment, {
      experimentId: args.experimentId,
      report,
    });
    return report;
  },
});

export const collectExperimentEvidence = internalQuery({
  args: {
    experimentId: v.id('mbtiExperiments'),
  },
  handler: async (ctx, args) => {
    const experiment = await ctx.db.get(args.experimentId);
    if (!experiment) {
      return null;
    }
    const world = await ctx.db.get(experiment.worldId);
    const messages = (await ctx.db
      .query('messages')
      .withIndex('conversationId', (q) => q.eq('worldId', experiment.worldId))
      .order('desc')
      .take(80)).reverse();
    const archivedConversations = await ctx.db
      .query('archivedConversations')
      .withIndex('worldId', (q) => q.eq('worldId', experiment.worldId))
      .take(20);
    const innerThoughts = await ctx.db
      .query('innerThoughts')
      .filter((q) => q.eq(q.field('worldId'), experiment.worldId))
      .take(20);
    const socialEvents = await ctx.db
      .query('socialEvents')
      .withIndex('by_world_time', (q) => q.eq('worldId', experiment.worldId))
      .take(20);
    const events = await ctx.db
      .query('mbtiEvents')
      .withIndex('experimentId', (q) => q.eq('experimentId', experiment._id))
      .collect();
    const eventEvidence = await ctx.db
      .query('mbtiEventEvidence')
      .withIndex('world_time', (q) => q.eq('worldId', experiment.worldId))
      .take(160);
    const userResponses = await ctx.db
      .query('mbtiUserResponses')
      .withIndex('experiment_time', (q) => q.eq('experimentId', experiment._id))
      .collect();
    const behaviorEvents = await ctx.db
      .query('mbtiBehaviorEvents')
      .withIndex('world_time', (q) => q.eq('worldId', experiment.worldId))
      .take(160);
    const playerDescriptions = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', experiment.worldId))
      .collect();
    const memories = [];
    for (const player of world?.players ?? []) {
      const playerMemories = await ctx.db
        .query('memories')
        .withIndex('playerId', (q) => q.eq('playerId', player.id))
        .take(4);
      memories.push(...playerMemories);
    }
    return {
      experiment,
      world,
      messages,
      archivedConversations,
      innerThoughts,
      socialEvents,
      events,
      eventEvidence,
      userResponses,
      behaviorEvents,
      playerDescriptions,
      memories,
    };
  },
});

export const completeExperiment = internalMutation({
  args: {
    experimentId: v.id('mbtiExperiments'),
    report: v.object({
      generatedAt: v.number(),
      summary: v.string(),
      personalityFit: v.string(),
      evidence: v.array(v.string()),
      conclusion: v.string(),
      answerOptions: v.optional(v.array(v.object({
        label: v.string(),
        probability: v.number(),
        answer: v.string(),
        why: v.string(),
        signals: v.array(v.string()),
      }))),
      evidenceLevel: v.optional(v.union(
        v.literal('level_0'),
        v.literal('level_1'),
        v.literal('level_2'),
        v.literal('level_3'),
      )),
      realUserResponseCount: v.optional(v.number()),
      requiredUserResponseCount: v.optional(v.number()),
      missingUserResponseCount: v.optional(v.number()),
      confidenceNotice: v.optional(v.string()),
      limits: v.string(),
    }),
  },
  handler: async (ctx, args) => {
    const experiment = await ctx.db.get(args.experimentId);
    if (!experiment || experiment.status !== 'running') {
      return null;
    }
    const engine = await ctx.db.get(experiment.engineId);
    if (engine?.running) {
      await ctx.db.patch(experiment.engineId, {
        running: false,
        generationNumber: engine.generationNumber + 1,
      });
    }
    const worldStatus = await ctx.db
      .query('worldStatus')
      .withIndex('worldId', (q) => q.eq('worldId', experiment.worldId))
      .first();
    if (worldStatus) {
      await ctx.db.patch(worldStatus._id, {
        status: 'inactive',
        lastViewed: Date.now(),
      });
    }
    await createCompletionSocialEvent(ctx, experiment.worldId);
    const events = await ctx.db
      .query('mbtiEvents')
      .withIndex('experimentId', (q) => q.eq('experimentId', experiment._id))
      .collect();
    const socialEvents = await ctx.db
      .query('socialEvents')
      .withIndex('by_world_time', (q) => q.eq('worldId', experiment.worldId))
      .collect();
    const eventIdsWithRecords = new Set(
      socialEvents
        .map((event) => event.mbtiEventId)
        .filter((eventId): eventId is Id<'mbtiEvents'> => !!eventId),
    );
    const userResponses = await ctx.db
      .query('mbtiUserResponses')
      .withIndex('experiment_time', (q) => q.eq('experimentId', experiment._id))
      .collect();
    const responseByEventId = new Map(userResponses.map((response) => [String(response.mbtiEventId), response]));
    for (const event of events) {
      if (eventIdsWithRecords.has(event._id)) {
        const response = responseByEventId.get(String(event._id));
        if (response?.responseStatus === 'responded') {
          await ctx.db.patch(event._id, { status: 'responded' });
        } else if (response?.responseStatus === 'skipped') {
          await ctx.db.patch(event._id, { status: 'skipped' });
        } else {
          await ctx.db.patch(event._id, { status: 'expired_to_stage_report' });
        }
      }
    }
    await consolidateResidentTownMemory(ctx, experiment);
    await ctx.db.patch(experiment._id, {
      status: 'complete',
      completedAt: Date.now(),
      updatedAt: Date.now(),
      report: args.report,
    });
    if (experiment.sceneRequestId) {
      await ctx.db.patch(experiment.sceneRequestId, {
        updatedAt: Date.now(),
        status: 'complete',
      });
    }
    return { completed: true };
  },
});

async function consolidateResidentTownMemory(ctx: MutationCtx, experiment: Doc<'mbtiExperiments'>) {
  if (!experiment.townId || !experiment.sceneRequestId) {
    return;
  }
  const sceneRequest = await ctx.db.get(experiment.sceneRequestId);
  if (!sceneRequest) {
    return;
  }
  const residentKeys = sceneRequest.selectedResidentKeys;
  if (residentKeys.length === 0) {
    return;
  }
  const alreadyStored = await ctx.db
    .query('mbtiTownMemories')
    .withIndex('town_time', (q) => q.eq('townId', experiment.townId!))
    .filter((q) => q.eq(q.field('sourceSceneRequestId'), experiment.sceneRequestId))
    .first();
  if (alreadyStored) {
    return;
  }
  const [events, socialEvents, messages, playerDescriptions] = await Promise.all([
    ctx.db
      .query('mbtiEvents')
      .withIndex('experimentId', (q) => q.eq('experimentId', experiment._id))
      .collect(),
    ctx.db
      .query('socialEvents')
      .withIndex('by_world_time', (q) => q.eq('worldId', experiment.worldId))
      .collect(),
    ctx.db
      .query('messages')
      .withIndex('conversationId', (q) => q.eq('worldId', experiment.worldId))
      .take(30),
    ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', experiment.worldId))
      .collect(),
  ]);
  const residentDocs = await Promise.all(
    residentKeys.map((key) =>
      ctx.db
        .query('mbtiTownResidents')
        .withIndex('town_key', (q) => q.eq('townId', experiment.townId!).eq('key', key))
        .first(),
    ),
  );
  const residentNames = residentDocs
    .filter((resident): resident is NonNullable<typeof resident> => !!resident)
    .map((resident) => resident.name);
  const playerNameById = new Map(playerDescriptions.map((description) => [description.playerId, description.name]));
  const residentMessageCount = messages.filter((message) =>
    residentNames.includes(playerNameById.get(message.author) ?? ''),
  ).length;
  const eventTitles = events
    .slice(-4)
    .map((event) => event.title)
    .join('、');
  const socialTitles = socialEvents
    .filter((event) => event.title !== '对话节奏补充')
    .slice(-4)
    .map((event) => event.title)
    .join('、');
  const now = Date.now();
  await ctx.db.insert('mbtiTownMemories', {
    townId: experiment.townId,
    createdAt: now,
    updatedAt: now,
    kind: 'scene',
    salience: Math.min(100, 45 + events.length * 6 + residentMessageCount * 4),
    title: `场景留痕：${sceneRequest.sceneType}`,
    summary: [
      `本次临时访客场景发生在${sceneRequest.selectedLocationKey}。`,
      residentNames.length > 0 ? `参与的常驻居民：${residentNames.join('、')}。` : '',
      eventTitles ? `场景事件：${eventTitles}。` : '',
      socialTitles ? `小镇动态：${socialTitles}。` : '',
      residentMessageCount > 0
        ? `常驻居民在对话中留下 ${residentMessageCount} 条可供后续参考的表达。`
        : '本轮常驻居民直接表达较少，仅保留事件痕迹。',
    ]
      .filter(Boolean)
      .join(' '),
    residentKeys,
    locationKey: sceneRequest.selectedLocationKey,
    status: 'active',
    sourceSceneRequestId: sceneRequest._id,
  });
  const deltas = await applyResidentRelationshipDeltas(ctx, experiment.townId, residentKeys, now);
  await ctx.db.patch(sceneRequest._id, {
    updatedAt: now,
    townRelationshipDeltas: deltas,
  });
}

async function applyResidentRelationshipDeltas(
  ctx: MutationCtx,
  townId: Doc<'mbtiTownProfiles'>['_id'],
  residentKeys: string[],
  now: number,
) {
  const deltas: Array<{
    residentAKey: string;
    residentBKey: string;
    trust: number;
    warmth: number;
    tension: number;
    reason: string;
  }> = [];
  for (let aIndex = 0; aIndex < residentKeys.length; aIndex++) {
    for (let bIndex = aIndex + 1; bIndex < residentKeys.length; bIndex++) {
      const aKey = residentKeys[aIndex];
      const bKey = residentKeys[bIndex];
      const relationship =
        (await ctx.db
          .query('mbtiRelationships')
          .withIndex('town_pair', (q) =>
            q.eq('townId', townId).eq('residentAKey', aKey).eq('residentBKey', bKey),
          )
          .first()) ??
        (await ctx.db
          .query('mbtiRelationships')
          .withIndex('town_pair', (q) =>
            q.eq('townId', townId).eq('residentAKey', bKey).eq('residentBKey', aKey),
          )
          .first());
      if (!relationship) {
        continue;
      }
      const delta = {
        residentAKey: relationship.residentAKey,
        residentBKey: relationship.residentBKey,
        trust: 1,
        warmth: 1,
        tension: 0,
        reason: '共同经历一次临时访客场景，形成轻微熟悉度和协作记忆。',
      };
      await ctx.db.patch(relationship._id, {
        familiarity: Math.min(100, relationship.familiarity + 2),
        trust: Math.min(100, relationship.trust + delta.trust),
        warmth: Math.min(100, relationship.warmth + delta.warmth),
        tension: Math.max(0, relationship.tension + delta.tension),
        lastInteractionAt: now,
        updatedAt: now,
      });
      deltas.push(delta);
    }
  }
  return deltas.slice(0, 12);
}

export const deleteExperiment = mutation({
  args: {
    experimentId: v.id('mbtiExperiments'),
  },
  handler: async (ctx, args) => {
    const experiment = await ctx.db.get(args.experimentId);
    if (!experiment) {
      return { deleted: false };
    }
    const cleanup = await stopExperimentRuntime(ctx, experiment);
    await ctx.db.patch(experiment._id, {
      status: 'failed',
      completedAt: experiment.completedAt ?? Date.now(),
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(
      cleanup.deferred ? MBTI_RUNTIME_DELETE_GRACE_MS : 0,
      internal.mbti.continueDeleteExperiment,
      { experimentId: experiment._id },
    );
    return { deleted: true, deferred: true };
  },
});

export const clearAllExperiments = mutation({
  args: {},
  handler: async (ctx) => {
    const experiments = await ctx.db.query('mbtiExperiments').collect();
    for (const experiment of experiments) {
      const cleanup = await stopExperimentRuntime(ctx, experiment);
      await ctx.db.patch(experiment._id, {
        status: 'failed',
        completedAt: experiment.completedAt ?? Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.scheduler.runAfter(
        cleanup.deferred ? MBTI_RUNTIME_DELETE_GRACE_MS : 0,
        internal.mbti.continueDeleteExperiment,
        { experimentId: experiment._id },
      );
    }
    return { deleted: experiments.length };
  },
});

export const clearOrphanMemoryEmbeddings = mutation({
  args: {},
  handler: async (ctx) => {
    let deleted = 0;
    const embeddings = await ctx.db.query('memoryEmbeddings').collect();
    for (const embedding of embeddings) {
      const memory = await ctx.db
        .query('memories')
        .withIndex('embeddingId', (q) => q.eq('embeddingId', embedding._id))
        .first();
      if (!memory) {
        await ctx.db.delete(embedding._id);
        deleted++;
      }
    }
    return { deleted };
  },
});

export const cleanupStaleMbtiExperiments = internalMutation({
  args: {
    keepLatest: v.optional(v.number()),
    completedMaxAgeMs: v.optional(v.number()),
    staleActiveMaxAgeMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const keepLatest = Math.max(1, Math.floor(args.keepLatest ?? MBTI_EXPERIMENTS_TO_KEEP));
    const completedMaxAgeMs = args.completedMaxAgeMs ?? MBTI_COMPLETED_RETENTION_MS;
    const staleActiveMaxAgeMs = args.staleActiveMaxAgeMs ?? MBTI_STALE_ACTIVE_RETENTION_MS;
    const now = Date.now();
    const experiments = await ctx.db.query('mbtiExperiments').withIndex('createdAt').order('desc').collect();
    let archived = 0;
    let deleted = 0;

    for (let index = 0; index < experiments.length; index++) {
      const experiment = experiments[index];
      if (experiment.runtimeArchivedAt) {
        continue;
      }
      const age = now - experiment.createdAt;
      const isRecentKept = index < keepLatest;
      const isStaleActive =
        (experiment.status === 'creating' || experiment.status === 'running') &&
        age > staleActiveMaxAgeMs;
      const isExpiredResult =
        (experiment.status === 'complete' || experiment.status === 'failed') &&
        (age > completedMaxAgeMs || !isRecentKept);

      if (isStaleActive || isExpiredResult) {
        await archiveExperimentRuntime(ctx, experiment, isStaleActive ? 'stale-active' : 'expired-result');
        archived++;
      }
    }

    return { archived, deleted, checked: experiments.length, keptLatest: keepLatest };
  },
});

export const continueDeleteExperiment = internalMutation({
  args: {
    experimentId: v.id('mbtiExperiments'),
  },
  handler: async (ctx, args) => {
    const experiment = await ctx.db.get(args.experimentId);
    if (!experiment) {
      return { done: true };
    }
    const runtime = await deleteExperimentRuntime(ctx, experiment);
    if (runtime.done) {
      const deleted =
        (await deleteExperimentIndexedBatch(ctx, 'mbtiEvents', 'experimentId', experiment._id)) +
        (await deleteExperimentIndexedBatch(ctx, 'mbtiUserResponses', 'experiment_time', experiment._id)) +
        (await deleteWorldIndexedBatch(ctx, 'mbtiEventEvidence', 'world_time', experiment.worldId)) +
        (await deleteWorldIndexedBatch(ctx, 'mbtiBehaviorEvents', 'world_time', experiment.worldId));
      if (deleted === 0) {
        await ctx.db.delete(experiment._id);
        return { done: true };
      }
    }
    await ctx.scheduler.runAfter(
      runtime.deferred ? MBTI_RUNTIME_DELETE_GRACE_MS : 1000,
      internal.mbti.continueDeleteExperiment,
      { experimentId: experiment._id },
    );
    return { done: false };
  },
});

async function archiveExperimentRuntime(
  ctx: MutationCtx,
  experiment: Doc<'mbtiExperiments'>,
  reason: string,
) {
  const now = Date.now();
  const fallbackReport = experiment.report ?? await buildRuntimeArchiveReport(ctx, experiment, reason, now);
  const patch: {
    runtimeArchivedAt?: number;
    updatedAt: number;
    report: MbtiReport;
    status?: 'failed';
    completedAt?: number;
  } = {
    updatedAt: now,
    report: fallbackReport,
  };
  if (experiment.status === 'creating' || experiment.status === 'running') {
    patch.status = 'failed';
    patch.completedAt = experiment.completedAt ?? now;
  }
  const cleanup = await deleteExperimentRuntime(ctx, experiment);
  if (cleanup.done) {
    patch.runtimeArchivedAt = now;
  } else {
    await ctx.scheduler.runAfter(cleanup.deferred ? MBTI_RUNTIME_DELETE_GRACE_MS : 1000, internal.mbti.continueArchiveExperimentRuntime, {
      experimentId: experiment._id,
      reason,
    });
  }
  await ctx.db.patch(experiment._id, patch);
}

export const continueArchiveExperimentRuntime = internalMutation({
  args: {
    experimentId: v.id('mbtiExperiments'),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const experiment = await ctx.db.get(args.experimentId);
    if (!experiment || experiment.runtimeArchivedAt) {
      return { done: true };
    }
    await archiveExperimentRuntime(ctx, experiment, args.reason);
    return { done: false };
  },
});

async function buildRuntimeArchiveReport(
  ctx: MutationCtx,
  experiment: Doc<'mbtiExperiments'>,
  reason: string,
  now: number,
): Promise<MbtiReport> {
  const [
    messages,
    archivedConversations,
    events,
    eventEvidence,
    userResponses,
    innerThoughts,
    socialEvents,
    behaviorEvents,
  ] = await Promise.all([
    ctx.db
      .query('messages')
      .withIndex('conversationId', (q) => q.eq('worldId', experiment.worldId))
      .take(80),
    ctx.db
      .query('archivedConversations')
      .withIndex('worldId', (q) => q.eq('worldId', experiment.worldId))
      .take(20),
    ctx.db
      .query('mbtiEvents')
      .withIndex('experimentId', (q) => q.eq('experimentId', experiment._id))
      .collect(),
    ctx.db
      .query('mbtiEventEvidence')
      .withIndex('world_time', (q) => q.eq('worldId', experiment.worldId))
      .take(160),
    ctx.db
      .query('mbtiUserResponses')
      .withIndex('experiment_time', (q) => q.eq('experimentId', experiment._id))
      .collect(),
    ctx.db
      .query('innerThoughts')
      .filter((q) => q.eq(q.field('worldId'), experiment.worldId))
      .take(40),
    ctx.db
      .query('socialEvents')
      .withIndex('by_world_time', (q) => q.eq('worldId', experiment.worldId))
      .take(80),
    ctx.db
      .query('mbtiBehaviorEvents')
      .withIndex('world_time', (q) => q.eq('worldId', experiment.worldId))
      .take(80),
  ]);
  const memories: Doc<'memories'>[] = [];
  const world = await ctx.db.get(experiment.worldId);
  for (const player of world?.players ?? []) {
    memories.push(
      ...(await ctx.db
        .query('memories')
        .withIndex('playerId', (q) => q.eq('playerId', player.id))
        .take(3)),
    );
  }
  const report = buildDeterministicReport({
    experiment,
    messages,
    archivedConversations,
    events,
    eventEvidence,
    userResponses,
    innerThoughts,
    socialEvents,
    behaviorEvents,
    memories,
  });
  const reasonLabel = reason === 'stale-active'
    ? '运行超时未完成，系统已归档运行时数据'
    : '结果超过保留窗口，系统已归档运行时数据';
  return {
    ...report,
    generatedAt: now,
    summary: `${report.summary} ${reasonLabel}，保留问题、人格、对象预设、事件摘要和已有结论。`,
    limits: `${report.limits} 原始 world、逐条聊天和临时运行状态已清理，历史页展示的是归档摘要。`,
  };
}

async function stopExperimentRuntime(ctx: MutationCtx, experiment: Doc<'mbtiExperiments'>) {
  const now = Date.now();
  const worldId = experiment.worldId;
  const engine = await ctx.db.get(experiment.engineId);
  const worldStatus = await ctx.db
    .query('worldStatus')
    .withIndex('worldId', (q) => q.eq('worldId', worldId))
    .first();
  const runtimeStillActive =
    engine?.running === true ||
    worldStatus?.status === 'running';

  if (engine?.running) {
    await ctx.db.patch(experiment.engineId, {
      running: false,
      generationNumber: engine.generationNumber + 1,
    });
  }
  if (worldStatus) {
    await ctx.db.patch(worldStatus._id, {
      status: 'stoppedByDeveloper',
      lastViewed: now,
    });
  }
  return { deferred: runtimeStillActive };
}

async function deleteExperimentRuntime(ctx: MutationCtx, experiment: Doc<'mbtiExperiments'>) {
  const worldId = experiment.worldId;
  const stopped = await stopExperimentRuntime(ctx, experiment);
  if (stopped.deferred) {
    return { done: false, deferred: true };
  }

  const world = await ctx.db.get(worldId);
  const playerIds = world?.players.map((player) => player.id) ?? [];
  const worldStatus = await ctx.db
    .query('worldStatus')
    .withIndex('worldId', (q) => q.eq('worldId', worldId))
    .first();

    let deleted = 0;
    if (experiment.mapId) {
      await ctx.db.delete(experiment.mapId);
      await ctx.db.patch(experiment._id, { mapId: undefined });
      deleted += 1;
    }
    deleted += await deleteWorldIndexedBatch(ctx, 'playerDescriptions', 'worldId', worldId);
    deleted += await deleteWorldIndexedBatch(ctx, 'agentDescriptions', 'worldId', worldId);
    deleted += await deleteWorldIndexedBatch(ctx, 'archivedPlayers', 'worldId', worldId);
    deleted += await deleteWorldIndexedBatch(ctx, 'archivedConversations', 'worldId', worldId);
    deleted += await deleteWorldIndexedBatch(ctx, 'archivedAgents', 'worldId', worldId);
    deleted += await deleteWorldIndexedBatch(ctx, 'participatedTogether', 'playerHistory', worldId);
    deleted += await deleteWorldIndexedBatch(ctx, 'messages', 'conversationId', worldId);
    deleted += await deleteWorldIndexedBatch(ctx, 'innerThoughts', 'player', worldId);
    deleted += await deleteWorldIndexedBatch(ctx, 'socialEvents', 'by_world', worldId);
    deleted += await deleteWorldIndexedBatch(ctx, 'mbtiBehaviorEvents', 'world_time', worldId);
    for (const playerId of playerIds) {
      const memories = await ctx.db
        .query('memories')
        .withIndex('playerId', (q) => q.eq('playerId', playerId))
        .take(MBTI_DELETE_BATCH_SIZE);
      for (const memory of memories) {
        if (await ctx.db.get(memory.embeddingId)) {
          await ctx.db.delete(memory.embeddingId);
        }
        await ctx.db.delete(memory._id);
      }
    }
    const inputs = await ctx.db
      .query('inputs')
      .withIndex('byInputNumber', (q) => q.eq('engineId', experiment.engineId))
      .take(MBTI_DELETE_BATCH_SIZE);
    for (const input of inputs) {
      await ctx.db.delete(input._id);
    }
    if (deleted === 0 && world) {
      await ctx.db.delete(world._id);
    }
    if (worldStatus) {
      await ctx.db.delete(worldStatus._id);
    }
    if (await ctx.db.get(experiment.engineId)) {
      await ctx.db.delete(experiment.engineId);
    }
    return { done: deleted === 0, deferred: false };
}

async function deleteWorldIndexedBatch(
  ctx: MutationCtx,
  tableName: string,
  indexName: string,
  worldId: Id<'worlds'>,
) {
  const docs = await (ctx.db.query(tableName as any) as any)
    .withIndex(indexName, (q: any) => q.eq('worldId', worldId))
    .take(MBTI_DELETE_BATCH_SIZE);
  for (const doc of docs) {
    await ctx.db.delete(doc._id);
  }
  return docs.length;
}

async function deleteExperimentIndexedBatch(
  ctx: MutationCtx,
  tableName: string,
  indexName: string,
  experimentId: Id<'mbtiExperiments'>,
) {
  const docs = await (ctx.db.query(tableName as any) as any)
    .withIndex(indexName, (q: any) => q.eq('experimentId', experimentId))
    .take(MBTI_DELETE_BATCH_SIZE);
  for (const doc of docs) {
    await ctx.db.delete(doc._id);
  }
  return docs.length;
}


export const debugLLM = action({
  args: {},
  handler: async () => {
    const config = getLLMConfig();
    const started = Date.now();
    const { content, retries, ms } = await chatCompletion({
      messages: [{ role: 'user', content: '请只回复：ok' }],
      max_tokens: 8,
      temperature: 0,
    });
    return {
      provider: config.provider,
      url: config.url,
      chatModel: config.chatModel,
      embeddingModel: config.embeddingModel,
      hasApiKey: Boolean(config.apiKey),
      content,
      retries,
      ms,
      totalMs: Date.now() - started,
    };
  },
});

export const debugConversationMessage = action({
  args: {
    worldId: v.id('worlds'),
    conversationId: v.string(),
    playerId: v.string(),
    otherPlayerId: v.string(),
  },
  handler: async (ctx, args) => {
    const text = await startConversationMessage(
      ctx,
      args.worldId,
      args.conversationId as any,
      args.playerId as any,
      args.otherPlayerId as any,
    );
    return { text };
  },
});

function durationForRunCount(runCount: number) {
  if (runCount <= 24) {
    return 3 * 60 * 1000;
  }
  if (runCount <= 48) {
    return 10 * 60 * 1000;
  }
  return 30 * 60 * 1000;
}

function normalizeObservationDuration(durationMs: number | undefined, runCount: number) {
  if (typeof durationMs === 'number' && Number.isFinite(durationMs)) {
    const min = 30 * 60 * 1000;
    const max = 8 * 60 * 60 * 1000;
    return Math.min(max, Math.max(min, Math.round(durationMs)));
  }
  return durationForRunCount(runCount);
}

function normalizeTargetEventCount(targetEventCount: number | undefined, durationMs: number) {
  if (typeof targetEventCount === 'number' && Number.isFinite(targetEventCount)) {
    return Math.min(96, Math.max(1, Math.round(targetEventCount)));
  }
  if (durationMs <= 30 * 60 * 1000) {
    return 6;
  }
  if (durationMs <= 60 * 60 * 1000) {
    return 12;
  }
  return Math.min(96, Math.max(20, Math.round(durationMs / (6 * 60 * 1000))));
}

function activityForSceneEvent(title: string, kind: Doc<'mbtiEvents'>['kind']) {
  const now = Date.now();
  if (kind === 'pressure') {
    return { description: title, emoji: '💢', until: now + 45 * 1000 };
  }
  if (kind === 'misunderstanding') {
    return { description: title, emoji: '❓', until: now + 45 * 1000 };
  }
  if (kind === 'opportunity') {
    return { description: title, emoji: '💬', until: now + 45 * 1000 };
  }
  if (kind === 'evaluation') {
    return { description: title, emoji: '👀', until: now + 45 * 1000 };
  }
  return { description: title, emoji: '✨', until: now + 45 * 1000 };
}

function travelActivityForSceneEvent(title: string, locationKey?: string) {
  const now = Date.now();
  return {
    description: `去${locationLabelForKey(locationKey)}：${title}`,
    emoji: '➡️',
    until: now + 40 * 1000,
  };
}

function locationLabelForKey(locationKey?: string) {
  const labels: Record<string, string> = {
    cafe: '咖啡馆',
    square: '广场',
    clinic: '诊所',
    school: '旧校舍',
    riverside: '河边步道',
    hallway: '公寓走廊',
    workshop: '工坊',
    office: '社区办公室',
    station: '车站',
    shop: '商店',
  };
  return locationKey ? labels[locationKey] ?? '现场' : '现场';
}

function dailyTownEvent(attempt: number) {
  const events = [
    {
      title: '早市开始',
      description: '小镇居民开始采购、摆摊和交换近况，公共气氛变得更嘈杂。',
      activity: '忙早市',
      emoji: '🧺',
    },
    {
      title: '社区事务提醒',
      description: '公告栏更新了社区事项，几位居民临时聚到一起确认安排。',
      activity: '看公告',
      emoji: '📌',
    },
    {
      title: '店铺换班',
      description: '附近店铺进入换班时间，居民的移动路线和可交流状态发生变化。',
      activity: '换班',
      emoji: '🕒',
    },
    {
      title: '邻里小摩擦',
      description: '两位居民因为公共空间使用有些不满，旁人开始留意气氛。',
      activity: '处理小摩擦',
      emoji: '💭',
    },
    {
      title: '临时帮忙',
      description: '有人需要搬东西或找人帮忙，镇里的熟人关系被短暂调动。',
      activity: '帮忙',
      emoji: '📦',
    },
  ];
  return events[attempt % events.length];
}

function selectDailyEventParticipants(names: string[], attempt: number) {
  if (names.length === 0) {
    return [];
  }
  const count = Math.min(4, Math.max(2, names.length));
  const start = (attempt * 3) % names.length;
  const selected = [];
  for (let index = 0; index < count; index++) {
    selected.push(names[(start + index) % names.length]);
  }
  return selected;
}

function buildDeterministicReport(evidence: {
  experiment: Doc<'mbtiExperiments'>;
  messages: Doc<'messages'>[];
  archivedConversations: Doc<'archivedConversations'>[];
  events: Doc<'mbtiEvents'>[];
  eventEvidence: Doc<'mbtiEventEvidence'>[];
  userResponses: Doc<'mbtiUserResponses'>[];
  innerThoughts: Doc<'innerThoughts'>[];
  socialEvents: Doc<'socialEvents'>[];
  behaviorEvents: Doc<'mbtiBehaviorEvents'>[];
  memories: Doc<'memories'>[];
}): MbtiReport {
  const dayCount = Math.max(1, evidence.archivedConversations.length);
  const behaviors = evidence.experiment.profile.behaviors;
  const credibility = reportCredibility(evidence.events, evidence.userResponses);
  const evidenceLines = [
    `模拟经过 ${dayCount} 天：每结束一段对话按一天计。`,
    `收集聊天 ${evidence.messages.length} 条，结束对话 ${evidence.archivedConversations.length} 段。`,
    `生成记忆 ${evidence.memories.length} 条，内心独白 ${evidence.innerThoughts.length} 条。`,
    `用户行为 ${evidence.behaviorEvents.length} 条。`,
    `事件记录 ${evidence.socialEvents.length} 条。`,
    `主线事件 ${evidence.events.length} 个，绑定证据 ${evidence.eventEvidence.length} 条。`,
    `真实用户关键回应 ${credibility.realUserResponseCount}/${credibility.requiredUserResponseCount} 个。`,
  ];
  if (evidence.experiment.questionFocus) {
    evidenceLines.push(
      `本轮观察目标：${evidence.experiment.questionFocus.observationGoal}`,
      `证据方向：${evidence.experiment.questionFocus.evidenceTargets.join('、')}`,
    );
  }
  const tendency = [
    behaviors.withdrawal >= 55 ? '压力下更容易先退开或观察' : '压力下不一定明显退开',
    behaviors.repairDrive >= 55 ? '修复动机较强' : '修复动机需要更多外部触发',
    behaviors.meaningProjection >= 55 ? '容易推演关系含义' : '更依赖当下事实',
    behaviors.emotionalSensitivity >= 55 ? '对对方语气和回应敏感' : '情绪反应相对平稳',
  ].join('，');
  const conclusion =
    evidence.messages.length + evidence.memories.length + evidence.innerThoughts.length >= 4
      ? `当前证据初步支持 ${evidence.experiment.profile.code} 的行为倾向：${tendency}。`
      : `当前证据还偏少，只能作为 ${evidence.experiment.profile.code} 的初步观察：${tendency}。`;
  const answerOptions = buildAnswerOptions(evidence, tendency);
  return {
    generatedAt: Date.now(),
    summary: evidence.experiment.questionFocus
      ? `本次小镇演化围绕“${evidence.experiment.question}”运行，重点观察“${evidence.experiment.questionFocus.observationGoal}”。`
      : `本次小镇演化围绕“${evidence.experiment.question}”运行，按对话轮次折算为 ${dayCount} 天。`,
    personalityFit: tendency,
    evidence: evidenceLines,
    conclusion,
    answerOptions,
    evidenceLevel: credibility.evidenceLevel,
    realUserResponseCount: credibility.realUserResponseCount,
    requiredUserResponseCount: credibility.requiredUserResponseCount,
    missingUserResponseCount: credibility.missingUserResponseCount,
    confidenceNotice: credibility.confidenceNotice,
    limits: `${credibility.confidenceNotice} 这是一次小样本演化，结论只用于判断人格倾向是否有迹可循，不代表现实必然结果。`,
  };
}

function reportCredibility(
  events: Doc<'mbtiEvents'>[],
  userResponses: Doc<'mbtiUserResponses'>[],
) {
  const requiredUserResponseCount = Math.max(1, Math.min(5, events.length || 1));
  const respondedEventIds = new Set(
    userResponses
      .filter((response) => response.responseStatus === 'responded')
      .map((response) => String(response.mbtiEventId)),
  );
  const realUserResponseCount = Math.min(requiredUserResponseCount, respondedEventIds.size);
  const missingUserResponseCount = Math.max(0, requiredUserResponseCount - realUserResponseCount);
  const evidenceLevel: NonNullable<MbtiReport['evidenceLevel']> =
    realUserResponseCount === 0
      ? 'level_0'
      : realUserResponseCount < 3
      ? 'level_1'
      : missingUserResponseCount > 0
      ? 'level_2'
      : 'level_3';
  const confidenceNotice =
    evidenceLevel === 'level_3'
      ? '关键回应覆盖较完整，当前结论可以作为较稳健的条件化参考。'
      : evidenceLevel === 'level_2'
      ? `已完成部分关键回应，但仍缺 ${missingUserResponseCount} 个关键回应；当前结论是阶段性参考。`
      : evidenceLevel === 'level_1'
      ? `真实用户回应较少，仍缺 ${missingUserResponseCount} 个关键回应；当前结论可能不够准确，仅供参考。`
      : '尚未采集到真实用户关键回应；当前只能基于问题、MBTI 先验和小镇模拟证据给出低可信参考。';
  return {
    evidenceLevel,
    realUserResponseCount,
    requiredUserResponseCount,
    missingUserResponseCount,
    confidenceNotice,
  };
}

function buildAnswerOptions(evidence: {
  experiment: Doc<'mbtiExperiments'>;
  messages: Doc<'messages'>[];
  innerThoughts: Doc<'innerThoughts'>[];
  socialEvents: Doc<'socialEvents'>[];
  eventEvidence: Doc<'mbtiEventEvidence'>[];
  userResponses?: Doc<'mbtiUserResponses'>[];
  behaviorEvents: Doc<'mbtiBehaviorEvents'>[];
  memories: Doc<'memories'>[];
}, tendency: string): NonNullable<MbtiReport['answerOptions']> {
  const behaviors = evidence.experiment.profile.behaviors;
  const evidenceCount =
    evidence.messages.length +
    evidence.innerThoughts.length +
    evidence.memories.length +
    evidence.socialEvents.length +
    evidence.eventEvidence.length +
    (evidence.userResponses?.filter((response) => response.responseStatus === 'responded').length ?? 0) * 3 +
    evidence.behaviorEvents.length;
  const questionContext = [
    evidence.experiment.question,
    evidence.experiment.questionFocus?.observationGoal ?? '',
    evidence.experiment.questionFocus?.drivingTension ?? '',
    evidence.experiment.questionFocus?.resolutionCriteria ?? '',
  ].join(' ');
  if ((evidence.experiment.questionFocus?.outcomeHypotheses?.length ?? 0) >= 3) {
    return buildHypothesisAnswerOptions(evidence, tendency, evidenceCount);
  }
  const relationshipContext = /伴侣|女朋友|男朋友|对象|亲密|恋爱|关系修复|修复关系|吵架|和好/.test(questionContext);
  if (!relationshipContext) {
    return buildGeneralAnswerOptions(evidence, tendency, evidenceCount);
  }
  const evidenceText = reportEvidenceText(evidence);
  const repairBase =
    35 +
    Math.round((behaviors.repairDrive ?? 50) * 0.28) +
    Math.round((behaviors.factChecking ?? 50) * 0.12) +
    scoreEvidence(evidenceText, /说清楚|追问|核对|确认|解释|当面|一起|继续沟通|靠近|配合|修复/g, 7);
  const withdrawalBase =
    20 +
    Math.round((behaviors.withdrawal ?? 50) * 0.3) +
    Math.round((behaviors.rumination ?? 50) * 0.12) +
    scoreEvidence(evidenceText, /离开|不说|算了|不接|回避|退开|沉默|暂停|不要|没空/g, 8);
  const influencedBase =
    15 +
    Math.round((behaviors.meaningProjection ?? 50) * 0.16) +
    Math.round((behaviors.emotionalSensitivity ?? 50) * 0.12) +
    scoreEvidence(evidenceText, /旁人|评价|朋友说|别人说|误会|带偏|想太多|反复想|深层含义/g, 7);
  const supportBase =
    18 +
    Math.round((behaviors.repairDrive ?? 50) * 0.16) +
    Math.round((behaviors.factChecking ?? 50) * 0.12) +
    scoreEvidence(evidenceText, /求助|问.*建议|帮忙|联系|推荐|陪|一起|找.*聊|说明情况/g, 7);
  const raw = [
    {
      label: '还想把话说清楚',
      score: repairBase,
      answer: '你不太像是单纯想结束，更像是还想把事情讲明白，只是需要对方别再忽冷忽热。',
      why: `如果你还能追问、解释、继续同场沟通，这条路就更有力。目前观察到：${tendency}。`,
      signals: ['愿意继续同场沟通', '会追问具体事实', '能表达需求而不是只冷处理'],
    },
    {
      label: '先退开保护自己',
      score: withdrawalBase,
      answer: '压力一上来，你可能会先拉开一点距离。这不一定是不在乎，更像是先让自己别被情绪淹没。',
      why: '如果事件里反复出现沉默、离开、拖延回应或不愿继续谈，这个可能性会上升。',
      signals: ['压力后先沉默或走开', '不急着修复', '更想恢复自己的空间'],
    },
    {
      label: '容易被旁人的话影响',
      score: influencedBase,
      answer: '你可能会被朋友、旁人或对方语气影响判断，一下子把事情想得更重。',
      why: '如果旁人一句话会明显改变你的态度，说明结论还不能只看你和对方本身。',
      signals: ['听到旁人评价后立场变化', '更在意对方话里深层含义', '把一次事件推成长期风险'],
    },
    {
      label: '找人帮忙校准',
      score: supportBase,
      answer: '你也可能会找一个可信的人聊聊，让别人帮你确认是不是自己想太多，或者下一步该怎么说。',
      why: '如果反复出现求助、请人帮忙、找人确认说法，这条路会更明显。',
      signals: ['向别人说明情况', '请人给建议', '让第三方帮忙确认事实'],
    },
  ];
  return normalizeAnswerOptions(raw, evidenceCount);
}

function buildHypothesisAnswerOptions(
  evidence: {
    experiment: Doc<'mbtiExperiments'>;
    messages: Doc<'messages'>[];
    innerThoughts: Doc<'innerThoughts'>[];
    socialEvents: Doc<'socialEvents'>[];
    eventEvidence: Doc<'mbtiEventEvidence'>[];
    behaviorEvents: Doc<'mbtiBehaviorEvents'>[];
    memories: Doc<'memories'>[];
  },
  tendency: string,
  evidenceCount: number,
): NonNullable<MbtiReport['answerOptions']> {
  const evidenceText = reportEvidenceText(evidence);
  const hypotheses = evidence.experiment.questionFocus?.outcomeHypotheses ?? [];
  const raw = hypotheses.map((hypothesis) => {
    const supportScore = scoreSignalList(evidenceText, [
      hypothesis.label,
      hypothesis.plainConclusion,
      ...hypothesis.supportSignals,
    ], 8);
    const weakScore = scoreSignalList(evidenceText, hypothesis.weakSignals, 5);
    const patternScore = scoreHypothesisPattern(evidenceText, hypothesis.label, hypothesis.plainConclusion);
    return {
      label: hypothesis.label,
      score: 28 + supportScore + patternScore - weakScore,
      answer: hypothesis.plainConclusion,
      why: `这条路径主要看：${hypothesis.supportSignals.slice(0, 3).join('、')}。目前观察到：${tendency}。`,
      signals: hypothesis.supportSignals,
    };
  });
  return normalizeAnswerOptions(raw, evidenceCount);
}

function buildGeneralAnswerOptions(
  evidence: {
    experiment: Doc<'mbtiExperiments'>;
    messages: Doc<'messages'>[];
    innerThoughts: Doc<'innerThoughts'>[];
    socialEvents: Doc<'socialEvents'>[];
    eventEvidence: Doc<'mbtiEventEvidence'>[];
    behaviorEvents: Doc<'mbtiBehaviorEvents'>[];
    memories: Doc<'memories'>[];
  },
  tendency: string,
  evidenceCount: number,
): NonNullable<MbtiReport['answerOptions']> {
  const behaviors = evidence.experiment.profile.behaviors;
  const evidenceText = reportEvidenceText(evidence);
  const regainControlBase =
    28 +
    Math.round((behaviors.factChecking ?? 50) * 0.22) +
    Math.round((behaviors.closureNeed ?? 50) * 0.16) +
    scoreEvidence(evidenceText, /核对|确认|查看|收起手机|规则|清单|边界|替代|改约|重新安排|处理|前往|执行|径直/g, 8);
  const reduceExposureBase =
    22 +
    Math.round((behaviors.withdrawal ?? 50) * 0.24) +
    Math.round((behaviors.rumination ?? 50) * 0.1) +
    scoreEvidence(evidenceText, /不看|少看|离开|远离|暂停|休息|睡眠|吃饭|散步|坐下|等待|恢复生活/g, 7);
  const emotionalSpilloverBase =
    18 +
    Math.round((behaviors.emotionalSensitivity ?? 50) * 0.24) +
    Math.round((behaviors.meaningProjection ?? 50) * 0.12) +
    scoreEvidence(evidenceText, /反复|担心|焦虑|受不了|烦|盯盘|刷|新闻|波动|风险|被.*牵动|想后果/g, 8);
  const seekSupportBase =
    18 +
    Math.round((behaviors.factChecking ?? 50) * 0.14) +
    Math.round((behaviors.repairDrive ?? 50) * 0.1) +
    scoreEvidence(evidenceText, /询问|求助|联系|咨询|建议|推荐|问.*有没有|找.*帮|说明情况/g, 7);
  const raw = [
    {
      label: '先给自己定规矩',
      score: regainControlBase,
      answer: '你后续更可能不是一直硬扛情绪，而是给自己定几条规矩：少看盘、固定信息源、先核对再决定。',
      why: `如果你会核对事实、整理边界、把担心变成清单，这条路就更有力。目前观察到：${tendency}。`,
      signals: ['开始核对事实而不是只刷行情', '主动减少无效信息', '把担心转成具体规则或清单'],
    },
    {
      label: '先离开刺激源',
      score: reduceExposureBase,
      answer: '你可能会先少看盘、少刷讨论区，把注意力拉回睡觉、吃饭、散步或手头工作。',
      why: '如果事件里反复出现沉默、离开、延后回应或不想继续谈市场，这个可能性会上升。',
      signals: ['不想继续看行情', '先离开嘈杂场景', '需要恢复生活节奏再处理问题'],
    },
    {
      label: '还是会被消息拽走',
      score: emotionalSpilloverBase,
      answer: '如果市场消息一直很密，你还是可能被拽回去，反复想后果，生活节奏也会跟着受影响。',
      why: '情绪敏感、反复推演和缺少稳定行动证据越多，这个可能性越高。',
      signals: ['容易把短期波动推成长期风险', '对旁人评价或新闻反应很大', '明知道影响生活但仍频繁关注'],
    },
    {
      label: '找人或工具帮你校准',
      score: seekSupportBase,
      answer: '你也可能会去问可信的人、查更稳定的信息源，或者用工具帮自己把事情算清楚。',
      why: '如果事件里出现询问、求助、找替代信息源，这条路会更明显。',
      signals: ['主动询问别人', '寻找更可靠信息源', '请人帮忙确认方案'],
    },
  ];
  return normalizeAnswerOptions(raw, evidenceCount);
}

function reportEvidenceText(evidence: {
  messages: Doc<'messages'>[];
  innerThoughts: Doc<'innerThoughts'>[];
  socialEvents: Doc<'socialEvents'>[];
  eventEvidence: Doc<'mbtiEventEvidence'>[];
  behaviorEvents: Doc<'mbtiBehaviorEvents'>[];
  memories: Doc<'memories'>[];
}) {
  return [
    evidence.eventEvidence.map((item) => `${item.kind} ${item.summary}`).join(' '),
    evidence.behaviorEvents.map((event) => `${event.label} ${event.description}`).join(' '),
    evidence.messages.map((message) => message.text).join(' '),
    evidence.innerThoughts.map((thought) => thought.text).join(' '),
    evidence.socialEvents.map((event) => `${event.title} ${event.description}`).join(' '),
    evidence.memories.map((memory) => memory.description).join(' '),
  ].join(' ');
}

function scoreEvidence(text: string, pattern: RegExp, weight: number) {
  return Math.min(42, (text.match(pattern)?.length ?? 0) * weight);
}

function scoreSignalList(text: string, signals: string[], weight: number) {
  const keywords = signalKeywords(signals);
  if (keywords.length === 0) {
    return 0;
  }
  const pattern = new RegExp(keywords.map(escapeRegExp).join('|'), 'g');
  return scoreEvidence(text, pattern, weight);
}

function scoreHypothesisPattern(evidenceText: string, label: string, conclusion: string) {
  const text = `${label} ${conclusion}`;
  let score = 0;
  if (/秩序|规则|计划|日程|理性|重建|控制|稳定|安排/.test(text)) {
    score += scoreEvidence(evidenceText, /核对|确认|安排|重排|计划|登记|处理|决定|时间表|规则|步骤|清单|执行|先.*再/g, 6);
  }
  if (/焦虑|风险|担心|损失|波动|灾难|健康|财务|害怕/.test(text)) {
    score += scoreEvidence(evidenceText, /担心|焦虑|风险|损失|波动|慌|无措|害怕|受伤|健康|财务|反复|后果|万一/g, 7);
  }
  if (/关系|依赖|家庭|伴侣|亲密|连接|照顾|共生|留在/.test(text)) {
    score += scoreEvidence(evidenceText, /家人|亲人|伴侣|对象|陪|一起|照顾|联系|沟通|留下|回来|道歉|解释|安抚/g, 6);
  }
  if (/疏离|孤独|退开|回避|封闭|离开|减少社交/.test(text)) {
    score += scoreEvidence(evidenceText, /离开|沉默|不说|算了|暂停|躲|回避|独自|自己|不想|拒绝|退开/g, 7);
  }
  if (/支持|求助|校准|询问|工具|信息源|确认/.test(text)) {
    score += scoreEvidence(evidenceText, /询问|求助|联系|咨询|建议|推荐|帮忙|确认|核对|信息源|工具|问.*有没有/g, 6);
  }
  if (/行动|恢复|替代|解决|推进|处理/.test(text)) {
    score += scoreEvidence(evidenceText, /前往|处理|改约|替代|购买|提交|预约|修理|重新安排|继续|拿出|查看/g, 6);
  }
  return Math.min(56, score);
}

function signalKeywords(signals: string[]) {
  const stopwords = new Set(['一个', '一种', '可能', '用户', '自己', '事情', '后续', '更可能', '如果', '或者', '不是']);
  const keywords = new Set<string>();
  for (const signal of signals) {
    const terms = signal.match(/[\u4e00-\u9fa5A-Za-z0-9]+/g) ?? [];
    for (const term of terms) {
      if (/^[A-Za-z0-9]+$/.test(term)) {
        if (term.length >= 3) {
          keywords.add(term.toLowerCase());
        }
        continue;
      }
      if (term.length >= 2 && term.length <= 6 && !stopwords.has(term)) {
        keywords.add(term);
        continue;
      }
      for (let index = 0; index <= term.length - 2; index += 2) {
        const keyword = term.slice(index, index + 2);
        if (!stopwords.has(keyword)) {
          keywords.add(keyword);
        }
      }
    }
  }
  return [...keywords].slice(0, 36);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeAnswerOptions(raw: Array<{
  label: string;
  score: number;
  answer: string;
  why: string;
  signals: string[];
}>, evidenceCount: number): NonNullable<MbtiReport['answerOptions']> {
  const ranked = [...raw].sort((a, b) => b.score - a.score);
  const spread = ranked[0].score - ranked[ranked.length - 1].score;
  const total = ranked.reduce((sum, item) => sum + item.score, 0) || 1;
  const closeMessage = spread < 12 && evidenceCount >= 8
    ? ' 多个方向分数接近，说明目前更像是几种反应并存，不能把百分比当成稳定预测。'
    : '';
  const lowEvidenceMessage = evidenceCount < 8
    ? ' 当前证据量偏少，概率只表示暂时排序，不表示稳定预测。'
    : '';
  let remaining = 100;
  return ranked.map((item, index) => {
    const probability =
      index === ranked.length - 1
        ? remaining
        : Math.max(8, Math.min(78, Math.round((item.score / total) * 100)));
    remaining -= probability;
    return {
      label: item.label,
      probability,
      answer: item.answer,
      why: `${item.why}${closeMessage}${lowEvidenceMessage}`,
      signals: item.signals,
    };
  });
}

function buildReportPrompt(
  evidence: {
    experiment: Doc<'mbtiExperiments'>;
    messages: Doc<'messages'>[];
    archivedConversations: Doc<'archivedConversations'>[];
    events: Doc<'mbtiEvents'>[];
    eventEvidence: Doc<'mbtiEventEvidence'>[];
    userResponses: Doc<'mbtiUserResponses'>[];
    innerThoughts: Doc<'innerThoughts'>[];
    behaviorEvents: Doc<'mbtiBehaviorEvents'>[];
    memories: Doc<'memories'>[];
  },
  fallback: MbtiReport,
) {
  const messageLines = evidence.messages
    .slice(-12)
    .map((message) => `- ${message.author}: ${message.text}`)
    .join('\n');
  const thoughtLines = evidence.innerThoughts
    .slice(-8)
    .map((thought) => `- ${thought.text}`)
    .join('\n');
  const behaviorLines = evidence.behaviorEvents
    .slice(-12)
    .map((event) => `- ${event.label}：${event.description}`)
    .join('\n');
  const userResponseLines = buildUserResponseReportLines(evidence.events, evidence.userResponses);
  const eventLines = buildEventEvidenceReportLines(evidence.events, evidence.eventEvidence);
  const memoryLines = evidence.memories
    .slice(-8)
    .map((memory) => `- ${memory.description}`)
    .join('\n');
  const focus = evidence.experiment.questionFocus;
  const focusLines = focus
    ? [
        `观察目标：${focus.observationGoal}`,
        `核心压力：${focus.drivingTension}`,
        `证据目标：${focus.evidenceTargets.join('、')}`,
        `结论门槛：${focus.resolutionCriteria}`,
      ].join('\n')
    : '暂无';
  return [
    `请基于小镇演化证据，输出一段中文实验结论。`,
    `要求：简洁、可验证、不要玄学，不要说成现实必然。`,
    `设定：每结束一段对话代表过去一天。`,
    `用户人格：${evidence.experiment.profile.code}`,
    `问题：${evidence.experiment.question}`,
    `本轮问题驱动蓝图：\n${focusLines}`,
    `基础判断：${fallback.conclusion}`,
    `报告可信等级：${fallback.evidenceLevel ?? 'level_0'}；真实用户关键回应 ${fallback.realUserResponseCount ?? 0}/${fallback.requiredUserResponseCount ?? 0}。`,
    `可信度提示：${fallback.confidenceNotice ?? fallback.limits}`,
    `真实用户关键回应，优先于 AI 生成的“我”的台词：\n${userResponseLines || '暂无真实用户关键回应'}`,
    `按事件归属的实际证据：\n${eventLines || '暂无事件证据'}`,
    `兜底最近聊天，仅在事件证据不足时参考，不能替代事件证据：\n${messageLines || '暂无'}`,
    `用户行为证据：\n${behaviorLines || '暂无'}`,
    `内心独白：\n${thoughtLines || '暂无'}`,
    `记忆：\n${memoryLines || '暂无'}`,
    `请用 4-6 句话回答：行为倾向是否符合用户人格、哪些真实用户回应支持、哪些事件缺证据、结论边界是什么。必须明确说明用户回应不足时结论仅供参考。`,
  ].join('\n\n');
}

function buildUserResponseReportLines(
  events: Doc<'mbtiEvents'>[],
  userResponses: Doc<'mbtiUserResponses'>[],
) {
  const eventById = new Map(events.map((event) => [String(event._id), event]));
  return userResponses
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-12)
    .map((response) => {
      const event = eventById.get(String(response.mbtiEventId));
      const correction = response.correctionText ? `；修正：${response.correctionText}` : '';
      const statusText = response.responseStatus === 'responded'
        ? '真实回应'
        : response.responseStatus === 'skipped'
        ? '用户跳过'
        : '阶段报告过期';
      return [
        `- ${event?.title ?? '未知事件'}（${statusText}）：选择「${response.selectedOption}」，确定度 ${response.confidence}/7，情绪 ${response.emotions.join('、') || '未填'}`,
        `  说明：${response.freeText || '未填写'}；情境贴合度：${scenarioFitLabel(response.scenarioFit)}${correction}`,
      ].join('\n');
    })
    .join('\n');
}

function scenarioFitLabel(fit: Doc<'mbtiUserResponses'>['scenarioFit']) {
  if (fit === 'fits') {
    return '贴合';
  }
  if (fit === 'partial') {
    return '部分贴合';
  }
  return '不贴合';
}

function buildEventEvidenceReportLines(
  events: Doc<'mbtiEvents'>[],
  eventEvidence: Doc<'mbtiEventEvidence'>[],
) {
  const evidenceByEvent = new Map<string, Doc<'mbtiEventEvidence'>[]>();
  for (const item of eventEvidence) {
    const key = String(item.mbtiEventId);
    evidenceByEvent.set(key, [...(evidenceByEvent.get(key) ?? []), item]);
  }
  return events
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-12)
    .map((event) => {
      const related = (evidenceByEvent.get(String(event._id)) ?? [])
        .slice()
        .sort((a, b) => a.occurredAt - b.occurredAt);
      const details = related
        .slice(-6)
        .map((item) => `${evidenceKindLabel(item.kind)}：${item.summary}`)
        .join('；');
      const participants = event.involvedRoles.map(displayParticipantName).join('、') || '未指定';
      return [
        `- ${event.title}（${eventStatusLabelForReport(event.status)}，参与：${participants}）`,
        `探针：${event.testedVariable ?? '未标注'}；来源：${probeOriginLabelForReport(event.probeOrigin)}；居民角色：${event.residentRoles?.join('、') || '未标注'}`,
        event.adaptiveReason ? `动态原因：${event.adaptiveReason}` : '',
        event.residentParticipationGoal ? `居民参与目标：${event.residentParticipationGoal}` : '',
        `计划：${compactForPrompt(event.description, 160)}`,
        `证据：${details || '暂无绑定证据'}`,
      ].filter(Boolean).join('\n  ');
    })
    .join('\n');
}

function probeOriginLabelForReport(origin: Doc<'mbtiEvents'>['probeOrigin']) {
  if (origin === 'adaptive') {
    return '动态探针';
  }
  if (origin === 'calibration') {
    return '校准探针';
  }
  return '初始探针';
}

function evidenceKindLabel(kind: Doc<'mbtiEventEvidence'>['kind']) {
  if (kind === 'message') {
    return '聊天';
  }
  if (kind === 'behavior') {
    return '行为';
  }
  if (kind === 'thought') {
    return '内心';
  }
  return '事件记录';
}

function eventStatusLabelForReport(status: Doc<'mbtiEvents'>['status']) {
  const labels: Record<Doc<'mbtiEvents'>['status'], string> = {
    seeded: '未触发',
    moving: '正在进入现场',
    conversation_pending: '等待相关对话',
    triggered: '已触发',
    pending_user_response: '待用户回应',
    observed: '已有证据',
    responded: '已记录真实回应',
    skipped: '用户已跳过',
    expired_to_stage_report: '未回应，进入阶段报告',
    resolved: '已完成',
    failed: '触发失败',
  };
  return labels[status];
}

async function createCompletionSocialEvent(ctx: MutationCtx, worldId: Doc<'worlds'>['_id']) {
  const world = await ctx.db.get(worldId);
  const participantIds = world?.players.map((player) => player.id) ?? [];
  const conversations = await ctx.db
    .query('archivedConversations')
    .withIndex('worldId', (q) => q.eq('worldId', worldId))
    .collect();
  await ctx.db.insert('socialEvents', {
    worldId,
    createdAt: Date.now(),
    title: `第 ${Math.max(1, conversations.length)} 天观察结束`,
    description: '一段对话结束视为一天过去，系统停止本轮演化并整理人格行为证据。',
    roomName: '常驻 MBTI 小镇',
    participantIds,
    intensity: Math.min(100, 30 + conversations.length * 8),
  });
}

function buildSelfIdentity(
  question: string,
  profile: {
    code: string;
    weights: Record<string, number>;
    behaviors: Record<string, number>;
  },
  roles: RoleSeed[],
  focus?: QuestionFocusInput,
) {
  const roleLines = roles
    .filter((role) => role.enabled)
    .map((role) => `“${role.label}”是你的${relationshipName(role)}。`);
  return [
    `你叫“我”，今天来到常驻小镇。`,
    roleLines.length > 0 ? `你的人际关系：${roleLines.join(' ')}` : '',
    focus
      ? `你最近有一点和这段关系/处境有关的心事：${focus.drivingTension}`
      : `你最近心里有一件没完全放下的事：${question}`,
    `你的性格倾向接近 ${profile.code}，压力下更容易出现这些反应：${buildSelfSpeechRules(profile.behaviors)}`,
    `你只按普通人的方式生活和聊天，不要分析人格，也不要提实验。不要把自己的心事讲成咨询题目，只在当下事件里自然反应。`,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildSelfPlan(focus?: QuestionFocusInput) {
  if (!focus) {
    return `今天在小镇里自然生活，遇到熟人或陌生居民时按自己的感受回应。`;
  }
  return [
    `今天带着一点心事来到小镇，但不需要宣布或分析它。`,
    `先按当下事件生活和聊天，遇到压力时按真实反应处理。`,
    `如果出现这些变化，给出自然反应：${focus.eventBeats.join('、')}。`,
  ].join('\n');
}

function buildSelfSpeechRules(behaviors: Record<string, number>) {
  const rules = [];
  if ((behaviors.withdrawal ?? 0) >= 55) {
    rules.push('压力上来时先短暂退开或说“我想缓一下”');
  } else if ((behaviors.socialInitiation ?? 0) >= 55) {
    rules.push('压力上来时更愿意主动把话说开');
  }
  if ((behaviors.repairDrive ?? 0) >= 55) {
    rules.push('关系紧张时会尝试确认对方状态或表达修复意愿');
  } else {
    rules.push('关系紧张时不急着修复，更容易先保护自己');
  }
  if ((behaviors.meaningProjection ?? 0) >= 55) {
    rules.push('会在意对方话里有没有更深含义');
  }
  if ((behaviors.factChecking ?? 0) >= 55) {
    rules.push('做判断前会追问具体事实');
  }
  if ((behaviors.emotionalSensitivity ?? 0) >= 55) {
    rules.push('容易被语气、冷淡和回应速度影响');
  }
  return `${rules.join('；')}。说话仍要像普通人，短句、白话，不要分析人格。`;
}

function roleMapping(role: { label: string; mapping?: string; traits?: string }) {
  const traitMapping = role.traits?.match(/对应问题里的谁：([^\n]+)/)?.[1]?.trim();
  return role.mapping?.trim() || traitMapping || defaultRoleMapping(role);
}

function relationshipName(role: { role?: string; label: string; mapping?: string }) {
  const mapping = role.mapping?.trim() || defaultRoleMapping(role);
  if (/伴侣|女朋友|男朋友|对象/.test(mapping)) return '伴侣';
  if (/暧昧|喜欢的人/.test(mapping)) return '暧昧对象';
  if (/朋友|闺蜜|兄弟|同学|室友/.test(mapping)) return '朋友';
  if (/同事|上司|领导|老板|客户/.test(mapping)) return '工作关系对象';
  if (/家人|父母|妈妈|爸爸|亲戚|孩子/.test(mapping)) return '家人';
  if (/前任/.test(mapping)) return '前任';
  return role.label;
}

function defaultRoleMapping(role: { role?: string; label: string }) {
  switch (role.role) {
    case 'partner':
      return '伴侣/女朋友/男朋友/对象/她/他/对方';
    case 'ambiguous':
      return '暧昧对象/喜欢的人/她/他/对方';
    case 'friend':
      return '朋友/闺蜜/兄弟/同学/室友';
    case 'coworker':
      return '同事/上司/客户/工作对象';
    case 'family':
      return '家人/父母/亲戚/孩子';
    case 'ex':
      return '前任/旧关系';
    default:
      return role.label;
  }
}

function buildRoleIdentity(role: {
  role?: string;
  label: string;
  mapping?: string;
  mbtiCode: string;
  traits: string;
}) {
  const mapping = roleMapping(role);
  const mbtiLine = role.mbtiCode.trim()
    ? `性格倾向大致接近 ${role.mbtiCode.trim().toUpperCase()}。`
    : '';
  const cleanedTraits = role.traits
    .split('\n')
    .filter((line) => !line.trim().startsWith('对应问题里的谁：'))
    .join('\n')
    .trim();
  const relationshipBackgroundLine = cleanedTraits ? `关系背景：${cleanedTraits}。` : '';
  const relationship = relationshipName(role);
  return [
    `你叫“${role.label}”，是“我”的${relationship}。`,
    `关系线索：${mapping}。`,
    relationshipBackgroundLine,
    mbtiLine,
    `聊天风格：日常、简短、口语化。可以有情绪，不要像旁白或总结报告。`,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildSocialFieldRoles(enabledRoles: RoleSeed[]) {
  return [...enabledRoles];
}

function buildTownResidentIdentity(resident: TownResidentInput, backgroundOnly = false) {
  return [
    `你叫“${resident.name}”，是常驻小镇里的${resident.role}。`,
    `日常活动地点：${resident.defaultLocationKey}。`,
    `性格倾向接近 ${resident.mbtiCode}。`,
    resident.traits.length > 0 ? `性格特征：${resident.traits.join('、')}。` : '',
    resident.background,
    resident.context ? `小镇历史和关系背景：${resident.context}` : '',
    backgroundOnly
      ? `你本来就在小镇生活，本次只是背景居民；可以在地图里活动，但不主动参与当前交流。`
      : `你本来就在小镇生活，和来访者只是自然相遇。聊天要像普通居民，不要解释设定，不要提实验。`,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildSeededEvents(
  question: string,
  roles: RoleSeed[],
  residents: TownResidentInput[],
  sceneLocationKey: string | undefined,
  seed: number,
  targetEventCount: number,
  focus?: QuestionFocusInput,
) {
  const participantScope = buildEventParticipantScope(roles, residents);
  const concretePlans = focus?.eventPlans?.filter((plan) => plan.title && plan.trigger);
  if (concretePlans && concretePlans.length > 0) {
    return concretePlans.slice(0, targetEventCount).map((plan, index) => {
      const participantPlan = normalizeEventParticipantPlan(plan.participants, participantScope, index);
      const involvedRoles = participantPlan.involvedRoles;
      const sanitizedTitle = sanitizeEventPlanText(plan.title, participantPlan, index);
      const sanitizedScene = sanitizeEventSceneText(
        sanitizeEventPlanText(plan.scene, participantPlan, index),
        sceneLocationKey,
      );
      const sanitizedTrigger = concretizeEventTrigger(
        sanitizeEventPlanText(plan.trigger, participantPlan, index),
        plan.title,
        plan.observationAxis ?? focus?.analysisDimensions?.[index % Math.max(1, focus.analysisDimensions.length)] ?? '',
        index,
        participantPlan,
      );
      const testedVariable =
        plan.observationAxis ?? focus?.analysisDimensions?.[index % Math.max(1, focus.analysisDimensions.length)] ?? '压力下的真实反应';
      const expectedSignals = [
        plan.judgmentSignal,
        ...(focus?.outcomeHypotheses ?? [])
          .flatMap((hypothesis) => hypothesis.supportSignals.slice(0, 1))
          .slice(0, 3),
      ].filter(Boolean);
      if (!plan.responseOptions || plan.responseOptions.length < 3) {
        throw new Error(`动态情境探针“${plan.title}”缺少合格的用户选项。`);
      }
      const residentParticipation = residentParticipationForProbe(testedVariable, plan.informationGoal, index);
      return {
        tickOffset: 2 + index * 2,
        kind: eventKindForIndex(index),
        title: stripInternalEventPrefix(sanitizedTitle),
        description: [
          `场景：${sanitizedScene}`,
          `事件强度：${normalizeEventSeverityLabel(plan.severity, index)}`,
          `具体事情：${sanitizedTrigger}`,
          `参与者：${involvedRoles.map(displayParticipantName).join('、')}`,
          `观察维度：${testedVariable}`,
          `问题关联：${plan.questionLink ?? '把用户问题里的抽象担忧转成一次可观察的生活选择'}`,
          `想获得的信息：${plan.informationGoal}`,
          `可评判信号：${plan.judgmentSignal}`,
          `用户选项：${plan.responseOptions.join(' / ')}`,
        ].join(' '),
        involvedRoles,
        testedVariable,
        testedHypotheses: (focus?.outcomeHypotheses ?? []).map((hypothesis) => hypothesis.label).slice(0, 4),
        questionLink: plan.questionLink ?? '把用户问题里的抽象担忧转成一次可观察的生活选择',
        informationGoal: plan.informationGoal,
        expectedSignals,
        responseOptions: plan.responseOptions,
        biasDirection: 'balanced' as const,
        probeOrigin: 'initial' as const,
        residentRoles: residentParticipation.roles,
        residentParticipationGoal: residentParticipation.goal,
      };
    });
  }
  throw new Error('缺少合格的动态情境探针事件计划；本轮不会使用默认事件。');
}

function optionalAdaptiveReason(event: object): { adaptiveReason?: string } {
  if ('adaptiveReason' in event && typeof event.adaptiveReason === 'string') {
    return { adaptiveReason: event.adaptiveReason };
  }
  return {};
}

function residentParticipationForProbe(testedVariable: string, informationGoal: string, index: number) {
  const text = `${testedVariable} ${informationGoal}`;
  if (/钱|收入|成本|风险|稳定|现金|合同|时间|资源|工作|辞职|创业/.test(text)) {
    return {
      roles: ['现实约束者', '替代方案提供者'],
      goal: '让居民把钱、时间、资源或合同约束具体化，测试用户是否仍坚持原选择，或是否需要过渡方案。',
    };
  }
  if (/家人|伴侣|对象|关系|亲密|沟通|修复|边界|误解|评价/.test(text)) {
    return {
      roles: ['关系压力者', '支持者'],
      goal: '让居民提供支持或反对的关系压力，测试用户会靠近沟通、表达边界还是退开。',
    };
  }
  if (/长期|未来|后果|身份|意义|成长|主导|自主/.test(text)) {
    return {
      roles: ['未来后果见证者', '理想主义者'],
      goal: '让居民呈现选择的长期意义和延迟代价，测试用户是否仍认同这个方向。',
    };
  }
  const fallbackRoles = index % 2 === 0
    ? ['反对者', '替代方案提供者']
    : ['支持者', '现实约束者'];
  return {
    roles: fallbackRoles,
    goal: '让居民提供不同立场和现实约束，测试用户对当前探针的真实反应。',
  };
}

function eventKindForIndex(index: number) {
  const kinds = ['pressure', 'evaluation', 'misunderstanding', 'opportunity'] as const;
  return kinds[index % kinds.length];
}

function normalizeEventSeverityLabel(severity: string | undefined, index: number) {
  if (severity && /重大|高|大|人生|危机|严重/.test(severity)) {
    return '重大';
  }
  if (severity && /中等|中|较大|明显/.test(severity)) {
    return '中等';
  }
  if (severity && /日常|轻|小/.test(severity)) {
    return '日常';
  }
  return index % 6 === 4 ? '重大' : index % 3 === 1 ? '中等' : '日常';
}

function stripInternalEventPrefix(title: string) {
  return title.replace(/^(日常|中等|重大|轻微|严重)\s*[：:]\s*/, '').trim() || title;
}

type EventParticipantScope = {
  allowedNames: Set<string>;
  fallbackNames: string[];
};

type EventParticipantPlan = {
  involvedRoles: string[];
  replacements: Map<string, string>;
};

function buildEventParticipantScope(roles: RoleSeed[], residents: TownResidentInput[]): EventParticipantScope {
  const roleNames = roles
    .filter((role) => role.enabled)
    .map((role) => role.label.trim())
    .filter(Boolean);
  const residentNames = residents
    .map((resident) => resident.name.trim())
    .filter(Boolean);
  const fallbackNames = Array.from(new Set([...roleNames, ...residentNames]));
  return {
    allowedNames: new Set(['self', '我', ...fallbackNames]),
    fallbackNames,
  };
}

function normalizeEventParticipantPlan(
  participants: string[],
  scope: EventParticipantScope,
  index: number,
): EventParticipantPlan {
  const ordered = ['self'];
  const replacements = new Map<string, string>();
  for (const participant of participants) {
    const raw = participant.trim();
    const normalized = normalizeParticipantName(raw);
    if (normalized === 'self' || normalized === '我') {
      continue;
    }
    if (scope.allowedNames.has(normalized)) {
      ordered.push(normalized);
    } else {
      const replacement = scopedFallbackName(scope, index + replacements.size);
      if (replacement) {
        replacements.set(raw, replacement);
        ordered.push(replacement);
      }
    }
  }
  if (ordered.length === 1 && scope.fallbackNames.length > 0) {
    ordered.push(scope.fallbackNames[index % scope.fallbackNames.length]);
  }
  for (let offset = 0; ordered.length < Math.min(3, 1 + scope.fallbackNames.length) && offset < scope.fallbackNames.length; offset += 1) {
    const fallback = scope.fallbackNames[(index + offset) % scope.fallbackNames.length];
    if (fallback && !ordered.includes(fallback)) {
      ordered.push(fallback);
    }
  }
  return {
    involvedRoles: Array.from(new Set(ordered)).slice(0, 3),
    replacements,
  };
}

function scopedFallbackName(scope: EventParticipantScope, index: number) {
  return scope.fallbackNames.length > 0
    ? scope.fallbackNames[index % scope.fallbackNames.length]
    : undefined;
}

function sanitizeEventPlanText(text: string, plan: EventParticipantPlan, index: number) {
  let sanitized = text;
  for (const [from, to] of plan.replacements.entries()) {
    if (from && to) {
      sanitized = sanitized.split(from).join(to);
    }
  }
  const nonSelfNames = plan.involvedRoles
    .filter((name) => name !== 'self' && name !== '我')
    .map(displayParticipantName);
  const first = nonSelfNames[index % Math.max(1, nonSelfNames.length)] ?? '我';
  const second = nonSelfNames[(index + 1) % Math.max(1, nonSelfNames.length)] ?? first;
  sanitized = sanitized
    .replace(/一位[^，。；、]{0,8}(顾客|上班族|邻居|居民|路人|摊主|店主|服务员|管理员|图书管理员)/g, second)
    .replace(/几位[^，。；、]{0,8}(顾客|上班族|邻居|居民|路人|摊主|服务员)/g, second)
    .replace(/(某位|一个|一名)[^，。；、]{0,8}(顾客|上班族|邻居|居民|路人|摊主|店主|服务员|管理员|图书管理员)/g, second)
    .replace(/(旁边居民|附近居民|当地居民|图书管理员|服务员|店主|摊主|路人|邻居|顾客|上班族)/g, first);
  return sanitized;
}

function sanitizeEventSceneText(text: string, sceneLocationKey?: string) {
  const locationLabel = locationLabelForKey(sceneLocationKey);
  let sanitized = text
    .replace(/周末?露天?市集|露天?市集|市集摊位|集市摊位|热门摊位|摊位/g, locationLabel)
    .replace(/小镇图书馆|图书馆/g, locationLabel)
    .replace(/街角咖啡馆|市中心咖啡馆|一家热门小馆|热门小馆/g, locationLabel)
    .replace(/早高峰地铁站台|地铁站台/g, locationLabel);
  const knownLocationPattern = /(晨桥咖啡馆|钟楼广场|白榆诊所|旧校舍|河边步道|公寓走廊|修理工坊|社区办公室|咖啡馆|广场|诊所|旧校舍|工坊|办公室|车站|商店)/;
  if (!knownLocationPattern.test(sanitized)) {
    sanitized = `${locationLabel}，${sanitized}`;
  }
  return sanitized;
}

function concretizeEventTrigger(
  trigger: string,
  title: string,
  observationAxis: string,
  index: number,
  participantPlan: EventParticipantPlan,
  round = 1,
) {
  const trimmed = trigger.trim();
  const vague =
    round > 1 ||
    trimmed.length < 24 ||
    /暂时缺货|无法立即完成交易|还在处理|不确定何时能好|工具故障|无法使用|需要寻找替代方案|等待维修|事务的进展|某项事务|特定材料/.test(trimmed);
  if (!vague) {
    return trimmed;
  }
  const context = `${title} ${observationAxis} ${trimmed}`;
  const templates = [
    {
      match: /缺货|材料|交易/,
      text: '我拿着写有“蓝色陶瓷杯两只”的取货单准备付款，关键对象核对柜台记录后说蓝色款被物流延误，只剩白色款，最快下午三点才能补到。',
    },
    {
      match: /进度|处理|时间|不确定/,
      text: '我把编号 17 的登记单递给关键对象询问结果，关键对象翻了待办夹后说资料还压在常驻居民A那里，今天只能确认收到，不能给完成时间。',
    },
    {
      match: /工具|故障|维修|替代/,
      text: '我准备用微调扳手修好松动的背包扣，常驻居民A试了两次发现扳手卡死，只能借关键对象的备用工具或改到明天修。',
    },
    {
      match: /成功|进展|敏感|情绪/,
      text: '我刚向常驻居民A说这件事总算有进展，关键对象拿着新通知过来说原定安排又被改到明天，刚确认的计划需要重排。',
    },
    {
      match: /./,
      text: '我按约定时间拿着预约码到柜台确认，关键对象扫码后发现系统显示“已过号”，只能重新排到第 23 位。',
    },
    {
      match: /./,
      text: '我把写好的申请表交给常驻居民A，常驻居民A指着第二页空白栏说缺少关键对象签名，今天不能提交。',
    },
    {
      match: /./,
      text: '我准备按原计划借用会议角落，关键对象打开登记本后发现这个时段被临时改成社区说明会。',
    },
    {
      match: /./,
      text: '我拿着刚收到的号码牌去确认顺序，常驻居民A说广播里的号码和屏幕上的号码不一致，需要我重新核对。',
    },
    {
      match: /./,
      text: '我把备用方案写在便签上递给关键对象，关键对象看完后指出这个方案会让常驻居民A负责额外收尾。',
    },
    {
      match: /./,
      text: '我正准备把物品放进寄存柜，关键对象发现柜门编号和钥匙牌不一致，要求先找出是谁拿错钥匙。',
    },
    {
      match: /./,
      text: '我按通知来到现场确认进度，常驻居民A拿出两张时间表，一张写今天完成，另一张写推迟到后天。',
    },
    {
      match: /./,
      text: '我准备付款结束这一步，关键对象提醒优惠码刚失效，继续付款会多出一笔费用，需要我当场决定是否继续。',
    },
  ];
  const selected = round > 1
    ? templates[(index + round) % templates.length]
    : templates.find((item) => item.match.test(context)) ?? templates[index % templates.length];
  return sanitizeEventPlanText(selected.text, participantPlan, index);
}

function normalizeParticipantName(participant: string) {
  if (['self', '我', '用户', '你', '自己', '本人'].includes(participant)) {
    return 'self';
  }
  return participant;
}

function displayParticipantName(participant: string) {
  return normalizeParticipantName(participant) === 'self' ? '我' : participant;
}

function deterministicSeed(question: string, code: string) {
  let hash = 2166136261;
  for (const char of `${question}:${code}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function characterForIndex(index: number) {
  const characters = ['f1', 'f2', 'f3', 'f4', 'f6', 'f7', 'f8'];
  return characters[index % characters.length];
}
