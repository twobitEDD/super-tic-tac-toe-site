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
const KNOWN_MATCHES = [
  {
    id: "match-2070-114",
    title: "Downtown Cabinet #114",
    status: "claim-open",
    pixel: { row: 6, col: 18 },
    claimer: "RookRift",
    challenger: null,
    winner: null,
    updatedAt: "2m ago",
  },
  {
    id: "match-2070-113",
    title: "Skyline Ladder #113",
    status: "live",
    pixel: { row: 11, col: 27 },
    claimer: "NovaThread",
    challenger: "GridWarden",
    winner: null,
    updatedAt: "live now",
  },
  {
    id: "match-2070-108",
    title: "Neon Orbit #108",
    status: "completed",
    pixel: { row: 14, col: 9 },
    claimer: "PixelNomad",
    challenger: "CometLoop",
    winner: "CometLoop",
    updatedAt: "14m ago",
  },
  {
    id: "match-2070-101",
    title: "Dustline Showdown #101",
    status: "completed",
    pixel: { row: 3, col: 33 },
    claimer: "OrbitForge",
    challenger: "GlowPilot",
    winner: "OrbitForge",
    updatedAt: "29m ago",
  },
];
const MATCH_STATUS_LABEL = {
  "claim-open": "Claimed / Open Challenge",
  live: "Live Duel",
  completed: "Completed",
};

const isMarker = (value) => value === "X" || value === "O";
const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
const isKnownMatchId = (value) =>
  typeof value === "string" && KNOWN_MATCHES.some((matchEntry) => matchEntry.id === value);

const countMoves = (boards) =>
  boards.reduce(
    (total, board) => total + board.cells.reduce((boardTotal, marker) => boardTotal + (marker ? 1 : 0), 0),
    0,
  );

const OUTLINE_CELLS = Array.from({ length: BACKDROP_OUTLINE_CELL_COUNT }, (_, index) => index);

const getMatchNarrative = (matchEntry) => {
  const coord = `Pixel (${matchEntry.pixel.row}, ${matchEntry.pixel.col})`;
  if (matchEntry.status === "claim-open") {
    return `${coord} claimed by ${matchEntry.claimer}; waiting for a challenger.`;
  }
  if (matchEntry.status === "live") {
    return `${coord} claimed by ${matchEntry.claimer}, challenged by ${matchEntry.challenger}.`;
  }
  return `${coord} claimed by ${matchEntry.claimer}, challenged by ${matchEntry.challenger}, winner ${matchEntry.winner}.`;
};

const getPrimaryActionLabel = (matchEntry) => {
  if (matchEntry.status === "claim-open") {
    return "Join Challenge";
  }
  if (matchEntry.status === "live") {
    return "Watch Live Match";
  }
  return "Re-watch Match";
};

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
    selectedMatchId: KNOWN_MATCHES[0].id,
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
        selectedMatchId: isKnownMatchId(parsed?.selectedMatchId)
          ? parsed.selectedMatchId
          : defaultSession.selectedMatchId,
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
      selectedMatchId: defaultSession.selectedMatchId,
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
    selectedMatchId: session.selectedMatchId,
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
  const [arenaMode, setArenaMode] = useState("watch");

  const allowedBoards = useMemo(() => getAllowedBoardIndexes(game), [game]);
  const selectedMatch = useMemo(
    () => KNOWN_MATCHES.find((matchEntry) => matchEntry.id === session.selectedMatchId) ?? KNOWN_MATCHES[0],
    [session.selectedMatchId],
  );
  const selectedMatchNarrative = useMemo(() => getMatchNarrative(selectedMatch), [selectedMatch]);
  const interactionLocked = arenaMode !== "join";

  useEffect(() => {
    saveSession(session);
  }, [session]);

  useEffect(() => {
    if (selectedMatch.status === "completed") {
      setArenaMode("rewatch");
    } else if (arenaMode === "rewatch") {
      setArenaMode("watch");
    } else if (arenaMode === "join" && selectedMatch.status !== "claim-open") {
      setArenaMode("watch");
    }
  }, [arenaMode, selectedMatch.status]);

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

  const stageStatusText = useMemo(() => {
    if (arenaMode === "join") {
      return `Challenge active on pixel (${selectedMatch.pixel.row}, ${selectedMatch.pixel.col}). ${statusText}`;
    }
    if (arenaMode === "rewatch") {
      return `Re-watch mode: winner ${selectedMatch.winner} on pixel (${selectedMatch.pixel.row}, ${selectedMatch.pixel.col}).`;
    }
    return `Spectating ${selectedMatch.id} on pixel (${selectedMatch.pixel.row}, ${selectedMatch.pixel.col}).`;
  }, [arenaMode, selectedMatch.id, selectedMatch.pixel.col, selectedMatch.pixel.row, selectedMatch.winner, statusText]);

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

  const handleStageCellClick = (boardIndex, cellIndex) => {
    if (interactionLocked) {
      playInvalidSfx(session.soundEnabled);
      return;
    }
    handleCellClick(boardIndex, cellIndex);
  };

  const handleRestart = () => {
    setSession((current) => ({
      ...current,
      game: createInitialGameState(FIXED_SIZE),
    }));
  };

  const handleSelectKnownMatch = (matchId) => {
    const nextMatch = KNOWN_MATCHES.find((matchEntry) => matchEntry.id === matchId) ?? KNOWN_MATCHES[0];
    setSession((current) => ({
      ...current,
      selectedMatchId: nextMatch.id,
    }));

    if (nextMatch.status === "completed") {
      setArenaMode("rewatch");
      return;
    }
    setArenaMode("watch");
  };

  const handlePrimaryAction = () => {
    if (selectedMatch.status === "claim-open") {
      setArenaMode("join");
      setSession((current) => ({
        ...current,
        game: createInitialGameState(FIXED_SIZE),
      }));
      return;
    }
    if (selectedMatch.status === "completed") {
      setArenaMode("rewatch");
      return;
    }
    setArenaMode("watch");
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
            Boot into the arcade hub, browse known SuperTicTacToe games, then watch, join, or re-watch matches tied to
            pixel coordinates in the global map.
          </p>
          <div className="landing-flow">
            <div>
              <h2>1. Enter Lobby</h2>
              <p>Open your account panel and match roster.</p>
            </div>
            <div>
              <h2>2. Pick Known Match</h2>
              <p>Each game points to one pixel coordinate claim.</p>
            </div>
            <div>
              <h2>3. Watch / Join / Re-watch</h2>
              <p>Outcome tracks claimer, challenger, and winner.</p>
            </div>
          </div>
          <div className="launch-row">
            <button type="button" onClick={() => setView("arcade")}>
              Enter Arcade Hub
            </button>
            <p>
              Pilot: <strong>{session.accountHandle}</strong> • Matches tracked: {KNOWN_MATCHES.length}
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
              <h2>Known SuperTicTacToe Games</h2>
              <ul className="known-games-list">
                {KNOWN_MATCHES.map((matchEntry) => (
                  <li key={matchEntry.id}>
                    <button
                      type="button"
                      className={session.selectedMatchId === matchEntry.id ? "is-active" : ""}
                      onClick={() => handleSelectKnownMatch(matchEntry.id)}
                    >
                      <span>{matchEntry.title}</span>
                      <small>{MATCH_STATUS_LABEL[matchEntry.status]}</small>
                    </button>
                    <p className="match-meta-line">{getMatchNarrative(matchEntry)}</p>
                    <p className="match-meta-line">Updated: {matchEntry.updatedAt}</p>
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
              <h2>{selectedMatch.title}</h2>
              <p>{selectedMatchNarrative}</p>
              <div className="stage-action-row">
                <button type="button" className="primary-match-action" onClick={handlePrimaryAction}>
                  {getPrimaryActionLabel(selectedMatch)}
                </button>
                <span className="status-pill">{MATCH_STATUS_LABEL[selectedMatch.status]}</span>
              </div>
            </header>

            <div className="game-hud">
              <p className="status-line">{stageStatusText}</p>
              <p className="meta-line">Classic mode: 9 local boards • Moves: {game.moveCount}</p>
              {interactionLocked ? (
                <p className="stage-note">Board input is locked while watching/re-watching.</p>
              ) : (
                <p className="stage-note">Challenge mode active: play to contest the claim.</p>
              )}
            </div>

            <Board3D game={game} onCellClick={handleStageCellClick} />

            <div className="control-strip">
              <button type="button" onClick={handleRestart} disabled={interactionLocked}>
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
        </section>
      )}
    </main>
  );
};

export default App;
