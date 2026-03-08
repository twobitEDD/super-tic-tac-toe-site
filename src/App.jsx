import { useEffect, useMemo, useRef, useState } from "react";
import Board3D from "./Board3D";
import {
  createInitialGameState,
  getAllowedBoardIndexes,
  indexToCoords,
  makeMove,
} from "./gameLogic";
import {
  playDrawSfx,
  playInterTurnSfx,
  playInvalidSfx,
  playLocalWinSfx,
  playOMoveSfx,
  playSuperWinSfx,
  playXMoveSfx,
} from "./soundEffects";
import { createDynamicAccountIdentity } from "./accountIdentity";
import {
  appendMoveToSave,
  buildReplayFrames,
  createMatchSave,
  createMoveEvent,
  matchSummaryFromSave,
  parseMatchSave,
  serializeMatchSave,
} from "./matchSave";
import { loadLocalMatchSaves, upsertLocalMatchSave } from "./matchSaveStore";

const FIXED_SIZE = 3;
const STORAGE_KEY = "super-ttt-focused-v1";
const LEGACY_STORE_KEY = "super-tic-tac-toe-save-v1";
const BACKDROP_OUTLINE_CELL_COUNT = 2400;
const BACKDROP_OUTLINE_COLUMNS = 60;
const MATCH_STATUS_LABEL = {
  "claim-open": "Claim Open",
  live: "Live",
  completed: "Completed",
};

const isMarker = (value) => value === "X" || value === "O";
const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
const isMatchId = (value) => typeof value === "string" && value.trim().length > 0;

const countMoves = (boards) =>
  boards.reduce(
    (total, board) =>
      total + board.cells.reduce((boardTotal, marker) => boardTotal + (marker ? 1 : 0), 0),
    0,
  );

const OUTLINE_CELLS = Array.from({ length: BACKDROP_OUTLINE_CELL_COUNT }, (_, index) => index);

const formatRelativeTime = (timestampMs) => {
  if (!Number.isFinite(timestampMs)) {
    return "just now";
  }
  const diffMs = Date.now() - timestampMs;
  const diffMinutes = Math.max(Math.floor(diffMs / 60000), 0);
  if (diffMinutes < 1) {
    return "just now";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  return `${Math.floor(diffHours / 24)}d ago`;
};

const buildKnownMatchesFromLocalSaves = (saveMap) =>
  Object.values(saveMap)
    .map(matchSummaryFromSave)
    .map((summary) => ({
      ...summary,
      updatedAt: formatRelativeTime(summary.updatedAtEpoch),
    }))
    .sort((a, b) => b.updatedAtEpoch - a.updatedAtEpoch);

const getMatchNarrative = (matchEntry) => {
  const coord = `Pixel (${matchEntry.pixel.row}, ${matchEntry.pixel.col})`;
  if (matchEntry.status === "claim-open") {
    return `${coord} claimed by ${matchEntry.claimer}; waiting for a challenge.`;
  }
  if (matchEntry.status === "live") {
    return `${coord} claimed by ${matchEntry.claimer}, challenged by ${matchEntry.challenger}.`;
  }
  return `${coord} claimed by ${matchEntry.claimer}, challenged by ${matchEntry.challenger}, winner ${matchEntry.winner}.`;
};

const getPrimaryActionLabel = (matchEntry) => {
  if (matchEntry.status === "claim-open") {
    return "Start Live Game";
  }
  if (matchEntry.status === "live") {
    return "Continue Live Game";
  }
  return "Replay Completed";
};

const getLatestFrameForSave = (save) => {
  const frames = buildReplayFrames(save);
  return frames[frames.length - 1] ?? createInitialGameState(FIXED_SIZE);
};

const createLocalMatchId = () => `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const createLocalPixel = (indexSeed) => ({
  row: ((indexSeed * 7) % 40) + 1,
  col: ((indexSeed * 11) % 40) + 1,
});

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
    Number.isInteger(rawGame.moveCount) && rawGame.moveCount >= 0
      ? rawGame.moveCount
      : countMoves(boards);
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
    selectedMatchId: null,
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
        selectedMatchId: isMatchId(parsed?.selectedMatchId) ? parsed.selectedMatchId : null,
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
      selectedMatchId: null,
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
  const [localMatchSaves, setLocalMatchSaves] = useState(() => loadLocalMatchSaves());
  const [view, setView] = useState("landing");
  const [arenaMode, setArenaMode] = useState("watch");
  const [playbackFrames, setPlaybackFrames] = useState([]);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [playbackRunning, setPlaybackRunning] = useState(false);
  const importInputRef = useRef(null);
  const game = session.game;

  const knownMatches = useMemo(() => buildKnownMatchesFromLocalSaves(localMatchSaves), [localMatchSaves]);
  const allowedBoards = useMemo(() => getAllowedBoardIndexes(game), [game]);
  const selectedMatch = useMemo(
    () =>
      knownMatches.find((matchEntry) => matchEntry.id === session.selectedMatchId) ??
      knownMatches[0] ??
      null,
    [knownMatches, session.selectedMatchId],
  );
  const selectedMatchSave = selectedMatch ? localMatchSaves[selectedMatch.id] ?? null : null;
  const selectedMatchNarrative = selectedMatch ? getMatchNarrative(selectedMatch) : "No local game selected.";
  const interactionLocked = arenaMode !== "join" || !selectedMatch;

  useEffect(() => {
    saveSession(session);
  }, [session]);

  useEffect(() => {
    if (knownMatches.length === 0) {
      if (session.selectedMatchId !== null) {
        setSession((current) => ({ ...current, selectedMatchId: null }));
      }
      return;
    }
    if (!session.selectedMatchId || !knownMatches.some((entry) => entry.id === session.selectedMatchId)) {
      setSession((current) => ({ ...current, selectedMatchId: knownMatches[0].id }));
    }
  }, [knownMatches, session.selectedMatchId]);

  useEffect(() => {
    if (!selectedMatch) {
      setArenaMode("watch");
      return;
    }
    if (selectedMatch.status === "completed" && arenaMode === "join") {
      setArenaMode("rewatch");
    }
    if (!selectedMatchSave?.events?.length && arenaMode === "rewatch") {
      setArenaMode("watch");
    }
  }, [arenaMode, selectedMatch, selectedMatchSave]);

  useEffect(() => {
    if (!playbackRunning || playbackFrames.length === 0) {
      return;
    }
    const timer = window.setInterval(() => {
      setPlaybackIndex((currentIndex) => {
        if (currentIndex >= playbackFrames.length - 1) {
          setPlaybackRunning(false);
          return currentIndex;
        }
        return currentIndex + 1;
      });
    }, 700);
    return () => window.clearInterval(timer);
  }, [playbackFrames.length, playbackRunning]);

  useEffect(() => {
    if (playbackFrames.length === 0) {
      return;
    }
    const frame = playbackFrames[playbackIndex];
    if (!frame) {
      return;
    }
    setSession((current) => ({
      ...current,
      game: frame,
    }));
  }, [playbackFrames, playbackIndex]);

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
    if (!selectedMatch) {
      return "Create a local game to begin.";
    }
    if (arenaMode === "join") {
      return `Live game on pixel (${selectedMatch.pixel.row}, ${selectedMatch.pixel.col}). ${statusText}`;
    }
    if (arenaMode === "rewatch") {
      return `Replay mode for pixel (${selectedMatch.pixel.row}, ${selectedMatch.pixel.col}).`;
    }
    return `Watching latest saved state for ${selectedMatch.id}.`;
  }, [arenaMode, selectedMatch, statusText]);

  const upsertAndTrackSave = (save) => {
    const nextMap = upsertLocalMatchSave(save);
    setLocalMatchSaves(nextMap);
  };

  const stopPlayback = () => {
    setPlaybackRunning(false);
    setPlaybackFrames([]);
    setPlaybackIndex(0);
  };

  const handleCreateLocalGame = () => {
    stopPlayback();
    const matchNumber = knownMatches.length + 1;
    const matchId = createLocalMatchId();
    const save = createMatchSave({
      matchId,
      matchTitle: `Local Match #${matchNumber}`,
      pixel: createLocalPixel(matchNumber),
      claimer: session.accountHandle,
      challenger: null,
      account: createDynamicAccountIdentity({ handle: session.accountHandle }),
    });
    upsertAndTrackSave(save);
    setArenaMode("watch");
    setSession((current) => ({
      ...current,
      selectedMatchId: matchId,
      game: createInitialGameState(FIXED_SIZE),
    }));
  };

  const handleLoadSelectedLatest = () => {
    if (!selectedMatchSave) {
      playInvalidSfx(session.soundEnabled);
      return;
    }
    stopPlayback();
    setArenaMode(selectedMatch.status === "completed" ? "rewatch" : "watch");
    setSession((current) => ({
      ...current,
      game: getLatestFrameForSave(selectedMatchSave),
    }));
  };

  const handleStartOrContinue = () => {
    if (!selectedMatch) {
      playInvalidSfx(session.soundEnabled);
      return;
    }
    if (selectedMatch.status === "completed") {
      handleReplaySelectedSave();
      return;
    }

    stopPlayback();
    const account = createDynamicAccountIdentity({ handle: session.accountHandle });
    const baselineSave =
      selectedMatchSave ??
      createMatchSave({
        matchId: selectedMatch.id,
        matchTitle: selectedMatch.title,
        pixel: selectedMatch.pixel,
        claimer: selectedMatch.claimer,
        challenger: session.accountHandle,
        account,
      });
    const nextSave = {
      ...baselineSave,
      players: {
        ...baselineSave.players,
        challenger: baselineSave.players.challenger ?? session.accountHandle,
      },
      account,
      updatedAt: Date.now(),
    };
    upsertAndTrackSave(nextSave);

    setArenaMode("join");
    setSession((current) => ({
      ...current,
      game: getLatestFrameForSave(nextSave),
    }));
  };

  const handleCellClick = (boardIndex, cellIndex) => {
    if (!selectedMatch) {
      playInvalidSfx(session.soundEnabled);
      return;
    }

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

    const activeSave =
      localMatchSaves[selectedMatch.id] ??
      createMatchSave({
        matchId: selectedMatch.id,
        matchTitle: selectedMatch.title,
        pixel: selectedMatch.pixel,
        claimer: selectedMatch.claimer,
        challenger: session.accountHandle,
        account: createDynamicAccountIdentity({ handle: session.accountHandle }),
      });
    const moveEvent = createMoveEvent({
      boardIndex,
      cellIndex,
      player: game.currentPlayer,
      accountHandle: session.accountHandle,
    });
    const updatedSave = appendMoveToSave(activeSave, moveEvent, nextGame);
    upsertAndTrackSave(updatedSave);

    setSession((current) => ({
      ...current,
      game: nextGame,
    }));

    if (updatedSave.result) {
      setArenaMode("watch");
    }
  };

  const handleStageCellClick = (boardIndex, cellIndex) => {
    if (interactionLocked) {
      playInvalidSfx(session.soundEnabled);
      return;
    }
    handleCellClick(boardIndex, cellIndex);
  };

  const handleRestartCurrentGame = () => {
    if (!selectedMatch || arenaMode !== "join") {
      playInvalidSfx(session.soundEnabled);
      return;
    }
    stopPlayback();
    const resetSave = createMatchSave({
      matchId: selectedMatch.id,
      matchTitle: selectedMatch.title,
      pixel: selectedMatch.pixel,
      claimer: selectedMatch.claimer,
      challenger: session.accountHandle,
      account: createDynamicAccountIdentity({ handle: session.accountHandle }),
    });
    upsertAndTrackSave(resetSave);
    setSession((current) => ({
      ...current,
      game: createInitialGameState(FIXED_SIZE),
    }));
  };

  const handleSelectKnownMatch = (matchId) => {
    const nextMatch = knownMatches.find((matchEntry) => matchEntry.id === matchId);
    if (!nextMatch) {
      return;
    }
    stopPlayback();
    const nextSave = localMatchSaves[nextMatch.id] ?? null;
    setArenaMode(nextMatch.status === "completed" ? "rewatch" : "watch");
    setSession((current) => ({
      ...current,
      selectedMatchId: nextMatch.id,
      game: nextSave ? getLatestFrameForSave(nextSave) : createInitialGameState(FIXED_SIZE),
    }));
  };

  const handleReplaySelectedSave = () => {
    if (!selectedMatchSave || selectedMatchSave.events.length === 0) {
      playInvalidSfx(session.soundEnabled);
      return;
    }
    const frames = buildReplayFrames(selectedMatchSave);
    if (frames.length <= 1) {
      playInvalidSfx(session.soundEnabled);
      return;
    }
    setArenaMode("rewatch");
    setPlaybackFrames(frames);
    setPlaybackIndex(0);
    setPlaybackRunning(true);
  };

  const handleExportSelectedSave = () => {
    if (!selectedMatchSave || !selectedMatch) {
      playInvalidSfx(session.soundEnabled);
      return;
    }
    const fileContents = serializeMatchSave(selectedMatchSave);
    const blob = new Blob([fileContents], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${selectedMatch.id}.json`;
    anchor.click();
    window.URL.revokeObjectURL(url);
  };

  const handleImportSaveFile = async (event) => {
    const [file] = event.target.files ?? [];
    if (!file) {
      return;
    }
    try {
      const fileContents = await file.text();
      const parsedSave = parseMatchSave(fileContents);
      const nextMap = upsertLocalMatchSave(parsedSave);
      setLocalMatchSaves(nextMap);
      stopPlayback();
      setArenaMode(parsedSave.result ? "rewatch" : "watch");
      setSession((current) => ({
        ...current,
        selectedMatchId: parsedSave.matchId,
        game: getLatestFrameForSave(parsedSave),
      }));
    } catch {
      playInvalidSfx(session.soundEnabled);
    } finally {
      event.target.value = "";
    }
  };

  const handleReloadLocalSaves = () => {
    const reloaded = loadLocalMatchSaves();
    setLocalMatchSaves(reloaded);
    playInterTurnSfx(session.soundEnabled);
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
            Create and play local SuperTicTacToe games, then test save/load/reload flows with live
            watch and completed replay.
          </p>
          <div className="landing-flow">
            <div>
              <h2>1. Create Local Game</h2>
              <p>No seeded/fake matches; your list starts empty.</p>
            </div>
            <div>
              <h2>2. Play + Save Events</h2>
              <p>Every move is appended into a local match save log.</p>
            </div>
            <div>
              <h2>3. Load / Watch / Replay</h2>
              <p>Load latest game state or replay from move zero.</p>
            </div>
          </div>
          <div className="launch-row">
            <button type="button" onClick={() => setView("arcade")}>
              Enter Arcade Hub
            </button>
            <p>
              Pilot: <strong>{session.accountHandle}</strong> • Local saves:{" "}
              {Object.keys(localMatchSaves).length}
            </p>
          </div>
        </section>
      ) : (
        <section className="arcade-layout">
          <aside className="hub-panel">
            <article className="card account-card">
              <h2>User Account</h2>
              <p>Dynamic.xyz account model (local stub until SDK wiring).</p>
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
              <p className="account-meta">Provider: dynamic.xyz • Credits: 12,800</p>
            </article>

            <article className="card games-card">
              <h2>Local SuperTicTacToe Games</h2>
              <div className="save-action-row">
                <button type="button" className="secondary" onClick={handleCreateLocalGame}>
                  Create New Local Game
                </button>
                <button type="button" className="secondary alt" onClick={handleReloadLocalSaves}>
                  Reload Local Saves
                </button>
              </div>

              {knownMatches.length === 0 ? (
                <p className="match-meta-line">No local games yet. Create one to begin testing.</p>
              ) : (
                <ul className="known-games-list">
                  {knownMatches.map((matchEntry) => (
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
              )}

              <div className="save-action-row">
                <button type="button" className="secondary" onClick={handleExportSelectedSave}>
                  Export Selected Save JSON
                </button>
                <button
                  type="button"
                  className="secondary alt"
                  onClick={() => importInputRef.current?.click()}
                >
                  Import Save JSON
                </button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept="application/json"
                  onChange={handleImportSaveFile}
                  className="file-input-hidden"
                />
              </div>
              <button type="button" className="secondary" onClick={() => setView("landing")}>
                Back To Landing
              </button>
            </article>
          </aside>

          <section className="game-stage card">
            <header className="stage-header">
              <h2>{selectedMatch ? selectedMatch.title : "No Local Game Selected"}</h2>
              <p>{selectedMatchNarrative}</p>
              {selectedMatch ? (
                <div className="stage-action-row">
                  <button
                    type="button"
                    className="primary-match-action"
                    onClick={handleStartOrContinue}
                  >
                    {getPrimaryActionLabel(selectedMatch)}
                  </button>
                  <button
                    type="button"
                    className="primary-match-action alt"
                    onClick={handleLoadSelectedLatest}
                  >
                    Watch Live Snapshot
                  </button>
                  <button
                    type="button"
                    className="primary-match-action alt"
                    onClick={handleReplaySelectedSave}
                  >
                    Replay From Save
                  </button>
                  <span className="status-pill">{MATCH_STATUS_LABEL[selectedMatch.status]}</span>
                </div>
              ) : null}
            </header>

            <div className="game-hud">
              <p className="status-line">{stageStatusText}</p>
              <p className="meta-line">Classic mode: 9 local boards • Moves: {game.moveCount}</p>
              {interactionLocked ? (
                <p className="stage-note">Board input is locked while watching/replaying.</p>
              ) : (
                <p className="stage-note">
                  Live mode active: moves are being saved to local match history.
                </p>
              )}
              {playbackRunning ? (
                <p className="stage-note">Replay running… frame {playbackIndex + 1}</p>
              ) : null}
            </div>

            <Board3D game={game} onCellClick={handleStageCellClick} />

            <div className="control-strip">
              <button type="button" onClick={handleRestartCurrentGame} disabled={interactionLocked}>
                Reset Current Live Game
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
