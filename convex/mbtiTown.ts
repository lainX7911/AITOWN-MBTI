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
import { buildTownActivityStream } from './mbtiTownObservation';
import { compactAutonomyContext } from './mbtiTownAutonomy';

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
  decisionStructure: v.optional(v.object({
    surfaceQuestion: v.string(),
    underlyingDecision: v.string(),
    decisionDimensions: v.array(v.object({
      label: v.string(),
      whyItMatters: v.string(),
      userBlindSpot: v.optional(v.string()),
    })),
    personalityLevers: v.array(v.string()),
    unknowns: v.array(v.string()),
    hiddenNeeds: v.array(v.string()),
    riskBlindspots: v.array(v.string()),
    possiblePaths: v.array(v.object({
      label: v.string(),
      whenLikely: v.string(),
      possibleResult: v.string(),
    })),
    changeConditions: v.array(v.string()),
    nextValidationQuestions: v.array(v.string()),
  })),
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
    locationKey: v.optional(v.string()),
    scene: v.string(),
    trigger: v.string(),
    participants: v.array(v.string()),
    observationAxis: v.optional(v.string()),
    questionLink: v.optional(v.string()),
    informationGoal: v.string(),
    judgmentSignal: v.string(),
    responseOptions: v.optional(v.array(v.string())),
    stakes: v.optional(v.object({
      timeCost: v.optional(v.string()),
      moneyCost: v.optional(v.string()),
      relationshipCost: v.optional(v.string()),
      opportunityCost: v.optional(v.string()),
    })),
    consequenceOptions: v.optional(v.array(v.object({
      userAction: v.string(),
      relationshipDelta: v.string(),
      unlocks: v.string(),
    }))),
  }))),
  resolutionCriteria: v.string(),
});

type SceneResidentRole = {
  residentKey: string;
  relationToUser: string;
  sceneReason: string;
  personalStake: string;
  knowsAboutUser: string[];
  doesNotKnow: string[];
  pressureStyle: string;
  allowedIntervention: string;
};

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
          autonomyPlan,
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
    const sceneResidentRoles = buildSceneResidentRoles({
      question: args.question,
      userEntryMode: args.userEntryMode as UserEntryMode,
      sceneType: selection.sceneType,
      selectedLocationKey: selection.locationKey,
      selectedResidentKeys: selection.residentKeys,
      residents,
      relationships,
      memories,
      questionFocus,
    });
    const sceneRoleByResidentKey = new Map(sceneResidentRoles.map((role) => [role.residentKey, role]));
    const selectedResidentDocs = residents.filter((resident) => selection.residentKeys.includes(resident.key));
    const hydratedQuestionFocus = hydrateEventPlanResidentPlaceholders(questionFocus, selectedResidentDocs);
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
      sceneResidentRoles,
      questionFocus: hydratedQuestionFocus,
      selectionRationale,
      ephemeralParticipantKeys: ephemeralParticipantKeys(args.userEntryMode as UserEntryMode),
    });
    return {
      sceneRequestId,
      townId: town._id,
      ...selection,
      questionFocus: hydratedQuestionFocus,
      rationale: selectionRationale,
      sceneResidentRoles,
      selectedResidents: selectedResidentDocs
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
            autonomyPlan,
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
              autonomyPlan,
            ),
            sceneRole: sceneRoleByResidentKey.get(key),
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

export function buildSceneResidentRoles(args: {
  question: string;
  userEntryMode: UserEntryMode;
  sceneType: string;
  selectedLocationKey: string;
  selectedResidentKeys: string[];
  residents: Array<{
    key: string;
    name: string;
    role: string;
    traits: string[];
    background: string;
    defaultLocationKey: string;
  }>;
  relationships: Array<{
    residentAKey: string;
    residentBKey: string;
    familiarity: number;
    trust: number;
    warmth: number;
    tension: number;
    influence: number;
    summary: string;
  }>;
  memories: Array<{
    kind: string;
    salience: number;
    title: string;
    summary: string;
    residentKeys: string[];
    locationKey?: string;
  }>;
  questionFocus: {
    observationGoal: string;
    drivingTension: string;
    decisionStructure?: {
      unknowns: string[];
      riskBlindspots: string[];
      hiddenNeeds: string[];
      decisionDimensions: Array<{ label: string }>;
    };
  };
}): SceneResidentRole[] {
  const residentByKey = new Map(args.residents.map((resident) => [resident.key, resident]));
  return args.selectedResidentKeys
    .map((residentKey, index) => {
      const resident = residentByKey.get(residentKey);
      if (!resident) {
        return null;
      }
      const memory = strongestSceneMemory(args.memories, residentKey, args.selectedLocationKey);
      const position = scenePositionForResident({
        index,
        resident,
        question: args.question,
        sceneType: args.sceneType,
        userEntryMode: args.userEntryMode,
        memory,
      });
      const unknowns = args.questionFocus.decisionStructure?.unknowns ?? [];
      const risks = args.questionFocus.decisionStructure?.riskBlindspots ?? [];
      const dimensions = args.questionFocus.decisionStructure?.decisionDimensions.map((item) => item.label) ?? [];
      return {
        residentKey,
        relationToUser: position.relationToUser,
        sceneReason: [
          `${resident.name}本轮不是临时改身份，而是以${resident.role}的长期身份自然卷入。`,
          position.sceneReason,
          memory ? `他会被这段小镇记忆影响：${compactTownContextLine(memory.summary, 80)}` : '',
        ].filter(Boolean).join(' '),
        personalStake: position.personalStake,
        knowsAboutUser: [
          `用户问题大致涉及：${compactTownContextLine(args.question, 64)}`,
          `本轮观察目标：${compactTownContextLine(args.questionFocus.observationGoal, 64)}`,
          ...dimensions.slice(index, index + 2).map((dimension) => `这件事可能和“${dimension}”有关`),
        ].slice(0, 4),
        doesNotKnow: [
          ...unknowns.slice(index, index + 2),
          ...risks.slice(index, index + 1).map((risk) => `用户是否已经意识到：${risk}`),
        ].filter(Boolean).slice(0, 4),
        pressureStyle: position.pressureStyle,
        allowedIntervention: position.allowedIntervention,
      };
    })
    .filter((role): role is SceneResidentRole => Boolean(role));
}

export function hydrateEventPlanResidentPlaceholders<
  T extends {
    eventPlans?: Array<{
      title: string;
      scene: string;
      trigger: string;
      participants: string[];
      questionLink?: string;
      informationGoal?: string;
      judgmentSignal?: string;
      responseOptions?: string[];
    }>;
  },
>(questionFocus: T, selectedResidents: Array<{ name: string }>): T {
  if (!questionFocus.eventPlans?.length || selectedResidents.length === 0) {
    return questionFocus;
  }
  return {
    ...questionFocus,
    eventPlans: questionFocus.eventPlans.map((plan) => ({
      ...plan,
      scene: replaceResidentPlaceholders(plan.scene, selectedResidents),
      trigger: replaceResidentPlaceholders(plan.trigger, selectedResidents),
      participants: plan.participants.map((participant) =>
        replaceResidentPlaceholders(participant, selectedResidents),
      ),
      questionLink: plan.questionLink
        ? replaceResidentPlaceholders(plan.questionLink, selectedResidents)
        : plan.questionLink,
      informationGoal: plan.informationGoal
        ? replaceResidentPlaceholders(plan.informationGoal, selectedResidents)
        : plan.informationGoal,
      judgmentSignal: plan.judgmentSignal
        ? replaceResidentPlaceholders(plan.judgmentSignal, selectedResidents)
        : plan.judgmentSignal,
      responseOptions: plan.responseOptions?.map((option) =>
        replaceResidentPlaceholders(option, selectedResidents),
      ),
    })),
  };
}

function replaceResidentPlaceholders(text: string, selectedResidents: Array<{ name: string }>) {
  return text.replace(/(?:常驻)?居民([A-Z])/g, (_match, letter: string) => {
    const letterIndex = letter.charCodeAt(0) - 'A'.charCodeAt(0);
    const resident = selectedResidents[letterIndex % selectedResidents.length];
    return resident?.name ?? _match;
  });
}

function strongestSceneMemory(
  memories: Array<{
    kind: string;
    salience: number;
    title: string;
    summary: string;
    residentKeys: string[];
    locationKey?: string;
  }>,
  residentKey: string,
  selectedLocationKey: string,
) {
  return memories
    .filter((memory) => memory.residentKeys.includes(residentKey))
    .sort((a, b) => {
      const aLocation = a.locationKey === selectedLocationKey ? 12 : 0;
      const bLocation = b.locationKey === selectedLocationKey ? 12 : 0;
      return b.salience + bLocation - (a.salience + aLocation);
    })[0];
}

function scenePositionForResident(args: {
  index: number;
  resident: {
    name: string;
    role: string;
    traits: string[];
    background: string;
  };
  question: string;
  sceneType: string;
  userEntryMode: UserEntryMode;
  memory?: {
    kind: string;
    title: string;
    summary: string;
  };
}) {
  const text = `${args.question} ${args.sceneType} ${args.resident.role} ${args.resident.traits.join(' ')} ${args.resident.background} ${args.memory?.summary ?? ''}`;
  const futurePartner = /伴侣|找对象|找老婆|女人|共同生活|退休|老家/.test(text);
  if (futurePartner) {
    const positions = [
      {
        relationToUser: '介绍信息来源',
        pressureStyle: '现实提醒',
        sceneReason: '他能提供相亲对象、邻里口碑或共同生活条件方面的信息，但不会替用户下结论。',
        personalStake: '如果他提供的信息太轻率，后续关系出问题会损害他在小镇里的信任。',
        allowedIntervention: '只能从介绍人、邻居或熟人的角度提醒共同生活条件，不知道用户真实择偶底线。',
      },
      {
        relationToUser: '邻里旁观者',
        pressureStyle: '社会评价',
        sceneReason: '他会从小镇邻里看到的相处秩序、家庭边界和生活习惯提出旁观意见。',
        personalStake: '他希望小镇关系不要因为住处、钱或照护责任变成公开矛盾。',
        allowedIntervention: '只能谈自己看到的相处和邻里影响，不能假装知道用户私密想法。',
      },
      {
        relationToUser: '现实条件提醒者',
        pressureStyle: '反对或设边界',
        sceneReason: '他会把钱、住处、健康、家人边界这类容易被浪漫化的问题拉回现实。',
        personalStake: '他不想看到用户因为一时陪伴需要，把长期成本推给周围人。',
        allowedIntervention: '只能提出现实约束和追问条件，不能替用户决定是否找伴侣。',
      },
    ];
    return positions[args.index % positions.length];
  }
  if (/辞职|创业|工作|钱|收入|合同|项目|稳定/.test(text)) {
    const positions = [
      ['现实约束者', '现实提醒', '他会追问收入、合同、退路和时间窗口。', '他不希望小镇关系被一次冲动选择拖进资源压力。'],
      ['机会提供者', '支持但设条件', '他能提供机会线索，但会要求用户说清承担什么代价。', '如果推荐失败，他自己的信誉和资源也会受影响。'],
      ['风险旁观者', '反对', '他会用旧失败或旁观经验提醒用户不要只看理想收益。', '他不想重复见到类似选择导致关系和钱一起紧张。'],
    ][args.index % 3];
    return {
      relationToUser: positions[0],
      pressureStyle: positions[1],
      sceneReason: positions[2],
      personalStake: positions[3],
      allowedIntervention: '只能基于自己知道的工作、钱和小镇经验发问，不知道用户完整财务底牌。',
    };
  }
  if (args.userEntryMode !== 'solo' || /关系|伴侣|朋友|家人|误会|分开|复合|沟通/.test(text)) {
    const positions = [
      ['关系见证者', '支持', '他会注意用户和带入对象如何沟通、是否互相留台阶。', '他希望自己熟悉的小镇关系不要因为误会升级。'],
      ['边界提醒者', '现实提醒', '他会提醒用户把事实、情绪和边界分开说。', '他不想被卷入双方反复拉扯。'],
      ['情绪放大者', '情绪放大', '他会把自己记忆里的类似关系投射进当前判断。', '如果判断错了，他和相关居民的信任也会受影响。'],
    ][args.index % 3];
    return {
      relationToUser: positions[0],
      pressureStyle: positions[1],
      sceneReason: positions[2],
      personalStake: positions[3],
      allowedIntervention: '只能根据现场看到和过去经历提醒，不知道双方完整聊天记录。',
    };
  }
  const fallback = [
    ['信息提供者', '信息提供', '他知道小镇里和这个选择有关的一些现实线索。', '如果信息给错，会影响别人对他的信任。'],
    ['现实提醒者', '现实提醒', '他会把抽象选择落到时间、钱、住处或人情成本。', '他希望小镇日常秩序不要被模糊承诺打乱。'],
    ['旁观者', '社会评价', '他会代表普通邻里对这件事的第一反应。', '他不想被迫站队，但会受结果影响。'],
  ][args.index % 3];
  return {
    relationToUser: fallback[0],
    pressureStyle: fallback[1],
    sceneReason: fallback[2],
    personalStake: fallback[3],
    allowedIntervention: '只能说自己知道和看到的部分，不能替用户补全动机。',
  };
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
  autonomyPlan?: {
    intent: string;
    targetLocationKey?: string;
    socialAppetite: number;
    seekResidentKeys: string[];
    avoidResidentKeys: string[];
    topicSeed: string;
  },
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
      return `和${otherKey}：${compactTownContextLine(relationship.summary, 68)}`;
    });
  const memoryLines = memories
    .filter((memory) => memory.residentKeys.includes(residentKey))
    .sort((a, b) => b.salience - a.salience)
    .slice(0, 3)
    .map((memory) => `${compactTownContextLine(memory.title, 28)}：${compactTownContextLine(memory.summary, 76)}`);
  const planLine = autonomyPlan
    ? [
        `当前短期意图：${compactTownContextLine(autonomyPlan.intent, 52)}`,
        autonomyPlan.targetLocationKey ? `倾向地点：${autonomyPlan.targetLocationKey}` : '',
        autonomyPlan.seekResidentKeys.length ? `更可能靠近：${autonomyPlan.seekResidentKeys.join('、')}` : '',
        autonomyPlan.avoidResidentKeys.length ? `会回避：${autonomyPlan.avoidResidentKeys.join('、')}` : '',
        `话题线索：${compactTownContextLine(autonomyPlan.topicSeed, 62)}`,
      ]
        .filter(Boolean)
        .join('；')
    : '';
  return [...relationLines, ...memoryLines, planLine]
    .filter(Boolean)
    .slice(0, 6)
    .join('\n');
}

function compactTownContextLine(text: string, maxLength: number) {
  return compactAutonomyContext(text, maxLength)
    .replace(/自主互动：/g, '')
    .replace(/反思：/g, '')
    .trim();
}

async function townCounts(ctx: QueryCtx | MutationCtx, townId: Id<'mbtiTownProfiles'>) {
  const [locations, residents, relationships, memories, sceneRequests, conversationRequests, timelineEvents] = await Promise.all([
    ctx.db.query('mbtiTownLocations').withIndex('town', (q) => q.eq('townId', townId)).collect(),
    ctx.db.query('mbtiTownResidents').withIndex('town_status', (q) => q.eq('townId', townId)).collect(),
    ctx.db.query('mbtiRelationships').withIndex('town_resident_a', (q) => q.eq('townId', townId)).collect(),
    ctx.db.query('mbtiTownMemories').withIndex('town_status', (q) => q.eq('townId', townId)).collect(),
    ctx.db.query('mbtiSceneRequests').withIndex('town_time', (q) => q.eq('townId', townId)).collect(),
    ctx.db.query('mbtiTownConversationRequests').withIndex('town_time', (q) => q.eq('townId', townId)).collect(),
    ctx.db.query('mbtiTownTimelineEvents').withIndex('town_time', (q) => q.eq('townId', townId)).collect(),
  ]);
  const residentNameByKey = new Map(residents.map((resident) => [resident.key, resident.name]));
  return {
    counts: {
      locations: locations.length,
      residents: residents.length,
      relationships: relationships.length,
      memories: memories.length,
      sceneRequests: sceneRequests.length,
      timelineEvents: timelineEvents.length,
    },
    observation: {
      timeline: timelineEvents
        .sort((a, b) => b.townDay - a.townDay || b.dayProgress - a.dayProgress || b.createdAt - a.createdAt)
        .slice(0, 8)
        .map((event) => ({
          timelineEventId: event._id,
          townDay: event.townDay,
          phase: event.phase,
          scope: event.scope,
          storyline: event.storyline,
          source: event.source,
          title: event.title,
          summary: event.summary,
          residentNames: event.residentKeys.map((key) => residentNameByKey.get(key) ?? key),
          locationKey: event.locationKey,
          createdAt: event.createdAt,
        })),
      activeResidentPlans: residents
        .filter((resident) => resident.status === 'active' && resident.autonomyPlan)
        .sort((a, b) => (b.autonomyPlan?.updatedAt ?? 0) - (a.autonomyPlan?.updatedAt ?? 0))
        .slice(0, 4)
        .map((resident) => ({
          residentKey: resident.key,
          residentName: resident.name,
          role: resident.role,
          intent: resident.autonomyPlan?.intent ?? '',
          targetLocationKey: resident.autonomyPlan?.targetLocationKey,
          socialAppetite: resident.autonomyPlan?.socialAppetite ?? 0,
          seekResidentNames: resident.autonomyPlan?.seekResidentKeys.map((key) => residentNameByKey.get(key) ?? key) ?? [],
          avoidResidentNames: resident.autonomyPlan?.avoidResidentKeys.map((key) => residentNameByKey.get(key) ?? key) ?? [],
          topicSeed: resident.autonomyPlan?.topicSeed,
          updatedAt: resident.autonomyPlan?.updatedAt ?? 0,
        })),
      pressureRelationships: relationships
        .sort(
          (a, b) =>
            (b.tension + b.influence * 0.35 + b.familiarity * 0.2) -
            (a.tension + a.influence * 0.35 + a.familiarity * 0.2),
        )
        .slice(0, 4)
        .map((relationship) => ({
          relationshipId: relationship._id,
          residentNames: [
            residentNameByKey.get(relationship.residentAKey) ?? relationship.residentAKey,
            residentNameByKey.get(relationship.residentBKey) ?? relationship.residentBKey,
          ],
          familiarity: relationship.familiarity,
          trust: relationship.trust,
          warmth: relationship.warmth,
          tension: relationship.tension,
          influence: relationship.influence,
          summary: relationship.summary,
          lastInteractionAt: relationship.lastInteractionAt,
        })),
      recentMemories: memories
        .sort((a, b) => b.updatedAt - a.updatedAt || b.salience - a.salience)
        .slice(0, 5)
        .map((memory) => ({
          memoryId: memory._id,
          kind: memory.kind,
          salience: memory.salience,
          title: memory.title,
          summary: memory.summary,
          residentNames: memory.residentKeys.map((key) => residentNameByKey.get(key) ?? key),
          locationKey: memory.locationKey,
          sourceKind: memory.sourceKind,
          sourceReason: memory.sourceReason,
          relationshipDelta: memory.relationshipDelta,
          updatedAt: memory.updatedAt,
        })),
      activityStream: buildTownActivityStream({
        memories,
        residentNameByKey,
        limit: 6,
      }),
      conversationRequests: conversationRequests
        .sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt)
        .slice(0, 5)
        .map((request) => ({
          requestId: request._id,
          status: request.status,
          residentNames: request.residentNames,
          locationKey: request.locationKey,
          topicSeed: request.topicSeed,
          priority: request.priority,
          reason: request.reason,
          updatedAt: request.updatedAt,
          startedAt: request.startedAt,
        })),
    },
  };
}

async function deleteTownChildren(ctx: MutationCtx, townId: Id<'mbtiTownProfiles'>) {
  const [locations, residents, relationships, memories, sceneRequests, timelineEvents] = await Promise.all([
    ctx.db.query('mbtiTownLocations').withIndex('town', (q) => q.eq('townId', townId)).collect(),
    ctx.db.query('mbtiTownResidents').withIndex('town_status', (q) => q.eq('townId', townId)).collect(),
    ctx.db.query('mbtiRelationships').withIndex('town_resident_a', (q) => q.eq('townId', townId)).collect(),
    ctx.db.query('mbtiTownMemories').withIndex('town_status', (q) => q.eq('townId', townId)).collect(),
    ctx.db.query('mbtiSceneRequests').withIndex('town_time', (q) => q.eq('townId', townId)).collect(),
    ctx.db.query('mbtiTownTimelineEvents').withIndex('town_time', (q) => q.eq('townId', townId)).collect(),
  ]);
  for (const doc of [...locations, ...residents, ...relationships, ...memories, ...sceneRequests, ...timelineEvents]) {
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
