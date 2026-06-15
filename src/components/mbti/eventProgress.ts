export type EventProgressStatus = 'seeded' | 'triggered' | 'observed' | 'resolved' | string;

export type EventProgressItem = {
  _id?: string;
  title: string;
  description: string;
  status: EventProgressStatus;
  probeOrigin?: 'initial' | 'adaptive' | 'calibration';
  timelineTriggerReason?: string;
  scheduledDay?: number;
  scheduledPhase?: 'morning' | 'afternoon' | 'evening' | 'night';
};

export type EventProgressRecord = {
  mbtiEventId?: string;
  title: string;
  description: string;
};

export type EventEvidenceMessage = {
  _id: string;
  author: string;
  text: string;
  _creationTime?: number;
};

export function eventStatusLabel(status: EventProgressStatus) {
  switch (status) {
    case 'seeded':
      return '待触发';
    case 'candidate':
      return '备用观察';
    case 'delayed':
      return '条件不足';
    case 'moving':
      return '正在进入现场';
    case 'conversation_pending':
      return '等待相关对话';
    case 'triggered':
      return '已触发，等证据';
    case 'pending_user_response':
      return '可反馈';
    case 'observed':
      return '已有证据';
    case 'responded':
      return '已反馈';
    case 'skipped':
      return '已略过反馈';
    case 'expired_to_stage_report':
      return '已转阶段报告';
    case 'resolved':
      return '已纳入结论';
    case 'failed':
      return '触发失败';
    default:
      return status;
  }
}

export function eventIsTriggeredOrBeyond(status: EventProgressStatus) {
  return status !== 'seeded' && status !== 'candidate' && status !== 'delayed';
}

export function eventTimelineReasonText(reason?: string) {
  if (reason === 'town_life_generated_probe' || reason === 'timeline_probe_after_town_life_progress') {
    return '居民生活线推进后，系统发现还需要一个新的现实片段继续观察。';
  }
  if (reason === 'decision_state_generated_probe') {
    return '当前答案位置还不够明确，系统追加一个事件来验证关键变量。';
  }
  if (reason === 'user_calibration_generated_probe') {
    return '根据你的校准回答生成，用来修正模拟的“我”和真实边界之间的偏差。';
  }
  if (reason === 'opening_probe_after_user_entry') {
    return '用户入镇后的开场探针，用来建立第一批可观察证据。';
  }
  return '由当前小镇状态生成，用来补足还缺失的观察证据。';
}

export function summarizeEventRuntime(events: EventProgressItem[]) {
  const originCounts = {
    initial: 0,
    timeline: 0,
    calibration: 0,
    other: 0,
  };
  const statusCounts = {
    occurred: 0,
    waitingTimeline: 0,
    dynamicGenerated: 0,
  };
  for (const event of events) {
    const origin = eventRuntimeOrigin(event);
    originCounts[origin] += 1;
    if (eventIsTriggeredOrBeyond(event.status)) {
      statusCounts.occurred += 1;
    } else if (event.status === 'candidate' || event.status === 'delayed' || event.status === 'seeded') {
      statusCounts.waitingTimeline += 1;
    }
    if (origin === 'timeline' || origin === 'calibration') {
      statusCounts.dynamicGenerated += 1;
    }
  }
  const nextTimelineEvent = events
    .filter((event) => event.status === 'candidate' || event.status === 'delayed' || event.status === 'seeded')
    .sort(
      (left, right) =>
        (left.scheduledDay ?? Number.MAX_SAFE_INTEGER) - (right.scheduledDay ?? Number.MAX_SAFE_INTEGER) ||
        phaseRank(left.scheduledPhase) - phaseRank(right.scheduledPhase),
    )[0];
  return {
    originCounts,
    statusCounts,
    nextTimelineEvent,
  };
}

function eventRuntimeOrigin(event: EventProgressItem): keyof ReturnType<typeof emptyOriginCounts> {
  if (event.probeOrigin === 'calibration' || event.timelineTriggerReason === 'user_calibration_generated_probe') {
    return 'calibration';
  }
  if (
    event.timelineTriggerReason === 'town_life_generated_probe' ||
    event.timelineTriggerReason === 'decision_state_generated_probe' ||
    event.timelineTriggerReason === 'timeline_probe_after_town_life_progress'
  ) {
    return 'timeline';
  }
  if (event.probeOrigin === 'initial' || event.timelineTriggerReason === 'opening_probe_after_user_entry') {
    return 'initial';
  }
  return 'other';
}

function emptyOriginCounts() {
  return {
    initial: 0,
    timeline: 0,
    calibration: 0,
    other: 0,
  };
}

function phaseRank(phase?: EventProgressItem['scheduledPhase']) {
  const ranks = {
    morning: 0,
    afternoon: 1,
    evening: 2,
    night: 3,
  };
  return phase ? ranks[phase] : 0;
}

export function shouldShowRuntimeCalibrationControls({
  hasEventRecord,
  hasSavedUserResponse,
  isCalibrationCandidate,
  manualCalibrationMode,
}: {
  hasEventRecord: boolean;
  hasSavedUserResponse: boolean;
  isCalibrationCandidate: boolean;
  manualCalibrationMode: boolean;
}) {
  if (!manualCalibrationMode) {
    return false;
  }
  if (hasSavedUserResponse) {
    return true;
  }
  return isCalibrationCandidate && hasEventRecord;
}

export function shouldShowEventCorrectionControls({
  hasEventRecord,
  hasSavedUserResponse,
  showInlineResponse,
}: {
  hasEventRecord: boolean;
  hasSavedUserResponse: boolean;
  showInlineResponse: boolean;
}) {
  if (!showInlineResponse) {
    return false;
  }
  return hasEventRecord || hasSavedUserResponse;
}

export function eventSourceSummaryText(originCounts: {
  initial: number;
  timeline: number;
  calibration: number;
  other?: number;
}) {
  const parts = [
    `初始 ${originCounts.initial}`,
    `时间线 ${originCounts.timeline}`,
  ];
  if (originCounts.calibration > 0) {
    parts.push(`用户纠正 ${originCounts.calibration}`);
  }
  if ((originCounts.other ?? 0) > 0) {
    parts.push(`其他 ${originCounts.other}`);
  }
  return parts.join(' · ');
}

export function compactText(text: string, maxLength: number) {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

export function eventResultSummary(
  event: EventProgressItem,
  recordedResult?: string,
) {
  return compactText(recordedResult || event.description || event.title, event.status === 'seeded' ? 72 : 110);
}

export function eventRecordMap(records: EventProgressRecord[]) {
  const map = new Map<string, string>();
  for (const record of records) {
    if (record.mbtiEventId) {
      map.set(record.mbtiEventId, record.description);
    }
    if (record.title) {
      map.set(record.title, record.description);
    }
  }
  return map;
}

export function plannedEventSections(description: string) {
  const normalized = description.replace(/\s+/g, ' ').trim();
  return {
    scene: pickSection(normalized, '场景', '具体事情') ?? '',
    trigger: pickSection(normalized, '具体事情', '参与者') ?? normalized,
    participants: pickSection(normalized, '参与者', '观察维度')
      ?? pickSection(normalized, '参与者', '想获得的信息')
      ?? '',
    observationAxis: pickSection(normalized, '观察维度', '问题关联') ?? '',
    questionLink: pickSection(normalized, '问题关联', '想获得的信息') ?? '',
    informationGoal: pickSection(normalized, '想获得的信息', '可评判信号') ?? '',
    judgmentSignal: pickSection(normalized, '可评判信号') ?? '',
  };
}

export type PlannedEventSections = ReturnType<typeof plannedEventSections>;

export function eventResponsePrompt(planned: PlannedEventSections, title: string) {
  const trigger = planned.trigger || title;
  const axis = planned.observationAxis || planned.informationGoal || '你的真实反应';
  return `如果小镇里模拟的“我”遇到「${compactText(trigger, 42)}」，在“${compactText(axis, 24)}”这个问题上明显偏离你，你会怎样校准？`;
}

export function eventResponseOptions(planned: PlannedEventSections, title: string) {
  const axis = `${planned.observationAxis} ${planned.questionLink} ${planned.informationGoal} ${title}`;
  if (/收入|稳定|风险|现金|钱|成本|安全|工作|辞职|创业/.test(axis)) {
    return [
      '我会先确认收入、住处或基本保障是否稳妥',
      '我会继续争取自己想要的选择',
      '我会先准备一个过渡办法再决定',
      '这个情境不符合我',
    ];
  }
  if (/关系|伴侣|对象|家人|沟通|修复|边界|误解/.test(axis)) {
    return [
      '我会直接把担心和需求说清楚',
      '我会先退开，等情绪稳定后再谈',
      '我会说明我不能接受的边界',
      '这个情境不符合我',
    ];
  }
  if (/信息|不确定|核实|确认|选择|冲突|排序|优先级/.test(axis)) {
    return [
      '我会先问清楚关键信息再决定',
      '我会按原计划继续推进',
      '我会改用另一个可行方案',
      '这个情境不符合我',
    ];
  }
  return [
    '我会先处理眼前最具体的问题',
    '我会先观察一下，不马上表态',
    '我会换一个更可行的办法',
    '这个情境不符合我',
  ];
}

function pickSection(text: string, startLabel: string, endLabel?: string) {
  const start = `${startLabel}：`;
  const startIndex = text.indexOf(start);
  if (startIndex < 0) {
    return undefined;
  }
  const contentStart = startIndex + start.length;
  const endIndex = endLabel ? text.indexOf(`${endLabel}：`, contentStart) : -1;
  const raw = endIndex >= 0 ? text.slice(contentStart, endIndex) : text.slice(contentStart);
  const value = raw.trim().replace(/[。；;，,]$/, '');
  if (!value) {
    return undefined;
  }
  return value;
}

export function guidanceResultText({
  completed,
  events,
  records,
  started,
}: {
  completed: boolean;
  events: EventProgressItem[];
  records: EventProgressRecord[];
  started: boolean;
}) {
  const triggeredEvents = events.filter((event) => eventIsTriggeredOrBeyond(event.status)).length;
  const recordsByKey = eventRecordMap(records);
  const evidencedEvents = events.filter((event) => recordsByKey.has(event._id ?? '') || recordsByKey.has(event.title)).length;
  if (completed) {
    return `已形成整体结论。${evidencedEvents}/${events.length || 0} 个事件有对应记录；结论来自已完成的观察标准，不是因为固定时长耗尽。`;
  }
  if (triggeredEvents > 0) {
    return `已触发 ${triggeredEvents}/${events.length || 0} 个当前事件，其中 ${evidencedEvents} 个已进入事件记录；系统会按证据缺口继续生成后续事件。`;
  }
  if (started) {
    return '演化正在运行，等待第一个计划事件真实触发并进入事件记录。';
  }
  return '还没开始演化，暂时没有结果。';
}

export function selectEventRelatedMessages({
  eventText,
  limit = 3,
  messages,
  participantIds,
  recordText,
  windowEnd,
  windowStart,
}: {
  eventText: string;
  limit?: number;
  messages: EventEvidenceMessage[];
  participantIds: Set<string>;
  recordText?: string;
  windowEnd: number;
  windowStart: number;
}) {
  const keywords = eventEvidenceKeywords(`${eventText} ${recordText ?? ''}`);
  return messages
    .filter((message) => {
      if (participantIds.size > 0 && !participantIds.has(message.author)) {
        return false;
      }
      if (typeof message._creationTime !== 'number') {
        return false;
      }
      if (message._creationTime < windowStart || message._creationTime >= windowEnd) {
        return false;
      }
      return isMessageRelatedToEvent(message.text, keywords);
    })
    .sort((a, b) =>
      ((a._creationTime ?? 0) - (b._creationTime ?? 0)) || a._id.localeCompare(b._id)
    )
    .slice(0, limit);
}

export function eventEvidenceKeywords(text: string) {
  const normalized = text
    .replace(/(场景|具体事情|参与者|观察维度|问题关联|想获得的信息|可评判信号|计划|实际|结论|事件记录)：/g, ' ')
    .replace(/[，。；;、,.!?！？:：()[\]{}“”"'「」]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const rawTerms = normalized.match(/[\u4e00-\u9fa5A-Za-z0-9]+/g) ?? [];
  const keywords = new Set<string>();
  for (const rawTerm of rawTerms) {
    const term = rawTerm.trim();
    if (!term || eventKeywordStopwords.has(term)) {
      continue;
    }
    if (/^[A-Za-z0-9]+$/.test(term)) {
      if (term.length >= 3) {
        keywords.add(term.toLowerCase());
      }
      continue;
    }
    if (term.length <= 4) {
      if (term.length >= 2 && !eventKeywordStopwords.has(term)) {
        keywords.add(term);
      }
      continue;
    }
    for (let size = 2; size <= 4; size += 1) {
      for (let index = 0; index <= term.length - size; index += 1) {
        const keyword = term.slice(index, index + size);
        if (!eventKeywordStopwords.has(keyword)) {
          keywords.add(keyword);
        }
      }
    }
  }
  return keywords;
}

function isMessageRelatedToEvent(text: string, keywords: Set<string>) {
  if (keywords.size === 0) {
    return false;
  }
  const normalized = text.toLowerCase();
  for (const keyword of keywords) {
    if (keyword.length >= 2 && normalized.includes(keyword.toLowerCase())) {
      return true;
    }
  }
  return false;
}

const eventKeywordStopwords = new Set([
  '一个',
  '一些',
  '不是',
  '不能',
  '他们',
  '你们',
  '我们',
  '你',
  '我',
  '他',
  '她',
  '它',
  '是否',
  '已经',
  '这个',
  '那个',
  '这里',
  '那里',
  '现在',
  '刚才',
  '开始',
  '进行',
  '出现',
  '发生',
  '观察',
  '信息',
  '行为',
  '反应',
  '用户',
  '角色',
  '居民',
  '对方',
  '事情',
  '具体',
  '场景',
  '事件',
  '小镇',
  '系统',
  '时候',
  '需要',
  '可能',
  '如果',
  '因为',
  '以及',
  '或者',
  '然后',
  '直接',
  '临时',
  '真实',
]);
