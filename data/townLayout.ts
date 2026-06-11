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
  { key: 'cafe', label: '咖啡馆', x: 15, y: 15, tone: 0xc58a4a, icon: 'cafe', scale: 3.0 },
  { key: 'workshop', label: '工坊', x: 11, y: 27, tone: 0x8f7250, icon: 'workshop', scale: 2.8 },
  { key: 'square', label: '广场', x: 20, y: 24, tone: 0xd5b15f, icon: 'square', scale: 3.8 },
  { key: 'station', label: '车站', x: 16, y: 31, tone: 0x5f788f, icon: 'station', scale: 2.8 },
  { key: 'home_west', label: '西住宅', x: 10, y: 25, tone: 0xb98b66, icon: 'apartment', scale: 2.5 },
  { key: 'home_north', label: '北住宅', x: 17, y: 7, tone: 0xaa7f5a, icon: 'apartment', scale: 2.5 },
  { key: 'home_south', label: '南住宅', x: 15, y: 31, tone: 0xc2966a, icon: 'apartment', scale: 2.5 },
  { key: 'office', label: '社区办公室', x: 33, y: 21, tone: 0x9b7b4b, icon: 'office', scale: 3.0 },
  { key: 'school', label: '旧校舍', x: 43, y: 18, tone: 0x6f87b8, icon: 'school', scale: 3.0 },
  { key: 'home_east', label: '东住宅', x: 42, y: 24, tone: 0xc09978, icon: 'apartment', scale: 2.5 },
  { key: 'clinic', label: '诊所', x: 40, y: 29, tone: 0xbfd8d2, icon: 'clinic', scale: 2.8 },
  { key: 'shop', label: '商店', x: 43, y: 28, tone: 0xb88a52, icon: 'shop', scale: 2.8 },
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
