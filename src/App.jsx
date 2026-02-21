import { useEffect, useMemo, useState } from "react";
import Board3D from "./Board3D";
import {
  createInitialGameState,
  getAllowedBoardIndexes,
  indexToCoords,
  makeMove,
  normalizeSize,
} from "./gameLogic";
import {
  playDrawSfx,
  playInvalidSfx,
  playLocalWinSfx,
  playMoveSfx,
  playSuperWinSfx,
} from "./soundEffects";
import {
  createNextGameEntry,
  describeGameStatus,
  loadGameStore,
  saveGameStore,
} from "./gameStore";

const DEFAULT_SIZE = 3;

const boardLabel = (boardIndex, size) => {
  const { row, col } = indexToCoords(boardIndex, size);
  return `(${row + 1}, ${col + 1})`;
};

const formatTimestamp = (timestamp) => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "unknown time";
  }
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const sortTimelineGames = (games) =>
  [...games].sort((left, right) => right.updatedAt - left.updatedAt);

const App = () => {
  const [store, setStore] = useState(() => loadGameStore());

  const activeGameEntry = useMemo(
    () => store.games.find((entry) => entry.id === store.activeGameId) ?? store.games[0],
    [store.activeGameId, store.games],
  );

  const game = activeGameEntry?.gameState ?? createInitialGameState(DEFAULT_SIZE);
  const timelineGames = useMemo(() => sortTimelineGames(store.games), [store.games]);
  const soundEnabled = store.soundEnabled;

  const allowedBoards = useMemo(() => getAllowedBoardIndexes(game), [game]);

  useEffect(() => {
    saveGameStore(store);
  }, [store]);

  const statusText = useMemo(() => {
    if (game.winner) {
      return `Player ${game.winner} wins the super board!`;
    }

    if (game.isDraw) {
      return "Draw game. Every local board is resolved.";
    }

    if (allowedBoards.length === 1) {
      return `Player ${game.currentPlayer}'s turn. Must play in board ${boardLabel(
        allowedBoards[0],
        game.size,
      )}.`;
    }

    return `Player ${game.currentPlayer}'s turn. Play in any open board.`;
  }, [allowedBoards, game.currentPlayer, game.isDraw, game.size, game.winner]);

  const handleCellClick = (boardIndex, cellIndex) => {
    if (!activeGameEntry) {
      return;
    }

    const nextGame = makeMove(game, boardIndex, cellIndex);
    if (nextGame === game) {
      playInvalidSfx(soundEnabled);
      return;
    }

    playMoveSfx(soundEnabled);

    const capturedLocalBoard = nextGame.boards.some((nextBoard, index) => {
      const previousBoard = game.boards[index];
      return !previousBoard.winner && Boolean(nextBoard.winner);
    });

    if (!game.winner && nextGame.winner) {
      playSuperWinSfx(soundEnabled);
    } else if (!game.isDraw && nextGame.isDraw) {
      playDrawSfx(soundEnabled);
    } else if (capturedLocalBoard) {
      playLocalWinSfx(soundEnabled);
    }

    setStore((currentStore) => {
      const gameIndex = currentStore.games.findIndex((entry) => entry.id === activeGameEntry.id);
      if (gameIndex < 0) {
        return currentStore;
      }

      const nextGames = currentStore.games.slice();
      nextGames[gameIndex] = {
        ...nextGames[gameIndex],
        updatedAt: Date.now(),
        gameState: nextGame,
      };

      return {
        ...currentStore,
        games: nextGames,
      };
    });
  };

  const handleApplySize = () => {
    setStore((currentStore) => {
      const nextSize = normalizeSize(currentStore.sizeInput);
      const newGame = createNextGameEntry(nextSize, currentStore.games);

      return {
        ...currentStore,
        sizeInput: String(nextSize),
        activeGameId: newGame.id,
        games: [...currentStore.games, newGame],
      };
    });
  };

  const handleRestart = () => {
    if (!activeGameEntry) {
      return;
    }

    setStore((currentStore) => {
      const gameIndex = currentStore.games.findIndex((entry) => entry.id === activeGameEntry.id);
      if (gameIndex < 0) {
        return currentStore;
      }

      const nextGames = currentStore.games.slice();
      const currentGameEntry = nextGames[gameIndex];
      const resetGame = createInitialGameState(currentGameEntry.gameState.size);

      nextGames[gameIndex] = {
        ...currentGameEntry,
        updatedAt: Date.now(),
        gameState: resetGame,
      };

      return {
        ...currentStore,
        sizeInput: String(resetGame.size),
        games: nextGames,
      };
    });
  };

  const handleOpenGame = (gameId) => {
    setStore((currentStore) => {
      const selectedGame = currentStore.games.find((entry) => entry.id === gameId);
      if (!selectedGame || currentStore.activeGameId === gameId) {
        return currentStore;
      }

      return {
        ...currentStore,
        activeGameId: selectedGame.id,
        sizeInput: String(selectedGame.gameState.size),
      };
    });
  };

  return (
    <main className="app-shell">
      <h1>Super Tic-Tac-Toe</h1>
      <p className="subtitle">React + Three.js edition for family game night.</p>

      <div className="controls">
        <label htmlFor="board-size-input">Board size N</label>
        <input
          id="board-size-input"
          type="number"
          min="2"
          step="1"
          value={store.sizeInput}
          onChange={(event) =>
            setStore((currentStore) => ({ ...currentStore, sizeInput: event.target.value }))
          }
        />
        <button type="button" onClick={handleApplySize}>
          Start New N x N Game
        </button>
        <button type="button" onClick={handleRestart}>
          Restart Current Size
        </button>
        <button
          type="button"
          onClick={() =>
            setStore((currentStore) => ({ ...currentStore, soundEnabled: !currentStore.soundEnabled }))
          }
        >
          Sound: {soundEnabled ? "On" : "Off"}
        </button>
      </div>

      <section className="timeline">
        <h2>Saved Games Timeline</h2>
        <p className="timeline-subtitle">
          Every move auto-saves in this browser. Refresh safely, then return to any game.
        </p>
        <ul className="timeline-list">
          {timelineGames.map((gameEntry) => {
            const gameStatus = describeGameStatus(gameEntry.gameState);
            const isActive = gameEntry.id === activeGameEntry?.id;

            return (
              <li key={gameEntry.id}>
                <button
                  type="button"
                  className={`timeline-item ${isActive ? "is-active" : ""}`}
                  onClick={() => handleOpenGame(gameEntry.id)}
                >
                  <span className="timeline-title-row">
                    <span className="timeline-name">{gameEntry.name}</span>
                    <span className={`timeline-pill timeline-pill-${gameStatus.kind}`}>
                      {gameStatus.label}
                    </span>
                  </span>
                  <span className="timeline-detail-row">
                    {gameEntry.gameState.size} x {gameEntry.gameState.size} •{" "}
                    {gameEntry.gameState.moveCount} moves • Updated {formatTimestamp(gameEntry.updatedAt)}
                  </span>
                  <span className="timeline-open-label">
                    {isActive ? "Open now" : "Open this game"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <p className="status">{statusText}</p>
      <p className="meta">
        Size: {game.size} x {game.size} boards, {game.size} x {game.size} cells each. Moves played:{" "}
        {game.moveCount}
      </p>
      <p className="zoom-hint">Zoom: mouse wheel or trackpad pinch. Pan: click and drag.</p>

      <Board3D game={game} onCellClick={handleCellClick} />

      <section className="rules">
        <h2>Rules in this version</h2>
        <ol>
          <li>Win a local board by making a full row, column, or diagonal.</li>
          <li>
            Your move sends the next player to the local board that matches the cell position you
            picked.
          </li>
          <li>
            If that destination board is already resolved, the next player may choose any open
            board.
          </li>
          <li>Win the super board by winning a full row, column, or diagonal of local boards.</li>
          <li>Soft sound effects are enabled by default. Use the Sound button to mute.</li>
          <li>Games auto-save with timeline history, so you can leave and resume later.</li>
        </ol>
      </section>
    </main>
  );
};

export default App;
