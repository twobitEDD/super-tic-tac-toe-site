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
const GLOBAL_MAP_ROWS = 22;
const GLOBAL_MAP_COLS = 40;
const GLOBAL_MAP_TOTAL = GLOBAL_MAP_ROWS * GLOBAL_MAP_COLS;

const PLAYER_COLORS = [
  { id: "plasma-pink", name: "Plasma Pink", hex: "#ff4fc8" },
  { id: "neon-cyan", name: "Neon Cyan", hex: "#4ef4f1" },
  { id: "solar-gold", name: "Solar Gold", hex: "#facc15" },
  { id: "orbit-violet", name: "Orbit Violet", hex: "#8b5cf6" },
  { id: "ember-red", name: "Ember Red", hex: "#ef4444" },
  { id: "aurora-green", name: "Aurora Green", hex: "#22c55e" },
  { id: "sky-indigo", name: "Sky Indigo", hex: "#6366f1" },
  { id: "sunset-orange", name: "Sunset Orange", hex: "#f97316" },
  { id: "frost-blue", name: "Frost Blue", hex: "#38bdf8" },
  { id: "nova-lime", name: "Nova Lime", hex: "#84cc16" },
  { id: "arcade-purple", name: "Arcade Purple", hex: "#a855f7" },
  { id: "pearl-white", name: "Pearl White", hex: "#f8fafc" },
];

const PLAYER_COLOR_BY_ID = Object.fromEntries(PLAYER_COLORS.map((entry) => [entry.id, entry]));
const CHALLENGER_NAMES = [
  "RookRift",
  "NovaThread",
  "PixelNomad",
  "OrbitForge",
  "GlowPilot",
  "HexJockey",
  "GridWarden",
  "CometLoop",
];
const CHALLENGE_MODES = ["Classic 3x3", "Speed Blitz", "Fog Rules", "No Mirror"];

const isMarker = (value) => value === "X" || value === "O";
const isPlayerColorId = (value) => typeof value === "string" && Boolean(PLAYER_COLOR_BY_ID[value]);

const countMoves = (boards) =>
  boards.reduce(
    (total, board) => total + board.cells.reduce((boardTotal, marker) => boardTotal + (marker ? 1 : 0), 0),
    0,
  );

const getGlobalMapCoords = (index) => ({
  row: Math.floor(index / GLOBAL_MAP_COLS),
  col: index % GLOBAL_MAP_COLS,
});

const buildHistoricalPixelMap = () =>
  Array.from(
    { length: GLOBAL_MAP_TOTAL },
    (_, index) =>
      PLAYER_COLORS[(index * 7 + Math.floor(index / GLOBAL_MAP_COLS) * 5 + (index % GLOBAL_MAP_COLS)) % PLAYER_COLORS.length]
        .id,
  );

const buildPixelBackdrop = () =>
  Array.from(
    { length: 1900 },
    (_, index) => PLAYER_COLORS[(index * 11 + Math.floor(index / 55) * 3) % PLAYER_COLORS.length].id,
  );

const buildInitialPixelRequests = () => {
  const requests = {};
  for (let index = 0; index < GLOBAL_MAP_TOTAL; index += 1) {
    if ((index * 17 + 11) % 13 !== 0) {
      continue;
    }
    requests[index] = {
      id: `request-${index}`,
      challenger: CHALLENGER_NAMES[(index * 5) % CHALLENGER_NAMES.length],
      mode: CHALLENGE_MODES[index % CHALLENGE_MODES.length],
      stake: 25 + (index % 6) * 15,
      queued: `${(index % 18) + 2}m ago`,
    };
  }
  return requests;
};

const HISTORICAL_PIXEL_MAP = buildHistoricalPixelMap();
const PIXEL_BACKDROP = buildPixelBackdrop();
const INITIAL_PIXEL_REQUESTS = buildInitialPixelRequests();
const INITIAL_SELECTED_PIXEL = Number(Object.keys(INITIAL_PIXEL_REQUESTS)[0] ?? 0);

const getColorById = (id) => PLAYER_COLOR_BY_ID[id] ?? PLAYER_COLORS[0];

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
    profileColorId: PLAYER_COLORS[0].id,
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
        profileColorId: isPlayerColorId(parsed?.profileColorId) ? parsed.profileColorId : PLAYER_COLORS[0].id,
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
      profileColorId: PLAYER_COLORS[0].id,
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
    profileColorId: session.profileColorId,
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
  const [pixelRequests, setPixelRequests] = useState(() => ({ ...INITIAL_PIXEL_REQUESTS }));
  const [pixelClaims, setPixelClaims] = useState({});
  const [selectedPixelIndex, setSelectedPixelIndex] = useState(INITIAL_SELECTED_PIXEL);

  const allowedBoards = useMemo(() => getAllowedBoardIndexes(game), [game]);
  const activeProfileColor = useMemo(
    () => getColorById(session.profileColorId),
    [session.profileColorId],
  );
  const activeRequestCount = Object.keys(pixelRequests).length;
  const renderedPixelCount = Object.keys(pixelClaims).length;
  const selectedRequest = pixelRequests[selectedPixelIndex] ?? null;
  const selectedClaimColorId = pixelClaims[selectedPixelIndex];
  const selectedClaimColor = selectedClaimColorId ? getColorById(selectedClaimColorId) : null;
  const selectedCoords = getGlobalMapCoords(selectedPixelIndex);

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

  const handleClaimPixel = () => {
    setPixelClaims((currentClaims) => ({
      ...currentClaims,
      [selectedPixelIndex]: session.profileColorId,
    }));
  };

  const handleAcceptRequest = () => {
    if (!selectedRequest) {
      return;
    }

    setPixelClaims((currentClaims) => ({
      ...currentClaims,
      [selectedPixelIndex]: session.profileColorId,
    }));
    setPixelRequests((currentRequests) => {
      const next = { ...currentRequests };
      delete next[selectedPixelIndex];
      return next;
    });
  };

  return (
    <main className="landing-shell">
      <div className="pixelmap-backdrop" aria-hidden="true">
        {PIXEL_BACKDROP.map((colorId, index) => (
          <span
            key={`bg-${index}`}
            className="pixelmap-backdrop-cell"
            style={{ "--bg-pixel": getColorById(colorId).hex }}
          />
        ))}
      </div>

      <section className="hero-card">
        <p className="eyebrow">Concept Prototype</p>
        <h1>Pixelmap Arena</h1>
        <p>
          Every match ever played becomes a pixel on one persistent global map. Players choose one of 12 identity
          colors, accept incoming challenges on specific coordinates, and stamp their win color into world history.
        </p>
        <div className="hero-metrics">
          <div>
            <span>Historic Pixels</span>
            <strong>3,248,900</strong>
          </div>
          <div>
            <span>Active Requests</span>
            <strong>{activeRequestCount}</strong>
          </div>
          <div>
            <span>Your Rendered Pixels</span>
            <strong>{renderedPixelCount}</strong>
          </div>
        </div>
      </section>

      <section className="concept-grid">
        <article className="global-map-card">
          <header>
            <h2>Global Pixelmap</h2>
            <p>
              Select any coordinate to inspect queued duels, accept a request, and render your identity color onto that
              pixel.
            </p>
          </header>
          <div className="global-map" style={{ "--map-columns": GLOBAL_MAP_COLS }}>
            {HISTORICAL_PIXEL_MAP.map((historicalColorId, index) => {
              const claimColorId = pixelClaims[index];
              const resolvedColor = claimColorId ? getColorById(claimColorId).hex : getColorById(historicalColorId).hex;
              const hasRequest = Boolean(pixelRequests[index]);
              const isSelected = index === selectedPixelIndex;

              return (
                <button
                  key={`pixel-${index}`}
                  type="button"
                  className={[
                    "global-pixel",
                    hasRequest ? "has-request" : "",
                    isSelected ? "is-selected" : "",
                    claimColorId ? "is-claimed" : "",
                  ]
                    .join(" ")
                    .trim()}
                  style={{ "--pixel-color": resolvedColor }}
                  onClick={() => setSelectedPixelIndex(index)}
                  aria-label={`Pixel row ${Math.floor(index / GLOBAL_MAP_COLS) + 1}, column ${(index % GLOBAL_MAP_COLS) + 1}`}
                />
              );
            })}
          </div>
        </article>

        <aside className="request-card">
          <h2>Player Identity (12 Colors)</h2>
          <div className="palette-grid">
            {PLAYER_COLORS.map((color) => (
              <button
                key={color.id}
                type="button"
                className={`palette-swatch ${session.profileColorId === color.id ? "is-active" : ""}`}
                style={{ "--swatch-color": color.hex }}
                onClick={() =>
                  setSession((current) => ({
                    ...current,
                    profileColorId: color.id,
                  }))
                }
                aria-label={`Use ${color.name}`}
              />
            ))}
          </div>
          <p className="active-color-line">
            You are rendering as <strong>{activeProfileColor.name}</strong>
          </p>

          <div className="pixel-request-summary">
            <h3>
              Pixel ({selectedCoords.row + 1}, {selectedCoords.col + 1})
            </h3>
            {selectedRequest ? (
              <>
                <p>
                  <strong>{selectedRequest.challenger}</strong> queued a <strong>{selectedRequest.mode}</strong> duel.
                </p>
                <p className="micro-copy">
                  Stake: {selectedRequest.stake} points • queued {selectedRequest.queued}
                </p>
                <button type="button" onClick={handleAcceptRequest}>
                  Accept Challenge & Render
                </button>
              </>
            ) : (
              <p>No open request for this coordinate right now.</p>
            )}

            {selectedClaimColor ? (
              <p className="micro-copy">
                Current rendered owner color: <strong>{selectedClaimColor.name}</strong>
              </p>
            ) : null}
            <button type="button" className="secondary" onClick={handleClaimPixel}>
              Render My Color Here
            </button>
          </div>
        </aside>
      </section>

      <section className="game-focus-card">
        <div className="game-hud">
          <h2>Live Duel Sandbox</h2>
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
