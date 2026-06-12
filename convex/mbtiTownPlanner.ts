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

const questionFocusInput = v.object({
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

type QuestionFocusInput = {
  coreQuestion: string;
  drivingTension: string;
  observationGoal: string;
  analysisDimensions: string[];
  designRationale: string;
  theoreticalBasis: string[];
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
    observationAxis: string;
    questionLink: string;
    informationGoal: string;
    judgmentSignal: string;
    responseOptions?: string[];
  }>;
  resolutionCriteria: string;
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
    const requiredEventPlanCount = Math.max(3, requiredStartupQuestionCount);
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
    if (answers.length < requiredStartupQuestionCount) {
      throw new Error(`启动前关键回应不足：需要 ${requiredStartupQuestionCount} 个，当前 ${answers.length} 个。系统不会代替用户回答。`);
    }
    const planningResult = await planQuestionEventsWithRetries(
      args.question,
      skeleton,
      answers,
      requiredEventPlanCount,
      3,
    );
    const plannedFocus = planningResult.plannedFocus
      ? {
          ...planningResult.plannedFocus,
          startupQuestions: skeleton.startupQuestions,
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
      throw new Error(`基于启动前回应生成情境探针连续 3 次仍失败：本轮需要至少 ${requiredEventPlanCount} 个合格事件，不会使用兜底模板。${issueText}请检查本地模型服务是否稳定，或调整问题后再进入。`);
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
) {
  const attemptIssues: string[] = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let eventResult: { eventPlans?: NonNullable<QuestionFocusInput['eventPlans']>; issues: string[] };
    try {
      eventResult = await planQuestionEvents(
        question,
        attempt,
        requiredEventPlanCount,
        skeleton,
        startupAnswers,
      );
    } catch (error) {
      eventResult = {
        issues: [error instanceof Error ? `模型调用或解析异常：${error.message}` : '模型调用或解析异常'],
      };
    }
    if (eventResult.eventPlans && eventResult.eventPlans.length >= requiredEventPlanCount) {
      return {
        plannedFocus: {
          ...skeleton,
          eventPlans: eventResult.eventPlans,
        },
        issues: attemptIssues,
      };
    }
    const readableIssues = eventResult.issues.length > 0 ? eventResult.issues.join('；') : '未生成足够合格事件';
    attemptIssues.push(`第 ${attempt} 次：${readableIssues}`);
    console.warn(`MBTI answered probe planning attempt ${attempt}/${maxAttempts} failed: ${readableIssues}`);
  }
  return { plannedFocus: null, issues: attemptIssues.slice(-3) };
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
          '你的任务只做第一段：把用户现实问题拆成观察维度，并生成启动前必须问用户的关键问题。',
          '不要生成 eventPlans。不要写角色台词。不要写咨询师建议。只输出 JSON。',
          'startupQuestions 必须直白、生活化、能马上回答，必须直接服务用户原问题。',
          'startupQuestions 不能出现“信息不足时的反应、标准构建方式、行动导向、资源评估、情绪稳定性、现实检验能力”等分析术语。',
          'startupQuestions 的选项必须每题不同、具体、互斥，不能使用“稳住基本盘、争取自主、过渡方案”等抽象策略词。',
          '如果用户问“什么样的女人/老婆适合我”，问题应该问真实择偶偏好，例如最看重什么生活条件、不能接受什么相处方式、回岳阳后的共同生活边界。',
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
          '  "analysisDimensions": ["6-10 个从用户问题拆出的不同观察维度，写生活化，不要写抽象术语"],',
          '  "designRationale": "1-2 句话说明为什么这些问题和后续事件能服务原问题",',
          '  "theoreticalBasis": ["2-4 个简短依据，如：压力应对、亲密关系匹配、生活方式兼容"],',
          '  "evidenceTargets": ["3-5 个后续要从聊天/事件/行动中观察的证据方向"],',
          '  "eventBeats": ["3-5 个后续适合转成小镇事件的触发点"],',
          '  "startupQuestions": [',
          '    { "question": "一句直白生活化问题", "options": ["3-4 个具体回答"] }',
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
): Promise<{ eventPlans?: NonNullable<QuestionFocusInput['eventPlans']>; issues: string[] }> {
  const startupAnswerText = startupAnswers
    .map((answer, index) => {
      const note = answer.note ? `；补充：${answer.note}` : '';
      return `${index + 1}. ${answer.question} => ${answer.answer}${note}`;
    })
    .join('\n');
  const { content } = await chatCompletion({
      messages: [
        {
          role: 'system',
          content: [
            '你是 MBTI 小镇的情境探针设计器。',
            '这是第二段：第一段的问题拆解和启动前关键问题已经合格。你只需要生成 eventPlans。',
            '你必须把用户的启动前真实回答作为事件设计的方向盘：事件的主题、顺序、强度和冲突点都要受这些回答影响。',
            '如果用户回答表达了偏好、底线、不能接受的伴侣特征或生活方式，前几个事件必须直接测试这些偏好和底线。',
            '不要生成与启动前回答无关的事件；不要把回答只当背景文字。',
            '事件必须像小镇里真实发生的生活事件，有地点、人物、触发事情、要观察的信息、可用于判断的信号。',
            '地点只能写地图上已有设施：晨桥咖啡馆、钟楼广场、白榆诊所、旧校舍、河边步道、公寓走廊、修理工坊、社区办公室、车站、商店。不要写市集、图书馆、地铁站、餐厅等地图上没有的设施。',
            '不要输出“观察沟通模式”这类抽象事件名；要输出具体生活场景，但人物只能用“我、关键对象、常驻居民A、常驻居民B”这类占位符，不要自己创造姓名或职业称谓。',
            'eventPlans 必须包含不同强度：日常/中等/重大。20 个候选事件建议约 10 个日常、7 个中等、3 个重大；前 8 个里至少 1 个重大或准重大。不要全部是排队、缺货、工具故障、补货这类小阻碍。',
            '所有事件都必须动态生成，不能套固定模板。日常、中等、重大都要根据本次用户问题、关键对象关系、常驻居民性格、地图设施和当前观察维度来创造。',
            '重大事件不是固定清单，也不是随机灾难。它应当是“如果这个用户问题继续发展，现实中可能出现的高后果场景”：关系、钱、身体、安全、住处、身份资格、工作学业、关键机会、家庭责任等，具体选哪一种必须由用户问题和角色关系推导。',
            '中等事件应当明显比普通小阻碍更有压力，例如影响承诺、时间窗口、他人评价、资源归属、责任分配或短期生活安排；日常事件则用于观察轻微打断下的自然反应。三种强度都要具体、生活化、可进入聊天。',
            'trigger 必须是可直接进入聊天的一幕，包含：用户原本要做什么、哪个具体物件/信息/约定卡住了、谁给出什么具体限制。不要只写“缺货、还在处理、工具故障、进度模糊”。',
            '如果用户问题涉及伴侣、关系、亲密关系、是否继续或分开，eventPlans 必须围绕约定、回复、边界、误解、承诺、第三方评价、共同安排来设计；不要用座位争夺、取货、付款码、工具故障这类和关系选择弱相关的小阻碍作为关键探针。',
            '如果用户问题涉及辞职、创业、职业、钱或稳定性，eventPlans 必须围绕收入、现金流、合同、项目机会、时间窗口、家庭责任或退路来设计；不要用普通购物、咖啡馆座位、迷路、排队作为关键探针。',
            'eventPlans 必须尽可能离散：每个事件绑定一个不同 analysisDimensions 维度，并使用不同地点细分、不同物件、不同阻断类型。不要连续使用咖啡、零件、见面、补货、工具故障这类同一母题。',
            'eventPlans 请输出 20 个候选事件；短时会取前 6-8 个，中时取前 12 个，长时取 20 个。前 20 个都不能只是同一事件换说法。',
            'eventPlans 的 observationAxis 必须逐项对应 analysisDimensions 中的不同条目；前 8 个事件不要重复 observationAxis。',
            '如果用户问“什么样的女人/老婆适合我”，startupQuestions 应该问真实择偶偏好，例如第一句想问什么、最看重的共同生活条件、不能接受的伴侣特征；不要问修理工坊、购物、散步、参观等无关事件。',
            '不要写角色台词，不要写咨询师建议，不要让伴侣、朋友、居民知道原题。',
            '只输出 JSON，不要 markdown。',
          ].join('\n'),
        },
        {
          role: 'user',
          content: [
            `用户问题：${question}`,
            `生成尝试：第 ${attempt} 次。请至少生成 ${requiredEventPlanCount} 个合格 eventPlans，建议输出 20 个候选。`,
            `已经合格的观察维度：${skeleton.analysisDimensions.join('；')}`,
            `观察目标：${skeleton.observationGoal}`,
            `证据方向：${skeleton.evidenceTargets.join('；')}`,
            `事件触发点：${skeleton.eventBeats.join('；')}`,
            `用户启动前真实回答：\n${startupAnswerText}`,
            '输出字段：',
            '{',
            '  "eventPlans": [',
            '    {',
            '      "title": "短标题，必须来自本次用户问题的关键变量，不要照抄示例",',
            '      "severity": "日常/中等/重大",',
            '      "scene": "具体地图设施和人物，如：社区办公室里，我、关键对象、常驻居民A正在处理与本问题相关的现实条件",',
            '      "trigger": "发生的具体事，必须直接测试本次问题的关键变量；不要写购物、取货、排队、座位、付款码等通用小阻碍",',
            '      "participants": ["我", "关键对象", "常驻居民A"],',
            '      "observationAxis": "这个事件对应哪个观察维度，如：情绪调节",',
            '      "questionLink": "说明它和用户原问题的逻辑关系，如：模拟计划被外部波动打断后是否还能恢复行动",',
            '      "informationGoal": "这个事件为了看什么，如：看我会不会直接表达不安",',
            '      "judgmentSignal": "什么表现可用于判断，如：追问且能说清需求偏修复；冷处理或离开偏回避",',
            '      "responseOptions": ["3-4 个第一人称、具体、互斥的真实行动选项；必须围绕本事件，不要写抽象策略词，如不要写稳住基本盘"]',
            '    }',
            '  ]',
            '}',
          ].join('\n'),
        },
      ],
      temperature: 0.2,
      timeoutMs: 180_000,
    });
    const parsed = parsePlannerJson(content);
    if (!parsed) {
      return { issues: ['模型输出不是可解析 JSON'] };
  }
  const eventPlans = cleanEventPlans(parsed.eventPlans, skeleton.analysisDimensions);
  if (!eventPlans || eventPlans.length < requiredEventPlanCount) {
    const rawCount = Array.isArray(parsed.eventPlans) ? parsed.eventPlans.length : 0;
    return { issues: [`情境探针事件不合格：需要至少 ${requiredEventPlanCount} 个，原始 ${rawCount} 个`] };
  }
  return { eventPlans, issues: [] };
}

function stripEventPlans(plannedFocus: QuestionFocusInput): QuestionFocusInput {
  const { eventPlans: _eventPlans, ...rest } = plannedFocus;
  return rest;
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
      return { question, options };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, requiredCount);
  return questions.length === requiredCount ? questions : undefined;
}

function cleanEventPlans(value: unknown, analysisDimensions: string[]): QuestionFocusInput['eventPlans'] {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const plans = value
    .map((item, index) => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const raw = item as Record<string, unknown>;
      const axis = analysisDimensions[index % Math.max(1, analysisDimensions.length)] ?? '压力下的第一反应';
      const title = cleanRequiredString(raw.title, 34);
      const scene = cleanRequiredString(raw.scene, 80);
      const trigger = cleanRequiredString(raw.trigger, 150);
      const participants = cleanPlannerList(raw.participants, [], 1, 4, 12);
      const questionLink = cleanRequiredString(raw.questionLink, 110);
      const informationGoal = cleanRequiredString(raw.informationGoal, 80);
      const judgmentSignal = cleanRequiredString(raw.judgmentSignal, 100);
      const responseOptions = cleanResponseOptions(raw.responseOptions);
      if (
        !title ||
        !scene ||
        !trigger ||
        participants.length === 0 ||
        !questionLink ||
        !informationGoal ||
        !judgmentSignal ||
        !responseOptions
      ) {
        return null;
      }
      return {
        title,
        severity: cleanEventSeverity(raw.severity, index),
        scene,
        trigger,
        participants,
        observationAxis: axis,
        questionLink,
        informationGoal,
        judgmentSignal,
        responseOptions,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 20);
  return plans.length >= 3 ? plans : undefined;
}

function cleanResponseOptions(rawOptions: unknown) {
  const options = cleanPlannerList(rawOptions, [], 3, 4, 42)
    .filter((option) => option.length >= 4)
    .filter((option) => !/基本盘|自主|过渡方案|马上处理|先观察|随便|都可以/.test(option));
  return options.length >= 3 ? options : undefined;
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
