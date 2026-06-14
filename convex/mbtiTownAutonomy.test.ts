import {
  compactAutonomyContext,
  fastForwardCalendarFromLatest,
  simulatedTownNowFromLatest,
  townCalendarFromElapsed,
  selectAutonomyInteraction,
  selectRunnableConversationRequest,
} from './mbtiTownAutonomy';

describe('MBTI town autonomy selection', () => {
  test('maps elapsed wall time onto an explicit simulated town day and phase', () => {
    expect(townCalendarFromElapsed(0)).toEqual({
      townDay: 1,
      phase: 'morning',
      dayProgress: 0,
    });
    expect(townCalendarFromElapsed(5 * 60 * 1000)).toMatchObject({
      townDay: 1,
      phase: 'afternoon',
    });
    expect(townCalendarFromElapsed(15 * 60 * 1000)).toMatchObject({
      townDay: 2,
      phase: 'morning',
    });
  });

  test('fast-forward calendar advances from the latest persisted timeline node', () => {
    expect(
      fastForwardCalendarFromLatest({
        latestTimeline: { townDay: 12, dayProgress: 0.62 },
        townCreatedAt: 1_000_000,
        advanceDays: 7,
        targetPhase: 'morning',
      }),
    ).toEqual({
      townDay: 19,
      phase: 'morning',
      dayProgress: 0,
      simulatedNow: 1_000_000 + 18 * 15 * 60 * 1000,
    });
  });

  test('autonomy clock continues from a fast-forwarded latest timeline node', () => {
    const now = 2_000_000;
    const townCreatedAt = now - 60 * 60 * 1000;
    const simulatedNow = simulatedTownNowFromLatest({
      latestTimeline: {
        createdAt: now - 5 * 60 * 1000,
        townDay: 200,
        dayProgress: 0,
      },
      now,
      townCreatedAt,
    });

    expect(townCalendarFromElapsed(simulatedNow - townCreatedAt)).toMatchObject({
      townDay: 200,
      phase: 'afternoon',
    });
  });

  test('autonomy interaction produces a dated life or work timeline entry', () => {
    const selection = selectAutonomyInteraction({
      now: 1_000_000,
      townCreatedAt: 1_000_000 - 16 * 60 * 1000,
      residents: [
        {
          _id: 'resident-lin' as any,
          key: 'lin',
          name: '林遥',
          role: '咖啡馆店主',
          defaultLocationKey: 'cafe',
          scheduleTags: ['morning', 'cafe'],
        },
        {
          _id: 'resident-wen' as any,
          key: 'wen',
          name: '温理',
          role: '会计',
          defaultLocationKey: 'office',
          scheduleTags: ['office'],
        },
      ],
      relationships: [
        {
          _id: 'rel-daily' as any,
          residentAKey: 'lin',
          residentBKey: 'wen',
          familiarity: 45,
          trust: 65,
          warmth: 66,
          tension: 12,
          influence: 42,
          summary: '两人能稳定合作。',
        },
      ],
      memories: [],
    });

    expect(selection?.timelineEntry).toMatchObject({
      townDay: 2,
      phase: 'morning',
      scope: 'resident_life',
      storyline: 'routine',
      source: 'autonomy_tick',
      residentKeys: ['lin', 'wen'],
    });
    expect(selection?.timelineEntry.summary).toContain('第 2 天');
  });

  test('compacts repeated autonomy traces before reusing them as resident context', () => {
    const noisy = [
      '梁策和赵衡通过小镇事务有过几次交集。',
      '最近一次自主互动让紧张略微浮现：自主互动：梁策和赵衡重新碰到旧分歧',
      '最近一次自主互动让紧张略微浮现：自主互动：梁策和赵衡重新碰到旧分歧',
      '梁策（律师助理）和赵衡（前公司主管）在小镇日常里自然产生一次互动。',
      '梁策（律师助理）和赵衡（前公司主管）在小镇日常里自然产生一次互动。',
      '互动让原有紧张略微浮出水面，后续更可能影响相关场景。',
      '互动让原有紧张略微浮出水面，后续更可能影响相关场景。',
    ].join(' ');

    const compacted = compactAutonomyContext(noisy, 120);

    expect(compacted.length).toBeLessThanOrEqual(120);
    expect((compacted.match(/自主互动：梁策和赵衡重新碰到旧分歧/g) ?? [])).toHaveLength(0);
    expect((compacted.match(/在小镇日常里自然产生一次互动/g) ?? [])).toHaveLength(0);
    expect(compacted).toContain('梁策和赵衡');
  });

  test('prioritizes tense resident relationships with shared memory', () => {
    const selection = selectAutonomyInteraction({
      now: 1_000_000,
      residents: [
        {
          _id: 'resident-lin' as any,
          key: 'lin',
          name: '林遥',
          role: '咖啡馆店主',
          defaultLocationKey: 'cafe',
          scheduleTags: ['morning', 'cafe'],
        },
        {
          _id: 'resident-xia' as any,
          key: 'xia',
          name: '夏越',
          role: '大学生',
          defaultLocationKey: 'cafe',
          scheduleTags: ['evening', 'cafe'],
        },
        {
          _id: 'resident-wen' as any,
          key: 'wen',
          name: '温理',
          role: '会计',
          defaultLocationKey: 'office',
          scheduleTags: ['office'],
        },
      ],
      relationships: [
        {
          _id: 'rel-calm' as any,
          residentAKey: 'lin',
          residentBKey: 'wen',
          familiarity: 40,
          trust: 70,
          warmth: 72,
          tension: 8,
          influence: 40,
          summary: '两人能稳定合作。',
        },
        {
          _id: 'rel-tense' as any,
          residentAKey: 'lin',
          residentBKey: 'xia',
          familiarity: 55,
          trust: 58,
          warmth: 35,
          tension: 64,
          influence: 52,
          summary: '夏越保护朋友时容易太急，林遥常提醒她先问清楚。',
        },
      ],
      memories: [
        {
          residentKeys: ['lin', 'xia'],
          salience: 80,
          summary: '夏越曾因为太急着保护朋友而激化矛盾，林遥提醒她先问对方想不想听建议。',
          updatedAt: 900_000,
          status: 'active',
        },
      ],
    });

    expect(selection?.relationshipId).toBe('rel-tense');
    expect(selection?.kind).toBe('conflict');
    expect(selection?.residentAKey).toBe('lin');
    expect(selection?.residentBKey).toBe('xia');
    expect(selection?.summary).toContain('旧记忆');
    expect(selection?.familiarityDelta).toBe(1);
    expect(selection?.trustDelta).toBeLessThan(0);
    expect(selection?.tensionDelta).toBeGreaterThan(0);
    expect(selection?.influenceDelta).toBeGreaterThanOrEqual(0);
    expect(selection?.residentPlans).toHaveLength(2);
    expect(selection?.residentPlans.some((plan) => plan.seekResidentKeys.includes('xia'))).toBe(true);
    expect(selection?.residentPlans.some((plan) => plan.avoidResidentKeys.includes('lin'))).toBe(true);
    expect(selection?.conversationRequest).toMatchObject({
      residentKeys: ['lin', 'xia'],
      locationKey: 'cafe',
      priority: 'high',
    });
  });

  test('uses autonomy-created memory as next tick context', () => {
    const firstSelection = selectAutonomyInteraction({
      now: 1_000_000,
      residents: [
        {
          _id: 'resident-lin' as any,
          key: 'lin',
          name: '林遥',
          role: '咖啡馆店主',
          defaultLocationKey: 'cafe',
          scheduleTags: ['morning', 'cafe'],
        },
        {
          _id: 'resident-wen' as any,
          key: 'wen',
          name: '温理',
          role: '会计',
          defaultLocationKey: 'office',
          scheduleTags: ['office'],
        },
      ],
      relationships: [
        {
          _id: 'rel-daily' as any,
          residentAKey: 'lin',
          residentBKey: 'wen',
          familiarity: 45,
          trust: 65,
          warmth: 66,
          tension: 12,
          influence: 42,
          summary: '两人能稳定合作。',
        },
      ],
      memories: [],
    });
    const secondSelection = selectAutonomyInteraction({
      now: 1_100_000,
      residents: [
        {
          _id: 'resident-lin' as any,
          key: 'lin',
          name: '林遥',
          role: '咖啡馆店主',
          defaultLocationKey: 'cafe',
          scheduleTags: ['morning', 'cafe'],
        },
        {
          _id: 'resident-wen' as any,
          key: 'wen',
          name: '温理',
          role: '会计',
          defaultLocationKey: 'office',
          scheduleTags: ['office'],
        },
      ],
      relationships: [
        {
          _id: 'rel-daily' as any,
          residentAKey: 'lin',
          residentBKey: 'wen',
          familiarity: 46,
          trust: 66,
          warmth: 67,
          tension: 11,
          influence: 42,
          summary: '两人能稳定合作。',
          lastInteractionAt: 1_000_000,
        },
      ],
      memories: [
        {
          residentKeys: ['lin', 'wen'],
          salience: 58,
          summary: firstSelection?.summary ?? '',
          updatedAt: 1_000_000,
          status: 'active',
        },
      ],
    });

    expect(firstSelection?.kind).toBe('routine');
    expect(secondSelection?.relationshipId).toBe('rel-daily');
    expect(secondSelection?.summary).toContain('旧记忆');
    expect(secondSelection?.residentPlans.some((plan) => plan.topicSeed.includes('自然产生一次互动'))).toBe(true);
  });

  test('uses a shared real location tag instead of a generic time tag', () => {
    const selection = selectAutonomyInteraction({
      now: 1_000_000,
      residents: [
        {
          _id: 'resident-qiao' as any,
          key: 'qiao',
          name: '乔南',
          role: '健身教练',
          defaultLocationKey: 'square',
          scheduleTags: ['morning', 'clinic'],
        },
        {
          _id: 'resident-ning' as any,
          key: 'ning',
          name: '宁素',
          role: '心理咨询师',
          defaultLocationKey: 'office',
          scheduleTags: ['morning', 'clinic'],
        },
      ],
      relationships: [
        {
          _id: 'rel-schedule' as any,
          residentAKey: 'qiao',
          residentBKey: 'ning',
          familiarity: 45,
          trust: 58,
          warmth: 60,
          tension: 14,
          influence: 38,
          summary: '两人偶尔会在咨询室附近交换近况。',
        },
      ],
      memories: [],
      locations: [
        { key: 'square' },
        { key: 'office' },
        { key: 'clinic' },
      ],
    });

    expect(selection?.locationKey).toBe('clinic');
    expect(selection?.residentPlans.every((plan) => plan.targetLocationKey === 'clinic')).toBe(true);
  });

  test('selects the highest priority pending conversation request whose residents are in the active world', () => {
    const runnable = selectRunnableConversationRequest({
      requests: [
        {
          _id: 'request-low' as any,
          createdAt: 1_000,
          priority: 'medium',
          residentNames: ['林遥', '温理'],
        },
        {
          _id: 'request-high' as any,
          createdAt: 2_000,
          priority: 'high',
          residentNames: ['乔南', '宋迟'],
        },
        {
          _id: 'request-missing' as any,
          createdAt: 500,
          priority: 'high',
          residentNames: ['不存在甲', '不存在乙'],
        },
      ],
      playerNames: ['我', '乔南', '宋迟', '林遥', '温理'],
    });

    expect(runnable?._id).toBe('request-high');
    expect(runnable?.participantNames).toEqual(['乔南', '宋迟']);
  });
});
