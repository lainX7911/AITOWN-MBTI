import { useEffect, useMemo, useState } from 'react';
import {
  buildProfile,
  customScenario,
  defaultQuestion,
  defaultRolePresets,
  defaultAnswers,
  runSimulation,
} from './mbtiModel';
import { RolePreset, SimulationReport, TestAnswer } from './types';
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

type StoredExperimentState = {
  answers?: TestAnswer[];
  question?: string;
  activeQuestion?: string;
  rolePresets?: Record<'partner' | 'friend', RolePreset>;
  experimentScaleId?: string;
  activeReport?: SimulationReport;
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

function defaultReport() {
  return runSimulation(
    buildProfile(defaultAnswers),
    customScenario(defaultQuestion),
    experimentScales[1].runCount,
    defaultRolePresets,
  );
}

export default function MbtiExperiment() {
  const [storedState] = useState(readStoredState);
  const [answers, setAnswers] = useState<TestAnswer[]>(storedState.answers ?? defaultAnswers);
  const [question, setQuestion] = useState(storedState.question ?? defaultQuestion);
  const [activeQuestion, setActiveQuestion] = useState(
    storedState.activeQuestion ?? storedState.question ?? defaultQuestion,
  );
  const [rolePresets, setRolePresets] =
    useState<Record<'partner' | 'friend', RolePreset>>(
      storedState.rolePresets ?? defaultRolePresets,
    );
  const [experimentScale, setExperimentScale] = useState<ExperimentScale>(
    experimentScales.find((scale) => scale.id === storedState.experimentScaleId) ??
      experimentScales[1],
  );
  const [activeReport, setActiveReport] = useState<SimulationReport>(
    storedState.activeReport ?? defaultReport(),
  );
  const [history, setHistory] = useState<HistoryEntry[]>(storedState.history ?? []);
  const profile = useMemo(() => buildProfile(answers), [answers]);

  useEffect(() => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        answers,
        question,
        activeQuestion,
        rolePresets,
        experimentScaleId: experimentScale.id,
        activeReport,
        history,
      } satisfies StoredExperimentState),
    );
  }, [activeQuestion, activeReport, answers, experimentScale.id, history, question, rolePresets]);

  function updateAnswer(index: number, value: number) {
    setAnswers((current) =>
      current.map((answer, answerIndex) =>
        answerIndex === index ? { ...answer, value } : answer,
      ),
    );
  }

  function updateRole(role: 'partner' | 'friend', patch: Partial<RolePreset>) {
    setRolePresets((current) => ({
      ...current,
      [role]: { ...current[role], ...patch },
    }));
  }

  function startSimulation() {
    const nextQuestion = question.trim() || defaultQuestion;
    const nextReport = runSimulation(
      profile,
      customScenario(nextQuestion),
      experimentScale.runCount,
      rolePresets,
    );
    const nextHistoryEntry: HistoryEntry = {
      id: `${Date.now()}`,
      createdAt: Date.now(),
      question: nextQuestion,
      profileCode: profile.code,
      scaleLabel: experimentScale.label,
      report: nextReport,
    };
    setActiveQuestion(nextQuestion);
    setActiveReport(nextReport);
    setHistory((current) => [nextHistoryEntry, ...current].slice(0, 12));
  }

  function restoreHistory(entry: HistoryEntry) {
    setQuestion(entry.question);
    setActiveQuestion(entry.question);
    setActiveReport(entry.report);
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

        <div className="mbti-grid">
          <section className="mbti-panel">
            <h2>1. 人格权重测试</h2>
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
          </section>

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
            <details className="mbti-role-settings">
              <summary>附件设置：预设问题里的角色属性</summary>
              <RoleEditor
                role="partner"
                title="关键对象"
                value={rolePresets.partner}
                onChange={(patch) => updateRole('partner', patch)}
              />
              <RoleEditor
                role="friend"
                title="朋友/旁观者"
                value={rolePresets.friend}
                onChange={(patch) => updateRole('friend', patch)}
              />
            </details>
            <div className="mbti-scale-picker">
              <span className="mbti-scale-title">选择实验规模</span>
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
              启动多轮模拟
            </button>
          </section>
        </div>

        <section className="mbti-panel mt-5 mbti-report">
          <h2>4. 多轮模拟报告</h2>
          <p className="mbti-section-note">
            当前问题：{activeQuestion}。本次为「{experimentScale.label}」。
          </p>
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
        </section>

        <section className="mbti-panel mt-5">
          <h2>5. 历史实验</h2>
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
      </div>
    </main>
  );
}

function RoleEditor({
  title,
  value,
  onChange,
}: {
  role: 'partner' | 'friend';
  title: string;
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
        启用{title}预设
      </label>
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
