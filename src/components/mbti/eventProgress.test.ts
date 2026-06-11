import {
  eventResultSummary,
  eventStatusLabel,
  guidanceResultText,
  plannedEventSections,
  selectEventRelatedMessages,
} from './eventProgress';

describe('MBTI event progress copy', () => {
  test('labels runtime statuses in user-readable Chinese', () => {
    expect(eventStatusLabel('seeded')).toBe('待触发');
    expect(eventStatusLabel('moving')).toBe('正在进入现场');
    expect(eventStatusLabel('conversation_pending')).toBe('等待相关对话');
    expect(eventStatusLabel('triggered')).toBe('已触发，等证据');
    expect(eventStatusLabel('observed')).toBe('已有证据');
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

    expect(text).toContain('已触发 2/3 个计划事件');
    expect(text).toContain('其中 1 个已进入事件记录');
    expect(text).toContain('聊天、内心和行为只能挂在这些记录下面');
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
