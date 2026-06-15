import { v } from 'convex/values';
import { internalAction, internalMutation, internalQuery, mutation, MutationCtx } from './_generated/server';
import { Doc, Id } from './_generated/dataModel';
import { api, internal } from './_generated/api';
import {
  reflectionKeyForResidents,
  selectTownReflectionCandidate,
} from './mbtiTownObservation';

const DEFAULT_TOWN_SLUG = 'evergreen-mbti-town';

type ResidentLite = Pick<Doc<'mbtiTownResidents'>, '_id' | 'key' | 'name' | 'role' | 'defaultLocationKey' | 'scheduleTags'>;
type RelationshipLite = Pick<
  Doc<'mbtiRelationships'>,
  '_id' | 'residentAKey' | 'residentBKey' | 'familiarity' | 'trust' | 'warmth' | 'tension' | 'influence' | 'summary' | 'lastInteractionAt'
>;
type MemoryLite = Pick<Doc<'mbtiTownMemories'>, 'residentKeys' | 'salience' | 'summary' | 'updatedAt' | 'status'>;
type LocationLite = Pick<Doc<'mbtiTownLocations'>, 'key'>;
type ConversationRequestLite = Pick<
  Doc<'mbtiTownConversationRequests'>,
  '_id' | 'createdAt' | 'priority' | 'residentNames'
>;

export const SIMULATED_TOWN_DAY_MS = 15 * 60 * 1000;

export type TownTimelinePhase = 'morning' | 'afternoon' | 'evening' | 'night';

export type AutonomySelection = {
  relationshipId: Id<'mbtiRelationships'>;
  residentAKey: string;
  residentBKey: string;
  title: string;
  summary: string;
  locationKey?: string;
  kind: Doc<'mbtiTownMemories'>['kind'];
  familiarityDelta: number;
  trustDelta: number;
  warmthDelta: number;
  tensionDelta: number;
  influenceDelta: number;
  reason: string;
  conversationRequest?: {
    residentKeys: string[];
    residentNames: string[];
    locationKey?: string;
    topicSeed: string;
    priority: 'low' | 'medium' | 'high';
    reason: string;
  };
  residentPlans: Array<{
    residentKey: string;
    intent: string;
    targetLocationKey?: string;
    socialAppetite: number;
    seekResidentKeys: string[];
    avoidResidentKeys: string[];
    topicSeed: string;
    reason: string;
  }>;
  timelineEntry: {
    townDay: number;
    phase: TownTimelinePhase;
    dayProgress: number;
    scope: 'resident_life' | 'resident_work' | 'relationship';
    storyline: Doc<'mbtiTownMemories'>['kind'];
    source: 'autonomy_tick';
    title: string;
    summary: string;
    residentKeys: string[];
    locationKey?: string;
  };
};

export function townCalendarFromElapsed(elapsedMs: number): {
  townDay: number;
  phase: TownTimelinePhase;
  dayProgress: number;
} {
  const safeElapsed = Math.max(0, elapsedMs);
  const townDay = Math.floor(safeElapsed / SIMULATED_TOWN_DAY_MS) + 1;
  const dayProgress = (safeElapsed % SIMULATED_TOWN_DAY_MS) / SIMULATED_TOWN_DAY_MS;
  const phase = dayProgress < 0.25
    ? 'morning'
    : dayProgress < 0.5
    ? 'afternoon'
    : dayProgress < 0.75
    ? 'evening'
    : 'night';
  return { townDay, phase, dayProgress };
}

export function fastForwardCalendarFromLatest(args: {
  latestTimeline?: {
    townDay: number;
    dayProgress: number;
  };
  townCreatedAt: number;
  advanceDays: number;
  targetPhase?: TownTimelinePhase;
}) {
  const phaseProgress: Record<TownTimelinePhase, number> = {
    morning: 0,
    afternoon: 0.25,
    evening: 0.5,
    night: 0.75,
  };
  const safeAdvanceDays = Math.max(1, Math.floor(args.advanceDays));
  const townDay = Math.max(1, (args.latestTimeline?.townDay ?? 1) + safeAdvanceDays);
  const phase = args.targetPhase ?? 'morning';
  const dayProgress = phaseProgress[phase];
  return {
    townDay,
    phase,
    dayProgress,
    simulatedNow: args.townCreatedAt + ((townDay - 1) + dayProgress) * SIMULATED_TOWN_DAY_MS,
  };
}

export function simulatedTownNowFromLatest(args: {
  latestTimeline?: {
    createdAt: number;
    townDay: number;
    dayProgress: number;
  };
  now: number;
  townCreatedAt: number;
}) {
  const wallClockSimulatedNow = args.now;
  if (!args.latestTimeline) {
    return wallClockSimulatedNow;
  }
  const latestSimulatedNow =
    args.townCreatedAt +
    ((args.latestTimeline.townDay - 1) + args.latestTimeline.dayProgress) * SIMULATED_TOWN_DAY_MS;
  const elapsedSinceLatest = Math.max(0, args.now - args.latestTimeline.createdAt);
  return Math.max(wallClockSimulatedNow, latestSimulatedNow + elapsedSinceLatest);
}

export const runAutonomyTick = mutation({
  args: {
    townId: v.optional(v.id('mbtiTownProfiles')),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => applyAutonomyTick(ctx, args),
});

export const fastForwardTownTimeline = mutation({
  args: {
    townId: v.optional(v.id('mbtiTownProfiles')),
    advanceDays: v.number(),
    targetPhase: v.optional(v.union(
      v.literal('morning'),
      v.literal('afternoon'),
      v.literal('evening'),
      v.literal('night'),
    )),
  },
  handler: async (ctx, args) => {
    const town = args.townId
      ? await ctx.db.get(args.townId)
      : await ctx.db
          .query('mbtiTownProfiles')
          .withIndex('slug', (q) => q.eq('slug', DEFAULT_TOWN_SLUG))
          .first();
    if (!town) {
      throw new Error('Seed the default MBTI town before fast-forwarding autonomy.');
    }
    const latestTimeline = await ctx.db
      .query('mbtiTownTimelineEvents')
      .withIndex('town_time', (q) => q.eq('townId', town._id))
      .order('desc')
      .first();
    const calendar = fastForwardCalendarFromLatest({
      latestTimeline: latestTimeline
        ? {
          townDay: latestTimeline.townDay,
          dayProgress: latestTimeline.dayProgress,
        }
        : undefined,
      townCreatedAt: town.createdAt,
      advanceDays: args.advanceDays,
      targetPhase: args.targetPhase,
    });
    const result = await applyAutonomyTick(ctx, {
      townId: town._id,
      simulatedNow: calendar.simulatedNow,
    });
    return {
      ...result,
      calendar,
    };
  },
});

export const runAutonomyTickInternal = internalMutation({
  args: {},
  handler: async (ctx) => applyAutonomyTick(ctx, {}),
});

export const startPendingConversationRequest = internalAction({
  args: {},
  handler: async (ctx) => {
    const town = await ctx.runQuery(internal.mbtiTownAutonomy.getDefaultTownConversationRequestPayload, {});
    if (!town) {
      return { started: false, reason: 'missing-town' };
    }
    const runnable = selectRunnableConversationRequest({
      requests: town.requests,
      playerNames: town.playerDescriptions.map((description: { name: string }) => description.name),
    });
    if (!runnable) {
      return { started: false, reason: 'no-runnable-request' };
    }
    await ctx.runMutation(api.aiTown.main.sendInput, {
      worldId: town.worldId,
      name: 'ensureMbtiFocusConversation',
      args: {
        participantNames: runnable.participantNames,
      },
    });
    await ctx.runMutation(internal.mbtiTownAutonomy.markConversationRequestStarted, {
      requestId: runnable._id,
      worldId: town.worldId,
    });
    return {
      started: true,
      requestId: runnable._id,
      participantNames: runnable.participantNames,
    };
  },
});

export const getDefaultTownConversationRequestPayload = internalQuery({
  args: {},
  handler: async (ctx) => {
    const town = await ctx.db
      .query('mbtiTownProfiles')
      .withIndex('slug', (q) => q.eq('slug', DEFAULT_TOWN_SLUG))
      .first();
    if (!town) {
      return null;
    }
    const sceneRequest = await ctx.db
      .query('mbtiSceneRequests')
      .withIndex('town_status', (q) => q.eq('townId', town._id).eq('status', 'running'))
      .order('desc')
      .first();
    if (!sceneRequest?.worldId) {
      return null;
    }
    const [requests, playerDescriptions] = await Promise.all([
      ctx.db
        .query('mbtiTownConversationRequests')
        .withIndex('town_status', (q) => q.eq('townId', town._id).eq('status', 'pending'))
        .collect(),
      ctx.db
        .query('playerDescriptions')
        .withIndex('worldId', (q) => q.eq('worldId', sceneRequest.worldId!))
        .collect(),
    ]);
    return {
      worldId: sceneRequest.worldId,
      requests,
      playerDescriptions: playerDescriptions.map((description) => ({
        name: description.name,
      })),
    };
  },
});

export const markConversationRequestStarted = internalMutation({
  args: {
    requestId: v.id('mbtiTownConversationRequests'),
    worldId: v.id('worlds'),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.requestId, {
      status: 'started',
      updatedAt: Date.now(),
      startedAt: Date.now(),
      worldId: args.worldId,
    });
  },
});

export const consolidateTownReflection = internalMutation({
  args: {},
  handler: async (ctx) => {
    const town = await ctx.db
      .query('mbtiTownProfiles')
      .withIndex('slug', (q) => q.eq('slug', DEFAULT_TOWN_SLUG))
      .first();
    if (!town) {
      return { reflected: false, reason: 'missing-town' };
    }
    const [residents, memories] = await Promise.all([
      ctx.db
        .query('mbtiTownResidents')
        .withIndex('town_status', (q) => q.eq('townId', town._id).eq('status', 'active'))
        .collect(),
      ctx.db
        .query('mbtiTownMemories')
        .withIndex('town_status', (q) => q.eq('townId', town._id).eq('status', 'active'))
        .collect(),
    ]);
    const existingReflectionKeys = new Set(
      memories
        .filter((memory) => memory.sourceKind === 'reflection')
        .map((memory) => reflectionKeyForResidents(memory.residentKeys)),
    );
    const residentNameByKey = new Map(residents.map((resident) => [resident.key, resident.name]));
    const candidate = selectTownReflectionCandidate({
      memories,
      existingReflectionKeys,
      residentNameByKey,
    });
    if (!candidate) {
      return { reflected: false, reason: 'no-candidate' };
    }
    const now = Date.now();
    const memoryId = await ctx.db.insert('mbtiTownMemories', {
      townId: town._id,
      createdAt: now,
      updatedAt: now,
      kind: 'routine',
      salience: candidate.salience,
      title: candidate.title,
      summary: candidate.summary,
      residentKeys: candidate.residentKeys,
      status: 'active',
      sourceKind: 'reflection',
      sourceReason: `reflection_from:${candidate.sourceMemoryIds.join(',')}`,
    });
    await ctx.db.patch(town._id, { updatedAt: now });
    return { reflected: true, memoryId, residentKeys: candidate.residentKeys };
  },
});

async function applyAutonomyTick(
  ctx: MutationCtx,
  args: {
    townId?: Id<'mbtiTownProfiles'>;
    dryRun?: boolean;
    simulatedNow?: number;
  },
) {
  const town = args.townId
    ? await ctx.db.get(args.townId)
    : await ctx.db
        .query('mbtiTownProfiles')
        .withIndex('slug', (q) => q.eq('slug', DEFAULT_TOWN_SLUG))
        .first();
  if (!town) {
    throw new Error('Seed the default MBTI town before running autonomy.');
  }

  const [residents, relationships, memories, locations, latestTimeline] = await Promise.all([
    ctx.db
      .query('mbtiTownResidents')
      .withIndex('town_status', (q) => q.eq('townId', town._id).eq('status', 'active'))
      .collect(),
    ctx.db.query('mbtiRelationships').withIndex('town_resident_a', (q) => q.eq('townId', town._id)).collect(),
    ctx.db
      .query('mbtiTownMemories')
      .withIndex('town_status', (q) => q.eq('townId', town._id).eq('status', 'active'))
      .collect(),
    ctx.db.query('mbtiTownLocations').withIndex('town', (q) => q.eq('townId', town._id)).collect(),
    ctx.db
      .query('mbtiTownTimelineEvents')
      .withIndex('town_time', (q) => q.eq('townId', town._id))
      .order('desc')
      .first(),
  ]);
  const tickNow = args.simulatedNow ?? simulatedTownNowFromLatest({
    latestTimeline: latestTimeline
      ? {
        createdAt: latestTimeline.createdAt,
        townDay: latestTimeline.townDay,
        dayProgress: latestTimeline.dayProgress,
      }
      : undefined,
    now: Date.now(),
    townCreatedAt: town.createdAt,
  });
  const selection = selectAutonomyInteraction({
    now: tickNow,
    townCreatedAt: town.createdAt,
    residents,
    relationships,
    memories,
    locations,
  });
  if (!selection) {
    return { ticked: false, reason: 'not-enough-town-state' };
  }
  if (args.dryRun) {
    return { ticked: false, preview: selection };
  }

  const now = Date.now();
  const relationship = relationships.find((item) => item._id === selection.relationshipId);
  if (!relationship) {
    throw new Error('Selected relationship disappeared before autonomy tick was applied.');
  }
  const memoryId = await ctx.db.insert('mbtiTownMemories', {
    townId: town._id,
    createdAt: now,
    updatedAt: now,
    kind: selection.kind,
    salience: Math.min(100, 44 + Math.floor(relationship.familiarity / 5) + Math.abs(selection.tensionDelta) * 6),
    title: selection.title,
    summary: selection.summary,
    residentKeys: [selection.residentAKey, selection.residentBKey],
    locationKey: selection.locationKey,
    status: 'active',
    sourceKind: 'autonomy_tick',
    sourceReason: selection.reason,
    relationshipDelta: {
      relationshipId: selection.relationshipId,
      familiarity: selection.familiarityDelta,
      trust: selection.trustDelta,
      warmth: selection.warmthDelta,
      tension: selection.tensionDelta,
      influence: selection.influenceDelta,
      reason: selection.reason,
    },
  });
  if (selection.conversationRequest) {
    await ctx.db.insert('mbtiTownConversationRequests', {
      townId: town._id,
      createdAt: now,
      updatedAt: now,
      status: 'pending',
      residentKeys: selection.conversationRequest.residentKeys,
      residentNames: selection.conversationRequest.residentNames,
      locationKey: selection.conversationRequest.locationKey,
      topicSeed: selection.conversationRequest.topicSeed,
      priority: selection.conversationRequest.priority,
      reason: selection.conversationRequest.reason,
      sourceMemoryId: memoryId,
    });
  }
  await ctx.db.insert('mbtiTownTimelineEvents', {
    townId: town._id,
    createdAt: now,
    updatedAt: now,
    townDay: selection.timelineEntry.townDay,
    phase: selection.timelineEntry.phase,
    dayProgress: selection.timelineEntry.dayProgress,
    scope: selection.timelineEntry.scope,
    storyline: selection.timelineEntry.storyline,
    source: selection.timelineEntry.source,
    title: selection.timelineEntry.title,
    summary: selection.timelineEntry.summary,
    residentKeys: selection.timelineEntry.residentKeys,
    locationKey: selection.timelineEntry.locationKey,
    memoryId,
    relationshipId: selection.relationshipId,
    status: 'active',
  });
  await ctx.scheduler.runAfter(0, internal.mbti.triggerRunnableTimelineEvents, {
    townId: town._id,
    townDay: selection.timelineEntry.townDay,
    phase: selection.timelineEntry.phase,
  });
  await ctx.db.patch(selection.relationshipId, {
    familiarity: clampRelationshipScore(relationship.familiarity + selection.familiarityDelta),
    trust: clampRelationshipScore(relationship.trust + selection.trustDelta),
    warmth: clampRelationshipScore(relationship.warmth + selection.warmthDelta),
    tension: clampRelationshipScore(relationship.tension + selection.tensionDelta),
    influence: clampRelationshipScore(relationship.influence + selection.influenceDelta),
    summary: relationshipSummaryWithAutonomyTrace(relationship.summary, selection),
    lastInteractionAt: now,
    updatedAt: now,
  });
  for (const plan of selection.residentPlans) {
    const resident = residents.find((item) => item.key === plan.residentKey);
    if (!resident) {
      continue;
    }
    await ctx.db.patch(resident._id, {
      autonomyPlan: {
        updatedAt: now,
        intent: plan.intent,
        targetLocationKey: plan.targetLocationKey,
        socialAppetite: plan.socialAppetite,
        seekResidentKeys: plan.seekResidentKeys,
        avoidResidentKeys: plan.avoidResidentKeys,
        topicSeed: plan.topicSeed,
        reason: plan.reason,
      },
    });
  }
  await ctx.db.patch(town._id, { updatedAt: now });
  return { ticked: true, selection };
}

export function selectAutonomyInteraction(args: {
  now: number;
  townCreatedAt?: number;
  residents: ResidentLite[];
  relationships: RelationshipLite[];
  memories: MemoryLite[];
  locations?: LocationLite[];
}): AutonomySelection | null {
  const residentByKey = new Map(args.residents.map((resident) => [resident.key, resident]));
  const activeRelationships = args.relationships.filter(
    (relationship) =>
      residentByKey.has(relationship.residentAKey) && residentByKey.has(relationship.residentBKey),
  );
  if (activeRelationships.length === 0) {
    return null;
  }
  const scored = activeRelationships
    .map((relationship) => ({
      relationship,
      score: relationshipScore(relationship, args.memories, args.now),
    }))
    .sort((a, b) => b.score - a.score || a.relationship.residentAKey.localeCompare(b.relationship.residentAKey));
  const relationship = scored[0].relationship;
  const residentA = residentByKey.get(relationship.residentAKey)!;
  const residentB = residentByKey.get(relationship.residentBKey)!;
  const locationKey = autonomyInteractionLocation(residentA, residentB, args.locations);
  const memoryHint = strongestSharedMemory(args.memories, relationship);
  const relationshipContext = compactAutonomyContext(memoryHint ?? relationship.summary);
  const conflictLeaning = relationship.tension > relationship.warmth + 10;
  const warmLeaning = relationship.warmth >= relationship.tension;
  const kind: Doc<'mbtiTownMemories'>['kind'] = conflictLeaning ? 'conflict' : warmLeaning ? 'routine' : 'public';
  const familiarityDelta = 1;
  const trustDelta = conflictLeaning ? -1 : warmLeaning ? 1 : 0;
  const warmthDelta = conflictLeaning ? 0 : 1;
  const tensionDelta = conflictLeaning ? 1 : relationship.tension > 0 ? -1 : 0;
  const influenceDelta = conflictLeaning && relationship.influence < 80 ? 1 : 0;
  const title = conflictLeaning
    ? `自主互动：${residentA.name}和${residentB.name}重新碰到旧分歧`
    : `自主互动：${residentA.name}和${residentB.name}延续日常往来`;
  const summary = [
    `${residentA.name}（${residentA.role}）和${residentB.name}（${residentB.role}）在小镇日常里自然产生一次互动。`,
    memoryHint ? `这次互动被旧记忆牵动：${relationshipContext}` : `两人的关系背景是：${relationshipContext}`,
    conflictLeaning
      ? '互动让原有紧张略微浮出水面，后续更可能影响相关场景。'
      : '互动增加了一点熟悉感，让后续场景更容易引用这段日常背景。',
  ].join(' ');
  const calendar = townCalendarFromElapsed(args.now - (args.townCreatedAt ?? args.now));
  const timelineScope = conflictLeaning
    ? 'relationship'
    : locationKey && (locationKey === residentA.defaultLocationKey || locationKey === residentB.defaultLocationKey)
    ? 'resident_life'
    : 'resident_work';
  const timelineSummary = [
    `小镇第 ${calendar.townDay} 天${phaseLabel(calendar.phase)}，${residentA.name}和${residentB.name}的日常线继续推进。`,
    conflictLeaning
      ? '这次节点把关系里的旧分歧往前推了一点。'
      : '这次节点没有依赖用户提问，属于居民自己的生活/工作延续。',
  ].join('');
  return {
    relationshipId: relationship._id,
    residentAKey: relationship.residentAKey,
    residentBKey: relationship.residentBKey,
    title,
    summary,
    locationKey,
    kind,
    familiarityDelta,
    trustDelta,
    warmthDelta,
    tensionDelta,
    influenceDelta,
    reason: 'autonomous_town_tick',
    conversationRequest: buildConversationRequest({
      residentA,
      residentB,
      locationKey,
      topicSeed: relationshipContext,
      conflictLeaning,
      tension: relationship.tension,
      warmth: relationship.warmth,
    }),
    residentPlans: buildResidentPlans({
      residentA,
      residentB,
      relationship,
      locationKey,
      topicSeed: relationshipContext,
      conflictLeaning,
    }),
    timelineEntry: {
      ...calendar,
      scope: timelineScope,
      storyline: kind,
      source: 'autonomy_tick',
      title,
      summary: timelineSummary,
      residentKeys: [relationship.residentAKey, relationship.residentBKey],
      locationKey,
    },
  };
}

function phaseLabel(phase: TownTimelinePhase) {
  const labels: Record<TownTimelinePhase, string> = {
    morning: '上午',
    afternoon: '下午',
    evening: '傍晚',
    night: '夜里',
  };
  return labels[phase];
}

export function selectRunnableConversationRequest(args: {
  requests: ConversationRequestLite[];
  playerNames: string[];
}): (ConversationRequestLite & { participantNames: string[] }) | null {
  const playerNameSet = new Set(args.playerNames);
  const priorityRank: Record<ConversationRequestLite['priority'], number> = {
    high: 3,
    medium: 2,
    low: 1,
  };
  const runnable = args.requests
    .filter((request) => request.residentNames.length >= 2)
    .filter((request) => request.residentNames.slice(0, 2).every((name) => playerNameSet.has(name)))
    .sort((a, b) => priorityRank[b.priority] - priorityRank[a.priority] || a.createdAt - b.createdAt)[0];
  if (!runnable) {
    return null;
  }
  return {
    ...runnable,
    participantNames: runnable.residentNames.slice(0, 2),
  };
}

function buildConversationRequest(args: {
  residentA: ResidentLite;
  residentB: ResidentLite;
  locationKey?: string;
  topicSeed: string;
  conflictLeaning: boolean;
  tension: number;
  warmth: number;
}): AutonomySelection['conversationRequest'] {
  const priority = args.conflictLeaning || args.tension >= 55 ? 'high' : args.warmth >= 55 ? 'medium' : 'low';
  if (priority === 'low') {
    return undefined;
  }
  return {
    residentKeys: [args.residentA.key, args.residentB.key],
    residentNames: [args.residentA.name, args.residentB.name],
    locationKey: args.locationKey,
    topicSeed: args.topicSeed,
    priority,
    reason: args.conflictLeaning
      ? 'high_tension_autonomy_interaction'
      : 'warm_routine_autonomy_interaction',
  };
}

function buildResidentPlans(args: {
  residentA: ResidentLite;
  residentB: ResidentLite;
  relationship: RelationshipLite;
  locationKey?: string;
  topicSeed: string;
  conflictLeaning: boolean;
}): AutonomySelection['residentPlans'] {
  const shared = {
    targetLocationKey: args.locationKey,
    topicSeed: args.topicSeed,
    reason: 'autonomy_tick_relationship_context',
  };
  if (args.conflictLeaning) {
    const directResident =
      args.relationship.influence >= 50 || args.relationship.tension >= 60 ? args.residentA : args.residentB;
    const avoidResident = directResident.key === args.residentA.key ? args.residentB : args.residentA;
    return [
      {
        residentKey: directResident.key,
        intent: `想把和${avoidResident.name}之间反复出现的分歧说具体一点`,
        socialAppetite: 58,
        seekResidentKeys: [avoidResident.key],
        avoidResidentKeys: [],
        ...shared,
      },
      {
        residentKey: avoidResident.key,
        intent: `对${directResident.name}的追问有点警惕，先观察对方是否只是旧事重提`,
        socialAppetite: 34,
        seekResidentKeys: [],
        avoidResidentKeys: [directResident.key],
        ...shared,
      },
    ];
  }
  return [
    {
      residentKey: args.residentA.key,
      intent: `延续和${args.residentB.name}的日常往来，顺手确认最近状态`,
      socialAppetite: 62,
      seekResidentKeys: [args.residentB.key],
      avoidResidentKeys: [],
      ...shared,
    },
    {
      residentKey: args.residentB.key,
      intent: `愿意接住${args.residentA.name}的日常话题，但不主动扩大成公开讨论`,
      socialAppetite: 54,
      seekResidentKeys: [args.residentA.key],
      avoidResidentKeys: [],
      ...shared,
    },
  ];
}

function relationshipScore(
  relationship: RelationshipLite,
  memories: MemoryLite[],
  now: number,
) {
  const hoursSinceInteraction = relationship.lastInteractionAt
    ? Math.max(1, (now - relationship.lastInteractionAt) / 1000 / 60 / 60)
    : 72;
  const staleness = Math.min(30, Math.log2(hoursSinceInteraction + 1) * 6);
  const sharedMemory = strongestSharedMemory(memories, relationship) ? 12 : 0;
  return relationship.familiarity * 0.5 + relationship.tension * 1.2 + relationship.influence * 0.3 + staleness + sharedMemory;
}

function strongestSharedMemory(memories: MemoryLite[], relationship: RelationshipLite) {
  const pair = new Set([relationship.residentAKey, relationship.residentBKey]);
  const memory = memories
    .filter((item) => item.status === 'active')
    .filter((item) => item.residentKeys.filter((key) => pair.has(key)).length >= 2)
    .sort((a, b) => b.salience - a.salience || b.updatedAt - a.updatedAt)[0];
  return memory?.summary;
}

export function compactAutonomyContext(text: string, maxLength = 90) {
  const normalized = text
    .replace(/\s+/g, ' ')
    .replace(/(最近一次自主互动让紧张略微浮现：自主互动：[^。；;]+[。；;]?)+/g, '最近关系紧张略有浮现。')
    .replace(/(最近一次自主互动增加了日常熟悉度：自主互动：[^。；;]+[。；;]?)+/g, '最近日常熟悉度略有增加。')
    .replace(/梁策（律师助理）和赵衡（前公司主管）在小镇日常里自然产生一次互动。?\s*/g, '梁策和赵衡多次在日常里碰到旧分歧。')
    .replace(/互动让原有紧张略微浮出水面，后续更可能影响相关场景。?\s*/g, '互动让原有紧张持续浮现。')
    .replace(/后续扰动应把这段关系当作稳定背景，而不是一次性事件。?\s*/g, '后续扰动应把这段关系当作稳定背景。')
    .trim();
  const sentences = normalized
    .split(/(?<=[。！？!?])\s*/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const uniqueSentences = [...new Set(sentences)];
  const compacted = (uniqueSentences.length > 0 ? uniqueSentences : [normalized]).join(' ');
  return compacted.length > maxLength ? `${compacted.slice(0, maxLength - 1)}…` : compacted;
}

export function autonomyInteractionLocation(residentA: ResidentLite, residentB: ResidentLite, locations?: LocationLite[]) {
  if (residentA.defaultLocationKey === residentB.defaultLocationKey) {
    return residentA.defaultLocationKey;
  }
  const knownLocationKeys = new Set(locations?.map((location) => location.key) ?? []);
  const sharedTag = residentA.scheduleTags.find(
    (tag) => residentB.scheduleTags.includes(tag) && knownLocationKeys.has(tag),
  );
  if (sharedTag) {
    return sharedTag;
  }
  if (residentA.defaultLocationKey === 'office' && residentB.defaultLocationKey !== 'office') {
    return residentB.defaultLocationKey;
  }
  if (residentB.defaultLocationKey === 'office' && residentA.defaultLocationKey !== 'office') {
    return residentA.defaultLocationKey;
  }
  return residentA.defaultLocationKey;
}

function clampRelationshipScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

function relationshipSummaryWithAutonomyTrace(
  summary: string,
  selection: Pick<AutonomySelection, 'kind' | 'title' | 'reason'>,
) {
  const base = compactAutonomyContext(summary, 120)
    .replace(/最近关系紧张略有浮现。?$/g, '')
    .replace(/最近日常熟悉度略有增加。?$/g, '')
    .trim();
  const trace = selection.kind === 'conflict'
    ? `最近一次自主互动让紧张略微浮现：${selection.title}`
    : `最近一次自主互动增加了日常熟悉度：${selection.title}`;
  return compactAutonomyContext(`${base} ${trace}`, 160);
}
