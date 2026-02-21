import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";
import { canPlayInBoard, indexToCoords, isBoardResolved } from "./gameLogic";

const CELL_SIZE = 1;
const BOARD_GAP = 0.35;

const XMark = ({ x, y }) => (
  <group position={[x, y, 0.08]}>
    <mesh rotation={[0, 0, Math.PI / 4]}>
      <boxGeometry args={[0.72, 0.12, 0.1]} />
      <meshStandardMaterial color="#f97316" />
    </mesh>
    <mesh rotation={[0, 0, -Math.PI / 4]}>
      <boxGeometry args={[0.72, 0.12, 0.1]} />
      <meshStandardMaterial color="#f97316" />
    </mesh>
  </group>
);

const OMark = ({ x, y }) => (
  <mesh position={[x, y, 0.08]}>
    <torusGeometry args={[0.28, 0.08, 16, 32]} />
    <meshStandardMaterial color="#2563eb" />
  </mesh>
);

const BoardScene = ({ game, onCellClick }) => {
  const size = game.size;
  const boardSpan = size * CELL_SIZE;
  const boardCenterOffset = (size - 1) / 2;
  const totalSpan = size * boardSpan + (size - 1) * BOARD_GAP;
  const gameOver = Boolean(game.winner) || game.isDraw;

  const boardCenters = useMemo(
    () =>
      game.boards.map((_, boardIndex) => {
        const { row, col } = indexToCoords(boardIndex, size);
        return {
          x: (col - boardCenterOffset) * (boardSpan + BOARD_GAP),
          y: (boardCenterOffset - row) * (boardSpan + BOARD_GAP),
        };
      }),
    [boardCenterOffset, boardSpan, game.boards, size],
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
                <planeGeometry args={[boardSpan - 0.08, boardSpan - 0.08]} />
                <meshStandardMaterial color={boardOverlayColor} transparent opacity={0.28} />
              </mesh>
            ) : null}

            {Array.from({ length: size - 1 }, (_, lineIndex) => {
              const offset = (lineIndex + 1 - size / 2) * CELL_SIZE;
              return (
                <group key={`local-lines-${boardIndex}-${lineIndex}`}>
                  <mesh position={[center.x + offset, center.y, 0.04]}>
                    <boxGeometry args={[0.04, boardSpan, 0.05]} />
                    <meshStandardMaterial color="#475569" />
                  </mesh>
                  <mesh position={[center.x, center.y - offset, 0.04]}>
                    <boxGeometry args={[boardSpan, 0.04, 0.05]} />
                    <meshStandardMaterial color="#475569" />
                  </mesh>
                </group>
              );
            })}

            {board.cells.map((cellValue, cellIndex) => {
              const { row, col } = indexToCoords(cellIndex, size);
              const x = center.x + (col - boardCenterOffset) * CELL_SIZE;
              const y = center.y + (boardCenterOffset - row) * CELL_SIZE;

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
                    <planeGeometry args={[0.92, 0.92]} />
                    <meshStandardMaterial color={cellColor} roughness={0.9} metalness={0.05} />
                  </mesh>

                  {cellValue === "X" ? <XMark x={x} y={y} /> : null}
                  {cellValue === "O" ? <OMark x={x} y={y} /> : null}
                </group>
              );
            })}
          </group>
        );
      })}

      {Array.from({ length: size - 1 }, (_, lineIndex) => {
        const offset = (lineIndex + 1 - size / 2) * (boardSpan + BOARD_GAP);
        return (
          <group key={`meta-lines-${lineIndex}`}>
            <mesh position={[offset, 0, 0.07]}>
              <boxGeometry args={[0.12, totalSpan, 0.1]} />
              <meshStandardMaterial color="#f8fafc" />
            </mesh>
            <mesh position={[0, -offset, 0.07]}>
              <boxGeometry args={[totalSpan, 0.12, 0.1]} />
              <meshStandardMaterial color="#f8fafc" />
            </mesh>
          </group>
        );
      })}
    </>
  );
};

const Board3D = ({ game, onCellClick }) => {
  const size = game.size;
  const boardSpan = size * CELL_SIZE;
  const totalSpan = size * boardSpan + (size - 1) * BOARD_GAP;
  const cameraZ = Math.max(18, totalSpan * 1.45);

  return (
    <div className="board-canvas">
      <Canvas camera={{ position: [0, 0, cameraZ], fov: 48 }}>
        <color attach="background" args={["#020617"]} />
        <BoardScene game={game} onCellClick={onCellClick} />
      </Canvas>
    </div>
  );
};

export default Board3D;
