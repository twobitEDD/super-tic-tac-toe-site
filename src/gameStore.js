import { createInitialGameState, normalizeSize } from "./gameLogic";

const STORAGE_KEY = "super-tic-tac-toe-save-v1";
const STORAGE_VERSION = 1;
const DEFAULT_SIZE = 3;

const safeNow = () => Date.now();

const hasLocalStorage = () =>
  typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const createId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `game-${safeNow()}-${Math.floor(Math.random() * 1_000_000)}`;
};

const normalizeMarker = (value) => (value === "X" || value === "O" ? value : null);

const countMoves = (boards) =>
  boards.reduce(
    (total, board) => total + board.cells.reduce((count, value) => count + (value ? 1 : 0), 0),
    0,
  );

const hydrateGameState = (rawState) => {
  const size = normalizeSize(rawState?.size ?? DEFAULT_SIZE);
  const base = createInitialGameState(size);
  const boardCellCount = size * size;

  const boards = Array.from({ length: boardCellCount }, (_, boardIndex) => {
    const rawBoard = Array.isArray(rawState?.boards) ? rawState.boards[boardIndex] : null;
    const cells = Array.from({ length: boardCellCount }, (_, cellIndex) => {
      const rawCell = Array.isArray(rawBoard?.cells) ? rawBoard.cells[cellIndex] : null;
      return normalizeMarker(rawCell);
    });

    const winner = normalizeMarker(rawBoard?.winner);
    const isDraw = !winner && Boolean(rawBoard?.isDraw);

    return {
      ...base.boards[boardIndex],
      cells,
      winner,
      isDraw,
    };
  });

  const nextBoardIndex = Number.isInteger(rawState?.nextBoardIndex)
    ? rawState.nextBoardIndex
    : null;

  return {
    ...base,
    boards,
    moveCount:
      Number.isInteger(rawState?.moveCount) && rawState.moveCount >= 0
        ? rawState.moveCount
        : countMoves(boards),
    currentPlayer: rawState?.currentPlayer === "O" ? "O" : "X",
    nextBoardIndex:
      nextBoardIndex !== null && nextBoardIndex >= 0 && nextBoardIndex < boardCellCount
        ? nextBoardIndex
        : null,
    winner: normalizeMarker(rawState?.winner),
    isDraw: !normalizeMarker(rawState?.winner) && Boolean(rawState?.isDraw),
  };
};

const createGameEntry = (size, gameNumber) => {
  const now = safeNow();
  return {
    id: createId(),
    name: `Game ${gameNumber}`,
    createdAt: now,
    updatedAt: now,
    gameState: createInitialGameState(size),
  };
};

const createDefaultStore = () => {
  const firstGame = createGameEntry(DEFAULT_SIZE, 1);
  return {
    version: STORAGE_VERSION,
    activeGameId: firstGame.id,
    soundEnabled: true,
    sizeInput: String(DEFAULT_SIZE),
    games: [firstGame],
  };
};

const hydrateGames = (rawGames) => {
  if (!Array.isArray(rawGames)) {
    return [];
  }

  const seenIds = new Set();
  return rawGames.reduce((acc, rawGame, index) => {
    const idCandidate = typeof rawGame?.id === "string" ? rawGame.id.trim() : "";
    const id = idCandidate && !seenIds.has(idCandidate) ? idCandidate : createId();
    seenIds.add(id);

    const gameState = hydrateGameState(rawGame?.gameState);
    const now = safeNow();
    const createdAt =
      Number.isFinite(rawGame?.createdAt) && rawGame.createdAt > 0 ? rawGame.createdAt : now;
    const updatedAt =
      Number.isFinite(rawGame?.updatedAt) && rawGame.updatedAt > 0 ? rawGame.updatedAt : createdAt;

    acc.push({
      id,
      name:
        typeof rawGame?.name === "string" && rawGame.name.trim()
          ? rawGame.name.trim()
          : `Game ${index + 1}`,
      createdAt,
      updatedAt,
      gameState,
    });

    return acc;
  }, []);
};

export const loadGameStore = () => {
  if (!hasLocalStorage()) {
    return createDefaultStore();
  }

  try {
    const rawText = window.localStorage.getItem(STORAGE_KEY);
    if (!rawText) {
      return createDefaultStore();
    }

    const parsed = JSON.parse(rawText);
    const hydratedGames = hydrateGames(parsed?.games);
    const games = hydratedGames.length > 0 ? hydratedGames : createDefaultStore().games;
    const activeGameId =
      typeof parsed?.activeGameId === "string" && games.some((game) => game.id === parsed.activeGameId)
        ? parsed.activeGameId
        : games[0].id;
    const activeGame = games.find((game) => game.id === activeGameId) ?? games[0];

    return {
      version: STORAGE_VERSION,
      activeGameId,
      soundEnabled: parsed?.soundEnabled !== false,
      sizeInput: String(normalizeSize(parsed?.sizeInput ?? activeGame.gameState.size)),
      games,
    };
  } catch {
    return createDefaultStore();
  }
};

export const saveGameStore = (store) => {
  if (!hasLocalStorage()) {
    return;
  }

  const payload = {
    version: STORAGE_VERSION,
    activeGameId: store.activeGameId,
    soundEnabled: store.soundEnabled,
    sizeInput: store.sizeInput,
    games: store.games,
  };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
};

export const createNextGameEntry = (size, existingGames) =>
  createGameEntry(size, Array.isArray(existingGames) ? existingGames.length + 1 : 1);

export const describeGameStatus = (gameState) => {
  if (gameState.winner) {
    return { kind: "won", label: `Winner: ${gameState.winner}` };
  }
  if (gameState.isDraw) {
    return { kind: "draw", label: "Draw" };
  }
  return { kind: "active", label: `Turn: ${gameState.currentPlayer}` };
};
