import { normalizeSceneRoleSpeech, sceneRoleConversationGuard } from './conversation';

describe('scene role conversation guard', () => {
  const residentIdentity = [
    '你叫“林阿姨”，是常驻小镇里的咖啡馆老板。',
    '本轮临时社会位置：介绍信息来源；介入原因：她认识一个相亲对象。',
    '你只知道这些用户信息：用户想找能一起回老家生活的人；用户担心退休金边界。',
    '你不知道这些信息，不能假装知道：用户的完整 MBTI；用户最终会怎么选。',
    '施压/支持方式：现实提醒。允许介入范围：只能提醒见面时间和钱的边界。',
  ].join('\n');

  test('turns per-scene resident role into limited-view speaking rules', () => {
    const guard = sceneRoleConversationGuard(residentIdentity);

    expect(guard.join('\n')).toContain('不是心理咨询师');
    expect(guard.join('\n')).toContain('用户想找能一起回老家生活的人');
    expect(guard.join('\n')).toContain('用户的完整 MBTI');
    expect(guard.join('\n')).toContain('只能提醒见面时间和钱的边界');
    expect(guard.join('\n')).toContain('不要总结人格');
  });

  test('does not add scene role rules to ordinary agent identities', () => {
    expect(sceneRoleConversationGuard('你是普通居民。')).toEqual([]);
  });

  test('suppresses therapist-like omniscient lines for scene residents', () => {
    expect(normalizeSceneRoleSpeech('我观察到你的模式，本质上你需要重新理解关系。')).toBe('我先想一下。');
    expect(normalizeSceneRoleSpeech('我刚听你说周六三点见面，那钱的边界你先讲清楚。')).toContain('周六三点');
  });
});
