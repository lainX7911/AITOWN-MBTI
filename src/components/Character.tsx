import { BaseTexture, ISpritesheetData, Spritesheet } from 'pixi.js';
import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatedSprite, Container, Graphics, Text } from '@pixi/react';
import * as PIXI from 'pixi.js';

export const Character = ({
  textureUrl,
  spritesheetData,
  x,
  y,
  orientation,
  isMoving = false,
  isThinking = false,
  isSpeaking = false,
  emoji = '',
  isViewer = false,
  markerLabel,
  markerDetail,
  markerTone = 'visitor',
  speed = 0.1,
  scale = 1,
  onClick,
}: {
  // Path to the texture packed image.
  textureUrl: string;
  // The data for the spritesheet.
  spritesheetData: ISpritesheetData;
  // The pose of the NPC.
  x: number;
  y: number;
  orientation: number;
  isMoving?: boolean;
  // Shows a thought bubble if true.
  isThinking?: boolean;
  // Shows a speech bubble if true.
  isSpeaking?: boolean;
  emoji?: string;
  // Highlights the player.
  isViewer?: boolean;
  markerLabel?: string;
  markerDetail?: string;
  markerTone?: 'visitor' | 'companion' | 'resident';
  // The speed of the animation. Can be tuned depending on the side and speed of the NPC.
  speed?: number;
  scale?: number;
  onClick: () => void;
}) => {
  const [spriteSheet, setSpriteSheet] = useState<Spritesheet>();
  useEffect(() => {
    const parseSheet = async () => {
      const sheet = new Spritesheet(
        BaseTexture.from(textureUrl, {
          scaleMode: PIXI.SCALE_MODES.NEAREST,
        }),
        spritesheetData,
      );
      await sheet.parse();
      setSpriteSheet(sheet);
    };
    void parseSheet();
  }, []);

  // The first "left" is "right" but reflected.
  const roundedOrientation = Math.floor(orientation / 90);
  const direction = ['right', 'down', 'left', 'up'][roundedOrientation];

  // Prevents the animation from stopping when the texture changes
  // (see https://github.com/pixijs/pixi-react/issues/359)
  const ref = useRef<PIXI.AnimatedSprite | null>(null);
  useEffect(() => {
    if (isMoving) {
      ref.current?.play();
    }
  }, [direction, isMoving]);

  if (!spriteSheet) return null;

  let blockOffset = { x: 0, y: 0 };
  switch (roundedOrientation) {
    case 2:
      blockOffset = { x: -20, y: 0 };
      break;
    case 0:
      blockOffset = { x: 20, y: 0 };
      break;
    case 3:
      blockOffset = { x: 0, y: -20 };
      break;
    case 1:
      blockOffset = { x: 0, y: 20 };
      break;
  }

  return (
    <Container x={x} y={y} scale={scale} interactive={true} pointerdown={onClick} cursor="pointer">
      {isThinking && (
        // TODO: We'll eventually have separate assets for thinking and speech animations.
        <Text x={-20} y={-10} scale={{ x: -0.8, y: 0.8 }} text={'💭'} anchor={{ x: 0.5, y: 0.5 }} />
      )}
      {isSpeaking && (
        // TODO: We'll eventually have separate assets for thinking and speech animations.
        <Text x={18} y={-10} scale={0.8} text={'💬'} anchor={{ x: 0.5, y: 0.5 }} />
      )}
      {markerLabel && <SceneMarker label={markerLabel} detail={markerDetail} tone={markerTone} />}
      {isViewer && <ViewerIndicator />}
      <AnimatedSprite
        ref={ref}
        isPlaying={isMoving}
        textures={spriteSheet.animations[direction]}
        animationSpeed={speed}
        anchor={{ x: 0.5, y: 0.5 }}
      />
      {emoji && (
        <Text x={0} y={-24} scale={{ x: -0.8, y: 0.8 }} text={emoji} anchor={{ x: 0.5, y: 0.5 }} />
      )}
    </Container>
  );
};

function SceneMarker({
  label,
  detail,
  tone,
}: {
  label: string;
  detail?: string;
  tone: 'visitor' | 'companion' | 'resident';
}) {
  const draw = useCallback(
    (g: PIXI.Graphics) => {
      const isResident = tone === 'resident';
      const safeDetail = detail?.slice(0, 8);
      const contentWidth = Math.max(label.length * (isResident ? 9 : 12), (safeDetail?.length ?? 0) * 8);
      const width = Math.max(isResident ? 28 : 34, contentWidth + 12);
      const height = detail ? (isResident ? 23 : 27) : isResident ? 12 : 15;
      const y = detail ? (isResident ? -38 : -48) : isResident ? -32 : -38;
      const fill = tone === 'visitor' ? 0xff3f62 : tone === 'companion' ? 0x2f7dff : 0x2a2f36;
      g.clear();
      g.lineStyle(isResident ? 1 : 1.5, 0xffffff, isResident ? 0.58 : 0.86);
      g.beginFill(fill, isResident ? 0.72 : 0.9);
      g.drawRoundedRect(-width / 2, y, width, height, 4);
      g.endFill();
      if (!isResident) {
        g.lineStyle(1.5, fill, 0.78);
        g.moveTo(0, detail ? -21 : -23);
        g.lineTo(0, -18);
      }
    },
    [detail, label, tone],
  );

  return (
    <Container>
      <Graphics draw={draw} />
      <Text
        x={0}
        y={detail ? (tone === 'resident' ? -31.5 : -39.5) : tone === 'resident' ? -26 : -30.5}
        text={label}
        anchor={{ x: 0.5, y: 0.5 }}
        style={
          new PIXI.TextStyle({
            fill: 0xffffff,
            fontSize: tone === 'resident' ? 8 : 10,
            fontWeight: '700',
            letterSpacing: 0,
          })
        }
      />
      {detail && (
        <Text
          x={0}
          y={tone === 'resident' ? -21.5 : -28}
          text={detail.slice(0, 8)}
          anchor={{ x: 0.5, y: 0.5 }}
          style={
            new PIXI.TextStyle({
              fill: tone === 'resident' ? 0xdfe8ee : 0xffffff,
              fontSize: tone === 'resident' ? 7 : 8,
              fontWeight: '500',
              letterSpacing: 0,
            })
          }
        />
      )}
    </Container>
  );
}

function ViewerIndicator() {
  const draw = useCallback((g: PIXI.Graphics) => {
    g.clear();
    g.beginFill(0xffff0b, 0.5);
    g.drawRoundedRect(-10, 10, 20, 10, 100);
    g.endFill();
  }, []);

  return <Graphics draw={draw} />;
}
