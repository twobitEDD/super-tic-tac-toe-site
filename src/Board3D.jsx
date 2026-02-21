import { Cloud, OrbitControls, Sparkles, Stars } from "@react-three/drei";
import { Bloom, ChromaticAberration, EffectComposer, Noise, Vignette } from "@react-three/postprocessing";
import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";
import { BlendFunction } from "postprocessing";
import { Vector2 } from "three";
import { canPlayInBoard, indexToCoords, isBoardResolved } from "./gameLogic";

const BASE_LOCAL_BOARD_SPAN = 3;
const MIN_CELL_SIZE = 0.18;
const MAX_CELL_SIZE = 1;
const PALETTE = {
  x: "#ff4fc8",
  o: "#4ef4f1",
  boardActive: "#ffe6f7",
  boardInactive: "#f2eeff",
  boardResolved: "#d9d5ff",
  lineLocal: "#c084fc",
  lineMeta: "#8b5cf6",
  glowOne: "#ff78d8",
  glowTwo: "#8acbff",
  glowThree: "#81ffd9",
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const getLayout = (size) => {
  const cellSize = clamp(BASE_LOCAL_BOARD_SPAN / size, MIN_CELL_SIZE, MAX_CELL_SIZE);
  const boardGap = clamp(cellSize * 0.35, 0.08, 0.35);
  const lineThickness = clamp(cellSize * 0.07, 0.02, 0.08);
  const boardSpan = size * cellSize;
  const boardCenterOffset = (size - 1) / 2;
  const totalSpan = size * boardSpan + (size - 1) * boardGap;

  return {
    cellSize,
    boardGap,
    lineThickness,
    boardSpan,
    boardCenterOffset,
    totalSpan,
  };
};

const XMark = ({ x, y, cellSize }) => {
  const length = cellSize * 0.72;
  const thickness = Math.max(cellSize * 0.12, 0.04);
  const depth = Math.max(cellSize * 0.1, 0.06);

  return (
    <group position={[x, y, 0.08]}>
      <mesh rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[length, thickness, depth]} />
        <meshStandardMaterial color={PALETTE.x} emissive="#fb7185" emissiveIntensity={0.2} />
      </mesh>
      <mesh rotation={[0, 0, -Math.PI / 4]}>
        <boxGeometry args={[length, thickness, depth]} />
        <meshStandardMaterial color={PALETTE.x} emissive="#fb7185" emissiveIntensity={0.2} />
      </mesh>
    </group>
  );
};

const OMark = ({ x, y, cellSize }) => (
  <mesh position={[x, y, 0.08]}>
    <torusGeometry args={[cellSize * 0.28, Math.max(cellSize * 0.08, 0.03), 16, 32]} />
    <meshStandardMaterial color={PALETTE.o} emissive="#5eead4" emissiveIntensity={0.2} />
  </mesh>
);

const VaporwaveBackdrop = ({ totalSpan }) => {
  const radius = clamp(totalSpan * 0.1, 2.4, 15);
  const offset = clamp(totalSpan * 0.35, 4.5, 46);
  const z = -clamp(totalSpan * 0.24, 5, 30);
  const starRadius = clamp(totalSpan * 1.8, 80, 650);
  const gridWidth = clamp(totalSpan * 3.6, 30, 260);
  const gridHeight = clamp(totalSpan * 2.3, 22, 170);
  const cloudWidth = clamp(totalSpan * 0.44, 7, 38);
  const cloudDepth = clamp(totalSpan * 0.1, 2, 12);
  const blobs = [
    { position: [-offset, offset * 0.4, z], color: PALETTE.glowOne, scale: 1.25 },
    { position: [offset * 0.25, offset * 0.7, z - 2], color: PALETTE.glowTwo, scale: 1.45 },
    { position: [offset, -offset * 0.4, z - 1], color: PALETTE.glowThree, scale: 1.18 },
  ];

  return (
    <>
      <Stars radius={starRadius} depth={58} count={420} factor={3.5} saturation={0} fade speed={0.3} />
      <Sparkles
        count={220}
        scale={[gridWidth * 0.9, gridHeight * 0.9, 32]}
        size={2.4}
        speed={0.24}
        noise={0.35}
        color="#f9a8d4"
      />

      {blobs.map((blob, index) => (
        <mesh key={`blob-${index}`} position={blob.position}>
          <sphereGeometry args={[radius * blob.scale, 28, 28]} />
          <meshStandardMaterial
            color={blob.color}
            transparent
            opacity={0.22}
            roughness={1}
            metalness={0}
            emissive={blob.color}
            emissiveIntensity={0.18}
          />
        </mesh>
      ))}

      <Cloud
        position={[-offset * 0.8, offset * 0.65, z - 5]}
        width={cloudWidth}
        depth={cloudDepth}
        speed={0.14}
        opacity={0.24}
        segments={22}
        color="#ffd9f4"
      />
      <Cloud
        position={[offset * 0.7, -offset * 0.55, z - 7]}
        width={cloudWidth * 1.2}
        depth={cloudDepth}
        speed={0.1}
        opacity={0.2}
        segments={24}
        color="#caedff"
      />

      <mesh position={[0, -totalSpan * 0.45, z - 12]}>
        <planeGeometry args={[gridWidth, gridHeight, 34, 20]} />
        <meshBasicMaterial color="#a855f7" wireframe transparent opacity={0.17} />
      </mesh>
    </>
  );
};

const BoardScene = ({ game, onCellClick, layout }) => {
  const size = game.size;
  const { boardSpan, boardCenterOffset, boardGap, cellSize, lineThickness, totalSpan } = layout;
  const gameOver = Boolean(game.winner) || game.isDraw;

  const boardCenters = useMemo(
    () =>
      game.boards.map((_, boardIndex) => {
        const { row, col } = indexToCoords(boardIndex, size);
        return {
          x: (col - boardCenterOffset) * (boardSpan + boardGap),
          y: (boardCenterOffset - row) * (boardSpan + boardGap),
        };
      }),
    [boardCenterOffset, boardGap, boardSpan, game.boards, size],
  );

  return (
    <>
      <hemisphereLight args={["#ffe4ff", "#dbeafe", 0.78]} />
      <ambientLight intensity={0.64} />
      <directionalLight position={[1.5, 2, 8]} intensity={0.84} />
      <pointLight position={[totalSpan * 0.2, totalSpan * 0.24, 11]} intensity={0.7} color="#f9a8d4" />
      <pointLight
        position={[-totalSpan * 0.24, -totalSpan * 0.26, 12]}
        intensity={0.58}
        color="#67e8f9"
      />
      <pointLight position={[0, totalSpan * 0.2, 9]} intensity={0.42} color="#a78bfa" />
      <VaporwaveBackdrop totalSpan={totalSpan} />

      {game.boards.map((board, boardIndex) => {
        const center = boardCenters[boardIndex];
        const boardPlayable = canPlayInBoard(game, boardIndex);
        const boardResolved = isBoardResolved(board);

        let boardOverlayColor = null;
        if (board.winner === "X") {
          boardOverlayColor = "#ffd0f2";
        } else if (board.winner === "O") {
          boardOverlayColor = "#cffafe";
        } else if (board.isDraw) {
          boardOverlayColor = "#d9d5ff";
        }

        const boardColor = boardResolved
          ? PALETTE.boardResolved
          : boardPlayable && !gameOver
            ? PALETTE.boardActive
            : PALETTE.boardInactive;

        return (
          <group key={`board-${boardIndex}`}>
            {boardPlayable && !boardResolved && !gameOver ? (
              <mesh position={[center.x, center.y, -0.03]}>
                <planeGeometry args={[boardSpan + lineThickness * 1.6, boardSpan + lineThickness * 1.6]} />
                <meshStandardMaterial color="#f0abfc" transparent opacity={0.22} />
              </mesh>
            ) : null}

            <mesh position={[center.x, center.y, -0.04]}>
              <planeGeometry args={[boardSpan, boardSpan]} />
              <meshStandardMaterial color={boardColor} roughness={0.95} metalness={0.02} />
            </mesh>

            {boardOverlayColor ? (
              <mesh position={[center.x, center.y, 0.03]}>
                <planeGeometry args={[boardSpan - lineThickness, boardSpan - lineThickness]} />
                <meshStandardMaterial color={boardOverlayColor} transparent opacity={0.35} />
              </mesh>
            ) : null}

            {Array.from({ length: size - 1 }, (_, lineIndex) => {
              const offset = (lineIndex + 1 - size / 2) * cellSize;
              return (
                <group key={`local-lines-${boardIndex}-${lineIndex}`}>
                  <mesh position={[center.x + offset, center.y, 0.04]}>
                    <boxGeometry args={[lineThickness, boardSpan, lineThickness]} />
                    <meshStandardMaterial color={PALETTE.lineLocal} />
                  </mesh>
                  <mesh position={[center.x, center.y - offset, 0.04]}>
                    <boxGeometry args={[boardSpan, lineThickness, lineThickness]} />
                    <meshStandardMaterial color={PALETTE.lineLocal} />
                  </mesh>
                </group>
              );
            })}

            {board.cells.map((cellValue, cellIndex) => {
              const { row, col } = indexToCoords(cellIndex, size);
              const x = center.x + (col - boardCenterOffset) * cellSize;
              const y = center.y + (boardCenterOffset - row) * cellSize;

              let cellColor = "#fff1f2";
              if (!boardPlayable && !boardResolved && !gameOver) {
                cellColor = "#e9e4ff";
              }
              if (boardResolved) {
                if (board.winner === "X") {
                  cellColor = "#ffd0f2";
                } else if (board.winner === "O") {
                  cellColor = "#cffafe";
                } else {
                  cellColor = "#ddd6fe";
                }
              }

              const disabled =
                gameOver || boardResolved || !boardPlayable || cellValue !== null;

              return (
                <group key={`cell-${boardIndex}-${cellIndex}`}>
                  <mesh
                    position={[x, y, 0]}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      if (!disabled) {
                        onCellClick(boardIndex, cellIndex);
                      }
                    }}
                  >
                    <planeGeometry args={[cellSize * 0.92, cellSize * 0.92]} />
                    <meshStandardMaterial
                      color={cellColor}
                      roughness={0.88}
                      metalness={0.02}
                      emissive="#ffffff"
                      emissiveIntensity={0.03}
                    />
                  </mesh>

                  {cellValue === "X" ? <XMark x={x} y={y} cellSize={cellSize} /> : null}
                  {cellValue === "O" ? <OMark x={x} y={y} cellSize={cellSize} /> : null}
                </group>
              );
            })}
          </group>
        );
      })}

      {Array.from({ length: size - 1 }, (_, lineIndex) => {
        const offset = (lineIndex + 1 - size / 2) * (boardSpan + boardGap);
        return (
          <group key={`meta-lines-${lineIndex}`}>
            <mesh position={[offset, 0, 0.07]}>
              <boxGeometry args={[lineThickness * 2, totalSpan, lineThickness * 2]} />
              <meshStandardMaterial color={PALETTE.lineMeta} />
            </mesh>
            <mesh position={[0, -offset, 0.07]}>
              <boxGeometry args={[totalSpan, lineThickness * 2, lineThickness * 2]} />
              <meshStandardMaterial color={PALETTE.lineMeta} />
            </mesh>
          </group>
        );
      })}
    </>
  );
};

const Board3D = ({ game, onCellClick }) => {
  const layout = useMemo(() => getLayout(game.size), [game.size]);
  const chromaticOffset = useMemo(() => new Vector2(0.0012, 0.0018), []);
  const cameraZ = Math.max(18, layout.totalSpan * 1.45);
  const minDistance = Math.max(6, layout.totalSpan * 0.3);
  const maxDistance = Math.max(34, layout.totalSpan * 6);
  const farPlane = Math.max(2200, maxDistance * 3);

  return (
    <div className="board-canvas">
      <Canvas
        key={`board-canvas-${game.size}`}
        camera={{ position: [0, 0, cameraZ], fov: 48, near: 0.1, far: farPlane }}
      >
        <color attach="background" args={["#12042b"]} />
        <fog attach="fog" args={["#21053d", Math.max(28, layout.totalSpan * 0.85), farPlane]} />
        <BoardScene game={game} onCellClick={onCellClick} layout={layout} />
        <OrbitControls
          makeDefault
          enablePan
          enableRotate={false}
          zoomSpeed={1.1}
          panSpeed={0.85}
          minDistance={minDistance}
          maxDistance={maxDistance}
        />
        <EffectComposer>
          <Bloom
            intensity={1.08}
            luminanceThreshold={0.15}
            luminanceSmoothing={0.9}
            radius={0.78}
            mipmapBlur
          />
          <ChromaticAberration offset={chromaticOffset} radialModulation modulationOffset={0.35} />
          <Noise premultiply opacity={0.12} blendFunction={BlendFunction.SOFT_LIGHT} />
          <Vignette eskil={false} offset={0.2} darkness={0.82} />
        </EffectComposer>
      </Canvas>
    </div>
  );
};

export default Board3D;
