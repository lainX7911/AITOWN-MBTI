/**
 * Network-heavy MBTI actions run in Convex's Node runtime. The local V8 runtime
 * can fail to reach Tailscale-hosted OpenAI-compatible services on macOS.
 */
'use node';

import { v } from 'convex/values';
import { makeFunctionReference } from 'convex/server';
import { action } from './_generated/server';
import { chatCompletion, getLLMConfig } from './util/llm';
import {
  buildEventAssessmentPrompt,
  buildReportFromEvidence,
  buildTimelineGeneratedProbeDraft,
  compactForPrompt,
  parseEventAssessmentJson,
} from './mbti';

const collectEventAssessmentPayloadRef = makeFunctionReference<'query'>('mbti:collectEventAssessmentPayload') as any;
const upsertEventAssessmentRef = makeFunctionReference<'mutation'>('mbti:upsertEventAssessment') as any;
const collectExperimentEvidenceRef = makeFunctionReference<'query'>('mbti:collectExperimentEvidence') as any;
const collectTimelineProbeGenerationPayloadRef = makeFunctionReference<'query'>('mbti:collectTimelineProbeGenerationPayload') as any;
const insertTimelineGeneratedProbeRef = makeFunctionReference<'mutation'>('mbti:insertTimelineGeneratedProbe') as any;

export const assessMbtiEventNode = action({
  args: {
    experimentId: v.id('mbtiExperiments'),
    eventId: v.id('mbtiEvents'),
  },
  handler: async (ctx, args) => {
    const payload = await ctx.runQuery(collectEventAssessmentPayloadRef, args) as any;
    if (!payload || payload.evidenceCount === 0) {
      return null;
    }
    if (
      payload.existingAssessment?.status === 'succeeded' &&
      payload.existingAssessment.evidenceSignature === payload.evidenceSignature
    ) {
      return payload.existingAssessment;
    }
    if (
      payload.existingAssessment?.status === 'running' &&
      payload.existingAssessment.evidenceSignature === payload.evidenceSignature &&
      Date.now() - payload.existingAssessment.updatedAt < 90_000
    ) {
      return payload.existingAssessment;
    }

    await ctx.runMutation(upsertEventAssessmentRef, {
      experimentId: args.experimentId,
      eventId: args.eventId,
      worldId: payload.event.worldId,
      status: 'running',
      evidenceCount: payload.evidenceCount,
      evidenceSignature: payload.evidenceSignature,
    });

    try {
      const config = getLLMConfig();
      const { content } = await chatCompletion({
        messages: [
          {
            role: 'system',
            content: [
              '你是人格小镇实验的事件评估员。',
              '你只评估“当前这一个事件”，不能引用其他事件、全局问题里没有落到当前事件的内容，也不能套模板。',
              '必须用白话中文，结论要短、具体、像给真人看的观察反馈。',
              '如果证据不足，就明确说还不能判断，不要编。',
              '只输出 JSON：{"summary":"一句结论，18字以内","inference":"2-3句依据说明","next":"下一步还要看什么，1句","evidenceUsed":["引用的证据短句1","引用的证据短句2"]}',
            ].join('\n'),
          },
          {
            role: 'user',
            content: buildEventAssessmentPrompt(payload),
          },
        ],
        max_tokens: 420,
        temperature: 0.15,
        timeoutMs: 120_000,
      });
      const parsed = parseEventAssessmentJson(content);
      await ctx.runMutation(upsertEventAssessmentRef, {
        experimentId: args.experimentId,
        eventId: args.eventId,
        worldId: payload.event.worldId,
        status: 'succeeded',
        evidenceCount: payload.evidenceCount,
        evidenceSignature: payload.evidenceSignature,
        result: {
          ...parsed,
          model: config.chatModel,
        },
      });
      return parsed;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(upsertEventAssessmentRef, {
        experimentId: args.experimentId,
        eventId: args.eventId,
        worldId: payload.event.worldId,
        status: 'failed',
        evidenceCount: payload.evidenceCount,
        evidenceSignature: payload.evidenceSignature,
        result: {
          error: compactForPrompt(message, 220),
        },
      });
      throw error;
    }
  },
});

export const buildExperimentReportNode = action({
  args: {
    experimentId: v.id('mbtiExperiments'),
  },
  handler: async (ctx, args) => {
    const evidence = await ctx.runQuery(collectExperimentEvidenceRef, args) as any;
    if (!evidence) {
      return null;
    }
    const report = await buildReportFromEvidence(evidence);
    return {
      report,
      status: evidence.experiment.status,
    };
  },
});

export const debugLLMNode = action({
  args: {},
  handler: async () => {
    const config = getLLMConfig();
    const started = Date.now();
    const { content, retries, ms } = await chatCompletion({
      messages: [{ role: 'user', content: '请只回复：ok' }],
      max_tokens: 8,
      temperature: 0,
    });
    return {
      provider: config.provider,
      url: config.url,
      chatModel: config.chatModel,
      embeddingModel: config.embeddingModel,
      hasApiKey: Boolean(config.apiKey),
      content,
      retries,
      ms,
      totalMs: Date.now() - started,
    };
  },
});

export const ensureNextTimelineProbeNode = action({
  args: {
    experimentId: v.id('mbtiExperiments'),
    townDay: v.number(),
    phase: v.union(
      v.literal('morning'),
      v.literal('afternoon'),
      v.literal('evening'),
      v.literal('night'),
    ),
    allowBeyondTarget: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const payload = await ctx.runQuery(collectTimelineProbeGenerationPayloadRef, args) as any;
    if (!payload?.shouldCreate) {
      return { created: false, reason: 'not-needed' };
    }
    const fallbackDraft = buildTimelineGeneratedProbeDraft({
      question: payload.experiment.question,
      questionFocus: payload.experiment.questionFocus,
      decisionState: payload.experiment.decisionState,
      existingEventCount: payload.events.length,
      existingTestedVariables: payload.events
        .map((event: { testedVariable?: string }) => event.testedVariable)
        .filter((variable: unknown): variable is string => typeof variable === 'string' && variable.length > 0),
      townDay: payload.townDay,
      phase: payload.phase,
      locationKey: payload.sceneRequest.selectedLocationKey,
      residentNames: payload.residentNames,
      residentLifeStates: payload.residentLifeStates,
    });
    let draft = fallbackDraft;
    try {
      const { content } = await chatCompletion({
        messages: [
          {
            role: 'system',
            content: [
              '你是 MBTI 小镇的动态事件设计器。',
              '现在不是一次性生成整套计划，而是在小镇时间线推进到当前节点后，只生成下一件事件。',
              '事件必须来自用户原问题、当前小镇生活线和已有证据缺口；不要生成设施任务清单。',
              '如果提供了居民既有状态，事件必须借用这些目标、压力或近况作为居民介入理由；不能凭空改写居民职业、家庭或经济状态。',
              '只输出 JSON：{"title":"短标题","concreteEvent":"具体发生的一件事","testedVariable":"这件事验证什么变量","informationGoal":"想获得什么信息","responseOptions":["三个互斥选项"],"expectedSignals":["3-4个可观察信号"]}',
            ].join('\n'),
          },
          {
            role: 'user',
            content: buildTimelineProbePrompt(payload, fallbackDraft),
          },
        ],
        max_tokens: 520,
        temperature: 0.25,
        timeoutMs: 120_000,
      });
      draft = mergeTimelineProbeLLMDraft(fallbackDraft, content);
    } catch (error) {
      console.warn('Timeline probe LLM generation failed, using deterministic draft', error);
    }
    const eventId = await ctx.runMutation(insertTimelineGeneratedProbeRef, {
      experimentId: args.experimentId,
      draft,
      allowBeyondTarget: args.allowBeyondTarget,
    });
    return { created: Boolean(eventId), eventId };
  },
});

function buildTimelineProbePrompt(payload: any, fallbackDraft: ReturnType<typeof buildTimelineGeneratedProbeDraft>) {
  const recentTimeline = (payload.timelineEvents ?? [])
    .map((event: any) =>
      `第${event.townDay}天${event.phase}｜${event.scope}｜${event.title}：${event.summary}`,
    )
    .join('\n') || '暂无小镇生活时间线。';
  const existingEvents = (payload.events ?? [])
    .map((event: any) => `- ${event.title}｜${event.testedVariable ?? '未写变量'}｜${event.status}`)
    .slice(-8)
    .join('\n') || '暂无已发生提问事件。';
  const residentLifeStates = (payload.residentLifeStates ?? [])
    .map((resident: any) => {
      const scores = [
        typeof resident.economy === 'number' ? `经济${Math.round(resident.economy)}` : '',
        typeof resident.career === 'number' ? `事业${Math.round(resident.career)}` : '',
        typeof resident.social === 'number' ? `社交${Math.round(resident.social)}` : '',
        typeof resident.health === 'number' ? `健康${Math.round(resident.health)}` : '',
        typeof resident.stress === 'number' ? `压力${Math.round(resident.stress)}` : '',
      ].filter(Boolean).join('/');
      return [
        `${resident.name}｜${resident.role}`,
        resident.longTermGoal ? `长期目标：${resident.longTermGoal}` : '',
        resident.currentPressure ? `当前压力：${resident.currentPressure}` : '',
        resident.currentIntent ? `短期意图：${resident.currentIntent}` : '',
        resident.lastImpactReason ? `最近变化：${resident.lastImpactReason}` : '',
        scores,
      ].filter(Boolean).join('；');
    })
    .join('\n') || '暂无居民目标/压力状态。';
  return [
    `用户问题：${payload.experiment.question}`,
    `当前小镇时间：第 ${payload.townDay} 天，${payload.phase}`,
    `地点：${payload.sceneRequest.selectedLocationKey ?? fallbackDraft.locationKey ?? 'town'}`,
    `可参与居民：${(payload.residentNames ?? []).join('、') || '当前场景居民'}`,
    '',
    '居民既有目标/压力/状态：',
    residentLifeStates,
    '',
    `本轮观察目标：${payload.experiment.questionFocus?.observationGoal ?? '验证用户问题里的真实取舍'}`,
    `关键未知：${payload.experiment.questionFocus?.decisionStructure?.unknowns?.join('；') ?? '未写明'}`,
    `分析维度：${payload.experiment.questionFocus?.analysisDimensions?.join('；') ?? '未写明'}`,
    '',
    '最近小镇生活时间线：',
    recentTimeline,
    '',
    '已有提问事件：',
    existingEvents,
    '',
    `请只生成下一件事件，默认排期保持第 ${fallbackDraft.scheduledDay} 天 ${fallbackDraft.scheduledPhase}，不要一次性生成多件。`,
  ].join('\n');
}

export function mergeTimelineProbeLLMDraft<T extends {
  title: string;
  description: string;
  testedVariable?: string;
  informationGoal?: string;
  expectedSignals?: string[];
  responseOptions?: string[];
  adaptiveReason?: string;
}>(fallbackDraft: T, content: string): T {
  const jsonText = content.trim().match(/\{[\s\S]*\}/)?.[0] ?? content.trim();
  const parsed = JSON.parse(jsonText) as {
    title?: unknown;
    concreteEvent?: unknown;
    testedVariable?: unknown;
    informationGoal?: unknown;
    responseOptions?: unknown;
    expectedSignals?: unknown;
  };
  const title = typeof parsed.title === 'string' && parsed.title.trim()
    ? compactForPrompt(parsed.title.trim(), 34)
    : fallbackDraft.title;
  const concreteEvent = typeof parsed.concreteEvent === 'string' && parsed.concreteEvent.trim()
    ? compactForPrompt(parsed.concreteEvent.trim(), 180)
    : undefined;
  const testedVariable = typeof parsed.testedVariable === 'string' && parsed.testedVariable.trim()
    ? compactForPrompt(parsed.testedVariable.trim(), 60)
    : fallbackDraft.testedVariable;
  const informationGoal = typeof parsed.informationGoal === 'string' && parsed.informationGoal.trim()
    ? compactForPrompt(parsed.informationGoal.trim(), 120)
    : fallbackDraft.informationGoal;
  const responseOptions = Array.isArray(parsed.responseOptions)
    ? parsed.responseOptions
        .filter((option): option is string => typeof option === 'string' && option.trim().length > 0)
        .map((option) => compactForPrompt(option.trim(), 42))
        .slice(0, 4)
    : [];
  const expectedSignals = Array.isArray(parsed.expectedSignals)
    ? parsed.expectedSignals
        .filter((signal): signal is string => typeof signal === 'string' && signal.trim().length > 0)
        .map((signal) => compactForPrompt(signal.trim(), 50))
        .slice(0, 4)
    : [];
  return {
    ...fallbackDraft,
    title,
    description: concreteEvent
      ? fallbackDraft.description.includes('具体事情：')
        ? fallbackDraft.description.replace(/具体事情：[^。]+。?/, `具体事情：${concreteEvent}。`)
        : `${fallbackDraft.description} 具体事情：${concreteEvent}。`
      : fallbackDraft.description,
    testedVariable,
    informationGoal,
    expectedSignals: expectedSignals.length >= 2 ? expectedSignals : fallbackDraft.expectedSignals,
    responseOptions: responseOptions.length >= 3 ? responseOptions : fallbackDraft.responseOptions,
    adaptiveReason: informationGoal ?? fallbackDraft.adaptiveReason,
  };
}
