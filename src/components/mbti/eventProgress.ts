export type EventProgressStatus = 'seeded' | 'triggered' | 'observed' | 'resolved' | string;

export type EventProgressItem = {
  _id?: string;
  title: string;
  description: string;
  status: EventProgressStatus;
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
    case 'moving':
      return '正在进入现场';
    case 'conversation_pending':
      return '等待相关对话';
    case 'triggered':
      return '已触发，等证据';
    case 'observed':
      return '已有证据';
    case 'resolved':
      return '已纳入结论';
    case 'failed':
      return '触发失败';
    default:
      return status;
  }
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
  const triggeredEvents = events.filter((event) => event.status !== 'seeded').length;
  const recordsByKey = eventRecordMap(records);
  const evidencedEvents = events.filter((event) => recordsByKey.has(event._id ?? '') || recordsByKey.has(event.title)).length;
  if (completed) {
    return `演化已结束。${evidencedEvents}/${events.length || 0} 个计划事件有对应记录，其余不能当作行为证据。`;
  }
  if (triggeredEvents > 0) {
    return `已触发 ${triggeredEvents}/${events.length || 0} 个计划事件，其中 ${evidencedEvents} 个已进入事件记录。聊天、内心和行为只能挂在这些记录下面作为证据。`;
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
