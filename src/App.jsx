import { useEffect, useMemo, useState } from "react";
import Board3D from "./Board3D";
import { createInitialGameState, getAllowedBoardIndexes, indexToCoords, makeMove } from "./gameLogic";
import {
  playDrawSfx,
  playInterTurnSfx,
  playInvalidSfx,
  playLocalWinSfx,
  playOMoveSfx,
  playSuperWinSfx,
  playXMoveSfx,
} from "./soundEffects";

const FIXED_SIZE = 3;
const STORAGE_KEY = "super-ttt-focused-v1";
const LEGACY_STORE_KEY = "super-tic-tac-toe-save-v1";

const isMarker = (value) => value === "X" || value === "O";

const countMoves = (boards) =>
  boards.reduce(
    (total, board) => total + board.cells.reduce((boardTotal, marker) => boardTotal + (marker ? 1 : 0), 0),
    0,
  );

const coerceToClassicGame = (rawGame) => {
  const base = createInitialGameState(FIXED_SIZE);
  if (
    !rawGame ||
    rawGame.size !== FIXED_SIZE ||
    !Array.isArray(rawGame.boards) ||
    rawGame.boards.length !== FIXED_SIZE * FIXED_SIZE
  ) {
    return base;
  }

  const boards = Array.from({ length: FIXED_SIZE * FIXED_SIZE }, (_, boardIndex) => {
    const rawBoard = rawGame.boards[boardIndex];
    const cells = Array.from({ length: FIXED_SIZE * FIXED_SIZE }, (_, cellIndex) => {
      const value = rawBoard?.cells?.[cellIndex];
      return isMarker(value) ? value : null;
    });
    const winner = isMarker(rawBoard?.winner) ? rawBoard.winner : null;

    return {
      cells,
      winner,
      isDraw: !winner && Boolean(rawBoard?.isDraw),
    };
  });

  const moveCount =
    Number.isInteger(rawGame.moveCount) && rawGame.moveCount >= 0 ? rawGame.moveCount : countMoves(boards);
  const nextBoardIndex =
    Number.isInteger(rawGame.nextBoardIndex) &&
    rawGame.nextBoardIndex >= 0 &&
    rawGame.nextBoardIndex < FIXED_SIZE * FIXED_SIZE
      ? rawGame.nextBoardIndex
      : null;

  const hasLastMove =
    Number.isInteger(rawGame?.lastMove?.boardIndex) &&
    Number.isInteger(rawGame?.lastMove?.cellIndex) &&
    isMarker(rawGame?.lastMove?.player);

  return {
    ...base,
    boards,
    moveCount,
    currentPlayer: rawGame.currentPlayer === "O" ? "O" : "X",
    nextBoardIndex,
    winner: isMarker(rawGame.winner) ? rawGame.winner : null,
    isDraw: !isMarker(rawGame.winner) && Boolean(rawGame.isDraw),
    lastMove: hasLastMove
      ? {
          boardIndex: rawGame.lastMove.boardIndex,
          cellIndex: rawGame.lastMove.cellIndex,
          player: rawGame.lastMove.player,
          moveNumber:
            Number.isInteger(rawGame.lastMove.moveNumber) && rawGame.lastMove.moveNumber >= 0
              ? rawGame.lastMove.moveNumber
              : moveCount,
          timestamp:
            Number.isFinite(rawGame.lastMove.timestamp) && rawGame.lastMove.timestamp > 0
              ? rawGame.lastMove.timestamp
              : Date.now(),
        }
      : null,
  };
};

const loadSession = () => {
  const defaultSession = { game: createInitialGameState(FIXED_SIZE), soundEnabled: true };
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return defaultSession;
  }

  try {
    const focusedRaw = window.localStorage.getItem(STORAGE_KEY);
    if (focusedRaw) {
      const parsed = JSON.parse(focusedRaw);
      return {
        game: coerceToClassicGame(parsed?.game),
        soundEnabled: parsed?.soundEnabled !== false,
      };
    }

    const legacyRaw = window.localStorage.getItem(LEGACY_STORE_KEY);
    if (!legacyRaw) {
      return defaultSession;
    }

    const parsedLegacy = JSON.parse(legacyRaw);
    if (!Array.isArray(parsedLegacy?.games) || parsedLegacy.games.length === 0) {
      return defaultSession;
    }

    const activeLegacyGame =
      parsedLegacy.games.find((entry) => entry?.id === parsedLegacy.activeGameId)?.gameState ??
      parsedLegacy.games[0]?.gameState;

    return {
      game: coerceToClassicGame(activeLegacyGame),
      soundEnabled: parsedLegacy?.soundEnabled !== false,
    };
  } catch {
    return defaultSession;
  }
};

const saveSession = (session) => {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return;
  }
  const payload = {
    game: session.game,
    soundEnabled: session.soundEnabled,
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
};

const boardLabel = (boardIndex, size) => {
  const { row, col } = indexToCoords(boardIndex, size);
  return `(${row + 1}, ${col + 1})`;
};

const App = () => {
  const [session, setSession] = useState(() => loadSession());
  const game = session.game;

  const allowedBoards = useMemo(() => getAllowedBoardIndexes(game), [game]);

  useEffect(() => {
    saveSession(session);
  }, [session]);

  const statusText = useMemo(() => {
    if (game.winner) {
      return `Player ${game.winner} wins!`;
    }

    if (game.isDraw) {
      return "Draw game.";
    }

    if (allowedBoards.length === 1) {
      return `Player ${game.currentPlayer} must play board ${boardLabel(allowedBoards[0], game.size)}.`;
    }

    return `Player ${game.currentPlayer}: play in any open board.`;
  }, [allowedBoards, game.currentPlayer, game.isDraw, game.size, game.winner]);

  const handleCellClick = (boardIndex, cellIndex) => {
    const nextGame = makeMove(game, boardIndex, cellIndex);
    if (nextGame === game) {
      playInvalidSfx(session.soundEnabled);
      return;
    }

    const playedBy = nextGame.lastMove?.player ?? game.currentPlayer;
    if (playedBy === "X") {
      playXMoveSfx(session.soundEnabled);
    } else {
      playOMoveSfx(session.soundEnabled);
    }

    const capturedLocalBoard = nextGame.boards.some((nextBoard, index) => {
      const previousBoard = game.boards[index];
      return !previousBoard.winner && Boolean(nextBoard.winner);
    });

    if (!game.winner && nextGame.winner) {
      playSuperWinSfx(session.soundEnabled);
    } else if (!game.isDraw && nextGame.isDraw) {
      playDrawSfx(session.soundEnabled);
    } else if (capturedLocalBoard) {
      playLocalWinSfx(session.soundEnabled);
    }

    if (!nextGame.winner && !nextGame.isDraw) {
      playInterTurnSfx(session.soundEnabled);
    }

    setSession((current) => ({
      ...current,
      game: nextGame,
    }));
  };

  const handleRestart = () => {
    setSession((current) => ({
      ...current,
      game: createInitialGameState(FIXED_SIZE),
    }));
  };

  return (
    <main className="focus-shell">
      <section className="game-focus-card">
        <div className="game-hud">
          <h1>Super Tic-Tac-Toe</h1>
          <p className="status-line">{statusText}</p>
          <p className="meta-line">Classic mode: 9 local boards • Moves: {game.moveCount}</p>
        </div>

        <Board3D game={game} onCellClick={handleCellClick} />

        <div className="control-strip">
          <button type="button" onClick={handleRestart}>
            New Game
          </button>
          <button
            type="button"
            onClick={() =>
              setSession((current) => ({ ...current, soundEnabled: !current.soundEnabled }))
            }
          >
            Sound: {session.soundEnabled ? "On" : "Off"}
          </button>
        </div>
      </section>
    </main>
  );
};

export default App;
