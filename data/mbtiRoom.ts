export const tilesetpath = '/ai-town/assets/rpg-tileset.png';
export const tiledim = 32;
export const screenxtiles = 26;
export const screenytiles = 16;
export const tilesetpxw = 1600;
export const tilesetpxh = 1600;

const width = 26;
const height = 16;

const floorTiles = [673, 674];
const topWallTiles = [1034];
const bottomWallTiles = [1184];
const leftWall = 1084;
const rightWall = 1087;

function layer(fill: number) {
  return Array.from({ length: width }, () => Array.from({ length: height }, () => fill));
}

const floor = layer(922);
for (let x = 0; x < width; x++) {
  for (let y = 0; y < height; y++) {
    floor[x][y] = floorTiles[(x + y * 2) % floorTiles.length];
  }
}

const objects = layer(-1);
for (let x = 0; x < width; x++) {
  objects[x][0] = topWallTiles[x % topWallTiles.length];
  objects[x][height - 1] = bottomWallTiles[x % bottomWallTiles.length];
}
for (let y = 1; y < height - 1; y++) {
  objects[0][y] = leftWall;
  objects[width - 1][y] = rightWall;
}

export const bgtiles = [floor, layer(-1)];
export const objmap = [objects, layer(-1)];
export const animatedsprites: Array<{
  x: number;
  y: number;
  w: number;
  h: number;
  layer: number;
  sheet: string;
  animation: string;
}> = [];

export const mapwidth = width;
export const mapheight = height;
