import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { agentTables } from './agent/schema';
import { aiTownTables } from './aiTown/schema';
import { conversationId, playerId } from './aiTown/ids';
import { engineTables } from './engine/schema';

export default defineSchema({
  music: defineTable({
    storageId: v.string(),
    type: v.union(v.literal('background'), v.literal('player')),
  }),

  messages: defineTable({
    conversationId,
    messageUuid: v.string(),
    author: playerId,
    text: v.string(),
    worldId: v.optional(v.id('worlds')),
  })
    .index('conversationId', ['worldId', 'conversationId'])
    .index('messageUuid', ['conversationId', 'messageUuid']),

  innerThoughts: defineTable({
    worldId: v.id('worlds'),
    playerId,
    text: v.string(),
    source: v.string(),
  }).index('player', ['worldId', 'playerId']),

  socialEvents: defineTable({
    worldId: v.id('worlds'),
    createdAt: v.number(),
    title: v.string(),
    description: v.string(),
    roomName: v.string(),
    participantIds: v.array(playerId),
    mbtiEventId: v.optional(v.id('mbtiEvents')),
    intensity: v.number(),
  })
    .index('by_world_time', ['worldId', 'createdAt'])
    .index('by_world', ['worldId']),

  mbtiExperiments: defineTable({
    createdAt: v.number(),
    updatedAt: v.number(),
    status: v.union(
      v.literal('creating'),
      v.literal('awaiting_user_responses'),
      v.literal('running'),
      v.literal('complete'),
      v.literal('failed'),
    ),
    question: v.string(),
    profile: v.object({
      code: v.string(),
      weights: v.object({
        e: v.number(),
        i: v.number(),
        s: v.number(),
        n: v.number(),
        t: v.number(),
        f: v.number(),
        j: v.number(),
        p: v.number(),
      }),
      behaviors: v.object({
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
      }),
    }),
    rolePresets: v.array(
      v.object({
        enabled: v.boolean(),
        role: v.string(),
        label: v.string(),
        mapping: v.optional(v.string()),
        mbtiCode: v.string(),
        traits: v.string(),
        reason: v.string(),
      }),
    ),
    observation: v.object({
      label: v.string(),
      runCount: v.number(),
      durationMs: v.optional(v.number()),
      targetEventCount: v.optional(v.number()),
    }),
    completedAt: v.optional(v.number()),
    runtimeArchivedAt: v.optional(v.number()),
    report: v.optional(
      v.object({
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
    ),
    worldId: v.id('worlds'),
    engineId: v.id('engines'),
    mapId: v.optional(v.id('maps')),
    townId: v.optional(v.id('mbtiTownProfiles')),
    sceneRequestId: v.optional(v.id('mbtiSceneRequests')),
    questionFocus: v.optional(
      v.object({
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
      }),
    ),
    decisionState: v.optional(v.object({
      updatedAt: v.number(),
      resolvedVariables: v.array(v.string()),
      uncertainVariables: v.array(v.string()),
      confirmedConstraints: v.array(v.string()),
      sensitiveConditions: v.array(v.string()),
      responseCoverage: v.object({
        responded: v.number(),
        required: v.number(),
        missing: v.number(),
      }),
      lastUserCorrection: v.optional(v.string()),
    })),
    agentInputIds: v.array(v.id('inputs')),
    socialField: v.object({
      minimumAgents: v.number(),
      createdRoles: v.array(v.string()),
      eventSeed: v.number(),
    }),
  }).index('createdAt', ['createdAt']),

  mbtiEvents: defineTable({
    experimentId: v.id('mbtiExperiments'),
    worldId: v.id('worlds'),
    createdAt: v.number(),
    tickOffset: v.number(),
    kind: v.union(
      v.literal('pressure'),
      v.literal('opportunity'),
      v.literal('misunderstanding'),
      v.literal('evaluation'),
      v.literal('observer'),
    ),
    title: v.string(),
    description: v.string(),
    involvedRoles: v.array(v.string()),
    testedVariable: v.optional(v.string()),
    testedHypotheses: v.optional(v.array(v.string())),
    questionLink: v.optional(v.string()),
    informationGoal: v.optional(v.string()),
    expectedSignals: v.optional(v.array(v.string())),
    responseOptions: v.optional(v.array(v.string())),
    biasDirection: v.optional(v.union(
      v.literal('balanced'),
      v.literal('supporting'),
      v.literal('challenging'),
    )),
    probeOrigin: v.optional(v.union(
      v.literal('initial'),
      v.literal('adaptive'),
      v.literal('calibration'),
    )),
    adaptiveReason: v.optional(v.string()),
    residentRoles: v.optional(v.array(v.string())),
    residentParticipationGoal: v.optional(v.string()),
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
  })
    .index('experimentId', ['experimentId', 'createdAt'])
    .index('worldId', ['worldId', 'createdAt']),

  mbtiEventEvidence: defineTable({
    experimentId: v.id('mbtiExperiments'),
    mbtiEventId: v.id('mbtiEvents'),
    worldId: v.id('worlds'),
    createdAt: v.number(),
    occurredAt: v.number(),
    kind: v.union(
      v.literal('social_event'),
      v.literal('message'),
      v.literal('behavior'),
      v.literal('thought'),
    ),
    sourceId: v.optional(v.string()),
    participantIds: v.array(playerId),
    summary: v.string(),
    reason: v.string(),
  })
    .index('experiment_event', ['experimentId', 'mbtiEventId', 'createdAt'])
    .index('world_time', ['worldId', 'createdAt'])
    .index('source', ['worldId', 'kind', 'sourceId']),

  mbtiUserResponses: defineTable({
    experimentId: v.id('mbtiExperiments'),
    mbtiEventId: v.id('mbtiEvents'),
    createdAt: v.number(),
    updatedAt: v.number(),
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
    responseStatus: v.union(
      v.literal('responded'),
      v.literal('skipped'),
      v.literal('expired_to_stage_report'),
    ),
  })
    .index('experiment_event', ['experimentId', 'mbtiEventId'])
    .index('experiment_time', ['experimentId', 'createdAt']),

  mbtiBehaviorEvents: defineTable({
    experimentId: v.id('mbtiExperiments'),
    mbtiEventId: v.id('mbtiEvents'),
    worldId: v.id('worlds'),
    createdAt: v.number(),
    playerId,
    label: v.string(),
    description: v.string(),
  })
    .index('experiment_event', ['experimentId', 'mbtiEventId', 'createdAt'])
    .index('world_time', ['worldId', 'createdAt']),

  mbtiTownProfiles: defineTable({
    createdAt: v.number(),
    updatedAt: v.number(),
    slug: v.string(),
    name: v.string(),
    description: v.string(),
    status: v.union(v.literal('active'), v.literal('archived')),
    worldId: v.optional(v.id('worlds')),
  })
    .index('slug', ['slug'])
    .index('status', ['status']),

  mbtiTownLocations: defineTable({
    townId: v.id('mbtiTownProfiles'),
    key: v.string(),
    name: v.string(),
    affordances: v.array(v.string()),
    description: v.string(),
  })
    .index('town_key', ['townId', 'key'])
    .index('town', ['townId']),

  mbtiTownResidents: defineTable({
    townId: v.id('mbtiTownProfiles'),
    key: v.string(),
    name: v.string(),
    role: v.string(),
    mbtiCode: v.string(),
    weights: v.object({
      e: v.number(),
      i: v.number(),
      s: v.number(),
      n: v.number(),
      t: v.number(),
      f: v.number(),
      j: v.number(),
      p: v.number(),
    }),
    traits: v.array(v.string()),
    background: v.string(),
    defaultLocationKey: v.string(),
    scheduleTags: v.array(v.string()),
    status: v.union(v.literal('active'), v.literal('inactive')),
    playerId: v.optional(playerId),
    agentId: v.optional(v.string()),
  })
    .index('town_key', ['townId', 'key'])
    .index('town_status', ['townId', 'status'])
    .index('town_location', ['townId', 'defaultLocationKey']),

  mbtiRelationships: defineTable({
    townId: v.id('mbtiTownProfiles'),
    residentAKey: v.string(),
    residentBKey: v.string(),
    familiarity: v.number(),
    trust: v.number(),
    warmth: v.number(),
    tension: v.number(),
    influence: v.number(),
    summary: v.string(),
    lastInteractionAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index('town_pair', ['townId', 'residentAKey', 'residentBKey'])
    .index('town_resident_a', ['townId', 'residentAKey'])
    .index('town_resident_b', ['townId', 'residentBKey']),

  mbtiTownMemories: defineTable({
    townId: v.id('mbtiTownProfiles'),
    createdAt: v.number(),
    updatedAt: v.number(),
    kind: v.union(
      v.literal('public'),
      v.literal('conflict'),
      v.literal('favor'),
      v.literal('rumor'),
      v.literal('routine'),
      v.literal('scene'),
      v.literal('user'),
    ),
    salience: v.number(),
    title: v.string(),
    summary: v.string(),
    residentKeys: v.array(v.string()),
    locationKey: v.optional(v.string()),
    status: v.union(v.literal('active'), v.literal('stale')),
    staleAt: v.optional(v.number()),
    stalenessReason: v.optional(v.string()),
    sourceSceneRequestId: v.optional(v.id('mbtiSceneRequests')),
  })
    .index('town_status', ['townId', 'status'])
    .index('town_kind', ['townId', 'kind'])
    .index('town_time', ['townId', 'createdAt']),

  mbtiSceneRequests: defineTable({
    townId: v.id('mbtiTownProfiles'),
    createdAt: v.number(),
    updatedAt: v.number(),
    status: v.union(
      v.literal('planned'),
      v.literal('running'),
      v.literal('complete'),
      v.literal('failed'),
    ),
    userQuestion: v.string(),
    userEntryMode: v.union(
      v.literal('solo'),
      v.literal('with_partner'),
      v.literal('with_friend'),
      v.literal('with_partner_and_friend'),
    ),
    sceneType: v.string(),
    selectedLocationKey: v.string(),
    selectedResidentKeys: v.array(v.string()),
    questionFocus: v.optional(
      v.object({
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
      }),
    ),
    selectionRationale: v.array(v.string()),
    ephemeralParticipantKeys: v.array(v.string()),
    worldId: v.optional(v.id('worlds')),
    experimentId: v.optional(v.id('mbtiExperiments')),
    townRelationshipDeltas: v.optional(
      v.array(
        v.object({
          residentAKey: v.string(),
          residentBKey: v.string(),
          trust: v.number(),
          warmth: v.number(),
          tension: v.number(),
          reason: v.string(),
        }),
      ),
    ),
  })
    .index('town_time', ['townId', 'createdAt'])
    .index('town_status', ['townId', 'status']),

  ...agentTables,
  ...aiTownTables,
  ...engineTables,
});
