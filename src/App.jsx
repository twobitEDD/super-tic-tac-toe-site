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
const BACKDROP_OUTLINE_CELL_COUNT = 2400;
const BACKDROP_OUTLINE_COLUMNS = 60;
const KNOWN_GAMES = [
  { id: "super-ttt", name: "Super Tic-Tac-Toe", mode: "Live", description: "Classic arena duel." },
  { id: "orbital-bobble", name: "Orbital Bobble 3000", mode: "Queued", description: "Coming soon." },
  { id: "kombat-58", name: "Mortal Kombat 58", mode: "Queued", description: "Coming soon." },
  { id: "astro-racer", name: "Astro Racer Neon", mode: "Queued", description: "Coming soon." },
];

const isMarker = (value) => value === "X" || value === "O";
const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

const countMoves = (boards) =>
  boards.reduce(
    (total, board) => total + board.cells.reduce((boardTotal, marker) => boardTotal + (marker ? 1 : 0), 0),
    0,
  );

const OUTLINE_CELLS = Array.from({ length: BACKDROP_OUTLINE_CELL_COUNT }, (_, index) => index);

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
  const defaultSession = {
    game: createInitialGameState(FIXED_SIZE),
    soundEnabled: true,
    accountHandle: "SpaceCowboy",
    selectedGameId: "super-ttt",
  };
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
        accountHandle: isNonEmptyString(parsed?.accountHandle)
          ? parsed.accountHandle.trim().slice(0, 24)
          : defaultSession.accountHandle,
        selectedGameId:
          KNOWN_GAMES.some((gameEntry) => gameEntry.id === parsed?.selectedGameId)
            ? parsed.selectedGameId
            : defaultSession.selectedGameId,
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
      accountHandle: defaultSession.accountHandle,
      selectedGameId: defaultSession.selectedGameId,
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
    accountHandle: session.accountHandle,
    selectedGameId: session.selectedGameId,
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
  const [view, setView] = useState("landing");

  const allowedBoards = useMemo(() => getAllowedBoardIndexes(game), [game]);
  const selectedGame = useMemo(
    () => KNOWN_GAMES.find((gameEntry) => gameEntry.id === session.selectedGameId) ?? KNOWN_GAMES[0],
    [session.selectedGameId],
  );
  const selectedGameIsPlayable = selectedGame.id === "super-ttt";

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
    <main className="arcade-shell">
      <div
        className="empty-pixelmap-backdrop"
        style={{ "--outline-columns": BACKDROP_OUTLINE_COLUMNS }}
        aria-hidden="true"
      >
        {OUTLINE_CELLS.map((index) => (
          <span key={`outline-${index}`} className="outline-cell" />
        ))}
      </div>

      {view === "landing" ? (
        <section className="landing-card">
          <p className="badge-line">Arcade Protocol // 2070</p>
          <h1>Nebula Showdown Grid</h1>
          <p>
            Boot into the arcade hub, pick a known game, and battle in a neon arena where the world pixelmap lives as an
            empty outlined grid behind every fight.
          </p>
          <div className="landing-flow">
            <div>
              <h2>1. Enter Lobby</h2>
              <p>Open the hub with your account and roster.</p>
            </div>
            <div>
              <h2>2. Pick Known Game</h2>
              <p>Super Tic-Tac-Toe is live, others are queued.</p>
            </div>
            <div>
              <h2>3. Hit The Arena</h2>
              <p>The game runs over a blank outlined pixelmap field.</p>
            </div>
          </div>
          <div className="launch-row">
            <button type="button" onClick={() => setView("arcade")}>
              Enter Arcade Hub
            </button>
            <p>
              Pilot: <strong>{session.accountHandle}</strong> • Live mode ready
            </p>
          </div>
        </section>
      ) : (
        <section className="arcade-layout">
          <aside className="hub-panel">
            <article className="card account-card">
              <h2>User Account</h2>
              <p>Customize your pilot handle for arcade sessions.</p>
              <label htmlFor="account-handle">Pilot Handle</label>
              <input
                id="account-handle"
                type="text"
                value={session.accountHandle}
                maxLength={24}
                onChange={(event) =>
                  setSession((current) => ({
                    ...current,
                    accountHandle: event.target.value,
                  }))
                }
              />
              <p className="account-meta">Rank: Neon Cadet • Credits: 12,800</p>
            </article>

            <article className="card games-card">
              <h2>Known Games</h2>
              <ul className="known-games-list">
                {KNOWN_GAMES.map((gameEntry) => (
                  <li key={gameEntry.id}>
                    <button
                      type="button"
                      className={session.selectedGameId === gameEntry.id ? "is-active" : ""}
                      onClick={() =>
                        setSession((current) => ({
                          ...current,
                          selectedGameId: gameEntry.id,
                        }))
                      }
                    >
                      <span>{gameEntry.name}</span>
                      <small>{gameEntry.mode}</small>
                    </button>
                    <p>{gameEntry.description}</p>
                  </li>
                ))}
              </ul>
              <button type="button" className="secondary" onClick={() => setView("landing")}>
                Back To Landing
              </button>
            </article>
          </aside>

          <section className="game-stage card">
            <header className="stage-header">
              <h2>{selectedGame.name}</h2>
              <p>{selectedGameIsPlayable ? "Live match room is active." : "Queued game module, waiting for release."}</p>
            </header>

            {selectedGameIsPlayable ? (
              <>
                <div className="game-hud">
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
              </>
            ) : (
              <div className="queued-panel">
                <p>
                  <strong>{selectedGame.name}</strong> is listed in the known games roster, but this cabinet is still
                  warming up.
                </p>
                <p>Switch to Super Tic-Tac-Toe to play now.</p>
              </div>
            )}
          </section>
        </section>
      )}
    </main>
  );
};

export default App;
