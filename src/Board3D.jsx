import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";
import { canPlayInBoard, indexToCoords, isBoardResolved } from "./gameLogic";

const BASE_LOCAL_BOARD_SPAN = 3;
const MIN_CELL_SIZE = 0.18;
const MAX_CELL_SIZE = 1;

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
      <meshStandardMaterial color="#f97316" />
    </mesh>
    <mesh rotation={[0, 0, -Math.PI / 4]}>
      <boxGeometry args={[length, thickness, depth]} />
      <meshStandardMaterial color="#f97316" />
    </mesh>
  </group>
  );
};

const OMark = ({ x, y, cellSize }) => (
  <mesh position={[x, y, 0.08]}>
    <torusGeometry args={[cellSize * 0.28, Math.max(cellSize * 0.08, 0.03), 16, 32]} />
    <meshStandardMaterial color="#2563eb" />
  </mesh>
);

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
      <ambientLight intensity={0.7} />
      <directionalLight position={[1.5, 2, 8]} intensity={0.8} />

      {game.boards.map((board, boardIndex) => {
        const center = boardCenters[boardIndex];
        const boardPlayable = canPlayInBoard(game, boardIndex);
        const boardResolved = isBoardResolved(board);

        let boardOverlayColor = null;
        if (board.winner === "X") {
          boardOverlayColor = "#14532d";
        } else if (board.winner === "O") {
          boardOverlayColor = "#1e3a8a";
        } else if (board.isDraw) {
          boardOverlayColor = "#334155";
        }

        return (
          <group key={`board-${boardIndex}`}>
            <mesh position={[center.x, center.y, -0.04]}>
              <planeGeometry args={[boardSpan, boardSpan]} />
              <meshStandardMaterial color="#0f172a" roughness={0.9} />
            </mesh>

            {boardOverlayColor ? (
              <mesh position={[center.x, center.y, 0.03]}>
                <planeGeometry args={[boardSpan - lineThickness, boardSpan - lineThickness]} />
                <meshStandardMaterial color={boardOverlayColor} transparent opacity={0.28} />
              </mesh>
            ) : null}

            {Array.from({ length: size - 1 }, (_, lineIndex) => {
              const offset = (lineIndex + 1 - size / 2) * cellSize;
              return (
                <group key={`local-lines-${boardIndex}-${lineIndex}`}>
                  <mesh position={[center.x + offset, center.y, 0.04]}>
                    <boxGeometry args={[lineThickness, boardSpan, lineThickness]} />
                    <meshStandardMaterial color="#475569" />
                  </mesh>
                  <mesh position={[center.x, center.y - offset, 0.04]}>
                    <boxGeometry args={[boardSpan, lineThickness, lineThickness]} />
                    <meshStandardMaterial color="#475569" />
                  </mesh>
                </group>
              );
            })}

            {board.cells.map((cellValue, cellIndex) => {
              const { row, col } = indexToCoords(cellIndex, size);
              const x = center.x + (col - boardCenterOffset) * cellSize;
              const y = center.y + (boardCenterOffset - row) * cellSize;

              let cellColor = "#e2e8f0";
              if (!boardPlayable && !boardResolved && !gameOver) {
                cellColor = "#94a3b8";
              }
              if (boardResolved) {
                if (board.winner === "X") {
                  cellColor = "#bbf7d0";
                } else if (board.winner === "O") {
                  cellColor = "#bfdbfe";
                } else {
                  cellColor = "#cbd5e1";
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
                    <meshStandardMaterial color={cellColor} roughness={0.9} metalness={0.05} />
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
              <meshStandardMaterial color="#f8fafc" />
            </mesh>
            <mesh position={[0, -offset, 0.07]}>
              <boxGeometry args={[totalSpan, lineThickness * 2, lineThickness * 2]} />
              <meshStandardMaterial color="#f8fafc" />
            </mesh>
          </group>
        );
      })}
    </>
  );
};

const Board3D = ({ game, onCellClick }) => {
  const layout = useMemo(() => getLayout(game.size), [game.size]);
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
        <color attach="background" args={["#020617"]} />
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
      </Canvas>
    </div>
  );
};

export default Board3D;
