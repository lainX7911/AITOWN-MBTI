import {
  buildEventParticipantScope,
  buildAnswerOptions,
  compactResidentContextForProfile,
  completionRuntimePolicyForExperiment,
  buildDecisionInsights,
  buildSeededEvents,
  buildTimelineGeneratedProbeDraft,
  deterministicSeed,
  answerPositionReadiness,
  feedbackTypeFromFit,
  finalReportReadiness,
  minimumFinalReportEventCount,
  normalizeEventParticipantPlan,
  normalizeSceneEventParticipantNames,
  normalizeObservationDuration,
  plannedEventsReadyForFinalReport,
  plannedSceneEventTriggerDelays,
  locationKeyForEventScene,
  relationshipLineForSelf,
  reportCredibility,
  sanitizeEventPlanText,
  selectRunnableTimelineEvents,
  selectHardScheduledSceneEvents,
  shouldCreateTimelineGeneratedProbe,
  stagingPointForEventLocation,
  userSideEvidenceEventIds,
} from './mbti';

describe('MBTI observation duration', () => {
  test('keeps normal user runs at least thirty minutes', () => {
    expect(normalizeObservationDuration(2 * 60 * 1000, 6, '短时观察')).toBe(30 * 60 * 1000);
  });

  test('allows explicit fast acceptance runs for end-to-end simulation', () => {
    expect(normalizeObservationDuration(2 * 60 * 1000, 4, '快速验收')).toBe(2 * 60 * 1000);
  });

  test('hard-schedules only the opening event and leaves the rest as timeline candidates', () => {
    const events = Array.from({ length: 12 }, (_, index) => ({
      _id: `event-${index}`,
      createdAt: 1000 + index,
      tickOffset: index + 1,
      scheduledDay: index + 1,
      scheduledPhase: index % 2 === 0 ? 'morning' : 'evening',
      title: `计划事件 ${index + 1}`,
      description: '普通生活场景',
      testedVariable: '时间管理习惯',
      informationGoal: '观察真实反应',
      expectedSignals: [],
      residentRoles: ['我'],
      probeOrigin: 'initial',
    }));

    const result = selectHardScheduledSceneEvents(events as any);

    expect(result.scheduled.map((event) => event._id)).toEqual(['event-0']);
    expect(result.candidates.map((event) => event._id)).toEqual(events.slice(1).map((event) => event._id));
    expect(result.delayed).toHaveLength(0);
  });

  test('selects runnable question events from the current town day and phase', () => {
    const events = [
      {
        _id: 'event-day-1',
        createdAt: 1000,
        tickOffset: 1,
        scheduledDay: 1,
        scheduledPhase: 'morning',
        status: 'triggered',
        title: '已发生',
      },
      {
        _id: 'event-day-3-evening',
        createdAt: 1001,
        tickOffset: 2,
        scheduledDay: 3,
        scheduledPhase: 'evening',
        status: 'candidate',
        title: '还不到时段',
      },
      {
        _id: 'event-day-3-morning',
        createdAt: 1002,
        tickOffset: 3,
        scheduledDay: 3,
        scheduledPhase: 'morning',
        status: 'candidate',
        title: '当前可触发',
      },
      {
        _id: 'event-day-5',
        createdAt: 1003,
        tickOffset: 4,
        scheduledDay: 5,
        scheduledPhase: 'morning',
        status: 'candidate',
        title: '未来事件',
      },
    ];

    const runnable = selectRunnableTimelineEvents(events as any, {
      townDay: 3,
      phase: 'morning',
      limit: 1,
    });

    expect(runnable.map((event) => event._id)).toEqual(['event-day-3-morning']);
  });

  test('refills timeline probes only after current probes are closed', () => {
    expect(shouldCreateTimelineGeneratedProbe([
      { status: 'responded', probeOrigin: 'initial' },
      { status: 'observed', probeOrigin: 'initial' },
    ] as any)).toBe(true);

    expect(shouldCreateTimelineGeneratedProbe([
      { status: 'responded', probeOrigin: 'initial' },
      { status: 'candidate', probeOrigin: 'adaptive' },
    ] as any)).toBe(false);

    expect(shouldCreateTimelineGeneratedProbe([
      { status: 'observed', probeOrigin: 'initial' },
      { status: 'pending_user_response', probeOrigin: 'adaptive' },
    ] as any)).toBe(false);
  });

  test('keeps the normal timeline capped but allows one explicit idle follow-up probe', () => {
    const closedTargetBatch = Array.from({ length: 12 }, () => ({
      status: 'observed',
      probeOrigin: 'initial',
    }));

    expect(shouldCreateTimelineGeneratedProbe(closedTargetBatch as any, 12)).toBe(false);
    expect(shouldCreateTimelineGeneratedProbe(closedTargetBatch as any, 12, {
      allowOneBeyondTargetWhenIdle: true,
    })).toBe(true);
    expect(shouldCreateTimelineGeneratedProbe([
      ...closedTargetBatch,
      { status: 'observed', probeOrigin: 'adaptive' },
    ] as any, 12, {
      allowOneBeyondTargetWhenIdle: true,
    })).toBe(false);
  });

  test('builds the next timeline-generated probe in a future town slot', () => {
    const draft = buildTimelineGeneratedProbeDraft({
      question: '我应该换工作吗？',
      questionFocus: {
        analysisDimensions: ['稳定性', '成长性'],
        outcomeHypotheses: [
          {
            label: '继续稳定',
            plainConclusion: '更适合留在当前路径。',
            supportSignals: [],
            weakSignals: [],
          },
        ],
      } as any,
      decisionState: {
        uncertainVariables: ['稳定性'],
      } as any,
      existingEventCount: 2,
      townDay: 8,
      phase: 'afternoon',
      locationKey: 'office',
      residentNames: ['林遥'],
    });

    expect(draft.scheduledDay).toBeGreaterThan(8);
    expect(draft.timelineTriggerReason).toBe('town_life_generated_probe');
    expect(draft.title).toContain('稳定性');
    expect(draft.involvedRoles).toEqual(['self', '林遥']);
    expect(draft.description).toContain('第 8 天');
    expect(draft.description).toContain('office');
  });

  test('grounds timeline-generated probes in resident life state when available', () => {
    const draft = buildTimelineGeneratedProbeDraft({
      question: '我退休回老家可能遇到什么问题？',
      questionFocus: {
        analysisDimensions: ['社交适应', '财务边界'],
      } as any,
      existingEventCount: 3,
      townDay: 12,
      phase: 'morning',
      locationKey: 'clinic',
      residentNames: ['周眠'],
      residentLifeStates: [
        {
          name: '周眠',
          role: '夜班护士',
          longTermGoal: '在照顾他人的工作里维持专业边界和自己的生活秩序',
          currentPressure: '照护和责任不断占用精力，担心自己没有恢复时间',
          economy: 48,
          career: 56,
          social: 46,
          health: 46,
          stress: 64,
          lastImpactReason: '关系旧分歧浮现，社交稳定感下降，压力上升',
        },
      ],
    });

    expect(draft.description).toContain('居民既有状态');
    expect(draft.description).toContain('周眠');
    expect(draft.description).toContain('夜班护士');
    expect(draft.description).toContain('照护和责任');
    expect(draft.description).toContain('压力64');
  });

  test('keeps persistent town worlds running after the question run completes', () => {
    expect(completionRuntimePolicyForExperiment({ townId: 'town-1' })).toEqual({
      stopEngine: false,
      markWorldInactive: false,
    });
    expect(completionRuntimePolicyForExperiment({})).toEqual({
      stopEngine: true,
      markWorldInactive: true,
    });
  });

  test('spreads planned scene events without leaving the second slot empty', () => {
    const oneHourMs = 60 * 60 * 1000;
    const delays = plannedSceneEventTriggerDelays(oneHourMs, 12);

    expect(delays).toHaveLength(12);
    expect(delays[0]).toBe(45 * 1000);
    expect(delays[1]).toBeLessThanOrEqual(5 * 60 * 1000);
    expect(delays[1]).toBeGreaterThan(delays[0]);
    expect(delays.at(-1)).toBeLessThanOrEqual(oneHourMs - 15 * 1000);
  });

  test('detects when the current generated event batch has records', () => {
    const events = [
      { _id: 'event-1' },
      { _id: 'event-2' },
      { _id: 'event-3' },
    ];

    expect(plannedEventsReadyForFinalReport(events, [
      { mbtiEventId: 'event-1' },
      { mbtiEventId: 'event-2' },
    ])).toBe(false);
    expect(plannedEventsReadyForFinalReport(events, [
      { mbtiEventId: 'event-1' },
      { mbtiEventId: 'event-2' },
      { mbtiEventId: 'event-3' },
      { mbtiEventId: undefined },
    ])).toBe(true);
  });

  test('does not finalize just because a short current batch has records', () => {
    const events = [
      { _id: 'event-1', status: 'observed', testedVariable: '日常安排' },
      { _id: 'event-2', status: 'observed', testedVariable: '社交融入' },
    ];
    const socialEvents = [
      { mbtiEventId: 'event-1' },
      { mbtiEventId: 'event-2' },
    ];

    expect(finalReportReadiness(events as any, socialEvents as any, [])).toEqual({
      ready: false,
      reason: 'minimum-evidence-floor-not-met',
      batchRecorded: true,
      hasOpenProbe: false,
      minimumRecordedEvents: 3,
      recordedEventCount: 2,
      respondedEventCount: 0,
      testedVariableCount: 2,
    });
  });

  test('does not count event records as answer evidence without user-side evidence', () => {
    const events = [
      { _id: 'event-1', status: 'observed', testedVariable: '钱' },
      { _id: 'event-2', status: 'observed', testedVariable: '时间' },
      { _id: 'event-3', status: 'observed', testedVariable: '关系' },
    ];
    const socialEvents = [
      { mbtiEventId: 'event-1' },
      { mbtiEventId: 'event-2' },
      { mbtiEventId: 'event-3' },
    ];

    expect(finalReportReadiness(events as any, socialEvents as any, [], 3, [])).toMatchObject({
      ready: false,
      reason: 'minimum-evidence-floor-not-met',
      recordedEventCount: 0,
      testedVariableCount: 0,
    });
  });

  test('counts messages, behaviors, and direct user responses as user-side event evidence', () => {
    const ids = userSideEvidenceEventIds({
      behaviorEvents: [
        { mbtiEventId: 'event-2', playerId: 'p-self' },
        { mbtiEventId: 'event-other', playerId: 'p-other' },
      ],
      eventEvidence: [
        { kind: 'message', mbtiEventId: 'event-1', participantIds: ['p-self'] },
        { kind: 'message', mbtiEventId: 'event-other', participantIds: ['p-other'] },
        { kind: 'social_event', mbtiEventId: 'event-record-only', participantIds: ['p-self'] },
      ],
      playerNameById: {
        'p-other': '高声',
        'p-self': '我',
      },
      userResponses: [
        { mbtiEventId: 'event-3', responseStatus: 'responded' },
      ],
    });

    expect([...ids].sort()).toEqual(['event-1', 'event-2', 'event-3']);
  });

  test('does not count event correction feedback as strong answer evidence for that event', () => {
    const ids = userSideEvidenceEventIds({
      userResponses: [
        {
          mbtiEventId: 'event-wrong-fact',
          responseStatus: 'responded',
          feedbackType: 'unrealistic_event',
        },
        {
          mbtiEventId: 'event-condition-correction',
          responseStatus: 'responded',
          feedbackType: 'condition_correction',
        },
        {
          mbtiEventId: 'event-real-reaction',
          responseStatus: 'responded',
          feedbackType: 'hit_real_issue',
        },
      ],
    });

    expect([...ids]).toEqual(['event-real-reaction']);
  });

  test('does not finalize while a generated timeline event is still waiting', () => {
    const events = [
      { _id: 'event-1', status: 'responded', testedVariable: '钱' },
      { _id: 'event-2', status: 'responded', testedVariable: '时间' },
      { _id: 'event-3', status: 'observed', testedVariable: '关系' },
      { _id: 'event-4', status: 'candidate', testedVariable: '未来' },
    ];
    const socialEvents = [
      { mbtiEventId: 'event-1' },
      { mbtiEventId: 'event-2' },
      { mbtiEventId: 'event-3' },
    ];
    const userResponses = [
      { mbtiEventId: 'event-1', responseStatus: 'responded' },
      { mbtiEventId: 'event-2', responseStatus: 'responded' },
    ];

    expect(finalReportReadiness(events as any, socialEvents as any, userResponses as any, 3)).toMatchObject({
      ready: false,
      reason: 'open-timeline-event-still-running',
      recordedEventCount: 3,
      respondedEventCount: 2,
      testedVariableCount: 3,
      hasOpenProbe: true,
    });
  });

  test('raises the minimum evidence floor from the selected event target', () => {
    expect(minimumFinalReportEventCount(4)).toBe(4);
    expect(minimumFinalReportEventCount(12)).toBe(6);
    expect(minimumFinalReportEventCount(20)).toBe(10);
  });

  test('allows final report once evidence locates a clear answer position', () => {
    const events = [
      { _id: 'event-1', status: 'responded', testedVariable: '钱' },
      { _id: 'event-2', status: 'responded', testedVariable: '时间' },
      { _id: 'event-3', status: 'observed', testedVariable: '关系' },
      { _id: 'event-4', status: 'candidate', testedVariable: '未来' },
    ];
    const socialEvents = [
      { mbtiEventId: 'event-1' },
      { mbtiEventId: 'event-2' },
      { mbtiEventId: 'event-3' },
    ];
    const userResponses = [
      { mbtiEventId: 'event-1', responseStatus: 'responded' },
      { mbtiEventId: 'event-2', responseStatus: 'responded' },
    ];

    expect(answerPositionReadiness(events as any, socialEvents as any, userResponses as any)).toEqual({
      ready: true,
      reason: 'answer-position-located',
      recordedEventCount: 3,
      respondedEventCount: 2,
      testedVariableCount: 3,
    });
  });

  test('keeps visible planned events stable when the same question starts a new town run', () => {
    const dimensions = ['时间', '社交', '家庭', '兴趣', '健康', '价值', '变化', '金钱'];
    const focus = {
      coreQuestion: '同一个问题',
      drivingTension: '同题重新入镇',
      observationGoal: '观察不同生活扰动',
      analysisDimensions: dimensions,
      designRationale: '用多种事件测试同一问题。',
      theoreticalBasis: ['压力应对', '生活方式兼容'],
      evidenceTargets: ['行动选择', '沟通方式', '长期取舍'],
      eventBeats: ['时间变化', '居民介入', '现实约束'],
      outcomeHypotheses: [
        {
          label: '稳定优先',
          plainConclusion: '更看重稳定安排。',
          supportSignals: ['会确认规则'],
          weakSignals: ['频繁换方向'],
        },
        {
          label: '弹性优先',
          plainConclusion: '更能接受变化。',
          supportSignals: ['能提出替代'],
          weakSignals: ['拒绝调整'],
        },
      ],
      eventPlans: Array.from({ length: 12 }, (_, index) => ({
        title: `本轮候选事件 ${index + 1}`,
        severity: index % 3 === 0 ? '重大' : index % 3 === 1 ? '中等' : '日常',
        scene: '晨桥咖啡馆里，我和常驻居民A正在处理本次问题相关安排。',
        trigger: `第 ${index + 1} 个具体阻断出现，要求我当场做一个不同取舍。`,
        participants: ['我', '常驻居民A'],
        observationAxis: dimensions[index % dimensions.length],
        questionLink: '把同一个问题换成新的生活扰动来观察。',
        informationGoal: '看我如何处理这个扰动。',
        judgmentSignal: '能否做出具体选择。',
        responseOptions: ['我先核对事实', '我请对方说明限制', '我改用替代安排'],
      })),
      resolutionCriteria: '至少观察多种扰动。',
    };
    const firstRun = buildSeededEvents(
      '同一个问题',
      [],
      [{ name: '林遥' }] as any,
      'cafe',
      deterministicSeed('同一个问题', 'INTJ', 'cafe', 'stable-focus'),
      6,
      focus,
    );
    const secondRun = buildSeededEvents(
      '同一个问题',
      [],
      [{ name: '林遥' }] as any,
      'cafe',
      deterministicSeed('同一个问题', 'INTJ', 'cafe', 'stable-focus'),
      6,
      focus,
    );

    expect(firstRun.map((event) => event.title)).toEqual(secondRun.map((event) => event.title));
    expect(firstRun).toHaveLength(6);
    expect(secondRun).toHaveLength(6);
  });

  test('describes low confidence without promoting per-event choices', () => {
    const credibility = reportCredibility(
      [{ _id: 'event-1' }, { _id: 'event-2' }] as any,
      [],
    );

    expect(credibility.confidenceNotice).toContain('当前没有额外用户校准');
    expect(credibility.confidenceNotice).not.toContain('运行期校准');
  });

  test('classifies authenticity feedback separately from normal user reactions', () => {
    expect(feedbackTypeFromFit('not_fit', '这个事件不像真实生活，感觉是编的。')).toBe('unrealistic_event');
    expect(feedbackTypeFromFit('not_fit', '这个朋友说话不像真实的人。')).toBe('unrealistic_person');
    expect(feedbackTypeFromFit('fits', undefined, '这个点确实戳中我。')).toBe('hit_real_issue');
    expect(feedbackTypeFromFit('partial', '现实里还有照护约束。')).toBe('condition_correction');
    expect(feedbackTypeFromFit('fits')).toBe('user_reaction');
  });

  test('keeps offscreen relationship objects from becoming town residents in solo mode', () => {
    const scope = buildEventParticipantScope(
      [],
      [
        { name: '林遥' },
        { name: '陈桥' },
      ] as any,
    );
    const plan = normalizeEventParticipantPlan(['我', '关键对象', '常驻居民A'], scope, 0);
    const trigger = sanitizeEventPlanText(
      '关键对象已读不回，常驻居民A问我是不是还想等关键对象解释。',
      plan,
      0,
    );

    expect(plan.involvedRoles).toEqual(['self', '林遥']);
    expect(trigger).toContain('未入场的关键对象已读不回');
    expect(trigger).toContain('林遥问我');
    expect(trigger).not.toContain('林遥已读不回');
  });

  test('uses a candidate date object, not an existing partner, for future partner questions', () => {
    const scope = buildEventParticipantScope(
      [],
      [{ name: '林遥' }] as any,
      '我今年 47 岁，明年想退休回老家生活，我在考虑是否找一个伴侣一起生活，什么样的女人适合我呢？',
    );
    const plan = normalizeEventParticipantPlan(['我', '关键对象', '常驻居民A'], scope, 0);
    const trigger = sanitizeEventPlanText(
      '关键对象提出想留在大城市，常驻居民A问我是否能接受未来共同生活节奏不同。',
      plan,
      0,
    );

    expect(plan.involvedRoles).toEqual(['self', '意向对象', '林遥']);
    expect(trigger).toContain('意向对象提出想留在大城市');
    expect(trigger).toContain('林遥问我');
    expect(trigger).not.toContain('伴侣');
  });

  test('uses a candidate date object for direct future wife suitability questions', () => {
    const scope = buildEventParticipantScope(
      [],
      [{ name: '林遥' }] as any,
      '如果一定要找一个老婆，什么样的女人最适合我？',
    );
    const plan = normalizeEventParticipantPlan(['我', '关键对象', '常驻居民A'], scope, 0);
    const trigger = sanitizeEventPlanText(
      '关键对象问我能不能接受她有未成年子女，常驻居民A提醒我要说清生活边界。',
      plan,
      0,
    );

    expect(plan.involvedRoles).toEqual(['self', '意向对象', '林遥']);
    expect(trigger).toContain('意向对象问我');
    expect(trigger).not.toContain('未入场的关键对象');
  });

  test('replaces bare A/B speaker placeholders in generated event text', () => {
    const scope = buildEventParticipantScope(
      [],
      [{ name: '林遥' }, { name: '乔南' }] as any,
      '如果一定要找一个老婆，什么样的女人最适合我？',
    );
    const plan = normalizeEventParticipantPlan(['我', '关键对象', '常驻居民A'], scope, 0);
    const trigger = sanitizeEventPlanText(
      'A问我是否介意伴侣有慢性病，B提醒我要把岳阳生活的照护边界说清楚。',
      plan,
      0,
    );

    expect(trigger).toContain('意向对象问我');
    expect(trigger).toContain('林遥提醒');
    expect(trigger).not.toMatch(/(^|[，。；、\s])[AB](?=问|说|提到|提醒)/);
  });

  test('anchors triggered scene events to the user and one focus participant', () => {
    expect(normalizeSceneEventParticipantNames(['高声', '宋迟'])).toEqual(['我', '高声', '宋迟']);
    expect(normalizeSceneEventParticipantNames(['用户', '高声', '宋迟', '陈桥'])).toEqual(['我', '高声', '宋迟']);
    expect(normalizeSceneEventParticipantNames(['self'])).toEqual(['我', '常驻居民']);
  });

  test('describes candidate date as an intention object in self identity, not current partner', () => {
    const line = relationshipLineForSelf({
      enabled: true,
      label: '意向对象',
      role: 'candidate',
      mapping: '相亲对象/意向认识的人/未来共同生活候选人',
    } as any);

    expect(line).toContain('意向对象');
    expect(line).toContain('不是现任伴侣');
    expect(line).not.toContain('是你的伴侣');
  });

  test('uses an explicit partner role as the relationship object when one is provided', () => {
    const scope = buildEventParticipantScope(
      [{ enabled: true, label: '小雨', role: 'partner' }] as any,
      [{ name: '林遥' }] as any,
    );
    const plan = normalizeEventParticipantPlan(['我', '关键对象', '常驻居民A'], scope, 0);
    const trigger = sanitizeEventPlanText('关键对象已读不回，常驻居民A问我要不要先吃饭。', plan, 0);

    expect(plan.involvedRoles).toEqual(['self', '小雨', '林遥']);
    expect(trigger).toContain('小雨已读不回');
    expect(trigger).toContain('林遥问我');
  });

  test('binds planned events to concrete town locations and layout staging points', () => {
    expect(locationKeyForEventScene('晨桥咖啡馆角桌，我和意向对象正在聊回岳阳后的生活。', 'square')).toBe('cafe');
    expect(locationKeyForEventScene('白榆诊所门口，对方提到体检后的照护安排。', 'square')).toBe('clinic');
    expect(locationKeyForEventScene('一个没有地点线索的冲突', 'office')).toBe('office');

    expect(stagingPointForEventLocation('cafe', 0)).toEqual({ x: 15, y: 18 });
    expect(stagingPointForEventLocation('cafe', 1)).toEqual({ x: 15, y: 19 });
    expect(stagingPointForEventLocation('unknown', 0)).toEqual({ x: 20, y: 23 });
  });

  test('compacts resident profile context before injecting it into town characters', () => {
    const compacted = compactResidentContextForProfile(
      [
        '和liang_ce：周眠和梁策通过小镇事务有过几次交集。',
        '和chen_qiao：周眠和陈桥通过小镇事务有过几次交集。',
        '和su_ning：周眠陪苏宁处理过家庭急事。',
        '诊所陪同：周眠曾陪苏宁处理家庭急事，苏宁因此在压力场景里更愿意听周眠的话。',
        '家属照护讨论：白榆诊所办过照护讲座，罗晴提醒大家不要把控制误认为关心。',
        '周眠和罗晴重新碰到旧分歧：周眠（夜班护士）和罗晴（心理咨询实习生）在小镇日常里自然产生一次互动。',
        '这次互动被旧记忆牵动：白榆诊所办过照护讲座，罗晴提醒大家不要把控制误认为关心。',
        '互动让原有紧张略微浮出水面，后续更可能影响相关场景。',
      ].join(' '),
      170,
    );

    expect(compacted.length).toBeLessThanOrEqual(170);
    expect(compacted).toContain('周眠');
    expect(compacted).not.toContain('在小镇日常里自然产生一次互动');
    expect(compacted).not.toContain('这次互动被旧记忆牵动');
  });

  test('answers future partner questions with suitability criteria, not breakup-style relationship routes', () => {
    const options = buildAnswerOptions(
      {
        experiment: {
          question: '我今年 47 岁，明年想退休回老家生活，我在考虑是否找一个伴侣一起生活，什么样的女人适合我呢？',
          profile: {
            behaviors: {
              withdrawal: 45,
              repairDrive: 62,
              factChecking: 58,
              meaningProjection: 60,
              emotionalSensitivity: 56,
              closureNeed: 64,
            },
          },
          questionFocus: {
            observationGoal: '判断什么样的女性适合退休后共同生活',
            drivingTension: '回老家生活与共同生活节奏是否匹配',
            resolutionCriteria: '需要看到生活节奏、经济边界、照护责任和沟通方式是否兼容',
          },
        },
        messages: [],
        innerThoughts: [],
        socialEvents: [],
        eventEvidence: [],
        behaviorEvents: [],
        memories: [],
      } as any,
      '修复动机较强，容易推演关系含义。',
    );

    const text = options.map((option: { label: string; answer: string; signals: string[] }) =>
      `${option.label} ${option.answer} ${option.signals.join(' ')}`
    ).join(' ');
    expect(text).toContain('适合你的女性');
    expect(text).toContain('适合');
    expect(text).toContain('共同生活');
    expect(text).toContain('老家');
    expect(text).not.toContain('单纯想结束');
    expect(text).not.toContain('别再忽冷忽热');
  });

  test('builds final output around reasons, change conditions, protected value, and next validation', () => {
    const insights = buildDecisionInsights(
      {
        experiment: {
          question: '我今年 47 岁，明年想退休回老家生活，我在考虑是否找一个伴侣一起生活，什么样的女人适合我呢？',
          questionFocus: {
            observationGoal: '判断什么样的女性适合退休后共同生活',
            resolutionCriteria: '需要看到生活节奏、经济边界、照护责任和沟通方式是否兼容',
          },
        },
        messages: [],
        innerThoughts: [],
        socialEvents: [],
        eventEvidence: [],
        behaviorEvents: [],
        memories: [],
      } as any,
      [
        {
          label: '生活节奏稳定型',
          probability: 40,
          answer: '更适合你的是愿意一起把退休后老家生活过稳定的人。',
          why: '这类人能降低共同生活的不确定性。',
          signals: ['愿意讨论老家共同生活', '能把作息和住处安排说具体'],
        },
      ],
      '修复动机较强，容易推演关系含义。',
    );

    expect(insights.why).toContain('为什么');
    expect(insights.changeConditions).toContain('会改变');
    expect(insights.stableValue).toContain('稳定');
    expect(insights.nextValidation).toContain('下一步');
  });

  test('uses dynamic decision structure instead of pretending to predict the answer', () => {
    const insights = buildDecisionInsights(
      {
        experiment: {
          question: '我今年 47 岁，明年想退休回老家生活，我在考虑是否找一个伴侣一起生活，什么样的女人适合我呢？',
          questionFocus: {
            observationGoal: '帮助用户拆解退休后伴侣选择的可能结果',
            resolutionCriteria: '需要补齐现实变量后再判断',
            decisionStructure: {
              surfaceQuestion: '什么样的女人适合我',
              underlyingDecision: '是否把退休后的生活结构和一个长期伴侣绑定在一起',
              decisionDimensions: [
                { label: '吸引力和外貌偏好', whyItMatters: '决定是否愿意长期投入', userBlindSpot: '可能羞于承认但不能忽略' },
                { label: '年龄和生活阶段', whyItMatters: '影响精力、退休节奏和照护预期' },
                { label: '经济和医保边界', whyItMatters: '影响共同生活成本' },
                { label: '健康和照护责任', whyItMatters: '影响长期负担' },
                { label: '老家适应度', whyItMatters: '影响关系能否落地' },
              ],
              personalityLevers: ['容易重视稳定', '可能低估吸引力', '会推演长期风险'],
              unknowns: ['能接受的年龄范围', '外貌偏好', '是否同居', '是否接受对方有子女'],
              hiddenNeeds: ['不想孤独', '保留自由', '晚年安全感'],
              riskBlindspots: ['经济依赖', '照护压力', '家庭边界不清'],
              possiblePaths: [
                { label: '稳定共同生活', whenLikely: '对方愿意回老家且边界清楚', possibleResult: '生活秩序更稳定' },
                { label: '短期吸引长期消耗', whenLikely: '只看感觉但现实条件冲突', possibleResult: '退休生活被关系成本拖累' },
              ],
              changeConditions: ['对方不愿回老家', '财务边界不清', '健康照护压力过高'],
              nextValidationQuestions: ['你能接受的年龄范围是什么', '你是否需要同居', '你最不能接受哪种家庭负担'],
            },
          },
        },
        messages: [],
        innerThoughts: [],
        socialEvents: [],
        eventEvidence: [],
        behaviorEvents: [],
        memories: [],
      } as any,
      [
        {
          label: '稳定共同生活',
          probability: 40,
          answer: '这是一个待验证路径。',
          why: '不是最终答案。',
          signals: ['边界清楚'],
        },
      ],
      '容易重视稳定，也会推演长期风险。',
    );

    expect(insights.why).toContain('真正要分析的是');
    expect(insights.why).toContain('是否把退休后的生活结构');
    expect(insights.stableValue).toContain('不想孤独');
    expect(insights.stableValue).toContain('经济依赖');
    expect(insights.nextValidation).toContain('年龄范围');
  });
});
