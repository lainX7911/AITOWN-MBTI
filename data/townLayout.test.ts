import {
  activeTownFacilitiesForScene,
  activeTownFacilitiesForSceneLocations,
  facilityFootprintRect,
  townFacilities,
  townFacilitySpawnCandidates,
  validateTownLayout,
} from './townLayout';

describe('town layout facilities', () => {
  test('keeps facility footprints separated and entrances routable', () => {
    expect(validateTownLayout()).toEqual([]);
  });

  test('defines visible footprint and spawn candidates for every facility', () => {
    for (const facility of townFacilities) {
      const rect = facilityFootprintRect(facility);
      expect(rect.right).toBeGreaterThanOrEqual(rect.left);
      expect(rect.bottom).toBeGreaterThanOrEqual(rect.top);
      expect(facility.footprint.width).toBeGreaterThan(0);
      expect(facility.footprint.height).toBeGreaterThan(0);
      expect(townFacilitySpawnCandidates(facility.key).length).toBeGreaterThanOrEqual(2);
    }
  });

  test('selects a focused facility subset for a scene location', () => {
    const cafeScene = activeTownFacilitiesForScene('cafe');
    expect(cafeScene.length).toBeGreaterThanOrEqual(1);
    expect(cafeScene.length).toBeLessThan(townFacilities.length);
    expect(cafeScene[0].key).toBe('cafe');
    expect(cafeScene.some((facility) => facility.key === 'home_west' || facility.key === 'home_north')).toBe(true);

    const clinicScene = activeTownFacilitiesForScene('clinic');
    expect(clinicScene[0].key).toBe('clinic');
    expect(clinicScene.some((facility) => facility.key === 'shop' || facility.key === 'home_east')).toBe(true);
  });

  test('selects facilities from all event locations in a run', () => {
    const runFacilities = activeTownFacilitiesForSceneLocations(['cafe', 'clinic', 'station']);
    const keys = runFacilities.map((facility) => facility.key);

    expect(keys).toContain('cafe');
    expect(keys).toContain('clinic');
    expect(keys).toContain('station');
    expect(runFacilities.length).toBeLessThan(townFacilities.length);
  });
});
