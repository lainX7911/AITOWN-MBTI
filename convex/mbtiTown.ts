import { v } from 'convex/values';
import { mutation, MutationCtx, query, QueryCtx } from './_generated/server';
import { Id } from './_generated/dataModel';
import {
  defaultTownLocations,
  defaultTownMemories,
  defaultTownRelationships,
  defaultTownResidents,
  SceneSelectionInput,
  selectScene,
  UserEntryMode,
} from '../data/mbtiPersistentTown';

const DEFAULT_TOWN_SLUG = 'evergreen-mbti-town';

const userEntryMode = v.union(
  v.literal('solo'),
  v.literal('with_partner'),
  v.literal('with_friend'),
  v.literal('with_partner_and_friend'),
);

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


export const seedDefaultTown = mutation({
  args: {
    reset: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await getDefaultTownProfile(ctx);
    if (existing && !args.reset) {
      return {
        townId: existing._id,
        created: false,
        ...(await townCounts(ctx, existing._id)),
      };
    }
    if (existing && args.reset) {
      await deleteTownChildren(ctx, existing._id);
      await ctx.db.delete(existing._id);
    }

    const now = Date.now();
    const townId = await ctx.db.insert('mbtiTownProfiles', {
      createdAt: now,
      updatedAt: now,
      slug: DEFAULT_TOWN_SLUG,
      name: '常青 MBTI 小镇',
      description: '一个持续存在的 MBTI 社会场。用户作为新居民进入，其他居民保留关系、记忆和日常生活。',
      status: 'active',
    });

    for (const location of defaultTownLocations) {
      await ctx.db.insert('mbtiTownLocations', {
        townId,
        ...location,
      });
    }
    for (const resident of defaultTownResidents) {
      await ctx.db.insert('mbtiTownResidents', {
        townId,
        ...resident,
        status: 'active',
      });
    }
    for (const relationship of defaultTownRelationships) {
      await ctx.db.insert('mbtiRelationships', {
        townId,
        ...relationship,
        updatedAt: now,
      });
    }
    for (const memory of defaultTownMemories) {
      await ctx.db.insert('mbtiTownMemories', {
        townId,
        ...memory,
        createdAt: now,
        updatedAt: now,
        status: 'active',
      });
    }

    return {
      townId,
      created: true,
      ...(await townCounts(ctx, townId)),
    };
  },
});

export const getDefaultTown = query({
  args: {},
  handler: async (ctx) => {
    const town = await getDefaultTownProfile(ctx);
    if (!town) {
      return null;
    }
    return {
      town,
      ...(await townCounts(ctx, town._id)),
    };
  },
});

export const getTownSnapshot = query({
  args: {
    townId: v.optional(v.id('mbtiTownProfiles')),
  },
  handler: async (ctx, args) => {
    const town = args.townId ? await ctx.db.get(args.townId) : await getDefaultTownProfile(ctx);
    if (!town) {
      return null;
    }
    const [locations, residents, relationships, memories, recentSceneRequests] =
      await readTownState(ctx, town._id);
    return {
      town,
      locations,
      residents,
      relationships,
      memories,
      recentSceneRequests,
      counts: {
        locations: locations.length,
        residents: residents.length,
        relationships: relationships.length,
        memories: memories.length,
        recentSceneRequests: recentSceneRequests.length,
      },
    };
  },
});

export const createSceneRequest = mutation({
  args: {
    townId: v.optional(v.id('mbtiTownProfiles')),
    question: v.string(),
    userEntryMode,
    plannedFocus: questionFocus,
  },
  handler: async (ctx, args) => {
    const town = args.townId ? await ctx.db.get(args.townId) : await getDefaultTownProfile(ctx);
    if (!town) {
      throw new Error('Seed the default MBTI town before creating a scene request.');
    }
    await refreshTownMemoryStaleness(ctx, town._id, Date.now());
    const [locations, residents, relationships, memories] = await readTownState(ctx, town._id);
    const selection = selectScene({
      question: args.question,
      userEntryMode: args.userEntryMode as UserEntryMode,
      locations: locations.map(({ key, name, affordances, description }) => ({
        key,
        name,
        affordances,
        description,
      })),
      residents: residents.map(
        ({
          key,
          name,
          role,
          mbtiCode,
          weights,
          traits,
          background,
          defaultLocationKey,
          scheduleTags,
        }) => ({
          key,
          name,
          role,
          mbtiCode,
          weights,
          traits,
          background,
          defaultLocationKey,
          scheduleTags,
        }),
      ),
      relationships: relationships.map(
        ({
          residentAKey,
          residentBKey,
          familiarity,
          trust,
          warmth,
          tension,
          influence,
          summary,
        }) => ({
          residentAKey,
          residentBKey,
          familiarity,
          trust,
          warmth,
          tension,
          influence,
          summary,
        }),
      ),
      memories: memories.map(({ kind, salience, title, summary, residentKeys, locationKey }) => ({
        kind,
        salience,
        title,
        summary,
        residentKeys,
        locationKey,
      })),
    } satisfies SceneSelectionInput);
    const questionFocus = args.plannedFocus;
    const selectionRationale = [
      ...selection.rationale,
      '入镇前已由 LLM 生成隐性场景计划和启动前关键问题；角色只接收关系背景和事件，不直接接收用户原题。',
    ];
    const now = Date.now();
    const sceneRequestId = await ctx.db.insert('mbtiSceneRequests', {
      townId: town._id,
      createdAt: now,
      updatedAt: now,
      status: 'planned',
      userQuestion: args.question,
      userEntryMode: args.userEntryMode,
      sceneType: selection.sceneType,
      selectedLocationKey: selection.locationKey,
      selectedResidentKeys: selection.residentKeys,
      questionFocus,
      selectionRationale,
      ephemeralParticipantKeys: ephemeralParticipantKeys(args.userEntryMode as UserEntryMode),
    });
    return {
      sceneRequestId,
      townId: town._id,
      ...selection,
      questionFocus,
      rationale: selectionRationale,
      selectedResidents: residents
        .filter((resident) => selection.residentKeys.includes(resident.key))
        .map(
          ({
            key,
            name,
            role,
            mbtiCode,
            weights,
            traits,
            background,
            defaultLocationKey,
            scheduleTags,
          }) => ({
            key,
            name,
            role,
            mbtiCode,
            weights,
            traits,
            background,
            context: residentSceneContext(
              key,
              selection.residentKeys,
              relationships,
              memories,
            ),
            defaultLocationKey,
            scheduleTags,
          }),
        ),
      backgroundResidents: residents
        .filter((resident) => !selection.residentKeys.includes(resident.key))
        .map(
          ({
            key,
            name,
            role,
            mbtiCode,
            weights,
            traits,
            background,
            defaultLocationKey,
            scheduleTags,
          }) => ({
            key,
            name,
            role,
            mbtiCode,
            weights,
            traits,
            background,
            defaultLocationKey,
            scheduleTags,
          }),
        ),
    };
  },
});

export const listSceneRequests = query({
  args: {
    townId: v.optional(v.id('mbtiTownProfiles')),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const town = args.townId ? await ctx.db.get(args.townId) : await getDefaultTownProfile(ctx);
    if (!town) {
      return [];
    }
    const limit = Math.max(1, Math.min(args.limit ?? 20, 50));
    return await ctx.db
      .query('mbtiSceneRequests')
      .withIndex('town_time', (q) => q.eq('townId', town._id))
      .order('desc')
      .take(limit);
  },
});

export const getSceneEvidence = query({
  args: {
    sceneRequestId: v.optional(v.id('mbtiSceneRequests')),
  },
  handler: async (ctx, args) => {
    if (!args.sceneRequestId) {
      return null;
    }
    const sceneRequest = await ctx.db.get(args.sceneRequestId);
    if (!sceneRequest) {
      return null;
    }
    const [residents, memories, relationships] = await Promise.all([
      ctx.db
        .query('mbtiTownResidents')
        .withIndex('town_status', (q) => q.eq('townId', sceneRequest.townId))
        .collect(),
      ctx.db
        .query('mbtiTownMemories')
        .withIndex('town_time', (q) => q.eq('townId', sceneRequest.townId))
        .collect(),
      ctx.db
        .query('mbtiRelationships')
        .withIndex('town_resident_a', (q) => q.eq('townId', sceneRequest.townId))
        .collect(),
    ]);
    const selectedResidentKeys = new Set(sceneRequest.selectedResidentKeys);
    const residentNameByKey = new Map(residents.map((resident) => [resident.key, resident.name]));
    const relevantPriorMemories = memories
      .filter(
        (memory) =>
          memory.sourceSceneRequestId !== sceneRequest._id &&
          (memory.locationKey === sceneRequest.selectedLocationKey ||
            memory.residentKeys.some((key) => selectedResidentKeys.has(key))),
      )
      .sort((a, b) => Number(a.status === 'stale') - Number(b.status === 'stale') || b.salience - a.salience)
      .slice(0, 8)
      .map((memory) => ({
        _id: memory._id,
        kind: memory.kind,
        salience: memory.salience,
        title: memory.title,
        summary: memory.summary,
        residentNames: memory.residentKeys.map((key) => residentNameByKey.get(key) ?? key),
        locationKey: memory.locationKey,
        status: memory.status,
        stalenessReason: memory.stalenessReason,
      }));
    const newMemories = memories
      .filter((memory) => memory.sourceSceneRequestId === sceneRequest._id)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((memory) => ({
        _id: memory._id,
        kind: memory.kind,
        salience: memory.salience,
        title: memory.title,
        summary: memory.summary,
        residentNames: memory.residentKeys.map((key) => residentNameByKey.get(key) ?? key),
        locationKey: memory.locationKey,
        status: memory.status,
      }));
    const selectedRelationships = relationships
      .filter(
        (relationship) =>
          selectedResidentKeys.has(relationship.residentAKey) &&
          selectedResidentKeys.has(relationship.residentBKey),
      )
      .sort((a, b) => b.familiarity + b.tension - (a.familiarity + a.tension))
      .slice(0, 12)
      .map((relationship) => ({
        _id: relationship._id,
        residentAKey: relationship.residentAKey,
        residentBKey: relationship.residentBKey,
        residentAName: residentNameByKey.get(relationship.residentAKey) ?? relationship.residentAKey,
        residentBName: residentNameByKey.get(relationship.residentBKey) ?? relationship.residentBKey,
        familiarity: relationship.familiarity,
        trust: relationship.trust,
        warmth: relationship.warmth,
        tension: relationship.tension,
        influence: relationship.influence,
        summary: relationship.summary,
        lastInteractionAt: relationship.lastInteractionAt,
      }));
    return {
      sceneRequest,
      relevantPriorMemories,
      newMemories,
      selectedRelationships,
      relationshipDeltas: (sceneRequest.townRelationshipDeltas ?? []).map((delta) => ({
        ...delta,
        residentAName: residentNameByKey.get(delta.residentAKey) ?? delta.residentAKey,
        residentBName: residentNameByKey.get(delta.residentBKey) ?? delta.residentBKey,
      })),
    };
  },
});

async function refreshTownMemoryStaleness(
  ctx: MutationCtx,
  townId: Id<'mbtiTownProfiles'>,
  now: number,
) {
  const memories = await ctx.db
    .query('mbtiTownMemories')
    .withIndex('town_status', (q) => q.eq('townId', townId).eq('status', 'active'))
    .collect();
  const staleAfterMs = 21 * 24 * 60 * 60 * 1000;
  for (const memory of memories) {
    const ageMs = now - memory.updatedAt;
    const lowConfidenceOldMemory = ageMs > staleAfterMs && memory.salience < 68;
    if (!lowConfidenceOldMemory) {
      continue;
    }
    await ctx.db.patch(memory._id, {
      status: 'stale',
      staleAt: now,
      stalenessReason: '这条印象较久没有被新场景再次触发，后续只作为弱背景参考。',
      updatedAt: now,
    });
  }
}

async function getDefaultTownProfile(ctx: QueryCtx | MutationCtx) {
  return await ctx.db
    .query('mbtiTownProfiles')
    .withIndex('slug', (q) => q.eq('slug', DEFAULT_TOWN_SLUG))
    .first();
}

async function readTownState(ctx: QueryCtx | MutationCtx, townId: Id<'mbtiTownProfiles'>) {
  return await Promise.all([
    ctx.db.query('mbtiTownLocations').withIndex('town', (q) => q.eq('townId', townId)).collect(),
    ctx.db
      .query('mbtiTownResidents')
      .withIndex('town_status', (q) => q.eq('townId', townId).eq('status', 'active'))
      .collect(),
    ctx.db
      .query('mbtiRelationships')
      .withIndex('town_resident_a', (q) => q.eq('townId', townId))
      .collect(),
    ctx.db
      .query('mbtiTownMemories')
      .withIndex('town_status', (q) => q.eq('townId', townId).eq('status', 'active'))
      .collect(),
    ctx.db
      .query('mbtiSceneRequests')
      .withIndex('town_time', (q) => q.eq('townId', townId))
      .order('desc')
      .take(10),
  ] as const);
}

function residentSceneContext(
  residentKey: string,
  activeResidentKeys: string[],
  relationships: Array<{
    residentAKey: string;
    residentBKey: string;
    familiarity: number;
    trust: number;
    warmth: number;
    tension: number;
    summary: string;
  }>,
  memories: Array<{
    title: string;
    summary: string;
    salience: number;
    residentKeys: string[];
  }>,
) {
  const relationLines = relationships
    .filter(
      (relationship) =>
        (relationship.residentAKey === residentKey &&
          activeResidentKeys.includes(relationship.residentBKey)) ||
        (relationship.residentBKey === residentKey &&
          activeResidentKeys.includes(relationship.residentAKey)),
    )
    .sort((a, b) => b.familiarity + b.tension - (a.familiarity + a.tension))
    .slice(0, 3)
    .map((relationship) => {
      const otherKey =
        relationship.residentAKey === residentKey
          ? relationship.residentBKey
          : relationship.residentAKey;
      return `和${otherKey}：${relationship.summary}`;
    });
  const memoryLines = memories
    .filter((memory) => memory.residentKeys.includes(residentKey))
    .sort((a, b) => b.salience - a.salience)
    .slice(0, 3)
    .map((memory) => `${memory.title}：${memory.summary}`);
  return [...relationLines, ...memoryLines].join('\n');
}

async function townCounts(ctx: QueryCtx | MutationCtx, townId: Id<'mbtiTownProfiles'>) {
  const [locations, residents, relationships, memories, sceneRequests] = await Promise.all([
    ctx.db.query('mbtiTownLocations').withIndex('town', (q) => q.eq('townId', townId)).collect(),
    ctx.db.query('mbtiTownResidents').withIndex('town_status', (q) => q.eq('townId', townId)).collect(),
    ctx.db.query('mbtiRelationships').withIndex('town_resident_a', (q) => q.eq('townId', townId)).collect(),
    ctx.db.query('mbtiTownMemories').withIndex('town_status', (q) => q.eq('townId', townId)).collect(),
    ctx.db.query('mbtiSceneRequests').withIndex('town_time', (q) => q.eq('townId', townId)).collect(),
  ]);
  return {
    counts: {
      locations: locations.length,
      residents: residents.length,
      relationships: relationships.length,
      memories: memories.length,
      sceneRequests: sceneRequests.length,
    },
  };
}

async function deleteTownChildren(ctx: MutationCtx, townId: Id<'mbtiTownProfiles'>) {
  const [locations, residents, relationships, memories, sceneRequests] = await Promise.all([
    ctx.db.query('mbtiTownLocations').withIndex('town', (q) => q.eq('townId', townId)).collect(),
    ctx.db.query('mbtiTownResidents').withIndex('town_status', (q) => q.eq('townId', townId)).collect(),
    ctx.db.query('mbtiRelationships').withIndex('town_resident_a', (q) => q.eq('townId', townId)).collect(),
    ctx.db.query('mbtiTownMemories').withIndex('town_status', (q) => q.eq('townId', townId)).collect(),
    ctx.db.query('mbtiSceneRequests').withIndex('town_time', (q) => q.eq('townId', townId)).collect(),
  ]);
  for (const doc of [...locations, ...residents, ...relationships, ...memories, ...sceneRequests]) {
    await ctx.db.delete(doc._id);
  }
}

function ephemeralParticipantKeys(mode: UserEntryMode): string[] {
  if (mode === 'with_partner') {
    return ['user_partner'];
  }
  if (mode === 'with_friend') {
    return ['user_friend'];
  }
  if (mode === 'with_partner_and_friend') {
    return ['user_partner', 'user_friend'];
  }
  return [];
}
