import {
  BehaviorWeights,
  MbtiWeights,
  Profile,
  Scenario,
  SimulationReport,
  SimulationRun,
  SocialActor,
  TestAnswer,
} from './types';

export const defaultAnswers: TestAnswer[] = [
  {
    axis: 'ei',
    prompt: '遇到关系压力时，我更自然的恢复方式是',
    leftLabel: '找人聊清楚',
    rightLabel: '先独处消化',
    value: 58,
  },
  {
    axis: 'sn',
    prompt: '判断一件事时，我更先关注',
    leftLabel: '已经发生的事实',
    rightLabel: '背后的含义',
    value: 64,
  },
  {
    axis: 'tf',
    prompt: '冲突中最影响我判断的是',
    leftLabel: '逻辑和代价',
    rightLabel: '感受和关系',
    value: 62,
  },
  {
    axis: 'jp',
    prompt: '面对悬而未决的关系状态，我更倾向于',
    leftLabel: '尽快确认闭环',
    rightLabel: '保留变化空间',
    value: 70,
  },
  {
    axis: 'ei',
    prompt: '如果对方突然冷淡，我通常会',
    leftLabel: '主动确认状态',
    rightLabel: '减少暴露自己',
    value: 52,
  },
  {
    axis: 'sn',
    prompt: '我更容易被哪类信息触发',
    leftLabel: '具体行为变化',
    rightLabel: '语气和潜台词',
    value: 68,
  },
  {
    axis: 'tf',
    prompt: '修复关系时，我更希望对方',
    leftLabel: '给出清晰解释',
    rightLabel: '先接住情绪',
    value: 65,
  },
  {
    axis: 'jp',
    prompt: '计划被打乱时，我的压力通常',
    leftLabel: '明显上升',
    rightLabel: '还能顺势调整',
    value: 57,
  },
];

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

export function runSimulation(profile: Profile, scenario: Scenario, runCount = 48): SimulationReport {
  const runs: SimulationRun[] = [];
  for (let index = 0; index < runCount; index += 1) {
    const partner = partnerProfiles[index % partnerProfiles.length];
    const friend = friendProfiles[Math.floor(index / partnerProfiles.length) % friendProfiles.length];
    runs.push(simulateRun(index + 1, profile, scenario, partner, friend));
  }
  return aggregateReport(runs);
}

function averageAxis(answers: TestAnswer[], axis: TestAnswer['axis']) {
  const values = answers.filter((answer) => answer.axis === axis).map((answer) => answer.value);
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
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
  };
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
