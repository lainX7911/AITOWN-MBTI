import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mergeTimelineProbeLLMDraft } from './mbtiNode';

const repoRoot = process.cwd();

describe('MBTI LLM action runtime boundaries', () => {
  test('keeps external LLM calls in a Node runtime action module', () => {
    const nodeModule = readFileSync(join(repoRoot, 'convex/mbtiNode.ts'), 'utf8');

    expect(nodeModule.slice(0, 200)).toContain("'use node'");
    expect(nodeModule).toContain('chatCompletion');
  });

  test('keeps public mbti action wrappers free of direct LLM fetch calls', () => {
    const mbtiModule = readFileSync(join(repoRoot, 'convex/mbti.ts'), 'utf8');
    const publicActionRegion = [
      'export const assessMbtiEvent = action',
      'export const refreshExperimentReport = action',
      'export const debugLLM = action',
    ];

    for (const marker of publicActionRegion) {
      const start = mbtiModule.indexOf(marker);
      expect(start).toBeGreaterThanOrEqual(0);
      const wrapperEnd = mbtiModule.indexOf('\n});', start + marker.length);
      const body = mbtiModule.slice(start, wrapperEnd > start ? wrapperEnd : undefined);
      expect(body).not.toContain('chatCompletion(');
      expect(body).not.toContain('getLLMConfig(');
    }
  });
});

describe('timeline probe LLM drafts', () => {
  test('merges a single generated event onto the deterministic timeline schedule', () => {
    const merged = mergeTimelineProbeLLMDraft(
      {
        tickOffset: 6,
        scheduledDay: 10,
        scheduledPhase: 'afternoon',
        timelineTriggerReason: 'town_life_generated_probe',
        kind: 'pressure',
        title: '时间线追问：稳定性',
        description: 'fallback',
        involvedRoles: ['self', '林遥'],
        testedVariable: '稳定性',
        expectedSignals: ['坚持原选择'],
        responseOptions: ['A', 'B', 'C'],
        biasDirection: 'balanced',
        probeOrigin: 'adaptive',
        adaptiveReason: 'fallback reason',
      },
      JSON.stringify({
        title: '第十天的薪资谈判',
        concreteEvent: '新公司给出更高工资，但要求我两周内入职。',
        testedVariable: '薪资与时间窗口',
        informationGoal: '看用户是否会为了涨薪压缩交接和休息时间。',
        responseOptions: ['我接受并压缩交接', '我要求延后入职', '我放弃这个机会'],
        expectedSignals: ['愿意承担时间压力', '坚持边界', '放弃短期收益'],
      }),
    );

    expect(merged.scheduledDay).toBe(10);
    expect(merged.scheduledPhase).toBe('afternoon');
    expect(merged.title).toBe('第十天的薪资谈判');
    expect(merged.description).toContain('新公司给出更高工资');
    expect(merged.responseOptions).toEqual(['我接受并压缩交接', '我要求延后入职', '我放弃这个机会']);
    expect(merged.timelineTriggerReason).toBe('town_life_generated_probe');
  });
});
