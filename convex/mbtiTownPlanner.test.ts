import {
  cleanEventPlans,
  eventPlanCandidateCountForBatch,
  filterEventPlansByAuthenticityFeedback,
  formatAuthenticityFeedbackForPrompt,
  formatRejectedAuthenticityPatterns,
  limitEventPlansToRequired,
  mergeDistinctEventPlans,
  requiredEventPlanCountForTarget,
} from './mbtiTownPlanner';

describe('MBTI town event planner cleanup', () => {
  test('only requires a small startup seed because later events are dynamic', () => {
    expect(requiredEventPlanCountForTarget(undefined)).toBe(3);
    expect(requiredEventPlanCountForTarget(1)).toBe(1);
    expect(requiredEventPlanCountForTarget(7)).toBe(3);
    expect(requiredEventPlanCountForTarget(24)).toBe(3);
  });

  test('requests small initial event batches and only asks for missing supplements', () => {
    expect(eventPlanCandidateCountForBatch(7, 0, 1)).toBe(10);
    expect(eventPlanCandidateCountForBatch(7, 5, 2)).toBe(6);
    expect(eventPlanCandidateCountForBatch(12, 0, 1)).toBe(12);
    expect(eventPlanCandidateCountForBatch(12, 9, 2)).toBe(7);
  });

  test('merges supplemental event batches without duplicating accepted event titles', () => {
    const existing = [
      {
        title: '相亲对象不愿回老家',
        severity: '中等',
        locationKey: 'station',
        scene: '车站里，我和常驻居民A正在看车票。',
        trigger: '我拿出下个月去岳阳看房的车票截图，相亲对象说她最多春节住两周。',
        participants: ['我', '常驻居民A'],
        observationAxis: '居住地点',
        questionLink: '测试共同生活地点是否真能落地。',
        informationGoal: '看我会不会追问长期安排。',
        judgmentSignal: '能追问时间表偏现实。',
        responseOptions: ['我追问她能接受的居住节奏', '我提出先短住一个月', '我承认地点不合适先降温'],
      },
    ];
    const merged = mergeDistinctEventPlans(existing, [
      {
        ...existing[0],
        title: '相亲对象不愿回老家',
      },
      {
        ...existing[0],
        title: '父母养老与居住空间的硬性约束',
        locationKey: 'office',
        observationAxis: '家庭责任',
      },
    ]);

    expect(merged.map((plan) => plan.title)).toEqual([
      '相亲对象不愿回老家',
      '父母养老与居住空间的硬性约束',
    ]);
  });

  test('limits accepted event batches to the requested town duration', () => {
    const plans = Array.from({ length: 10 }, (_, index) => ({
      title: `现实事件 ${index + 1}`,
      severity: '日常',
      locationKey: 'cafe',
      scene: '晨桥咖啡馆里，我和乔南正在聊共同生活安排。',
      trigger: `第 ${index + 1} 个具体生活触发点。`,
      participants: ['我', '乔南'],
      observationAxis: '共同生活安排',
      questionLink: '测试择偶条件是否能落到日常安排。',
      informationGoal: '看我是否追问现实条件。',
      judgmentSignal: '能给出具体安排说明更现实。',
      responseOptions: ['我继续追问', '我提出试住', '我承认不合适'],
    }));

    expect(limitEventPlansToRequired(plans, 7)).toHaveLength(7);
    expect(limitEventPlansToRequired(plans, 7).map((plan) => plan.title)).toEqual(
      plans.slice(0, 7).map((plan) => plan.title),
    );
  });

  test('summarizes authenticity feedback as constraints for the next town entry', () => {
    const summary = formatAuthenticityFeedbackForPrompt([
      {
        feedbackType: 'unrealistic_event',
        eventTitle: '晨桥咖啡馆的晨间秩序',
        selectedOption: '这个事件不像真实生活',
        correctionText: '现实里不会为了找伴侣去咨询咖啡馆秩序。',
      },
      {
        feedbackType: 'unrealistic_person',
        eventTitle: '社区办公室的邻里劝说',
        freeText: '这个居民像咨询师，而且知道太多我的原题。',
      },
      {
        feedbackType: 'hit_real_issue',
        eventTitle: '退休金支出边界',
        freeText: '这个点确实戳中我。',
      },
      {
        feedbackType: 'condition_correction',
        eventTitle: '同住安排',
        correctionText: '现实里还有照护母亲和回岳阳的时间限制。',
      },
      {
        feedbackType: 'user_reaction',
        eventTitle: '普通反应',
        freeText: '我会先问清楚。',
      },
    ]);

    expect(summary).toContain('事件不像真实生活');
    expect(summary).toContain('人物不像真实的人');
    expect(summary).toContain('这个现实变量戳中用户');
    expect(summary).toContain('用户补充了现实条件');
    expect(summary).toContain('照护母亲和回岳阳');
    expect(summary).not.toContain('普通反应');
  });

  test('turns unrealistic event feedback into hard rejected event patterns', () => {
    const rejected = formatRejectedAuthenticityPatterns([
      {
        feedbackType: 'unrealistic_event',
        eventTitle: '晨桥咖啡馆的晨间秩序',
        selectedOption: '这个事件不像真实生活',
        correctionText: '现实里不会为了找伴侣去咨询咖啡馆秩序。',
      },
      {
        feedbackType: 'hit_real_issue',
        eventTitle: '退休金支出边界',
        selectedOption: '这个点确实戳中我',
        freeText: '钱的问题是真的。',
      },
    ]);

    expect(rejected).toContain('晨桥咖啡馆的晨间秩序');
    expect(rejected).toContain('禁止重复同标题');
    expect(rejected).not.toContain('退休金支出边界');
  });

  test('filters events that repeat a previously rejected fake event title', () => {
    const plans = [
      {
        title: '晨桥咖啡馆的晨间秩序',
        severity: '日常',
        locationKey: 'cafe',
        scene: '晨桥咖啡馆里，我和乔南正在聊相亲安排。',
        trigger: '我收到介绍人消息，对方只想聊作息安排。',
        participants: ['我', '乔南'],
        observationAxis: '共同生活安排',
        questionLink: '测试择偶条件是否能落到日常安排。',
        informationGoal: '看我是否追问现实条件。',
        judgmentSignal: '能追问具体安排更现实。',
        responseOptions: ['我继续追问', '我提出试住', '我承认不合适'],
      },
      {
        title: '退休金支出边界',
        severity: '中等',
        locationKey: 'shop',
        scene: '商店里，我和高声正在看本月账单。',
        trigger: '介绍人发来消息说对方希望我承担回岳阳后的房租和社保，我同时收到退休金到账提醒。',
        participants: ['我', '高声'],
        observationAxis: '经济基础',
        questionLink: '测试共同生活能否承担现实开销。',
        informationGoal: '看我是否说清钱的边界。',
        judgmentSignal: '能列出预算和底线偏现实。',
        responseOptions: ['我列预算', '我先问对方收入', '我暂缓见面'],
      },
    ];

    const filtered = filterEventPlansByAuthenticityFeedback(plans, [
      {
        feedbackType: 'unrealistic_event',
        eventTitle: '晨桥咖啡馆的晨间秩序',
        selectedOption: '这个事件不像真实生活',
        correctionText: '现实里不会为了找伴侣去咨询咖啡馆秩序。',
      },
      {
        feedbackType: 'hit_real_issue',
        eventTitle: '退休金支出边界',
        selectedOption: '这个点确实戳中我',
        freeText: '钱的问题是真的。',
      },
    ]);

    expect(filtered.map((plan) => plan.title)).toEqual(['退休金支出边界']);
  });

  test('rejects generic town errand events that feel like a facility task list', () => {
    const plans = cleanEventPlans(
      [
        {
          title: '晨桥咖啡馆的晨间秩序',
          severity: '日常',
          scene: '晨桥咖啡馆里，我和常驻居民A正在咨询晨间安排。',
          trigger: '我在咖啡馆咨询晨间秩序，常驻居民A提醒我先完成排队。',
          participants: ['我', '常驻居民A'],
          questionLink: '观察时间管理习惯。',
          informationGoal: '看我如何处理日常事务。',
          judgmentSignal: '是否能保持秩序。',
          responseOptions: ['我继续排队', '我询问规则', '我换个时间再来'],
        },
        {
          title: '白榆诊所的体检报告解读',
          severity: '日常',
          scene: '白榆诊所里，我和常驻居民A正在咨询报告。',
          trigger: '我在诊所咨询体检报告解读，常驻居民A提醒我等待叫号。',
          participants: ['我', '常驻居民A'],
          questionLink: '观察健康意识。',
          informationGoal: '看我如何处理报告。',
          judgmentSignal: '是否按流程咨询。',
          responseOptions: ['我继续等待', '我询问叫号', '我改天再来'],
        },
        {
          title: '社区办公室的退休手续咨询',
          severity: '日常',
          scene: '社区办公室里，我和常驻居民A正在办理手续。',
          trigger: '我在办公室咨询退休手续，常驻居民A提醒我材料还没带齐。',
          participants: ['我', '常驻居民A'],
          questionLink: '观察现实处理能力。',
          informationGoal: '看我是否补材料。',
          judgmentSignal: '是否继续办理。',
          responseOptions: ['我回去补材料', '我询问清单', '我下次再办'],
        },
      ],
      ['时间管理习惯', '健康意识', '家庭互动模式'],
    );

    expect(plans).toBeUndefined();
  });

  test('keeps concrete life events tied to the user question', () => {
    const plans = cleanEventPlans(
      [
        {
          title: '儿女反对同住安排',
          severity: '重大',
          locationKey: 'office',
          scene: '社区办公室里，我和常驻居民A正在确认回老家后的住处安排。',
          trigger: '我刚把明年三月回岳阳同住的计划发到家庭群，女儿打电话说她担心对方带着儿子一起住会影响我的退休金和房子归属。',
          participants: ['我', '常驻居民A'],
          questionLink: '把找伴侣一起生活转成家庭边界和住处安排的现实压力。',
          informationGoal: '看我是否能把情感需要和财产边界分开说清。',
          judgmentSignal: '能明确住处和财务边界偏稳定；只用感情压过家人担忧偏风险高。',
          responseOptions: ['我先列清房子和钱的边界', '我请女儿说出最担心的点', '我暂缓同住只保留交往'],
          stakes: {
            relationshipCost: '如果不说清边界，女儿会更警惕这段关系。',
            opportunityCost: '同住安排可能被迫推迟到明年三月以后。',
          },
          consequenceOptions: [
            { userAction: '我先列清房子和钱的边界', relationshipDelta: '女儿会更信任我没有被关系冲昏头。', unlocks: '后续可以继续讨论同住条件。' },
            { userAction: '我暂缓同住只保留交往', relationshipDelta: '相亲对象可能失望但边界更清楚。', unlocks: '后续转向观察长期耐心。' },
          ],
        },
        {
          title: '相亲对象不愿回老家',
          severity: '中等',
          locationKey: 'station',
          scene: '车站里，我和常驻居民A正在看回岳阳的车次。',
          trigger: '我拿出下个月去岳阳看房的车票截图，相亲对象发消息说她最多春节住两周，长期还是想留在长沙照顾自己的母亲。',
          participants: ['我', '常驻居民A'],
          questionLink: '测试共同生活地点是否真能落地。',
          informationGoal: '看我会不会追问长期安排，还是先忽略地点冲突。',
          judgmentSignal: '能追问时间表和照护责任偏现实；只说以后再看偏回避关键条件。',
          responseOptions: ['我追问她能接受的居住节奏', '我提出两地过渡半年', '我承认地点不合适先降温'],
          stakes: {
            timeCost: '如果改成两地过渡，至少要多花半年确认节奏。',
            relationshipCost: '直接追问会让对方感到压力，但能暴露真实条件。',
          },
          consequenceOptions: [
            { userAction: '我追问她能接受的居住节奏', relationshipDelta: '对方会更清楚我的底线，也可能更警惕。', unlocks: '后续可以验证老家生活能否落地。' },
            { userAction: '我承认地点不合适先降温', relationshipDelta: '关系热度下降但误解减少。', unlocks: '后续转向寻找更匹配对象。' },
          ],
        },
        {
          title: '退休金支出边界',
          severity: '中等',
          locationKey: 'shop',
          scene: '商店里，我和常驻居民A正在核对一张家庭采购清单。',
          trigger: '我看到账单里多了 680 元给对方亲戚买药的费用，对方说只是先垫一下，月底再说还不还。',
          participants: ['我', '常驻居民A'],
          questionLink: '测试共同生活里的金钱边界。',
          informationGoal: '看我是否能及时说清财务规则。',
          judgmentSignal: '能当场说明垫付边界偏稳定；怕尴尬直接付款偏边界弱。',
          responseOptions: ['我说明只能垫一次并写清用途', '我请对方自己联系亲戚确认', '我拒绝把这笔钱算进共同开支'],
          stakes: {
            moneyCost: '这笔 680 元会测试退休金共同支出的边界。',
            relationshipCost: '拒绝垫付可能让对方亲戚关系变紧张。',
          },
          consequenceOptions: [
            { userAction: '我说明只能垫一次并写清用途', relationshipDelta: '对方会知道我愿意帮忙但有边界。', unlocks: '后续可以讨论共同账户规则。' },
            { userAction: '我拒绝把这笔钱算进共同开支', relationshipDelta: '对方可能失望但财务边界更清楚。', unlocks: '后续验证对方是否尊重边界。' },
          ],
        },
      ],
      ['家庭边界', '居住地点', '经济边界'],
    );

    expect(plans?.map((plan) => plan.title)).toEqual([
      '儿女反对同住安排',
      '相亲对象不愿回老家',
      '退休金支出边界',
    ]);
    expect(plans?.map((plan) => plan.locationKey)).toEqual(['office', 'station', 'shop']);
  });

  test('rejects event plans that do not declare coverage for required validation targets', () => {
    const plans = cleanEventPlans(
      [
        {
          title: '退休金支出边界',
          severity: '中等',
          locationKey: 'office',
          scene: '社区办公室里，我和常驻居民A正在核对退休后的共同支出。',
          trigger: '我刚说想和相亲对象长期相处，对方提出每月共同拿出三千元做生活费，但没有说明医疗和房子维修如何分担。',
          participants: ['我', '常驻居民A'],
          observationAxis: '经济边界',
          questionLink: '测试退休后亲密关系是否能落到清楚的钱和责任安排。',
          informationGoal: '看我会不会把陪伴需求和退休金边界分开说清。',
          judgmentSignal: '能明确共同支出和个人财产边界偏稳定；只谈感情偏风险高。',
          responseOptions: ['我先列清每月共同支出', '我要求对方说明医疗分担', '我暂缓共同账户安排'],
          stakes: {
            moneyCost: '退休金每月支出可能增加三千元。',
            relationshipCost: '直接谈钱可能让对方不舒服。',
          },
          consequenceOptions: [
            { userAction: '我先列清每月共同支出', relationshipDelta: '对方会更清楚我的边界。', unlocks: '后续可以继续谈同住。' },
          ],
        },
      ],
      ['经济边界', '身体照护'],
      [
        {
          id: 'target_money',
          label: '经济边界',
          source: 'decisionDimension',
          priority: 'must',
          whatWouldTestIt: '测试用户是否会把退休金、共同支出和个人财产边界说清楚。',
        },
      ],
    );

    expect(plans).toBeUndefined();
  });

  test('requires cleaned event batches to cover every must validation target', () => {
    const plans = cleanEventPlans(
      [
        {
          title: '退休金支出边界',
          severity: '中等',
          locationKey: 'office',
          scene: '社区办公室里，我和常驻居民A正在核对退休后的共同支出。',
          trigger: '我刚说想和相亲对象长期相处，对方提出每月共同拿出三千元做生活费，但没有说明医疗和房子维修如何分担。',
          participants: ['我', '常驻居民A'],
          observationAxis: '经济边界',
          questionLink: '测试退休后亲密关系是否能落到清楚的钱和责任安排。',
          informationGoal: '看我会不会把陪伴需求和退休金边界分开说清。',
          judgmentSignal: '能明确共同支出和个人财产边界偏稳定；只谈感情偏风险高。',
          responseOptions: ['我先列清每月共同支出', '我要求对方说明医疗分担', '我暂缓共同账户安排'],
          stakes: {
            moneyCost: '退休金每月支出可能增加三千元。',
            relationshipCost: '直接谈钱可能让对方不舒服。',
          },
          consequenceOptions: [
            { userAction: '我先列清每月共同支出', relationshipDelta: '对方会更清楚我的边界。', unlocks: '后续可以继续谈同住。' },
          ],
          coveredTargetIds: ['target_money'],
          whyThisTestsIt: '这个事件直接要求用户说明退休金、共同支出和个人财产边界。',
        },
      ],
      ['经济边界', '身体照护'],
      [
        {
          id: 'target_money',
          label: '经济边界',
          source: 'decisionDimension',
          priority: 'must',
          whatWouldTestIt: '测试用户是否会把退休金、共同支出和个人财产边界说清楚。',
        },
        {
          id: 'target_care',
          label: '身体照护',
          source: 'riskBlindspot',
          priority: 'must',
          whatWouldTestIt: '测试用户是否会确认慢性病、突发照护和医疗分担责任。',
        },
      ],
    );

    expect(plans).toBeUndefined();
  });

  test('keeps event plans only when their coverage claims satisfy required targets', () => {
    const plans = cleanEventPlans(
      [
        {
          title: '退休金支出边界',
          severity: '中等',
          locationKey: 'office',
          scene: '社区办公室里，我和常驻居民A正在核对退休后的共同支出。',
          trigger: '我刚说想和相亲对象长期相处，对方提出每月共同拿出三千元做生活费，但没有说明医疗和房子维修如何分担。',
          participants: ['我', '常驻居民A'],
          observationAxis: '经济边界',
          questionLink: '测试退休后亲密关系是否能落到清楚的钱和责任安排。',
          informationGoal: '看我会不会把陪伴需求和退休金边界分开说清。',
          judgmentSignal: '能明确共同支出和个人财产边界偏稳定；只谈感情偏风险高。',
          responseOptions: ['我先列清每月共同支出', '我要求对方说明医疗分担', '我暂缓共同账户安排'],
          stakes: {
            moneyCost: '退休金每月支出可能增加三千元。',
            relationshipCost: '直接谈钱可能让对方不舒服。',
          },
          consequenceOptions: [
            { userAction: '我先列清每月共同支出', relationshipDelta: '对方会更清楚我的边界。', unlocks: '后续可以继续谈同住。' },
          ],
          coveredTargetIds: ['target_money'],
          whyThisTestsIt: '这个事件直接要求用户说明退休金、共同支出和个人财产边界。',
        },
        {
          title: '突发复诊照护安排',
          severity: '重大',
          locationKey: 'clinic',
          scene: '白榆诊所里，我和常驻居民A正在确认复诊后的照护安排。',
          trigger: '相亲对象说自己下月可能要复诊，希望我陪同并提前安排两天照护，但还没说明长期慢性病和医疗费用分担。',
          participants: ['我', '常驻居民A'],
          observationAxis: '身体照护',
          questionLink: '测试退休后伴侣关系是否能承担真实健康和照护责任。',
          informationGoal: '看我会不会确认慢性病、突发照护和医疗分担责任。',
          judgmentSignal: '能先确认病情和责任边界偏现实；只靠热心承诺偏风险高。',
          responseOptions: ['我先问清复诊和照护细节', '我只答应这次陪同', '我说明长期照护要另谈'],
          stakes: {
            timeCost: '需要提前空出两天照护时间。',
            moneyCost: '可能涉及医疗和交通费用分担。',
          },
          consequenceOptions: [
            { userAction: '我先问清复诊和照护细节', relationshipDelta: '对方会知道我愿意负责但不盲目承诺。', unlocks: '后续可以谈长期照护边界。' },
          ],
          coveredTargetIds: ['target_care'],
          whyThisTestsIt: '这个事件直接测试慢性病、突发照护和医疗费用责任。',
        },
      ],
      ['经济边界', '身体照护'],
      [
        {
          id: 'target_money',
          label: '经济边界',
          source: 'decisionDimension',
          priority: 'must',
          whatWouldTestIt: '测试用户是否会把退休金、共同支出和个人财产边界说清楚。',
        },
        {
          id: 'target_care',
          label: '身体照护',
          source: 'riskBlindspot',
          priority: 'must',
          whatWouldTestIt: '测试用户是否会确认慢性病、突发照护和医疗分担责任。',
        },
      ],
    );

    expect(plans?.map((plan) => plan.coveredTargetIds)).toEqual([
      ['target_money'],
      ['target_care'],
    ]);
  });

  test('keeps concrete life events even when the model omits cost fields', () => {
    const plans = cleanEventPlans(
      [
        {
          title: '相亲对象临时改见面时间',
          severity: '中等',
          locationKey: 'cafe',
          scene: '晨桥咖啡馆里，我和常驻居民A正在确认周六见面安排。',
          trigger: '我刚收到相亲对象的微信，她说周六下午三点临时要改到晚上九点，因为她白天要陪母亲复诊。',
          participants: ['我', '常驻居民A'],
          questionLink: '测试我是否能接受对方家庭照护责任对共同生活节奏的影响。',
          informationGoal: '看我会不会追问长期照护安排，而不是只看这次约会是否方便。',
          judgmentSignal: '能问清照护频率偏现实；只抱怨改时间偏忽略长期条件。',
          responseOptions: ['我追问她母亲复诊频率', '我接受改到晚上九点', '我提出改到下周白天再见'],
        },
        {
          title: '退休金支出边界',
          severity: '中等',
          locationKey: 'shop',
          scene: '商店里，我和常驻居民A正在核对共同开销。',
          trigger: '我看到对方发来的账单里多了 680 元给亲戚买药的钱，她说先从我的退休金里垫一下。',
          participants: ['我', '常驻居民A'],
          questionLink: '测试共同生活里的金钱边界。',
          informationGoal: '看我是否能及时说清财务规则。',
          judgmentSignal: '能当场说明垫付边界偏稳定；怕尴尬直接付款偏边界弱。',
          responseOptions: ['我说明只能垫一次并写清用途', '我请她自己确认还款时间', '我拒绝算进共同开支'],
        },
        {
          title: '回岳阳后的两地安排',
          severity: '中等',
          locationKey: 'station',
          scene: '车站里，我和常驻居民A正在看回岳阳安排。',
          trigger: '我拿出下个月去岳阳看房的车票截图，相亲对象说她最多春节住两周，长期还是想留在长沙照顾母亲。',
          participants: ['我', '常驻居民A'],
          questionLink: '测试共同生活地点是否真能落地。',
          informationGoal: '看我会不会追问长期安排。',
          judgmentSignal: '能追问时间表和照护责任偏现实；只说以后再看偏回避关键条件。',
          responseOptions: ['我追问她能接受的居住节奏', '我提出两地过渡半年', '我承认地点不合适先降温'],
        },
      ],
      ['见面节奏', '经济边界', '居住地点'],
    );

    expect(plans?.map((plan) => plan.title)).toEqual([
      '相亲对象临时改见面时间',
      '退休金支出边界',
      '回岳阳后的两地安排',
    ]);
  });

  test('keeps concrete life events when optional judgment fields are missing', () => {
    const plans = cleanEventPlans(
      [
        {
          title: '医保报销比例焦虑',
          severity: '中等',
          locationKey: 'clinic',
          scene: '白榆诊所里，我和常驻居民A正在讨论回岳阳后的医保报销差异。',
          trigger: '我听到岳阳本地医院医保报销比例和现在不同，担心以后看病费用增加，常驻居民A问我要不要先核对政策再决定住处。',
          participants: ['我', '常驻居民A'],
          observationAxis: '医疗财务规划',
          informationGoal: '观察用户是否会把医疗费用纳入退休生活规划。',
          judgmentSignal: '能否主动核对政策并调整计划。',
        },
      ],
      ['医疗财务规划'],
    );

    expect(plans).toHaveLength(1);
    expect(plans?.[0].questionLink).toContain('医疗财务规划');
    expect(plans?.[0].responseOptions).toHaveLength(3);
    expect(plans?.[0].consequenceOptions).toHaveLength(3);
  });

  test('replaces unsupported event location keys with a content-based map location', () => {
    const plans = cleanEventPlans(
      [
        {
          title: '相亲对象临时改地点',
          severity: '中等',
          locationKey: 'restaurant',
          scene: '晨桥咖啡馆里，我和常驻居民A正在确认见面安排。',
          trigger: '我刚约好周六下午三点见面，对方发消息说想临时改到更远的地方，因为她不想被熟人看到。',
          participants: ['我', '常驻居民A'],
          questionLink: '测试我是否能识别见面安排里的边界和风险。',
          informationGoal: '看我是否会追问改地点原因。',
          judgmentSignal: '能问清原因并保留安全边界偏稳定。',
          responseOptions: ['我要求说明改地点原因', '我提出仍在公开地点见面', '我暂缓这次见面'],
          stakes: {
            timeCost: '临时改地点会浪费周六下午三点的见面窗口。',
            relationshipCost: '坚持公开地点可能让对方觉得我不够信任她。',
          },
          consequenceOptions: [
            { userAction: '我要求说明改地点原因', relationshipDelta: '对方会感到被追问，但边界更明确。', unlocks: '后续可以判断她是否尊重安全边界。' },
            { userAction: '我暂缓这次见面', relationshipDelta: '关系热度下降但风险降低。', unlocks: '后续转向验证沟通诚意。' },
          ],
        },
        {
          title: '回岳阳后的两地安排',
          severity: '中等',
          locationKey: 'station',
          scene: '车站里，我和常驻居民A正在看回岳阳安排。',
          trigger: '我拿出下个月去岳阳看房的车票截图，相亲对象发消息说她最多春节住两周，长期还是想留在长沙照顾母亲。',
          participants: ['我', '常驻居民A'],
          questionLink: '测试共同生活地点是否真能落地。',
          informationGoal: '看我会不会追问长期安排，还是先忽略地点冲突。',
          judgmentSignal: '能追问时间表和照护责任偏现实；只说以后再看偏回避关键条件。',
          responseOptions: ['我追问她能接受的居住节奏', '我提出两地过渡半年', '我承认地点不合适先降温'],
          stakes: {
            timeCost: '如果改成两地过渡，至少要多花半年确认节奏。',
            relationshipCost: '直接追问会让对方感到压力，但能暴露真实条件。',
          },
          consequenceOptions: [
            { userAction: '我追问她能接受的居住节奏', relationshipDelta: '对方会更清楚我的底线，也可能更警惕。', unlocks: '后续可以验证老家生活能否落地。' },
            { userAction: '我承认地点不合适先降温', relationshipDelta: '关系热度下降但误解减少。', unlocks: '后续转向寻找更匹配对象。' },
          ],
        },
        {
          title: '退休金支出边界',
          severity: '中等',
          locationKey: 'shop',
          scene: '商店里，我和常驻居民A正在核对共同开销。',
          trigger: '我看到对方发来的账单里多了 680 元给亲戚买药的钱，她说先从我的退休金里垫一下，月底再看还不还。',
          participants: ['我', '常驻居民A'],
          questionLink: '测试共同生活里的金钱边界。',
          informationGoal: '看我是否能及时说清财务规则。',
          judgmentSignal: '能当场说明垫付边界偏稳定；怕尴尬直接付款偏边界弱。',
          responseOptions: ['我说明只能垫一次并写清用途', '我请她自己确认还款时间', '我拒绝算进共同开支'],
          stakes: {
            moneyCost: '这笔 680 元会测试退休金共同支出的边界。',
            relationshipCost: '拒绝垫付可能让对方亲戚关系变紧张。',
          },
          consequenceOptions: [
            { userAction: '我说明只能垫一次并写清用途', relationshipDelta: '对方会知道我愿意帮忙但有边界。', unlocks: '后续可以讨论共同账户规则。' },
            { userAction: '我拒绝算进共同开支', relationshipDelta: '对方可能失望但财务边界更清楚。', unlocks: '后续验证对方是否尊重边界。' },
          ],
        },
      ],
      ['见面边界', '居住地点', '经济边界'],
    );

    expect(plans?.[0].locationKey).toBe('cafe');
  });

  test('spreads repeated generated locations across better-fitting visible facilities', () => {
    const plans = cleanEventPlans(
      [
        {
          title: '伴侣的子女抚养边界',
          severity: '重大',
          locationKey: 'clinic',
          scene: '白榆诊所里，我和常驻居民A正在确认家庭责任。',
          trigger: '我收到相亲对象的微信，她说如果明年回岳阳同住，希望我帮她照看正在上初中的儿子，并分担教育费用。',
          participants: ['我', '常驻居民A'],
          questionLink: '测试我是否能接受带子女对象的家庭责任。',
          informationGoal: '看我是否会把感情期待和子女责任分开谈清楚。',
          judgmentSignal: '能说清抚养边界和钱的安排偏现实；只说喜欢就接受偏风险高。',
          responseOptions: ['我先问清孩子教育责任', '我说明只能逐步参与', '我暂缓继续接触'],
          stakes: {
            moneyCost: '教育费用会影响退休金安排。',
            relationshipCost: '追问边界可能让对方觉得我计较。',
          },
          consequenceOptions: [
            { userAction: '我先问清孩子教育责任', relationshipDelta: '对方会更清楚我的底线。', unlocks: '后续可以讨论共同生活边界。' },
            { userAction: '我暂缓继续接触', relationshipDelta: '关系热度下降但风险降低。', unlocks: '后续转向寻找责任更清晰的人。' },
          ],
        },
        {
          title: '退休金支出边界',
          severity: '中等',
          locationKey: 'clinic',
          scene: '白榆诊所里，我和常驻居民A正在核对共同开销。',
          trigger: '我看到对方发来的账单里多了 680 元给亲戚买药的钱，她说先从我的退休金里垫一下，月底再看还不还。',
          participants: ['我', '常驻居民A'],
          questionLink: '测试共同生活里的金钱边界。',
          informationGoal: '看我是否能及时说清财务规则。',
          judgmentSignal: '能当场说明垫付边界偏稳定；怕尴尬直接付款偏边界弱。',
          responseOptions: ['我说明只能垫一次并写清用途', '我请她自己确认还款时间', '我拒绝算进共同开支'],
          stakes: {
            moneyCost: '这笔 680 元会测试退休金共同支出的边界。',
            relationshipCost: '拒绝垫付可能让对方亲戚关系变紧张。',
          },
          consequenceOptions: [
            { userAction: '我说明只能垫一次并写清用途', relationshipDelta: '对方会知道我愿意帮忙但有边界。', unlocks: '后续可以讨论共同账户规则。' },
            { userAction: '我拒绝算进共同开支', relationshipDelta: '对方可能失望但财务边界更清楚。', unlocks: '后续验证对方是否尊重边界。' },
          ],
        },
        {
          title: '回岳阳后的两地安排',
          severity: '中等',
          locationKey: 'clinic',
          scene: '白榆诊所里，我和常驻居民A正在看回岳阳安排。',
          trigger: '我拿出下个月去岳阳看房的车票截图，相亲对象发消息说她最多春节住两周，长期还是想留在长沙照顾母亲。',
          participants: ['我', '常驻居民A'],
          questionLink: '测试共同生活地点是否真能落地。',
          informationGoal: '看我会不会追问长期安排，还是先忽略地点冲突。',
          judgmentSignal: '能追问时间表和照护责任偏现实；只说以后再看偏回避关键条件。',
          responseOptions: ['我追问她能接受的居住节奏', '我提出两地过渡半年', '我承认地点不合适先降温'],
          stakes: {
            timeCost: '如果改成两地过渡，至少要多花半年确认节奏。',
            relationshipCost: '直接追问会让对方感到压力，但能暴露真实条件。',
          },
          consequenceOptions: [
            { userAction: '我追问她能接受的居住节奏', relationshipDelta: '对方会更清楚我的底线，也可能更警惕。', unlocks: '后续可以验证老家生活能否落地。' },
            { userAction: '我承认地点不合适先降温', relationshipDelta: '关系热度下降但误解减少。', unlocks: '后续转向寻找更匹配对象。' },
          ],
        },
      ],
      ['家庭责任', '经济边界', '居住地点'],
    );

    expect(plans?.map((plan) => plan.locationKey)).toEqual(['clinic', 'shop', 'station']);
    expect(plans?.[1].scene).toContain('商店');
    expect(plans?.[2].scene).toContain('车站');
  });

  test('limits repeated event motifs while keeping distinct life pressures', () => {
    const paperworkPlan = (title: string, trigger: string) => ({
      title,
      severity: '中等',
      locationKey: 'office',
      scene: '社区办公室里，我和常驻居民A正在确认现实条件。',
      trigger,
      participants: ['我', '常驻居民A'],
      questionLink: '测试共同生活安排是否能落地。',
      informationGoal: '看我是否能把现实条件说清楚。',
      judgmentSignal: '能具体说明条件偏现实；只说再看看偏回避。',
      responseOptions: ['我把条件写清楚', '我请对方补充说明', '我暂缓继续推进'],
      stakes: {
        timeCost: '如果继续补材料，至少会耽误下周的见面安排。',
        relationshipCost: '反复补材料会让对方觉得这件事很麻烦。',
      },
      consequenceOptions: [
        { userAction: '我把条件写清楚', relationshipDelta: '对方会更清楚我的底线。', unlocks: '后续可以继续确认共同生活安排。' },
        { userAction: '我暂缓继续推进', relationshipDelta: '关系热度下降但误解减少。', unlocks: '后续转向重新验证匹配度。' },
      ],
    });

    const plans = cleanEventPlans(
      [
        paperworkPlan('同住登记材料缺项', '我收到周五下午的登记提醒，社区办公室说同住登记还缺一份房产证明。'),
        paperworkPlan('医保材料补交流程', '我刚接到电话，对方说如果下个月一起住，医保关系还要补交一张表格。'),
        paperworkPlan('房产证明窗口改约', '我拿着周三上午的预约截图，窗口临时改到下周，影响我和相亲对象确认住处。'),
        {
          title: '退休金支出边界',
          severity: '中等',
          locationKey: 'shop',
          scene: '商店里，我和常驻居民A正在核对共同开销。',
          trigger: '我看到对方发来的账单里多了 680 元给亲戚买药的钱，她说先从我的退休金里垫一下。',
          participants: ['我', '常驻居民A'],
          questionLink: '测试共同生活里的金钱边界。',
          informationGoal: '看我是否能及时说清财务规则。',
          judgmentSignal: '能当场说明垫付边界偏稳定；怕尴尬直接付款偏边界弱。',
          responseOptions: ['我说明只能垫一次并写清用途', '我请她自己确认还款时间', '我拒绝算进共同开支'],
          stakes: {
            moneyCost: '这笔 680 元会测试退休金共同支出的边界。',
            relationshipCost: '拒绝垫付可能让对方亲戚关系变紧张。',
          },
          consequenceOptions: [
            { userAction: '我说明只能垫一次并写清用途', relationshipDelta: '对方会知道我愿意帮忙但有边界。', unlocks: '后续可以讨论共同账户规则。' },
            { userAction: '我拒绝算进共同开支', relationshipDelta: '对方可能失望但财务边界更清楚。', unlocks: '后续验证对方是否尊重边界。' },
          ],
        },
        {
          title: '回岳阳后的两地安排',
          severity: '中等',
          locationKey: 'station',
          scene: '车站里，我和常驻居民A正在看回岳阳安排。',
          trigger: '我拿出下个月去岳阳看房的车票截图，相亲对象说她最多春节住两周。',
          participants: ['我', '常驻居民A'],
          questionLink: '测试共同生活地点是否真能落地。',
          informationGoal: '看我会不会追问长期安排。',
          judgmentSignal: '能追问时间表和照护责任偏现实；只说以后再看偏回避关键条件。',
          responseOptions: ['我追问她能接受的居住节奏', '我提出两地过渡半年', '我承认地点不合适先降温'],
          stakes: {
            timeCost: '如果改成两地过渡，至少要多花半年确认节奏。',
            relationshipCost: '直接追问会让对方感到压力，但能暴露真实条件。',
          },
          consequenceOptions: [
            { userAction: '我追问她能接受的居住节奏', relationshipDelta: '对方会更清楚我的底线，也可能更警惕。', unlocks: '后续可以验证老家生活能否落地。' },
            { userAction: '我承认地点不合适先降温', relationshipDelta: '关系热度下降但误解减少。', unlocks: '后续转向寻找更匹配对象。' },
          ],
        },
      ],
      ['手续负担', '经济边界', '居住地点'],
    );

    expect(plans?.filter((plan) => /材料|证明|登记|表格|窗口/.test(plan.title)).length).toBe(1);
    expect(plans?.map((plan) => plan.title)).toContain('退休金支出边界');
    expect(plans?.map((plan) => plan.title)).toContain('回岳阳后的两地安排');
  });

  test('keeps enough distinct relationship and hometown-fit events from local model output', () => {
    const basePlan = (title: string, locationKey: string, trigger: string, scene: string) => ({
      title,
      severity: '中等',
      locationKey,
      scene,
      trigger,
      participants: ['我', '常驻居民A'],
      questionLink: '测试回岳阳共同生活是否能落地。',
      informationGoal: '看我是否会把真实限制和伴侣感受一起考虑。',
      judgmentSignal: '能说清条件偏现实；只靠一句以后再看偏回避。',
      responseOptions: ['我问清具体限制', '我提出先短住一个月', '我暂缓继续推进'],
      stakes: {
        timeCost: '如果继续推进，至少要花几周确认共同生活节奏。',
        relationshipCost: '追问现实限制可能让对方觉得压力变大。',
      },
      consequenceOptions: [
        { userAction: '问清限制', relationshipDelta: '对方知道我在认真评估。', unlocks: '后续可以验证共同生活条件。' },
        { userAction: '暂缓推进', relationshipDelta: '关系热度下降但误解减少。', unlocks: '后续转向重新寻找匹配对象。' },
      ],
    });

    const plans = cleanEventPlans(
      [
        basePlan(
          '回岳阳时间节点的紧迫性',
          'station',
          '用户收到工作调动或退休通知，需在一个月内回岳阳，但意向对象尚未辞去外地工作。',
          '车站里，我与常驻居民A讨论何时回岳阳定居。',
        ),
        basePlan(
          '伴侣对岳阳气候的适应',
          'cafe',
          '意向对象表示对岳阳气候不适应，抱怨夏天太热冬天太冷，询问是否有办法改善。',
          '晨桥咖啡馆里，我与常驻居民A讨论岳阳气候。',
        ),
        basePlan(
          '伴侣对岳阳方言的适应',
          'square',
          '意向对象表示在本地购物时听不懂岳阳方言，担心以后社交只能依赖我。',
          '钟楼广场里，我与常驻居民A讨论方言适应。',
        ),
        basePlan(
          '伴侣对岳阳医疗资源的依赖',
          'clinic',
          '意向对象表示在岳阳看病不如外地方便，担心突发疾病时没有足够医疗保障。',
          '白榆诊所里，我与常驻居民A讨论医疗保障。',
        ),
        basePlan(
          '财务共同账户的设立争议',
          'office',
          '意向对象提出设立共同账户用于家庭开支，但要求查询各自的私人账户余额。',
          '社区办公室里，我与常驻居民A讨论共同账户。',
        ),
        basePlan(
          '伴侣对岳阳人情社会的适应',
          'square',
          '意向对象表示对岳阳的人情往来感到疲惫，不愿参与亲戚聚会和送礼。',
          '钟楼广场里，我与常驻居民A讨论人情往来。',
        ),
        basePlan(
          '岳阳房产装修风格的争议',
          'shop',
          '意向对象提出希望重新装修岳阳房产，风格与我现有喜好完全不同。',
          '商店里，我与常驻居民A讨论装修选择。',
        ),
      ],
      ['居住地点', '气候适应', '方言社交', '医疗保障', '财务边界', '人情往来', '生活空间'],
    );

    expect(plans).toHaveLength(7);
    expect(plans?.map((plan) => plan.title)).toContain('伴侣对岳阳气候的适应');
    expect(plans?.map((plan) => plan.title)).toContain('伴侣对岳阳医疗资源的依赖');
  });
});
