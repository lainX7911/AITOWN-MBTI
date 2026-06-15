import {
  correctionEvidencePreviewItems,
  eventResultSummary,
  eventResponseOptions,
  eventResponsePrompt,
  eventSourceSummaryText,
  eventStatusLabel,
  eventTimelineReasonText,
  guidanceResultText,
  plannedEventSections,
  selectEventRelatedMessages,
  shouldShowEventCorrectionControls,
  shouldShowRuntimeCalibrationControls,
  summarizeEventRuntime,
} from './eventProgress';

describe('MBTI event progress copy', () => {
  test('labels runtime statuses in user-readable Chinese', () => {
    expect(eventStatusLabel('seeded')).toBe('待触发');
    expect(eventStatusLabel('candidate')).toBe('备用观察');
    expect(eventStatusLabel('delayed')).toBe('条件不足');
    expect(eventStatusLabel('moving')).toBe('正在进入现场');
    expect(eventStatusLabel('conversation_pending')).toBe('等待相关对话');
    expect(eventStatusLabel('triggered')).toBe('已触发，等证据');
    expect(eventStatusLabel('pending_user_response')).toBe('可反馈');
    expect(eventStatusLabel('observed')).toBe('已有证据');
    expect(eventStatusLabel('responded')).toBe('已反馈');
    expect(eventStatusLabel('skipped')).toBe('已略过反馈');
    expect(eventStatusLabel('expired_to_stage_report')).toBe('已转阶段报告');
    expect(eventStatusLabel('resolved')).toBe('已纳入结论');
    expect(eventStatusLabel('failed')).toBe('触发失败');
  });

  test('uses recorded town event result before the planned event description', () => {
    const summary = eventResultSummary(
      {
        title: '外部评价',
        description: '预设：旁观评价会推动关系证据收集。',
        status: 'observed',
      },
      '林遥和夏越讨论了刚才的争执，外部评价让双方开始区分事实和情绪。',
    );
    expect(summary).toContain('林遥和夏越');
    expect(summary).toContain('区分事实和情绪');
    expect(summary).not.toContain('预设');
  });

  test('explains the latest observed event result in the guidance summary', () => {
    const text = guidanceResultText({
      completed: false,
      started: true,
      events: [
        {
          _id: 'event-1',
          title: '争执',
          description: '双方因为边界问题发生争执。',
          status: 'triggered',
        },
        {
          _id: 'event-2',
          title: '外部评价',
          description: '旁观者给出评价。',
          status: 'triggered',
        },
        {
          _id: 'event-3',
          title: '修复窗口',
          description: '之后会出现一次直接沟通机会。',
          status: 'seeded',
        },
      ],
      records: [
        {
          mbtiEventId: 'event-2',
          title: '外部评价',
          description: '居民的评价让对话从互相指责转向核对真实需求。',
        },
      ],
    });

    expect(text).toContain('已触发 2/3 个当前事件');
    expect(text).toContain('其中 1 个已进入事件记录');
    expect(text).toContain('系统会按证据缺口继续生成后续事件');
  });

  test('labels completed runs as overall conclusions, not stage conclusions', () => {
    const text = guidanceResultText({
      completed: true,
      started: true,
      events: [
        {
          _id: 'event-1',
          title: '家庭责任',
          description: '观察家庭责任。',
          status: 'responded',
        },
      ],
      records: [
        {
          mbtiEventId: 'event-1',
          title: '家庭责任',
          description: '用户回应了家庭责任边界。',
        },
      ],
    });

    expect(text).toContain('整体结论');
    expect(text).not.toContain('阶段结论');
  });

  test('does not count candidate or delayed probes as triggered events', () => {
    const text = guidanceResultText({
      completed: false,
      started: true,
      events: [
        {
          _id: 'event-1',
          title: '备用观察',
          description: '后台观察到的可能扰动。',
          status: 'candidate',
        },
        {
          _id: 'event-2',
          title: '延迟扰动',
          description: '需要等待更合适的现场。',
          status: 'delayed',
        },
        {
          _id: 'event-3',
          title: '进入现场',
          description: '居民对话已经开始承载这个扰动。',
          status: 'moving',
        },
        {
          _id: 'event-4',
          title: '未开始',
          description: '还没进入现场。',
          status: 'seeded',
        },
      ],
      records: [],
    });

    expect(text).toContain('已触发 1/4 个当前事件');
    expect(text).toContain('其中 0 个已进入事件记录');
  });

  test('summarizes event runtime origin and timeline queue state', () => {
    const summary = summarizeEventRuntime([
      {
        _id: 'event-1',
        title: '开场',
        description: '初始规划事件',
        status: 'triggered',
        probeOrigin: 'initial',
        timelineTriggerReason: 'opening_probe_after_user_entry',
      },
      {
        _id: 'event-2',
        title: '第十天追问',
        description: '动态事件',
        status: 'candidate',
        probeOrigin: 'adaptive',
        timelineTriggerReason: 'town_life_generated_probe',
        scheduledDay: 10,
        scheduledPhase: 'evening',
      },
      {
        _id: 'event-3',
        title: '校准',
        description: '用户校准事件',
        status: 'delayed',
        probeOrigin: 'calibration',
        timelineTriggerReason: 'user_calibration_generated_probe',
        scheduledDay: 12,
        scheduledPhase: 'morning',
      },
    ]);

    expect(summary.originCounts).toEqual({
      initial: 1,
      timeline: 1,
      calibration: 1,
      other: 0,
    });
    expect(summary.statusCounts).toMatchObject({
      occurred: 1,
      waitingTimeline: 2,
      dynamicGenerated: 2,
    });
    expect(summary.nextTimelineEvent?.title).toBe('第十天追问');
    expect(summary.nextTimelineEvent?.scheduledDay).toBe(10);
  });

  test('explains why a timeline-generated event exists', () => {
    expect(eventTimelineReasonText('town_life_generated_probe')).toContain('居民生活线');
    expect(eventTimelineReasonText('decision_state_generated_probe')).toContain('答案位置');
    expect(eventTimelineReasonText('user_calibration_generated_probe')).toContain('校准');
    expect(eventTimelineReasonText('opening_probe_after_user_entry')).toContain('入镇');
  });

  test('hides new runtime calibration choices in the default autonomous town flow', () => {
    expect(
      shouldShowRuntimeCalibrationControls({
        hasEventRecord: true,
        isCalibrationCandidate: true,
        manualCalibrationMode: false,
        hasSavedUserResponse: false,
      }),
    ).toBe(false);
    expect(
      shouldShowRuntimeCalibrationControls({
        hasEventRecord: true,
        isCalibrationCandidate: true,
        manualCalibrationMode: false,
        hasSavedUserResponse: true,
      }),
    ).toBe(false);
    expect(
      shouldShowRuntimeCalibrationControls({
        hasEventRecord: true,
        isCalibrationCandidate: true,
        manualCalibrationMode: true,
        hasSavedUserResponse: true,
      }),
    ).toBe(true);
  });

  test('shows correction controls by default once an event has a record', () => {
    expect(
      shouldShowEventCorrectionControls({
        hasEventRecord: true,
        hasSavedUserResponse: false,
        showInlineResponse: true,
      }),
    ).toBe(true);
    expect(
      shouldShowEventCorrectionControls({
        hasEventRecord: false,
        hasSavedUserResponse: true,
        showInlineResponse: true,
      }),
    ).toBe(true);
    expect(
      shouldShowEventCorrectionControls({
        hasEventRecord: true,
        hasSavedUserResponse: false,
        showInlineResponse: false,
      }),
    ).toBe(false);
  });

  test('hides empty calibration source counts from the user-facing event source summary', () => {
    expect(eventSourceSummaryText({
      initial: 1,
      timeline: 12,
      calibration: 0,
      other: 0,
    })).toBe('初始 1 · 时间线 12');
    expect(eventSourceSummaryText({
      initial: 1,
      timeline: 12,
      calibration: 2,
      other: 0,
    })).toBe('初始 1 · 时间线 12 · 用户纠正 2');
  });

  test('prioritizes chat evidence before action evidence in correction previews', () => {
    const items = correctionEvidencePreviewItems({
      messages: ['我想先问清楚这里有没有误会。'],
      behaviors: ['放下茶杯起身告辞。'],
      thoughts: ['我觉得这个场景有点不贴合。'],
      maxItems: 3,
    });

    expect(items).toEqual([
      { kind: '聊天', text: '我想先问清楚这里有没有误会。', title: '聊天：我想先问清楚这里有没有误会。' },
      { kind: '动作', text: '放下茶杯起身告辞。', title: '动作：放下茶杯起身告辞。' },
    ]);
  });

  test('extracts concrete plan sections for the combined plan and evidence card', () => {
    const sections = plannedEventSections(
      '场景：周末市集 具体事情：伴侣想去热门摊位，我想去安静书店 参与者：我、夏天、朋友 观察维度：行动恢复 问题关联：模拟计划被打断后是否还能继续生活安排 想获得的信息：看我会不会提出折中 可评判信号：若我沉默跟随，说明空间被压缩',
    );

    expect(sections.scene).toBe('周末市集');
    expect(sections.trigger).toBe('伴侣想去热门摊位，我想去安静书店');
    expect(sections.observationAxis).toBe('行动恢复');
    expect(sections.questionLink).toContain('计划被打断');
    expect(sections.informationGoal).toContain('折中');
    expect(sections.judgmentSignal).toContain('空间被压缩');
  });

  test('turns relationship probes into understandable response choices', () => {
    const sections = plannedEventSections(
      '场景：公寓走廊 具体事情：关键对象又把约好的沟通推迟，只说以后再聊 参与者：我、关键对象 观察维度：关系边界与沟通意愿 问题关联：测试我面对伴侣模糊回应时是否还愿意继续投入 想获得的信息：看我会直接说清担心还是先退开 可评判信号：表达边界、退开、继续追问',
    );

    expect(eventResponsePrompt(sections, '沟通被推迟')).toContain('模拟的“我”遇到');
    expect(eventResponsePrompt(sections, '沟通被推迟')).toContain('你会怎样校准');
    expect(eventResponsePrompt(sections, '沟通被推迟')).toContain('关键对象又把约好的沟通推迟');
    expect(eventResponseOptions(sections, '沟通被推迟')).toEqual([
      '我会直接把担心和需求说清楚',
      '我会先退开，等情绪稳定后再谈',
      '我会说明我不能接受的边界',
      '这个情境不符合我',
    ]);
  });

  test('turns work and money probes into concrete response choices', () => {
    const sections = plannedEventSections(
      '场景：社区办公室 具体事情：新机会提前，但下个月现金流和合同限制还没解决 参与者：我、常驻居民A 观察维度：稳定性和自主性的取舍 问题关联：测试辞职或创业前是否能承受风险 想获得的信息：看我会保留退路还是继续争取自主 可评判信号：过渡方案、最低收入、风险底线',
    );

    expect(eventResponseOptions(sections, '机会提前')).toEqual([
      '我会先确认收入、住处或基本保障是否稳妥',
      '我会继续争取自己想要的选择',
      '我会先准备一个过渡办法再决定',
      '这个情境不符合我',
    ]);
    expect(eventResponseOptions(sections, '机会提前').join('')).not.toContain('基本盘');
  });

  test('only keeps chat lines related to the triggered event evidence', () => {
    const messages = [
      {
        _id: 'unrelated',
        author: 'player-1',
        text: '你下午忙吗？我刚买了杯热茶。',
        _creationTime: 1100,
      },
      {
        _id: 'related',
        author: 'player-1',
        text: '系统故障的话，这份证明今天还能开出来吗？',
        _creationTime: 1200,
      },
      {
        _id: 'outside-window',
        author: 'player-1',
        text: '证明和窗口的事情等会儿再说。',
        _creationTime: 5000,
      },
      {
        _id: 'wrong-participant',
        author: 'player-2',
        text: '我也听说办公室系统故障了。',
        _creationTime: 1300,
      },
    ];

    const selected = selectEventRelatedMessages({
      eventText: '社区办公室 办理手续需要一份证明，系统故障无法开具',
      messages,
      participantIds: new Set(['player-1']),
      recordText: '窗口无法办理证明',
      windowStart: 1000,
      windowEnd: 2000,
    });

    expect(selected.map((message) => message._id)).toEqual(['related']);
  });

  test('keeps event chat order stable when timestamps are equal', () => {
    const selected = selectEventRelatedMessages({
      eventText: '体检 时间紧张 送去医院',
      messages: [
        {
          _id: 'b-user-reply',
          author: 'user',
          text: '现在送你去医院，回来肯定来不及了。',
          _creationTime: 1200,
        },
        {
          _id: 'a-scene-prompt',
          author: 'resident',
          text: '我约了下午的体检，时间挺紧张。你车现在方便吗？',
          _creationTime: 1200,
        },
      ],
      participantIds: new Set(['user', 'resident']),
      recordText: '下午体检时间紧张，需要决定是否送去医院',
      windowStart: 1000,
      windowEnd: 2000,
    });

    expect(selected.map((message) => message._id)).toEqual(['a-scene-prompt', 'b-user-reply']);
  });
});
