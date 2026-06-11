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

type QuestionFocusInput = {
  coreQuestion: string;
  drivingTension: string;
  observationGoal: string;
  analysisDimensions: string[];
  designRationale: string;
  theoreticalBasis: string[];
  evidenceTargets: string[];
  eventBeats: string[];
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
  }>;
  resolutionCriteria: string;
};

export const planAndCreateSceneRequest = action({
  args: {
    townId: v.optional(v.id('mbtiTownProfiles')),
    question: v.string(),
    userEntryMode,
  },
  handler: async (ctx, args) => {
    const plannedFocus = await planQuestionFocus(args.question);
    return await ctx.runMutation(makeFunctionReference<'mutation'>('mbtiTown:createSceneRequest'), {
      townId: args.townId,
      question: args.question,
      userEntryMode: args.userEntryMode,
      plannedFocus: plannedFocus ?? undefined,
    });
  },
});

async function planQuestionFocus(question: string): Promise<QuestionFocusInput | null> {
  try {
    const { content } = await chatCompletion({
      messages: [
        {
          role: 'system',
          content: [
            '你是 MBTI 小镇的入镇前场景策划器。',
            '用户会带着一个现实提问进入小镇，但角色不应该知道这个提问，也不应该知道自己在实验里。',
            '请把用户问题转成系统级隐性演化计划，用来调度具体生活事件、选择证据、生成结论。',
            '计划必须让产品侧能解释“为什么设计这些事件”：先拆问题，再说明事件分别考察什么，最后说明结论门槛。',
            '还必须生成 outcomeHypotheses：这是系统内部用于最终匹配的候选后续路径，不会提前展示给用户。',
            'outcomeHypotheses 必须覆盖用户问题下几种主要可能结果，不能只是同义改写；每条都要有生活化结论、支持信号和削弱信号。',
            '事件必须像小镇里真实发生的生活事件，有地点、人物、触发事情、要观察的信息、可用于判断的信号。',
            '地点只能写地图上已有设施：晨桥咖啡馆、钟楼广场、白榆诊所、旧校舍、河边步道、公寓走廊、修理工坊、社区办公室、车站、商店。不要写市集、图书馆、地铁站、餐厅等地图上没有的设施。',
            '不要输出“观察沟通模式”这类抽象事件名；要输出具体生活场景，但人物只能用“我、关键对象、常驻居民A、常驻居民B”这类占位符，不要自己创造姓名或职业称谓。',
            'analysisDimensions 必须输出 6-10 个，必须来自用户问题的不同考察角度，而不是同义改写。',
            'analysisDimensions 可参考但不要机械照抄：外部计划被打断后的即时反应、信息不足时是追问还是脑补、资源缺失时是替代方案还是停滞、他人评价介入时是否被带偏、时间压力下是否能排序优先级、关系对象不配合时是否表达边界、失败后是否恢复生活节奏、是否主动寻求支持、是否把情绪转成具体行动、是否能接受不完美方案。',
            'eventPlans 必须包含不同强度：日常/中等/重大。20 个候选事件建议约 10 个日常、7 个中等、3 个重大；前 8 个里至少 1 个重大或准重大。不要全部是排队、缺货、工具故障、补货这类小阻碍。',
            '所有事件都必须动态生成，不能套固定模板。日常、中等、重大都要根据本次用户问题、关键对象关系、常驻居民性格、地图设施和当前观察维度来创造。',
            '重大事件不是固定清单，也不是随机灾难。它应当是“如果这个用户问题继续发展，现实中可能出现的高后果场景”：关系、钱、身体、安全、住处、身份资格、工作学业、关键机会、家庭责任等，具体选哪一种必须由用户问题和角色关系推导。',
            '中等事件应当明显比普通小阻碍更有压力，例如影响承诺、时间窗口、他人评价、资源归属、责任分配或短期生活安排；日常事件则用于观察轻微打断下的自然反应。三种强度都要具体、生活化、可进入聊天。',
            'trigger 必须是可直接进入聊天的一幕，包含：用户原本要做什么、哪个具体物件/信息/约定卡住了、谁给出什么具体限制。不要只写“缺货、还在处理、工具故障、进度模糊”。',
            'eventPlans 必须尽可能离散：每个事件绑定一个不同 analysisDimensions 维度，并使用不同地点细分、不同物件、不同阻断类型。不要连续使用咖啡、零件、见面、补货、工具故障这类同一母题。',
            'eventPlans 请输出 20 个候选事件；短时会取前 6-8 个，中时取前 12 个，长时取 20 个。前 20 个都不能只是同一事件换说法。',
            'eventPlans 的 observationAxis 必须逐项对应 analysisDimensions 中的不同条目；前 8 个事件不要重复 observationAxis。',
            '不要写角色台词，不要写咨询师建议，不要让伴侣、朋友、居民知道原题。',
            '只输出 JSON，不要 markdown。',
          ].join('\n'),
        },
        {
          role: 'user',
          content: [
            `用户问题：${question}`,
            '输出字段：',
            '{',
            '  "drivingTension": "一句自然的关系/处境张力，不直接复述用户问题",',
            '  "observationGoal": "系统要观察的行为倾向",',
            '  "analysisDimensions": ["6-10 个从用户问题拆出的不同观察维度，如：信息不足时是追问还是脑补、失败后是否恢复生活节奏"],',
            '  "designRationale": "用 1-2 句话解释事件为什么这样设计，以及它们和用户问题的关系",',
            '  "theoreticalBasis": ["2-4 个简短理论依据或方法名，如：压力应对、认知行为、行为激活、社会支持"],',
            '  "evidenceTargets": ["3-5 个可从聊天/事件/行动中观察的证据方向"],',
            '  "eventBeats": ["3-5 个适合在小镇里自然发生的事件触发点"],',
            '  "outcomeHypotheses": [',
            '    {',
            '      "label": "短标签，如：先给自己定规矩",',
            '      "plainConclusion": "生活化结论，如：你更可能先把查看频率和信息来源管起来，而不是一直被情绪拽着走",',
            '      "supportSignals": ["什么表现支持这条路径，如：先核对事实", "把担心写成清单"],',
            '      "weakSignals": ["什么表现会削弱这条路径，如：反复刷消息", "没有任何具体行动"]',
            '    }',
            '  ],',
            '  "eventPlans": [',
            '    {',
            '      "title": "短标题，如：咖啡馆没接话",',
            '      "severity": "日常/中等/重大",',
            '      "scene": "具体地图设施和人物，如：晨桥咖啡馆角桌，我、关键对象、常驻居民A在附近",',
            '      "trigger": "发生的具体事，如：我拿着取货单想买蓝色茶杯，关键对象翻了柜台记录后说只剩白色款，要等下午三点补货",',
            '      "participants": ["我", "关键对象", "常驻居民A"],',
            '      "observationAxis": "这个事件对应哪个观察维度，如：情绪调节",',
            '      "questionLink": "说明它和用户原问题的逻辑关系，如：模拟计划被外部波动打断后是否还能恢复行动",',
            '      "informationGoal": "这个事件为了看什么，如：看我会不会直接表达不安",',
            '      "judgmentSignal": "什么表现可用于判断，如：追问且能说清需求偏修复；冷处理或离开偏回避"',
            '    }',
            '  ],',
            '  "resolutionCriteria": "形成倾向性结论至少需要看到什么"',
            '}',
          ].join('\n'),
        },
      ],
      temperature: 0.2,
    });
    const parsed = parsePlannerJson(content);
    if (!parsed) {
      return null;
    }
    const analysisDimensions = cleanPlannerList(
      parsed.analysisDimensions,
      defaultAnalysisDimensions(),
      6,
      10,
      64,
    );
    return {
      coreQuestion: question,
      drivingTension: cleanPlannerString(parsed.drivingTension, '关系里存在一些没说透的张力。'),
      observationGoal: cleanPlannerString(parsed.observationGoal, '观察用户在压力和关系互动中的自然选择。'),
      analysisDimensions,
      designRationale: cleanPlannerString(
        parsed.designRationale,
        '系统把原问题拆成 6-10 个可观察维度，再让每个小镇事件分别考察一个维度，最后综合聊天、内心和用户行为形成倾向判断。',
      ),
      theoreticalBasis: cleanPlannerList(parsed.theoreticalBasis, [
        '压力与应对',
        '认知行为',
        '行为激活',
      ], 2, 4, 28),
      evidenceTargets: cleanPlannerList(parsed.evidenceTargets, [
        '压力下的第一反应',
        '是否主动核实',
        '是否表达边界',
        '是否尝试修复',
      ]),
      eventBeats: cleanPlannerList(parsed.eventBeats, [
        '关系对象短暂延迟回应',
        '旁人给出不同解读',
        '出现一次可以直接沟通的窗口',
      ]),
      outcomeHypotheses: cleanOutcomeHypotheses(parsed.outcomeHypotheses, question),
      eventPlans: cleanEventPlans(parsed.eventPlans, analysisDimensions),
      resolutionCriteria: cleanPlannerString(
        parsed.resolutionCriteria,
        '至少需要多个不同维度的事件留下聊天、内心或用户行为证据，不能只凭单一事件下结论。',
      ),
    };
  } catch (error) {
    console.warn('Failed to plan MBTI town scene with LLM, falling back to deterministic focus.', error);
    return null;
  }
}

function cleanOutcomeHypotheses(value: unknown, question: string): QuestionFocusInput['outcomeHypotheses'] {
  const fallback = defaultOutcomeHypotheses(question);
  if (!Array.isArray(value)) {
    return fallback;
  }
  const hypotheses = value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const raw = item as Record<string, unknown>;
      return {
        label: cleanPlannerString(raw.label, '一种可能的后续做法', 28),
        plainConclusion: cleanPlannerString(raw.plainConclusion, '用户可能会选择一种相对稳定的应对方式。', 140),
        supportSignals: cleanPlannerList(raw.supportSignals, ['出现具体行动'], 1, 4, 42),
        weakSignals: cleanPlannerList(raw.weakSignals, ['缺少相关行为'], 1, 4, 42),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 6);
  return hypotheses.length >= 3 ? hypotheses : fallback;
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
      return {
        title: cleanPlannerString(raw.title, '小镇里的具体小事', 34),
        severity: cleanEventSeverity(raw.severity, index),
        scene: cleanPlannerString(raw.scene, '小镇公共地点，相关角色在附近', 80),
        trigger: cleanPlannerString(raw.trigger, '发生了一件会让关系张力浮出来的小事', 150),
        participants: cleanPlannerList(raw.participants, ['我'], 1, 4, 12),
        observationAxis: axis,
        questionLink: cleanPlannerString(raw.questionLink, '把原问题里的抽象担忧转成一次可观察的生活选择。', 110),
        informationGoal: cleanPlannerString(raw.informationGoal, '观察用户在压力下的真实反应', 80),
        judgmentSignal: cleanPlannerString(raw.judgmentSignal, '记录用户是靠近沟通、退开回避，还是被旁人影响', 100),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 20);
  return plans.length > 0 ? plans : undefined;
}

function defaultOutcomeHypotheses(question: string): NonNullable<QuestionFocusInput['outcomeHypotheses']> {
  if (/伴侣|女朋友|男朋友|对象|亲密|恋爱|关系|吵架|和好/.test(question)) {
    return [
      {
        label: '还想把话说清楚',
        plainConclusion: '你不太像是单纯想结束，更像是还想把事情讲明白，只是需要对方别再忽冷忽热。',
        supportSignals: ['愿意继续同场沟通', '会追问具体事实', '能表达需求'],
        weakSignals: ['持续沉默离开', '拒绝继续沟通'],
      },
      {
        label: '先退开保护自己',
        plainConclusion: '压力一上来，你可能会先拉开一点距离，让自己别被情绪淹没。',
        supportSignals: ['压力后先沉默或走开', '不急着修复', '想恢复自己的空间'],
        weakSignals: ['主动约对方沟通', '持续靠近对方'],
      },
      {
        label: '找人帮忙校准',
        plainConclusion: '你可能会找可信的人聊聊，确认是不是自己想太多，或者下一步该怎么说。',
        supportSignals: ['向别人说明情况', '请人给建议', '让第三方确认事实'],
        weakSignals: ['完全独自消化', '拒绝外部意见'],
      },
    ];
  }
  return [
    {
      label: '先给自己定规矩',
      plainConclusion: '你更可能先把查看频率和信息来源管起来，而不是一直被情绪拽着走。',
      supportSignals: ['先核对事实', '固定信息来源', '把担心写成清单'],
      weakSignals: ['反复刷消息', '没有具体行动'],
    },
    {
      label: '先离开刺激源',
      plainConclusion: '你可能会先少看消息，把注意力拉回睡觉、吃饭、散步或手头工作。',
      supportSignals: ['主动离开嘈杂场景', '减少查看频率', '恢复生活节奏'],
      weakSignals: ['继续盯着消息', '无法暂停讨论'],
    },
    {
      label: '还是会被消息拽走',
      plainConclusion: '如果外界刺激一直很密，你还是可能反复想后果，生活节奏也会被带着走。',
      supportSignals: ['反复担心后果', '频繁关注消息', '被评价影响很大'],
      weakSignals: ['能稳定停下来', '能按计划做事'],
    },
    {
      label: '找人或工具校准',
      plainConclusion: '你也可能会去问可信的人、查更稳定的信息源，或者用工具帮自己把事情算清楚。',
      supportSignals: ['主动询问别人', '寻找可靠信息源', '请人确认方案'],
      weakSignals: ['不愿求助', '只凭情绪判断'],
    },
  ];
}

function defaultAnalysisDimensions() {
  return [
    '外部计划被打断后的即时反应',
    '信息不足时是追问还是脑补',
    '资源缺失时是替代方案还是停滞',
    '他人评价介入时是否被带偏',
    '时间压力下是否能排序优先级',
    '关系对象不配合时是否表达边界',
    '失败后是否恢复生活节奏',
    '是否主动寻求支持',
    '是否把情绪转成具体行动',
    '是否能接受不完美方案',
  ];
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

function cleanPlannerString(value: unknown, fallback: string, maxLength = 180) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : fallback;
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
