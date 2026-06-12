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
  eventResponseOptions,
  eventResponsePrompt,
  eventStatusLabel,
  guidanceResultText,
  plannedEventSections,
  selectEventRelatedMessages,
} from './eventProgress';
import './MbtiExperiment.css';

const experimentScales = [
  {
    id: 'short',
    label: '短时观察',
    durationMs: 30 * 60 * 1000,
    targetEventCount: 6,
    description: '30 分钟，安排 6 个关键事件，适合快速看第一反应。',
  },
  {
    id: 'standard',
    label: '标准演化',
    durationMs: 60 * 60 * 1000,
    targetEventCount: 12,
    description: '1 小时，安排 12 个事件，覆盖压力、沟通和后续选择。',
  },
  {
    id: 'long',
    label: '长时自定义',
    durationMs: 2 * 60 * 60 * 1000,
    targetEventCount: 20,
    description: '2-8 小时自定义，事件至少 20 个起，用来检查稳定性。',
  },
] as const;

type ExperimentScale = (typeof experimentScales)[number];
type TestMode = 'quick' | 'full';
type Step = 'test' | 'question' | 'observe' | 'history';
type TownRunStatus = 'draft' | 'creating' | 'awaiting_user_responses' | 'running' | 'complete' | 'failed';
type ObserveTab = 'chat' | 'thoughts' | 'memories' | 'events';

type ExperimentReport = {
  generatedAt: number;
  summary: string;
  personalityFit: string;
  evidence: string[];
  conclusion: string;
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

type UserResponse = {
  _id: string;
  experimentId: string;
  mbtiEventId: string;
  selectedOption: string;
  confidence: number;
  emotions: string[];
  freeText: string;
  scenarioFit: 'fits' | 'partial' | 'not_fit';
  correctionText?: string;
  responseStatus: 'responded' | 'skipped' | 'expired_to_stage_report';
};

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
  analysisDimensions?: string[];
  designRationale?: string;
  theoreticalBasis?: string[];
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
    scene: string;
    trigger: string;
    participants: string[];
    observationAxis?: string;
    questionLink?: string;
    informationGoal: string;
    judgmentSignal: string;
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
  runStartedAt?: number;
  history?: unknown[];
};

const storageKey = 'mbti-town-lab:v1';
const historyResetKey = 'mbti-town-history-reset:2026-06-10-room';
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
    if (window.localStorage.getItem(historyResetKey) !== 'done') {
      window.localStorage.setItem(historyResetKey, 'done');
      return {
        ...state,
        activeSession: undefined,
        runStartedAt: undefined,
        history: [],
      };
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
  return {
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
    experimentScales.find((scale) => scale.id === storedState.experimentScaleId) ??
      experimentScales[1],
  );
  const [customDurationHours, setCustomDurationHours] = useState(
    clampCustomDurationHours(storedState.customDurationHours ?? customDurationMinHours),
  );
  const initialSession = normalizeHistoryEntry(storedState.activeSession);
  const [activeSession, setActiveSession] = useState<HistoryEntry | null>(initialSession);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(storedState.runStartedAt ?? null);
  const [runStatus, setRunStatus] = useState<TownRunStatus>(initialSession?.status ?? 'draft');
  const [history, setHistory] = useState<HistoryEntry[]>(normalizeHistory(storedState.history));
  const [activeStep, setActiveStep] = useState<Step>('test');
  const [observeTab, setObserveTab] = useState<ObserveTab>('chat');
  const [liveExperimentId, setLiveExperimentId] = useState<string | undefined>(undefined);
  const [deletingHistoryId, setDeletingHistoryId] = useState<string | null>(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const createExperiment = useMutation(api.mbti.createExperiment);
  const deleteExperiment = useMutation(api.mbti.deleteExperiment);
  const clearAllExperiments = useMutation(api.mbti.clearAllExperiments);
  const submitUserResponse = useMutation(api.mbti.submitUserResponse);
  const skipUserResponse = useMutation(api.mbti.skipUserResponse);
  const startExperimentEvolution = useMutation(api.mbti.startExperimentEvolution);
  const seedDefaultTown = useMutation(api.mbtiTown.seedDefaultTown);
  const createSceneRequest = useAction(api.mbtiTownPlanner.planAndCreateSceneRequest);
  const defaultTown = useQuery(api.mbtiTown.getDefaultTown);
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
        runStartedAt: runStartedAt ?? undefined,
        history,
      } satisfies StoredExperimentState),
    );
  }, [
    activeQuestion,
    activeSession,
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
      const seededTown = await seedDefaultTown({});
      const sceneRequest = await createSceneRequest({
        townId: seededTown.townId,
        question: nextQuestion,
        targetEventCount: observationEventCount(experimentScale, customDurationHours),
        userEntryMode: userEntryModeFromRoles(effectiveRolePresets),
      });
      const result = await createExperiment({
        question: nextQuestion,
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
      const waitingSession: HistoryEntry = {
        ...draftSession,
        status: 'awaiting_user_responses',
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
      setRunStatus('awaiting_user_responses');
      setActiveSession(waitingSession);
      setLiveExperimentId(result.experimentId);
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

  async function startPreparedEvolution() {
    if (!activeSession?.experimentId || !convexIdPattern.test(activeSession.experimentId)) {
      return;
    }
    try {
      await startExperimentEvolution({ experimentId: activeSession.experimentId as never });
      const runningSession: HistoryEntry = {
        ...activeSession,
        status: 'running',
      };
      setRunStatus('running');
      setActiveSession(runningSession);
      setHistory((current) =>
        current.map((entry) => (entry.id === activeSession.id ? runningSession : entry)),
      );
    } catch (error) {
      console.error('Failed to start MBTI evolution', error);
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
    if (entry.status === 'creating' || entry.status === 'running') {
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
                {experimentScales.map((scale) => (
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
                    {customDurationHours} 小时 · {observationEventCount(experimentScale, customDurationHours)} 个事件
                  </strong>
                </div>
              )}
              <p className="mbti-scale-summary">
                当前会运行 {formatDuration(observationDurationMs(experimentScale, customDurationHours))}，
                安排 {observationEventCount(experimentScale, customDurationHours)} 个计划事件。
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
                          ? '先完成启动前关键回应，再正式启动小镇演化。'
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
              experimentState?.experiment._id &&
              experimentState.events.length > 0 &&
              (experimentState.experiment.questionFocus?.startupQuestions?.length ?? 0) > 0 && (
                <StartupResponseDialog
                  onStart={startPreparedEvolution}
                  startupQuestions={experimentState.experiment.questionFocus?.startupQuestions ?? []}
                />
              )}

            {runStatus === 'awaiting_user_responses' &&
              experimentState?.experiment._id &&
              (experimentState.experiment.questionFocus?.startupQuestions?.length ?? 0) === 0 && (
                <div className="mbti-startup-missing">
                  本轮没有生成合格的启动前关键问题。系统不会使用兜底问题，本轮已终止。
                </div>
              )}

            {experimentState?.world && (
              <section className="mbti-town-stage">
                <ExperimentTownFrame
                  engineId={experimentState.experiment.engineId}
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
                  {enabledRoles.filter((role) => role.enabled).map((role) => role.label).join('、') || '未设置'}
                </strong>
                <p>
                  进入模式：{userEntryMode}。带入对象只作为本次临时参与者。
                </p>
              </article>
            </section>

            <QuestionGuidanceRail
              behaviorEvents={experimentState?.behaviorEvents ?? []}
              eventEvidence={experimentState?.eventEvidence ?? []}
              events={experimentState?.events ?? []}
              experimentId={experimentState?.experiment._id}
              innerThoughts={experimentState?.innerThoughts ?? []}
              messages={experimentState?.messages ?? []}
              onSubmitUserResponse={submitUserResponse}
              onSkipUserResponse={skipUserResponse}
              playerDescriptions={experimentState?.playerDescriptions ?? []}
              questionFocus={effectiveQuestionFocus}
              decisionState={experimentState?.experiment.decisionState}
              runStatus={runStatus}
              socialEvents={experimentState?.socialEvents ?? []}
              userResponses={experimentState?.userResponses ?? []}
              showInlineResponses={runStatus !== 'awaiting_user_responses'}
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
                        场景：{entry.sceneType ?? '旧实验'} · 对象：{entry.rolePresets.filter((role) => role.enabled).map((role) => role.label).join('、') || '未设置'}
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
  const topOption = rankedOptions[0];
  const spread = rankedOptions.length > 1
    ? rankedOptions[0].probability - rankedOptions[rankedOptions.length - 1].probability
    : 100;
  const isFlat = rankedOptions.length >= 3 && spread < 12;
  const headline = isFlat
    ? '你可能不是只会走一条路，而是会看情况切换'
    : topOption?.answer ?? report.conclusion;
  const explanation = isFlat
    ? `这不是证据不足。小镇里已经有不少事件证据，但几种后续做法只差 ${spread} 个点，说明你的反应不是单一路线：有时会先稳住自己，有时会找办法处理，有时也会被外界消息拉回去。`
    : topOption?.why ?? report.summary;
  const keySignals = (isFlat ? rankedOptions.flatMap((option) => option.signals) : topOption?.signals ?? [])
    .filter(Boolean)
    .slice(0, 4);
  const displayHeadline = plainConclusionText(headline);
  const displayExplanation = plainConclusionText(explanation);

  return (
    <section className="mbti-final-report" data-flat={isFlat}>
      <header className="mbti-final-hero">
        <div>
          <span>演化结论</span>
          <strong>{displayHeadline}</strong>
          <p>{displayExplanation}</p>
          {report.confidenceNotice && (
            <p className="mbti-confidence-notice">
              {evidenceLevelLabel(report.evidenceLevel)} · {report.confidenceNotice}
            </p>
          )}
        </div>
        <aside>
          <span>{isFlat ? '反应分布' : '主倾向'}</span>
          <strong>{isFlat ? '混合' : `${topOption?.probability ?? 0}%`}</strong>
          <small>
            {report.requiredUserResponseCount
              ? `真实回应 ${report.realUserResponseCount ?? 0}/${report.requiredUserResponseCount}`
              : isFlat ? `最高和最低只差 ${spread} 点` : topOption?.label}
          </small>
        </aside>
      </header>

      {rankedOptions.length > 0 && (
        <div className="mbti-answer-options" data-flat={isFlat}>
          {rankedOptions.map((option, index) => (
            <article data-rank={index + 1} key={option.label}>
              <div>
                <span>{option.label}</span>
                <strong>{isFlat ? supportLabel(index) : `${option.probability}%`}</strong>
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
        <summary>查看完整摘要和证据统计</summary>
        <p>{report.summary}</p>
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
  return '待回应';
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

function ExperimentTownFrame({
  engineId,
  worldId,
}: {
  engineId: Id<'engines'>;
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
                engineId={engineId}
                game={game}
                height={height}
                historicalTime={historicalTime}
                setSelectedElement={setSelectedElement}
                width={width}
                worldId={worldId}
              />
            </ConvexProvider>
          </Stage>
        )}
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
  decisionState,
  eventEvidence: persistedEventEvidence,
  events,
  experimentId,
  innerThoughts,
  messages,
  onSubmitUserResponse,
  onSkipUserResponse,
  playerDescriptions,
  questionFocus,
  runStatus,
  showInlineResponses,
  socialEvents,
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
    expectedSignals?: string[];
    responseOptions?: string[];
    residentRoles?: string[];
    residentParticipationGoal?: string;
    probeOrigin?: 'initial' | 'adaptive' | 'calibration';
    adaptiveReason?: string;
  }>;
  experimentId?: Id<'mbtiExperiments'>;
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
  onSubmitUserResponse: (args: {
    experimentId: Id<'mbtiExperiments'>;
    mbtiEventId: Id<'mbtiEvents'>;
    selectedOption: string;
    confidence: number;
    emotions: string[];
    freeText: string;
    scenarioFit: 'fits' | 'partial' | 'not_fit';
    correctionText?: string;
  }) => Promise<unknown>;
  onSkipUserResponse: (args: {
    experimentId: Id<'mbtiExperiments'>;
    mbtiEventId: Id<'mbtiEvents'>;
    reason?: string;
  }) => Promise<unknown>;
  playerDescriptions: Array<{
    playerId: string;
    name: string;
  }>;
  questionFocus?: QuestionFocus;
  runStatus: TownRunStatus;
  showInlineResponses: boolean;
  socialEvents: Array<{
    _id: string;
    title: string;
    description: string;
    createdAt: number;
    mbtiEventId?: string;
    participantIds?: string[];
  }>;
  userResponses: UserResponse[];
}) {
  if (!questionFocus) {
    return null;
  }
  const started = runStatus === 'running' || runStatus === 'complete';
  const completed = runStatus === 'complete';
  const nextEvent = events.find((event) => event.status === 'seeded');
  const activeEvent = events.find((event) => event.status !== 'seeded');
  const playerNameById = new Map(playerDescriptions.map((description) => [description.playerId, description.name]));
  const userResponseByEvent = new Map(userResponses.map((response) => [response.mbtiEventId, response]));
  const terminalResponseStatuses = new Set(['responded', 'skipped', 'expired_to_stage_report']);
  const pendingResponseEvents = events.filter((event) =>
    event.status !== 'seeded' &&
    event.status !== 'moving' &&
    !terminalResponseStatuses.has(event.status) &&
    !userResponseByEvent.has(event._id),
  );
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
      }));
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
  const triggeredEvents = events.filter((event) => event.status !== 'seeded').length;
  const recordedEvents = eventProgressEvidence.filter(({ record }) => !!record).length;
  const evidencedEvents = eventProgressEvidence.filter(
    ({ matchedBehaviors, matchedMessages, matchedThoughts }) =>
      matchedMessages.length > 0 || matchedBehaviors.length > 0 || matchedThoughts.length > 0,
  ).length;
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
        ? `已安排 ${events.length} 个计划事件；下一项：${nextEvent?.title ?? '等待证据整理'}。`
        : '还没有事件，系统会先生成压力、误解或修复窗口。',
      state: events.length > 0 ? 'ready' : 'pending',
      status: events.length > 0 ? '已完成' : '待生成',
      title: '排事件',
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
        ? '已根据能匹配到的聊天、事件、内心和行为整理结论。'
        : '还缺少足够可对应到事件的证据，当前不能直接下结论。',
      state: completed ? 'ready' : evidencedEvents > 0 ? 'active' : 'pending',
      status: completed ? '已完成' : '未完成',
      title: '形成结论',
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
            <span>动态校准</span>
            <strong>
              真实回应 {decisionState.responseCoverage.responded}/{decisionState.responseCoverage.required}
            </strong>
            <em>
              {decisionState.responseCoverage.missing > 0
                ? `还缺 ${decisionState.responseCoverage.missing} 个关键回应`
                : '关键回应覆盖完整'}
            </em>
          </header>
          <div>
            <DecisionStateGroup title="已确认变量" items={decisionState.resolvedVariables} emptyText="还没有变量被用户回应确认。" />
            <DecisionStateGroup title="仍需测试" items={decisionState.uncertainVariables} emptyText="暂无待测试变量。" />
            <DecisionStateGroup title="现实约束" items={decisionState.confirmedConstraints} emptyText="暂未记录现实约束。" />
            <DecisionStateGroup title="敏感条件" items={decisionState.sensitiveConditions} emptyText="暂未识别敏感条件。" />
          </div>
          {decisionState.lastUserCorrection && (
            <p>最近修正：{decisionState.lastUserCorrection}</p>
          )}
        </section>
      )}
      {pendingResponseEvents.length > 0 && (
        <section className="mbti-response-queue">
          <header>
            <span>待回应关键节点</span>
            <strong>{pendingResponseEvents.length}</strong>
          </header>
          <ul>
            {pendingResponseEvents.slice(0, 5).map((event) => (
              <li key={event._id}>
                <b>{event.title}</b>
                <span>{event.testedVariable ?? plannedEventSections(event.description).observationAxis ?? '关键变量待确认'}</span>
              </li>
            ))}
          </ul>
          <p>这些节点会等待你的真实选择；不回应时最终只进入低可信阶段报告。</p>
        </section>
      )}
      {events.length > 0 && (
        <div className="mbti-guidance-events">
          {eventProgressEvidence.map(({ event, matchedBehaviors, matchedMessages, matchedThoughts, record }) => (
            <EventProgressCard
              event={event}
              experimentId={experimentId}
              key={event._id}
              matchedBehaviors={matchedBehaviors}
              matchedMessages={matchedMessages}
              matchedThoughts={matchedThoughts}
              onSubmitUserResponse={onSubmitUserResponse}
              onSkipUserResponse={onSkipUserResponse}
              participantCount={record?.participantIds?.length ?? 0}
              playerNameById={playerNameById}
              recordDescription={record?.description}
              recordedAt={record?.createdAt}
              scenarioContext={`${questionFocus.observationGoal} ${questionFocus.drivingTension} ${questionFocus.resolutionCriteria} ${event.description}`}
              resolutionCriteria={questionFocus.resolutionCriteria}
              showInlineResponse={showInlineResponses}
              userResponse={userResponseByEvent.get(event._id)}
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
          <b>{completed ? '已完成' : '进行中'}</b>
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
  onStart: () => Promise<void>;
  startupQuestions: StartupQuestion[];
}) {
  const [answersByQuestion, setAnswersByQuestion] = useState<Record<number, string>>({});
  const [notesByQuestion, setNotesByQuestion] = useState<Record<number, string>>({});
  const [starting, setStarting] = useState(false);
  const completedCount = startupQuestions.filter((_, index) => answersByQuestion[index]).length;
  const canStart = startupQuestions.length > 0 && completedCount === startupQuestions.length && !starting;

  function chooseOption(questionIndex: number, option: string) {
    setAnswersByQuestion((current) => ({
      ...current,
      [questionIndex]: option,
    }));
  }

  function saveCustomAnswer(questionIndex: number) {
    const note = notesByQuestion[questionIndex]?.trim() ?? '';
    if (!note) {
      return;
    }
    chooseOption(questionIndex, `补充条件：${compactText(note, 36)}`);
  }

  return (
    <div className="mbti-startup-dialog" role="dialog" aria-modal="true" aria-label="启动前关键回应">
      <section>
        <header>
          <div>
            <span>启动前关键回应</span>
            <strong>先完成这 {startupQuestions.length} 个选择，再启动小镇</strong>
            <p>这里只收集会影响本轮判断的真实选择；更细的事件证据会在小镇运行后产生。</p>
          </div>
          <b>{completedCount}/{startupQuestions.length}</b>
        </header>
        <div className="mbti-startup-question-list">
          {startupQuestions.map((startupQuestion, index) => {
            const answer = answersByQuestion[index];
            const note = notesByQuestion[index]?.trim() ?? '';
            return (
              <article data-complete={Boolean(answer)} key={`${index}-${startupQuestion.question}`}>
                <div>
                  <span>问题 {index + 1}</span>
                  <strong>{startupQuestion.question}</strong>
                </div>
                <div className="mbti-startup-options">
                  {startupQuestion.options.map((option) => (
                    <button
                      className={answer === option ? 'selected' : ''}
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
                  placeholder="可选：补充一个现实条件，例如年龄、回岳阳后的生活安排、不能接受的伴侣特征。"
                  value={notesByQuestion[index] ?? ''}
                />
                {!answer && note && (
                  <button
                    className="mbti-startup-custom-answer"
                    onClick={() => saveCustomAnswer(index)}
                    type="button"
                  >
                    用补充条件作为回答
                  </button>
                )}
                <em>
                  {answer
                    ? `已记录：${answer}`
                    : note
                    ? '可以直接保存补充条件，或选择一个最接近的选项'
                    : '请选择一个最接近的真实反应，或填写补充条件'}
                </em>
              </article>
            );
          })}
        </div>
        <footer>
          <span>{canStart ? '关键回应已完成，可以启动小镇。' : '完成所有关键回应后才能启动。'}</span>
          <button
            disabled={!canStart}
            onClick={async () => {
              setStarting(true);
              try {
                await onStart();
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
};

function EventProgressCard({
  event,
  experimentId,
  matchedBehaviors,
  matchedMessages,
  matchedThoughts,
  onSubmitUserResponse,
  onSkipUserResponse,
  participantCount,
  playerNameById,
  recordDescription,
  recordedAt,
  scenarioContext,
  resolutionCriteria,
  showInlineResponse,
  userResponse,
}: {
  event: {
    _id: string;
    title: string;
    description: string;
    status: string;
    testedVariable?: string;
    testedHypotheses?: string[];
    questionLink?: string;
    informationGoal?: string;
    expectedSignals?: string[];
    responseOptions?: string[];
    residentRoles?: string[];
    residentParticipationGoal?: string;
    probeOrigin?: 'initial' | 'adaptive' | 'calibration';
    adaptiveReason?: string;
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
  onSubmitUserResponse: (args: {
    experimentId: Id<'mbtiExperiments'>;
    mbtiEventId: Id<'mbtiEvents'>;
    selectedOption: string;
    confidence: number;
    emotions: string[];
    freeText: string;
    scenarioFit: 'fits' | 'partial' | 'not_fit';
    correctionText?: string;
  }) => Promise<unknown>;
  onSkipUserResponse: (args: {
    experimentId: Id<'mbtiExperiments'>;
    mbtiEventId: Id<'mbtiEvents'>;
    reason?: string;
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
  const [correctionText, setCorrectionText] = useState(userResponse?.correctionText ?? '');
  const [submitState, setSubmitState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  useEffect(() => {
    if (!userResponse) {
      return;
    }
    setSelectedOption(userResponse.selectedOption);
    setConfidence(userResponse.confidence);
    setEmotionText(userResponse.emotions.join('、'));
    setFreeText(userResponse.freeText);
    setScenarioFit(userResponse.scenarioFit);
    setCorrectionText(userResponse.correctionText ?? '');
  }, [userResponse]);
  const planned = plannedEventSections(event.description);
  const displayedVariable = event.testedVariable ?? planned.observationAxis ?? '未写明维度';
  const displayedQuestionLink = event.questionLink ?? planned.questionLink ?? '把原问题转成可观察的行为反应。';
  const displayedInformationGoal = event.informationGoal ?? planned.informationGoal ?? '这件事能不能推动真实互动。';
  const responsePrompt = eventResponsePrompt(planned, event.title);
  const responseOptions = event.responseOptions?.length ? event.responseOptions : eventResponseOptions(planned, event.title);
  const hasChatEvidence = matchedMessages.length > 0;
  const hasEventRecord = Boolean(recordedAt);
  const shouldShowUserResponsePanel = showInlineResponse && (hasEventRecord || Boolean(userResponse));
  const hasAuxiliaryEvidence = matchedThoughts.length > 0 || matchedBehaviors.length > 0;
  const hasAnyEvidence = hasChatEvidence || hasAuxiliaryEvidence;
  const expectsConversation = participantCount >= 2;
  const statusLabel = hasEventRecord
    ? hasAnyEvidence
      ? '已触发 · 有辅助证据'
      : '已触发 · 等证据'
    : eventStatusLabel(event.status);
  const conclusion = directEventConclusion(
    matchedMessages,
    matchedThoughts,
    matchedBehaviors,
    playerNameById,
    scenarioContext,
    resolutionCriteria,
    hasEventRecord,
  );
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
              <dt>探针来源</dt>
              <dd>{probeOriginLabel(event.probeOrigin)}{event.adaptiveReason ? `：${event.adaptiveReason}` : ''}</dd>
            </div>
            <div>
              <dt>居民角色</dt>
              <dd>{event.residentRoles?.join('、') || '本轮未指定。'}</dd>
            </div>
            <div>
              <dt>居民目标</dt>
              <dd>{event.residentParticipationGoal || '让居民提供不同立场和现实约束。'}</dd>
            </div>
            <div>
              <dt>预期信号</dt>
              <dd>{event.expectedSignals?.join('、') || planned.judgmentSignal || '等待用户真实回应。'}</dd>
            </div>
          </dl>
        </section>
        <section data-kind="evidence">
          <b>实际证据</b>
          {hasEventRecord ? (
            <>
              <p className="mbti-event-record-note">
                {recordedAt ? `触发时间：${new Date(recordedAt).toLocaleString()}` : '已进入事件记录'}
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
          {hasEventRecord && hasAnyEvidence ? (
            <div className="mbti-conclusion-body">
              <strong>{conclusion.summary}</strong>
              <p className="mbti-conclusion-inference">{conclusion.inference}</p>
              {conclusion.next && <p className="mbti-conclusion-next">{conclusion.next}</p>}
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
      <section className="mbti-user-response-panel" data-saved={Boolean(userResponse)}>
        <header>
          <b>你的关键回应</b>
          <span>
            {userResponse?.responseStatus === 'skipped'
              ? '已跳过：不会计入真实回应覆盖'
              : userResponse?.responseStatus === 'expired_to_stage_report'
              ? '已进入阶段报告：未计入真实回应覆盖'
              : userResponse
              ? `已记录：${userResponse.selectedOption} · 确定度 ${userResponse.confidence}/7`
              : '这一步需要你的真实选择，系统不会替你回答。'}
          </span>
        </header>
        <p className="mbti-response-question">{responsePrompt}</p>
        <div className="mbti-response-options">
          {responseOptions.map((option) => (
            <button
              className={selectedOption === option ? 'selected' : ''}
              key={option}
              onClick={() => {
                setSelectedOption(option);
                setSubmitState('idle');
              }}
              type="button"
            >
              {option}
            </button>
          ))}
        </div>
        <label>
          <span>确定程度：{confidence}/7</span>
          <input
            max={7}
            min={1}
            onChange={(inputEvent) => {
              setConfidence(Number(inputEvent.target.value));
              setSubmitState('idle');
            }}
            type="range"
            value={confidence}
          />
        </label>
        <div className="mbti-response-grid">
          <label>
            <span>情绪反应</span>
            <input
              onChange={(inputEvent) => {
                setEmotionText(inputEvent.target.value);
                setSubmitState('idle');
              }}
              placeholder="焦虑、兴奋、抗拒、轻松..."
              value={emotionText}
            />
          </label>
          <label>
            <span>情境贴合度</span>
            <select
              onChange={(inputEvent) => {
                setScenarioFit(inputEvent.target.value as 'fits' | 'partial' | 'not_fit');
                setSubmitState('idle');
              }}
              value={scenarioFit}
            >
              <option value="fits">贴合我的真实情况</option>
              <option value="partial">部分贴合</option>
              <option value="not_fit">不太符合</option>
            </select>
          </label>
        </div>
        <label>
          <span>原因说明</span>
          <textarea
            onChange={(inputEvent) => {
              setFreeText(inputEvent.target.value);
              setSubmitState('idle');
            }}
            placeholder="写下你为什么会这样选，或者哪个条件会让你改变。"
            value={freeText}
          />
        </label>
        {scenarioFit !== 'fits' && (
          <label>
            <span>修正或现实约束</span>
            <textarea
              onChange={(inputEvent) => {
                setCorrectionText(inputEvent.target.value);
                setSubmitState('idle');
              }}
              placeholder="例如：不是怕风险，而是家里有现金流/合同/照护约束。"
              value={correctionText}
            />
          </label>
        )}
        <div className="mbti-response-actions">
          <button
            disabled={!experimentId || !selectedOption || submitState === 'saving'}
            onClick={async () => {
              if (!experimentId || !selectedOption) {
                return;
              }
              setSubmitState('saving');
              try {
                await onSubmitUserResponse({
                  experimentId,
                  mbtiEventId: event._id as Id<'mbtiEvents'>,
                  selectedOption,
                  confidence,
                  emotions: emotionText.split(/[、,，\s]+/).map((item) => item.trim()).filter(Boolean),
                  freeText,
                  scenarioFit,
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
            {submitState === 'saving' ? '保存中...' : userResponse ? '更新回应' : '保存真实回应'}
          </button>
          <button
            disabled={!experimentId || submitState === 'saving'}
            onClick={async () => {
              if (!experimentId) {
                return;
              }
              setSubmitState('saving');
              try {
                await onSkipUserResponse({
                  experimentId,
                  mbtiEventId: event._id as Id<'mbtiEvents'>,
                  reason: correctionText || freeText || undefined,
                });
                setSubmitState('saved');
              } catch (error) {
                console.error('Failed to skip MBTI user response', error);
                setSubmitState('error');
              }
            }}
            type="button"
          >
            这个情境不符合我
          </button>
          <span>
            {submitState === 'saved'
              ? '已保存为真实用户证据'
              : submitState === 'error'
              ? '保存失败，请稍后重试'
              : !selectedOption
              ? '先选择一个最接近的真实反应'
              : '保存后会提升报告可信度'}
          </span>
        </div>
      </section>
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

type ConclusionEvidenceItem = {
  kind: '行为' | '聊天' | '内心';
  text: string;
};

type DirectEventConclusion = {
  summary: string;
  evidenceItems: ConclusionEvidenceItem[];
  inference: string;
  next?: string;
};

function conclusionResult(
  summary: string,
  evidenceItems: ConclusionEvidenceItem[],
  inference: string,
  next?: string,
): DirectEventConclusion {
  return {
    summary,
    evidenceItems,
    inference,
    next,
  };
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

function directEventConclusion(
  matchedMessages: Array<{
    author: string;
    text: string;
  }>,
  matchedThoughts: Array<{
    playerId: string;
    text: string;
  }>,
  matchedBehaviors: Array<{
    playerId: string;
    text: string;
  }>,
  playerNameById: Map<string, string>,
  scenarioContext: string,
  resolutionCriteria: string,
  hasEventRecord: boolean,
) {
  if (!hasEventRecord) {
    return conclusionResult(
      '计划未触发',
      [],
      '没有事件记录时，聊天、内心和行为都不能挂到这个计划事件下做判断。',
    );
  }
  if (matchedMessages.length === 0 && matchedThoughts.length === 0 && matchedBehaviors.length === 0) {
    return conclusionResult(
      '暂无行为结论',
      [],
      '这个事件已经触发，但还没看到对应聊天、内心或行为证据。',
    );
  }
  const normalizedMessages = matchedMessages.map((message) => ({
    name: playerNameById.get(message.author) ?? '角色',
    text: message.text,
  }));
  const userMessages = normalizedMessages.filter((message) => message.name === '我');
  const otherMessages = normalizedMessages.filter((message) => message.name !== '我');
  const userText = userMessages.map((message) => message.text).join(' ');
  const otherText = otherMessages.map((message) => message.text).join(' ');
  const thoughtText = matchedThoughts.map((thought) => thought.text).join(' ');
  const behaviorText = matchedBehaviors.map((behavior) => behavior.text).join(' ');
  const combinedText = `${userText} ${thoughtText} ${behaviorText}`;
  const evidenceItems: ConclusionEvidenceItem[] = [
    matchedBehaviors[0]?.text ? { kind: '行为', text: matchedBehaviors[0].text } : null,
    userMessages[0]?.text ? { kind: '聊天', text: userMessages[0].text } : null,
    matchedThoughts[0]?.text ? { kind: '内心', text: matchedThoughts[0].text } : null,
  ].filter((item): item is ConclusionEvidenceItem => Boolean(item));
  const fallbackEvidence = compactText(combinedText, 90);
  const userRejects = /不用|别来|不接|忙完|回跑|没空|不要|算了|不说/.test(`${userText} ${behaviorText}`);
  const userClarifies = /核对|追问|确认|说清楚|问清楚|具体原因|为什么|怎么回事/.test(combinedText);
  const userAdjusts = /调整|改选|替代|替代饮品|其他.*替代|换一个|换成|重新安排|另一个方案|先.*再/.test(combinedText);
  const userWaitsCalmly = /不急|等|等等|坐会|坐一会|慢慢|耐心|先坐|继续等/.test(combinedText) && !/太久|烦|受不了|不等/.test(combinedText);
  const userKeepsMoving = /径直|继续|前往|走向|出发|按计划|查看时间|收起手机/.test(combinedText);
  const userSeeksSupport = /询问|求助|找.*帮|请.*帮|问.*有没有|推荐|联系|打电话/.test(behaviorText);
  const userActsConstructively = /处理|记录|排队|预约|购买|改约|提交|整理|拿出|查看|前往|走向|坐下|等待/.test(behaviorText);
  const userApproaches = /我来|接你|发个定位|等你|一起|当面说|说清楚/.test(userText);
  const otherApproaches = /接你|定位|到了没|担心|头晕|忙吗|我去|陪你|等你/.test(otherText);
  const userShowsBoundary = /别|不用|不要|先别|等一下|等会|我自己|别管|别催|别翻|别动|不方便/.test(`${userText} ${behaviorText}`);
  const userShowsIrritation = /烦|急|别烦|吵|打断|麻烦|不耐烦|受不了|够了|怎么又/.test(combinedText);
  const userAcceptsHelp = /好|行|可以|谢谢|麻烦你|那你|帮我|一起|你来|听你的/.test(userText);
  const userExplainsSelf = /因为|不是|我只是|我现在|我刚才|我担心|我怕|我想先|我需要/.test(userText);
  const relationshipContext = /伴侣|女朋友|男朋友|对象|亲密|恋爱|关系修复|修复关系|吵架|和好/.test(scenarioContext);
  const stressContext = /股市|波动|情绪|生活热情|压力|不可控|混乱|焦虑|生活节奏|投资|市场|控制|逃避|分析|情感联结/.test(scenarioContext);

  if (!relationshipContext && stressContext) {
    if (userClarifies) {
      return conclusionResult(
        '更可能先核对事实',
        evidenceItems,
        '他没有马上被情绪带走，而是先把事情问清楚。',
        '后面重点看：遇到新阻碍时，他是不是还会先确认信息，再决定要不要改计划。',
      );
    }
    if (userAdjusts) {
      return conclusionResult(
        '更可能改用替代方案',
        evidenceItems,
        '他没有卡在原计划失败上，而是在找下一步还能怎么做。',
        '后面重点看：他会不会持续选择换方案、改顺序或重新安排。',
      );
    }
    if (userSeeksSupport) {
      return conclusionResult(
        '更可能主动寻找支持',
        evidenceItems,
        '他已经开始问人、找资源，说明压力来了以后不是只憋着，而是在往外找办法。',
      );
    }
    if (userWaitsCalmly) {
      return conclusionResult(
        '更可能先稳定等待',
        evidenceItems,
        '他接受现在确实被耽误了，但没有马上急起来，也没有直接放弃。',
        '后面重点看：他是先稳住自己，还是很快转成焦虑或逃开。',
      );
    }
    if (userKeepsMoving) {
      return conclusionResult(
        '更可能继续执行下一步',
        evidenceItems,
        '他没有停在“出问题了”这件事上，而是继续找能做的下一步。',
        '后面重点看：他能不能持续把注意力放回具体行动。',
      );
    }
    if (userActsConstructively && behaviorText) {
      return conclusionResult(
        '更可能把情绪转成行动',
        evidenceItems,
        '他已经开始做具体的小动作，说明不是完全停住或只在情绪里打转。',
      );
    }
    if (/烦|不想|算了|不要|没劲|累|受不了|不看|躲|离开/.test(combinedText)) {
      return conclusionResult(
        '更可能先退出现场',
        evidenceItems,
        '他现在更像是在先减少刺激，不想继续硬扛现场压力。',
        '后面重点看：他是短暂离开后再处理，还是持续回避。',
      );
    }
    if (userMessages.length === 0 && matchedBehaviors.length === 0) {
      return conclusionResult(
        '还看不到用户选择',
        evidenceItems,
        '现在还没有看到他自己说了什么、做了什么。',
        '所以还不能判断他后面会主动处理，还是继续被外部波动牵着走。',
      );
    }
    return conclusionResult(
      '证据不足，暂不能判定倾向',
      evidenceItems,
      `现在只能说明他有回应，但还看不清主要模式。${fallbackEvidence ? `可见片段：${fallbackEvidence}` : ''}`,
      `后面还要继续看：${compactText(resolutionCriteria, 56)}。`,
    );
  }

  if (userRejects) {
    return conclusionResult(
      '更可能暂时拉开距离',
      evidenceItems,
      '他没有顺着对方靠近，而是在拒绝、延后或退出互动，更像是先保护自己的边界。',
    );
  }
  if (userClarifies) {
    return conclusionResult(
      '更可能把话说清楚',
      evidenceItems,
      '他在追问或核对具体事实，不是单纯迎合对方。',
    );
  }
  if (userShowsBoundary) {
    return conclusionResult(
      '更可能先守住边界',
      evidenceItems,
      '他的回应里已经有“先别这样”或“不按对方节奏走”的意思，说明当下更需要空间和控制感。',
      '后面重点看：他会不会在边界稳定后继续沟通，还是直接退出互动。',
    );
  }
  if (userShowsIrritation) {
    return conclusionResult(
      '更可能先被打断感影响',
      evidenceItems,
      '他不是完全没反应，而是先表现出被打扰、被催促或被冒犯的不舒服。',
      '后面重点看：这种不舒服会不会转成明确沟通，还是继续积压成回避。',
    );
  }
  if (userAcceptsHelp) {
    return conclusionResult(
      '更可能愿意接住对方',
      evidenceItems,
      '他没有把对方推开，至少在这一刻愿意接受对方靠近或协助。',
      '后面重点看：他是稳定接住，还是只是一句礼貌回应。',
    );
  }
  if (userExplainsSelf) {
    return conclusionResult(
      '更可能先解释自己的处境',
      evidenceItems,
      '他在尝试说明自己为什么这样做，而不是直接沉默或切断关系。',
      '后面重点看：解释之后是否能进一步提出需求或方案。',
    );
  }
  if (userApproaches) {
    return conclusionResult(
      '更可能继续当面沟通',
      evidenceItems,
      '他没有结束互动，而是把对话留在同一个现场，说明还愿意把问题谈完。',
    );
  }
  if (userActsConstructively && behaviorText) {
    return conclusionResult(
      '更可能用行动维持连接',
      evidenceItems,
      '虽然话不一定多，但他的行动还在维持现场，没有直接断开。',
    );
  }
  if (otherApproaches && userMessages.length === 0) {
    return conclusionResult(
      '对象在主动靠近',
      evidenceItems,
      '现在主要是对方在主动推进，还没看到用户自己的选择。',
      '需要等用户回应后，才能判断他愿不愿意接住这次沟通。',
    );
  }
  if (otherApproaches) {
    return conclusionResult(
      '对象主动，用户态度未明',
      evidenceItems,
      '对方有靠近或关心的信号，但用户这边还不够明确。',
    );
  }
  if (userMessages.length > 0 || matchedBehaviors.length > 0) {
    return conclusionResult(
      '已有回应，但方向还浅',
      evidenceItems,
      `现在能看到他已经接了这个事件，不是完全无反应。${fallbackEvidence ? `可见片段：${fallbackEvidence}` : ''}`,
      `下一步要看这个回应会往哪边走：是继续问清楚、表达边界、接受帮助，还是转身离开。`,
    );
  }
  return conclusionResult(
    '还缺用户自己的回应',
    evidenceItems,
    '目前主要是事件或他人的动作，还没有看到用户自己怎么接。',
    `后面继续看：${compactText(resolutionCriteria, 56)}。`,
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
              <p>{selectedDescription?.character ? `角色外观：${selectedDescription.character}` : '角色定义已载入'}</p>
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
          <span>角色定义</span>
          <strong>{selectedName}</strong>
          <p>{selectedDescription?.description ?? '暂无角色定义。'}</p>
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
