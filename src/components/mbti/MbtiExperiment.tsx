import { CSSProperties, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Stage } from '@pixi/react';
import { ConvexProvider, useConvex } from 'convex/react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { useElementSize } from 'usehooks-ts';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { GameId } from '../../../convex/aiTown/ids';
import PixiGame from '../PixiGame';
import PlayerDetails from '../PlayerDetails';
import { useServerGame } from '../../hooks/serverGame';
import { useHistoricalTime } from '../../hooks/useHistoricalTime';
import { useWorldHeartbeat } from '../../hooks/useWorldHeartbeat';
import {
  buildProfile,
  defaultQuestion,
  fullMbtiAnswers,
  inferRolePresets,
  quickMbtiAnswers,
} from './mbtiModel';
import { RolePreset, TestAnswer } from './types';
import {
  compactText,
  correctionEvidencePreviewItems,
  eventSourceSummaryText,
  eventStatusLabel,
  eventTimelineReasonText,
  guidanceResultText,
  plannedEventSections,
  selectEventRelatedMessages,
  shouldShowEventCorrectionControls,
  summarizeEventRuntime,
} from './eventProgress';
import { MainExperimentStep, normalizeStoredStep, settleStaleCreatingEntry } from './historyState';
import { objectModeHintForQuestion, objectSummaryForQuestion } from './mbtiDisplay';
import { startupQuestionMaxSelections, toggleStartupOption } from './startupQuestions';
import { liveTownTimelineNode, simulatedTownDayMs, townTimelineLocationLabel } from './townClock';
import './MbtiExperiment.css';

const baseExperimentScales = [
  {
    id: 'short',
    label: '快速探路',
    durationMs: 30 * 60 * 1000,
    targetEventCount: 6,
    description: '先跑最低 30 分钟小镇时间，快速建立第一批反应证据；不足时继续自动补事件。',
  },
  {
    id: 'standard',
    label: '自动演化',
    durationMs: 60 * 60 * 1000,
    targetEventCount: 12,
    description: '默认策略。最低观察 1 小时小镇时间，直到答案位置足够明确再形成阶段结论。',
  },
  {
    id: 'long',
    label: '长期观察',
    durationMs: 2 * 60 * 60 * 1000,
    targetEventCount: 20,
    description: '2-8 小时最低观察窗口，用来检验长期稳定性、生活节奏和关系反馈。',
  },
] as const;

const fastExperimentScale = {
  id: 'fast',
  label: '快速验收',
  durationMs: 2 * 60 * 1000,
  targetEventCount: 4,
  description: '2 分钟，仅用于本地端到端验收，不代表真实观察策略。',
} as const;

type ExperimentScale = (typeof baseExperimentScales)[number] | typeof fastExperimentScale;
type TestMode = 'quick' | 'full';
type Step = MainExperimentStep;
type TownRunStatus = 'draft' | 'creating' | 'awaiting_user_responses' | 'running' | 'complete' | 'failed';
type ObserveTab = 'chat' | 'thoughts' | 'memories' | 'events';

type ExperimentReport = {
  generatedAt: number;
  summary: string;
  personalityFit: string;
  evidence: string[];
  conclusion: string;
  decisionInsights?: {
    why: string;
    changeConditions: string;
    stableValue: string;
    nextValidation: string;
  };
  decisionStructure?: DecisionStructure;
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

type DecisionStructure = {
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

type ReasonablenessDiscussion = {
  plausibleInterpretation: string;
  whyReasonable: string[];
  possibleMisreads: string[];
  assumptionsToConfirm: string[];
  alternativeFrames: string[];
  discussionPrompt: string;
};

type ValidationTarget = {
  id: string;
  label: string;
  source: 'decisionDimension' | 'unknown' | 'hiddenNeed' | 'riskBlindspot' | 'startupAnswer';
  priority: 'must' | 'should' | 'optional';
  whatWouldTestIt: string;
  badEventPattern?: string;
};

type UserResponse = {
  _id: string;
  experimentId: string;
  mbtiEventId: string;
  selectedOption: string;
  confidence: number;
  emotions: string[];
  freeText: string;
  scenarioFit: 'fits' | 'partial' | 'not_fit';
  feedbackType?: FeedbackType;
  correctionText?: string;
  responseStatus: 'responded' | 'skipped' | 'expired_to_stage_report';
};

type EventAssessment = {
  _id: string;
  experimentId: string;
  mbtiEventId: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  evidenceCount: number;
  evidenceSignature: string;
  summary?: string;
  inference?: string;
  next?: string;
  evidenceUsed?: string[];
  error?: string;
};

type FeedbackType =
  | 'user_reaction'
  | 'unrealistic_event'
  | 'unrealistic_person'
  | 'hit_real_issue'
  | 'condition_correction';

type DecisionState = {
  resolvedVariables: string[];
  uncertainVariables: string[];
  confirmedConstraints: string[];
  sensitiveConditions: string[];
  responseCoverage: {
    responded: number;
    required: number;
    missing: number;
  };
  lastUserCorrection?: string;
};

type QuestionFocus = {
  coreQuestion: string;
  drivingTension: string;
  observationGoal: string;
  decisionStructure?: DecisionStructure;
  reasonablenessDiscussion?: ReasonablenessDiscussion;
  validationTargets?: ValidationTarget[];
  analysisDimensions?: string[];
  designRationale?: string;
  theoreticalBasis?: string[];
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
    locationKey?: string;
    scene: string;
    trigger: string;
    participants: string[];
    observationAxis?: string;
    questionLink?: string;
    informationGoal: string;
    judgmentSignal: string;
    coveredTargetIds?: string[];
    whyThisTestsIt?: string;
    responseOptions?: string[];
  }>;
  resolutionCriteria: string;
};

type HistoryEntry = {
  id: string;
  createdAt: number;
  question: string;
  profileCode: string;
  scaleLabel: string;
  rolePresets: RolePreset[];
  status: TownRunStatus;
  townId?: string;
  sceneRequestId?: string;
  sceneType?: string;
  selectedLocationKey?: string;
  selectedResidentKeys?: string[];
  questionFocus?: QuestionFocus;
  ephemeralParticipantKeys?: string[];
  experimentId?: string;
  worldId?: string;
  engineId?: string;
  agentInputIds?: string[];
  error?: string;
  completedAt?: number;
  report?: ExperimentReport;
};

type StoredExperimentState = {
  answers?: TestAnswer[];
  testMode?: TestMode;
  answersByMode?: Partial<Record<TestMode, TestAnswer[]>>;
  question?: string;
  activeQuestion?: string;
  rolePresets?: RolePreset[] | Record<'partner' | 'friend', RolePreset>;
  experimentScaleId?: string;
  customDurationHours?: number;
  activeSession?: HistoryEntry;
  activeStep?: Step;
  runStartedAt?: number;
  history?: unknown[];
};

const storageKey = 'mbti-town-lab:v1';
const historyResetKey = 'mbti-town-history-reset:2026-06-10-room';
const stateCompatibilityKey = 'mbti-town-state-compat:2026-06-12-experiment-id-v2';
const convexIdPattern = /^[a-z0-9]+$/;
const sliderScaleMarks = [0, 25, 50, 75, 100];
const creatingSessionTimeoutMs = 11 * 60 * 1000;
const creatingTimeoutMessage =
  '加入常驻小镇等待超时。系统已经按规则自动等待长生成和最多 3 次重试，本轮已终止；请检查 Convex 后端和本地 LLM/Ollama 是否可用，或调整问题后再进入。';
const customDurationMinHours = 2;
const customDurationMaxHours = 8;
const mbtiTestModes: Array<{
  id: TestMode;
  label: string;
  count: number;
  description: string;
}> = [
  {
    id: 'quick',
    label: '精简版',
    count: quickMbtiAnswers.length,
    description: '8 题快速采样，适合先跑一次小镇演化。',
  },
  {
    id: 'full',
    label: '全量版',
    count: fullMbtiAnswers.length,
    description: '32 题完整采样，每个维度覆盖更多生活情境。',
  },
];
const joiningTownSteps = [
  {
    title: '理解你的问题',
    detail: '拆出本轮真正需要观察的择偶变量',
  },
  {
    title: '设计情境探针',
    detail: '生成和问题直接相关的具体生活事件',
  },
  {
    title: '安排角色入场',
    detail: '把访客、临时对象和常驻居民放进同一轮观察',
  },
] as const;
const personalityMeta = {
  INTJ: { title: '战略规划者', group: '分析型', tone: 'violet', badge: '棋' },
  INTP: { title: '模型构建者', group: '分析型', tone: 'violet', badge: '理' },
  ENTJ: { title: '系统指挥者', group: '分析型', tone: 'violet', badge: '令' },
  ENTP: { title: '可能性辩手', group: '分析型', tone: 'violet', badge: '辩' },
  INFJ: { title: '深层洞察者', group: '共情型', tone: 'teal', badge: '察' },
  INFP: { title: '价值守护者', group: '共情型', tone: 'teal', badge: '心' },
  ENFJ: { title: '关系引导者', group: '共情型', tone: 'teal', badge: '引' },
  ENFP: { title: '灵感连接者', group: '共情型', tone: 'teal', badge: '光' },
  ISTJ: { title: '秩序执行者', group: '稳健型', tone: 'slate', badge: '序' },
  ISFJ: { title: '细节照料者', group: '稳健型', tone: 'slate', badge: '护' },
  ESTJ: { title: '规则组织者', group: '稳健型', tone: 'slate', badge: '管' },
  ESFJ: { title: '群体维护者', group: '稳健型', tone: 'slate', badge: '和' },
  ISTP: { title: '现场解决者', group: '行动型', tone: 'amber', badge: '工' },
  ISFP: { title: '感受表达者', group: '行动型', tone: 'amber', badge: '感' },
  ESTP: { title: '机会行动者', group: '行动型', tone: 'amber', badge: '动' },
  ESFP: { title: '气氛点亮者', group: '行动型', tone: 'amber', badge: '乐' },
} as const;

type PersonalityCode = keyof typeof personalityMeta;
const personalityCodeOptions = Object.keys(personalityMeta) as PersonalityCode[];

function normalizePersonalityCode(code: string | undefined): PersonalityCode | undefined {
  const normalized = code?.trim().toUpperCase();
  return normalized && normalized in personalityMeta ? normalized as PersonalityCode : undefined;
}

function normalizeRolePreset(preset: RolePreset): RolePreset {
  return {
    ...preset,
    id: preset.id || `${preset.role}-${preset.label || 'role'}-${preset.mapping || 'mapping'}`,
    mapping: preset.mapping || defaultMappingForRole(preset.role),
  };
}

function normalizeRolePresets(presets: RolePreset[]): RolePreset[] {
  return presets.map(normalizeRolePreset);
}

function rolePresetsForCreateExperiment(presets: RolePreset[]) {
  return presets.map(({ id: _id, ...preset }) => preset);
}

function createRolePreset(overrides: Partial<RolePreset> = {}): RolePreset {
  return normalizeRolePreset({
    id: overrides.id ?? `custom-${Date.now()}-${Math.round(Math.random() * 10000)}`,
    enabled: overrides.enabled ?? true,
    role: overrides.role ?? 'other',
    label: overrides.label ?? '新角色',
    mapping: overrides.mapping ?? '问题里的相关人物',
    mbtiCode: overrides.mbtiCode ?? '',
    traits: overrides.traits ?? '',
    reason: overrides.reason ?? '手动添加的本次参与角色。',
  });
}

function clampCustomDurationHours(value: number) {
  if (!Number.isFinite(value)) {
    return customDurationMinHours;
  }
  return Math.min(customDurationMaxHours, Math.max(customDurationMinHours, Math.round(value)));
}

function fastEvolutionEnabled() {
  if (typeof window === 'undefined') {
    return false;
  }
  return new URLSearchParams(window.location.search).get('mbtiFastEvolution') === '1';
}

function availableExperimentScales() {
  return fastEvolutionEnabled()
    ? [fastExperimentScale, ...baseExperimentScales]
    : [...baseExperimentScales];
}

function observationDurationMs(scale: ExperimentScale, customHours: number) {
  if (scale.id === 'long') {
    return clampCustomDurationHours(customHours) * 60 * 60 * 1000;
  }
  return scale.durationMs;
}

function observationEventCount(scale: ExperimentScale, customHours: number) {
  if (scale.id === 'long') {
    return Math.max(20, clampCustomDurationHours(customHours) * 10);
  }
  return scale.targetEventCount;
}

function observationLabel(scale: ExperimentScale, customHours: number) {
  if (scale.id === 'long') {
    return `${scale.label} · ${clampCustomDurationHours(customHours)} 小时`;
  }
  return scale.label;
}

function formatDuration(durationMs: number) {
  const minutes = Math.round(durationMs / 60000);
  if (minutes < 60) {
    return `${minutes} 分钟`;
  }
  return `${Math.round(minutes / 60)} 小时`;
}

function userEntryModeFromRoles(presets: RolePreset[]) {
  const normalizedRoleText = (preset: RolePreset) => `${preset.role} ${preset.label} ${preset.mapping}`;
  const hasPartner = presets.some(
    (preset) =>
      preset.enabled &&
      (preset.role === 'partner' ||
        preset.role === 'ambiguous' ||
        /伴侣|女朋友|男朋友|对象|老婆|老公|暧昧|喜欢的人/.test(normalizedRoleText(preset))),
  );
  const hasFriend = presets.some(
    (preset) => preset.enabled && (preset.role === 'friend' || /朋友|闺蜜|兄弟|同学|室友/.test(normalizedRoleText(preset))),
  );
  if (hasPartner && hasFriend) {
    return 'with_partner_and_friend';
  }
  if (hasPartner) {
    return 'with_partner';
  }
  if (hasFriend) {
    return 'with_friend';
  }
  return 'solo';
}

function inferActorRoleFromText(text: string): RolePreset['role'] {
  if (/伴侣|女朋友|男朋友|对象|老婆|老公|恋人/.test(text)) {
    return 'partner';
  }
  if (/暧昧|喜欢的人|crush|约会对象/i.test(text)) {
    return 'ambiguous';
  }
  if (/朋友|闺蜜|兄弟|同学|室友/.test(text)) {
    return 'friend';
  }
  if (/同事|上司|领导|老板|客户|工作/.test(text)) {
    return 'coworker';
  }
  if (/家人|父母|妈妈|爸爸|亲戚|孩子/.test(text)) {
    return 'family';
  }
  if (/前任|前男友|前女友/.test(text)) {
    return 'ex';
  }
  return 'other';
}

function defaultMappingForRole(role: RolePreset['role']) {
  switch (role) {
    case 'partner':
      return '问题里的伴侣/女朋友/对方/她';
    case 'ambiguous':
      return '问题里的暧昧对象/喜欢的人/对方';
    case 'friend':
      return '问题里的朋友/支持者';
    case 'coworker':
      return '问题里的同事/工作对象';
    case 'family':
      return '问题里的家人';
    case 'ex':
      return '问题里的前任';
    default:
      return '问题里的对方/她/他/TA';
  }
}

function readStoredState(): StoredExperimentState {
  if (typeof window === 'undefined') {
    return {};
  }
  try {
    const state = JSON.parse(window.localStorage.getItem(storageKey) ?? '{}') as StoredExperimentState;
    if (
      window.localStorage.getItem(historyResetKey) !== 'done' ||
      window.localStorage.getItem(stateCompatibilityKey) !== 'done'
    ) {
      window.localStorage.setItem(historyResetKey, 'done');
      window.localStorage.setItem(stateCompatibilityKey, 'done');
      window.localStorage.removeItem(storageKey);
      return {};
    }
    return state;
  } catch {
    return {};
  }
}

function normalizeHistoryEntry(entry: unknown): HistoryEntry | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const raw = entry as Partial<HistoryEntry> & {
    report?: unknown;
  };
  const question = typeof raw.question === 'string' ? raw.question : defaultQuestion;
  const createdAt = typeof raw.createdAt === 'number' ? raw.createdAt : Date.now();
  const rolePresets = Array.isArray(raw.rolePresets)
    ? normalizeRolePresets(raw.rolePresets)
    : normalizeRolePresets(inferRolePresets(question));
  const status =
    raw.status === 'creating' ||
    raw.status === 'awaiting_user_responses' ||
    raw.status === 'running' ||
    raw.status === 'complete' ||
    raw.status === 'failed' ||
    raw.status === 'draft'
      ? raw.status
      : 'draft';
  const normalized: HistoryEntry = {
    id: typeof raw.id === 'string' ? raw.id : `${createdAt}`,
    createdAt,
    question,
    profileCode: typeof raw.profileCode === 'string' ? raw.profileCode : '未知',
    scaleLabel: typeof raw.scaleLabel === 'string' ? raw.scaleLabel : '小镇演化',
    rolePresets,
    status,
    experimentId: isLikelyConvexId(raw.experimentId) ? raw.experimentId : undefined,
    worldId: isLikelyConvexId(raw.worldId) ? raw.worldId : undefined,
    engineId: isLikelyConvexId(raw.engineId) ? raw.engineId : undefined,
    agentInputIds: Array.isArray(raw.agentInputIds) ? raw.agentInputIds : undefined,
    error: typeof raw.error === 'string' ? raw.error : undefined,
  };
  return settleStaleHistoryEntry(normalized);
}

function settleStaleHistoryEntry(entry: HistoryEntry) {
  return settleStaleCreatingEntry(entry, Date.now(), creatingSessionTimeoutMs, creatingTimeoutMessage);
}

function isLikelyConvexId(value: unknown): value is string {
  return typeof value === 'string' && convexIdPattern.test(value);
}

function answerValueText(answer: TestAnswer) {
  if (answer.value < 45) {
    return `${answer.value}，偏向${answer.leftLabel}`;
  }
  if (answer.value > 55) {
    return `${answer.value}，偏向${answer.rightLabel}`;
  }
  return `${answer.value}，两边接近`;
}

function answersForMode(mode: TestMode) {
  return mode === 'full' ? fullMbtiAnswers : quickMbtiAnswers;
}

function inferTestMode(state: StoredExperimentState): TestMode {
  if (state.testMode === 'full' || state.testMode === 'quick') {
    return state.testMode;
  }
  return (state.answers?.length ?? 0) > quickMbtiAnswers.length ? 'full' : 'quick';
}

function mergeAnswerSet(fallback: TestAnswer[], stored?: TestAnswer[]) {
  if (!Array.isArray(stored) || stored.length === 0) {
    return fallback.map((answer) => ({ ...answer }));
  }
  return fallback.map((answer, index) => {
    const exact = stored.find(
      (candidate) => candidate.axis === answer.axis && candidate.prompt === answer.prompt,
    );
    const positional = stored[index]?.axis === answer.axis ? stored[index] : undefined;
    const source = exact ?? positional;
    return {
      ...answer,
      value: Number.isFinite(source?.value) ? Math.max(0, Math.min(100, Number(source?.value))) : answer.value,
    };
  });
}

function initialAnswerSets(state: StoredExperimentState): Record<TestMode, TestAnswer[]> {
  const inferredMode = inferTestMode(state);
  const legacyAnswers = state.answers;
  return {
    quick: mergeAnswerSet(
      quickMbtiAnswers,
      state.answersByMode?.quick ?? (inferredMode === 'quick' ? legacyAnswers : undefined),
    ),
    full: mergeAnswerSet(
      fullMbtiAnswers,
      state.answersByMode?.full ?? (inferredMode === 'full' ? legacyAnswers : undefined),
    ),
  };
}

function normalizeHistory(history: unknown[] | undefined): HistoryEntry[] {
  if (!Array.isArray(history)) {
    return [];
  }
  return history
    .map(normalizeHistoryEntry)
    .filter((entry): entry is HistoryEntry => Boolean(entry))
    .slice(0, 12);
}

export default function MbtiExperiment() {
  const [storedState] = useState(readStoredState);
  const [scaleOptions] = useState(availableExperimentScales);
  const [testMode, setTestMode] = useState<TestMode>(inferTestMode(storedState));
  const [answersByMode, setAnswersByMode] = useState<Record<TestMode, TestAnswer[]>>(
    initialAnswerSets(storedState),
  );
  const [question, setQuestion] = useState(storedState.question ?? defaultQuestion);
  const [activeQuestion, setActiveQuestion] = useState(
    storedState.activeQuestion ?? storedState.question ?? defaultQuestion,
  );
  const [rolePresets, setRolePresets] = useState<RolePreset[]>(
    Array.isArray(storedState.rolePresets)
      ? normalizeRolePresets(storedState.rolePresets)
      : [],
  );
  const [experimentScale, setExperimentScale] = useState<ExperimentScale>(
    fastEvolutionEnabled()
      ? fastExperimentScale
      : scaleOptions.find((scale) => scale.id === storedState.experimentScaleId) ?? baseExperimentScales[1],
  );
  const [customDurationHours, setCustomDurationHours] = useState(
    clampCustomDurationHours(storedState.customDurationHours ?? customDurationMinHours),
  );
  const initialSession = normalizeHistoryEntry(storedState.activeSession);
  const [activeSession, setActiveSession] = useState<HistoryEntry | null>(initialSession);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(storedState.runStartedAt ?? null);
  const [runStatus, setRunStatus] = useState<TownRunStatus>(initialSession?.status ?? 'draft');
  const [history, setHistory] = useState<HistoryEntry[]>(normalizeHistory(storedState.history));
  const [activeStep, setActiveStep] = useState<Step>(normalizeStoredStep(storedState.activeStep));
  const [observeTab, setObserveTab] = useState<ObserveTab>('chat');
  const [liveExperimentId, setLiveExperimentId] = useState<string | undefined>(undefined);
  const [deletingHistoryId, setDeletingHistoryId] = useState<string | null>(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [timelineAdvanceState, setTimelineAdvanceState] = useState<'idle' | 'running' | 'error'>('idle');
  const [idleResolutionState, setIdleResolutionState] = useState<'idle' | 'running' | 'error'>('idle');
  const finalizeAttemptRef = useRef<string | null>(null);
  const idleResolveAttemptRef = useRef<string | null>(null);
  const createExperiment = useMutation(api.mbti.createExperiment);
  const deleteExperiment = useMutation(api.mbti.deleteExperiment);
  const clearAllExperiments = useMutation(api.mbti.clearAllExperiments);
  const submitUserResponse = useMutation(api.mbti.submitUserResponse);
  const startExperimentEvolution = useMutation(api.mbti.startExperimentEvolution);
  const finalizeExperimentIfReady = useAction(api.mbti.finalizeExperimentIfReady);
  const resolveIdleExperimentProgress = useAction(api.mbti.resolveIdleExperimentProgress);
  const assessMbtiEvent = useAction(api.mbti.assessMbtiEvent);
  const seedDefaultTown = useMutation(api.mbtiTown.seedDefaultTown);
  const runAutonomyTick = useMutation(api.mbtiTownAutonomy.runAutonomyTick);
  const fastForwardTownTimeline = useMutation(api.mbtiTownAutonomy.fastForwardTownTimeline);
  const planStartupQuestions = useAction(api.mbtiTownPlanner.planStartupQuestions);
  const createSceneRequest = useAction(api.mbtiTownPlanner.planAndCreateSceneRequest);
  const defaultTown = useQuery(api.mbtiTown.getDefaultTown);
  const [townClockNow, setTownClockNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setTownClockNow(Date.now()), 30 * 1000);
    return () => window.clearInterval(interval);
  }, []);
  const liveTimelineNode = useMemo(
    () => liveTownTimelineNode(defaultTown?.observation?.timeline?.[0], townClockNow),
    [defaultTown?.observation?.timeline, townClockNow],
  );
  const observedExperimentId = liveExperimentId ?? activeSession?.experimentId;
  const experimentState = useQuery(
    api.mbti.getExperiment,
    observedExperimentId ? { experimentId: observedExperimentId as never } : 'skip',
  );
  const activeWorldId = activeSession?.status === 'running' ? activeSession.worldId : undefined;
  const heartbeatWorldId = experimentState
    ? experimentState.experiment.status === 'running' && experimentState.worldStatus
      ? experimentState.experiment.worldId
      : undefined
    : isLikelyConvexId(activeWorldId) ? activeWorldId as Id<'worlds'> : undefined;
  useWorldHeartbeat(heartbeatWorldId);
  const answers = answersByMode[testMode];
  const profile = useMemo(() => buildProfile(answers), [answers]);
  const hasPendingQuestion = question.trim() !== activeQuestion.trim();
  const enabledRoles = rolePresets.filter((role) => role.enabled);
  const userEntryMode = userEntryModeFromRoles(enabledRoles);
  const experimentReport = experimentState?.experiment.report ?? activeSession?.report;
  const experimentDurationMs = experimentState?.experiment.observation.durationMs;
  const effectiveQuestionFocus = activeSession?.questionFocus ?? experimentState?.experiment.questionFocus;
  const playerNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const description of experimentState?.playerDescriptions ?? []) {
      names.set(description.playerId, description.name);
    }
    return names;
  }, [experimentState?.playerDescriptions]);
  const evidenceStatus = useMemo(() => {
    const messageCount = experimentState?.messages.length ?? 0;
    const activeConversationCount = experimentState?.world?.conversations.length ?? 0;
    const archivedConversationCount = experimentState?.archivedConversations.length ?? 0;
    const memoryCount = experimentState?.memories.length ?? 0;
    if (!experimentState) {
      return {
        label: '尚未连接观察数据',
        detail: '加入常驻小镇后，这里会显示角色状态、对话、事件和记忆。',
      };
    }
    if (messageCount > 0 || memoryCount > 0 || archivedConversationCount > 0) {
      return {
        label: '已采集到演化证据',
        detail: `聊天 ${messageCount} 条，记忆 ${memoryCount} 条，结束对话 ${archivedConversationCount} 段。`,
      };
    }
    if (activeConversationCount > 0) {
      return {
        label: '对话已启动，等待模型生成内容',
        detail:
          '角色已经进入对话状态，但还没有消息。通常是本地 Ollama/embedding 服务没有启动，或模型接口不可达。',
      };
    }
    return {
      label: '小镇正在预热',
      detail: '角色已经进入 world，等待移动、相遇、对话或事件触发。',
    };
  }, [experimentState]);
  const engineHealth = useMemo(() => {
    if (!experimentState?.engine || !experimentState.worldStatus) {
      return '引擎状态待连接';
    }
    if (experimentState.worldStatus.status !== 'running') {
      return `world ${experimentState.worldStatus.status}`;
    }
    if (!experimentState.engine.running) {
      return 'engine 已停止';
    }
    const currentTime = experimentState.engine.currentTime ?? experimentState.engine.lastStepTs;
    if (!currentTime) {
      return 'engine 启动中';
    }
    const lagSeconds = Math.round((Date.now() - currentTime) / 1000);
    return lagSeconds > 90 ? `engine ${lagSeconds}s 未推进` : 'engine 正在推进';
  }, [experimentState?.engine, experimentState?.worldStatus]);
  const topRuntimeSummary = useMemo(
    () => summarizeEventRuntime(experimentState?.events ?? []),
    [experimentState?.events],
  );
  const topNextEventWait = timelineEventWaitState(liveTimelineNode, topRuntimeSummary.nextTimelineEvent);
  const timelineRunStatus = timelineRunStatusText({
    engineHealth,
    nextEvent: topRuntimeSummary.nextTimelineEvent,
    wait: topNextEventWait,
    runStatus,
    timelineAdvanceState,
  });
  const submitCalibrationResponse = async (args: Parameters<typeof submitUserResponse>[0]) => {
    return await submitUserResponse(args);
  };
  const advanceTownTimeline = async (advanceDays: number) => {
    if (!defaultTown?.town._id) {
      return;
    }
    setTimelineAdvanceState('running');
    try {
      if (advanceDays <= 0) {
        await runAutonomyTick({ townId: defaultTown.town._id as never });
      } else {
        await fastForwardTownTimeline({
          townId: defaultTown.town._id as never,
          advanceDays,
          targetPhase: 'morning',
        });
      }
      setTimelineAdvanceState('idle');
    } catch (error) {
      console.error('Failed to advance MBTI town timeline', error);
      setTimelineAdvanceState('error');
    }
  };
  useEffect(() => {
    if (
      runStatus !== 'creating' ||
      !activeSession ||
      activeSession.experimentId ||
      activeSession.worldId
    ) {
      return;
    }
    const elapsedMs = Date.now() - activeSession.createdAt;
    if (elapsedMs >= creatingSessionTimeoutMs) {
      const failedSession: HistoryEntry = {
        ...activeSession,
        status: 'failed',
        error: creatingTimeoutMessage,
      };
      setRunStatus('failed');
      setActiveSession(failedSession);
      setHistory((current) =>
        current.map((entry) => (entry.id === activeSession.id ? failedSession : entry)),
      );
      return;
    }
    const timeout = window.setTimeout(() => {
      const failedSession: HistoryEntry = {
        ...activeSession,
        status: 'failed',
        error: creatingTimeoutMessage,
      };
      setRunStatus('failed');
      setActiveSession(failedSession);
      setHistory((current) =>
        current.map((entry) => (entry.id === activeSession.id ? failedSession : entry)),
      );
    }, creatingSessionTimeoutMs - elapsedMs);
    return () => window.clearTimeout(timeout);
  }, [activeSession, runStatus]);

  useEffect(() => {
    const experiment = experimentState?.experiment;
    if (!experiment || !activeSession?.experimentId || activeSession.experimentId !== experiment._id) {
      return;
    }
    if (
      experiment.status === runStatus &&
      activeSession.completedAt === experiment.completedAt
    ) {
      return;
    }
    const nextSession: HistoryEntry = {
      ...activeSession,
      status: experiment.status,
      completedAt: experiment.completedAt,
      report: experiment.report,
    };
    setRunStatus(experiment.status);
    setActiveSession(nextSession);
    setHistory((current) =>
      current.map((entry) => (entry.id === activeSession.id ? nextSession : entry)),
    );
  }, [activeSession, experimentState?.experiment, runStatus]);

  useEffect(() => {
    const experiment = experimentState?.experiment;
    if (!experiment || experiment.status !== 'running' || experiment.report || experimentState.events.length === 0) {
      return;
    }
    const recordedEventIds = new Set(
      experimentState.socialEvents
        .map((event) => event.mbtiEventId)
        .filter((eventId): eventId is Id<'mbtiEvents'> => Boolean(eventId)),
    );
    const recordedEvents = experimentState.events.filter((event) => recordedEventIds.has(event._id));
    const respondedEventIds = new Set(
      experimentState.userResponses
        .filter((response) => response.responseStatus === 'responded')
        .map((response) => response.mbtiEventId),
    );
    const testedVariables = new Set(
      recordedEvents
        .map((event) => event.testedVariable)
        .filter((variable): variable is string => Boolean(variable)),
    );
    if (recordedEvents.length < 3 || respondedEventIds.size < 2 || testedVariables.size < 3) {
      return;
    }
    const attemptKey = `${experiment._id}:${recordedEvents.length}:${respondedEventIds.size}:${testedVariables.size}`;
    if (finalizeAttemptRef.current === attemptKey) {
      return;
    }
    finalizeAttemptRef.current = attemptKey;
    void finalizeExperimentIfReady({
      experimentId: experiment._id,
    }).catch((error) => {
      console.warn('MBTI finalize-if-ready failed', error);
      finalizeAttemptRef.current = null;
    });
  }, [
    experimentState?.experiment,
    experimentState?.events,
    experimentState?.socialEvents,
    experimentState?.userResponses,
    finalizeExperimentIfReady,
  ]);

  useEffect(() => {
    const experiment = experimentState?.experiment;
    if (!experiment || experiment.status !== 'running' || experiment.report || experimentState.events.length === 0) {
      return;
    }
    const runtimeSummary = summarizeEventRuntime(experimentState.events);
    const targetEventCount = experiment.observation.targetEventCount ?? 8;
    if (
      runtimeSummary.nextTimelineEvent ||
      runtimeSummary.statusCounts.waitingTimeline > 0 ||
      experimentState.events.length < targetEventCount
    ) {
      return;
    }
    const attemptKey = `${experiment._id}:${experimentState.events.length}:${runtimeSummary.statusCounts.occurred}`;
    if (idleResolveAttemptRef.current === attemptKey) {
      return;
    }
    idleResolveAttemptRef.current = attemptKey;
    setIdleResolutionState('running');
    void resolveIdleExperimentProgress({
      experimentId: experiment._id,
    })
      .then(() => {
        setIdleResolutionState('idle');
      })
      .catch((error) => {
        console.warn('MBTI idle progress resolution failed', error);
        idleResolveAttemptRef.current = null;
        setIdleResolutionState('error');
      });
  }, [
    experimentState?.experiment,
    experimentState?.events,
    resolveIdleExperimentProgress,
  ]);

  useEffect(() => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        answers,
        testMode,
        answersByMode,
        question,
        activeQuestion,
        rolePresets,
        experimentScaleId: experimentScale.id,
        customDurationHours,
        activeSession: activeSession ?? undefined,
        activeStep,
        runStartedAt: runStartedAt ?? undefined,
        history,
      } satisfies StoredExperimentState),
    );
  }, [
    activeQuestion,
    activeSession,
    activeStep,
    answers,
    answersByMode,
    customDurationHours,
    experimentScale.id,
    history,
    question,
    rolePresets,
    runStartedAt,
    testMode,
  ]);

  function updateAnswer(index: number, value: number) {
    setAnswersByMode((current) => ({
      ...current,
      [testMode]: current[testMode].map((answer, answerIndex) =>
        answerIndex === index ? { ...answer, value } : answer,
      ),
    }));
  }

  function switchTestMode(nextMode: TestMode) {
    setTestMode(nextMode);
    setAnswersByMode((current) => ({
      ...current,
      [nextMode]: current[nextMode] ?? mergeAnswerSet(answersForMode(nextMode)),
    }));
  }

  function resetCurrentTest() {
    setAnswersByMode((current) => ({
      ...current,
      [testMode]: mergeAnswerSet(answersForMode(testMode)),
    }));
  }

  function resetAllTests() {
    setAnswersByMode({
      quick: mergeAnswerSet(quickMbtiAnswers),
      full: mergeAnswerSet(fullMbtiAnswers),
    });
  }

  function updateRole(id: string, patch: Partial<RolePreset>) {
    setRolePresets((current) =>
      current.map((preset) => (preset.id === id ? normalizeRolePreset({ ...preset, ...patch }) : preset)),
    );
  }

  function addRole() {
    setRolePresets((current) => [...current, createRolePreset()]);
  }

  function removeRole(id: string) {
    setRolePresets((current) => current.filter((preset) => preset.id !== id));
  }

  async function prepareTownEvolution() {
    const nextQuestion = question.trim() || defaultQuestion;
    const effectiveRolePresets = normalizeRolePresets(rolePresets);
    const startedAt = Date.now();
    const draftSession: HistoryEntry = {
      id: `${startedAt}`,
      createdAt: startedAt,
      question: nextQuestion,
      profileCode: profile.code,
      scaleLabel: observationLabel(experimentScale, customDurationHours),
      rolePresets: effectiveRolePresets,
      status: 'creating',
    };
    setActiveQuestion(nextQuestion);
    setRolePresets(effectiveRolePresets);
    setRunStartedAt(startedAt);
    setRunStatus('creating');
    setActiveSession(draftSession);
    setLiveExperimentId(undefined);
    setHistory((current) => [draftSession, ...current].slice(0, 12));
    setActiveStep('observe');
    try {
      const planning = await planStartupQuestions({
        question: nextQuestion,
        targetEventCount: observationEventCount(experimentScale, customDurationHours),
      }) as { plannedFocus: QuestionFocus; requiredStartupQuestionCount: number };
      const waitingSession: HistoryEntry = {
        ...draftSession,
        status: 'awaiting_user_responses',
        questionFocus: planning.plannedFocus,
      };
      setRunStatus('awaiting_user_responses');
      setActiveSession(waitingSession);
      setLiveExperimentId(undefined);
      setHistory((current) =>
        current.map((entry) => (entry.id === draftSession.id ? waitingSession : entry)),
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '加入常驻小镇失败';
      const failedSession: HistoryEntry = {
        ...draftSession,
        status: 'failed',
        error: errorMessage.includes('情境探针生成失败')
          ? errorMessage
          : `加入常驻小镇失败：${errorMessage}`,
      };
      setRunStatus('failed');
      setActiveSession(failedSession);
      setLiveExperimentId(undefined);
      setHistory((current) =>
        current.map((entry) => (entry.id === draftSession.id ? failedSession : entry)),
      );
    }
  }

  async function startPreparedEvolution(startupAnswers: StartupAnswer[] = []) {
    if (!activeSession || activeSession.status !== 'awaiting_user_responses' || !activeSession.questionFocus) {
      return;
    }
    try {
      setRunStatus('creating');
      const effectiveRolePresets = normalizeRolePresets(activeSession.rolePresets);
      const seededTown = await seedDefaultTown({});
      const sceneRequest = await createSceneRequest({
        townId: seededTown.townId,
        question: activeSession.question,
        targetEventCount: observationEventCount(experimentScale, customDurationHours),
        userEntryMode: userEntryModeFromRoles(effectiveRolePresets),
        plannedFocus: activeSession.questionFocus as never,
        startupAnswers: startupAnswers as never,
      });
      const result = await createExperiment({
        question: activeSession.question,
        profile,
        rolePresets: rolePresetsForCreateExperiment(effectiveRolePresets) as never,
        townResidents: sceneRequest.selectedResidents as never,
        townBackgroundResidents: sceneRequest.backgroundResidents as never,
        townId: sceneRequest.townId,
        sceneRequestId: sceneRequest.sceneRequestId,
        sceneLocationKey: sceneRequest.locationKey,
        questionFocus: sceneRequest.questionFocus,
        observation: {
          label: observationLabel(experimentScale, customDurationHours),
          runCount: observationEventCount(experimentScale, customDurationHours),
          durationMs: observationDurationMs(experimentScale, customDurationHours),
          targetEventCount: observationEventCount(experimentScale, customDurationHours),
        },
      });
      await startExperimentEvolution({ experimentId: result.experimentId as never });
      const runningSession: HistoryEntry = {
        ...activeSession,
        status: 'running',
        townId: sceneRequest.townId,
        sceneRequestId: sceneRequest.sceneRequestId,
        sceneType: sceneRequest.sceneType,
        selectedLocationKey: sceneRequest.locationKey,
        selectedResidentKeys: sceneRequest.residentKeys,
        questionFocus: sceneRequest.questionFocus,
        ephemeralParticipantKeys:
          userEntryModeFromRoles(effectiveRolePresets) === 'with_partner_and_friend'
            ? ['user_partner', 'user_friend']
            : userEntryModeFromRoles(effectiveRolePresets) === 'with_partner'
              ? ['user_partner']
              : userEntryModeFromRoles(effectiveRolePresets) === 'with_friend'
                ? ['user_friend']
                : [],
        experimentId: result.experimentId,
        worldId: result.worldId,
        engineId: result.engineId,
        agentInputIds: result.agentInputIds,
      };
      setRunStatus('running');
      setActiveSession(runningSession);
      setLiveExperimentId(result.experimentId);
      setHistory((current) =>
        current.map((entry) => (entry.id === activeSession.id ? runningSession : entry)),
      );
    } catch (error) {
      console.error('Failed to start MBTI evolution', error);
      setRunStatus('awaiting_user_responses');
      window.alert(error instanceof Error ? error.message : '正式启动小镇演化失败，请稍后重试。');
    }
  }

  function refreshInferredRoles() {
    setRolePresets((current) => normalizeRolePresets(inferRolePresets(question, current)));
  }

  function restoreHistory(entry: HistoryEntry) {
    setQuestion(entry.question);
    setActiveQuestion(entry.question);
    setRolePresets(entry.rolePresets);
    setActiveSession(entry);
    setLiveExperimentId(undefined);
    setRunStartedAt(entry.createdAt);
    setRunStatus(entry.status);
    if (entry.status === 'creating' || entry.status === 'awaiting_user_responses' || entry.status === 'running') {
      setActiveStep('observe');
      return;
    }
    setExpandedHistoryId((current) => (current === entry.id ? null : entry.id));
  }

  async function deleteHistory(entryId: string) {
    const entry = history.find((item) => item.id === entryId);
    setDeletingHistoryId(entryId);
    try {
      if (entry?.experimentId && convexIdPattern.test(entry.experimentId)) {
        await deleteExperiment({ experimentId: entry.experimentId as never });
      }
    } catch (error) {
      console.error('Failed to delete MBTI experiment', error);
      window.alert(error instanceof Error ? error.message : '删除实验世界失败，请稍后重试。');
      setDeletingHistoryId(null);
      return;
    }
    setHistory((current) => current.filter((entry) => entry.id !== entryId));
    if (activeSession?.id === entryId) {
      setActiveSession(null);
      setLiveExperimentId(undefined);
      setRunStartedAt(null);
      setRunStatus('draft');
    }
    setDeletingHistoryId(null);
  }

  async function clearHistory() {
    setDeletingHistoryId('all');
    try {
      await clearAllExperiments();
      setHistory([]);
      setActiveSession(null);
      setLiveExperimentId(undefined);
      setRunStartedAt(null);
      setRunStatus('draft');
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          answers,
          testMode,
          answersByMode,
          question,
          activeQuestion,
          rolePresets,
          experimentScaleId: experimentScale.id,
          activeStep,
          history: [],
        } satisfies StoredExperimentState),
      );
    } catch (error) {
      console.error('Failed to clear MBTI history', error);
      window.alert(error instanceof Error ? error.message : '清空历史失败，请稍后重试。');
    } finally {
      setDeletingHistoryId(null);
    }
  }

  return (
    <main className="mbti-shell">
      <div className="mbti-page">
        <header className="mbti-header">
          <div>
            <h1 className="mbti-title">MBTI Town Lab</h1>
            <p className="mbti-subtitle">
              先把人格拆成 E/I/S/N/T/F/J/P 的比例，再把这个人格作为小镇角色导入实验世界。
              结论必须来自角色移动、对话、记忆和事件演化，不再使用瞬时预览。
            </p>
          </div>
        </header>

        <nav className="mbti-stepper" aria-label="实验步骤">
          <StepButton activeStep={activeStep} id="test" label="人格测试" onSelect={setActiveStep} />
          <StepButton activeStep={activeStep} id="question" label="问题描述" onSelect={setActiveStep} />
          <StepButton activeStep={activeStep} id="observe" label="模拟观察" onSelect={setActiveStep} />
          <StepButton activeStep={activeStep} id="history" label="历史记录" onSelect={setActiveStep} />
        </nav>

        {activeStep === 'test' && (
          <section className="mbti-panel">
            <h2>1. 人格测试</h2>
            <p className="mbti-section-note">
              先选择精简版或全量版。这里用于生成小镇角色的 E/I/S/N/T/F/J/P 权重，不等同于官方 MBTI 量表；
              两种版本的答案都会自动保留，后面换问题也不用重测。
            </p>
            <div className="mbti-test-mode-picker" role="group" aria-label="选择人格测试版本">
              {mbtiTestModes.map((mode) => (
                <button
                  data-active={testMode === mode.id}
                  key={mode.id}
                  onClick={() => switchTestMode(mode.id)}
                  type="button"
                >
                  <strong>{mode.label}</strong>
                  <span>{mode.count} 题</span>
                  <p>{mode.description}</p>
                </button>
              ))}
              <div className="mbti-test-mode-actions">
                <span>当前：{answers.length} 题</span>
                <button onClick={resetCurrentTest} type="button">
                  重置当前版本
                </button>
                <button onClick={resetAllTests} type="button">
                  重置全部
                </button>
              </div>
            </div>
            <div className="mbti-questions">
              {answers.map((answer, index) => (
                <div className="mbti-question" key={`${answer.axis}-${index}`}>
                  <div className="mbti-question-heading">
                    <label htmlFor={`answer-${index}`}>{answer.prompt}</label>
                    <button
                      aria-label={`${answer.prompt} 的具体例子`}
                      className="mbti-tip-trigger"
                      type="button"
                    >
                      ?
                      <span className="mbti-tip" role="tooltip">
                        {answer.example}
                      </span>
                    </button>
                  </div>
                  <div className="mbti-slider-row">
                    <span>{answer.leftLabel}</span>
                    <div className="mbti-slider-control">
                      <input
                        aria-valuetext={answerValueText(answer)}
                        id={`answer-${index}`}
                        min={0}
                        max={100}
                        value={answer.value}
                        type="range"
                        onChange={(event) => updateAnswer(index, Number(event.target.value))}
                      />
                      <div className="mbti-slider-scale" aria-hidden="true">
                        {sliderScaleMarks.map((mark) => (
                          <span key={mark}>{mark}</span>
                        ))}
                      </div>
                    </div>
                    <span>{answer.rightLabel}</span>
                  </div>
                </div>
              ))}
            </div>
            <section className="mbti-profile-result">
              <div>
                <h2>2. 人格构成</h2>
                <p className="mbti-section-note">
                  完成测试后先确认当前人格画像，再进入问题描述。后续小镇演化会基于这个画像生成角色反应。
                </p>
              </div>
              <div className="mbti-profile-layout">
                <div className="mbti-bars">
                  <AxisBar left="E" right="I" leftValue={profile.weights.e} rightValue={profile.weights.i} />
                  <AxisBar left="S" right="N" leftValue={profile.weights.s} rightValue={profile.weights.n} />
                  <AxisBar left="T" right="F" leftValue={profile.weights.t} rightValue={profile.weights.f} />
                  <AxisBar left="J" right="P" leftValue={profile.weights.j} rightValue={profile.weights.p} />
                </div>
                <PersonalityStatusCard code={profile.code} />
              </div>
            </section>
            <button className="mbti-action" onClick={() => setActiveStep('question')} type="button">
              下一步：描述问题
            </button>
          </section>
        )}

        {activeStep === 'question' && (
          <section className="mbti-panel">
            <section className="mbti-question-block mbti-question-block-primary">
              <h2>2. 描述你想验证的问题</h2>
              <p className="mbti-section-note">
                直接写一个具体社会问题。每次进入都会使用全新的访客身份；你带入的伴侣或朋友也只属于本次场景，
                不会和过往聊天记录或记忆耦合。
              </p>
              <textarea
                className="mbti-textarea"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                aria-label="自定义问题"
              />
            </section>
            <section className="mbti-role-settings">
              <div className="mbti-role-settings-header">
                <div>
                  <h3>对象预设</h3>
                  <p>
                    不默认添加角色。需要带入伴侣、朋友、同事或其他对象时，用加号新增；不需要就保持为空。
                  </p>
                </div>
                <div className="mbti-role-actions">
                  <button aria-label="添加预设角色" onClick={addRole} type="button">
                    +
                  </button>
                  <button onClick={refreshInferredRoles} type="button">
                    根据问题识别
                  </button>
                </div>
              </div>
              {rolePresets.length > 0 ? (
                rolePresets.map((preset) => (
                  <RoleEditor
                    key={preset.id}
                    value={preset}
                    onChange={(patch) => updateRole(preset.id, patch)}
                    onRemove={() => removeRole(preset.id)}
                  />
                ))
              ) : (
                <p className="mbti-role-empty">当前不带入额外角色。小镇会只以“我”的身份进入演化。</p>
              )}
            </section>
            <div className="mbti-scale-picker">
              <span className="mbti-scale-title">选择小镇观察方式</span>
              <div className="mbti-scale-options">
                {scaleOptions.map((scale) => (
                  <button
                    className="mbti-scale-option"
                    data-active={scale.id === experimentScale.id}
                    key={scale.id}
                    onClick={() => setExperimentScale(scale)}
                    type="button"
                  >
                    <strong>{scale.label}</strong>
                    <span>{scale.description}</span>
                  </button>
                ))}
              </div>
              {experimentScale.id === 'long' && (
                <div className="mbti-duration-control">
                  <span>长时观察时长</span>
                  <input
                    aria-label="长时观察滑杆"
                    min={customDurationMinHours}
                    max={customDurationMaxHours}
                    step={1}
                    type="range"
                    value={customDurationHours}
                    onChange={(event) => setCustomDurationHours(clampCustomDurationHours(Number(event.target.value)))}
                  />
                  <label>
                    <input
                      aria-label="长时观察小时数"
                      min={customDurationMinHours}
                      max={customDurationMaxHours}
                      step={1}
                      type="number"
                      value={customDurationHours}
                      onChange={(event) => setCustomDurationHours(clampCustomDurationHours(Number(event.target.value)))}
                    />
                    小时
                  </label>
                  <strong>
                    最低观察 {customDurationHours} 小时 · 动态探针预算约 {observationEventCount(experimentScale, customDurationHours)} 个
                  </strong>
                </div>
              )}
              <p className="mbti-scale-summary">
                当前策略：最低观察 {formatDuration(observationDurationMs(experimentScale, customDurationHours))}；
                系统按证据缺口动态生成事件，约 {observationEventCount(experimentScale, customDurationHours)} 个探针预算，不会因为时间到就强行结束。
              </p>
            </div>
            <button className="mbti-action" onClick={prepareTownEvolution} type="button">
              以新访客身份加入常驻小镇
            </button>
          </section>
        )}

        {activeStep === 'observe' && (
          <section className="mbti-panel mt-5 mbti-report" data-busy={runStatus === 'creating'}>
            <div className="mbti-observe-topbar">
              <div className="mbti-observe-title">
                <h2>4. 模拟观察</h2>
                <strong>
                  {runStatus === 'draft'
                    ? '尚未加入常驻小镇'
                    : runStatus === 'creating'
                      ? '正在动态生成情境探针'
                      : runStatus === 'awaiting_user_responses'
                        ? '已加入小镇，等待启动前回应'
                        : runStatus === 'running'
                          ? '小镇正在演化'
                          : runStatus === 'failed'
                            ? '加入常驻小镇失败'
                            : '小镇演化已完成'}
                </strong>
                <span>
                  {experimentState?.world
                    ? `${experimentState.world.players.length} 个角色 · ${experimentState.world.conversations.length} 段对话中 · ${experimentState?.messages.length ?? 0} 条聊天`
                    : runStatus === 'failed'
                      ? activeSession?.error ?? '请检查 Convex 后端是否已启动。'
                      : runStatus === 'creating'
                        ? '正在根据你的具体问题动态生成探针，可能需要数分钟；失败会自动重试，连续 3 次失败后才会终止。'
                        : runStatus === 'awaiting_user_responses'
                          ? '请先回答关键问题；这些回答会作为后续事件生成的前置条件。'
                        : '准备好后会在下方显示常驻小镇画布'}
                </span>
                {experimentState?.world && <span>{engineHealth}</span>}
                {hasPendingQuestion && <span className="mbti-warning">问题已修改，需要以新访客身份重新进入小镇。</span>}
              </div>
              <div className="mbti-observe-actions">
                <button disabled={runStatus === 'creating'} onClick={() => setActiveStep('question')} type="button">
                  修改问题
                </button>
                <button disabled={runStatus === 'creating'} onClick={prepareTownEvolution} type="button">
                  {runStatus === 'creating' ? '正在加入...' : '以新访客身份重新进入'}
                </button>
              </div>
            </div>
            {defaultTown?.town._id && (
              <div className="mbti-timeline-controls" aria-label="小镇时间线自动推进状态">
                <div className="mbti-timeline-status">
                  <span>时间线自动推进</span>
                  <strong>{timelineRunStatus.title}</strong>
                  <em>{timelineRunStatus.detail}</em>
                </div>
                <details className="mbti-timeline-debug">
                  <summary>调试推进</summary>
                  <div>
                    <button
                      disabled={timelineAdvanceState === 'running'}
                      onClick={() => void advanceTownTimeline(0)}
                      type="button"
                    >
                      跑一次居民自治
                    </button>
                    <button
                      disabled={timelineAdvanceState === 'running'}
                      onClick={() => void advanceTownTimeline(1)}
                      type="button"
                    >
                      快进到明天
                    </button>
                    <button
                      disabled={timelineAdvanceState === 'running'}
                      onClick={() => void advanceTownTimeline(7)}
                      type="button"
                    >
                      快进 7 天
                    </button>
                  </div>
                </details>
                <em>
                  {timelineAdvanceState === 'running'
                    ? '推进中...'
                    : timelineAdvanceState === 'error'
                    ? '推进失败，请检查后端'
                    : '无需手动操作'}
                </em>
              </div>
            )}

            {runStatus === 'creating' && (
              <div aria-live="polite" className="mbti-creating-overlay" role="status">
                <div>
                  <span>正在加入常驻小镇</span>
                  <strong>请稍等，正在为这次问题生成专属情境</strong>
                  <div className="mbti-joining-progress" aria-hidden="true">
                    <i />
                  </div>
                  <ol>
                    {joiningTownSteps.map((step, index) => (
                      <li key={step.title} style={{ '--step-index': index } as CSSProperties}>
                        <b>{step.title}</b>
                        <em>{step.detail}</em>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            )}

            {runStatus === 'awaiting_user_responses' &&
              (activeSession?.questionFocus?.startupQuestions?.length ?? 0) > 0 && (
                <StartupResponseDialog
                  onStart={startPreparedEvolution}
                  startupQuestions={activeSession?.questionFocus?.startupQuestions ?? []}
                />
              )}

            {runStatus === 'awaiting_user_responses' &&
              (activeSession?.questionFocus?.startupQuestions?.length ?? 0) === 0 && (
                <div className="mbti-startup-missing">
                  <p>本轮没有生成启动前关键问题。你可以重新进入，或直接启动小镇生成事件。</p>
                  <button onClick={() => startPreparedEvolution()} type="button">
                    直接启动小镇演化
                  </button>
                </div>
              )}

            {experimentState?.world && (
              <section className="mbti-town-stage">
                <ExperimentTownFrame
                  activeLocationKey={activeSession?.selectedLocationKey}
                  activeLocationKeys={experimentState.events
                    .map((event) => event.locationKey)
                    .filter((key): key is string => Boolean(key))}
                  engineId={experimentState.experiment.engineId}
                  timelineNode={liveTimelineNode}
                  worldId={experimentState.experiment.worldId}
                />
              </section>
            )}

            {experimentReport && <FinalReport report={experimentReport} />}

            <section className="mbti-observe-summary">
              <article>
                <span>当前阶段</span>
                <strong>{evidenceStatus.label}</strong>
                <p>{evidenceStatus.detail}</p>
              </article>
              <article>
                <span>问题</span>
                <strong>{profile.code} · {experimentScale.label}</strong>
                <p>
                  {activeSession?.question ?? activeQuestion}
                  {experimentDurationMs
                    ? ` · 目标时长 ${Math.round(experimentDurationMs / 60000)} 分钟`
                    : ''}
                </p>
              </article>
              <article>
                <span>常驻小镇</span>
                <strong>
                  {activeSession?.sceneType
                    ? `${activeSession.sceneType} · ${activeSession.selectedLocationKey ?? '待选地点'}`
                    : defaultTown
                      ? `${defaultTown.counts.residents} 位居民 · ${defaultTown.counts.memories} 条记忆`
                      : '尚未 seed'}
                </strong>
                <p>
                  {activeSession?.selectedResidentKeys?.length
                    ? `本次激活 ${activeSession.selectedResidentKeys.length} 位常驻居民；访客和带入角色不继承历史身份。`
                    : '大世界保留原住民关系和记忆，用户每次进入都是全新身份。'}
                </p>
              </article>
              <article>
                <span>对象</span>
                <strong>
                  {objectSummaryForQuestion(activeSession?.question ?? activeQuestion, rolePresets)}
                </strong>
                <p>{objectModeHintForQuestion(activeSession?.question ?? activeQuestion, userEntryMode, rolePresets)}</p>
              </article>
            </section>

            {defaultTown?.observation && (
              <details className="mbti-town-observation-details">
                <summary>后台自治状态</summary>
                <TownObservationDashboard
                  observation={defaultTown.observation}
                  runStatus={runStatus}
                />
              </details>
            )}

            <QuestionGuidanceRail
              behaviorEvents={experimentState?.behaviorEvents ?? []}
              currentTimelineNode={liveTimelineNode}
              eventEvidence={experimentState?.eventEvidence ?? []}
              eventAssessments={experimentState?.eventAssessments ?? []}
              events={experimentState?.events ?? []}
              experimentId={experimentState?.experiment._id}
              innerThoughts={experimentState?.innerThoughts ?? []}
              messages={experimentState?.messages ?? []}
              onAssessEvent={assessMbtiEvent}
              onSubmitUserResponse={submitCalibrationResponse}
              playerDescriptions={experimentState?.playerDescriptions ?? []}
              questionFocus={effectiveQuestionFocus}
              decisionState={experimentState?.experiment.decisionState}
              idleResolutionState={idleResolutionState}
              runStatus={runStatus}
              socialEvents={experimentState?.socialEvents ?? []}
              targetEventCount={experimentState?.experiment.observation.targetEventCount}
              userResponses={experimentState?.userResponses ?? []}
              showInlineResponses={runStatus !== 'awaiting_user_responses'}
              manualCalibrationMode={false}
              onNudgeTimeline={() => advanceTownTimeline(0)}
            />

            <details className="mbti-observe-details">
              <summary>查看导入信息、演化链路和事件种子</summary>
              <section className="mbti-town-config">
                <h3>导入信息</h3>
                <div className="mbti-town-grid">
                  <div>
                    <span>Town ID</span>
                    <strong>{activeSession?.townId ?? defaultTown?.town._id ?? '未创建'}</strong>
                  </div>
                  <div>
                    <span>Scene Request</span>
                    <strong>{activeSession?.sceneRequestId ?? '未创建'}</strong>
                  </div>
                  <div>
                    <span>本次临时角色</span>
                    <strong>
                      {activeSession?.ephemeralParticipantKeys?.join('、') || '只有用户访客'}
                    </strong>
                  </div>
                  <div>
                    <span>实验 ID</span>
                    <strong>{activeSession?.experimentId ?? '未创建'}</strong>
                  </div>
                  <div>
                    <span>World ID</span>
                    <strong>{activeSession?.worldId ?? '未创建'}</strong>
                  </div>
                  <div>
                    <span>准备时间</span>
                    <strong>{runStartedAt ? new Date(runStartedAt).toLocaleString() : '未准备'}</strong>
                  </div>
                </div>
              </section>
              <section className="mbti-town-config">
                <h3>演化链路</h3>
                <ol className="mbti-town-pipeline">
                  <li data-state={activeSession?.sceneRequestId ? 'ready' : defaultTown ? 'active' : 'pending'}>
                    入镇前生成隐性演化计划，再在常驻小镇里创建本次 scene request。
                  </li>
                  <li data-state={activeSession?.worldId ? 'ready' : runStatus === 'creating' ? 'active' : 'pending'}>
                    创建当前运行 world，用于承载本次场景演化。
                  </li>
                  <li data-state={activeSession?.agentInputIds?.[0] ? 'ready' : runStatus === 'creating' ? 'active' : 'pending'}>
                    创建“我”、带入角色和本次激活居民。
                  </li>
                  <li data-state={runStatus === 'running' ? 'ready' : 'pending'}>
                    启动对话，让 tick 推动移动、聊天和记忆。
                  </li>
                  <li data-state={(experimentState?.messages.length ?? 0) > 0 ? 'ready' : 'pending'}>
                    收集聊天、事件、内心独白和记忆证据。
                  </li>
                </ol>
              </section>
              {effectiveQuestionFocus && (
                <section className="mbti-town-config">
                  <h3>入镇前演化计划</h3>
                  <div className="mbti-event-list">
                    <article>
                      <span>隐性张力</span>
                      <strong>{effectiveQuestionFocus.drivingTension}</strong>
                      <p>{effectiveQuestionFocus.observationGoal}</p>
                    </article>
                    <article>
                      <span>问题拆解</span>
                      <p>
                        {(effectiveQuestionFocus.analysisDimensions?.length
                          ? effectiveQuestionFocus.analysisDimensions
                          : effectiveQuestionFocus.evidenceTargets).join('、')}
                      </p>
                    </article>
                    {effectiveQuestionFocus.reasonablenessDiscussion && (
                      <article>
                        <span>拆解合理性</span>
                        <strong>{effectiveQuestionFocus.reasonablenessDiscussion.plausibleInterpretation}</strong>
                        <p>
                          合理之处：{effectiveQuestionFocus.reasonablenessDiscussion.whyReasonable.join('、')}
                        </p>
                        <p>
                          待讨论：{[
                            ...effectiveQuestionFocus.reasonablenessDiscussion.possibleMisreads,
                            ...effectiveQuestionFocus.reasonablenessDiscussion.assumptionsToConfirm,
                          ].join('、')}
                        </p>
                      </article>
                    )}
                    <article>
                      <span>设计逻辑</span>
                      <p>{effectiveQuestionFocus.designRationale ?? '把原问题拆成几个可观察维度，再安排生活事件分别考察。'}</p>
                    </article>
                    <article>
                      <span>证据方向</span>
                      <p>{effectiveQuestionFocus.evidenceTargets.join('、')}</p>
                    </article>
                    <article>
                      <span>事件触发</span>
                      <p>{effectiveQuestionFocus.eventBeats.join('、')}</p>
                    </article>
                    <article>
                      <span>方法依据</span>
                      <p>
                        {(effectiveQuestionFocus.theoreticalBasis?.length
                          ? effectiveQuestionFocus.theoreticalBasis
                          : ['压力与应对', '认知行为', '行为激活']).join('、')}
                      </p>
                    </article>
                  </div>
                </section>
              )}
              {experimentState?.events && experimentState.events.length > 0 && (
                <section className="mbti-town-config">
                  <h3>事件种子</h3>
                  <div className="mbti-event-list">
                    {experimentState.events.map((event: {
                      _id: string;
                      kind: string;
                      tickOffset: number;
                      title: string;
                      description: string;
                    }) => (
                      <article key={event._id}>
                        <span>{event.kind} · 第 {event.tickOffset} 轮附近</span>
                        <strong>{event.title}</strong>
                        <p>{event.description}</p>
                      </article>
                    ))}
                  </div>
                </section>
              )}
            </details>
          </section>
        )}

        {activeStep === 'history' && (
          <section className="mbti-panel mt-5">
            <div className="mbti-history-header">
              <h2>5. 历史记录</h2>
              <button disabled={deletingHistoryId === 'all'} onClick={clearHistory} type="button">
                {deletingHistoryId === 'all' ? '清空中' : '清空历史'}
              </button>
            </div>
            <p className="mbti-section-note">
              每次准备小镇演化都会保存问题、人格、对象预设和观察方式。后端接入后，这里会关联真实 world 和结果。
            </p>
            {history.length === 0 && <p className="mbti-empty">还没有历史实验。</p>}
            <div className="mbti-history-list">
              {history.map((entry) => (
                <article
                  className="mbti-history-item"
                  data-status={entry.status}
                  key={entry.id}
                >
                  <div className="mbti-history-item-main">
                    <button
                      className="mbti-history-item-copy"
                      onClick={() => restoreHistory(entry)}
                      type="button"
                    >
                      <span className="mbti-history-title-row">
                        <strong>{entry.question}</strong>
                        <span className="mbti-history-status" data-status={entry.status}>
                          {historyStatusLabel(entry.status)}
                        </span>
                      </span>
                      <span>
                        {entry.profileCode} · {entry.scaleLabel} ·{' '}
                        {new Date(entry.createdAt).toLocaleString()}
                      </span>
                      <span>
                        场景：{entry.sceneType ?? '旧实验'} · 对象：{objectSummaryForQuestion(entry.question, entry.rolePresets)}
                      </span>
                    </button>
                    <button
                      className="mbti-history-delete"
                      disabled={deletingHistoryId === entry.id}
                      onClick={() => deleteHistory(entry.id)}
                      type="button"
                    >
                      {deletingHistoryId === entry.id ? '删除中' : '删除'}
                    </button>
                  </div>
                  {expandedHistoryId === entry.id && (
                    <HistoryAnalysis entry={entry} />
                  )}
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function historyStatusLabel(status: TownRunStatus) {
  switch (status) {
    case 'creating':
      return '创建中';
    case 'running':
      return '正在演化';
    case 'complete':
      return '已结束';
    case 'failed':
      return '创建失败';
    case 'draft':
      return '草稿';
    default:
      return status;
  }
}

function feedbackTypeLabel(type: FeedbackType) {
  switch (type) {
    case 'unrealistic_event':
      return '这个事件不像真实生活';
    case 'unrealistic_person':
      return '这个人不像真实的人';
    case 'hit_real_issue':
      return '这个点确实戳中我';
    case 'condition_correction':
      return '我要补充现实条件';
    case 'user_reaction':
    default:
      return '我的真实反应';
  }
}

function HistoryAnalysis({ entry }: { entry: HistoryEntry }) {
  if (entry.status === 'failed') {
    return (
      <section className="mbti-history-analysis" data-status="failed">
        <strong>创建失败</strong>
        <p>{entry.error ?? '这次演化没有成功创建，可重新进入小镇再试。'}</p>
      </section>
    );
  }
  if (!entry.report) {
    return (
      <section className="mbti-history-analysis">
        <strong>{entry.status === 'complete' ? '暂无分析结论' : '未生成结论'}</strong>
        <p>这条记录没有保存到可展示的分析结果。</p>
      </section>
    );
  }
  return (
    <section className="mbti-history-analysis">
      <div>
        <span>分析结论</span>
        <strong>{entry.report.conclusion}</strong>
      </div>
      <p>{entry.report.summary}</p>
      <p>{entry.report.personalityFit}</p>
      {entry.report.answerOptions && entry.report.answerOptions.length > 0 && (
        <div className="mbti-history-options">
          {entry.report.answerOptions.slice(0, 3).map((option) => (
            <article key={option.label}>
              <span>{option.label} · {option.probability}%</span>
              <strong>{option.answer}</strong>
              <p>{option.why}</p>
            </article>
          ))}
        </div>
      )}
      <div className="mbti-history-evidence">
        {entry.report.evidence.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </div>
      <small>{entry.report.limits}</small>
    </section>
  );
}

function FinalReport({ report }: { report: ExperimentReport }) {
  const options = report.answerOptions ?? [];
  const rankedOptions = [...options].sort((a, b) => b.probability - a.probability);
  const visibleOptions = rankedOptions.slice(0, 3);
  const topOption = rankedOptions[0];
  const futurePartnerReport = isFuturePartnerAnswerReport(rankedOptions);
  const spread = rankedOptions.length > 1
    ? rankedOptions[0].probability - rankedOptions[rankedOptions.length - 1].probability
    : 100;
  const isFlat = !futurePartnerReport && rankedOptions.length >= 3 && spread < 12;
  const headline = futurePartnerReport
    ? topOption?.answer ?? report.conclusion
    : isFlat
    ? '你可能不是只会走一条路，而是会看情况切换'
    : topOption?.answer ?? report.conclusion;
  const explanation = futurePartnerReport
    ? buildFuturePartnerReportExplanation(rankedOptions, topOption, report.summary)
    : isFlat
    ? `这不是证据不足。小镇里已经有不少事件证据，但几种后续做法只差 ${spread} 个点，说明你的反应不是单一路线：有时会先稳住自己，有时会找办法处理，有时也会被外界消息拉回去。`
    : topOption?.why ?? report.summary;
  const keySignals = (isFlat ? rankedOptions.flatMap((option) => option.signals) : topOption?.signals ?? [])
    .filter(Boolean)
    .slice(0, 4);
  const displayHeadline = plainConclusionText(headline);
  const displayExplanation = plainConclusionText(explanation);
  const coreInsightParagraphs = conclusionReadableParagraphs(
    futurePartnerReport ? displayExplanation : report.summary,
  );
  const primaryReason = conciseConclusionText(report.decisionInsights?.why ?? displayExplanation, 160);
  const primaryRisk = conciseConclusionText(
    report.decisionStructure?.riskBlindspots[0] ?? report.decisionInsights?.changeConditions ?? report.limits,
    140,
  );
  const primaryAction = conciseConclusionText(
    report.decisionStructure?.nextValidationQuestions[0] ?? report.decisionInsights?.nextValidation ?? '',
    140,
  );
  const validationQuestions = report.decisionStructure?.nextValidationQuestions.slice(0, 3) ?? [];

  return (
    <section className="mbti-final-report" data-flat={isFlat}>
      <header className="mbti-final-hero">
        <div>
          <span>{futurePartnerReport ? '适合你的女性画像' : '一句话结论'}</span>
          <strong>{displayHeadline}</strong>
          <p className="mbti-final-lead">{displayExplanation}</p>
          <div className="mbti-core-insight">
            {coreInsightParagraphs.map((paragraph, index) => (
              <p key={`${paragraph}-${index}`}>{renderConclusionText(paragraph)}</p>
            ))}
          </div>
        </div>
        <aside>
          <span>{futurePartnerReport ? '匹配方向' : isFlat ? '反应分布' : '主倾向参考'}</span>
          <strong>{isFlat ? '混合' : `${topOption?.probability ?? 0}%`}</strong>
          <small>
            {isFlat ? `最高和最低只差 ${spread} 点` : topOption?.label}
          </small>
        </aside>
      </header>

      <div className="mbti-final-brief">
        <article>
          <span>为什么</span>
          <p>{primaryReason}</p>
        </article>
        <article>
          <span>风险</span>
          <p>{primaryRisk}</p>
        </article>
        <article>
          <span>下一步</span>
          <p>{primaryAction || '补一个最关键的现实条件，再看结论是否改变。'}</p>
        </article>
      </div>

      {report.confidenceNotice && (
        <p className="mbti-confidence-notice">
          {evidenceLevelLabel(report.evidenceLevel)} · {report.confidenceNotice}
        </p>
      )}

      {visibleOptions.length > 0 && (
        <div className="mbti-answer-options" data-flat={isFlat}>
          {visibleOptions.map((option, index) => (
            <article data-rank={index + 1} key={option.label}>
              <div>
                <span>{option.label}</span>
                <strong>{supportLabel(index)}</strong>
              </div>
              <div className="mbti-answer-meter" aria-hidden="true">
                <span style={{ width: `${option.probability}%` }} />
              </div>
              <p>{plainConclusionText(option.answer)}</p>
            </article>
          ))}
        </div>
      )}

      {keySignals.length > 0 && (
        <div className="mbti-final-signals">
          <span>关键依据</span>
          {keySignals.map((signal) => (
            <em key={signal}>{plainConclusionText(signal)}</em>
          ))}
        </div>
      )}

      <details className="mbti-final-details">
        <summary>展开完整分析、路径和证据</summary>
        {report.decisionStructure && (
          <DecisionStructurePanel structure={report.decisionStructure} />
        )}
        {report.decisionInsights && (
          <div className="mbti-decision-insights">
            {[
              ['为什么会倾向', report.decisionInsights.why],
              ['哪些条件会改变', report.decisionInsights.changeConditions],
              ['稳定保护什么', report.decisionInsights.stableValue],
              ['下一步验证和行动', report.decisionInsights.nextValidation],
            ].map(([title, text]) => (
              <article key={title}>
                <span>{title}</span>
                <p>{plainConclusionText(text)}</p>
              </article>
            ))}
          </div>
        )}
        {validationQuestions.length > 0 && (
          <div className="mbti-next-questions">
            <span>原始待验证点</span>
            {validationQuestions.map((question) => (
              <em key={question}>{plainConclusionText(question)}</em>
            ))}
          </div>
        )}
        {rankedOptions.length > visibleOptions.length && (
          <div className="mbti-answer-options" data-flat={isFlat}>
            {rankedOptions.slice(visibleOptions.length).map((option, index) => (
              <article data-rank={index + visibleOptions.length + 1} key={option.label}>
                <div>
                  <span>{option.label}</span>
                  <strong>{supportLabel(index + visibleOptions.length)}</strong>
                </div>
                <div className="mbti-answer-meter" aria-hidden="true">
                  <span style={{ width: `${option.probability}%` }} />
                </div>
                <p>{plainConclusionText(option.answer)}</p>
              </article>
            ))}
          </div>
        )}
        <p>{report.personalityFit}</p>
        <div className="mbti-final-evidence">
          {report.evidence.map((line: string) => (
            <span key={line}>{line}</span>
          ))}
        </div>
        <small>{report.limits}</small>
      </details>
    </section>
  );
}

function DecisionStructurePanel({ structure }: { structure: DecisionStructure }) {
  return (
    <section className="mbti-decision-structure">
      <header>
        <span>问题结构</span>
        <strong>{plainConclusionText(structure.underlyingDecision)}</strong>
        <p>表层问题：{plainConclusionText(structure.surfaceQuestion)}</p>
      </header>
      <div className="mbti-decision-structure-grid">
        <article>
          <span>关键维度</span>
          {structure.decisionDimensions.slice(0, 6).map((item) => (
            <p key={item.label}>
              <strong>{plainConclusionText(item.label)}</strong>
              {plainConclusionText(item.whyItMatters)}
              {item.userBlindSpot ? `；可能忽略：${plainConclusionText(item.userBlindSpot)}` : ''}
            </p>
          ))}
        </article>
        <article>
          <span>可能路径</span>
          {structure.possiblePaths.slice(0, 4).map((path) => (
            <p key={path.label}>
              <strong>{plainConclusionText(path.label)}</strong>
              {plainConclusionText(path.whenLikely)}，可能结果：{plainConclusionText(path.possibleResult)}
            </p>
          ))}
        </article>
        <article>
          <span>关键未知</span>
          {structure.unknowns.slice(0, 6).map((item) => (
            <em key={item}>{plainConclusionText(item)}</em>
          ))}
        </article>
        <article>
          <span>隐藏需求</span>
          {structure.hiddenNeeds.slice(0, 6).map((item) => (
            <em key={item}>{plainConclusionText(item)}</em>
          ))}
        </article>
        <article>
          <span>风险盲点</span>
          {structure.riskBlindspots.slice(0, 6).map((item) => (
            <em key={item}>{plainConclusionText(item)}</em>
          ))}
        </article>
        <article>
          <span>下一步验证</span>
          {structure.nextValidationQuestions.slice(0, 6).map((item) => (
            <em key={item}>{plainConclusionText(item)}</em>
          ))}
        </article>
      </div>
    </section>
  );
}

function isFuturePartnerAnswerReport(options: ExperimentReport['answerOptions'] = []) {
  const text = options
    .map((option) => `${option.label} ${option.answer} ${option.signals.join(' ')}`)
    .join(' ');
  return /生活节奏稳定型|能把话说清楚型|独立但愿意互相照应型|需要谨慎避开|适合你的女性|退休后老家生活/.test(text);
}

function buildFuturePartnerReportExplanation(
  rankedOptions: NonNullable<ExperimentReport['answerOptions']>,
  topOption: NonNullable<ExperimentReport['answerOptions']>[number] | undefined,
  fallback: string,
) {
  const avoid = rankedOptions.find((option) => /谨慎避开|避开/.test(option.label));
  const secondary = rankedOptions.find((option) => option !== topOption && !/谨慎避开|避开/.test(option.label));
  const parts = [
    topOption?.why,
    secondary ? `同时要看“${secondary.label}”：${secondary.answer}` : '',
    avoid ? `不适合你的类型也要明确：${avoid.answer}` : '',
  ].filter(Boolean);
  return parts.join(' ') || fallback;
}

function evidenceLevelLabel(level?: ExperimentReport['evidenceLevel']) {
  if (level === 'level_3') {
    return '高可信';
  }
  if (level === 'level_2') {
    return '阶段可信';
  }
  if (level === 'level_1') {
    return '低可信';
  }
  return '低置信参考';
}

function supportLabel(index: number) {
  if (index === 0) {
    return '证据最多';
  }
  if (index === 1) {
    return '也说得通';
  }
  return '暂时较弱';
}

function plainConclusionText(text: string) {
  return text
    .replace(/\*\*/g, '')
    .replace(/\s*[（(](resentment|anxiety|avoidance|boundary|control|repair|stress|depression)[^)）]*[)）]/gi, '')
    .replace(/\bresentment\b/gi, '怨气')
    .replace(/\banxiety\b/gi, '焦虑')
    .replace(/\bavoidance\b/gi, '回避')
    .replace(/\bboundary\b/gi, '边界')
    .replace(/\bcontrol\b/gi, '控制感')
    .replace(/\brepair\b/gi, '修复')
    .replace(/\bstress\b/gi, '压力')
    .replace(/\bdepression\b/gi, '低落')
    .replace(/\bAI\b|MBTI/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function conclusionReadableParagraphs(text: string) {
  const normalized = text
    .replace(/\s+/g, ' ')
    .replace(/([。！？；])\s*/g, '$1|')
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
  if (normalized.length <= 1) {
    const plain = plainConclusionText(text);
    return plain ? [plain] : [];
  }
  const paragraphs: string[] = [];
  let buffer = '';
  normalized.forEach((sentence) => {
    const next = buffer ? `${buffer}${sentence}` : sentence;
    if (next.length > 92 && buffer) {
      paragraphs.push(buffer);
      buffer = sentence;
    } else {
      buffer = next;
    }
  });
  if (buffer) {
    paragraphs.push(buffer);
  }
  return paragraphs.slice(0, 4);
}

function renderConclusionText(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  if (parts.length === 0) {
    return plainConclusionText(text);
  }
  return parts.map((part, index) => {
    const marked = part.match(/^\*\*([^*]+)\*\*$/);
    if (marked) {
      return <strong key={`${marked[1]}-${index}`}>{plainConclusionText(marked[1])}</strong>;
    }
    return <span key={`${part}-${index}`}>{plainConclusionText(part)}</span>;
  });
}

function conciseConclusionText(text: string, maxLength: number) {
  const plain = plainConclusionText(text);
  const firstSentence = plain.split(/[。！？]/).find((part) => part.trim().length > 0)?.trim() ?? plain;
  const value = firstSentence.length >= 24 ? firstSentence : plain;
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function ExperimentTownFrame({
  activeLocationKey,
  activeLocationKeys,
  engineId,
  timelineNode,
  worldId,
}: {
  activeLocationKey?: string;
  activeLocationKeys?: string[];
  engineId: Id<'engines'>;
  timelineNode?: TownObservationSummary['timeline'][number];
  worldId: Id<'worlds'>;
}) {
  const convex = useConvex();
  const [selectedElement, setSelectedElement] = useState<{
    kind: 'player';
    id: GameId<'players'>;
  }>();
  const [gameWrapperRef, { width, height }] = useElementSize();
  const game = useServerGame(worldId);
  const worldState = useQuery(api.world.worldState, { worldId });
  const { historicalTime } = useHistoricalTime(worldState?.engine);
  const scrollViewRef = useRef<HTMLDivElement>(null);
  const [detailsCollapsed, setDetailsCollapsed] = useState(false);

  useEffect(() => {
    if (!game) {
      return;
    }
    if (selectedElement?.id && game.world.players.has(selectedElement.id)) {
      return;
    }
    const selfDescription = [...game.playerDescriptions.values()].find(
      (description) => description.name === '我',
    );
    const fallbackPlayer = game.world.players.values().next().value;
    const defaultPlayerId = selfDescription?.playerId ?? fallbackPlayer?.id;
    if (defaultPlayerId) {
      setSelectedElement({ kind: 'player', id: defaultPlayerId });
    }
  }, [game, selectedElement?.id]);

  if (!game) {
    return <div className="mbti-aitown-loading">正在加载 AI Town 画布...</div>;
  }

  return (
    <div className="mbti-aitown-frame game-frame" data-details-collapsed={detailsCollapsed}>
      <button
        aria-label={detailsCollapsed ? '展开右栏' : '收起右栏'}
        aria-expanded={!detailsCollapsed}
        className="mbti-aitown-details-toggle"
        onClick={() => setDetailsCollapsed((collapsed) => !collapsed)}
        title={detailsCollapsed ? '展开右栏' : '收起右栏'}
        type="button"
      >
        <span aria-hidden="true">{detailsCollapsed ? '<' : '>'}</span>
      </button>
      <div className="mbti-aitown-canvas" ref={gameWrapperRef}>
        {width > 0 && height > 0 && (
          <Stage
            key={`${detailsCollapsed ? 'collapsed' : 'expanded'}-${width}x${height}`}
            width={width}
            height={height}
            options={{ backgroundColor: 0x7ab5ff }}
          >
            <ConvexProvider client={convex}>
              <PixiGame
                activeLocationKey={activeLocationKey}
                activeLocationKeys={activeLocationKeys}
                engineId={engineId}
                game={game}
                height={height}
                historicalTime={historicalTime}
                fitActiveLocations
                setSelectedElement={setSelectedElement}
                width={width}
                worldId={worldId}
              />
            </ConvexProvider>
          </Stage>
        )}
        {timelineNode && (
          <div className="mbti-town-timeline-chip" aria-label="小镇模拟时间">
            <strong>第 {timelineNode.townDay} 天 · {townTimelinePhaseLabel(timelineNode.phase)}</strong>
            <span>
              {townTimelineScopeLabel(timelineNode.scope)}
              {timelineNode.locationKey ? ` · ${townTimelineLocationLabel(timelineNode.locationKey)}` : ''}
            </span>
          </div>
        )}
        <div className="mbti-town-map-hint" aria-label="地图操作提示">
          拖动地图 · 滚轮缩放 · 点击可移动
        </div>
      </div>
      {!detailsCollapsed && (
        <div className="mbti-aitown-details bg-brown-800 text-brown-100" ref={scrollViewRef}>
          <PlayerDetails
            engineId={engineId}
            game={game}
            playerId={selectedElement?.id}
            scrollViewRef={scrollViewRef}
            setSelectedElement={setSelectedElement}
            worldId={worldId}
          />
        </div>
      )}
    </div>
  );
}

function QuestionGuidanceRail({
  behaviorEvents,
  currentTimelineNode,
  decisionState,
  eventAssessments,
  eventEvidence: persistedEventEvidence,
  events,
  experimentId,
  idleResolutionState = 'idle',
  innerThoughts,
  messages,
  onAssessEvent,
  onNudgeTimeline,
  onSubmitUserResponse,
  playerDescriptions,
  questionFocus,
  runStatus,
  showInlineResponses,
  manualCalibrationMode = false,
  socialEvents,
  targetEventCount,
  userResponses,
}: {
  behaviorEvents: Array<{
    _id: string;
    createdAt: number;
    description: string;
    label: string;
    mbtiEventId: string;
    playerId: string;
  }>;
  currentTimelineNode?: TownObservationSummary['timeline'][number];
  decisionState?: DecisionState;
  eventEvidence: Array<{
    _id: string;
    kind: 'social_event' | 'message' | 'behavior' | 'thought' | string;
    mbtiEventId: string;
    occurredAt: number;
    participantIds: string[];
    reason: string;
    summary: string;
  }>;
  eventAssessments: EventAssessment[];
  events: Array<{
    _id: string;
    kind: string;
    tickOffset: number;
    title: string;
    description: string;
    status: string;
    testedVariable?: string;
    testedHypotheses?: string[];
    questionLink?: string;
    informationGoal?: string;
    coveredTargetIds?: string[];
    whyThisTestsIt?: string;
    locationKey?: string;
    expectedSignals?: string[];
    responseOptions?: string[];
    residentRoles?: string[];
    residentParticipationGoal?: string;
    probeOrigin?: 'initial' | 'adaptive' | 'calibration';
    timelineTriggerReason?: string;
    scheduledDay?: number;
    scheduledPhase?: 'morning' | 'afternoon' | 'evening' | 'night';
    adaptiveReason?: string;
  }>;
  experimentId?: Id<'mbtiExperiments'>;
  idleResolutionState?: 'idle' | 'running' | 'error';
  innerThoughts: Array<{
    _creationTime?: number;
    playerId: string;
    source: string;
    text: string;
  }>;
  messages: Array<{
    _creationTime?: number;
    _id: string;
    author: string;
    text: string;
  }>;
  onAssessEvent: (args: {
    experimentId: Id<'mbtiExperiments'>;
    eventId: Id<'mbtiEvents'>;
  }) => Promise<unknown>;
  onNudgeTimeline?: () => Promise<unknown>;
  onSubmitUserResponse: (args: {
    experimentId: Id<'mbtiExperiments'>;
    mbtiEventId: Id<'mbtiEvents'>;
    selectedOption: string;
    confidence: number;
    emotions: string[];
    freeText: string;
    scenarioFit: 'fits' | 'partial' | 'not_fit';
    feedbackType?: FeedbackType;
    correctionText?: string;
  }) => Promise<unknown>;
  playerDescriptions: Array<{
    playerId: string;
    name: string;
  }>;
  questionFocus?: QuestionFocus;
  runStatus: TownRunStatus;
  showInlineResponses: boolean;
  manualCalibrationMode?: boolean;
  socialEvents: Array<{
    _id: string;
    title: string;
    description: string;
    createdAt: number;
    mbtiEventId?: string;
    participantIds?: string[];
  }>;
  targetEventCount?: number;
  userResponses: UserResponse[];
}) {
  if (!questionFocus) {
    return null;
  }
  const started = runStatus === 'running' || runStatus === 'complete';
  const completed = runStatus === 'complete';
  const nextEvent = events.find((event) => ['seeded', 'candidate', 'delayed'].includes(event.status));
  const activeEvent = events.find((event) => eventIsTriggeredOrBeyond(event.status));
  const playerNameById = new Map(playerDescriptions.map((description) => [description.playerId, description.name]));
  const userResponseByEvent = new Map(userResponses.map((response) => [response.mbtiEventId, response]));
  const assessmentByEvent = new Map(eventAssessments.map((assessment) => [assessment.mbtiEventId, assessment]));
  const terminalResponseStatuses = new Set(['responded', 'skipped']);
  const persistedEvidenceByEvent = new Map<string, typeof persistedEventEvidence>();
  for (const evidence of persistedEventEvidence) {
    const current = persistedEvidenceByEvent.get(evidence.mbtiEventId) ?? [];
    current.push(evidence);
    persistedEvidenceByEvent.set(evidence.mbtiEventId, current);
  }
  const sortedEventRecords = [...socialEvents].sort((a, b) => a.createdAt - b.createdAt);
  const eventProgressEvidence = events.map((event) => {
    const record = socialEvents.find((item) => item.mbtiEventId === event._id)
      ?? socialEvents.find((item) => item.title === event.title);
    const participantIds = new Set(record?.participantIds ?? []);
    const recordIndex = record
      ? sortedEventRecords.findIndex((item) => item._id === record._id)
      : -1;
    const nextRecord = recordIndex >= 0 ? sortedEventRecords[recordIndex + 1] : undefined;
    const windowStart = record ? record.createdAt - 5000 : 0;
    const windowEnd = nextRecord ? nextRecord.createdAt - 5000 : record ? record.createdAt + 90 * 1000 : 0;
    const persistedEvidence = (persistedEvidenceByEvent.get(event._id) ?? [])
      .sort((a, b) => (a.occurredAt - b.occurredAt) || a._id.localeCompare(b._id));
    const persistedMessages = persistedEvidence
      .filter((evidence) => evidence.kind === 'message')
      .map((evidence) => ({
        _id: evidence._id,
        author: evidence.participantIds[0] ?? '',
        text: evidence.summary,
        _creationTime: evidence.occurredAt,
      }));
    const matchedMessages = persistedMessages.length > 0
      ? persistedMessages
      : record
      ? selectEventRelatedMessages({
        eventText: `${event.title} ${event.description}`,
        messages,
        participantIds,
        recordText: record.description,
        windowEnd,
        windowStart,
      })
      : [];
    const matchedThoughts = persistedEvidence
      .filter((evidence) => evidence.kind === 'thought')
      .map((evidence) => ({
        playerId: evidence.participantIds[0] ?? '',
        source: '事件内心',
        text: evidence.summary,
        _creationTime: evidence.occurredAt,
      }));
    const persistedBehaviors = persistedEvidence
      .filter((evidence) => evidence.kind === 'behavior')
      .map((evidence) => ({
        playerId: evidence.participantIds[0] ?? '',
        text: evidence.summary,
      }))
      .filter((behavior) => playerNameById.get(behavior.playerId) === '我');
    const matchedBehaviors = persistedBehaviors.length > 0
      ? persistedBehaviors
      : record
      ? behaviorEvents
        .filter((behavior) =>
          behavior.mbtiEventId === event._id &&
          playerNameById.get(behavior.playerId) === '我'
        )
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(0, 4)
        .map((behavior) => ({
          playerId: behavior.playerId,
          text: behavior.description,
        }))
      : [];
    return { event, matchedBehaviors, matchedMessages, matchedThoughts, record };
  });
  const orderedEventProgressEvidence = [...eventProgressEvidence].sort((left, right) => {
    const leftTriggered = eventIsTriggeredOrBeyond(left.event.status);
    const rightTriggered = eventIsTriggeredOrBeyond(right.event.status);
    if (leftTriggered !== rightTriggered) {
      return leftTriggered ? -1 : 1;
    }
    const leftRecordTime = left.record?.createdAt ?? 0;
    const rightRecordTime = right.record?.createdAt ?? 0;
    if (leftTriggered && leftRecordTime !== rightRecordTime) {
      return rightRecordTime - leftRecordTime;
    }
    return (left.event.tickOffset ?? 0) - (right.event.tickOffset ?? 0);
  });
  const calibrationPriority = (item: (typeof eventProgressEvidence)[number]) => {
    const eventText = [
      item.event.title,
      item.event.description,
      item.event.testedVariable,
      item.event.informationGoal,
      item.event.expectedSignals?.join(' '),
    ].filter(Boolean).join(' ');
    let score = 0;
    if (item.event.probeOrigin === 'calibration') {
      score += 8;
    }
    if (item.event.probeOrigin === 'adaptive') {
      score += 5;
    }
    if (item.matchedMessages.some((message) => playerNameById.get(message.author) === '我')) {
      score += 4;
    }
    if (
      item.matchedBehaviors.length > 0 ||
      item.matchedThoughts.some((thought) => playerNameById.get(thought.playerId) === '我')
    ) {
      score += 3;
    }
    if (/重大|关键|边界|误解|修复|分开|现金|合同|家庭|承诺|不可逆/.test(eventText)) {
      score += 3;
    }
    return score;
  };
  const calibrationCandidates = manualCalibrationMode
    ? eventProgressEvidence
      .filter((item) =>
        !terminalResponseStatuses.has(item.event.status) &&
        !userResponseByEvent.has(item.event._id) &&
        Boolean(item.record) &&
        (
          item.event.probeOrigin === 'calibration' ||
          item.matchedMessages.some((message) => playerNameById.get(message.author) === '我') ||
          item.matchedBehaviors.length > 0 ||
          item.matchedThoughts.some((thought) => playerNameById.get(thought.playerId) === '我')
        )
      )
      .sort((left, right) => calibrationPriority(right) - calibrationPriority(left))
      .slice(0, 2)
      .map(({ event }) => event)
    : [];
  const fallbackCalibrationEvents = manualCalibrationMode && calibrationCandidates.length === 0
    ? eventProgressEvidence
      .filter((item) =>
        !terminalResponseStatuses.has(item.event.status) &&
        !userResponseByEvent.has(item.event._id) &&
        Boolean(item.record)
      )
      .sort((left, right) => (right.record?.createdAt ?? 0) - (left.record?.createdAt ?? 0))
      .slice(0, 2)
      .map(({ event }) => event)
    : [];
  const calibrationEvents = calibrationCandidates.length > 0 ? calibrationCandidates : fallbackCalibrationEvents;
  const triggeredEvents = events.filter((event) => eventIsTriggeredOrBeyond(event.status)).length;
  const recordedEvents = eventProgressEvidence.filter(({ record }) => !!record).length;
  const evidencedEvents = eventProgressEvidence.filter(
    ({ matchedBehaviors, matchedMessages, matchedThoughts }) =>
      matchedMessages.some((message) => playerNameById.get(message.author) === '我') ||
      matchedBehaviors.length > 0 ||
      matchedThoughts.some((thought) => playerNameById.get(thought.playerId) === '我'),
  ).length;
  const runtimeSummary = summarizeEventRuntime(events);
  const nextRuntimeEvent = runtimeSummary.nextTimelineEvent;
  const nextEventWait = timelineEventWaitState(currentTimelineNode, nextRuntimeEvent);
  const reachedTargetBatch = typeof targetEventCount === 'number' && events.length >= targetEventCount;
  const nudgeAttemptRef = useRef<string | null>(null);
  useEffect(() => {
    if (!nextEventWait?.due || !nextRuntimeEvent?._id || !onNudgeTimeline || runStatus !== 'running') {
      return;
    }
    const attemptKey = `${nextRuntimeEvent._id}:${currentTimelineNode?.townDay}:${currentTimelineNode?.phase}`;
    if (nudgeAttemptRef.current === attemptKey) {
      return;
    }
    nudgeAttemptRef.current = attemptKey;
    void onNudgeTimeline().catch((error) => {
      console.warn('MBTI timeline nudge failed', error);
      nudgeAttemptRef.current = null;
    });
  }, [
    currentTimelineNode?.phase,
    currentTimelineNode?.townDay,
    nextEventWait?.due,
    nextRuntimeEvent?._id,
    onNudgeTimeline,
    runStatus,
  ]);
  const resultText = guidanceResultText({
    completed,
    events,
    records: socialEvents,
    started,
  });
  const stageItems = [
    {
      detail: '观察方向已确定，事件只负责制造场景，不把问题直接塞给角色。',
      state: 'ready',
      status: '已完成',
      title: '拆问题',
    },
    {
      detail: events.length > 0
        ? `当前已生成 ${events.length} 个观察事件；下一项：${nextEvent?.title ?? '等待生活线和证据缺口判断'}。`
        : '还没有事件，系统会先生成压力、误解或修复窗口。',
      state: events.length > 0 ? 'ready' : 'pending',
      status: events.length > 0 ? '动态生成中' : '待生成',
      title: '生成事件',
    },
    {
      detail: activeEvent
        ? `已触发 ${triggeredEvents}/${events.length} 个事件；${recordedEvents} 个有事件记录，${evidencedEvents} 个有聊天/内心/行为证据。`
        : '还没有事件进入小镇互动。',
      state: triggeredEvents > 0 || started ? 'active' : 'pending',
      status: triggeredEvents > 0 ? '进行中' : started ? '等待触发' : '未开始',
      title: '触发互动',
    },
    {
      detail: completed
        ? '已达到整体观察标准，并根据聊天、事件、内心和行为整理整体结论。'
        : evidencedEvents > 0
        ? '已有阶段性判断，但整体结论还要等目标事件、待触发事件和关键维度全部达标。'
        : '还缺少足够可对应到事件的证据，当前不能直接下结论。',
      state: completed ? 'ready' : evidencedEvents > 0 ? 'active' : 'pending',
      status: completed ? '整体结论' : evidencedEvents > 0 ? '阶段判断' : '未定位',
      title: '定位答案',
    },
  ];
  const progressBody = (
    <>
      <section className="mbti-design-logic">
        <article tabIndex={0}>
          <span>原问题拆解</span>
          <strong>{questionFocus.observationGoal}</strong>
          <p>
            {(questionFocus.analysisDimensions?.length
              ? questionFocus.analysisDimensions
              : questionFocus.evidenceTargets).join('、')}
          </p>
        </article>
        {questionFocus.reasonablenessDiscussion && (
          <article tabIndex={0}>
            <span>理解是否合理</span>
            <strong>{questionFocus.reasonablenessDiscussion.plausibleInterpretation}</strong>
            <p>可能合理：{questionFocus.reasonablenessDiscussion.whyReasonable.join('、')}</p>
            <p>需要讨论：{questionFocus.reasonablenessDiscussion.discussionPrompt}</p>
          </article>
        )}
        <article tabIndex={0}>
          <span>事件设计逻辑</span>
          <strong>{questionFocus.designRationale ?? '把抽象问题转成多个可观察的生活事件。'}</strong>
          <p>
            这些事件分别制造压力、信息不足、他人介入或后续选择，用来观察用户在真实互动里的反应。
          </p>
        </article>
        <article tabIndex={0}>
          <span>判断依据</span>
          <strong>{questionFocus.resolutionCriteria}</strong>
          <p>
            方法参考：{(questionFocus.theoreticalBasis?.length
              ? questionFocus.theoreticalBasis
              : ['压力与应对', '认知行为', '行为激活']).join('、')}
          </p>
        </article>
      </section>
      <section className="mbti-runtime-event-panel" aria-label="动态事件运行状态">
        <article>
          <span>事件来源</span>
          <strong>
            {eventSourceSummaryText(runtimeSummary.originCounts)}
          </strong>
          <p>后续事件随居民生活和证据变化逐个生成；用户纠正只在你指出设定不合理后出现。</p>
        </article>
        <article>
          <span>时间线队列</span>
          <strong>
            已发生 {runtimeSummary.statusCounts.occurred} · 等待 {runtimeSummary.statusCounts.waitingTimeline}
          </strong>
          <p>{runtimeSummary.statusCounts.dynamicGenerated} 个事件来自动态生成或用户纠正后的补证据。</p>
        </article>
        <article>
          <span>下一事件</span>
          {nextRuntimeEvent ? (
            <>
              <strong>
                {typeof nextRuntimeEvent.scheduledDay === 'number'
                  ? `第 ${nextRuntimeEvent.scheduledDay} 天`
                  : '等待排期'}
                {nextRuntimeEvent.scheduledPhase ? ` · ${eventTimelinePhaseLabel(nextRuntimeEvent.scheduledPhase)}` : ''}
                {' · '}
                {eventStatusLabel(nextRuntimeEvent.status)}
              </strong>
              <p>{nextRuntimeEvent.title}</p>
              {nextEventWait && (
                <p>
                  {nextEventWait.due
                    ? '小镇时间已到，正在自动检查并触发。'
                    : `当前 ${nextEventWait.currentLabel}，预计还需 ${nextEventWait.remainingLabel}。`}
                </p>
              )}
              <p>{eventTimelineReasonText(nextRuntimeEvent.timelineTriggerReason)}</p>
            </>
          ) : (
            <>
              <strong>
                {idleResolutionState === 'running'
                  ? '正在判断总结或补证据'
                  : reachedTargetBatch
                  ? '当前批次已结束'
                  : '暂无等待项'}
              </strong>
              <p>
                {idleResolutionState === 'running'
                  ? '系统正在检查当前证据是否足够形成结论；不足时会立即生成一个补证据事件。'
                  : idleResolutionState === 'error'
                  ? '收敛检查失败，请稍后重试或查看后端日志。'
                  : reachedTargetBatch
                  ? '系统会在当前证据足够时结束；不足时明确生成下一件补证据事件。'
                  : '当前没有排期事件；系统会在生成下一项前给出明确状态。'}
              </p>
            </>
          )}
        </article>
      </section>
      <div className="mbti-guidance-steps">
        {stageItems.map((stage, index) => (
          <article
            aria-label={`${index + 1}. ${stage.title}，${stage.status}。${stage.detail}`}
            data-state={stage.state}
            key={stage.title}
            tabIndex={0}
          >
            <span>{index + 1}</span>
            <strong>{stage.title}</strong>
            <em>{stage.status}</em>
            <p>{stage.detail}</p>
          </article>
        ))}
      </div>
      {decisionState && (
        <section className="mbti-decision-state">
          <header>
            <span>观察置信</span>
            <strong>
              用户边界 {decisionState.responseCoverage.responded}/{decisionState.responseCoverage.required}
            </strong>
            <em>
              {decisionState.responseCoverage.missing > 0
                ? `还有 ${decisionState.responseCoverage.missing} 个低置信变量留给自然证据`
                : '当前用户边界已足够'}
            </em>
          </header>
          <div>
            <DecisionStateGroup title="已确认变量" items={decisionState.resolvedVariables} emptyText="还没有变量被用户边界确认。" />
            <DecisionStateGroup title="仍需测试" items={decisionState.uncertainVariables} emptyText="暂无待测试变量。" />
            <DecisionStateGroup title="现实约束" items={decisionState.confirmedConstraints} emptyText="暂未记录现实约束。" />
            <DecisionStateGroup title="敏感条件" items={decisionState.sensitiveConditions} emptyText="暂未识别敏感条件。" />
          </div>
          {decisionState.lastUserCorrection && (
            <p>最近修正：{decisionState.lastUserCorrection}</p>
          )}
        </section>
      )}
      {calibrationEvents.length > 0 && (
        <section className="mbti-response-queue" id="mbti-calibration-events">
          <header>
            <span>可选纠正节点</span>
            <strong>{calibrationEvents.length}</strong>
          </header>
          <ul>
            {calibrationEvents.map((event) => (
              <li key={event._id}>
                <b>{event.title}</b>
                <span>{event.testedVariable ?? plannedEventSections(event.description).observationAxis ?? '关键变量待确认'}</span>
              </li>
            ))}
          </ul>
          <p>这里只显示最需要确认的少数节点；不处理也不会阻塞小镇继续演化。</p>
        </section>
      )}
      {events.length > 0 && (
        <div className="mbti-guidance-events" id={calibrationEvents.length > 0 ? undefined : 'mbti-calibration-events'}>
          {orderedEventProgressEvidence.map(({ event, matchedBehaviors, matchedMessages, matchedThoughts, record }) => (
            <EventProgressCard
              event={event}
              experimentId={experimentId}
              key={event._id}
              matchedBehaviors={matchedBehaviors}
              matchedMessages={matchedMessages}
              matchedThoughts={matchedThoughts}
              onAssessEvent={onAssessEvent}
              onSubmitUserResponse={onSubmitUserResponse}
              participantCount={record?.participantIds?.length ?? 0}
              playerNameById={playerNameById}
              recordDescription={record?.description}
              recordedAt={record?.createdAt}
              scenarioContext={`${questionFocus.observationGoal} ${questionFocus.drivingTension} ${questionFocus.resolutionCriteria} ${event.description}`}
              resolutionCriteria={questionFocus.resolutionCriteria}
              showInlineResponse={showInlineResponses}
              userResponse={userResponseByEvent.get(event._id)}
              eventAssessment={assessmentByEvent.get(event._id)}
            />
          ))}
        </div>
      )}
    </>
  );
  return (
    <section className="mbti-guidance-rail">
      <div className="mbti-guidance-head">
        <div>
          <span>演化进度</span>
          <strong>{resultText}</strong>
        </div>
        <p>
          <b>{recordedEvents}/{events.length || 0}</b> 有记录
          <b>{evidencedEvents}</b> 有证据
          <b>{completed ? '整体完成' : evidencedEvents > 0 ? '阶段观察中' : '进行中'}</b>
        </p>
      </div>
      {completed ? (
        <details className="mbti-progress-collapse">
          <summary>展开查看阶段、事件和证据</summary>
          {progressBody}
        </details>
      ) : progressBody}
      <details className="mbti-guidance-details">
        <summary>查看整体观察口径</summary>
        <div>
          <p><strong>当前张力：</strong>{questionFocus.drivingTension}</p>
          <p><strong>观察目标：</strong>{questionFocus.observationGoal}</p>
          <p><strong>结论门槛：</strong>{questionFocus.resolutionCriteria}</p>
        </div>
      </details>
    </section>
  );
}

function StartupResponseDialog({
  onStart,
  startupQuestions,
}: {
  onStart: (answers: StartupAnswer[]) => Promise<void>;
  startupQuestions: StartupQuestion[];
}) {
  const [answersByQuestion, setAnswersByQuestion] = useState<Record<number, string[]>>({});
  const [notesByQuestion, setNotesByQuestion] = useState<Record<number, string>>({});
  const [starting, setStarting] = useState(false);
  const answerForQuestion = (index: number) => {
    const note = notesByQuestion[index]?.trim() ?? '';
    const selected = answersByQuestion[index] ?? [];
    return [...selected, ...(note ? [`补充回答：${note}`] : [])].join('、');
  };
  const completedCount = startupQuestions.filter((_, index) => answerForQuestion(index)).length;
  const canStart = !starting;

  function chooseOption(questionIndex: number, option: string) {
    const startupQuestion = startupQuestions[questionIndex];
    const maxSelections = startupQuestionMaxSelections(startupQuestion);
    setAnswersByQuestion((current) => ({
      ...current,
      [questionIndex]: toggleStartupOption(current[questionIndex] ?? [], option, maxSelections),
    }));
  }

  function buildStartupAnswers(): StartupAnswer[] {
    const answers: StartupAnswer[] = [];
    startupQuestions.forEach((startupQuestion, index) => {
      const selectedAnswer = (answersByQuestion[index] ?? []).join('、');
      const note = notesByQuestion[index]?.trim() ?? '';
      const answer = selectedAnswer || note;
      if (!answer) {
        return;
      }
      answers.push({
        question: startupQuestion.question,
        answer,
        ...(note ? { note } : {}),
      });
    });
    return answers;
  }

  return (
    <div className="mbti-startup-dialog" role="dialog" aria-modal="true" aria-label="启动前关键回应">
      <section>
        <header>
          <div>
            <span>关键问题</span>
            <strong>先回答这 {startupQuestions.length} 个问题，再生成本轮事件</strong>
            <p>你的回答会作为事件生成的前置约束；回答越具体，后面的情境越贴近你的真实处境。</p>
          </div>
          <b>{completedCount}/{startupQuestions.length}</b>
        </header>
        <div className="mbti-startup-question-list">
          {startupQuestions.map((startupQuestion, index) => {
            const selectedAnswers = answersByQuestion[index] ?? [];
            const answer = answerForQuestion(index);
            const note = notesByQuestion[index]?.trim() ?? '';
            const maxSelections = startupQuestionMaxSelections(startupQuestion);
            return (
              <article data-complete={Boolean(answer)} key={`${index}-${startupQuestion.question}`}>
                <div>
                  <span>问题 {index + 1}</span>
                  <strong>{startupQuestion.question}</strong>
                  {maxSelections > 1 && <p>可多选，最多选 {maxSelections} 项。</p>}
                </div>
                <div className="mbti-startup-options">
                  {startupQuestion.options.map((option) => (
                    <button
                      aria-pressed={selectedAnswers.includes(option)}
                      className={selectedAnswers.includes(option) ? 'selected' : ''}
                      key={option}
                      onClick={() => chooseOption(index, option)}
                      type="button"
                    >
                      {option}
                    </button>
                  ))}
                </div>
                <textarea
                  onChange={(inputEvent) =>
                    setNotesByQuestion((current) => ({
                      ...current,
                      [index]: inputEvent.target.value,
                    }))
                  }
                  placeholder="可选：补充一个现实条件，例如当前状态、未来安排、不能接受的条件。"
                  value={notesByQuestion[index] ?? ''}
                />
                <em>
                  {answer
                    ? `已记录：${compactText(answer, 72)}`
                    : note
                    ? '已使用补充内容作为回答'
                    : maxSelections > 1
                    ? `请选择最多 ${maxSelections} 个真实事项，或填写补充条件`
                    : '请选择一个最接近的真实反应，或填写补充条件'}
                </em>
              </article>
            );
          })}
        </div>
        <footer>
          <span>
            {completedCount > 0
              ? `已补充 ${completedCount}/${startupQuestions.length} 个关键回答，可以启动小镇。`
              : '未回答时也能启动，但事件只能按低假设生成，准确度会明显下降。'}
          </span>
          <button
            disabled={!canStart}
            onClick={async () => {
              setStarting(true);
              try {
                await onStart(buildStartupAnswers());
              } finally {
                setStarting(false);
              }
            }}
            type="button"
          >
            {starting ? '正在启动...' : '启动小镇演化'}
          </button>
        </footer>
      </section>
    </div>
  );
}

type StartupQuestion = {
  question: string;
  options: string[];
  maxSelections?: number;
};

type StartupAnswer = {
  question: string;
  answer: string;
  note?: string;
};

type TownObservationSummary = {
  timeline: Array<{
    timelineEventId: string;
    townDay: number;
    phase: 'morning' | 'afternoon' | 'evening' | 'night';
    dayProgress?: number;
    scope: 'resident_life' | 'resident_work' | 'relationship' | 'question_probe';
    storyline: string;
    source: string;
    title: string;
    summary: string;
    residentNames: string[];
    locationKey?: string;
    createdAt: number;
  }>;
  activeResidentPlans: Array<{
    residentKey: string;
    residentName: string;
    role: string;
    intent: string;
    targetLocationKey?: string;
    socialAppetite: number;
    seekResidentNames: string[];
    avoidResidentNames: string[];
    topicSeed?: string;
    updatedAt: number;
  }>;
  residentDevelopment: Array<{
    residentKey: string;
    residentName: string;
    role: string;
    longTermGoal: string;
    currentPressure: string;
    economy: number;
    career: number;
    social: number;
    health: number;
    stress: number;
    lastImpactReason?: string;
    updatedAt: number;
    currentIntent?: string;
  }>;
  residentDevelopmentMetrics?: {
    activeResidentCount: number;
    profiledResidentCount: number;
    recentlyChangedResidentCount: number;
    highPressureResidentCount: number;
    stagnantResidentCount: number;
    averageStress: number;
    averageSupport: number;
    status: 'developing' | 'watching_pressure' | 'stagnant' | 'unprofiled';
  };
  pressureRelationships: Array<{
    relationshipId: string;
    residentNames: string[];
    familiarity: number;
    trust: number;
    warmth: number;
    tension: number;
    influence: number;
    summary: string;
    lastInteractionAt?: number;
  }>;
  recentMemories: Array<{
    memoryId: string;
    kind: string;
    salience: number;
    title: string;
    summary: string;
    residentNames: string[];
    locationKey?: string;
    sourceKind?: string;
    sourceReason?: string;
    relationshipDelta?: {
      familiarity: number;
      trust: number;
      warmth: number;
      tension: number;
      influence: number;
      reason: string;
    };
    updatedAt: number;
  }>;
  activityStream: Array<{
    id: string;
    kind: 'autonomy_tick' | 'scene' | 'reflection' | 'memory';
    title: string;
    summary: string;
    residentNames: string[];
    locationKey?: string;
    salience: number;
    occurredAt: number;
    sourceReason?: string;
  }>;
  conversationRequests: Array<{
    requestId: string;
    status: 'pending' | 'started' | 'skipped' | 'expired';
    residentNames: string[];
    locationKey?: string;
    topicSeed: string;
    priority: 'low' | 'medium' | 'high';
    reason: string;
    updatedAt: number;
    startedAt?: number;
  }>;
};

function TownObservationDashboard({
  observation,
  runStatus,
}: {
  observation: TownObservationSummary;
  runStatus: TownRunStatus;
}) {
  const activePlan = observation.activeResidentPlans[0];
  const timelineNode = observation.timeline?.[0];
  const residentMetrics = observation.residentDevelopmentMetrics;
  const residentDevelopment = observation.residentDevelopment?.[0];
  const pressureRelationship = observation.pressureRelationships[0];
  const recentMemory = observation.recentMemories[0];
  const recentActivity = observation.activityStream[0];
  const conversationRequest = observation.conversationRequests[0];
  const townStateLabel =
    runStatus === 'running'
      ? '小镇持续运行中'
      : runStatus === 'complete'
      ? '本轮观察已完成，小镇状态已保留'
      : runStatus === 'creating' || runStatus === 'awaiting_user_responses'
      ? '小镇正在准备本次入口'
      : '小镇常驻数据可用';
  return (
    <section className="mbti-town-observation">
      <header>
        <div>
          <span>常驻小镇观察</span>
          <strong>{townStateLabel}</strong>
        </div>
        <p>居民意图、关系压力和记忆会独立累积；事件只是扰动，不是逐题问卷。</p>
      </header>
      <div className="mbti-town-observation-grid">
        <article>
          <span>模拟时间线</span>
          {timelineNode ? (
            <>
              <strong>第 {timelineNode.townDay} 天 · {townTimelinePhaseLabel(timelineNode.phase)}</strong>
              <p>{timelineNode.summary}</p>
              <small>
                {townTimelineScopeLabel(timelineNode.scope)}
                {timelineNode.locationKey ? ` · 地点 ${townTimelineLocationLabel(timelineNode.locationKey)}` : ''}
                {timelineNode.residentNames.length > 0 ? ` · ${timelineNode.residentNames.join('、')}` : ''}
              </small>
            </>
          ) : (
            <>
              <strong>等待时间线节点</strong>
              <p>自治 tick 运行后，会按小镇第几天和时段记录居民生活/工作推进。</p>
            </>
          )}
        </article>
        <article>
          <span>居民当前意图</span>
          {activePlan ? (
            <>
              <strong>{activePlan.residentName} · {activePlan.role}</strong>
              <p>{activePlan.intent}</p>
              <small>
                {activePlan.targetLocationKey ? `地点 ${activePlan.targetLocationKey} · ` : ''}
                社交意愿 {activePlan.socialAppetite}/100
                {activePlan.seekResidentNames.length > 0 ? ` · 想找 ${activePlan.seekResidentNames.join('、')}` : ''}
                {activePlan.avoidResidentNames.length > 0 ? ` · 暂避 ${activePlan.avoidResidentNames.join('、')}` : ''}
              </small>
            </>
          ) : (
            <>
              <strong>等待自治 tick</strong>
              <p>还没有短期居民计划；运行一次自治 tick 后会出现居民主动意图。</p>
            </>
          )}
        </article>
        <article>
          <span>发展指标</span>
          {residentMetrics ? (
            <>
              <strong>{townResidentDevelopmentStatusLabel(residentMetrics.status)}</strong>
              <p>
                {residentMetrics.recentlyChangedResidentCount} 个居民近期有状态变化；
                {residentMetrics.highPressureResidentCount} 个居民压力偏高。
              </p>
              <small>
                已建画像 {residentMetrics.profiledResidentCount}/{residentMetrics.activeResidentCount} ·
                停滞 {residentMetrics.stagnantResidentCount} ·
                平均压力 {residentMetrics.averageStress} ·
                平均支撑 {residentMetrics.averageSupport}
              </small>
            </>
          ) : (
            <>
              <strong>等待发展指标</strong>
              <p>居民画像和自治记录累积后，会显示整体发展状态。</p>
            </>
          )}
        </article>
        <article>
          <span>居民发展</span>
          {residentDevelopment ? (
            <>
              <strong>{residentDevelopment.residentName} · {residentDevelopment.role}</strong>
              <p>{residentDevelopment.longTermGoal}</p>
              <small>
                压力：{residentDevelopment.currentPressure}
              </small>
              <div className="mbti-resident-development-bars">
                <ResidentStateMeter label="经济" value={residentDevelopment.economy} />
                <ResidentStateMeter label="事业" value={residentDevelopment.career} />
                <ResidentStateMeter label="社交" value={residentDevelopment.social} />
                <ResidentStateMeter label="健康" value={residentDevelopment.health} />
                <ResidentStateMeter label="压力" value={residentDevelopment.stress} tone="stress" />
              </div>
              {residentDevelopment.lastImpactReason && (
                <small>最近变化：{residentDevelopment.lastImpactReason}</small>
              )}
            </>
          ) : (
            <>
              <strong>等待居民画像</strong>
              <p>居民目标和状态会随自治生活线更新，用来观察他们自己的发展。</p>
            </>
          )}
        </article>
        <article>
          <span>关系压力</span>
          {pressureRelationship ? (
            <>
              <strong>{pressureRelationship.residentNames.join(' - ')}</strong>
              <p>{pressureRelationship.summary}</p>
              <small>
                熟悉 {pressureRelationship.familiarity} · 信任 {pressureRelationship.trust} ·
                温度 {pressureRelationship.warmth} · 紧张 {pressureRelationship.tension}
              </small>
            </>
          ) : (
            <>
              <strong>暂无关系图</strong>
              <p>seed 小镇后会显示最可能自然触发互动的关系。</p>
            </>
          )}
        </article>
        <article>
          <span>最近浮现记忆</span>
          {recentMemory ? (
            <>
              <strong>{recentMemory.title}</strong>
              <p>{recentMemory.summary}</p>
              <small>
                {recentMemory.residentNames.join('、') || '全镇'} · 显著度 {recentMemory.salience}
                {recentMemory.sourceKind ? ` · 来源 ${townMemorySourceLabel(recentMemory.sourceKind)}` : ''}
              </small>
            </>
          ) : (
            <>
              <strong>暂无记忆</strong>
              <p>小镇还没有可复用的居民记忆。</p>
            </>
          )}
        </article>
        <article>
          <span>小镇最近活动</span>
          {recentActivity ? (
            <>
              <strong>{recentActivity.title}</strong>
              <p>{recentActivity.summary}</p>
              <small>
                {townActivityKindLabel(recentActivity.kind)}
                {recentActivity.locationKey ? ` · 地点 ${recentActivity.locationKey}` : ''}
                {recentActivity.residentNames.length > 0 ? ` · ${recentActivity.residentNames.join('、')}` : ''}
              </small>
            </>
          ) : (
            <>
              <strong>等待日常活动</strong>
              <p>自治 tick 产生记忆后，这里会显示不依赖用户问题的小镇活动。</p>
            </>
          )}
        </article>
        <article>
          <span>自然对话</span>
          {conversationRequest ? (
            <>
              <strong>{conversationRequest.residentNames.join(' - ')}</strong>
              <p>{conversationRequest.topicSeed}</p>
              <small>
                {townConversationRequestStatusLabel(conversationRequest.status)}
                {conversationRequest.locationKey ? ` · 地点 ${conversationRequest.locationKey}` : ''}
                {conversationRequest.priority === 'high' ? ' · 高优先级' : ''}
              </small>
            </>
          ) : (
            <>
              <strong>等待居民自发对话</strong>
              <p>高张力或高温度的自治互动会生成对话请求，再由运行中的小镇 world 消费。</p>
            </>
          )}
        </article>
      </div>
    </section>
  );
}

function ResidentStateMeter({
  label,
  tone = 'default',
  value,
}: {
  label: string;
  tone?: 'default' | 'stress';
  value: number;
}) {
  const safeValue = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <span className={`mbti-resident-state-meter ${tone === 'stress' ? 'is-stress' : ''}`}>
      <span>{label}</span>
      <i aria-hidden="true">
        <b style={{ width: `${safeValue}%` }} />
      </i>
      <em>{safeValue}</em>
    </span>
  );
}

function EventProgressCard({
  eventAssessment,
  event,
  experimentId,
  matchedBehaviors,
  matchedMessages,
  matchedThoughts,
  onAssessEvent,
  onSubmitUserResponse,
  participantCount,
  playerNameById,
  recordDescription,
  recordedAt,
  scenarioContext,
  resolutionCriteria,
  showInlineResponse,
  userResponse,
}: {
  eventAssessment?: EventAssessment;
  event: {
    _id: string;
    title: string;
    description: string;
    status: string;
    testedVariable?: string;
    testedHypotheses?: string[];
    questionLink?: string;
    informationGoal?: string;
    coveredTargetIds?: string[];
    whyThisTestsIt?: string;
    expectedSignals?: string[];
    responseOptions?: string[];
    residentRoles?: string[];
    residentParticipationGoal?: string;
    probeOrigin?: 'initial' | 'adaptive' | 'calibration';
    adaptiveReason?: string;
    timelineTriggerReason?: string;
    scheduledDay?: number;
    scheduledPhase?: 'morning' | 'afternoon' | 'evening' | 'night';
  };
  experimentId?: Id<'mbtiExperiments'>;
  matchedMessages: Array<{
    _id: string;
    author: string;
    text: string;
    _creationTime?: number;
  }>;
  matchedThoughts: Array<{
    _creationTime?: number;
    playerId: string;
    source: string;
    text: string;
  }>;
  matchedBehaviors: Array<{
    playerId: string;
    text: string;
  }>;
  onAssessEvent: (args: {
    experimentId: Id<'mbtiExperiments'>;
    eventId: Id<'mbtiEvents'>;
  }) => Promise<unknown>;
  onSubmitUserResponse: (args: {
    experimentId: Id<'mbtiExperiments'>;
    mbtiEventId: Id<'mbtiEvents'>;
    selectedOption: string;
    confidence: number;
    emotions: string[];
    freeText: string;
    scenarioFit: 'fits' | 'partial' | 'not_fit';
    feedbackType?: FeedbackType;
    correctionText?: string;
  }) => Promise<unknown>;
  participantCount: number;
  playerNameById: Map<string, string>;
  recordDescription?: string;
  recordedAt?: number;
  scenarioContext: string;
  resolutionCriteria: string;
  showInlineResponse: boolean;
  userResponse?: UserResponse;
}) {
  const [selectedOption, setSelectedOption] = useState(userResponse?.selectedOption ?? '');
  const [confidence, setConfidence] = useState(userResponse?.confidence ?? 4);
  const [emotionText, setEmotionText] = useState(userResponse?.emotions.join('、') ?? '');
  const [freeText, setFreeText] = useState(userResponse?.freeText ?? '');
  const [scenarioFit, setScenarioFit] = useState<'fits' | 'partial' | 'not_fit'>(
    userResponse?.scenarioFit ?? 'fits',
  );
  const [feedbackType, setFeedbackType] = useState<FeedbackType>(userResponse?.feedbackType ?? 'user_reaction');
  const [correctionText, setCorrectionText] = useState(userResponse?.correctionText ?? '');
  const [submitState, setSubmitState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const assessmentAttemptRef = useRef<string | null>(null);
  useEffect(() => {
    if (!userResponse) {
      return;
    }
    setSelectedOption(userResponse.selectedOption);
    setConfidence(userResponse.confidence);
    setEmotionText(userResponse.emotions.join('、'));
    setFreeText(userResponse.freeText);
    setScenarioFit(userResponse.scenarioFit);
    setFeedbackType(userResponse.feedbackType ?? 'user_reaction');
    setCorrectionText(userResponse.correctionText ?? '');
  }, [userResponse]);
  const planned = plannedEventSections(event.description);
  const displayedVariable = event.testedVariable ?? planned.observationAxis ?? '未写明维度';
  const displayedQuestionLink = event.questionLink ?? planned.questionLink ?? '把原问题转成可观察的行为反应。';
  const displayedInformationGoal = event.informationGoal ?? planned.informationGoal ?? '这件事能不能推动真实互动。';
  const trimmedFreeText = freeText.trim();
  const trimmedCorrectionText = correctionText.trim();
  const effectiveSelectedOption =
    selectedOption ||
    (trimmedCorrectionText ? `补充修正：${compactText(trimmedCorrectionText, 36)}` : '') ||
    (trimmedFreeText ? `补充说明：${compactText(trimmedFreeText, 36)}` : '') ||
    (feedbackType !== 'user_reaction' ? feedbackTypeLabel(feedbackType) : '');
  const hasCalibrationAnswer = Boolean(effectiveSelectedOption);
  const hasEventRecord = Boolean(recordedAt);
  const selfMessages = matchedMessages
    .filter((message) => playerNameById.get(message.author) === '我')
    .map((message) => message.text);
  const selfThoughts = matchedThoughts
    .filter((thought) => playerNameById.get(thought.playerId) === '我')
    .map((thought) => thought.text);
  const hasChatEvidence = selfMessages.length > 0;
  const evidencePreviewItems = correctionEvidencePreviewItems({
    messages: selfMessages,
    behaviors: matchedBehaviors.map((behavior) => behavior.text),
    thoughts: selfThoughts,
    maxItems: 4,
  });
  const calibrationEventSummary = planned.trigger || compactText(event.description, 120);
  const shouldShowUserResponsePanel =
    shouldShowEventCorrectionControls({
      hasEventRecord,
      hasSavedUserResponse: Boolean(userResponse),
      showInlineResponse,
    });
  const hasAuxiliaryEvidence = selfThoughts.length > 0 || matchedBehaviors.length > 0;
  const hasAnyEvidence = hasChatEvidence || hasAuxiliaryEvidence;
  const evidenceSignature = [
    ...matchedMessages.map((message) => `${message._id}:${message.text}`),
    ...matchedThoughts.map((thought, index) => `${index}:${thought.playerId}:${thought.text}`),
    ...matchedBehaviors.map((behavior, index) => `${index}:${behavior.playerId}:${behavior.text}`),
    userResponse ? `${userResponse._id}:${userResponse.selectedOption}:${userResponse.freeText}:${userResponse.correctionText ?? ''}` : '',
  ].filter(Boolean).join('|');
  const assessmentCurrent = eventAssessment?.status === 'succeeded';
  const assessmentRunning = eventAssessment?.status === 'running';
  const assessmentFailed = eventAssessment?.status === 'failed';
  const expectsConversation = participantCount >= 2;
  const statusLabel = hasEventRecord
    ? hasAnyEvidence
      ? '已触发 · 有辅助证据'
      : '已触发 · 等证据'
    : eventStatusLabel(event.status);
  const eventTownTime = typeof event.scheduledDay === 'number'
    ? `小镇时间：第 ${event.scheduledDay} 天${event.scheduledPhase ? ` · ${eventTimelinePhaseLabel(event.scheduledPhase)}` : ''}`
    : undefined;
  useEffect(() => {
    if (!experimentId || !hasEventRecord || !hasAnyEvidence || assessmentCurrent || assessmentRunning || assessmentFailed) {
      return;
    }
    const attemptKey = `${event._id}:${evidenceSignature}`;
    if (!evidenceSignature || assessmentAttemptRef.current === attemptKey) {
      return;
    }
    assessmentAttemptRef.current = attemptKey;
    void onAssessEvent({
      experimentId,
      eventId: event._id as Id<'mbtiEvents'>,
    }).catch((error) => {
      console.warn('MBTI event LLM assessment failed', error);
      assessmentAttemptRef.current = null;
    });
  }, [
    assessmentCurrent,
    assessmentFailed,
    assessmentRunning,
    event._id,
    evidenceSignature,
    experimentId,
    hasAnyEvidence,
    hasEventRecord,
    onAssessEvent,
  ]);
  return (
    <article data-state={hasAnyEvidence ? 'observed' : event.status} tabIndex={0}>
      <header>
        <span>{event.title}</span>
        <strong data-triggered={hasEventRecord}>{statusLabel}</strong>
      </header>
      <p className="mbti-event-row-summary">
        <b>{displayedVariable}</b>
        <span>{planned.trigger || compactText(event.description, 76)}</span>
      </p>
      <div className="mbti-event-card-grid">
        <section data-kind="plan">
          <b>计划</b>
          <dl className="mbti-field-list">
            <div>
              <dt>场景</dt>
              <dd>{planned.scene || '系统未写明。'}</dd>
            </div>
            <div>
              <dt>事情</dt>
              <dd>{planned.trigger || compactText(event.description, 90)}</dd>
            </div>
            <div>
              <dt>考察维度</dt>
              <dd>{displayedVariable}</dd>
            </div>
            <div>
              <dt>问题关系</dt>
              <dd>{displayedQuestionLink}</dd>
            </div>
            <div>
              <dt>想看</dt>
              <dd>{displayedInformationGoal}</dd>
            </div>
            <div>
              <dt>预期信号</dt>
              <dd>{event.expectedSignals?.join('、') || planned.judgmentSignal || '等待小镇自然证据。'}</dd>
            </div>
            {event.adaptiveReason && (
              <div>
                <dt>为什么加这个事件</dt>
                <dd>{event.adaptiveReason}</dd>
              </div>
            )}
            {event.timelineTriggerReason && (
              <div>
                <dt>生成原因</dt>
                <dd>{eventTimelineReasonText(event.timelineTriggerReason)}</dd>
              </div>
            )}
            {typeof event.scheduledDay === 'number' && (
              <div>
                <dt>排期</dt>
                <dd>
                  第 {event.scheduledDay} 天
                  {event.scheduledPhase ? ` · ${eventTimelinePhaseLabel(event.scheduledPhase)}` : ''}
                </dd>
              </div>
            )}
          </dl>
        </section>
        <section data-kind="evidence">
          <b>实际证据</b>
          {hasEventRecord ? (
            <>
              <p className="mbti-event-record-note">
                {eventTownTime ?? '已进入事件记录'}
                {recordedAt && (
                  <small>现实记录：{new Date(recordedAt).toLocaleString()}</small>
                )}
              </p>
              <EvidenceGroup
                emptyText={expectsConversation ? '事件后还没有匹配到相关聊天。' : '单人/环境事件不一定产生聊天。'}
                title="聊天"
              >
                {matchedMessages.map((message) => (
                  <li key={message._id}>
                    <strong>{playerNameById.get(message.author) ?? '角色'}：</strong>
                    {compactText(message.text, 54)}
                    {message._creationTime && (
                      <time dateTime={new Date(message._creationTime).toISOString()}>
                        {new Date(message._creationTime).toLocaleTimeString()}
                      </time>
                    )}
                  </li>
                ))}
              </EvidenceGroup>
              {matchedThoughts.length > 0 && (
                <EvidenceGroup emptyText="" title="内心">
                  {matchedThoughts.map((thought, index) => (
                    <li key={`${thought.playerId}-${index}`}>
                      <strong>{playerNameById.get(thought.playerId) ?? '角色'}：</strong>
                      {compactText(thought.text, 54)}
                      {thought._creationTime && (
                        <time dateTime={new Date(thought._creationTime).toISOString()}>
                          {new Date(thought._creationTime).toLocaleTimeString()}
                        </time>
                      )}
                    </li>
                  ))}
                </EvidenceGroup>
              )}
              {matchedBehaviors.length > 0 && (
                <EvidenceGroup emptyText="" title="行为">
                  {matchedBehaviors.map((behavior, index) => (
                    <li key={`${behavior.playerId}-${index}`}>
                      {behavior.text}
                    </li>
                  ))}
                </EvidenceGroup>
              )}
            </>
          ) : (
            <p>没有触发记录时，不读取聊天、内心或行为作为该事件证据。</p>
          )}
        </section>
        <section data-kind="conclusion">
          <b>综合判断</b>
          {assessmentCurrent && eventAssessment?.summary && eventAssessment.inference ? (
            <div className="mbti-conclusion-body">
              <strong>{eventAssessment.summary}</strong>
              <p className="mbti-conclusion-inference">{eventAssessment.inference}</p>
              {eventAssessment.next && <p className="mbti-conclusion-next">{eventAssessment.next}</p>}
            </div>
          ) : assessmentRunning ? (
            <p>正在让 LLM 只根据这个事件的证据做评估。</p>
          ) : assessmentFailed ? (
            <p>LLM 评估失败：{eventAssessment?.error ?? '请稍后自动重试或重新进入。'}</p>
          ) : hasEventRecord && hasAnyEvidence ? (
            <div className="mbti-conclusion-body">
              <strong>等待 LLM 评估</strong>
              <p className="mbti-conclusion-inference">
                已有当前事件证据，系统会把这一个事件和证据交给 LLM 评估；这里不再用规则模板直接下结论。
              </p>
            </div>
          ) : (
            <p>
              {!hasEventRecord
                ? '还不能判断。计划必须先真实触发并进入事件记录。'
                : '还不能判断。需要看到对应聊天，或至少有内心/行为辅助证据。'}
            </p>
          )}
        </section>
      </div>
      {shouldShowUserResponsePanel && (
        <div className="mbti-calibration-popover">
          <button className="mbti-calibration-chip" type="button">
            {userResponse ? '已反馈' : '反馈不合理'}
          </button>
          <section className="mbti-user-response-panel" data-saved={Boolean(userResponse)}>
            <header>
              <b>纠正设定</b>
              {userResponse && <span>已记录，可修改</span>}
            </header>
            <div className="mbti-calibration-context">
              <span>事件</span>
              <p>{calibrationEventSummary}</p>
            </div>
            <div className="mbti-simulated-self">
              <span>相关证据</span>
              {evidencePreviewItems.length > 0 ? (
                <ul>
                  {evidencePreviewItems.map((item, index) => (
                    <li key={`${item.kind}-${index}`} title={item.title}>
                      <b>{item.kind}</b>
                      <p>{compactText(item.text, 120)}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>还没记录到明确聊天或动作，可以先指出这个情境哪里不符合真实前提。</p>
              )}
              {!hasChatEvidence && evidencePreviewItems.length > 0 && (
                <em>本事件暂未匹配到聊天，只看到动作或内心证据。</em>
              )}
            </div>
            <div className="mbti-response-options" aria-label="判断模拟反应是否像我">
              {[
                {
                  label: '基本合理',
                  value: '这个模拟基本像我',
                  fit: 'fits' as const,
                  type: 'hit_real_issue' as const,
                  confidence: 6,
                },
                {
                  label: '补充背景',
                  value: '有点像，但需要补充现实条件',
                  fit: 'partial' as const,
                  type: 'condition_correction' as const,
                  confidence: 4,
                },
                {
                  label: '事实不对',
                  value: '这个情境不符合我',
                  fit: 'not_fit' as const,
                  type: 'unrealistic_event' as const,
                  confidence: 2,
                },
              ].map((option) => (
                <button
                  className={selectedOption === option.value ? 'selected' : ''}
                  key={option.value}
                  onClick={() => {
                    setSelectedOption(option.value);
                    setScenarioFit(option.fit);
                    setFeedbackType(option.type);
                    setConfidence(option.confidence);
                    setSubmitState('idle');
                  }}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
            <label>
              <span>纠正事实或背景</span>
              <textarea
                onChange={(inputEvent) => {
                  setFreeText(inputEvent.target.value);
                  setSubmitState('idle');
                }}
                placeholder="例如：我没有孩子；这个事件不能用家庭责任来解释。"
                value={freeText}
              />
            </label>
            <div className="mbti-response-actions">
              <button
                disabled={!experimentId || !hasCalibrationAnswer || submitState === 'saving'}
                onClick={async () => {
                  if (!experimentId || !hasCalibrationAnswer) {
                    return;
                  }
                  setSubmitState('saving');
                  try {
                    await onSubmitUserResponse({
                      experimentId,
                      mbtiEventId: event._id as Id<'mbtiEvents'>,
                      selectedOption: effectiveSelectedOption,
                      confidence,
                      emotions: emotionText.split(/[、,，\s]+/).map((item) => item.trim()).filter(Boolean),
                      freeText,
                      scenarioFit,
                      feedbackType,
                      correctionText: correctionText || undefined,
                    });
                    setSubmitState('saved');
                  } catch (error) {
                    console.error('Failed to submit MBTI user response', error);
                    setSubmitState('error');
                  }
                }}
                type="button"
              >
                {submitState === 'saving' ? '保存中...' : userResponse ? '更新' : '保存'}
              </button>
              <span>
                {submitState === 'saved'
                  ? '已保存'
                  : submitState === 'error'
                  ? '保存失败'
                  : hasCalibrationAnswer
                  ? '保存后会影响后续事件和证据采信'
                  : '先选一项'}
              </span>
            </div>
          </section>
        </div>
      )}
    </article>
  );
}

function DecisionStateGroup({
  emptyText,
  items,
  title,
}: {
  emptyText: string;
  items: string[];
  title: string;
}) {
  return (
    <article>
      <b>{title}</b>
      {items.length > 0 ? (
        <ul>
          {items.slice(0, 4).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p>{emptyText}</p>
      )}
    </article>
  );
}

function probeOriginLabel(origin?: 'initial' | 'adaptive' | 'calibration') {
  if (origin === 'adaptive') {
    return '动态探针';
  }
  if (origin === 'calibration') {
    return '校准探针';
  }
  return '初始探针';
}

function eventIsTriggeredOrBeyond(status: string) {
  return !['seeded', 'candidate', 'delayed'].includes(status);
}

function eventTimelinePhaseLabel(phase: 'morning' | 'afternoon' | 'evening' | 'night') {
  if (phase === 'morning') {
    return '上午';
  }
  if (phase === 'afternoon') {
    return '下午';
  }
  if (phase === 'evening') {
    return '傍晚';
  }
  return '夜间';
}

function townMemorySourceLabel(sourceKind: string) {
  if (sourceKind === 'autonomy_tick') {
    return '自治互动';
  }
  if (sourceKind === 'scene') {
    return '场景结果';
  }
  if (sourceKind === 'user_entry') {
    return '本次入镇';
  }
  if (sourceKind === 'reflection') {
    return '反思整合';
  }
  if (sourceKind === 'seed') {
    return '初始设定';
  }
  return sourceKind;
}

function townActivityKindLabel(kind: TownObservationSummary['activityStream'][number]['kind']) {
  if (kind === 'autonomy_tick') {
    return '自治互动';
  }
  if (kind === 'scene') {
    return '用户入镇场景';
  }
  if (kind === 'reflection') {
    return '反思整合';
  }
  return '记忆活动';
}

function townResidentDevelopmentStatusLabel(
  status: NonNullable<TownObservationSummary['residentDevelopmentMetrics']>['status'],
) {
  if (status === 'developing') {
    return '居民正在发展';
  }
  if (status === 'watching_pressure') {
    return '压力需要观察';
  }
  if (status === 'stagnant') {
    return '部分生活线停滞';
  }
  return '画像尚未建立';
}

function townTimelinePhaseLabel(phase: TownObservationSummary['timeline'][number]['phase']) {
  if (phase === 'morning') {
    return '上午';
  }
  if (phase === 'afternoon') {
    return '下午';
  }
  if (phase === 'evening') {
    return '傍晚';
  }
  return '夜里';
}

function timelineEventWaitState(
  current: TownObservationSummary['timeline'][number] | undefined,
  event: { scheduledDay?: number; scheduledPhase?: 'morning' | 'afternoon' | 'evening' | 'night' } | undefined,
) {
  if (!current || !event || typeof event.scheduledDay !== 'number') {
    return undefined;
  }
  const targetProgress = event.scheduledDay - 1 + phaseProgress(event.scheduledPhase ?? 'morning');
  const currentProgress = current.townDay - 1 + (current.dayProgress ?? phaseProgress(current.phase));
  const remainingDays = targetProgress - currentProgress;
  const remainingMs = remainingDays * simulatedTownDayMs;
  const advanceDays = Math.max(0, Math.ceil(remainingDays));
  return {
    advanceDays,
    due: remainingMs <= 0,
    currentLabel: `第 ${current.townDay} 天 · ${townTimelinePhaseLabel(current.phase)}`,
    remainingLabel: formatTownWaitDuration(Math.max(0, remainingMs)),
  };
}

function timelineRunStatusText(args: {
  engineHealth: string;
  nextEvent?: {
    scheduledDay?: number;
    scheduledPhase?: 'morning' | 'afternoon' | 'evening' | 'night';
    status?: string;
    title?: string;
  };
  runStatus: TownRunStatus;
  timelineAdvanceState: 'idle' | 'running' | 'error';
  wait?: ReturnType<typeof timelineEventWaitState>;
}) {
  if (args.timelineAdvanceState === 'running') {
    return {
      title: '正在推进小镇时间线',
      detail: '系统正在执行一次居民自治或一天推进，完成后会继续检查用户事件是否到点。',
    };
  }
  if (args.timelineAdvanceState === 'error') {
    return {
      title: '上次时间线推进失败',
      detail: '请检查 Convex 和本地模型服务；居民生活线或事件触发可能没有成功写入。',
    };
  }
  if (args.runStatus !== 'running') {
    return {
      title: '当前没有运行中的提问演化',
      detail: '常驻居民生活线仍可运行；新的用户提问进入后会绑定到小镇时间线。',
    };
  }
  if (args.wait?.due) {
    return {
      title: '未停：事件时间已到，正在自动触发',
      detail: `${args.engineHealth}；系统正在检查下一事件并把它写入小镇互动。`,
    };
  }
  if (args.nextEvent && args.wait) {
    const eventLabel = args.nextEvent.title ? `“${compactText(args.nextEvent.title, 24)}”` : '下一事件';
    return {
      title: `未停：等待小镇自然到达 ${eventLabel}`,
      detail: `${args.wait.currentLabel}，目标还差 ${args.wait.remainingLabel}；用户事件不会驱动居民快进，居民生活线按自己的自治节奏继续推进。`,
    };
  }
  return {
    title: '未停：暂无等待事件，正在积累生活线证据',
    detail: `${args.engineHealth}；当前没有排队事件，系统会在居民生活线推进并出现证据缺口后生成下一件事。`,
  };
}

function formatTownWaitDuration(ms: number) {
  const totalSeconds = Math.ceil(ms / 1000);
  if (totalSeconds <= 0) {
    return '不到 1 分钟';
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) {
    return `${seconds} 秒现实时间`;
  }
  if (seconds === 0) {
    return `${minutes} 分钟现实时间`;
  }
  return `${minutes} 分 ${seconds} 秒现实时间`;
}

function phaseProgress(phase: TownObservationSummary['timeline'][number]['phase']) {
  if (phase === 'afternoon') {
    return 0.25;
  }
  if (phase === 'evening') {
    return 0.5;
  }
  if (phase === 'night') {
    return 0.75;
  }
  return 0;
}

function phaseFromTownProgress(dayProgress: number): TownObservationSummary['timeline'][number]['phase'] {
  if (dayProgress < 0.25) {
    return 'morning';
  }
  if (dayProgress < 0.5) {
    return 'afternoon';
  }
  if (dayProgress < 0.75) {
    return 'evening';
  }
  return 'night';
}

function townTimelineScopeLabel(scope: TownObservationSummary['timeline'][number]['scope']) {
  if (scope === 'resident_life') {
    return '生活线';
  }
  if (scope === 'resident_work') {
    return '事业线';
  }
  if (scope === 'relationship') {
    return '关系线';
  }
  return '问题观察线';
}

function townConversationRequestStatusLabel(
  status: TownObservationSummary['conversationRequests'][number]['status'],
) {
  if (status === 'started') {
    return '已进入对话';
  }
  if (status === 'skipped') {
    return '已略过';
  }
  if (status === 'expired') {
    return '已过期';
  }
  return '等待触发';
}

function EvidenceGroup({
  children,
  emptyText,
  title,
}: {
  children: ReactNode;
  emptyText: string;
  title: string;
}) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  return (
    <div className="mbti-evidence-group" data-empty={items.length === 0}>
      <span>{title}</span>
      {items.length > 0 ? <ul>{items}</ul> : <p>{emptyText}</p>}
    </div>
  );
}

function TownObservation({
  engineId,
  events,
  experimentWorldId,
  messages,
  memories,
  observeTab,
  onTabChange,
  playerDescriptions,
  playerNames,
  world,
}: {
  engineId: Id<'engines'>;
  events: Array<{
    _id: string;
    kind: string;
    tickOffset: number;
    title: string;
    description: string;
    involvedRoles: string[];
  }>;
  experimentWorldId: Id<'worlds'>;
  messages: Array<{
    _id: string;
    author: string;
    text: string;
  }>;
  memories: Array<{
    _id: string;
    playerId: string;
    description: string;
    importance: number;
  }>;
  observeTab: ObserveTab;
  onTabChange: (tab: ObserveTab) => void;
  playerDescriptions: Array<{
    playerId: string;
    name: string;
    description: string;
    character: string;
  }>;
  playerNames: Map<string, string>;
  world: {
    players: Array<{
      id: string;
      position: { x: number; y: number };
      activity?: { description: string };
      pathfinding?: unknown;
    }>;
    agents: Array<{
      id: string;
      playerId: string;
      inProgressOperation?: { name: string };
    }>;
    conversations: Array<{
      id: string;
      numMessages: number;
      participants: Array<{ playerId: string }>;
    }>;
  };
}) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | undefined>(world.players[0]?.id);
  const selectedPlayer = world.players.find((player) => player.id === selectedPlayerId);
  const selectedAgent = world.agents.find((agent) => agent.playerId === selectedPlayerId);
  const selectedDescription = playerDescriptions.find(
    (description) => description.playerId === selectedPlayerId,
  );
  const selectedName = selectedPlayerId ? playerNames.get(selectedPlayerId) ?? selectedPlayerId : '未选择';
  const selectedMessages = selectedPlayerId
    ? messages.filter((message) => message.author === selectedPlayerId)
    : messages;
  const selectedMemories = selectedPlayerId
    ? memories.filter((memory) => memory.playerId === selectedPlayerId)
    : memories;

  return (
    <section className="mbti-observation-studio">
      <div className="mbti-studio-header">
        <div>
          <h3>小镇画布</h3>
          <p>点击人物可以切换观察对象。画布来自真实实验 world，会随 AI Town tick 更新。</p>
        </div>
        <div className="mbti-studio-metrics">
          <span>{world.players.length} 角色</span>
          <span>{world.conversations.length} 对话中</span>
          <span>{messages.length} 消息</span>
          <span>{memories.length} 记忆</span>
        </div>
      </div>

      <div className="mbti-studio-layout">
        <TownCanvas
          engineId={engineId}
          selectedPlayerId={selectedPlayerId}
          setSelectedPlayerId={setSelectedPlayerId}
          worldId={experimentWorldId}
        />
        <aside className="mbti-selected-agent">
          <span>当前观察</span>
          <strong>{selectedName}</strong>
          {selectedPlayer ? (
            <>
              <p>{selectedDescription?.character ? `角色外观：${selectedDescription.character}` : '居民简介已载入'}</p>
              <p>
                位置 {Math.round(selectedPlayer.position.x)}, {Math.round(selectedPlayer.position.y)}
              </p>
              <p>
                {selectedPlayer.activity?.description
                  ? `正在 ${selectedPlayer.activity.description}`
                  : selectedPlayer.pathfinding
                    ? '正在移动'
                    : '等待下一步行动'}
              </p>
              <p>
                {selectedAgent?.inProgressOperation
                  ? operationLabel(selectedAgent.inProgressOperation.name)
                  : '当前没有挂起动作'}
              </p>
            </>
          ) : (
            <p>从画布或下方角色列表选择一个人物。</p>
          )}
          <div className="mbti-player-pills">
            {world.players.map((player) => (
              <button
                data-active={player.id === selectedPlayerId}
                key={player.id}
                onClick={() => setSelectedPlayerId(player.id)}
                type="button"
              >
                {playerNames.get(player.id) ?? player.id}
              </button>
            ))}
          </div>
        </aside>
      </div>

      <div className="mbti-role-inspector">
        <article>
          <span>居民简介</span>
          <strong>{selectedName}</strong>
          <p>{selectedDescription?.description ?? '暂无居民简介。'}</p>
        </article>
        <article>
          <span>内心独白</span>
          <strong>{selectedAgent?.inProgressOperation ? '正在思考' : '当前平静'}</strong>
          <p>
            {selectedAgent?.inProgressOperation
              ? operationLabel(selectedAgent.inProgressOperation.name)
              : selectedMessages.at(-1)?.text ?? '暂时还没有可观察到的近期表达。'}
          </p>
        </article>
        <article>
          <span>聊天记录</span>
          <strong>{selectedMessages.length} 条发言</strong>
          <p>{selectedMessages.at(-1)?.text ?? '这个角色暂时还没有发言。'}</p>
        </article>
      </div>

      <div className="mbti-observe-tabs" role="tablist" aria-label="观察内容">
        <ObserveTabButton active={observeTab === 'chat'} id="chat" label="聊天记录" onSelect={onTabChange} />
        <ObserveTabButton active={observeTab === 'thoughts'} id="thoughts" label="内心独白" onSelect={onTabChange} />
        <ObserveTabButton active={observeTab === 'memories'} id="memories" label="记忆沉淀" onSelect={onTabChange} />
        <ObserveTabButton active={observeTab === 'events'} id="events" label="事件种子" onSelect={onTabChange} />
      </div>

      <div className="mbti-observe-content">
        {observeTab === 'chat' && (
          <div className="mbti-chat-feed">
            {messages.length === 0 && <p className="mbti-empty">还没有聊天消息。</p>}
            {messages.map((message) => (
              <article
                className="mbti-chat-message"
                data-selected={message.author === selectedPlayerId}
                key={message._id}
              >
                <strong>{playerNames.get(message.author) ?? message.author}</strong>
                <p>{message.text}</p>
              </article>
            ))}
          </div>
        )}
        {observeTab === 'thoughts' && (
          <div className="mbti-thought-grid">
            <article>
              <span>行动状态</span>
              <strong>{selectedName}</strong>
              <p>
                {selectedAgent?.inProgressOperation
                  ? operationLabel(selectedAgent.inProgressOperation.name)
                  : '当前没有挂起动作，等待小镇下一次 tick。'}
              </p>
            </article>
            <article>
              <span>近期发言倾向</span>
              <strong>{selectedMessages.length} 条发言</strong>
              {selectedMessages.slice(-3).map((message) => (
                <p key={message._id}>{message.text}</p>
              ))}
              {selectedMessages.length === 0 && <p>这个角色暂时还没有发言。</p>}
            </article>
          </div>
        )}
        {observeTab === 'memories' && (
          <div className="mbti-memory-list">
            {selectedMemories.length === 0 && <p className="mbti-empty">这个角色还没有沉淀记忆。</p>}
            {selectedMemories.map((memory) => (
              <article key={memory._id}>
                <span>{playerNames.get(memory.playerId) ?? memory.playerId} · 重要度 {memory.importance}</span>
                <p>{memory.description}</p>
              </article>
            ))}
          </div>
        )}
        {observeTab === 'events' && (
          <div className="mbti-event-list compact">
            {events.map((event) => (
              <article key={event._id}>
                <span>{event.kind} · 第 {event.tickOffset} 轮附近</span>
                <strong>{event.title}</strong>
                <p>{event.description}</p>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function TownCanvas({
  engineId,
  selectedPlayerId,
  setSelectedPlayerId,
  worldId,
}: {
  engineId: Id<'engines'>;
  selectedPlayerId: string | undefined;
  setSelectedPlayerId: (playerId: string | undefined) => void;
  worldId: Id<'worlds'>;
}) {
  const convex = useConvex();
  const [gameWrapperRef, { width, height }] = useElementSize();
  const game = useServerGame(worldId);
  const selectedElement = selectedPlayerId
    ? { kind: 'player' as const, id: selectedPlayerId as GameId<'players'> }
    : undefined;

  return (
    <div className="mbti-town-canvas" ref={gameWrapperRef}>
      {game && width > 0 && height > 0 ? (
        <Stage width={width} height={height} options={{ backgroundColor: 0x7ab5ff }}>
          <ConvexProvider client={convex}>
            <PixiGame
              engineId={engineId}
              game={game}
              height={height}
              historicalTime={undefined}
              setSelectedElement={(element) => setSelectedPlayerId(element?.id)}
              width={width}
              worldId={worldId}
            />
          </ConvexProvider>
        </Stage>
      ) : (
        <div className="mbti-canvas-loading">正在加载小镇画布...</div>
      )}
      {selectedElement && <span className="mbti-canvas-selected">观察：{selectedElement.id}</span>}
    </div>
  );
}

function ObserveTabButton({
  active,
  id,
  label,
  onSelect,
}: {
  active: boolean;
  id: ObserveTab;
  label: string;
  onSelect: (tab: ObserveTab) => void;
}) {
  return (
    <button aria-selected={active} data-active={active} onClick={() => onSelect(id)} role="tab" type="button">
      {label}
    </button>
  );
}

function operationLabel(name: string) {
  switch (name) {
    case 'agentGenerateMessage':
      return '正在组织语言，准备发送下一条消息。';
    case 'agentRememberConversation':
      return '正在把刚结束的对话整理成长期记忆。';
    case 'agentDoSomething':
      return '正在决定下一步行动：移动、等待、活动或邀请别人聊天。';
    default:
      return `正在执行 ${name}`;
  }
}

function StepButton({
  activeStep,
  id,
  label,
  onSelect,
}: {
  activeStep: Step;
  id: Step;
  label: string;
  onSelect: (step: Step) => void;
}) {
  return (
    <button
      className="mbti-step"
      data-active={activeStep === id}
      onClick={() => onSelect(id)}
      type="button"
    >
      {label}
    </button>
  );
}

function PersonalityAvatar({
  code,
  size = 'small',
}: {
  code?: string;
  size?: 'small' | 'large';
}) {
  const normalizedCode = normalizePersonalityCode(code);
  const meta = normalizedCode ? personalityMeta[normalizedCode] : undefined;
  const imageUrl = normalizedCode ? `/ai-town/assets/mbti-personalities/${normalizedCode.toLowerCase()}.svg` : undefined;
  return (
    <div
      aria-label={normalizedCode ? `${normalizedCode} ${meta?.title}` : '未设置人格头像'}
      className="mbti-persona-avatar"
      data-size={size}
      data-tone={meta?.tone ?? 'neutral'}
      role="img"
    >
      {imageUrl ? (
        <img alt="" src={imageUrl} />
      ) : (
        <span className="mbti-persona-empty">?</span>
      )}
    </div>
  );
}

function PersonalityStatusCard({
  code,
}: {
  code: string;
}) {
  const normalizedCode = normalizePersonalityCode(code);
  const meta = normalizedCode ? personalityMeta[normalizedCode] : undefined;
  return (
    <section className="mbti-status" aria-label="当前人格">
      <PersonalityAvatar code={code} size="large" />
      <div className="mbti-status-copy">
        <span>当前人格</span>
        <strong className="mbti-code">{normalizedCode ?? code}</strong>
        <em>{meta?.title ?? '人格画像生成中'}</em>
      </div>
    </section>
  );
}

function PersonalityChip({ code }: { code?: string }) {
  const normalizedCode = normalizePersonalityCode(code);
  const meta = normalizedCode ? personalityMeta[normalizedCode] : undefined;
  return (
    <div className="mbti-persona-chip" data-empty={!meta}>
      <PersonalityAvatar code={code} />
      <div>
        <strong>{normalizedCode ?? '未指定'}</strong>
        <span>{meta ? `${meta.group} · ${meta.title}` : '可留空，系统会按关系背景自然生成'}</span>
      </div>
    </div>
  );
}

function RoleEditor({
  value,
  onChange,
  onRemove,
}: {
  value: RolePreset;
  onChange: (patch: Partial<RolePreset>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="mbti-role-editor">
      <div className="mbti-role-toggle-row">
        <div>
          <strong>{value.label || '预设角色'}</strong>
          <p className="mbti-role-reason">{value.reason}</p>
        </div>
        <button aria-label={`删除${value.label || '预设角色'}`} onClick={onRemove} type="button">
          -
        </button>
      </div>
      <div className="mbti-role-grid">
        <label>
          角色名称
          <input
            value={value.label}
            onChange={(event) => onChange({ label: event.target.value })}
          />
        </label>
        <label>
          MBTI 选择
          <select
            value={value.mbtiCode}
            onChange={(event) => onChange({ mbtiCode: event.target.value.toUpperCase() })}
          >
            <option value="">不指定</option>
            {personalityCodeOptions.map((code) => (
              <option key={code} value={code}>
                {code} · {personalityMeta[code].title}
              </option>
            ))}
          </select>
        </label>
        <label>
          对应身份
          <input
            placeholder="例如：伴侣、朋友、同事、父母、前任"
            value={value.mapping}
            onChange={(event) =>
              onChange({
                mapping: event.target.value,
                role: inferActorRoleFromText(event.target.value),
              })
            }
          />
        </label>
      </div>
      <label>
        关系背景
        <textarea
          value={value.traits}
          onChange={(event) => onChange({ traits: event.target.value })}
          placeholder="例如：交往半年，最近因为回消息和控制欲吵过几次；她已经积累了一些不满，但仍在意这段关系。"
        />
      </label>
    </div>
  );
}

function AxisBar({
  left,
  right,
  leftValue,
  rightValue,
}: {
  left: string;
  right: string;
  leftValue: number;
  rightValue: number;
}) {
  const rightPercent = Math.round(rightValue);
  return (
    <div className="mbti-axis">
      <div className="mbti-axis-label">
        <span>
          {left} {Math.round(leftValue)}
        </span>
        <span>
          {right} {Math.round(rightValue)}
        </span>
      </div>
      <div className="mbti-axis-track">
        <div className="mbti-axis-fill" style={{ width: `${rightPercent}%` }} />
      </div>
    </div>
  );
}
