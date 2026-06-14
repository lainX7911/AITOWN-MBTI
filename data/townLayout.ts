import type { Point } from '../convex/util/types';

export type TownFacilityIcon =
  | 'apartment'
  | 'cafe'
  | 'clinic'
  | 'office'
  | 'school'
  | 'shop'
  | 'square'
  | 'station'
  | 'workshop';

export type TownFacility = {
  key: string;
  label: string;
  x: number;
  y: number;
  footprint: {
    width: number;
    height: number;
  };
  entrance: Point;
  stagingPoints: Point[];
  allowedThemes?: string[];
  tone: number;
  icon: TownFacilityIcon;
  scale: number;
};

export type TownDestination = {
  key: string;
  label: string;
  point: Point;
};

export const townFacilities: TownFacility[] = [
  facility('cafe', '咖啡馆', 15, 15, 5, 5, { x: 15, y: 18 }, [{ x: 15, y: 19 }, { x: 15, y: 20 }], 0xc58a4a, 'cafe', 3.0, ['relationship', 'money', 'daily']),
  facility('workshop', '工坊', 8, 27, 5, 4, { x: 11, y: 25 }, [{ x: 12, y: 25 }, { x: 13, y: 25 }], 0x8f7250, 'workshop', 2.8, ['home', 'repair', 'money']),
  facility('square', '广场', 22, 24, 5, 4, { x: 20, y: 24 }, [{ x: 20, y: 23 }, { x: 20, y: 25 }], 0xd5b15f, 'square', 3.8, ['relationship', 'community', 'public']),
  facility('station', '车站', 16, 32, 5, 3, { x: 16, y: 29 }, [{ x: 17, y: 29 }, { x: 18, y: 29 }], 0x5f788f, 'station', 2.8, ['career', 'leaving', 'timing']),
  facility('home_west', '西住宅', 9, 21, 5, 4, { x: 9, y: 23 }, [{ x: 10, y: 23 }, { x: 11, y: 23 }], 0xb98b66, 'apartment', 2.5, ['relationship', 'family', 'home']),
  facility('home_north', '北住宅', 17, 7, 5, 4, { x: 17, y: 10 }, [{ x: 17, y: 11 }, { x: 17, y: 12 }], 0xaa7f5a, 'apartment', 2.5, ['relationship', 'family', 'home']),
  facility('home_south', '南住宅', 22, 32, 5, 4, { x: 20, y: 29 }, [{ x: 21, y: 29 }, { x: 22, y: 29 }], 0xc2966a, 'apartment', 2.5, ['relationship', 'family', 'home']),
  facility('office', '社区办公室', 33, 19, 6, 5, { x: 33, y: 24 }, [{ x: 34, y: 24 }, { x: 35, y: 24 }], 0x9b7b4b, 'office', 3.0, ['community', 'career', 'rules']),
  facility('school', '旧校舍', 43, 18, 6, 5, { x: 42, y: 20 }, [{ x: 42, y: 21 }, { x: 42, y: 22 }], 0x6f87b8, 'school', 3.0, ['memory', 'family', 'community']),
  facility('home_east', '东住宅', 43, 24, 5, 4, { x: 40, y: 24 }, [{ x: 41, y: 24 }, { x: 42, y: 24 }], 0xc09978, 'apartment', 2.5, ['relationship', 'family', 'home']),
  facility('clinic', '诊所', 38, 31, 5, 4, { x: 40, y: 27 }, [{ x: 41, y: 27 }, { x: 42, y: 27 }], 0xbfd8d2, 'clinic', 2.8, ['health', 'family', 'risk']),
  facility('shop', '商店', 46, 30, 5, 4, { x: 43, y: 27 }, [{ x: 42, y: 27 }, { x: 41, y: 27 }], 0xb88a52, 'shop', 2.8, ['money', 'daily', 'home']),
];

export const townRoadPaths: Point[][] = [
  [
    { x: 9, y: 23 },
    { x: 21, y: 23 },
  ],
  [
    { x: 15, y: 18 },
    { x: 15, y: 30 },
  ],
  [
    { x: 11, y: 25 },
    { x: 15, y: 25 },
  ],
  [
    { x: 17, y: 10 },
    { x: 17, y: 23 },
  ],
  [
    { x: 16, y: 29 },
    { x: 20, y: 29 },
    { x: 20, y: 23 },
  ],
  [
    { x: 33, y: 24 },
    { x: 43, y: 24 },
  ],
  [
    { x: 42, y: 20 },
    { x: 42, y: 27 },
  ],
  [
    { x: 40, y: 27 },
    { x: 43, y: 27 },
  ],
  [
    { x: 43, y: 20 },
    { x: 42, y: 20 },
  ],
  [
    { x: 40, y: 24 },
    { x: 42, y: 24 },
  ],
  [
    { x: 33, y: 19 },
    { x: 33, y: 24 },
  ],
];

export const townBridgePaths: Point[][] = [
  [
    { x: 21, y: 24 },
    { x: 33, y: 24 },
  ],
  [
    { x: 20, y: 29 },
    { x: 42, y: 29 },
  ],
];

export const townDestinations: TownDestination[] = [
  { key: 'cafe', label: '咖啡馆', point: { x: 15, y: 18 } },
  { key: 'workshop', label: '工坊', point: { x: 11, y: 25 } },
  { key: 'square', label: '广场', point: { x: 20, y: 23 } },
  { key: 'station', label: '车站', point: { x: 16, y: 29 } },
  { key: 'home_west', label: '西住宅', point: { x: 9, y: 23 } },
  { key: 'home_north', label: '北住宅', point: { x: 17, y: 10 } },
  { key: 'home_south', label: '南住宅', point: { x: 15, y: 30 } },
  { key: 'office', label: '社区办公室', point: { x: 33, y: 24 } },
  { key: 'school', label: '旧校舍', point: { x: 42, y: 20 } },
  { key: 'home_east', label: '东住宅', point: { x: 40, y: 24 } },
  { key: 'clinic', label: '诊所', point: { x: 40, y: 27 } },
  { key: 'shop', label: '商店', point: { x: 43, y: 27 } },
];

export function townRoadPoints() {
  const points = new Map<string, Point>();
  for (const path of [...townRoadPaths, ...townBridgePaths]) {
    for (let index = 1; index < path.length; index += 1) {
      const previous = path[index - 1];
      const current = path[index];
      const dx = Math.sign(current.x - previous.x);
      const dy = Math.sign(current.y - previous.y);
      const steps = Math.max(Math.abs(current.x - previous.x), Math.abs(current.y - previous.y));
      for (let step = 0; step <= steps; step += 1) {
        const point = {
          x: previous.x + dx * step,
          y: previous.y + dy * step,
        };
        points.set(`${point.x},${point.y}`, point);
      }
    }
  }
  return [...points.values()];
}

export function townFacilityByKey(key: string) {
  return townFacilities.find((facility) => facility.key === key);
}

export function townFacilitySpawnCandidates(locationKey?: string) {
  const facility = locationKey ? townFacilityByKey(locationKey) : undefined;
  return facility
    ? [facility.entrance, ...facility.stagingPoints]
    : townDestinations.find((destination) => destination.key === locationKey)?.point
      ? [townDestinations.find((destination) => destination.key === locationKey)!.point]
      : [];
}

export function activeTownFacilitiesForScene(locationKey?: string, limit = 5) {
  return activeTownFacilitiesForSceneLocations(locationKey ? [locationKey] : [], limit);
}

export function activeTownFacilitiesForSceneLocations(locationKeys: string[], limit = 6) {
  const primaryFacilities = locationKeys
    .map((key) => townFacilityByKey(key))
    .filter((facility): facility is TownFacility => Boolean(facility));
  const primary = primaryFacilities[0];
  const primaryKeys = new Set(primaryFacilities.map((facility) => facility.key));
  const primaryThemes = new Set(primaryFacilities.flatMap((facility) => facility.allowedThemes ?? []));
  if (!primary) {
    return townFacilities.slice(0, Math.max(1, limit));
  }
  const ranked = townFacilities
    .map((facility) => {
      const sharedThemes = (facility.allowedThemes ?? []).filter((theme) => primaryThemes.has(theme)).length;
      const isPrimary = primaryKeys.has(facility.key);
      const score = (isPrimary ? 100 : 0) + sharedThemes * 10 - Math.abs(facility.x - primary.x) - Math.abs(facility.y - primary.y);
      return { facility, score };
    })
    .sort((a, b) => b.score - a.score || a.facility.key.localeCompare(b.facility.key))
    .map((item) => item.facility);
  return ranked.slice(0, Math.max(1, limit));
}

export function facilityFootprintRect(facility: TownFacility) {
  const left = Math.floor(facility.x - facility.footprint.width / 2);
  const top = Math.floor(facility.y - facility.footprint.height / 2);
  return {
    left,
    right: left + facility.footprint.width - 1,
    top,
    bottom: top + facility.footprint.height - 1,
  };
}

export function townFacilitiesOverlap(a: TownFacility, b: TownFacility, padding = 1) {
  const ar = facilityFootprintRect(a);
  const br = facilityFootprintRect(b);
  return !(
    ar.right + padding < br.left ||
    br.right + padding < ar.left ||
    ar.bottom + padding < br.top ||
    br.bottom + padding < ar.top
  );
}

export function validateTownLayout() {
  const issues: string[] = [];
  for (let i = 0; i < townFacilities.length; i += 1) {
    const facility = townFacilities[i];
    const rect = facilityFootprintRect(facility);
    if (rect.left < 0 || rect.top < 0) {
      issues.push(`${facility.key} footprint exceeds map minimum bounds`);
    }
    if (!isTownRoadPoint(facility.entrance)) {
      issues.push(`${facility.key} entrance is not on a road point`);
    }
    for (const point of facility.stagingPoints) {
      if (!isTownRoadPoint(point)) {
        issues.push(`${facility.key} staging point ${point.x},${point.y} is not on a road point`);
      }
    }
    for (let j = i + 1; j < townFacilities.length; j += 1) {
      const other = townFacilities[j];
      if (townFacilitiesOverlap(facility, other)) {
        issues.push(`${facility.key} overlaps ${other.key}`);
      }
    }
  }
  return issues;
}

export function isTownRoadPoint(point: Point) {
  const x = Math.floor(point.x);
  const y = Math.floor(point.y);
  return townRoadPoints().some((roadPoint) => roadPoint.x === x && roadPoint.y === y);
}

export function nearestTownRoadPoint(point: Point) {
  const roads = townRoadPoints();
  return roads.reduce((nearest, candidate) => {
    const nearestDistance = Math.abs(nearest.x - point.x) + Math.abs(nearest.y - point.y);
    const candidateDistance = Math.abs(candidate.x - point.x) + Math.abs(candidate.y - point.y);
    return candidateDistance < nearestDistance ? candidate : nearest;
  }, roads[0]);
}

function facility(
  key: string,
  label: string,
  x: number,
  y: number,
  width: number,
  height: number,
  entrance: Point,
  stagingPoints: Point[],
  tone: number,
  icon: TownFacilityIcon,
  scale: number,
  allowedThemes?: string[],
): TownFacility {
  return {
    key,
    label,
    x,
    y,
    footprint: { width, height },
    entrance,
    stagingPoints,
    tone,
    icon,
    scale,
    allowedThemes,
  };
}
