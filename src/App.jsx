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

const getStandaloneState = () => {
  if (typeof window === "undefined") {
    return false;
  }
  const mediaStandalone = window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone = typeof navigator !== "undefined" && Boolean(navigator.standalone);
  return mediaStandalone || iosStandalone;
};

const getInitialTab = () => {
  if (typeof window === "undefined") {
    return "home";
  }

  const search = new URLSearchParams(window.location.search);
  const requestedTab = search.get("screen");
  if (requestedTab === "home" || requestedTab === "play" || requestedTab === "timeline") {
    return requestedTab;
  }

  return getStandaloneState() ? "home" : "play";
};

const App = () => {
  const [store, setStore] = useState(() => loadGameStore());
  const [installPromptEvent, setInstallPromptEvent] = useState(null);
  const [isStandalone, setIsStandalone] = useState(() => getStandaloneState());
  const [activeTab, setActiveTab] = useState(() => getInitialTab());

  const activeGameEntry = useMemo(
    () => store.games.find((entry) => entry.id === store.activeGameId) ?? store.games[0],
    [store.activeGameId, store.games],
  );

  const game = activeGameEntry?.gameState ?? createInitialGameState(DEFAULT_SIZE);
  const timelineGames = useMemo(() => sortTimelineGames(store.games), [store.games]);
  const recentGames = timelineGames.slice(0, 3);
  const soundEnabled = store.soundEnabled;
  const activeGameStatus = describeGameStatus(game);

  const allowedBoards = useMemo(() => getAllowedBoardIndexes(game), [game]);

  useEffect(() => {
    saveGameStore(store);
  }, [store]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const displayQuery = window.matchMedia("(display-mode: standalone)");
    const syncStandaloneState = () => setIsStandalone(getStandaloneState());
    syncStandaloneState();

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPromptEvent(event);
    };

    const handleAppInstalled = () => {
      setInstallPromptEvent(null);
      syncStandaloneState();
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    if (typeof displayQuery.addEventListener === "function") {
      displayQuery.addEventListener("change", syncStandaloneState);
    } else {
      displayQuery.addListener(syncStandaloneState);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      if (typeof displayQuery.removeEventListener === "function") {
        displayQuery.removeEventListener("change", syncStandaloneState);
      } else {
        displayQuery.removeListener(syncStandaloneState);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    document.body.classList.toggle("standalone-mode", isStandalone);
  }, [isStandalone]);

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
    setActiveTab("play");
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

  const handleInstallApp = async () => {
    if (!installPromptEvent) {
      return;
    }
    installPromptEvent.prompt();
    await installPromptEvent.userChoice.catch(() => null);
    setInstallPromptEvent(null);
  };

  const canInstallApp = Boolean(installPromptEvent) && !isStandalone;

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="app-brand">
          <p className="app-kicker">Family Game App</p>
          <h1>Super Tic-Tac-Toe</h1>
          <p className="subtitle">{activeGameEntry?.name ?? "Current game"}</p>
        </div>
        <div className="app-header-actions">
          <button
            type="button"
            className="chip-button"
            onClick={() =>
              setStore((currentStore) => ({ ...currentStore, soundEnabled: !currentStore.soundEnabled }))
            }
          >
            Sound: {soundEnabled ? "On" : "Off"}
          </button>
          {canInstallApp ? (
            <button type="button" className="chip-button chip-install" onClick={handleInstallApp}>
              Install App
            </button>
          ) : null}
          <span className={`app-mode-pill ${isStandalone ? "is-standalone" : ""}`}>
            {isStandalone ? "App mode" : "Browser mode"}
          </span>
        </div>
      </header>

      {canInstallApp ? (
        <p className="install-tip">
          Tip: install this to your device for fullscreen, native-app feeling play.
        </p>
      ) : null}

      {activeTab === "home" ? (
        <section className="home-panel">
          <h2>Home</h2>
          <p className="home-subtitle">
            Resume your latest match, launch a new one, or jump into timeline history.
          </p>
          <div className="home-hero">
            <div>
              <p className="home-kicker">Currently Open</p>
              <h3>{activeGameEntry?.name ?? "Game Session"}</h3>
              <p>
                {activeGameStatus.label} • {game.size} x {game.size} • {game.moveCount} moves
              </p>
            </div>
            <div className="home-hero-actions">
              <button type="button" className="chip-button chip-install" onClick={() => setActiveTab("play")}>
                Continue Playing
              </button>
              <button type="button" className="chip-button" onClick={handleApplySize}>
                New Game from N
              </button>
              <button type="button" className="chip-button" onClick={() => setActiveTab("timeline")}>
                Open Timeline
              </button>
            </div>
          </div>

          <div className="home-grid">
            <section className="timeline mini">
              <h2>Recent Games</h2>
              <ul className="timeline-list">
                {recentGames.map((gameEntry) => {
                  const gameStatus = describeGameStatus(gameEntry.gameState);
                  const isActive = gameEntry.id === activeGameEntry?.id;

                  return (
                    <li key={gameEntry.id}>
                      <button
                        type="button"
                        className={`timeline-item ${isActive ? "is-active" : ""}`}
                        onClick={() => {
                          handleOpenGame(gameEntry.id);
                          setActiveTab("play");
                        }}
                      >
                        <span className="timeline-title-row">
                          <span className="timeline-name">{gameEntry.name}</span>
                          <span className={`timeline-pill timeline-pill-${gameStatus.kind}`}>
                            {gameStatus.label}
                          </span>
                        </span>
                        <span className="timeline-detail-row">
                          Updated {formatTimestamp(gameEntry.updatedAt)} • {gameEntry.gameState.moveCount} moves
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="rules">
              <h2>Quick Rules</h2>
              <ol>
                <li>Win local boards, then connect wins on the super board.</li>
                <li>Your chosen cell sends the next player to a matching board.</li>
                <li>If that board is resolved, they can play anywhere open.</li>
              </ol>
            </section>
          </div>
        </section>
      ) : null}

      {activeTab === "play" ? (
        <section className="play-panel">
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
          </div>

          <p className="status">{statusText}</p>
          <p className="meta">
            Size: {game.size} x {game.size} boards, {game.size} x {game.size} cells each. Moves played:{" "}
            {game.moveCount}
          </p>
          <p className="zoom-hint">Zoom: mouse wheel or trackpad pinch. Pan: click and drag.</p>

          <Board3D game={game} onCellClick={handleCellClick} />
        </section>
      ) : null}

      {activeTab === "timeline" ? (
        <div className="timeline-screen">
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
                      onClick={() => {
                        handleOpenGame(gameEntry.id);
                        setActiveTab("play");
                      }}
                    >
                      <span className="timeline-title-row">
                        <span className="timeline-name">{gameEntry.name}</span>
                        <span className={`timeline-pill timeline-pill-${gameStatus.kind}`}>
                          {gameStatus.label}
                        </span>
                      </span>
                      <span className="timeline-detail-row">
                        {gameEntry.gameState.size} x {gameEntry.gameState.size} •{" "}
                        {gameEntry.gameState.moveCount} moves • Updated{" "}
                        {formatTimestamp(gameEntry.updatedAt)}
                      </span>
                      <span className="timeline-open-label">Open this game in Play tab</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="rules">
            <h2>Rules in this version</h2>
            <ol>
              <li>Win a local board by making a full row, column, or diagonal.</li>
              <li>
                Your move sends the next player to the local board that matches the cell position
                you picked.
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
        </div>
      ) : null}

      <nav className="app-tabbar">
        <button
          type="button"
          className={`tab-button ${activeTab === "home" ? "is-active" : ""}`}
          onClick={() => setActiveTab("home")}
        >
          Home
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === "play" ? "is-active" : ""}`}
          onClick={() => setActiveTab("play")}
        >
          Play
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === "timeline" ? "is-active" : ""}`}
          onClick={() => setActiveTab("timeline")}
        >
          Timeline
        </button>
      </nav>
    </main>
  );
};

export default App;
