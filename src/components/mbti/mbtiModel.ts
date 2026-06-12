import {
  BehaviorWeights,
  ActorRole,
  MbtiWeights,
  Profile,
  RolePreset,
  Scenario,
  SimulationReport,
  SimulationRun,
  SocialActor,
  TestAnswer,
} from './types';

export const quickMbtiAnswers: TestAnswer[] = [
  {
    axis: 'ei',
    prompt: '周末聚会后，朋友一句话让我有点不舒服',
    example: '比如朋友当众开玩笑说我太敏感，回家后我还在想这件事。',
    leftLabel: '约人聊开',
    rightLabel: '独处消化',
    value: 58,
  },
  {
    axis: 'sn',
    prompt: '伴侣比平时晚了三个小时才回消息',
    example: '他说只是忙，但语气比平时短，也没有解释太多。',
    leftLabel: '看事实经过',
    rightLabel: '想背后含义',
    value: 64,
  },
  {
    axis: 'tf',
    prompt: '同事临时把一项麻烦工作推给我',
    example: '这件事不算大错，但会打乱我的安排，也让我觉得不被尊重。',
    leftLabel: '先算责任代价',
    rightLabel: '先看关系感受',
    value: 62,
  },
  {
    axis: 'jp',
    prompt: '暧昧对象连续几次主动靠近又突然退后',
    example: '聊天很亲近，但每次谈到关系定义，他都会换话题。',
    leftLabel: '尽快问清楚',
    rightLabel: '再观察一阵',
    value: 70,
  },
  {
    axis: 'ei',
    prompt: '一个很熟的人突然变得客气冷淡',
    example: '以前会主动分享日常，现在只回“嗯”“好的”。',
    leftLabel: '主动问状态',
    rightLabel: '先收回自己',
    value: 52,
  },
  {
    axis: 'sn',
    prompt: '朋友说“你开心就好”，但看起来不太开心',
    example: '表面上没有反对，可语气、停顿和表情都让人觉得有话没说。',
    leftLabel: '看实际行动',
    rightLabel: '看语气潜台词',
    value: 68,
  },
  {
    axis: 'tf',
    prompt: '吵架后对方来找我修复关系',
    example: '他说“我们谈谈”，但还没说明自己到底理解了什么。',
    leftLabel: '先讲清原因',
    rightLabel: '先安抚感受',
    value: 65,
  },
  {
    axis: 'jp',
    prompt: '已经安排好的晚上突然被别人改掉',
    example: '原本说好一起吃饭，对方临时说再看，时间和地点都不确定。',
    leftLabel: '压力明显上升',
    rightLabel: '顺势调整',
    value: 57,
  },
];

export const fullMbtiAnswers: TestAnswer[] = [
  ...quickMbtiAnswers,
  {
    axis: 'ei',
    prompt: '压力很大时，我更想找人把事情说出来',
    example: '比如当天遇到烦心事，我会想找熟人复盘一下，而不是独自憋着。',
    leftLabel: '说出来整理',
    rightLabel: '自己先消化',
    value: 55,
  },
  {
    axis: 'ei',
    prompt: '进入陌生场合时，我通常会主动打开话题',
    example: '比如饭局、活动或新团队里，我会先观察还是先找人寒暄。',
    leftLabel: '主动打开',
    rightLabel: '先观察',
    value: 50,
  },
  {
    axis: 'ei',
    prompt: '做重大决定前，我需要和别人讨论才安心',
    example: '比如换城市、换工作、进入关系前，我会希望有人一起分析。',
    leftLabel: '讨论后安心',
    rightLabel: '独立判断',
    value: 54,
  },
  {
    axis: 'ei',
    prompt: '情绪低落时，社交会让我恢复一些能量',
    example: '比如和朋友吃饭、散步或聊天后，我会变轻松还是更累。',
    leftLabel: '社交回血',
    rightLabel: '独处回血',
    value: 48,
  },
  {
    axis: 'ei',
    prompt: '被误解时，我倾向于立刻解释',
    example: '比如对方明显会错意，我会马上澄清，还是先退一步等时机。',
    leftLabel: '立刻解释',
    rightLabel: '暂时收住',
    value: 56,
  },
  {
    axis: 'ei',
    prompt: '我更容易在互动中确认自己的想法',
    example: '有些想法只有聊出来才清楚，或者独自想才更清楚。',
    leftLabel: '边聊边想',
    rightLabel: '独自成形',
    value: 52,
  },
  {
    axis: 'sn',
    prompt: '面对新认识的人，我更看重已经发生的事实',
    example: '比如他说过什么、做过什么，比我对关系走向的感觉更重要。',
    leftLabel: '看已发生事实',
    rightLabel: '看潜在可能',
    value: 46,
  },
  {
    axis: 'sn',
    prompt: '信息不完整时，我容易根据细节联想到整体趋势',
    example: '比如一个语气变化，会让我推测对方态度或关系变化。',
    leftLabel: '先补事实',
    rightLabel: '联想趋势',
    value: 62,
  },
  {
    axis: 'sn',
    prompt: '做选择时，我更信具体经验而不是抽象判断',
    example: '比如别人讲道理时，我仍会问有没有实际例子或过去证据。',
    leftLabel: '具体经验',
    rightLabel: '抽象判断',
    value: 45,
  },
  {
    axis: 'sn',
    prompt: '我会自然注意到话里没说出来的东西',
    example: '比如沉默、停顿、顺序和用词，会让我感觉背后还有别的意思。',
    leftLabel: '只看明说',
    rightLabel: '看未说出口',
    value: 66,
  },
  {
    axis: 'sn',
    prompt: '计划受阻时，我会先确认现实限制',
    example: '比如时间、钱、地点、身体状态等现实条件是否允许继续。',
    leftLabel: '确认限制',
    rightLabel: '寻找意义',
    value: 50,
  },
  {
    axis: 'sn',
    prompt: '我更容易被“未来可能怎样”影响情绪',
    example: '比如事情还没发生，但想到某种结果就已经紧张或期待。',
    leftLabel: '少想未来',
    rightLabel: '预演未来',
    value: 60,
  },
  {
    axis: 'tf',
    prompt: '冲突里，我会先判断谁的责任更清楚',
    example: '比如吵架、合作失败或承诺落空时，我先看责任边界还是情绪伤害。',
    leftLabel: '责任边界',
    rightLabel: '情绪伤害',
    value: 48,
  },
  {
    axis: 'tf',
    prompt: '别人难过时，我会先安抚，而不是先分析',
    example: '哪怕我知道解决方案，也会先让对方感觉被理解。',
    leftLabel: '先给方案',
    rightLabel: '先安抚',
    value: 64,
  },
  {
    axis: 'tf',
    prompt: '做重要选择时，我更怕亏欠人情',
    example: '比如拒绝别人、改变承诺或照顾自己时，会不会先想到对方感受。',
    leftLabel: '看原则代价',
    rightLabel: '怕亏欠感受',
    value: 58,
  },
  {
    axis: 'tf',
    prompt: '我能接受短期不舒服，只要逻辑上是对的',
    example: '比如一段关系需要冷处理，或一项决定会让人不高兴但更合理。',
    leftLabel: '逻辑优先',
    rightLabel: '感受优先',
    value: 46,
  },
  {
    axis: 'tf',
    prompt: '我很容易感受到别人语气里的情绪',
    example: '哪怕对方说没事，我也会被语气、表情或回复速度影响。',
    leftLabel: '不太受影响',
    rightLabel: '很容易感到',
    value: 68,
  },
  {
    axis: 'tf',
    prompt: '争执后，我需要对方说清事实和责任',
    example: '只说“别生气了”不够，我需要知道到底怎么理解这件事。',
    leftLabel: '讲清事实',
    rightLabel: '先恢复关系',
    value: 52,
  },
  {
    axis: 'jp',
    prompt: '事情悬而未决时，我会明显不安',
    example: '比如关系没定义、时间没定、结果没出，我会反复想着。',
    leftLabel: '需要确定',
    rightLabel: '可以悬着',
    value: 68,
  },
  {
    axis: 'jp',
    prompt: '我喜欢提前安排，而不是临场发挥',
    example: '比如旅行、见面、办事或搬家，我更希望先有清楚计划。',
    leftLabel: '提前安排',
    rightLabel: '临场发挥',
    value: 62,
  },
  {
    axis: 'jp',
    prompt: '计划被打乱后，我会先想办法重新排顺序',
    example: '比起停在情绪里，我会想下一步、替代方案和优先级。',
    leftLabel: '重排顺序',
    rightLabel: '顺势看看',
    value: 58,
  },
  {
    axis: 'jp',
    prompt: '我不喜欢别人临时改变约定',
    example: '即使事情不大，临时变化也会让我觉得秩序被破坏。',
    leftLabel: '很不喜欢',
    rightLabel: '可以接受',
    value: 60,
  },
  {
    axis: 'jp',
    prompt: '我更愿意先定一个不完美方案',
    example: '比起一直等最优解，我宁愿先有一个可以执行的版本。',
    leftLabel: '先定方案',
    rightLabel: '继续开放',
    value: 56,
  },
  {
    axis: 'jp',
    prompt: '面对新机会，我愿意暂时放下原计划',
    example: '比如突然出现更有趣的人、工作或安排，我会不会立刻调整。',
    leftLabel: '守住原计划',
    rightLabel: '接受新机会',
    value: 48,
  },
];

export const defaultAnswers = quickMbtiAnswers;

export const scenarioPresets: Scenario[] = [
  {
    id: 'silent-partner',
    title: '伴侣长时间不回复',
    question: '如果亲密关系里对方一直不回消息，我会怎样处理？',
    pressure: { ambiguity: 86, intimacy: 82, conflict: 62, publicness: 20, timePressure: 74 },
  },
  {
    id: 'friend-pressure',
    title: '朋友强烈介入关系判断',
    question: '朋友不断告诉我这段关系不值得，我会被影响到什么程度？',
    pressure: { ambiguity: 70, intimacy: 64, conflict: 70, publicness: 72, timePressure: 58 },
  },
  {
    id: 'work-dispute',
    title: '同事误解我的边界',
    question: '当同事误解我并公开表达不满，我会怎么修复局面？',
    pressure: { ambiguity: 58, intimacy: 20, conflict: 78, publicness: 88, timePressure: 66 },
  },
  {
    id: 'distance-relationship',
    title: '异地关系的不确定感',
    question: '我是否适合长期异地关系，压力会出现在哪里？',
    pressure: { ambiguity: 78, intimacy: 76, conflict: 46, publicness: 24, timePressure: 52 },
  },
];

export const defaultQuestion = '如果亲密关系里对方一直不回消息，我会怎样处理？';

export const defaultRolePresets: Record<'partner' | 'friend', RolePreset> = {
  partner: {
    id: 'default-partner',
    enabled: false,
    role: 'partner',
    label: '关键对象',
    mapping: '问题里的伴侣/女朋友/对方/她',
    mbtiCode: '',
    traits: '',
    reason: '默认关键对象',
  },
  friend: {
    id: 'default-friend',
    enabled: false,
    role: 'friend',
    label: '朋友/支持者',
    mapping: '问题里的朋友/支持者',
    mbtiCode: '',
    traits: '',
    reason: '默认朋友/支持者',
  },
};

export const partnerProfiles: SocialActor[] = [
  {
    id: 'warm-f',
    role: 'partner',
    label: '高 F 安抚型伴侣',
    weights: { f: 82, t: 18, e: 56, i: 44, j: 54, p: 46 },
    tendency: '会先回应情绪，再解释事实。',
  },
  {
    id: 'avoidant-i',
    role: 'partner',
    label: '高 I 回避型伴侣',
    weights: { i: 84, e: 16, t: 58, f: 42, p: 68, j: 32 },
    tendency: '压力高时容易沉默、延迟回应。',
  },
  {
    id: 'direct-tj',
    role: 'partner',
    label: '高 T/J 直接型伴侣',
    weights: { t: 78, f: 22, j: 82, p: 18, e: 52, i: 48 },
    tendency: '会快速给方案，但可能忽略感受。',
  },
  {
    id: 'open-p',
    role: 'partner',
    label: '高 P 松散型伴侣',
    weights: { p: 82, j: 18, e: 60, i: 40, f: 54, t: 46 },
    tendency: '不急着定义状态，容易让高 J 对象焦虑。',
  },
];

export const friendProfiles: SocialActor[] = [
  {
    id: 'mediator',
    role: 'friend',
    label: '劝和型朋友',
    weights: { f: 74, t: 26, j: 58, p: 42 },
    tendency: '帮双方降温，鼓励表达真实需求。',
  },
  {
    id: 'protector',
    role: 'friend',
    label: '保护型朋友',
    weights: { f: 82, t: 18, j: 68, p: 32 },
    tendency: '更关注你是否受伤，容易建议拉开距离。',
  },
  {
    id: 'analyst',
    role: 'friend',
    label: '理性分析型朋友',
    weights: { t: 84, f: 16, s: 68, n: 32 },
    tendency: '要求回到事实证据，减少过度推演。',
  },
  {
    id: 'amplifier',
    role: 'friend',
    label: '情绪放大型朋友',
    weights: { e: 78, i: 22, n: 72, s: 28, f: 70, t: 30 },
    tendency: '会强化情绪解释，让事件更戏剧化。',
  },
];

export function inferRolePresets(question: string, previous: RolePreset[] = []): RolePreset[] {
  const text = question.trim();
  const candidates: Array<{
    role: ActorRole;
    label: string;
    mapping: string;
    mbtiCode: string;
    reason: string;
    words: string[];
  }> = [
    {
      role: 'partner',
      label: '伴侣',
      mapping: '伴侣/女朋友/男朋友/对象/她/他/对方',
      mbtiCode: '',
      reason: '问题里出现了伴侣/亲密关系相关对象。',
      words: ['伴侣', '男朋友', '女朋友', '恋人', '对象', '亲密关系', '老公', '老婆'],
    },
    {
      role: 'ambiguous',
      label: '暧昧对象',
      mapping: '暧昧对象/喜欢的人/她/他/对方',
      mbtiCode: '',
      reason: '问题里出现了暧昧、喜欢或关系未定义对象。',
      words: ['暧昧', '喜欢的人', 'crush', '约会对象'],
    },
    {
      role: 'friend',
      label: '朋友',
      mapping: '朋友/闺蜜/兄弟/同学/室友',
      mbtiCode: '',
      reason: '问题里出现了朋友或旁观建议者。',
      words: ['朋友', '闺蜜', '兄弟', '同学', '室友'],
    },
    {
      role: 'coworker',
      label: '同事',
      mapping: '同事/上司/领导/老板/客户',
      mbtiCode: '',
      reason: '问题里出现了同事、上级或工作协作对象。',
      words: ['同事', '上司', '领导', '老板', '客户', '工作', '项目'],
    },
    {
      role: 'family',
      label: '家人',
      mapping: '家人/父母/妈妈/爸爸/亲戚/孩子',
      mbtiCode: '',
      reason: '问题里出现了家庭成员。',
      words: ['家人', '父母', '妈妈', '爸爸', '亲戚', '孩子'],
    },
    {
      role: 'ex',
      label: '前任',
      mapping: '前任/前男友/前女友/旧关系',
      mbtiCode: '',
      reason: '问题里出现了前任或旧关系。',
      words: ['前任', '前男友', '前女友', '旧关系'],
    },
  ];
  const inferred = candidates
    .filter((candidate) => hasAny(text, candidate.words))
    .map((candidate) => {
      const existing = previous.find((item) => item.role === candidate.role);
      return {
        id: existing?.id ?? `inferred-${candidate.role}`,
        enabled: existing?.enabled ?? true,
        role: candidate.role,
        label: existing?.label || candidate.label,
        mapping: existing?.mapping || candidate.mapping,
        mbtiCode: existing?.mbtiCode || candidate.mbtiCode,
        traits: existing?.traits ?? '',
        reason: candidate.reason,
      };
    });
  if (inferred.length > 0) {
    return inferred;
  }
  return [];
}

export function buildProfile(answers: TestAnswer[]): Profile {
  const axisTotals = {
    ei: averageAxis(answers, 'ei'),
    sn: averageAxis(answers, 'sn'),
    tf: averageAxis(answers, 'tf'),
    jp: averageAxis(answers, 'jp'),
  };
  const weights: MbtiWeights = {
    e: 100 - axisTotals.ei,
    i: axisTotals.ei,
    s: 100 - axisTotals.sn,
    n: axisTotals.sn,
    t: 100 - axisTotals.tf,
    f: axisTotals.tf,
    j: axisTotals.jp,
    p: 100 - axisTotals.jp,
  };
  return {
    code: `${weights.e >= weights.i ? 'E' : 'I'}${weights.s >= weights.n ? 'S' : 'N'}${
      weights.t >= weights.f ? 'T' : 'F'
    }${weights.j >= weights.p ? 'J' : 'P'}`,
    weights,
    behaviors: toBehaviorWeights(weights),
  };
}

export function runSimulation(
  profile: Profile,
  scenario: Scenario,
  runCount = 48,
  rolePresets: RolePreset[] | Record<'partner' | 'friend', RolePreset> = defaultRolePresets,
): SimulationReport {
  const runs: SimulationRun[] = [];
  const normalizedPresets = Array.isArray(rolePresets)
    ? rolePresets
    : [rolePresets.partner, rolePresets.friend];
  const partners = actorSet('partner', partnerProfiles, normalizedPresets);
  const friends = actorSet('friend', friendProfiles, normalizedPresets);
  for (let index = 0; index < runCount; index += 1) {
    const partner = partners[index % partners.length];
    const friend = friends[Math.floor(index / partners.length) % friends.length];
    runs.push(simulateRun(index + 1, profile, scenario, partner, friend));
  }
  return aggregateReport(runs);
}

export function customScenario(question: string): Scenario {
  return {
    id: 'custom-question',
    title: '用户自定义问题',
    question,
    pressure: inferPressure(question),
  };
}

function averageAxis(answers: TestAnswer[], axis: TestAnswer['axis']) {
  const values = answers.filter((answer) => answer.axis === axis).map((answer) => answer.value);
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function actorSet(role: 'partner' | 'friend', defaults: SocialActor[], presets: RolePreset[]) {
  const relevantRoles: ActorRole[] =
    role === 'partner' ? ['partner', 'ambiguous', 'coworker', 'family', 'ex', 'other'] : ['friend'];
  const enabledPresets = presets.filter(
    (preset) => preset.enabled && relevantRoles.includes(preset.role),
  );
  if (enabledPresets.length === 0) {
    return defaults;
  }
  return enabledPresets.map((preset) => ({
    id: `custom-${preset.role}`,
    role: preset.role,
    label: preset.label.trim() || '对方',
    weights: mbtiToWeights(preset.mbtiCode),
    tendency:
      preset.traits.trim() ||
      (preset.mbtiCode.trim()
        ? `${preset.mbtiCode.toUpperCase()} 倾向，未补充额外关系背景。`
        : '未预设 MBTI，等待小镇互动自然显现倾向。'),
  }));
}

function mbtiToWeights(code: string): Partial<MbtiWeights> {
  const normalized = code.toUpperCase();
  if (!normalized) {
    return {};
  }
  return {
    e: normalized.includes('E') ? 76 : 24,
    i: normalized.includes('I') ? 76 : 24,
    s: normalized.includes('S') ? 76 : 24,
    n: normalized.includes('N') ? 76 : 24,
    t: normalized.includes('T') ? 76 : 24,
    f: normalized.includes('F') ? 76 : 24,
    j: normalized.includes('J') ? 76 : 24,
    p: normalized.includes('P') ? 76 : 24,
  };
}

function inferPressure(question: string): Scenario['pressure'] {
  const text = question.toLowerCase();
  return {
    ambiguity: hasAny(text, ['不回', '冷淡', '暧昧', '不确定', '异地', '沉默']) ? 86 : 64,
    intimacy: hasAny(text, ['伴侣', '亲密', '恋爱', '喜欢', '暧昧', '异地']) ? 82 : 42,
    conflict: hasAny(text, ['吵', '冲突', '误解', '不满', '冷淡', '分歧']) ? 76 : 48,
    publicness: hasAny(text, ['朋友', '同事', '公开', '群', '大家']) ? 72 : 28,
    timePressure: hasAny(text, ['一直', '马上', '尽快', '长期', '拖', '不回']) ? 76 : 52,
  };
}

function toBehaviorWeights(weights: MbtiWeights): BehaviorWeights {
  return {
    socialInitiation: Math.round(weights.e * 0.65 + weights.j * 0.2 + weights.f * 0.15),
    withdrawal: Math.round(weights.i * 0.72 + weights.p * 0.16 + weights.t * 0.12),
    factChecking: Math.round(weights.s * 0.62 + weights.t * 0.28 + weights.j * 0.1),
    meaningProjection: Math.round(weights.n * 0.68 + weights.f * 0.2 + weights.i * 0.12),
    logicFraming: Math.round(weights.t * 0.72 + weights.s * 0.18 + weights.j * 0.1),
    emotionalSensitivity: Math.round(weights.f * 0.68 + weights.n * 0.18 + weights.i * 0.14),
    closureNeed: Math.round(weights.j * 0.76 + weights.f * 0.14 + weights.s * 0.1),
    openness: Math.round(weights.p * 0.74 + weights.e * 0.16 + weights.n * 0.1),
    repairDrive: Math.round(weights.f * 0.42 + weights.j * 0.26 + weights.e * 0.18 + weights.s * 0.14),
    rumination: Math.round(weights.n * 0.36 + weights.i * 0.32 + weights.f * 0.2 + weights.j * 0.12),
  };
}

function simulateRun(
  id: number,
  profile: Profile,
  scenario: Scenario,
  partner: SocialActor,
  friend: SocialActor,
): SimulationRun {
  const b = profile.behaviors;
  const partnerAvoidance = scoreActor(partner, 'i') * 0.45 + scoreActor(partner, 'p') * 0.25;
  const partnerComfort = scoreActor(partner, 'f') * 0.42 + scoreActor(partner, 'e') * 0.18;
  const friendAmplifies = friend.id === 'amplifier' || friend.id === 'protector';
  const friendStabilizes = friend.id === 'mediator' || friend.id === 'analyst';
  const random = seededNoise(id, profile.code, scenario.id);

  const stress = clamp(
    scenario.pressure.ambiguity * 0.26 +
      scenario.pressure.conflict * 0.2 +
      scenario.pressure.intimacy * 0.18 +
      b.emotionalSensitivity * 0.16 +
      b.rumination * 0.12 +
      partnerAvoidance * 0.16 +
      (friendAmplifies ? 10 : 0) -
      partnerComfort * 0.12 -
      (friendStabilizes ? 8 : 0) +
      random * 16,
  );
  const repair = clamp(
    b.repairDrive * 0.34 +
      b.socialInitiation * 0.18 +
      partnerComfort * 0.22 +
      (friendStabilizes ? 10 : 0) -
      partnerAvoidance * 0.16 -
      scenario.pressure.publicness * 0.06 +
      random * 10,
  );
  const closure = clamp(b.closureNeed * 0.62 + scenario.pressure.timePressure * 0.2 + random * 10);
  const exploration = clamp(b.openness * 0.44 + b.withdrawal * 0.16 - closure * 0.14 + random * 12);

  let action = '克制观察';
  let outcome = '关系没有立刻恶化，但不确定感仍然存在。';
  if (stress > 74 && closure > 68 && repair < 52) {
    action = '直接追问关系状态';
    outcome = '短期压力上升，但更快暴露真实矛盾。';
  } else if (repair > 66 && stress < 78) {
    action = '主动修复沟通';
    outcome = '更可能把冲突转成可讨论的问题。';
  } else if (stress > 70 && exploration > 48) {
    action = '先找朋友确认';
    outcome = friendStabilizes ? '朋友帮助回到事实，冲突降温。' : '朋友放大解释，情绪判断变重。';
  } else if (profile.weights.i > 62 && stress > 58) {
    action = '退回独处消化';
    outcome = '外部冲突暂缓，但内在推演继续累积。';
  }

  return {
    id,
    scenarioTitle: scenario.title,
    partner,
    friend,
    action,
    outcome,
    confidence: Math.round(Math.max(stress, repair, closure) - Math.min(stress, repair) / 4),
    stress: Math.round(stress),
    repair: Math.round(repair),
    trace: [
      `压力源：${scenario.title}`,
      `${partner.label}：${partner.tendency}`,
      `${friend.label}：${friend.tendency}`,
      `内部权重：情绪敏感 ${b.emotionalSensitivity}，闭环需求 ${b.closureNeed}，反刍 ${b.rumination}`,
      `行为选择：${action}`,
    ],
    chat: buildChat(action, partner, friend),
    events: buildEvents(action, partner, friend, Math.round(stress), Math.round(repair)),
    innerThoughts: buildInnerThoughts(action, profile, Math.round(stress), Math.round(repair)),
  };
}

function buildChat(action: string, partner: SocialActor, friend: SocialActor) {
  if (action === '直接追问关系状态') {
    return [
      { speaker: '我', text: '我想确认一下，你这段时间不回消息，是忙，还是我们之间有什么变化？' },
      { speaker: partner.label, text: '我不是故意不回，只是压力大时会先退开。' },
      { speaker: '我', text: '可以退开，但我需要知道这不是关系被悬着。' },
    ];
  }
  if (action === '主动修复沟通') {
    return [
      { speaker: '我', text: '我不想把这件事放大，但也不想假装没受影响。' },
      { speaker: partner.label, text: '我能理解，我先说清楚刚才发生了什么。' },
      { speaker: '我', text: '好，我也会说我真正介意的部分。' },
    ];
  }
  if (action === '先找朋友确认') {
    return [
      { speaker: '我', text: '我有点分不清这是事实问题，还是我自己想多了。' },
      { speaker: friend.label, text: friend.id === 'analyst' ? '先列事实，不要直接推结论。' : '你先别一个人憋着，这件事确实会让人不舒服。' },
      { speaker: '我', text: '我先把事实和感受分开，再决定要不要问。' },
    ];
  }
  if (action === '退回独处消化') {
    return [
      { speaker: '我', text: '我现在不太适合马上聊，先缓一下。' },
      { speaker: partner.label, text: '好，我晚点再找你。' },
      { speaker: '我', text: '我需要一点时间确认自己真正介意的是什么。' },
    ];
  }
  return [
    { speaker: '我', text: '我先观察一下，不急着下判断。' },
    { speaker: partner.label, text: '我知道这可能让你不安，我会尽量说清楚。' },
    { speaker: '我', text: '如果后面还是这样，我会再明确提出来。' },
  ];
}

function buildEvents(
  action: string,
  partner: SocialActor,
  friend: SocialActor,
  stress: number,
  repair: number,
) {
  return [
    `场景开始：关键对象为「${partner.label}」，旁观支持者为「${friend.label}」。`,
    `压力读数：${stress}/100；修复动机：${repair}/100。`,
    `行为事件：用户人格代理选择「${action}」。`,
  ];
}

function buildInnerThoughts(action: string, profile: Profile, stress: number, repair: number) {
  const base = `我是 ${profile.code} 倾向。压力 ${stress}/100，修复动机 ${repair}/100。`;
  if (action === '直接追问关系状态') {
    return [base, '我最难受的不是晚回复本身，而是状态悬着；问清楚至少能让我知道自己站在哪里。'];
  }
  if (action === '主动修复沟通') {
    return [base, '我还想把关系往回拉一下，但需要对方真的听懂，而不是只把事情压下去。'];
  }
  if (action === '先找朋友确认') {
    return [base, '我担心自己过度解读，所以先找一个外部视角帮我校准。'];
  }
  if (action === '退回独处消化') {
    return [base, '我不想在情绪最满的时候把话说死，先退一步可能比较安全。'];
  }
  return [base, '现在证据还不够，我先观察，但会记住这个不舒服的点。'];
}

function aggregateReport(runs: SimulationRun[]): SimulationReport {
  const counts = new Map<string, number>();
  for (const run of runs) {
    counts.set(run.action, (counts.get(run.action) ?? 0) + 1);
  }
  const distribution = [...counts.entries()]
    .map(([action, count]) => ({ action, count, percent: Math.round((count / runs.length) * 100) }))
    .sort((a, b) => b.count - a.count);
  const top = distribution[0];
  const stableTendencies = [
    top ? `${top.percent}% 的分支选择了「${top.action}」，这是当前人格权重下最稳定的行为倾向。` : '',
    average(runs.map((run) => run.stress)) >= 68
      ? '高压力情景下，不确定感会持续推高内在消耗。'
      : '压力会上升，但多数分支仍能维持可讨论状态。',
    average(runs.map((run) => run.repair)) >= 60
      ? '修复动机足够明显，结论不应简化为逃避或爆发。'
      : '修复动机不稳定，更容易受对方回应方式影响。',
  ].filter(Boolean);
  const conditionalTriggers = [
    '当伴侣是高 I/P 回避型时，追问或退回独处的概率上升。',
    '当朋友是理性分析型或劝和型时，模拟更容易从情绪推演回到事实确认。',
    '当朋友强化情绪解释时，同一人格更容易把沉默理解成关系风险。',
  ];
  const mainAction = top?.action;
  const counterexamples = runs
    .filter((run) => run.action !== mainAction)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);
  return { runs, distribution, stableTendencies, conditionalTriggers, counterexamples };
}

function scoreActor(actor: SocialActor, key: keyof MbtiWeights) {
  return actor.weights[key] ?? 50;
}

function hasAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

function seededNoise(id: number, code: string, scenarioId: string) {
  const source = `${id}-${code}-${scenarioId}`;
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) % 9973;
  }
  return hash / 9973 - 0.5;
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}
