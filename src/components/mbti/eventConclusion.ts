import { compactText } from './eventProgress';

export type ConclusionEvidenceItem = {
  kind: '行为' | '聊天' | '内心';
  text: string;
};

export type DirectEventConclusion = {
  summary: string;
  evidenceItems: ConclusionEvidenceItem[];
  inference: string;
  next?: string;
};

export type DirectEventContext = {
  title?: string;
  description?: string;
  testedVariable?: string;
  questionLink?: string;
  informationGoal?: string;
  plannedTrigger?: string;
};

function conclusionResult(
  summary: string,
  evidenceItems: ConclusionEvidenceItem[],
  inference: string,
  next?: string,
): DirectEventConclusion {
  return {
    summary: plainSummary(summary),
    evidenceItems,
    inference: plainInference(inference),
    next: next ? plainInference(next) : undefined,
  };
}

function plainSummary(summary: string) {
  const summaryMap: Record<string, string> = {
    更可能守住原计划: '他这次更像是先守住自己的安排',
    更可能让社交改写日程: '他这次更像是会被临时社交带走',
    更可能先划清时间边界: '他这次先把自己的时间边界说出来了',
    更可能重新安排日程: '他这次是在重新排时间',
    更可能先核对事实: '他这次先想把事情问清楚',
    更可能改用替代方案: '他这次没有卡住，开始找别的办法',
    更可能主动寻找支持: '他这次会主动找人帮忙',
    更可能先稳定等待: '他这次先稳住自己，没有马上急起来',
    更可能继续执行下一步: '他这次还在继续往前处理',
    更可能把情绪转成行动: '他这次把情绪先转成了具体行动',
    更可能先退出现场: '他这次先离开现场，避免继续被刺激',
    更可能暂时拉开距离: '他这次先把距离拉开',
    更可能把话说清楚: '他这次会直接把话问清楚',
    更可能先守住边界: '他这次先守住自己的边界',
    更可能先被打断感影响: '他这次明显被打扰到了',
    更可能愿意接住对方: '他这次愿意接住对方的靠近',
    更可能先解释自己的处境: '他这次先解释自己为什么这样做',
    更可能继续当面沟通: '他这次还愿意把话谈完',
    更可能用行动维持连接: '他没有直接走开，还在处理这件事',
    对象在主动靠近: '现在主要是对方在靠近',
    '对象主动，用户态度未明': '对方有动作，但还看不清“我”的态度',
    '已有回应，但方向还浅': '已经有反应了，但还看不出最终会怎么做',
    '证据不足，暂不能判定倾向': '现在还不够判断',
  };
  return summaryMap[summary] ?? summary.replace(/^更可能/, '他这次更像是');
}

function plainInference(text: string) {
  return text
    .replace(/他的行动还在维持现场/g, '他的动作还停留在这件事上')
    .replace(/行动还在维持现场/g, '动作还停留在这件事上')
    .replace(/用户自己/g, '“我”自己')
    .replace(/用户/g, '他')
    .replace(/倾向/g, '更像哪种反应')
    .replace(/维持现场/g, '还在处理眼前这件事')
    .replace(/行为还在/g, '动作上还在')
    .replace(/事件记录/g, '真实发生记录')
    .replace(/辅助证据/g, '辅助线索')
    .replace(/校准修正/g, '后面再改判断')
    .replace(/可见片段：/g, '我看到的依据是：');
}

function contextualConstructiveConclusion(
  eventContextText: string,
  combinedText: string,
  evidenceItems: ConclusionEvidenceItem[],
) {
  const planText = eventContextText;
  const evidenceText = combinedText;
  const allText = `${planText} ${evidenceText}`;
  const isRetirementEmotionProbe = /退休|心理韧性|焦虑|失落|无法静下心/.test(planText)
    || /旧物|收音机|离开当前场面|暂停继续|不知所措|心浮气躁/.test(evidenceText);
  const isHouseRepairProbe = /老家|漏水|房屋|屋顶|维修决策|将就维修|专业团队/.test(planText)
    && /漏水|屋顶|专业团队|承担费用|预约上门|拒绝将就|维修/.test(evidenceText);

  if (isRetirementEmotionProbe) {
    return conclusionResult(
      '他这次先让自己缓一缓',
      evidenceItems,
      '这件事看的不是有没有把旧东西修好，而是情绪乱起来时他会不会硬撑。现在他先离开现场，说明他在给自己降压，但还没看到后续怎么恢复。',
      '后面要看：缓过来以后，他会回来继续处理，还是把这类事长期搁置。',
    );
  }
  if (isHouseRepairProbe) {
    return conclusionResult(
      '他这次更像是愿意花成本把问题处理干净',
      evidenceItems,
      '这件事不是单纯“还在处理”。房屋出问题时，他选择找专业团队、承担费用，没有为了省钱或面子硬凑。',
      '后面要看：遇到长期生活成本时，他是继续按质量优先，还是开始因为钱和压力退缩。',
    );
  }
  if (/钱|收入|存款|退休金|预算|财务|投资|报价|费用|风险|保障/.test(allText)) {
    return conclusionResult(
      '他这次先把钱和风险算清楚',
      evidenceItems,
      '他不是只凭感觉往前冲，而是在把成本、风险和可承受程度放到前面看。',
      '后面要看：算清楚以后，他能不能做出决定，而不是一直停在担心里。',
    );
  }
  if (/不回消息|回消息|暧昧|伴侣|对象|亲密|关系|联系|靠近|边界/.test(allText)) {
    return conclusionResult(
      '他这次没有立刻追着对方要答案',
      evidenceItems,
      '他还在处理这段互动，但没有马上用追问或施压把关系推紧。',
      '后面要看：他是能稳住边界继续沟通，还是慢慢变成憋着不说。',
    );
  }
  return null;
}

export function directEventConclusion(
  matchedMessages: Array<{
    author: string;
    text: string;
  }>,
  matchedThoughts: Array<{
    playerId: string;
    text: string;
  }>,
  matchedBehaviors: Array<{
    playerId: string;
    text: string;
  }>,
  playerNameById: Map<string, string>,
  scenarioContext: string,
  resolutionCriteria: string,
  hasEventRecord: boolean,
  eventContext?: DirectEventContext,
) {
  if (!hasEventRecord) {
    return conclusionResult(
      '计划未触发',
      [],
      '没有事件记录时，聊天、内心和行为都不能挂到这个计划事件下做判断。',
    );
  }
  if (matchedMessages.length === 0 && matchedThoughts.length === 0 && matchedBehaviors.length === 0) {
    return conclusionResult(
      '暂无行为结论',
      [],
      '这个事件已经触发，但还没看到对应聊天、内心或行为证据。',
    );
  }
  const normalizedMessages = matchedMessages.map((message) => ({
    name: playerNameById.get(message.author) ?? '角色',
    text: message.text,
  }));
  const userMessages = normalizedMessages.filter((message) => message.name === '我');
  const otherMessages = normalizedMessages.filter((message) => message.name !== '我');
  const userText = userMessages.map((message) => message.text).join(' ');
  const otherText = otherMessages.map((message) => message.text).join(' ');
  const thoughtText = matchedThoughts.map((thought) => thought.text).join(' ');
  const behaviorText = matchedBehaviors.map((behavior) => behavior.text).join(' ');
  const combinedText = `${userText} ${thoughtText} ${behaviorText}`;
  const evidenceItems: ConclusionEvidenceItem[] = [
    matchedBehaviors[0]?.text ? { kind: '行为', text: matchedBehaviors[0].text } : null,
    userMessages[0]?.text ? { kind: '聊天', text: userMessages[0].text } : null,
    matchedThoughts[0]?.text ? { kind: '内心', text: matchedThoughts[0].text } : null,
  ].filter((item): item is ConclusionEvidenceItem => Boolean(item));
  const fallbackEvidence = compactText(combinedText, 90);
  const userRejects = /不用|别来|不接|忙完|回跑|没空|不要|算了|不说/.test(`${userText} ${behaviorText}`);
  const userClarifies = /核对|追问|确认|说清楚|问清楚|具体原因|为什么|怎么回事/.test(combinedText);
  const userAdjusts = /调整|改选|替代|替代饮品|其他.*替代|换一个|换成|重新安排|另一个方案|先.*再/.test(combinedText);
  const userWaitsCalmly = /不急|等|等等|坐会|坐一会|慢慢|耐心|先坐|继续等/.test(combinedText) && !/太久|烦|受不了|不等/.test(combinedText);
  const userKeepsMoving = /径直|继续|前往|走向|出发|按计划|查看时间|收起手机/.test(combinedText);
  const userSeeksSupport = /询问|求助|找.*帮|请.*帮|问.*有没有|推荐|联系|打电话/.test(behaviorText);
  const userActsConstructively = /处理|记录|排队|预约|购买|改约|提交|整理|拿出|查看|前往|走向|坐下|等待/.test(behaviorText);
  const userApproaches = /我来|接你|发个定位|等你|一起|当面说|说清楚/.test(userText);
  const otherApproaches = /接你|定位|到了没|担心|头晕|忙吗|我去|陪你|等你/.test(otherText);
  const userShowsBoundary = /别|不用|不要|先别|等一下|等会|我自己|别管|别催|别翻|别动|不方便/.test(`${userText} ${behaviorText}`);
  const userShowsIrritation = /烦|急|别烦|吵|打断|麻烦|不耐烦|受不了|够了|怎么又/.test(combinedText);
  const userAcceptsHelp = /好|行|可以|谢谢|麻烦你|那你|帮我|一起|你来|听你的/.test(userText);
  const userExplainsSelf = /因为|不是|我只是|我现在|我刚才|我担心|我怕|我想先|我需要/.test(userText);
  const relationshipContext = /伴侣|女朋友|男朋友|对象|亲密|恋爱|关系修复|修复关系|吵架|和好/.test(scenarioContext);
  const timeManagementContext = /时间|日程|计划|安排|作息|节奏|自由时间|空闲|排练|邀请|社交邀请|边界|退休后的财务规划/.test(scenarioContext);
  const eventContextText = [
    scenarioContext,
    resolutionCriteria,
    eventContext?.title,
    eventContext?.description,
    eventContext?.testedVariable,
    eventContext?.questionLink,
    eventContext?.informationGoal,
    eventContext?.plannedTrigger,
  ]
    .filter(Boolean)
    .join(' ');
  const localEventContextText = [
    eventContext?.title,
    eventContext?.description,
    eventContext?.testedVariable,
    eventContext?.questionLink,
    eventContext?.informationGoal,
    eventContext?.plannedTrigger,
  ]
    .filter(Boolean)
    .join(' ');
  const focusedEventContextText = localEventContextText || eventContextText;
  const retirementEmotionContext = /退休|情绪|心理韧性|焦虑|失落|无法静下心/.test(focusedEventContextText);
  const stressContext =
    retirementEmotionContext ||
    /股市|波动|情绪|生活热情|压力|不可控|混乱|焦虑|生活节奏|投资|市场|控制|逃避|分析|情感联结/.test(
      scenarioContext,
    );
  const contextualConclusion = userActsConstructively && behaviorText
    ? contextualConstructiveConclusion(focusedEventContextText, combinedText, evidenceItems)
    : null;

  if (!relationshipContext && timeManagementContext && !retirementEmotionContext) {
    if (/不参加|不去|改天|下次|今天.*不|下午.*不|谢绝|拒绝|先.*理清|先.*整理|先.*账|理财|财务|日程/.test(combinedText)) {
      return conclusionResult(
        '更可能守住原计划',
        evidenceItems,
        '这次证据显示他没有被熟人临时邀请带走，而是温和地说明自己要先处理财务规划。这个事件考察的是自由时间边界，不是亲密或人际接纳态度。',
        '后面重点看：连续几次非强制邀请出现时，他还能不能稳定区分“我想做的事”和“别人临时塞进来的事”。',
      );
    }
    if (/好|行|可以|参加|一起|去看看|排练|合唱/.test(userText) && !/不参加|不去|改天|下次|今天.*不/.test(userText)) {
      return conclusionResult(
        '更可能让社交改写日程',
        evidenceItems,
        '他接受了临时社交安排，说明自由时间容易被熟人社会重新占用；这不一定是坏事，但会削弱退休后的自建秩序。',
        '后面重点看：这是主动选择社交，还是不好意思拒绝。',
      );
    }
    if (userExplainsSelf || userShowsBoundary) {
      return conclusionResult(
        '更可能先划清时间边界',
        evidenceItems,
        '他在解释自己的安排或表达边界，说明退休后的“自由”不是完全随波逐流，而是需要自己定义优先级。',
      );
    }
    if (userAdjusts) {
      return conclusionResult(
        '更可能重新安排日程',
        evidenceItems,
        '他没有完全拒绝，也没有完全放弃原计划，而是在尝试重排时间。',
        '后面重点看：重排是主动调度，还是被动迁就。',
      );
    }
    return conclusionResult(
      '还看不清时间边界',
      evidenceItems,
      `这个事件要看的不是关系态度，而是他如何处理自由时间和临时邀请。${fallbackEvidence ? `可见片段：${fallbackEvidence}` : ''}`,
      `后面继续看：${compactText(resolutionCriteria, 56)}。`,
    );
  }

  if (!relationshipContext && stressContext) {
    if (contextualConclusion) {
      return contextualConclusion;
    }
    if (userClarifies) {
      return conclusionResult(
        '更可能先核对事实',
        evidenceItems,
        '他没有马上被情绪带走，而是先把事情问清楚。',
        '后面重点看：遇到新阻碍时，他是不是还会先确认信息，再决定要不要改计划。',
      );
    }
    if (userAdjusts) {
      return conclusionResult(
        '更可能改用替代方案',
        evidenceItems,
        '他没有卡在原计划失败上，而是在找下一步还能怎么做。',
        '后面重点看：他会不会持续选择换方案、改顺序或重新安排。',
      );
    }
    if (userSeeksSupport) {
      return conclusionResult(
        '更可能主动寻找支持',
        evidenceItems,
        '他已经开始问人、找资源，说明压力来了以后不是只憋着，而是在往外找办法。',
      );
    }
    if (userWaitsCalmly) {
      return conclusionResult(
        '更可能先稳定等待',
        evidenceItems,
        '他接受现在确实被耽误了，但没有马上急起来，也没有直接放弃。',
        '后面重点看：他是先稳住自己，还是很快转成焦虑或逃开。',
      );
    }
    if (userKeepsMoving) {
      return conclusionResult(
        '更可能继续执行下一步',
        evidenceItems,
        '他没有停在“出问题了”这件事上，而是继续找能做的下一步。',
        '后面重点看：他能不能持续把注意力放回具体行动。',
      );
    }
    if (userActsConstructively && behaviorText) {
      return conclusionResult(
        '更可能把情绪转成行动',
        evidenceItems,
        '他已经开始做具体的小动作，说明不是完全停住或只在情绪里打转。',
      );
    }
    if (/烦|不想|算了|不要|没劲|累|受不了|不看|躲|离开/.test(combinedText)) {
      return conclusionResult(
        '更可能先退出现场',
        evidenceItems,
        '他现在更像是在先减少刺激，不想继续硬扛现场压力。',
        '后面重点看：他是短暂离开后再处理，还是持续回避。',
      );
    }
    if (userMessages.length === 0 && matchedBehaviors.length === 0) {
      return conclusionResult(
        '还看不到用户选择',
        evidenceItems,
        '现在还没有看到他自己说了什么、做了什么。',
        '所以还不能判断他后面会主动处理，还是继续被外部波动牵着走。',
      );
    }
    return conclusionResult(
      '证据不足，暂不能判定倾向',
      evidenceItems,
      `现在只能说明他有回应，但还看不清主要模式。${fallbackEvidence ? `可见片段：${fallbackEvidence}` : ''}`,
      `后面还要继续看：${compactText(resolutionCriteria, 56)}。`,
    );
  }

  if (userRejects) {
    return conclusionResult(
      '更可能暂时拉开距离',
      evidenceItems,
      '他没有顺着对方靠近，而是在拒绝、延后或退出互动，更像是先保护自己的边界。',
    );
  }
  if (userClarifies) {
    return conclusionResult(
      '更可能把话说清楚',
      evidenceItems,
      '他在追问或核对具体事实，不是单纯迎合对方。',
    );
  }
  if (userShowsBoundary) {
    return conclusionResult(
      '更可能先守住边界',
      evidenceItems,
      '他的回应里已经有“先别这样”或“不按对方节奏走”的意思，说明当下更需要空间和控制感。',
      '后面重点看：他会不会在边界稳定后继续沟通，还是直接退出互动。',
    );
  }
  if (userShowsIrritation) {
    return conclusionResult(
      '更可能先被打断感影响',
      evidenceItems,
      '他不是完全没反应，而是先表现出被打扰、被催促或被冒犯的不舒服。',
      '后面重点看：这种不舒服会不会转成明确沟通，还是继续积压成回避。',
    );
  }
  if (userAcceptsHelp) {
    return conclusionResult(
      '更可能愿意接住对方',
      evidenceItems,
      '他没有把对方推开，至少在这一刻愿意接受对方靠近或协助。',
      '后面重点看：他是稳定接住，还是只是一句礼貌回应。',
    );
  }
  if (userExplainsSelf) {
    return conclusionResult(
      '更可能先解释自己的处境',
      evidenceItems,
      '他在尝试说明自己为什么这样做，而不是直接沉默或切断关系。',
      '后面重点看：解释之后是否能进一步提出需求或方案。',
    );
  }
  if (userApproaches) {
    return conclusionResult(
      '更可能继续当面沟通',
      evidenceItems,
      '他没有结束互动，而是把对话留在同一个现场，说明还愿意把问题谈完。',
    );
  }
  if (userActsConstructively && behaviorText) {
    if (contextualConclusion) {
      return contextualConclusion;
    }
    return conclusionResult(
      '更可能用行动维持连接',
      evidenceItems,
      '虽然话不一定多，但他的行动还在维持现场，没有直接断开。',
    );
  }
  if (otherApproaches && userMessages.length === 0) {
    return conclusionResult(
      '对象在主动靠近',
      evidenceItems,
      '现在主要是对方在主动推进，还没看到用户自己的选择。',
      '后面要看模拟的“我”是否自然接住；如果偏离用户真实状态，再用校准修正。',
    );
  }
  if (otherApproaches) {
    return conclusionResult(
      '对象主动，用户态度未明',
      evidenceItems,
      '对方有靠近或关心的信号，但用户这边还不够明确。',
    );
  }
  if (userMessages.length > 0 || matchedBehaviors.length > 0) {
    return conclusionResult(
      '已有回应，但方向还浅',
      evidenceItems,
      `现在能看到他已经接了这个事件，不是完全无反应。${fallbackEvidence ? `可见片段：${fallbackEvidence}` : ''}`,
      `下一步要看这个回应会往哪边走：是继续问清楚、表达边界、接受帮助，还是转身离开。`,
    );
  }
  return conclusionResult(
    '还缺“我”的明确反应',
    evidenceItems,
    '目前主要是事件或他人的动作，还没有看到用户自己怎么接。',
    `后面继续看：${compactText(resolutionCriteria, 56)}。`,
  );
}
