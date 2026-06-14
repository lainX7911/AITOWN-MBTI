import type { TownFacility } from '../../data/townLayout';

export function activeFacilityViewportFrame(
  facilities: TownFacility[],
  mapWidth: number,
  mapHeight: number,
  tileDim: number,
  screenWidth: number,
  screenHeight: number,
) {
  if (facilities.length === 0) {
    return {
      x: (mapWidth * tileDim) / 2,
      y: (mapHeight * tileDim) / 2,
      scale: 1,
    };
  }
  const xs = facilities.map((facility) => facility.x);
  const ys = facilities.map((facility) => facility.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padding = 9 * tileDim;
  const frameWidth = Math.max(tileDim * 10, (maxX - minX) * tileDim + padding);
  const frameHeight = Math.max(tileDim * 8, (maxY - minY) * tileDim + padding);
  const coverScale = Math.max(
    (1.04 * screenWidth) / (mapWidth * tileDim),
    (1.04 * screenHeight) / (mapHeight * tileDim),
  );
  const focusScale = Math.max(0.58, Math.min(screenWidth / frameWidth, screenHeight / frameHeight));
  return {
    x: ((minX + maxX) * tileDim) / 2,
    y: ((minY + maxY) * tileDim) / 2,
    scale: Math.min(Math.max(1.18, coverScale), Math.max(coverScale, focusScale)),
  };
}
