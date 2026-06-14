import * as PIXI from 'pixi.js';
import { Container, Graphics, Text, useApp } from '@pixi/react';
import { Player, SelectElement } from './Player.tsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PixiStaticMap } from './PixiStaticMap.tsx';
import PixiViewport from './PixiViewport.tsx';
import { Viewport } from 'pixi-viewport';
import { Id } from '../../convex/_generated/dataModel';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api.js';
import { useSendInput } from '../hooks/sendInput.ts';
import { toastOnError } from '../toasts.ts';
import { DebugPath } from './DebugPath.tsx';
import { PositionIndicator } from './PositionIndicator.tsx';
import { SHOW_DEBUG_UI } from './Game.tsx';
import { ServerGame } from '../hooks/serverGame.ts';
import {
  activeTownFacilitiesForScene,
  activeTownFacilitiesForSceneLocations,
  townFacilities,
} from '../../data/townLayout.ts';
import type { TownFacility } from '../../data/townLayout.ts';
import { activeFacilityViewportFrame } from './pixiViewportFrame.ts';

export const PixiGame = (props: {
  worldId: Id<'worlds'>;
  engineId: Id<'engines'>;
  game: ServerGame;
  historicalTime: number | undefined;
  width: number;
  height: number;
  lockedViewport?: boolean;
  fitActiveLocations?: boolean;
  activeLocationKey?: string;
  activeLocationKeys?: string[];
  setSelectedElement: SelectElement;
}) => {
  // PIXI setup.
  const pixiApp = useApp();
  const viewportRef = useRef<Viewport | undefined>();

  const humanTokenIdentifier = useQuery(api.world.userStatus, { worldId: props.worldId }) ?? null;
  const humanPlayerId = [...props.game.world.players.values()].find(
    (p) => p.human === humanTokenIdentifier,
  )?.id;

  const moveTo = useSendInput(props.engineId, 'moveTo');

  // Interaction for clicking on the world to navigate.
  const dragStart = useRef<{ screenX: number; screenY: number } | null>(null);
  const onMapPointerDown = (e: any) => {
    // https://pixijs.download/dev/docs/PIXI.FederatedPointerEvent.html
    dragStart.current = { screenX: e.screenX, screenY: e.screenY };
  };

  const [lastDestination, setLastDestination] = useState<{
    x: number;
    y: number;
    t: number;
  } | null>(null);
  const onMapPointerUp = async (e: any) => {
    if (dragStart.current) {
      const { screenX, screenY } = dragStart.current;
      dragStart.current = null;
      const [dx, dy] = [screenX - e.screenX, screenY - e.screenY];
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 10) {
        console.log(`Skipping navigation on drag event (${dist}px)`);
        return;
      }
    }
    if (props.lockedViewport || !humanPlayerId) {
      return;
    }
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const gameSpacePx = viewport.toWorld(e.screenX, e.screenY);
    const tileDim = props.game.worldMap.tileDim;
    const gameSpaceTiles = {
      x: gameSpacePx.x / tileDim,
      y: gameSpacePx.y / tileDim,
    };
    setLastDestination({ t: Date.now(), ...gameSpaceTiles });
    const roundedTiles = {
      x: Math.floor(gameSpaceTiles.x),
      y: Math.floor(gameSpaceTiles.y),
    };
    console.log(`Moving to ${JSON.stringify(roundedTiles)}`);
    await toastOnError(moveTo({ playerId: humanPlayerId, destination: roundedTiles }));
  };
  const { width, height, tileDim } = props.game.worldMap;
  const players = [...props.game.world.players.values()];
  const activeLocationSignature = props.activeLocationKeys?.join('|') ?? '';
  const visibleFacilities = useMemo(
    () => visibleTownFacilities(props.activeLocationKey, props.activeLocationKeys),
    [activeLocationSignature, props.activeLocationKey],
  );

  // Zoom on the user’s avatar when it is created
  useEffect(() => {
    if (!viewportRef.current || humanPlayerId === undefined) return;
    if (props.lockedViewport || props.fitActiveLocations) return;

    const humanPlayer = props.game.world.players.get(humanPlayerId)!;
    viewportRef.current.animate({
      position: new PIXI.Point(humanPlayer.position.x * tileDim, humanPlayer.position.y * tileDim),
      scale: 1.5,
    });
  }, [humanPlayerId, props.fitActiveLocations, props.lockedViewport, props.game.world.players, tileDim]);

  useEffect(() => {
    if (!viewportRef.current || (!props.lockedViewport && !props.fitActiveLocations)) return;
    const frame = activeFacilityViewportFrame(
      visibleFacilities,
      width,
      height,
      tileDim,
      props.width,
      props.height,
    );
    viewportRef.current.animate({
      position: new PIXI.Point(frame.x, frame.y),
      scale: frame.scale,
      time: 0,
    });
  }, [height, props.fitActiveLocations, props.height, props.lockedViewport, props.width, tileDim, visibleFacilities, width]);

  return (
    <PixiViewport
      key={props.lockedViewport ? 'locked-viewport' : 'interactive-viewport'}
      app={pixiApp}
      screenWidth={props.width}
      screenHeight={props.height}
      worldWidth={width * tileDim}
      worldHeight={height * tileDim}
      interactive={!props.lockedViewport}
      locked={props.lockedViewport}
      viewportRef={viewportRef}
    >
      <PixiStaticMap
        map={props.game.worldMap}
        onpointerup={onMapPointerUp}
        onpointerdown={onMapPointerDown}
      />
      <TownFacilities
        facilities={visibleFacilities}
        tileDim={tileDim}
      />
      {players.map(
        (p) =>
          // Only show the path for the human player in non-debug mode.
          (SHOW_DEBUG_UI || p.id === humanPlayerId) && (
            <DebugPath key={`path-${p.id}`} player={p} tileDim={tileDim} />
          ),
      )}
      {lastDestination && <PositionIndicator destination={lastDestination} tileDim={tileDim} />}
      {players.map((p) => (
        <Player
          key={`player-${p.id}`}
          game={props.game}
          player={p}
          isViewer={p.id === humanPlayerId}
          onClick={props.setSelectedElement}
          historicalTime={props.historicalTime}
          displayScale={props.lockedViewport || props.fitActiveLocations ? 2 : 1}
        />
      ))}
    </PixiViewport>
  );
};
export default PixiGame;

function TownFacilities({
  facilities,
  tileDim,
}: {
  facilities: TownFacility[];
  tileDim: number;
}) {
  return (
    <>
      {facilities.map((facility) => (
        <TownFacilityMarker
          facility={facility}
          key={facility.key}
          x={facility.x * tileDim}
          y={facility.y * tileDim}
        />
      ))}
    </>
  );
}

function visibleTownFacilities(activeLocationKey?: string, activeLocationKeys?: string[]) {
  return activeLocationKeys?.length
    ? activeTownFacilitiesForSceneLocations(activeLocationKeys)
    : activeLocationKey
    ? activeTownFacilitiesForScene(activeLocationKey)
    : townFacilities;
}

function TownFacilityMarker({
  facility,
  x,
  y,
}: {
  facility: TownFacility;
  x: number;
  y: number;
}) {
  const drawFacility = (g: PIXI.Graphics) => {
    g.clear();
    g.lineStyle(1, 0x2b211d, 0.86);
    if (facility.icon === 'square') {
      g.beginFill(facility.tone, 0.82);
      g.drawRoundedRect(-15, -11, 30, 22, 4);
      g.endFill();
      g.lineStyle(1, 0xf5df9f, 0.7);
      g.drawCircle(0, 0, 6);
      g.moveTo(-12, 0);
      g.lineTo(12, 0);
      g.moveTo(0, -8);
      g.lineTo(0, 8);
      return;
    }
    if (facility.icon === 'station') {
      g.beginFill(facility.tone, 0.9);
      g.drawRoundedRect(-12, -5, 24, 14, 2);
      g.endFill();
      g.beginFill(0x2b211d, 0.82);
      g.drawRect(-8, -1, 5, 5);
      g.drawRect(3, -1, 5, 5);
      g.endFill();
      g.lineStyle(1, 0xf4d482, 0.9);
      g.moveTo(-12, 10);
      g.lineTo(12, 10);
      return;
    }
    g.beginFill(facility.tone, 0.88);
    g.drawRect(-11, -2, 22, 14);
    g.endFill();
    g.beginFill(0x4b2d25, 0.92);
    g.drawPolygon([-13, -2, 0, -13, 13, -2]);
    g.endFill();
    g.beginFill(0x2b211d, 0.86);
    g.drawRect(-3, 4, 6, 8);
    g.endFill();
    if (facility.icon === 'apartment') {
      g.beginFill(0xf6d27a, 0.68);
      g.drawRect(-8, 1, 3, 3);
      g.drawRect(5, 1, 3, 3);
      g.drawRect(-8, 6, 3, 3);
      g.drawRect(5, 6, 3, 3);
      g.endFill();
    }
    if (facility.icon === 'cafe') {
      g.beginFill(0xf6d27a, 0.9);
      g.drawRoundedRect(-7, 1, 7, 5, 2);
      g.endFill();
      g.lineStyle(1, 0xf6d27a, 0.9);
      g.drawCircle(2, 3, 3);
    }
    if (facility.icon === 'clinic') {
      g.beginFill(0xffffff, 0.9);
      g.drawRect(-2, -9, 4, 9);
      g.drawRect(-5, -6, 10, 3);
      g.endFill();
    }
    if (facility.icon === 'workshop') {
      g.lineStyle(2, 0xf6d27a, 0.9);
      g.moveTo(-8, 7);
      g.lineTo(8, 1);
    }
    if (facility.icon === 'office' || facility.icon === 'school') {
      g.beginFill(0xf6d27a, 0.74);
      g.drawRect(-8, 1, 4, 4);
      g.drawRect(4, 1, 4, 4);
      g.endFill();
    }
    if (facility.icon === 'shop') {
      g.beginFill(0xf4d482, 0.92);
      g.drawRect(-10, -2, 20, 4);
      g.endFill();
      g.lineStyle(1, 0x8b3f35, 0.9);
      g.moveTo(-8, -2);
      g.lineTo(-8, 2);
      g.moveTo(-3, -2);
      g.lineTo(-3, 2);
      g.moveTo(3, -2);
      g.lineTo(3, 2);
      g.moveTo(8, -2);
      g.lineTo(8, 2);
    }
  };
  const drawLabel = (g: PIXI.Graphics) => {
    const width = Math.max(44, facility.label.length * 13 + 12);
    g.clear();
    g.lineStyle(1, 0xf4e1b8, 0.78);
    g.beginFill(0x211817, 0.76);
    g.drawRoundedRect(-width / 2, -26, width, 18, 4);
    g.endFill();
  };

  return (
    <Container x={x} y={y}>
      <Graphics draw={drawFacility} scale={facility.scale} />
      <Graphics draw={drawLabel} />
      <Text
        text={facility.label}
        anchor={{ x: 0.5, y: 0.5 }}
        y={-17}
        style={
          new PIXI.TextStyle({
            fill: 0xf9edd0,
            fontSize: 10,
            fontWeight: '700',
            letterSpacing: 0,
          })
        }
      />
    </Container>
  );
}
