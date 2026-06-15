import { buildSceneResidentRoles, hydrateEventPlanResidentPlaceholders } from './mbtiTown';
import { defaultTownResidents } from '../data/mbtiPersistentTown';

describe('MBTI town scene resident roles', () => {
  test('default residents have durable life goals and pressures', () => {
    expect(defaultTownResidents.length).toBeGreaterThan(0);
    for (const resident of defaultTownResidents) {
      expect(resident.lifeProfile).toBeTruthy();
      expect(resident.lifeProfile?.longTermGoal).toBeTruthy();
      expect(resident.lifeProfile?.currentPressure).toBeTruthy();
      expect(resident.lifeProfile?.economy).toBeGreaterThanOrEqual(0);
      expect(resident.lifeProfile?.stress).toBeLessThanOrEqual(100);
    }
  });

  test('adds per-scene role overlays without changing persistent resident identity', () => {
    const resident = {
      key: 'lin_yao',
      name: '林遥',
      role: '咖啡馆老板',
      traits: ['细心', '会留意关系里的沉默'],
      background: '林遥长期经营晨桥咖啡馆，认识很多常驻居民。',
      defaultLocationKey: 'cafe',
    };
    const roles = buildSceneResidentRoles({
      question: '我明年想退休回老家生活，在考虑是否找一个伴侣一起生活，什么样的女人适合我？',
      userEntryMode: 'solo',
      sceneType: 'decision',
      selectedLocationKey: 'cafe',
      selectedResidentKeys: ['lin_yao'],
      residents: [resident],
      relationships: [],
      memories: [
        {
          kind: 'rumor',
          salience: 70,
          title: '咖啡馆的未回消息',
          summary: '林遥听说有人因为共同生活里的钱和住处边界不清而闹僵。',
          residentKeys: ['lin_yao'],
          locationKey: 'cafe',
        },
      ],
      questionFocus: {
        observationGoal: '判断退休后共同生活的伴侣条件',
        drivingTension: '陪伴需要和现实边界之间有张力',
        decisionStructure: {
          unknowns: ['用户能接受的年龄范围', '用户是否接受对方带子女'],
          riskBlindspots: ['财务边界不清可能伤害家庭关系'],
          hiddenNeeds: ['不想孤独'],
          decisionDimensions: [
            { label: '老家适应度' },
            { label: '经济边界' },
          ],
        },
      },
    });

    expect(resident.role).toBe('咖啡馆老板');
    expect(roles).toHaveLength(1);
    expect(roles[0]).toMatchObject({
      residentKey: 'lin_yao',
      relationToUser: '介绍信息来源',
      pressureStyle: '现实提醒',
    });
    expect(roles[0].personalStake).toContain('信任');
    expect(roles[0].knowsAboutUser.join(' ')).toContain('退休');
    expect(roles[0].doesNotKnow.join(' ')).toContain('年龄范围');
    expect(roles[0].allowedIntervention).toContain('不知道');
  });

  test('hydrates resident placeholders in planned event text', () => {
    const focus = hydrateEventPlanResidentPlaceholders(
      {
        eventPlans: [
          {
            title: '岳阳医疗资源评估',
            scene: '白榆诊所里，我和常驻居民A正在看体检单。',
            trigger: '居民B问我：如果回岳阳后半夜发病，谁陪你去医院？常驻居民K提醒我别只看存款。',
            participants: ['我', '常驻居民A', '居民B', '常驻居民K'],
          },
        ],
      },
      [{ name: '林遥' }, { name: '周眠' }, { name: '陈桥' }],
    );

    expect(focus.eventPlans?.[0].scene).toContain('林遥');
    expect(focus.eventPlans?.[0].trigger).toContain('周眠问我');
    expect(focus.eventPlans?.[0].trigger).toContain('周眠提醒我');
    expect(focus.eventPlans?.[0].participants).toEqual(['我', '林遥', '周眠', '周眠']);
    expect(JSON.stringify(focus)).not.toContain('常驻居民');
    expect(JSON.stringify(focus)).not.toContain('居民B');
  });
});
