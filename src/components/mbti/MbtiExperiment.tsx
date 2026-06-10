import { useMemo, useState } from 'react';
import {
  buildProfile,
  defaultAnswers,
  runSimulation,
  scenarioPresets,
} from './mbtiModel';
import { Scenario, TestAnswer } from './types';
import './MbtiExperiment.css';

export default function MbtiExperiment() {
  const [answers, setAnswers] = useState<TestAnswer[]>(defaultAnswers);
  const [scenario, setScenario] = useState<Scenario>(scenarioPresets[0]);
  const [question, setQuestion] = useState(scenarioPresets[0].question);
  const [runCount, setRunCount] = useState(48);
  const profile = useMemo(() => buildProfile(answers), [answers]);
  const report = useMemo(
    () => runSimulation(profile, { ...scenario, question }, runCount),
    [profile, question, runCount, scenario],
  );

  function updateAnswer(index: number, value: number) {
    setAnswers((current) =>
      current.map((answer, answerIndex) =>
        answerIndex === index ? { ...answer, value } : answer,
      ),
    );
  }

  function selectScenario(nextScenario: Scenario) {
    setScenario(nextScenario);
    setQuestion(nextScenario.question);
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
              运行 {report.runs.length} 个分支，覆盖伴侣人格和朋友人格组合。
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

            <h2 className="mt-6">3. 选择问题场景</h2>
            <div className="mbti-scenarios">
              {scenarioPresets.map((item) => (
                <button
                  className="mbti-scenario"
                  data-active={item.id === scenario.id}
                  key={item.id}
                  onClick={() => selectScenario(item)}
                  type="button"
                >
                  <strong>{item.title}</strong>
                  <p>{item.question}</p>
                </button>
              ))}
            </div>
            <textarea
              className="mbti-textarea"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              aria-label="自定义问题"
            />
            <label className="mbti-question mt-3">
              模拟分支数：{runCount}
              <input
                min={24}
                max={96}
                step={12}
                value={runCount}
                type="range"
                onChange={(event) => setRunCount(Number(event.target.value))}
              />
            </label>
          </section>
        </div>

        <section className="mbti-panel mt-5 mbti-report">
          <h2>4. 多轮模拟报告</h2>
          <div className="mbti-distribution">
            {report.distribution.map((item) => (
              <div className="mbti-distribution-row" key={item.action}>
                <strong>{item.action}</strong>
                <div className="mbti-mini-track">
                  <div className="mbti-mini-fill" style={{ width: `${item.percent}%` }} />
                </div>
                <span>{item.percent}%</span>
              </div>
            ))}
          </div>

          <ReportBlock title="稳定倾向" items={report.stableTendencies} />
          <ReportBlock title="条件触发" items={report.conditionalTriggers} />

          <div>
            <h3>反例路径</h3>
            <div className="grid gap-3 md:grid-cols-3">
              {report.counterexamples.map((run) => (
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
      </div>
    </main>
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
