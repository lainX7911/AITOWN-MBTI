import {
  classifySceneType,
  defaultTownLocations,
  defaultTownMemories,
  defaultTownRelationships,
  defaultTownResidents,
  selectScene,
} from './mbtiPersistentTown';

describe('persistent MBTI town seed', () => {
  test('has enough social texture for a persistent town', () => {
    expect(defaultTownResidents.length).toBeGreaterThanOrEqual(24);
    expect(defaultTownRelationships.length).toBeGreaterThanOrEqual(60);
    expect(defaultTownRelationships.length).toBeLessThanOrEqual(100);
    expect(defaultTownMemories.length).toBeGreaterThanOrEqual(20);
    expect(defaultTownLocations.length).toBeGreaterThanOrEqual(5);
  });

  test('keeps residents as ordinary roles rather than only MBTI labels', () => {
    const residentsWithoutRole = defaultTownResidents.filter((resident) => !resident.role.trim());
    const residentsWithoutTraits = defaultTownResidents.filter((resident) => resident.traits.length < 2);
    expect(residentsWithoutRole).toEqual([]);
    expect(residentsWithoutTraits).toEqual([]);
  });

  test('uses valid resident and location references throughout town history', () => {
    const residentKeys = new Set(defaultTownResidents.map((resident) => resident.key));
    const locationKeys = new Set(defaultTownLocations.map((location) => location.key));

    for (const relationship of defaultTownRelationships) {
      expect(residentKeys.has(relationship.residentAKey)).toBe(true);
      expect(residentKeys.has(relationship.residentBKey)).toBe(true);
      expect(relationship.residentAKey).not.toBe(relationship.residentBKey);
    }

    for (const memory of defaultTownMemories) {
      if (memory.locationKey) {
        expect(locationKeys.has(memory.locationKey)).toBe(true);
      }
      for (const residentKey of memory.residentKeys) {
        expect(residentKeys.has(residentKey)).toBe(true);
      }
    }
  });

  test('includes practical town facilities instead of only open field locations', () => {
    const locationKeys = new Set(defaultTownLocations.map((location) => location.key));
    expect(locationKeys.has('cafe')).toBe(true);
    expect(locationKeys.has('clinic')).toBe(true);
    expect(locationKeys.has('school')).toBe(true);
    expect(locationKeys.has('workshop')).toBe(true);
    expect(locationKeys.has('office')).toBe(true);
  });
});

describe('persistent MBTI scene selection', () => {
  const baseInput = {
    userEntryMode: 'solo' as const,
    residents: defaultTownResidents,
    relationships: defaultTownRelationships,
    memories: defaultTownMemories,
    locations: defaultTownLocations,
  };

  test('classifies common social questions', () => {
    expect(classifySceneType('如果亲密关系里对方一直不回消息，我会怎样处理？')).toBe(
      'uncertainty',
    );
    expect(classifySceneType('同事公开误解我并表达不满，我怎么修复？')).toBe(
      'workplace_conflict',
    );
    expect(classifySceneType('朋友一直劝我离开这段关系，我会被影响吗？')).toBe(
      'friendship_pressure',
    );
  });

  test('activates only a local slice of the large town', () => {
    const scene = selectScene({
      ...baseInput,
      question: '如果亲密关系里对方一直不回消息，我会怎样处理？',
    });
    const residentKeys = new Set(defaultTownResidents.map((resident) => resident.key));
    const locationKeys = new Set(defaultTownLocations.map((location) => location.key));
    expect(scene.residentKeys.length).toBeGreaterThanOrEqual(4);
    expect(scene.residentKeys.length).toBeLessThanOrEqual(6);
    expect(new Set(scene.residentKeys).size).toBe(scene.residentKeys.length);
    expect(locationKeys.has(scene.locationKey)).toBe(true);
    for (const key of scene.residentKeys) {
      expect(residentKeys.has(key)).toBe(true);
    }
    expect(scene.rationale.join(' ')).toContain('其余居民保留为背景关系和记忆');
    expect(scene.questionFocus.observationGoal).toContain('观察');
    expect(scene.questionFocus.evidenceTargets.length).toBeGreaterThanOrEqual(3);
    expect(scene.questionFocus.eventBeats.length).toBeGreaterThanOrEqual(3);
    expect(scene.questionFocus.eventPlans?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  test('does not select user-brought companions as persistent town residents', () => {
    const scene = selectScene({
      ...baseInput,
      question: '我带着伴侣进入小镇，想看看我们吵架后怎么修复。',
      userEntryMode: 'with_partner_and_friend',
    });
    expect(scene.residentKeys).not.toContain('user_partner');
    expect(scene.residentKeys).not.toContain('user_friend');
    for (const key of scene.residentKeys) {
      expect(defaultTownResidents.some((resident) => resident.key === key)).toBe(true);
    }
  });

  test('routes different questions to defensible different scene contexts', () => {
    const relationshipScene = selectScene({
      ...baseInput,
      question: '暧昧对象忽冷忽热，我要不要问清楚？',
      userEntryMode: 'with_friend',
    });
    const workScene = selectScene({
      ...baseInput,
      question: '同事临时把麻烦工作推给我，还在会上表达不满，我该怎么处理？',
    });
    expect(relationshipScene.sceneType).toBe('decision');
    expect(workScene.sceneType).toBe('workplace_conflict');
    expect(relationshipScene.locationKey).not.toBe(workScene.locationKey);
  });
});
