import { directEventConclusion } from './eventConclusion';
import { settleStaleCreatingEntry, StaleHistoryEntry } from './historyState';
import { activeFacilityViewportFrame } from '../pixiViewportFrame';
import { liveTownTimelineNode } from './townClock';

describe('MBTI event conclusion', () => {
  test('keeps time-management probes tied to schedule boundaries', () => {
    const conclusion = directEventConclusion(
      [
        {
          author: 'resident-1',
          text: '这么早来？平时看你挺忙的。下午社区合唱，要不要顺路过来坐坐？',
        },
        {
          author: 'self',
          text: '谢谢关心，不过今天我想趁早把账目理清楚，下午的排练改天再参加。',
        },
      ],
      [],
      [
        {
          playerId: 'self',
          text: '合上日程表，温和但坚定地婉拒邀请，说明需专注处理个人财务规划',
        },
      ],
      new Map([
        ['self', '我'],
        ['resident-1', '林遥'],
      ]),
      '时间管理习惯 测试在完全自由的时间颗粒度下，面对熟人社会的惯性召唤，你是倾向于维持秩序还是随波逐流',
      '需要看到用户能否在自由时间里自建秩序',
      true,
    );

    expect(conclusion.summary).toContain('守住自己的安排');
    expect(conclusion.inference).toContain('自由时间边界');
    expect(conclusion.inference).not.toContain('接住对方');
  });

  test('uses event context to avoid repeating constructive action conclusions', () => {
    const playerNames = new Map([['self', '我']]);
    const repairConclusion = directEventConclusion(
      [
        {
          author: 'self',
          text: '老家屋顶漏得厉害，我得赶紧回去盯着修，不然雨再大点就遭殃了。',
        },
      ],
      [],
      [
        {
          playerId: 'self',
          text: '果断联系城市专业团队，承担费用并预约上门，拒绝将就维修',
        },
      ],
      playerNames,
      '老家房屋漏水，需要在将就维修、高价请人或暂时搬离之间做决定',
      '观察用户面对生活损害危机时的决策速度、资源调动能力及情绪稳定性。',
      true,
      {
        title: '老家房屋漏水引发的维修决策困境',
        testedVariable: '自我价值感来源',
        questionLink: '测试在缺乏职场支持系统后，能否独立应对生活突发危机。',
      },
    );
    const conclusion = directEventConclusion(
      [
        {
          author: 'self',
          text: '刚才想修个旧收音机，结果螺丝都拧不紧。看着满桌的零件，突然觉得有点不知所措。',
        },
      ],
      [],
      [
        {
          playerId: 'self',
          text: '我先离开当前场面，暂停继续处理这件事。',
        },
      ],
      new Map([['self', '我']]),
      '退休第一天，想通过修理旧物来打发时间，却发现无法静下心来，感到莫名焦虑和失落。',
      '测试用户面对心理落差时的应对能力及情绪调节技巧。',
      true,
      {
        title: '退休综合征的初期情绪波动',
        testedVariable: '心理韧性表现',
        questionLink: '观察用户是积极调节、求助他人，还是陷入情绪泥潭。',
      },
    );

    expect(repairConclusion.summary).toBe('他这次更像是愿意花成本把问题处理干净');
    expect(conclusion.summary).toBe('他这次先让自己缓一缓');
    expect(repairConclusion.summary).not.toBe(conclusion.summary);
    expect(repairConclusion.inference).toContain('房屋出问题');
    expect(conclusion.inference).toContain('情绪乱起来');
    expect(conclusion.inference).not.toContain('维持现场');
  });
});

describe('MBTI history status', () => {
  test('marks stale creating entries as failed instead of leaving them spinning', () => {
    const staleEntry: StaleHistoryEntry & {
      id: string;
      profileCode: string;
      question: string;
      rolePresets: never[];
      scaleLabel: string;
    } = {
      createdAt: 1_000_000 - 12 * 60 * 1000,
      id: 'stale',
      profileCode: 'INFJ',
      question: '测试问题',
      rolePresets: [],
      scaleLabel: '标准演化',
      status: 'creating',
    };
    const entry = settleStaleCreatingEntry(
      staleEntry,
      1_000_000,
      11 * 60 * 1000,
      '加入常驻小镇等待超时。',
    );

    expect(entry.status).toBe('failed');
    expect(entry.error).toContain('等待超时');
  });
});

describe('MBTI town viewport', () => {
  test('advances the visible town clock from the latest persisted timeline node', () => {
    const node = liveTownTimelineNode(
      {
        createdAt: 1_000_000,
        phase: 'morning' as const,
        scope: 'relationship' as const,
        townDay: 200,
      },
      1_000_000 + 5 * 60 * 1000,
    );

    expect(node).toMatchObject({
      townDay: 200,
      phase: 'afternoon',
    });
  });

  test('locked scene viewport scales enough to cover a wide collapsed canvas', () => {
    const frame = activeFacilityViewportFrame(
      [{
        key: 'office',
        label: '社区办公室',
        x: 62,
        y: 28,
        footprint: { width: 6, height: 5 },
        entrance: { x: 62, y: 32 },
        stagingPoints: [{ x: 63, y: 32 }],
        tone: 0x7a5534,
        icon: 'office',
        scale: 3,
      }],
      100,
      60,
      16,
      1900,
      720,
    );

    expect(frame.scale).toBeGreaterThanOrEqual((1.04 * 1900) / (100 * 16));
  });
});
