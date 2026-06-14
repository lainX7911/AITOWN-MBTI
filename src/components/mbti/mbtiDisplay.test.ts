import { objectModeHintForQuestion, objectSummaryForQuestion } from './mbtiDisplay';
import type { RolePreset } from './types';

describe('MBTI display helpers', () => {
  test('shows a future partner candidate for future wife questions without explicit roles', () => {
    const question = '如果一定要找一个老婆，什么样的女人最适合我？';

    expect(objectSummaryForQuestion(question, [])).toBe('意向对象（本轮候选）');
    expect(objectModeHintForQuestion(question, 'solo', [])).toContain('不代表现任伴侣');
  });

  test('keeps explicit user-provided objects when present', () => {
    const roles: RolePreset[] = [
      {
        id: 'partner-1',
        enabled: true,
        role: 'partner',
        label: '小雨',
        mapping: '问题里的女朋友',
        mbtiCode: '',
        traits: '',
        reason: '用户显式带入',
      },
    ];

    expect(objectSummaryForQuestion('我和女朋友吵架了怎么办？', roles)).toBe('小雨');
  });
});
