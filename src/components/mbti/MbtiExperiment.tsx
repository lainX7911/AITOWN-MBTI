import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  buildProfile,
  customScenario,
  defaultQuestion,
  defaultAnswers,
  inferRolePresets,
  runSimulation,
} from './mbtiModel';
import { RolePreset, SimulationReport, SimulationRun, TestAnswer } from './types';
import './MbtiExperiment.css';

const experimentScales = [
  {
    id: 'quick',
    label: '快速试跑',
    runCount: 24,
    description: '先看大致倾向，适合快速试一个问题。',
  },
  {
    id: 'standard',
    label: '标准观察',
    runCount: 48,
    description: '平衡速度和稳定性，适合一般验证。',
  },
  {
    id: 'deep',
    label: '深度验证',
    runCount: 96,
    description: '覆盖更多对象组合，适合认真比较结论。',
  },
];

type ExperimentScale = (typeof experimentScales)[number];

type HistoryEntry = {
  id: string;
  createdAt: number;
  question: string;
  profileCode: string;
  scaleLabel: string;
  report: SimulationReport;
};

type Step = 'test' | 'question' | 'observe' | 'history';

type StoredExperimentState = {
  answers?: TestAnswer[];
  question?: string;
  activeQuestion?: string;
  rolePresets?: RolePreset[] | Record<'partner' | 'friend', RolePreset>;
  experimentScaleId?: string;
  activeReport?: SimulationReport;
  runStartedAt?: number;
  simulationMode?: 'preview' | 'town';
  history?: HistoryEntry[];
};

const storageKey = 'mbti-town-lab:v1';

function readStoredState(): StoredExperimentState {
  if (typeof window === 'undefined') {
    return {};
  }
  try {
    return JSON.parse(window.localStorage.getItem(storageKey) ?? '{}') as StoredExperimentState;
  } catch {
    return {};
  }
}

export default function MbtiExperiment() {
  const [storedState] = useState(readStoredState);
  const [answers, setAnswers] = useState<TestAnswer[]>(storedState.answers ?? defaultAnswers);
  const [question, setQuestion] = useState(storedState.question ?? defaultQuestion);
  const [activeQuestion, setActiveQuestion] = useState(
    storedState.activeQuestion ?? storedState.question ?? defaultQuestion,
  );
  const [rolePresets, setRolePresets] = useState<RolePreset[]>(
    Array.isArray(storedState.rolePresets)
      ? storedState.rolePresets
      : inferRolePresets(storedState.question ?? defaultQuestion),
  );
  const [experimentScale, setExperimentScale] = useState<ExperimentScale>(
    experimentScales.find((scale) => scale.id === storedState.experimentScaleId) ??
      experimentScales[1],
  );
  const [activeReport, setActiveReport] = useState<SimulationReport | null>(
    storedState.activeReport ?? null,
  );
  const [runStartedAt, setRunStartedAt] = useState<number | null>(storedState.runStartedAt ?? null);
  const [runStatus, setRunStatus] = useState<'idle' | 'running' | 'complete'>(
    storedState.activeReport ? 'complete' : 'idle',
  );
  const [simulationMode, setSimulationMode] = useState<'preview' | 'town'>(
    storedState.simulationMode ?? 'preview',
  );
  const [history, setHistory] = useState<HistoryEntry[]>(storedState.history ?? []);
  const [activeStep, setActiveStep] = useState<Step>('test');
  const [selectedRunId, setSelectedRunId] = useState(1);
  const profile = useMemo(() => buildProfile(answers), [answers]);
  const selectedRun =
    activeReport?.runs.find((run) => run.id === selectedRunId) ?? activeReport?.runs[0];
  const hasPendingQuestion = question.trim() !== activeQuestion.trim();

  useEffect(() => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        answers,
        question,
        activeQuestion,
        rolePresets,
        experimentScaleId: experimentScale.id,
        activeReport: activeReport ?? undefined,
        runStartedAt: runStartedAt ?? undefined,
        simulationMode,
        history,
      } satisfies StoredExperimentState),
    );
  }, [
    activeQuestion,
    activeReport,
    answers,
    experimentScale.id,
    history,
    question,
    rolePresets,
    runStartedAt,
    simulationMode,
  ]);

  useEffect(() => {
    setRolePresets((current) => inferRolePresets(question, current));
  }, [question]);

  function updateAnswer(index: number, value: number) {
    setAnswers((current) =>
      current.map((answer, answerIndex) =>
        answerIndex === index ? { ...answer, value } : answer,
      ),
    );
  }

  function updateRole(role: string, patch: Partial<RolePreset>) {
    setRolePresets((current) =>
      current.map((preset) => (preset.role === role ? { ...preset, ...patch } : preset)),
    );
  }

  function startSimulation() {
    const nextQuestion = question.trim() || defaultQuestion;
    const effectiveRolePresets = inferRolePresets(nextQuestion, rolePresets);
    const startedAt = Date.now();
    if (simulationMode === 'town') {
      setActiveQuestion(nextQuestion);
      setRolePresets(effectiveRolePresets);
      setRunStartedAt(startedAt);
      setRunStatus('idle');
      setActiveReport(null);
      setActiveStep('observe');
      return;
    }
    setActiveQuestion(nextQuestion);
    setRolePresets(effectiveRolePresets);
    setRunStartedAt(startedAt);
    setRunStatus('complete');
    setActiveStep('observe');
    const nextReport = runSimulation(
      profile,
      customScenario(nextQuestion),
      experimentScale.runCount,
      effectiveRolePresets,
    );
    const nextHistoryEntry: HistoryEntry = {
      id: `${startedAt}`,
      createdAt: startedAt,
      question: nextQuestion,
      profileCode: profile.code,
      scaleLabel: `${experimentScale.label} · 快速预览`,
      report: nextReport,
    };
    setActiveReport(nextReport);
    setSelectedRunId(nextReport.runs[0]?.id ?? 1);
    setHistory((current) => [nextHistoryEntry, ...current].slice(0, 12));
  }

  function refreshInferredRoles() {
    setRolePresets((current) => inferRolePresets(question, current));
  }

  function restoreHistory(entry: HistoryEntry) {
    setQuestion(entry.question);
    setActiveQuestion(entry.question);
    setActiveReport(entry.report);
    setRunStartedAt(entry.createdAt);
    setRunStatus('complete');
    setSelectedRunId(entry.report.runs[0]?.id ?? 1);
    setActiveStep('observe');
  }

  return (
    <main className="mbti-shell">
      <div className="mbti-page">
        <header className="mbti-header">
          <div>
            <h1 className="mbti-title">MBTI Town Lab</h1>
            <p className="mbti-subtitle">
              先把人格拆成 E/I/S/N/T/F/J/P 的比例，再把同一个人格放进多组社会对象和压力场景里重复运行。
              这里输出的是行为倾向证据，不是单次剧情或固定结论。
            </p>
          </div>
          <section className="mbti-status" aria-label="当前人格">
            <span>当前人格</span>
            <strong className="mbti-code">{profile.code}</strong>
            <span>
              当前使用「{experimentScale.label}」，会比较不同对象反应下的行为倾向。
            </span>
          </section>
        </header>

        <nav className="mbti-stepper" aria-label="实验步骤">
          <StepButton activeStep={activeStep} id="test" label="人格测试" onSelect={setActiveStep} />
          <StepButton activeStep={activeStep} id="question" label="问题描述" onSelect={setActiveStep} />
          <StepButton activeStep={activeStep} id="observe" label="模拟观察" onSelect={setActiveStep} />
          <StepButton activeStep={activeStep} id="history" label="历史记录" onSelect={setActiveStep} />
        </nav>

        {activeStep === 'test' && (
          <section className="mbti-panel">
            <h2>1. 人格权重测试</h2>
            <p className="mbti-section-note">
              这一步只负责保存你的人格权重。测试结果会自动保留，后面换问题也不用重测。
            </p>
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
                    <input
                      id={`answer-${index}`}
                      min={0}
                      max={100}
                      value={answer.value}
                      type="range"
                      onChange={(event) => updateAnswer(index, Number(event.target.value))}
                    />
                    <span>{answer.rightLabel}</span>
                  </div>
                </div>
              ))}
            </div>
            <button className="mbti-action" onClick={() => setActiveStep('question')} type="button">
              下一步：描述问题
            </button>
          </section>
        )}

        {activeStep === 'question' && (
          <section className="mbti-panel">
            <h2>2. 人格构成</h2>
            <div className="mbti-bars">
              <AxisBar left="E" right="I" leftValue={profile.weights.e} rightValue={profile.weights.i} />
              <AxisBar left="S" right="N" leftValue={profile.weights.s} rightValue={profile.weights.n} />
              <AxisBar left="T" right="F" leftValue={profile.weights.t} rightValue={profile.weights.f} />
              <AxisBar left="J" right="P" leftValue={profile.weights.j} rightValue={profile.weights.p} />
            </div>

            <h2 className="mt-6">3. 描述你想验证的问题</h2>
            <p className="mbti-section-note">
              直接写一个具体社会问题。系统会把它转成压力场景，再用你的人格权重跑多轮分支。
            </p>
            <textarea
              className="mbti-textarea"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              aria-label="自定义问题"
            />
            <section className="mbti-role-settings">
              <div className="mbti-role-settings-header">
                <div>
                  <h3>对象预设</h3>
                  <p>
                    根据你的问题自动识别涉及的人。你可以补充每个对象的 MBTI 或性格特征；
                    不确定就保持默认。
                  </p>
                </div>
                <button onClick={refreshInferredRoles} type="button">
                  根据问题重新识别
                </button>
              </div>
              {rolePresets.map((preset) => (
                <RoleEditor
                  key={preset.role}
                  value={preset}
                  onChange={(patch) => updateRole(preset.role, patch)}
                />
              ))}
            </section>
            <div className="mbti-scale-picker">
              <span className="mbti-scale-title">选择实验方式</span>
              <div className="mbti-mode-options">
                <button
                  data-active={simulationMode === 'preview'}
                  onClick={() => setSimulationMode('preview')}
                  type="button"
                >
                  <strong>快速预览</strong>
                  <span>用本地模型估算倾向，适合调问题和检查设置，会立即出报告。</span>
                </button>
                <button
                  data-active={simulationMode === 'town'}
                  onClick={() => setSimulationMode('town')}
                  type="button"
                >
                  <strong>小镇演化</strong>
                  <span>把人格和对象导入 AI Town，由角色移动、对话、事件、记忆产生观察结果。</span>
                </button>
              </div>
              {simulationMode === 'town' && (
                <p className="mbti-warning mbti-mode-warning">
                  小镇演化需要后端实验 world 接入；当前按钮会先展示待导入信息，不会生成假报告。
                </p>
              )}
              <span className="mbti-scale-title">选择观察强度</span>
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
            </div>
            <button className="mbti-action" onClick={startSimulation} type="button">
              {simulationMode === 'preview' ? '生成快速预览报告' : '准备导入小镇演化'}
            </button>
          </section>
        )}

        {activeStep === 'observe' && (
        <section className="mbti-panel mt-5 mbti-report">
          <h2>3. 模拟观察</h2>
          <div className="mbti-run-status" data-status={runStatus}>
            <strong>
              {runStatus === 'running'
                ? '模拟正在运行...'
                : runStatus === 'complete'
                  ? '模拟已完成'
                  : '还没有启动模拟'}
            </strong>
            <span>
              {runStatus === 'idle'
                ? simulationMode === 'town'
                  ? '小镇演化尚未接入后端。下面展示的是准备导入小镇的实验配置。'
                  : '请先到“问题描述”填写问题并生成快速预览。'
                : `当前问题：${activeQuestion}。本次为「${experimentScale.label}」。`}
            </span>
            {runStartedAt && <span>启动时间：{new Date(runStartedAt).toLocaleString()}</span>}
            {hasPendingQuestion && (
              <span className="mbti-warning">你已经修改了问题，但还没有重新启动模拟。</span>
            )}
          </div>
          <div className="mbti-observe-actions">
            <button onClick={() => setActiveStep('question')} type="button">
              返回修改问题
            </button>
            <button onClick={startSimulation} type="button">
              重新启动模拟
            </button>
          </div>
          {runStatus === 'running' && (
            <div className="mbti-running-bar" aria-label="模拟运行中">
              <span />
            </div>
          )}
          {runStatus === 'idle' && (
            <div className="mbti-empty-state">
              <p>
                {simulationMode === 'town'
                  ? '真实小镇演化应该创建实验 world、写入用户人格代理和对象代理，然后收集真实聊天、事件、内心独白。当前还未接入这条后端链路。'
                  : '本页会在启动后显示行为分布、分支细节、聊天、事件和内心独白。'}
              </p>
              {simulationMode === 'town' && (
                <ul>
                  <li>用户人格：{profile.code}</li>
                  <li>问题：{activeQuestion}</li>
                  <li>识别对象：{rolePresets.map((role) => role.label).join('、')}</li>
                  <li>观察强度：{experimentScale.label}</li>
                </ul>
              )}
            </div>
          )}
          {activeReport && runStatus !== 'running' && (
            <>
          <div className="mbti-distribution">
            {activeReport.distribution.map((item) => (
              <div className="mbti-distribution-row" key={item.action}>
                <strong>{item.action}</strong>
                <div className="mbti-mini-track">
                  <div className="mbti-mini-fill" style={{ width: `${item.percent}%` }} />
                </div>
                <span>{item.percent}%</span>
              </div>
            ))}
          </div>

          <ReportBlock title="稳定倾向" items={activeReport.stableTendencies} />
          <ReportBlock title="条件触发" items={activeReport.conditionalTriggers} />

          <div>
            <h3>反例路径</h3>
            <div className="grid gap-3 md:grid-cols-3">
              {activeReport.counterexamples.map((run) => (
                <article className="mbti-run-card" key={run.id}>
                  <strong>
                    #{run.id} {run.action}
                  </strong>
                  <p>{run.outcome}</p>
                  <ol className="mbti-trace">
                    {run.trace.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ol>
                </article>
              ))}
            </div>
          </div>

          <div>
            <h3>分支细节</h3>
            <p className="mbti-section-note">
              这里不是最终结论，而是某一次模拟如何走到该行为的观察样本。
            </p>
            <div className="mbti-run-selector">
              {activeReport.runs.slice(0, 12).map((run) => (
                <button
                  className="mbti-run-select"
                  data-active={run.id === selectedRun?.id}
                  key={run.id}
                  onClick={() => setSelectedRunId(run.id)}
                  type="button"
                >
                  #{run.id} {run.action}
                </button>
              ))}
            </div>
            {selectedRun && <RunDetail run={selectedRun} />}
          </div>
            </>
          )}
        </section>
        )}

        {activeStep === 'history' && (
        <section className="mbti-panel mt-5">
          <h2>4. 历史记录</h2>
          <p className="mbti-section-note">
            每次启动模拟都会保存问题和当时的报告摘要。点击一条可以回到那次结果。
          </p>
          {history.length === 0 && <p className="mbti-empty">还没有历史实验。</p>}
          <div className="mbti-history-list">
            {history.map((entry) => (
              <button
                className="mbti-history-item"
                key={entry.id}
                onClick={() => restoreHistory(entry)}
                type="button"
              >
                <strong>{entry.question}</strong>
                <span>
                  {entry.profileCode} · {entry.scaleLabel} ·{' '}
                  {new Date(entry.createdAt).toLocaleString()}
                </span>
                <span>
                  最高倾向：{entry.report.distribution[0]?.action ?? '暂无'}{' '}
                  {entry.report.distribution[0]?.percent ?? 0}%
                </span>
              </button>
            ))}
          </div>
        </section>
        )}
      </div>
    </main>
  );
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

function RoleEditor({
  value,
  onChange,
}: {
  value: RolePreset;
  onChange: (patch: Partial<RolePreset>) => void;
}) {
  return (
    <div className="mbti-role-editor">
      <label className="mbti-checkbox">
        <input
          checked={value.enabled}
          type="checkbox"
          onChange={(event) => onChange({ enabled: event.target.checked })}
        />
        启用「{value.label}」预设
      </label>
      <p className="mbti-role-reason">{value.reason}</p>
      <div className="mbti-role-grid">
        <label>
          角色名称
          <input
            disabled={!value.enabled}
            value={value.label}
            onChange={(event) => onChange({ label: event.target.value })}
          />
        </label>
        <label>
          MBTI
          <input
            disabled={!value.enabled}
            maxLength={4}
            value={value.mbtiCode}
            onChange={(event) => onChange({ mbtiCode: event.target.value.toUpperCase() })}
          />
        </label>
      </div>
      <label>
        性格特征
        <textarea
          disabled={!value.enabled}
          value={value.traits}
          onChange={(event) => onChange({ traits: event.target.value })}
          placeholder="例如：回避冲突、表达慢、很在意边界、容易安抚别人"
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

function ReportBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3>{title}</h3>
      <ul className="mbti-list">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function RunDetail({ run }: { run: SimulationRun }) {
  return (
    <div className="mbti-run-detail">
      <DetailColumn title="聊天片段">
        {(run.chat ?? []).map((message, index) => (
          <p key={`${message.speaker}-${index}`}>
            <strong>{message.speaker}：</strong>
            {message.text}
          </p>
        ))}
      </DetailColumn>
      <DetailColumn title="事件记录">
        <ol>
          {(run.events ?? run.trace ?? []).map((event) => (
            <li key={event}>{event}</li>
          ))}
        </ol>
      </DetailColumn>
      <DetailColumn title="内心独白">
        {(run.innerThoughts ?? []).map((thought) => (
          <p key={thought}>{thought}</p>
        ))}
      </DetailColumn>
    </div>
  );
}

function DetailColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="mbti-detail-column">
      <h4>{title}</h4>
      {children}
    </article>
  );
}
