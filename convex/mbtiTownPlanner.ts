/**
 * Planner actions call the local OpenAI-compatible LLM service. The Convex local
 * V8 runtime can fail to reach Tailscale/local forwarded ports on macOS, so keep
 * these network-heavy actions in the Node runtime.
 */
'use node';

import { v } from 'convex/values';
import { makeFunctionReference } from 'convex/server';
import { action } from './_generated/server';
import { chatCompletion } from './util/llm';

const userEntryMode = v.union(
  v.literal('solo'),
  v.literal('with_partner'),
  v.literal('with_friend'),
  v.literal('with_partner_and_friend'),
);

const startupAnswer = v.object({
  question: v.string(),
  answer: v.string(),
  note: v.optional(v.string()),
});

const validationTargetInput = v.object({
  id: v.string(),
  label: v.string(),
  source: v.union(
    v.literal('decisionDimension'),
    v.literal('unknown'),
    v.literal('hiddenNeed'),
    v.literal('riskBlindspot'),
    v.literal('startupAnswer'),
  ),
  priority: v.union(v.literal('must'), v.literal('should'), v.literal('optional')),
  whatWouldTestIt: v.string(),
  badEventPattern: v.optional(v.string()),
});

const decisionStructureInput = v.object({
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
});

const reasonablenessDiscussionInput = v.object({
  plausibleInterpretation: v.string(),
  whyReasonable: v.array(v.string()),
  possibleMisreads: v.array(v.string()),
  assumptionsToConfirm: v.array(v.string()),
  alternativeFrames: v.array(v.string()),
  discussionPrompt: v.string(),
});

const questionFocusInput = v.object({
  coreQuestion: v.string(),
  drivingTension: v.string(),
  observationGoal: v.string(),
  decisionStructure: v.optional(decisionStructureInput),
  reasonablenessDiscussion: v.optional(reasonablenessDiscussionInput),
  validationTargets: v.optional(v.array(validationTargetInput)),
  analysisDimensions: v.optional(v.array(v.string())),
  designRationale: v.optional(v.string()),
  theoreticalBasis: v.optional(v.array(v.string())),
  evidenceTargets: v.array(v.string()),
  eventBeats: v.array(v.string()),
  startupQuestions: v.optional(v.array(v.object({
    question: v.string(),
    options: v.array(v.string()),
    maxSelections: v.optional(v.number()),
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
    coveredTargetIds: v.optional(v.array(v.string())),
    whyThisTestsIt: v.optional(v.string()),
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

function startupQuestionCountForEvents(targetEventCount: number | undefined) {
  const count = Math.max(1, Math.floor(targetEventCount ?? 6));
  if (count <= 6) {
    return 2;
  }
  if (count <= 12) {
    return 3;
  }
  return Math.min(5, Math.max(4, Math.ceil(count / 5)));
}

export function requiredEventPlanCountForTarget(targetEventCount: number | undefined) {
  const target = Math.max(1, Math.floor(targetEventCount ?? 6));
  if (target <= 1) {
    return 1;
  }
  return Math.min(3, target);
}

type QuestionFocusInput = {
  coreQuestion: string;
  drivingTension: string;
  observationGoal: string;
  decisionStructure?: DecisionStructureInput;
  reasonablenessDiscussion?: ReasonablenessDiscussionInput;
  validationTargets?: ValidationTargetInput[];
  analysisDimensions: string[];
  designRationale: string;
  theoreticalBasis: string[];
  evidenceTargets: string[];
  eventBeats: string[];
  startupQuestions?: Array<{
    question: string;
    options: string[];
    maxSelections?: number;
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
    locationKey?: string;
    scene: string;
    trigger: string;
    participants: string[];
    observationAxis: string;
    questionLink: string;
    informationGoal: string;
    judgmentSignal: string;
    coveredTargetIds?: string[];
    whyThisTestsIt?: string;
    responseOptions?: string[];
    stakes?: EventStakesInput;
    consequenceOptions?: EventConsequenceOptionInput[];
  }>;
  resolutionCriteria: string;
};

type ValidationTargetInput = {
  id: string;
  label: string;
  source: 'decisionDimension' | 'unknown' | 'hiddenNeed' | 'riskBlindspot' | 'startupAnswer';
  priority: 'must' | 'should' | 'optional';
  whatWouldTestIt: string;
  badEventPattern?: string;
};

type ReasonablenessDiscussionInput = {
  plausibleInterpretation: string;
  whyReasonable: string[];
  possibleMisreads: string[];
  assumptionsToConfirm: string[];
  alternativeFrames: string[];
  discussionPrompt: string;
};

type EventStakesInput = {
  timeCost?: string;
  moneyCost?: string;
  relationshipCost?: string;
  opportunityCost?: string;
};

type EventConsequenceOptionInput = {
  userAction: string;
  relationshipDelta: string;
  unlocks: string;
};

type DecisionStructureInput = {
  surfaceQuestion: string;
  underlyingDecision: string;
  decisionDimensions: Array<{
    label: string;
    whyItMatters: string;
    userBlindSpot?: string;
  }>;
  personalityLevers: string[];
  unknowns: string[];
  hiddenNeeds: string[];
  riskBlindspots: string[];
  possiblePaths: Array<{
    label: string;
    whenLikely: string;
    possibleResult: string;
  }>;
  changeConditions: string[];
  nextValidationQuestions: string[];
};

type PlanningAttemptResult = {
  plannedFocus: QuestionFocusInput | null;
  issues: string[];
};

type StartupAnswerInput = {
  question: string;
  answer: string;
  note?: string;
};

type AuthenticityFeedbackInput = {
  feedbackType?: 'user_reaction' | 'unrealistic_event' | 'unrealistic_person' | 'hit_real_issue' | 'condition_correction';
  question?: string;
  eventTitle?: string;
  selectedOption?: string;
  freeText?: string;
  correctionText?: string;
};

const eventLocationOptions = [
  { key: 'school', label: '旧校舍', keywords: /孩子|子女|教育|继父|继母|抚养|上学|家长|晚辈|家庭责任/ },
  { key: 'clinic', label: '白榆诊所', keywords: /健康|照护|身体|病|药|医院|体检|复诊|睡眠|血压|生病/ },
  { key: 'shop', label: '商店', keywords: /钱|费用|账单|消费|退休金|收入|工资|存款|开销|买|采购|垫付/ },
  { key: 'station', label: '车站', keywords: /回岳阳|老家|车票|出发|离开|两地|迁移|长沙|时间表|行李|春节/ },
  { key: 'office', label: '社区办公室', keywords: /房产|住处|登记|规则|证明|合同|手续|责任|边界|财产|医保|社区/ },
  { key: 'workshop', label: '修理工坊', keywords: /维修|修理|家电|房子|漏水|装修|物件|工具|家务|处理能力/ },
  { key: 'cafe', label: '晨桥咖啡馆', keywords: /相亲|见面|聊天|介绍|回复|消息|关系|情绪|陪伴|误会|承诺|约定/ },
  { key: 'square', label: '钟楼广场', keywords: /邻里|公开|评价|面子|圈子|融入|旁观|社交|亲戚|熟人|社区/ },
] as const;

type EventLocationKey = (typeof eventLocationOptions)[number]['key'];

type QuestionFocusInputPayload = Omit<
  QuestionFocusInput,
  'analysisDimensions' | 'designRationale' | 'theoreticalBasis' | 'eventPlans'
> & {
  analysisDimensions?: string[];
  designRationale?: string;
  theoreticalBasis?: string[];
  eventPlans?: unknown;
};

export const planStartupQuestions = action({
  args: {
    question: v.string(),
    targetEventCount: v.optional(v.number()),
  },
  handler: async (_ctx, args) => {
    const requiredStartupQuestionCount = startupQuestionCountForEvents(args.targetEventCount);
    const planningResult = await planQuestionSkeletonWithRetries(
      args.question,
      requiredStartupQuestionCount,
      3,
    );
    const plannedFocus = planningResult.plannedFocus;
    if (
      !plannedFocus ||
      !plannedFocus.startupQuestions ||
      plannedFocus.startupQuestions.length < requiredStartupQuestionCount
    ) {
      const issueText = planningResult.issues.length > 0
        ? `失败原因：${planningResult.issues.join(' | ')}。`
        : '';
      throw new Error(`启动前关键问题连续生成 3 次仍失败：本轮需要 ${requiredStartupQuestionCount} 个合格关键问题，不会使用兜底模板。${issueText}请检查本地模型服务是否稳定，或调整问题后再进入。`);
    }
    return {
      plannedFocus,
      requiredStartupQuestionCount,
    };
  },
});

export const planAndCreateSceneRequest = action({
  args: {
    townId: v.optional(v.id('mbtiTownProfiles')),
    question: v.string(),
    targetEventCount: v.optional(v.number()),
    userEntryMode,
    plannedFocus: v.optional(questionFocusInput),
    startupAnswers: v.optional(v.array(startupAnswer)),
  },
  handler: async (ctx, args) => {
    const requiredStartupQuestionCount = startupQuestionCountForEvents(args.targetEventCount);
    const requiredEventPlanCount = requiredEventPlanCountForTarget(args.targetEventCount);
    const skeleton = args.plannedFocus?.startupQuestions?.length
      ? stripEventPlans(args.plannedFocus)
      : (await planQuestionSkeletonWithRetries(args.question, requiredStartupQuestionCount, 3)).plannedFocus;
    if (
      !skeleton ||
      !skeleton.startupQuestions ||
      skeleton.startupQuestions.length < requiredStartupQuestionCount
    ) {
      throw new Error(`启动前关键问题不存在或不合格：本轮需要 ${requiredStartupQuestionCount} 个关键问题，不会使用兜底模板。`);
    }
    const answers = cleanStartupAnswers(args.startupAnswers, skeleton.startupQuestions);
    const runVariant = stablePlanningVariant({
      question: args.question,
      targetEventCount: args.targetEventCount,
      userEntryMode: args.userEntryMode,
      startupAnswers: answers,
    });
    const validationTargets = buildValidationTargets(skeleton, answers, requiredEventPlanCount);
    const targetSkeleton = {
      ...skeleton,
      validationTargets,
    };
    const authenticityFeedback = await ctx.runQuery(makeFunctionReference<'query'>('mbti:collectTownAuthenticityFeedback'), {
      townId: args.townId,
      question: args.question,
    }) as AuthenticityFeedbackInput[];
    const planningResult = await planQuestionEventsWithRetries(
      args.question,
      targetSkeleton,
      answers,
      requiredEventPlanCount,
      3,
      runVariant,
      authenticityFeedback,
    );
    const plannedFocus = planningResult.plannedFocus
      ? {
          ...planningResult.plannedFocus,
          startupQuestions: skeleton.startupQuestions,
          validationTargets,
        }
      : null;
    if (
      !plannedFocus ||
      !plannedFocus.eventPlans ||
      plannedFocus.eventPlans.length < requiredEventPlanCount
    ) {
      const issueText = planningResult.issues.length > 0
        ? `失败原因：${planningResult.issues.join(' | ')}。`
        : '';
      throw new Error(`基于启动前回应生成情境探针连续 3 次仍失败：启动阶段只需要 ${requiredEventPlanCount} 个合格种子事件，后续事件会随时间线和证据动态生成，不会使用兜底模板。${issueText}请检查本地模型服务是否稳定，或调整问题后再进入。`);
    }
    return await ctx.runMutation(makeFunctionReference<'mutation'>('mbtiTown:createSceneRequest'), {
      townId: args.townId,
      question: args.question,
      userEntryMode: args.userEntryMode,
      plannedFocus,
    });
  },
});

async function planQuestionSkeletonWithRetries(
  question: string,
  requiredStartupQuestionCount: number,
  maxAttempts: number,
) {
  const attemptIssues: string[] = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let result: PlanningAttemptResult;
    try {
      result = await planQuestionSkeleton(question, attempt, requiredStartupQuestionCount);
    } catch (error) {
      result = {
        plannedFocus: null,
        issues: [error instanceof Error ? `模型调用或解析异常：${error.message}` : '模型调用或解析异常'],
      };
    }
    const plannedFocus = result.plannedFocus;
    if (
      plannedFocus?.startupQuestions &&
      plannedFocus.startupQuestions.length >= requiredStartupQuestionCount
    ) {
      return { plannedFocus, issues: attemptIssues };
    }
    const readableIssues = result.issues.length > 0 ? result.issues.join('；') : '未生成足够合格内容';
    attemptIssues.push(`第 ${attempt} 次：${readableIssues}`);
    console.warn(`MBTI probe planning attempt ${attempt}/${maxAttempts} failed: ${readableIssues}`);
  }
  return { plannedFocus: null, issues: attemptIssues.slice(-3) };
}

async function planQuestionEventsWithRetries(
  question: string,
  skeleton: QuestionFocusInput,
  startupAnswers: StartupAnswerInput[],
  requiredEventPlanCount: number,
  maxAttempts: number,
  runVariant: string,
  authenticityFeedback: AuthenticityFeedbackInput[],
) {
  const attemptIssues: string[] = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const acceptedPlans: NonNullable<QuestionFocusInput['eventPlans']> = [];
    const batchIssues: string[] = [];
    for (let batch = 1; batch <= 3 && acceptedPlans.length < requiredEventPlanCount; batch += 1) {
      let eventResult: { eventPlans?: NonNullable<QuestionFocusInput['eventPlans']>; issues: string[] };
      const candidateCount = eventPlanCandidateCountForBatch(requiredEventPlanCount, acceptedPlans.length, batch);
      try {
        eventResult = await planQuestionEvents(
          question,
          attempt,
          requiredEventPlanCount,
          skeleton,
          startupAnswers,
          runVariant,
          authenticityFeedback,
          {
            batch,
            candidateCount,
            existingPlans: acceptedPlans,
          },
        );
      } catch (error) {
        eventResult = {
          issues: [error instanceof Error ? `模型调用或解析异常：${error.message}` : '模型调用或解析异常'],
        };
      }
      if (eventResult.eventPlans?.length) {
        acceptedPlans.splice(
          0,
          acceptedPlans.length,
          ...mergeDistinctEventPlans(acceptedPlans, eventResult.eventPlans),
        );
      }
      if (eventResult.issues.length > 0) {
        batchIssues.push(`批次 ${batch}：${eventResult.issues.join('；')}`);
      }
    }
    if (acceptedPlans.length >= requiredEventPlanCount) {
      return {
        plannedFocus: {
          ...skeleton,
          eventPlans: limitEventPlansToRequired(acceptedPlans, requiredEventPlanCount),
        },
        issues: attemptIssues,
      };
    }
    const readableIssues = batchIssues.length > 0
      ? `${batchIssues.join('；')}；累计合格 ${acceptedPlans.length}/${requiredEventPlanCount}`
      : `累计合格 ${acceptedPlans.length}/${requiredEventPlanCount}`;
    attemptIssues.push(`第 ${attempt} 次：${readableIssues}`);
    console.warn(`MBTI answered probe planning attempt ${attempt}/${maxAttempts} failed: ${readableIssues}`);
  }
  return { plannedFocus: null, issues: attemptIssues.slice(-3) };
}

export function eventPlanCandidateCountForBatch(
  requiredEventPlanCount: number,
  acceptedCount: number,
  batch: number,
) {
  const missing = Math.max(0, requiredEventPlanCount - acceptedCount);
  if (batch <= 1) {
    return Math.min(6, Math.max(requiredEventPlanCount + 1, 3));
  }
  return Math.min(6, Math.max(missing + 2, 3));
}

export function mergeDistinctEventPlans(
  existingPlans: NonNullable<QuestionFocusInput['eventPlans']>,
  newPlans: NonNullable<QuestionFocusInput['eventPlans']>,
) {
  const merged: NonNullable<QuestionFocusInput['eventPlans']> = [];
  const seenTitles = new Set<string>();
  const seenFingerprints = new Set<string>();
  for (const plan of [...existingPlans, ...newPlans]) {
    const titleKey = normalizeEventTitleForMerge(plan.title);
    const fingerprint = eventTitleFingerprint(plan.title);
    if (titleKey && seenTitles.has(titleKey)) {
      continue;
    }
    if (fingerprint && seenFingerprints.has(fingerprint)) {
      continue;
    }
    merged.push(plan);
    if (titleKey) {
      seenTitles.add(titleKey);
    }
    if (fingerprint) {
      seenFingerprints.add(fingerprint);
    }
  }
  return merged.slice(0, 20);
}

export function limitEventPlansToRequired(
  plans: NonNullable<QuestionFocusInput['eventPlans']>,
  requiredEventPlanCount: number,
) {
  return plans.slice(0, Math.max(0, requiredEventPlanCount));
}

async function planQuestionSkeleton(
  question: string,
  attempt: number,
  requiredStartupQuestionCount: number,
): Promise<PlanningAttemptResult> {
  const { content } = await chatCompletion({
    messages: [
      {
        role: 'system',
        content: [
          '你是 MBTI 小镇的入镇前问题拆解器。',
          '你的任务只做第一段：先把用户现实问题拆成“决策结构”，再生成观察维度和启动前必须问用户的关键问题。',
          '不要假装预测用户问题的答案。你要帮助系统看清：用户真正要做的选择、哪些变量会影响结果、哪些需求或风险用户可能还没意识到、下一步该验证什么。',
          '这套拆解必须适用于任意问题，不能依赖题库模板；即使问题看似简单，也要拆成真实决策、关键未知、隐藏需求、风险盲点和验证路径。',
          '不要生成 eventPlans。不要写角色台词。不要写咨询师建议。只输出 JSON。',
          'decisionStructure 是后续事件和最终报告的主轴，必须具体、完整、贴近原问题，不要只写“沟通、情绪、行动力”这类空泛词。',
          'reasonablenessDiscussion 必须单独讨论“系统这样理解用户问题是否合理”：说明合理之处、可能误读、需要向用户确认的假设，以及另一种可行拆解方式。',
          'decisionStructure 必须达到最低数量：decisionDimensions 6-10 个，personalityLevers 3-8 个，unknowns 4-10 个，hiddenNeeds 3-8 个，riskBlindspots 3-8 个，possiblePaths 2-6 个，changeConditions 3-8 个，nextValidationQuestions 3-8 个。不要只给 2-3 条。',
          '拆解维度必须覆盖现实属性，不只覆盖心理属性。根据问题相关性纳入：年龄/阶段、外貌或吸引力、身体健康、金钱、住处、家庭责任、法律/身份、时间精力、社会评价、长期退出成本等具体变量。',
          'startupQuestions 必须直白、生活化、能马上回答，必须直接服务用户原问题。',
          'startupQuestions 不能出现“信息不足时的反应、标准构建方式、行动导向、资源评估、情绪稳定性、现实检验能力”等分析术语。',
          'startupQuestions 的选项必须每题不同、具体、互斥，不能使用“稳住基本盘、争取自主、过渡方案”等抽象策略词。',
          '如果 startupQuestions 问的是“三件事、两件事、几个、哪些、优先级清单”等复数答案，必须设置 maxSelections 为对应数量或 3；选项必须是可组合的具体事项。',
          '如果问题只让用户选一种倾向，maxSelections 省略或设为 1。',
          '如果用户问题涉及尚未确定的对象或未来关系，不要把对象当成既成事实；问题应先补齐用户真实标准、边界和现实条件。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `用户问题：${question}`,
          `生成尝试：第 ${attempt} 次。请生成正好 ${requiredStartupQuestionCount} 个合格 startupQuestions。`,
          '输出 JSON 字段：',
          '{',
          '  "drivingTension": "一句自然的处境张力，不直接复述用户问题",',
          '  "observationGoal": "系统要观察的行为倾向",',
          '  "decisionStructure": {',
          '    "surfaceQuestion": "用户表面在问什么",',
          '    "underlyingDecision": "用户真正要做的选择或取舍",',
          '    "decisionDimensions": [',
          '      { "label": "必须判断的现实维度，至少 6 个", "whyItMatters": "为什么会影响结果", "userBlindSpot": "用户可能忽略或没说出口的点" }',
          '    ],',
          '    "personalityLevers": ["用户人格或决策倾向会放大/压低哪些变量"],',
          '    "unknowns": ["现在不知道但会强烈影响判断的现实信息"],',
          '    "hiddenNeeds": ["用户可能没直接说出口但可能在保护或追求的需求"],',
          '    "riskBlindspots": ["用户可能低估的风险、成本或反例"],',
          '    "possiblePaths": [',
          '      { "label": "一种可能走向", "whenLikely": "什么条件下更可能", "possibleResult": "可能带来的结果" }',
          '    ],',
          '    "changeConditions": ["哪些条件变化会改变判断"],',
          '    "nextValidationQuestions": ["下一步应该向用户或现实生活验证的具体问题"]',
          '  },',
          '  "reasonablenessDiscussion": {',
          '    "plausibleInterpretation": "一句话说明系统当前如何理解用户真正关心的事",',
          '    "whyReasonable": ["2-4 条说明为什么这种理解站得住脚"],',
          '    "possibleMisreads": ["2-4 条说明系统可能误读或过度推断了什么"],',
          '    "assumptionsToConfirm": ["2-4 个需要和用户确认的关键假设"],',
          '    "alternativeFrames": ["1-3 种也合理的替代拆解角度"],',
          '    "discussionPrompt": "一句适合展示给用户、邀请其修正拆解的问题"',
          '  },',
          '  "analysisDimensions": ["6-10 个从用户问题拆出的不同观察维度，写生活化，不要写抽象术语"],',
          '  "designRationale": "1-2 句话说明为什么这些问题和后续事件能服务原问题",',
          '  "theoreticalBasis": ["2-4 个简短依据，如：压力应对、亲密关系匹配、生活方式兼容"],',
          '  "evidenceTargets": ["3-5 个后续要从聊天/事件/行动中观察的证据方向"],',
          '  "eventBeats": ["3-5 个后续适合转成小镇事件的触发点"],',
          '  "startupQuestions": [',
          '    { "question": "一句直白生活化问题", "options": ["3-4 个具体回答"], "maxSelections": 1 }',
          '  ],',
          '  "outcomeHypotheses": [',
          '    {',
          '      "label": "短标签",',
          '      "plainConclusion": "生活化结论",',
          '      "supportSignals": ["支持这个结论的表现"],',
          '      "weakSignals": ["削弱这个结论的表现"]',
          '    }',
          '  ],',
          '  "resolutionCriteria": "形成倾向性结论至少需要看到什么"',
          '}',
        ].join('\n'),
      },
    ],
    temperature: 0.2,
    timeoutMs: 180_000,
  });
  const parsed = parsePlannerJson(content);
  if (!parsed) {
    return { plannedFocus: null, issues: ['模型输出不是可解析 JSON'] };
  }
  const analysisDimensions = cleanPlannerList(parsed.analysisDimensions, [], 6, 10, 64);
  const theoreticalBasis = cleanPlannerList(parsed.theoreticalBasis, [], 2, 4, 28);
  const evidenceTargets = cleanPlannerList(parsed.evidenceTargets, [], 3, 5, 80);
  const eventBeats = cleanPlannerList(parsed.eventBeats, [], 3, 5, 80);
  const drivingTension = cleanRequiredString(parsed.drivingTension, 180);
  const observationGoal = cleanRequiredString(parsed.observationGoal, 180);
  const decisionStructure = cleanDecisionStructure(parsed.decisionStructure);
  const reasonablenessDiscussion = cleanReasonablenessDiscussion(parsed.reasonablenessDiscussion);
  const designRationale = cleanRequiredString(parsed.designRationale, 220);
  const resolutionCriteria = cleanRequiredString(parsed.resolutionCriteria, 180);
  const startupQuestions = cleanStartupQuestions(parsed.startupQuestions, requiredStartupQuestionCount);
  const outcomeHypotheses = cleanOutcomeHypotheses(parsed.outcomeHypotheses, question);
  const issues: string[] = [];
  if (analysisDimensions.length < 6) {
    issues.push(`观察维度不足：需要 6-10 个，实际 ${analysisDimensions.length} 个`);
  }
  if (theoreticalBasis.length < 2) {
    issues.push(`理论依据不足：需要 2-4 个，实际 ${theoreticalBasis.length} 个`);
  }
  if (evidenceTargets.length < 3) {
    issues.push(`证据方向不足：需要 3-5 个，实际 ${evidenceTargets.length} 个`);
  }
  if (eventBeats.length < 3) {
    issues.push(`事件触发点不足：需要 3-5 个，实际 ${eventBeats.length} 个`);
  }
  if (!drivingTension) {
    issues.push('缺少 drivingTension');
  }
  if (!observationGoal) {
    issues.push('缺少 observationGoal');
  }
  if (!decisionStructure) {
    issues.push('缺少合格 decisionStructure：需要真实决策、至少 5 个维度、关键未知、隐藏需求、风险盲点和验证问题');
  }
  if (!reasonablenessDiscussion) {
    issues.push('缺少 reasonablenessDiscussion：需要讨论拆解为何合理、可能误读、待确认假设和替代拆解');
  }
  if (!designRationale) {
    issues.push('缺少 designRationale');
  }
  if (!resolutionCriteria) {
    issues.push('缺少 resolutionCriteria');
  }
  if (!startupQuestions || startupQuestions.length < requiredStartupQuestionCount) {
    const rawCount = Array.isArray(parsed.startupQuestions) ? parsed.startupQuestions.length : 0;
    issues.push(`启动前关键问题不合格：需要 ${requiredStartupQuestionCount} 个，原始 ${rawCount} 个`);
  }
  if (!outcomeHypotheses || outcomeHypotheses.length < 2) {
    const rawCount = Array.isArray(parsed.outcomeHypotheses) ? parsed.outcomeHypotheses.length : 0;
    issues.push(`候选结论不足：需要至少 2 个，原始 ${rawCount} 个`);
  }
  if (issues.length > 0) {
    return { plannedFocus: null, issues };
  }
  return {
    plannedFocus: {
      coreQuestion: question,
      drivingTension: drivingTension!,
      observationGoal: observationGoal!,
      decisionStructure,
      reasonablenessDiscussion,
      analysisDimensions,
      designRationale: designRationale!,
      theoreticalBasis,
      evidenceTargets,
      eventBeats,
      startupQuestions,
      outcomeHypotheses,
      resolutionCriteria: resolutionCriteria!,
    },
    issues: [],
  };
}

async function planQuestionEvents(
  question: string,
  attempt: number,
  requiredEventPlanCount: number,
  skeleton: QuestionFocusInput,
  startupAnswers: StartupAnswerInput[],
  runVariant: string,
  authenticityFeedback: AuthenticityFeedbackInput[],
  batchOptions?: {
    batch: number;
    candidateCount: number;
    existingPlans: NonNullable<QuestionFocusInput['eventPlans']>;
  },
): Promise<{ eventPlans?: NonNullable<QuestionFocusInput['eventPlans']>; issues: string[] }> {
  const batch = batchOptions?.batch ?? 1;
  const candidateCount = batchOptions?.candidateCount ?? 20;
  const existingPlans = batchOptions?.existingPlans ?? [];
  const existingPlanText = existingPlans.length > 0
    ? existingPlans
        .map((plan, index) => `${index + 1}. ${plan.title}｜${plan.locationKey ?? 'unknown'}｜${compactPromptText(plan.trigger, 80)}`)
        .join('\n')
    : '暂无已接受事件。';
  const startupAnswerText = startupAnswers
    .map((answer, index) => {
      const note = answer.note ? `；补充：${answer.note}` : '';
      return `${index + 1}. ${answer.question} => ${answer.answer}${note}`;
    })
    .join('\n') || '用户尚未回答启动前校准。请生成低假设、可观察、可延迟的扰动候选，不要把模拟反应当作用户真实回答。';
  const validationTargetText = formatValidationTargetsForPrompt(skeleton.validationTargets);
  const authenticityFeedbackText = formatAuthenticityFeedbackForPrompt(authenticityFeedback);
  const rejectedAuthenticityPatternText = formatRejectedAuthenticityPatterns(authenticityFeedback);
  const { content } = await chatCompletion({
      messages: [
        {
          role: 'system',
          content: [
            '你是 MBTI 小镇的情境探针设计器。',
            '这是第二段：第一段的问题拆解和启动前关键问题已经合格。你只需要生成 eventPlans。',
            'eventPlans 必须服务 decisionStructure：每个事件至少测试一个 decisionDimensions、unknowns、hiddenNeeds 或 riskBlindspots。不要把事件设计成预测答案，而要制造可观察证据，帮助用户发现可能结果和自己没意识到的变量。',
            'eventPlans 必须声明 coveredTargetIds 和 whyThisTestsIt。coveredTargetIds 只能使用本轮验证目标里的 id；whyThisTestsIt 必须解释这个具体事件如何测试该目标。',
            '首批/本批合格事件必须覆盖所有 priority=must 的验证目标；如果一个 must 目标无法设计成真实事件，宁可重写事件，不要省略 coveredTargetIds。',
            '你必须把用户的启动前真实回答作为事件设计的方向盘：事件的主题、顺序、强度和冲突点都要受这些回答影响。',
            '如果用户回答表达了偏好、底线、不能接受的条件或生活方式，前几个事件必须直接测试这些偏好和底线。',
            '如果事件里出现了用户没有声明过的既成事实、人物关系、生活条件、资源状态或限制条件，必须先把它改成待验证情境，不能当作真实背景。',
            '不要生成与启动前回答无关的事件；不要把回答只当背景文字。',
            '事件必须像用户现实生活里会发生的一幕，而不是小镇设施的任务清单。先从用户处境推导真实生活压力，再把它放进小镇地点。',
            '标题必须写本次用户问题里的核心生活变量，不要写成设施名加普通事务。',
            'trigger 必须包含来自用户问题或启动前回答的具体生活锚点，不能只写成泛泛的办事、等待、咨询或闲聊。',
            '每个事件必须写清现实代价 stakes，至少包含时间、钱、关系、机会中的一种；没有代价的事件不要输出。',
            '每个事件必须写 consequenceOptions，说明不同用户行动会怎样改变关系、关闭/打开什么后续机会。不要写“无明显影响”。',
            '地点只能写地图上已有且能稳定渲染和导航的设施：晨桥咖啡馆、钟楼广场、白榆诊所、旧校舍、修理工坊、社区办公室、车站、商店。不要写河边步道、公寓走廊、市集、图书馆、地铁站、餐厅等当前地图没有完整承载的地点。',
            '每个 eventPlan 必须输出 locationKey，只能是 cafe, square, clinic, school, workshop, office, station, shop 之一，并且必须和 scene 里的地点一致。',
            '如果历史真实性反馈指出“事件不像真实生活”或“人不像真实的人”，下一轮必须显式避开同类假感：不要复用被指出的标题、事务类型、人物知道太多、居民像咨询师发言、无代价的设施任务等模式。',
            '如果历史反馈补充了现实条件，必须把这些条件当作硬约束写入事件触发点，而不是继续生成泛泛的办事/咨询事件。',
            '如果历史反馈指出某个点确实戳中用户，下一轮可以围绕同一现实变量加深，但必须换地点、换阻断方式、换居民社会位置，不能重复上一轮事件。',
            '不要输出抽象观察名；要输出具体生活场景。只有用户在原题或启动前回答里明确带入某类对象时，才允许把这个对象写入事件；否则人物只能使用“我”和常驻居民占位符，不能替用户发明既有关系。',
            'eventPlans 必须包含不同强度：日常/中等/重大。首批候选建议约半数日常、三分之一中等、至少 1 个重大或准重大；补批次优先补首批缺少的生活域。不要全部是同一种小阻碍。',
            '所有事件都必须动态生成，不能套固定模板。日常、中等、重大都要根据本次用户问题、关键对象关系、常驻居民性格、地图设施和当前观察维度来创造。',
            '重大事件不是固定清单，也不是随机灾难。它应当是“如果这个用户问题继续发展，现实中可能出现的高后果场景”：关系、钱、身体、安全、住处、身份资格、工作学业、关键机会、家庭责任等，具体选哪一种必须由用户问题和角色关系推导。',
            '中等事件应当明显比普通小阻碍更有压力，例如影响承诺、时间窗口、他人评价、资源归属、责任分配或短期生活安排；日常事件则用于观察轻微打断下的自然反应。三种强度都要具体、生活化、可进入聊天。',
            'trigger 必须是可直接进入聊天的一幕，包含：用户原本要做什么、哪个具体信息或约定卡住了、谁给出什么具体限制。不要只写模糊阻碍。',
            '如果用户问题涉及某类关系、职业、钱、健康、住处、身份或长期计划，eventPlans 必须围绕这个问题自身的现实变量设计，不要替换成无关的小事务。',
            '如果用户是在考虑未来可能性，只能把相关对象写成待验证、待认识、待选择或待确认的对象，不能写成已经存在的事实。',
            'eventPlans 必须尽可能离散：每个事件绑定一个不同 analysisDimensions 维度，并使用不同地点细分、不同阻断类型。不要连续使用同一母题。',
            '本轮入镇有一个稳定指纹。相同用户问题、启动回答和观察规模应保持核心事件轴稳定；只能在措辞和居民生活细节上有小幅变化，避免同题重复演化得出相反结论。',
            '前 8 个事件必须覆盖多个与本题相关的生活域，不要把事件都写成同一种普通事务。',
            `eventPlans 本批只输出 ${candidateCount} 个候选事件，宁可少而具体，不要为了凑数输出设施任务。`,
            'eventPlans 的 observationAxis 必须逐项对应 analysisDimensions 中的不同条目；首批事件不要重复 observationAxis，补批次优先使用尚未覆盖的 observationAxis。',
            '如果这是补批次，必须避开已接受事件的标题、触发物、生活变量和地点组合，不能把已接受事件改写一遍。',
            'startupQuestions 和 eventPlans 必须来自本次问题和启动前回答，不要把任何对象、关系或条件默认成事实。',
            '不要写角色台词，不要写咨询师建议，不要让小镇居民知道原题。',
            '只输出 JSON，不要 markdown。',
          ].join('\n'),
        },
        {
          role: 'user',
          content: [
            `用户问题：${question}`,
            `生成尝试：第 ${attempt} 次，第 ${batch} 批。启动阶段只需要 ${requiredEventPlanCount} 个合格种子事件，后续事件会根据已发生证据动态生成；本批请输出 ${candidateCount} 个候选。`,
            `本轮入镇稳定指纹：${runVariant}`,
            `已接受事件，补批次必须避开：\n${existingPlanText}`,
            `已经合格的观察维度：${skeleton.analysisDimensions.join('；')}`,
            `问题结构：${formatDecisionStructureForPrompt(skeleton.decisionStructure)}`,
            `本轮验证目标：\n${validationTargetText}`,
            `观察目标：${skeleton.observationGoal}`,
            `证据方向：${skeleton.evidenceTargets.join('；')}`,
            `事件触发点：${skeleton.eventBeats.join('；')}`,
            `用户启动前真实回答：\n${startupAnswerText}`,
            `历史真实性校准反馈：\n${authenticityFeedbackText}`,
            `本轮必须避开的历史假感模式：\n${rejectedAuthenticityPatternText}`,
            '输出字段：',
            '{',
            '  "eventPlans": [',
            '    {',
            '      "title": "短标题，必须来自本次用户问题的关键变量，不要照抄示例",',
            '      "severity": "日常/中等/重大",',
            '      "locationKey": "cafe/square/clinic/school/workshop/office/station/shop 之一",',
            '      "scene": "具体地图设施和人物，如：社区办公室里，我和常驻居民A正在处理与本问题相关的现实条件；只有用户显式带入对象时才可写关键对象",',
            '      "trigger": "发生的具体事，必须直接测试本次问题的关键变量；不要写与原问题弱相关的通用小阻碍",',
            '      "participants": ["我", "常驻居民A"],',
            '      "observationAxis": "这个事件对应哪个观察维度，如：情绪调节",',
            '      "questionLink": "说明它和用户原问题的逻辑关系，如：模拟计划被外部波动打断后是否还能恢复行动",',
            '      "informationGoal": "这个事件为了看什么，如：看我会不会直接表达不安",',
            '      "judgmentSignal": "什么表现可用于判断，如：追问且能说清需求偏修复；冷处理或离开偏回避",',
            '      "coveredTargetIds": ["必须覆盖的验证目标 id；至少 1 个"],',
            '      "whyThisTestsIt": "说明这个具体事件如何测试 coveredTargetIds 对应目标，不能只复述目标名",',
            '      "responseOptions": ["3-4 个第一人称、具体、互斥的真实行动选项；必须围绕本事件，不要写抽象策略词，如不要写稳住基本盘"],',
            '      "stakes": { "timeCost": "时间代价", "moneyCost": "金钱代价", "relationshipCost": "关系代价", "opportunityCost": "机会代价" },',
            '      "consequenceOptions": [',
            '        { "userAction": "一种具体用户行动", "relationshipDelta": "这会让谁更信任/更警惕/更失望", "unlocks": "这会打开或关闭哪个后续条件" }',
            '      ]',
            '    }',
            '  ]',
            '}',
          ].join('\n'),
        },
      ],
      temperature: 0.25,
      timeoutMs: 180_000,
    });
  const parsed = parsePlannerJson(content);
  if (!parsed) {
      return { issues: ['模型输出不是可解析 JSON'] };
  }
  const eventPlans = cleanEventPlans(parsed.eventPlans, skeleton.analysisDimensions, skeleton.validationTargets);
  if (!eventPlans || eventPlans.length === 0) {
    const rawCount = Array.isArray(parsed.eventPlans) ? parsed.eventPlans.length : 0;
    return { issues: [`本批没有合格事件：原始 ${rawCount} 个`] };
  }
  const answerAlignedEventPlans = await filterEventPlansByStartupAnswers(eventPlans, startupAnswers, question);
  if (answerAlignedEventPlans.length === 0) {
    return { issues: ['本批事件都与启动前回答冲突，已过滤'] };
  }
  const filteredEventPlans = filterEventPlansByAuthenticityFeedback(answerAlignedEventPlans, authenticityFeedback);
  if (filteredEventPlans.length === 0) {
    return { issues: ['本批事件都命中了历史假感反馈，已过滤'] };
  }
  const merged = mergeDistinctEventPlans(existingPlans, filteredEventPlans);
  const addedCount = merged.length - existingPlans.length;
  return {
    eventPlans: filteredEventPlans,
    issues: addedCount > 0 ? [] : ['本批事件与已接受事件重复，未增加新事件'],
  };
}

function stablePlanningVariant(args: {
  question: string;
  targetEventCount: number | undefined;
  userEntryMode: string;
  startupAnswers: StartupAnswerInput[];
}) {
  const answerText = args.startupAnswers
    .map((answer) => `${normalizePlanningSeedPart(answer.question)}=${normalizePlanningSeedPart(answer.answer)}:${normalizePlanningSeedPart(answer.note ?? '')}`)
    .join('|');
  const raw = [
    normalizePlanningSeedPart(args.question),
    `target=${Math.floor(args.targetEventCount ?? 6)}`,
    `entry=${args.userEntryMode}`,
    answerText,
  ].join('::');
  return `stable-${stableHash(raw).toString(36)}`;
}

function normalizePlanningSeedPart(value: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, 240);
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function buildValidationTargets(
  skeleton: QuestionFocusInput,
  startupAnswers: StartupAnswerInput[],
  requiredEventPlanCount: number,
): ValidationTargetInput[] {
  const maxMustTargets = Math.max(1, Math.min(requiredEventPlanCount, 6));
  const candidates: Array<Omit<ValidationTargetInput, 'id' | 'priority'> & { prioritySeed: 'must' | 'should' }> = [];
  for (const dimension of skeleton.decisionStructure?.decisionDimensions ?? []) {
    candidates.push({
      label: dimension.label,
      source: 'decisionDimension',
      prioritySeed: 'must',
      whatWouldTestIt: [
        dimension.whyItMatters,
        dimension.userBlindSpot ? `同时测试用户是否意识到：${dimension.userBlindSpot}` : '',
      ].filter(Boolean).join(' '),
      badEventPattern: `只把“${dimension.label}”写成观察名，但没有现实代价或具体选择。`,
    });
  }
  for (const unknown of skeleton.decisionStructure?.unknowns ?? []) {
    candidates.push({
      label: compactPromptText(unknown, 36),
      source: 'unknown',
      prioritySeed: 'must',
      whatWouldTestIt: `把这个未知条件变成可确认的现实情境：${unknown}`,
      badEventPattern: '事件默认未知条件已经成立，而不是把它作为待验证条件。',
    });
  }
  for (const risk of skeleton.decisionStructure?.riskBlindspots ?? []) {
    candidates.push({
      label: compactPromptText(risk, 36),
      source: 'riskBlindspot',
      prioritySeed: 'must',
      whatWouldTestIt: `制造能暴露这个风险盲点的现实代价：${risk}`,
      badEventPattern: '事件只有轻微情绪波动，没有触及风险成本。',
    });
  }
  for (const need of skeleton.decisionStructure?.hiddenNeeds ?? []) {
    candidates.push({
      label: compactPromptText(need, 36),
      source: 'hiddenNeed',
      prioritySeed: 'should',
      whatWouldTestIt: `观察用户是否在保护或追求这个隐含需求：${need}`,
      badEventPattern: '事件只考察外部事务，没有逼近用户的隐含需求。',
    });
  }
  for (const answer of startupAnswers) {
    candidates.unshift({
      label: compactPromptText(answer.answer, 36),
      source: 'startupAnswer',
      prioritySeed: 'must',
      whatWouldTestIt: `直接测试用户启动回答里的偏好、底线或限制：${answer.question} => ${answer.answer}${answer.note ? `；${answer.note}` : ''}`,
      badEventPattern: '事件不触碰用户已经声明的偏好、底线或现实限制。',
    });
  }

  const seen = new Set<string>();
  let mustCount = 0;
  const targets: ValidationTargetInput[] = [];
  for (const candidate of candidates) {
    const key = normalizePlanningSeedPart(`${candidate.source}:${candidate.label}`);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    const priority = candidate.prioritySeed === 'must' && mustCount < maxMustTargets
      ? 'must'
      : candidate.prioritySeed === 'must'
      ? 'should'
      : 'optional';
    if (priority === 'must') {
      mustCount += 1;
    }
    targets.push({
      id: `target_${candidate.source}_${stableHash(key).toString(36)}`,
      label: candidate.label,
      source: candidate.source,
      priority,
      whatWouldTestIt: compactPromptText(candidate.whatWouldTestIt, 140),
      badEventPattern: candidate.badEventPattern,
    });
  }
  return targets.slice(0, 12);
}

function formatValidationTargetsForPrompt(targets: ValidationTargetInput[] | undefined) {
  if (!targets?.length) {
    return '暂无结构化验证目标；请至少围绕问题结构里的关键未知、风险盲点和现实维度设计事件。';
  }
  return targets
    .map((target, index) => [
      `${index + 1}. id=${target.id}`,
      `priority=${target.priority}`,
      `source=${target.source}`,
      `label=${target.label}`,
      `测试方式=${target.whatWouldTestIt}`,
      target.badEventPattern ? `避免=${target.badEventPattern}` : '',
    ].filter(Boolean).join('；'))
    .join('\n');
}

export function formatAuthenticityFeedbackForPrompt(feedback: AuthenticityFeedbackInput[] | undefined) {
  const meaningful = (feedback ?? [])
    .filter((item) => item.feedbackType && item.feedbackType !== 'user_reaction')
    .slice(0, 8);
  if (meaningful.length === 0) {
    return '暂无历史真实性校准反馈。';
  }
  return meaningful
    .map((item, index) => {
      const type = authenticityFeedbackLabel(item.feedbackType);
      const title = compactPromptText(item.eventTitle || '未知事件', 36);
      const selected = compactPromptText(item.selectedOption || '', 42);
      const correction = compactPromptText(item.correctionText || item.freeText || '', 80);
      return [
        `${index + 1}. ${type}`,
        `原事件：${title}`,
        selected ? `用户选择/标注：${selected}` : '',
        correction ? `用户补充：${correction}` : '',
      ].filter(Boolean).join('；');
    })
    .join('\n');
}

function authenticityFeedbackLabel(type: AuthenticityFeedbackInput['feedbackType']) {
  switch (type) {
    case 'unrealistic_event':
      return '事件不像真实生活，下一轮避开同类事务/触发模式';
    case 'unrealistic_person':
      return '人物不像真实的人，下一轮限制居民信息量和介入方式';
    case 'hit_real_issue':
      return '这个现实变量戳中用户，下一轮可换形式加深验证';
    case 'condition_correction':
      return '用户补充了现实条件，下一轮必须当作约束';
    default:
      return '普通反应';
  }
}

export function formatRejectedAuthenticityPatterns(feedback: AuthenticityFeedbackInput[] | undefined) {
  const patterns = rejectedAuthenticityPatterns(feedback);
  if (patterns.length === 0) {
    return '暂无需要硬性避开的历史假感模式。';
  }
  return patterns
    .map((pattern, index) => [
      `${index + 1}. 原标题：${pattern.title}`,
      pattern.fingerprint ? `标题指纹：${pattern.fingerprint}` : '',
      pattern.correction ? `用户指出：${pattern.correction}` : '',
      '禁止重复同标题、同设施事务、同触发套路；只能换成更贴近用户现实条件的新事件。',
    ].filter(Boolean).join('；'))
    .join('\n');
}

export function filterEventPlansByAuthenticityFeedback(
  plans: NonNullable<QuestionFocusInput['eventPlans']>,
  feedback: AuthenticityFeedbackInput[] | undefined,
) {
  const patterns = rejectedAuthenticityPatterns(feedback);
  if (patterns.length === 0) {
    return plans;
  }
  return plans.filter((plan) => !matchesRejectedAuthenticityPattern(plan, patterns));
}

async function filterEventPlansByStartupAnswers(
  plans: NonNullable<QuestionFocusInput['eventPlans']>,
  startupAnswers: StartupAnswerInput[],
  question: string,
) {
  if (startupAnswers.length === 0 || plans.length === 0) {
    return plans;
  }
  const answersText = startupAnswers
    .map((answer, index) => {
      const note = answer.note ? `；补充：${answer.note}` : '';
      return `${index + 1}. ${answer.question} => ${answer.answer}${note}`;
    })
    .join('\n');
  const plansText = plans
    .map((plan, index) => [
      `${index + 1}. ${plan.title}`,
      `场景：${plan.scene}`,
      `触发：${plan.trigger}`,
      `参与者：${plan.participants.join('、')}`,
      `意图：${plan.informationGoal}`,
    ].join('\n'))
    .join('\n\n');
  const { content } = await chatCompletion({
    messages: [
      {
        role: 'system',
        content: [
          '你是小镇事件一致性审查员。',
          '你的任务不是重写事件，而是检查事件是否尊重用户启动前回答。',
          '只过滤“直接矛盾”：事件文本和用户启动前回答中已经明确说出的事实、偏好、限制或未知状态相反。',
          '不要因为用户没有声明某个细节就 rejected；小镇事件本来可以设计待验证情境、候选对象、旁观意见、假设选择和压力测试。',
          '如果事件把用户已经明确否定的内容写成既成事实，应判为 rejected。',
          '如果事件只是把某个内容作为待验证、待选择、待确认、别人提出的看法或临时情境，且没有直接违背用户回答，应判为 kept。',
          '如果你不确定是否直接矛盾，必须 kept；宁可保留后续观察，也不要过度过滤。',
          '不要引入任何固定模板或固定名词。只根据本轮用户问题、启动前回答和事件文本判断。',
          '只输出 JSON，不要 markdown。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `用户问题：${question}`,
          `启动前回答：\n${answersText}`,
          `待审查事件：\n${plansText}`,
          '输出格式：',
          '{',
          '  "items": [',
          '    { "index": 1, "status": "kept/rejected", "reason": "若 rejected，必须指出它和哪一句启动前回答直接矛盾；否则写保留原因" }',
          '  ]',
          '}',
        ].join('\n'),
      },
    ],
    temperature: 0.1,
    timeoutMs: 120_000,
  });
  const parsed = parsePlannerJson(content) as { items?: Array<{ index?: unknown; status?: unknown }> } | null;
  const reviewItems = parsed?.items;
  const rejectedIndexes = new Set(
    Array.isArray(reviewItems)
      ? reviewItems
          .filter((item) => item.status === 'rejected')
          .map((item) => typeof item.index === 'number' ? item.index : Number(item.index))
          .filter((index) => Number.isInteger(index) && index >= 1)
      : [],
  );
  if (rejectedIndexes.size === 0) {
    return plans;
  }
  return plans.filter((_, index) => !rejectedIndexes.has(index + 1));
}

function rejectedAuthenticityPatterns(feedback: AuthenticityFeedbackInput[] | undefined) {
  return (feedback ?? [])
    .filter((item) =>
      item.feedbackType === 'unrealistic_event' ||
      item.feedbackType === 'unrealistic_person'
    )
    .map((item) => {
      const title = compactPromptText(item.eventTitle || '未知事件', 48);
      return {
        title,
        normalizedTitle: normalizeEventTitleForMerge(title),
        fingerprint: eventTitleFingerprint(title),
        correction: compactPromptText(item.correctionText || item.freeText || item.selectedOption || '', 80),
      };
    })
    .filter((item) => item.normalizedTitle || item.fingerprint)
    .slice(0, 12);
}

function matchesRejectedAuthenticityPattern(
  plan: NonNullable<QuestionFocusInput['eventPlans']>[number],
  patterns: ReturnType<typeof rejectedAuthenticityPatterns>,
) {
  const titleKey = normalizeEventTitleForMerge(plan.title);
  const fingerprint = eventTitleFingerprint(plan.title);
  return patterns.some((pattern) => {
    if (pattern.normalizedTitle && titleKey === pattern.normalizedTitle) {
      return true;
    }
    if (pattern.fingerprint && fingerprint && pattern.fingerprint === fingerprint) {
      return true;
    }
    return false;
  });
}

function compactPromptText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function stripEventPlans(plannedFocus: QuestionFocusInputPayload): QuestionFocusInput {
  const { eventPlans: _eventPlans, ...rest } = plannedFocus;
  return {
    ...rest,
    analysisDimensions: rest.analysisDimensions ?? [],
    designRationale: rest.designRationale ?? '',
    theoreticalBasis: rest.theoreticalBasis ?? [],
  };
}

function cleanStartupAnswers(
  rawAnswers: StartupAnswerInput[] | undefined,
  startupQuestions: NonNullable<QuestionFocusInput['startupQuestions']>,
) {
  if (!Array.isArray(rawAnswers)) {
    return [];
  }
  const questionSet = new Set(startupQuestions.map((item) => normalizeQuestionKey(item.question)));
  const answers: StartupAnswerInput[] = [];
  for (const rawAnswer of rawAnswers) {
    const question = cleanRequiredString(rawAnswer.question, 80);
    const answer = cleanRequiredString(rawAnswer.answer, 120);
    const note = cleanRequiredString(rawAnswer.note, 240);
    if (!question || !answer || !questionSet.has(normalizeQuestionKey(question))) {
      continue;
    }
    answers.push({ question, answer, ...(note ? { note } : {}) });
  }
  return answers.slice(0, startupQuestions.length);
}

function normalizeQuestionKey(question: string) {
  return question.replace(/[，。？！?,.\s]/g, '');
}

function cleanDecisionStructure(value: unknown): DecisionStructureInput | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const surfaceQuestion = cleanRequiredString(raw.surfaceQuestion, 120);
  const underlyingDecision = cleanRequiredString(raw.underlyingDecision, 180);
  const decisionDimensions = cleanDecisionDimensions(raw.decisionDimensions);
  const personalityLevers = cleanPlannerList(raw.personalityLevers, [], 3, 8, 80);
  const unknowns = cleanPlannerList(raw.unknowns, [], 4, 10, 90);
  const hiddenNeeds = cleanPlannerList(raw.hiddenNeeds, [], 3, 8, 90);
  const riskBlindspots = cleanPlannerList(raw.riskBlindspots, [], 3, 8, 90);
  const possiblePaths = cleanPossiblePaths(raw.possiblePaths);
  const changeConditions = cleanPlannerList(raw.changeConditions, [], 3, 8, 90);
  const nextValidationQuestions = cleanPlannerList(raw.nextValidationQuestions, [], 3, 8, 100);
  if (
    !surfaceQuestion ||
    !underlyingDecision ||
    decisionDimensions.length < 5 ||
    personalityLevers.length < 3 ||
    unknowns.length < 4 ||
    hiddenNeeds.length < 3 ||
    riskBlindspots.length < 3 ||
    possiblePaths.length < 2 ||
    changeConditions.length < 3 ||
    nextValidationQuestions.length < 3
  ) {
    return undefined;
  }
  return {
    surfaceQuestion,
    underlyingDecision,
    decisionDimensions,
    personalityLevers,
    unknowns,
    hiddenNeeds,
    riskBlindspots,
    possiblePaths,
    changeConditions,
    nextValidationQuestions,
  };
}

function cleanReasonablenessDiscussion(value: unknown): ReasonablenessDiscussionInput | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const plausibleInterpretation = cleanRequiredString(raw.plausibleInterpretation, 180);
  const whyReasonable = cleanPlannerList(raw.whyReasonable, [], 2, 4, 90);
  const possibleMisreads = cleanPlannerList(raw.possibleMisreads, [], 2, 4, 90);
  const assumptionsToConfirm = cleanPlannerList(raw.assumptionsToConfirm, [], 2, 4, 90);
  const alternativeFrames = cleanPlannerList(raw.alternativeFrames, [], 1, 3, 90);
  const discussionPrompt = cleanRequiredString(raw.discussionPrompt, 140);
  if (
    !plausibleInterpretation ||
    whyReasonable.length < 2 ||
    possibleMisreads.length < 2 ||
    assumptionsToConfirm.length < 2 ||
    alternativeFrames.length < 1 ||
    !discussionPrompt
  ) {
    return undefined;
  }
  return {
    plausibleInterpretation,
    whyReasonable,
    possibleMisreads,
    assumptionsToConfirm,
    alternativeFrames,
    discussionPrompt,
  };
}

function cleanDecisionDimensions(value: unknown): DecisionStructureInput['decisionDimensions'] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const raw = item as Record<string, unknown>;
      const label = cleanRequiredString(raw.label, 36);
      const whyItMatters = cleanRequiredString(raw.whyItMatters, 120);
      const userBlindSpot = cleanRequiredString(raw.userBlindSpot, 120);
      if (!label || !whyItMatters) {
        return null;
      }
      return {
        label,
        whyItMatters,
        ...(userBlindSpot ? { userBlindSpot } : {}),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 12);
}

function cleanPossiblePaths(value: unknown): DecisionStructureInput['possiblePaths'] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const raw = item as Record<string, unknown>;
      const label = cleanRequiredString(raw.label, 40);
      const whenLikely = cleanRequiredString(raw.whenLikely, 120);
      const possibleResult = cleanRequiredString(raw.possibleResult, 140);
      if (!label || !whenLikely || !possibleResult) {
        return null;
      }
      return { label, whenLikely, possibleResult };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 6);
}

function formatDecisionStructureForPrompt(structure?: DecisionStructureInput) {
  if (!structure) {
    return '暂无结构化拆解';
  }
  return [
    `表层问题：${structure.surfaceQuestion}`,
    `真实决策：${structure.underlyingDecision}`,
    `决策维度：${structure.decisionDimensions.map((item) => `${item.label}=${item.whyItMatters}`).join('；')}`,
    `关键未知：${structure.unknowns.join('；')}`,
    `隐藏需求：${structure.hiddenNeeds.join('；')}`,
    `风险盲点：${structure.riskBlindspots.join('；')}`,
    `可能路径：${structure.possiblePaths.map((item) => `${item.label}：${item.whenLikely} -> ${item.possibleResult}`).join('；')}`,
    `下一步验证：${structure.nextValidationQuestions.join('；')}`,
  ].join('\n');
}

function cleanOutcomeHypotheses(value: unknown, question: string): QuestionFocusInput['outcomeHypotheses'] {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const hypotheses = value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const raw = item as Record<string, unknown>;
      const label = cleanRequiredString(raw.label, 28);
      const plainConclusion = cleanRequiredString(raw.plainConclusion, 140);
      const supportSignals = cleanPlannerList(raw.supportSignals, [], 1, 4, 42);
      const weakSignals = cleanPlannerList(raw.weakSignals, [], 1, 4, 42);
      if (!label || !plainConclusion || supportSignals.length === 0 || weakSignals.length === 0) {
        return null;
      }
      return {
        label,
        plainConclusion,
        supportSignals,
        weakSignals,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 6);
  return hypotheses.length >= 2 ? hypotheses : undefined;
}

function cleanStartupQuestions(value: unknown, requiredCount: number): QuestionFocusInput['startupQuestions'] {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const seenQuestions = new Set<string>();
  const seenOptionSets = new Set<string>();
  const questions = value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const raw = item as Record<string, unknown>;
      const question = cleanRequiredString(raw.question, 60);
      const options = cleanPlannerList(raw.options, [], 3, 4, 32)
        .filter((option) => !/基本盘|争取自主|过渡方案|信息不足|标准构建|行动导向|资源评估|情绪稳定|现实检验/.test(option));
      const maxSelections = cleanStartupQuestionMaxSelections(raw.maxSelections, question, options.length);
      if (
        !question ||
        options.length < 3 ||
        /信息不足|标准构建|行动导向|资源评估|情绪稳定|现实检验|观察维度|判断依据/.test(question)
      ) {
        return null;
      }
      const questionKey = question.replace(/[，。？！?,.\s]/g, '');
      const optionKey = options.join('|');
      if (seenQuestions.has(questionKey) || seenOptionSets.has(optionKey)) {
        return null;
      }
      seenQuestions.add(questionKey);
      seenOptionSets.add(optionKey);
      return maxSelections > 1 ? { question, options, maxSelections } : { question, options };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, requiredCount);
  return questions.length === requiredCount ? questions : undefined;
}

function cleanStartupQuestionMaxSelections(value: unknown, question: string | undefined, optionCount: number) {
  const explicit = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 1;
  const inferred = inferStartupQuestionMaxSelections(question ?? '');
  return Math.min(Math.max(explicit, inferred, 1), optionCount);
}

function inferStartupQuestionMaxSelections(question: string) {
  if (/三件|三个|3\s*个/.test(question)) {
    return 3;
  }
  if (/两件|两个|2\s*个/.test(question)) {
    return 2;
  }
  if (/几件|几个|哪些|哪几|清单|优先级/.test(question)) {
    return 3;
  }
  return 1;
}

export function cleanEventPlans(
  value: unknown,
  analysisDimensions: string[],
  validationTargets?: ValidationTargetInput[],
): QuestionFocusInput['eventPlans'] {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const targetMap = new Map((validationTargets ?? []).map((target) => [target.id, target]));
  const requiresCoverage = targetMap.size > 0;
  const cleanedPlans = value
    .map((item, index) => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const raw = item as Record<string, unknown>;
      const axis = analysisDimensions[index % Math.max(1, analysisDimensions.length)] ?? '压力下的第一反应';
      const title = cleanRequiredString(raw.title, 34);
      const locationKey = cleanEventLocationKey(raw.locationKey);
      const scene = cleanRequiredString(raw.scene, 80);
      const trigger = cleanRequiredString(raw.trigger, 150);
      const participants = cleanPlannerList(raw.participants, [], 1, 4, 12);
      const observationAxis = cleanRequiredString(raw.observationAxis, 64) ?? axis;
      const questionLink = cleanRequiredString(raw.questionLink, 110) ??
        `用“${observationAxis}”这一现实变量继续验证用户原问题。`;
      const informationGoal = cleanRequiredString(raw.informationGoal, 80) ??
        `观察用户在“${observationAxis}”受压时会如何取舍。`;
      const judgmentSignal = cleanRequiredString(raw.judgmentSignal, 100) ??
        `看用户是否能提出具体边界、主动核对事实或调整安排。`;
      const responseOptions = cleanResponseOptions(raw.responseOptions) ??
        fallbackResponseOptions(observationAxis);
      const stakes = cleanEventStakes(raw.stakes) ?? fallbackEventStakes(trigger ?? '', observationAxis);
      const consequenceOptions = cleanConsequenceOptions(raw.consequenceOptions) ??
        fallbackConsequenceOptions(responseOptions, observationAxis);
      const text = [title, scene, trigger, questionLink, informationGoal, judgmentSignal].join(' ');
      const coverageText = [
        text,
        trigger,
        observationAxis,
        responseOptions.join(' '),
        cleanRequiredString(raw.whyThisTestsIt, 160) ?? '',
        Object.values(stakes ?? {}).join(' '),
      ].join(' ');
      const declaredTargetIds = cleanPlannerList(raw.coveredTargetIds, [], 1, 4, 48)
        .filter((id) => targetMap.has(id));
      const inferredTargetIds = inferValidationTargetIds(coverageText, targetMap);
      const coveredTargetIds = mergeTargetIds(declaredTargetIds, inferredTargetIds)
        .filter((id) => {
          const target = targetMap.get(id);
          return target ? textAlignsWithValidationTarget(coverageText, target) : false;
        })
        .slice(0, 4);
      const whyThisTestsIt = cleanRequiredString(raw.whyThisTestsIt, 160) ??
        fallbackWhyThisTestsIt(coveredTargetIds, targetMap, observationAxis);
      if (
        !title ||
        !scene ||
        !trigger ||
        participants.length === 0 ||
        isGenericTownErrandEvent(text) ||
        !hasConcreteLifeAnchor(trigger) ||
        !eventPlanSatisfiesValidationTargets({
          requiresCoverage,
          coveredTargetIds,
          whyThisTestsIt,
          targetMap,
          text: coverageText,
        })
      ) {
        return null;
      }
      return {
        title,
        severity: cleanEventSeverity(raw.severity, index),
        locationKey,
        scene,
        trigger,
        participants,
        observationAxis,
        questionLink,
        informationGoal,
        judgmentSignal,
        coveredTargetIds: coveredTargetIds.length > 0 ? coveredTargetIds : undefined,
        whyThisTestsIt,
        responseOptions,
        stakes,
        consequenceOptions,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 20);
  const diversePlans = diversifyEventPlanMotifs(cleanedPlans);
  const plans = diversifyEventPlanLocations(diversePlans);
  if (!eventPlanBatchCoversMustTargets(plans, validationTargets)) {
    return undefined;
  }
  return plans.length > 0 ? plans : undefined;
}

function eventPlanSatisfiesValidationTargets(args: {
  requiresCoverage: boolean;
  coveredTargetIds: string[];
  whyThisTestsIt: string | undefined;
  targetMap: Map<string, ValidationTargetInput>;
  text: string;
}) {
  if (!args.requiresCoverage) {
    return true;
  }
  if (args.coveredTargetIds.length === 0 || !args.whyThisTestsIt) {
    return false;
  }
  return args.coveredTargetIds.every((id) => {
    const target = args.targetMap.get(id);
    return target ? textAlignsWithValidationTarget(args.text, target) : false;
  });
}

function mergeTargetIds(first: string[], second: string[]) {
  const merged: string[] = [];
  for (const id of [...first, ...second]) {
    if (!merged.includes(id)) {
      merged.push(id);
    }
  }
  return merged;
}

function inferValidationTargetIds(text: string, targetMap: Map<string, ValidationTargetInput>) {
  if (targetMap.size === 0) {
    return [];
  }
  return [...targetMap.values()]
    .filter((target) => textAlignsWithValidationTarget(text, target))
    .sort((left, right) => validationTargetPriorityRank(left.priority) - validationTargetPriorityRank(right.priority))
    .map((target) => target.id);
}

function validationTargetPriorityRank(priority: ValidationTargetInput['priority']) {
  switch (priority) {
    case 'must':
      return 0;
    case 'should':
      return 1;
    default:
      return 2;
  }
}

function fallbackWhyThisTestsIt(
  coveredTargetIds: string[],
  targetMap: Map<string, ValidationTargetInput>,
  observationAxis: string,
) {
  const target = coveredTargetIds
    .map((id) => targetMap.get(id))
    .find((item): item is ValidationTargetInput => Boolean(item));
  if (!target) {
    return undefined;
  }
  return `这个事件通过“${observationAxis}”测试：${target.whatWouldTestIt}`;
}

function eventPlanBatchCoversMustTargets(
  plans: NonNullable<QuestionFocusInput['eventPlans']>,
  targets: ValidationTargetInput[] | undefined,
) {
  const mustTargetIds = (targets ?? [])
    .filter((target) => target.priority === 'must')
    .map((target) => target.id);
  if (mustTargetIds.length === 0) {
    return true;
  }
  const covered = new Set(plans.flatMap((plan) => plan.coveredTargetIds ?? []));
  return mustTargetIds.every((id) => covered.has(id));
}

function textAlignsWithValidationTarget(text: string, target: ValidationTargetInput) {
  const normalizedText = normalizeCoverageText(text);
  const targetTokens = coverageTokens(`${target.label} ${target.whatWouldTestIt}`);
  if (targetTokens.length === 0) {
    return false;
  }
  return targetTokens.some((token) => normalizedText.includes(token));
}

function normalizeCoverageText(value: string) {
  return value.replace(/\s+/g, '').toLowerCase();
}

function coverageTokens(value: string) {
  const stopWords = new Set([
    '用户',
    '测试',
    '是否',
    '这个',
    '现实',
    '条件',
    '事件',
    '说明',
    '确认',
    '观察',
    '直接',
    '边界',
  ]);
  const normalized = normalizeCoverageText(value);
  const tokens = new Set<string>();
  for (const match of normalized.matchAll(/[\u4e00-\u9fa5]{2,}/g)) {
    const chunk = match[0];
    for (let length = Math.min(5, chunk.length); length >= 2; length -= 1) {
      for (let index = 0; index + length <= chunk.length; index += 1) {
        const token = chunk.slice(index, index + length);
        if (!stopWords.has(token)) {
          tokens.add(token);
        }
      }
    }
  }
  for (const match of normalized.matchAll(/[a-z0-9_]{3,}/g)) {
    tokens.add(match[0]);
  }
  return [...tokens].slice(0, 24);
}

function diversifyEventPlanMotifs(
  plans: NonNullable<QuestionFocusInput['eventPlans']>,
): NonNullable<QuestionFocusInput['eventPlans']> {
  const motifCounts = new Map<string, number>();
  const mechanicCounts = new Map<string, number>();
  const titleFingerprints = new Set<string>();
  const accepted: NonNullable<QuestionFocusInput['eventPlans']> = [];
  for (const plan of plans) {
    const text = eventPlanText(plan);
    const motif = eventMotifKey(text);
    const mechanic = eventMechanicKey(text);
    const fingerprint = eventTitleFingerprint(plan.title);
    const currentCount = motifCounts.get(motif) ?? 0;
    const currentMechanicCount = mechanicCounts.get(mechanic) ?? 0;
    const maxCount = maxEventsForMotif(motif);
    const maxMechanicCount = maxEventsForMechanic(mechanic);
    if (fingerprint && titleFingerprints.has(fingerprint)) {
      continue;
    }
    if (currentCount >= maxCount) {
      continue;
    }
    if (currentMechanicCount >= maxMechanicCount) {
      continue;
    }
    accepted.push(plan);
    motifCounts.set(motif, currentCount + 1);
    mechanicCounts.set(mechanic, currentMechanicCount + 1);
    if (fingerprint) {
      titleFingerprints.add(fingerprint);
    }
  }
  return accepted.length > 0 ? accepted : plans.slice(0, 1);
}

function eventPlanText(plan: NonNullable<QuestionFocusInput['eventPlans']>[number]) {
  return [
    plan.title,
    plan.scene,
    plan.trigger,
    plan.questionLink,
    plan.informationGoal,
    plan.judgmentSignal,
  ].join(' ');
}

function eventMotifKey(text: string) {
  if (/微信|消息|电话|语音|截图|回复|约定|见面|相亲/.test(text)) return 'relationship_message';
  if (/退休金|账单|费用|开销|垫付|共同账户|\d+\s*元|钱/.test(text)) return 'money_boundary';
  if (/回岳阳|老家|两地|车票|长沙|春节|看房|住处|同住/.test(text)) return 'living_arrangement';
  if (/子女|儿子|女儿|孩子|父母|母亲|父亲|亲戚|家庭群|照护/.test(text)) return 'family_responsibility';
  if (/合同|项目|客户|岗位|辞职|创业|收入|工作/.test(text)) return 'work_contract';
  if (/邻里|熟人|评价|公开|面子|圈子|旁观/.test(text)) return 'social_evaluation';
  if (/手续|材料|表格|证明|登记|窗口|办理|补交|盖章/.test(text)) return 'paperwork';
  if (/咨询|询问|问清|了解/.test(text)) return 'consulting';
  if (/排队|等待|叫号|座位|付款码|取货|缺货|优惠|补货/.test(text)) return 'facility_errand';
  if (/故障|维修|修理|坏了|工具|家电/.test(text)) return 'repair_fault';
  if (/报告|体检|复诊|慢性病|血压|药/.test(text)) return 'health_report';
  return `axis:${text.slice(0, 18)}`;
}

function eventMechanicKey(text: string) {
  if (/手续|材料|表格|证明|登记|窗口|办理|补交|盖章/.test(text)) return 'paperwork_mechanic';
  if (/排队|等待|叫号|座位|付款码|取货|缺货|优惠|补货/.test(text)) return 'facility_errand_mechanic';
  if (/故障|维修|修理|坏了|工具|家电/.test(text)) return 'repair_mechanic';
  if (/报告|体检报告|解读报告/.test(text)) return 'report_mechanic';
  if (/咨询|询问|了解/.test(text) && !/问清|追问/.test(text)) return 'consulting_mechanic';
  return 'situational_mechanic';
}

function maxEventsForMotif(motif: string) {
  if (motif === 'paperwork' || motif === 'consulting' || motif === 'facility_errand' || motif === 'repair_fault') {
    return 1;
  }
  if (motif === 'living_arrangement') {
    return 8;
  }
  if (motif === 'relationship_message') {
    return 6;
  }
  if (motif === 'family_responsibility' || motif === 'money_boundary' || motif === 'social_evaluation') {
    return 3;
  }
  return 2;
}

function maxEventsForMechanic(mechanic: string) {
  if (mechanic === 'situational_mechanic') {
    return 20;
  }
  return 1;
}

function eventTitleFingerprint(title: string) {
  const tokens = title
    .replace(/[的了和与及、，。！？\s]/g, '')
    .replace(/意向对象|相亲对象|关键对象|伴侣|对象|回岳阳|岳阳|适应|边界|安排|责任|条件|问题|冲突|确认|处理/g, '')
    .match(/[\u4e00-\u9fa5]{2}/g);
  return tokens?.slice(0, 4).join('|') ?? '';
}

function normalizeEventTitleForMerge(title: string) {
  return title
    .replace(/[的了和与及、，。！？\s]/g, '')
    .replace(/事件|场景|探针|问题|冲突|确认|处理/g, '')
    .trim();
}

function diversifyEventPlanLocations(
  plans: NonNullable<QuestionFocusInput['eventPlans']>,
): NonNullable<QuestionFocusInput['eventPlans']> {
  const used = new Set<string>();
  return plans.map((plan) => {
    const text = [
      plan.title,
      plan.scene,
      plan.trigger,
      plan.observationAxis,
      plan.questionLink,
      plan.informationGoal,
      plan.judgmentSignal,
    ].join(' ');
    const inferred = inferEventLocationKey(text, !plan.locationKey);
    const locationKey = chooseEventLocationKey(plan.locationKey, inferred, used);
    used.add(locationKey);
    return {
      ...plan,
      locationKey,
      scene: rewriteSceneLocation(plan.scene, locationKey),
    };
  });
}

function chooseEventLocationKey(
  current: string | undefined,
  inferred: EventLocationKey,
  used: Set<string>,
): EventLocationKey {
  const currentKey = cleanEventLocationKey(current);
  if (currentKey && !used.has(currentKey)) {
    return currentKey;
  }
  if (!used.has(inferred)) {
    return inferred;
  }
  return eventLocationOptions.find((option) => !used.has(option.key))?.key ?? inferred;
}

function inferEventLocationKey(text: string, preferExplicitLocation = false): EventLocationKey {
  if (preferExplicitLocation) {
    const explicit = explicitLocationKeyFromText(text);
    if (explicit) {
      return explicit;
    }
  }
  const strongLocationSignals: Array<{ key: EventLocationKey; pattern: RegExp }> = [
    { key: 'shop', pattern: /退休金|账单|金额|费用|开销|共同账户|垫付|\d+\s*元|钱/ },
    { key: 'station', pattern: /回岳阳|老家|车票|出发|离开|两地|迁移|长沙|春节|行李|看房/ },
    { key: 'clinic', pattern: /健康|照护|身体|病|药|医院|复诊|睡眠|血压|生病/ },
    { key: 'school', pattern: /孩子|子女|儿子|女儿|教育|继父|继母|抚养|上学|家长|晚辈/ },
    { key: 'office', pattern: /房产|住处|登记|规则|证明|合同|手续|责任|边界|财产|医保/ },
    { key: 'workshop', pattern: /维修|修理|家电|房子|漏水|装修|物件|工具|家务/ },
    { key: 'cafe', pattern: /相亲|见面|聊天|介绍|回复|消息|关系|情绪|陪伴|误会|承诺|约定/ },
    { key: 'square', pattern: /邻里|公开|评价|面子|圈子|融入|旁观|社交|亲戚|熟人|社区/ },
  ];
  const strongMatch = strongLocationSignals.find((option) => option.pattern.test(text));
  if (strongMatch) {
    return strongMatch.key;
  }
  const matched = eventLocationOptions.find((option) => option.keywords.test(text));
  return matched?.key ?? 'square';
}

function explicitLocationKeyFromText(text: string): EventLocationKey | undefined {
  const matched = eventLocationOptions.find((option) => text.includes(option.label));
  return matched?.key;
}

function rewriteSceneLocation(scene: string, locationKey: EventLocationKey) {
  const location = eventLocationOptions.find((option) => option.key === locationKey);
  if (!location) {
    return scene;
  }
  const knownLocationPattern = /晨桥咖啡馆|钟楼广场|白榆诊所|旧校舍|修理工坊|社区办公室|车站|商店|河边步道|公寓走廊/;
  if (knownLocationPattern.test(scene)) {
    return scene.replace(knownLocationPattern, location.label);
  }
  return `${location.label}里，${scene}`;
}

function cleanEventStakes(value: unknown): EventStakesInput | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const stakes = {
    timeCost: cleanRequiredString(raw.timeCost, 70),
    moneyCost: cleanRequiredString(raw.moneyCost, 70),
    relationshipCost: cleanRequiredString(raw.relationshipCost, 90),
    opportunityCost: cleanRequiredString(raw.opportunityCost, 90),
  };
  const values = Object.values(stakes).filter((item): item is string => Boolean(item));
  if (
    values.length === 0 ||
    values.some(isEmptyImpactText) ||
    !values.some((item) => /分钟|小时|天|周|月|年|元|钱|费用|信任|失望|警惕|关系|机会|资格|住处|照护|承诺|合同|工作|家人/.test(item))
  ) {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(stakes).filter(([, item]) => Boolean(item)),
  ) as EventStakesInput;
}

function cleanConsequenceOptions(value: unknown): EventConsequenceOptionInput[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const options = value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const raw = item as Record<string, unknown>;
      const userAction = cleanRequiredString(raw.userAction, 42);
      const relationshipDelta = cleanRequiredString(raw.relationshipDelta, 80);
      const unlocks = cleanRequiredString(raw.unlocks, 90);
      if (
        !userAction ||
        !relationshipDelta ||
        !unlocks ||
        isEmptyImpactText(relationshipDelta) ||
        isEmptyImpactText(unlocks)
      ) {
        return null;
      }
      return { userAction, relationshipDelta, unlocks };
    })
    .filter((item): item is EventConsequenceOptionInput => Boolean(item))
    .slice(0, 4);
  return options.length >= 2 ? options : undefined;
}

function fallbackResponseOptions(axis: string) {
  const label = compactPromptText(axis || '当前条件', 18);
  return [
    `我先问清${label}的具体限制`,
    '我暂缓决定，先保留原计划',
    '这个条件会改变我的选择',
  ];
}

function fallbackEventStakes(trigger: string, axis: string): EventStakesInput {
  const label = compactPromptText(axis || trigger || '这件事', 28);
  return {
    timeCost: `需要额外花时间核对${label}，原计划会被推迟。`,
    relationshipCost: `如果含糊处理，相关居民会更难判断我的真实边界。`,
  };
}

function fallbackConsequenceOptions(
  responseOptions: string[],
  axis: string,
): EventConsequenceOptionInput[] {
  const label = compactPromptText(axis || '当前条件', 18);
  const [first, second, third] = responseOptions;
  return [
    {
      userAction: first ?? `问清${label}`,
      relationshipDelta: '对方会更清楚我在认真评估，而不是直接逃避。',
      unlocks: `后续可以继续验证${label}是否能被稳定接受。`,
    },
    {
      userAction: second ?? '暂缓决定',
      relationshipDelta: '关系热度可能下降，但边界会更清楚。',
      unlocks: `后续会转向观察拖延、回避或替代方案。`,
    },
    {
      userAction: third ?? '调整选择',
      relationshipDelta: '对方会看到这个条件对我有真实影响。',
      unlocks: `后续需要重新评估${label}和原问题的关系。`,
    },
  ];
}

function isEmptyImpactText(text: string) {
  return /^(无|没有|不明显|未知|待定|视情况|无明显影响|没有明显影响)$/.test(text.trim());
}

function isGenericTownErrandEvent(text: string) {
  return (
    /^(晨桥咖啡馆|白榆诊所|社区办公室|公寓走廊|旧校舍|河边步道|修理工坊|车站|商店|钟楼广场)的/.test(text) ||
    /晨间秩序|体检报告解读|退休手续咨询|邻里寒暄|志愿活动招募|晨练偶遇|家电故障|长途车票预订|退休优惠咨询|公开演讲|慢性病咨询|邻里纠纷调解/.test(text) ||
    /^(咨询|办理|处理|参加|遇到|完成).{0,16}(事务|手续|活动|问题)$/.test(text) ||
    /咨询.*咨询/.test(text)
  );
}

function hasConcreteLifeAnchor(trigger: string) {
  const anchorPatterns = [
    /我/,
    /手机|消息|电话|微信|聊天|通话|语音|照片|截图|通知|表示|提出|询问|抱怨|担心/,
    /今天|明天|周末|早上|晚上|下午|分钟|小时|天|周|月|年|\d/,
    /钱|元|收入|工资|退休金|房租|存款|医保|费用|账单|合同|押金|共同账户/,
    /家|住|房|老家|岳阳|长沙|外地|本地|城市|父母|儿女|孩子|亲戚|伴侣|对象|相亲|介绍人/,
    /医院|体检|病|药|睡眠|照护|身体|血压|复诊/,
    /工作|项目|客户|同事|老板|岗位|辞职|创业|机会|调动|退休|职业/,
    /气候|方言|教育|学校|医疗|人情|社交|口味|饮食|装修|作息/,
    /票|预约|登记|证件|钥匙|行李|名单|表格|收据|证明/,
  ];
  return anchorPatterns.filter((pattern) => pattern.test(trigger)).length >= 2;
}

function cleanResponseOptions(rawOptions: unknown) {
  const options = cleanPlannerList(rawOptions, [], 3, 4, 42)
    .filter((option) => option.length >= 4)
    .filter((option) => !/基本盘|自主|过渡方案|马上处理|先观察|随便|都可以/.test(option));
  return options.length >= 3 ? options : undefined;
}

function cleanEventLocationKey(value: unknown): EventLocationKey | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const key = value.trim();
  return eventLocationOptions.some((option) => option.key === key) ? key as EventLocationKey : undefined;
}

function parsePlannerJson(content: string) {
  const trimmed = content.trim();
  const jsonText = trimmed.match(/\{[\s\S]*\}/)?.[0] ?? trimmed;
  try {
    return JSON.parse(jsonText) as Partial<QuestionFocusInput>;
  } catch {
    return null;
  }
}

function cleanRequiredString(value: unknown, maxLength = 180) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : undefined;
}

function cleanEventSeverity(value: unknown, index: number) {
  if (typeof value === 'string') {
    if (/重大|高|大|人生|危机|严重/.test(value)) {
      return '重大';
    }
    if (/中等|中|较大|明显/.test(value)) {
      return '中等';
    }
    if (/日常|轻|小/.test(value)) {
      return '日常';
    }
  }
  return index % 6 === 4 ? '重大' : index % 3 === 1 ? '中等' : '日常';
}

function cleanPlannerList(value: unknown, fallback: string[], minItems = 3, maxItems = 5, maxLength = 80) {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const items = value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim().slice(0, maxLength))
    .slice(0, maxItems);
  return items.length >= minItems ? items : fallback;
}
