import { Doc } from './_generated/dataModel';

type TownMemoryLike = Pick<
  Doc<'mbtiTownMemories'>,
  '_id' | 'kind' | 'title' | 'summary' | 'residentKeys' | 'locationKey' | 'salience' | 'updatedAt' | 'sourceKind' | 'sourceReason'
>;

type ReflectionMemoryLike = Pick<
  Doc<'mbtiTownMemories'>,
  '_id' | 'title' | 'summary' | 'residentKeys' | 'salience' | 'updatedAt' | 'sourceKind'
>;

export type TownActivityStreamItem = {
  id: string;
  kind: 'autonomy_tick' | 'scene' | 'reflection' | 'memory';
  title: string;
  summary: string;
  residentNames: string[];
  locationKey?: string;
  salience: number;
  occurredAt: number;
  sourceReason?: string;
};

export function buildTownActivityStream(args: {
  memories: TownMemoryLike[];
  residentNameByKey: Map<string, string>;
  limit?: number;
}): TownActivityStreamItem[] {
  return args.memories
    .filter((memory) => memory.sourceKind === 'autonomy_tick' || memory.sourceKind === 'scene' || memory.sourceKind === 'reflection')
    .sort((a, b) => b.updatedAt - a.updatedAt || b.salience - a.salience)
    .slice(0, args.limit ?? 8)
    .map((memory) => ({
      id: String(memory._id),
      kind: activityKind(memory.sourceKind),
      title: memory.title,
      summary: memory.summary,
      residentNames: memory.residentKeys.map((key) => args.residentNameByKey.get(key) ?? key),
      locationKey: memory.locationKey,
      salience: memory.salience,
      occurredAt: memory.updatedAt,
      sourceReason: memory.sourceReason,
    }));
}

export type TownReflectionCandidate = {
  residentKeys: string[];
  title: string;
  summary: string;
  salience: number;
  sourceMemoryIds: string[];
  reflectionKey: string;
};

export function selectTownReflectionCandidate(args: {
  memories: ReflectionMemoryLike[];
  existingReflectionKeys: Set<string>;
  residentNameByKey: Map<string, string>;
}): TownReflectionCandidate | null {
  const groups = new Map<string, ReflectionMemoryLike[]>();
  for (const memory of args.memories) {
    if (memory.sourceKind !== 'autonomy_tick') {
      continue;
    }
    if (memory.residentKeys.length < 2) {
      continue;
    }
    const key = reflectionKeyForResidents(memory.residentKeys);
    if (args.existingReflectionKeys.has(key)) {
      continue;
    }
    groups.set(key, [...(groups.get(key) ?? []), memory]);
  }
  const group = [...groups.entries()]
    .map(([key, memories]) => ({
      key,
      memories: memories.sort((a, b) => a.updatedAt - b.updatedAt),
      score: memories.length * 20 + memories.reduce((sum, memory) => sum + memory.salience, 0) / 10,
    }))
    .filter((item) => item.memories.length >= 2)
    .sort((a, b) => b.score - a.score || b.memories[b.memories.length - 1].updatedAt - a.memories[a.memories.length - 1].updatedAt)[0];
  if (!group) {
    return null;
  }
  const residentKeys = group.key.split('|');
  const residentNames = residentKeys.map((key) => args.residentNameByKey.get(key) ?? key);
  const summarySeeds = group.memories
    .slice(-3)
    .map((memory) => compactReflectionSeed(memory.summary))
    .filter(Boolean);
  return {
    residentKeys,
    title: `反思：${residentNames.join('和')}的关系模式正在重复`,
    summary: [
      `${residentNames.join('和')}最近多次在自治互动中出现相似模式。`,
      ...summarySeeds,
      '后续扰动应把这段关系当作稳定背景，而不是一次性事件。',
    ].join(' '),
    salience: Math.min(100, 58 + group.memories.length * 8),
    sourceMemoryIds: group.memories.map((memory) => String(memory._id)),
    reflectionKey: group.key,
  };
}

export function reflectionKeyForResidents(residentKeys: string[]) {
  return [...residentKeys].sort().join('|');
}

function compactReflectionSeed(text: string) {
  const firstSentence = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[。！？!?])\s*/)[0]
    ?.trim() ?? '';
  return firstSentence.length > 56 ? `${firstSentence.slice(0, 55)}…` : firstSentence;
}

function activityKind(sourceKind: TownMemoryLike['sourceKind']): TownActivityStreamItem['kind'] {
  if (sourceKind === 'autonomy_tick') {
    return 'autonomy_tick';
  }
  if (sourceKind === 'scene') {
    return 'scene';
  }
  if (sourceKind === 'reflection') {
    return 'reflection';
  }
  return 'memory';
}
