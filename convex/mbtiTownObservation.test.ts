import { buildTownActivityStream, selectTownReflectionCandidate } from './mbtiTownObservation';

describe('MBTI town observation activity stream', () => {
  test('turns autonomy memories into resident activity items', () => {
    const stream = buildTownActivityStream({
      memories: [
        {
          _id: 'memory-autonomy' as any,
          kind: 'conflict',
          title: '自主互动：乔南和宋迟重新碰到旧分歧',
          summary: '乔南和宋迟在小镇日常里自然产生一次互动。',
          residentKeys: ['qiao', 'song'],
          sourceKind: 'autonomy_tick',
          sourceReason: 'autonomous_town_tick',
          locationKey: 'square',
          salience: 61,
          updatedAt: 2_000,
        },
        {
          _id: 'memory-seed' as any,
          kind: 'routine',
          title: '小镇初始设定',
          summary: '这是初始化记忆。',
          residentKeys: ['lin'],
          sourceKind: 'seed',
          salience: 40,
          updatedAt: 1_000,
        },
      ],
      residentNameByKey: new Map([
        ['qiao', '乔南'],
        ['song', '宋迟'],
      ]),
    });

    expect(stream).toHaveLength(1);
    expect(stream[0]).toMatchObject({
      kind: 'autonomy_tick',
      title: '自主互动：乔南和宋迟重新碰到旧分歧',
      residentNames: ['乔南', '宋迟'],
      locationKey: 'square',
      salience: 61,
      occurredAt: 2_000,
    });
  });

  test('selects repeated autonomy memories as a reflection candidate', () => {
    const candidate = selectTownReflectionCandidate({
      memories: [
        {
          _id: 'memory-1' as any,
          title: '自主互动：乔南和宋迟重新碰到旧分歧',
          summary: '乔南又提到宋迟不靠谱。',
          residentKeys: ['qiao', 'song'],
          sourceKind: 'autonomy_tick',
          salience: 62,
          updatedAt: 1_000,
        },
        {
          _id: 'memory-2' as any,
          title: '自主互动：乔南和宋迟重新碰到旧分歧',
          summary: '宋迟开始回避乔南的追问。',
          residentKeys: ['song', 'qiao'],
          sourceKind: 'autonomy_tick',
          salience: 64,
          updatedAt: 2_000,
        },
        {
          _id: 'memory-other' as any,
          title: '自主互动：林遥和温理延续日常往来',
          summary: '两人只是闲聊。',
          residentKeys: ['lin', 'wen'],
          sourceKind: 'autonomy_tick',
          salience: 50,
          updatedAt: 3_000,
        },
      ],
      existingReflectionKeys: new Set(),
      residentNameByKey: new Map([
        ['qiao', '乔南'],
        ['song', '宋迟'],
      ]),
    });

    expect(candidate).toMatchObject({
      residentKeys: ['qiao', 'song'],
      title: '反思：乔南和宋迟的关系模式正在重复',
    });
    expect(candidate?.summary).toContain('乔南又提到宋迟不靠谱');
    expect(candidate?.sourceMemoryIds).toEqual(['memory-1', 'memory-2']);
  });
});
