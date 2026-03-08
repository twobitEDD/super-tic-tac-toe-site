import { createInitialGameState, makeMove } from "./gameLogic";

const SAVE_SCHEMA_VERSION = 1;
const FIXED_SIZE = 3;

const isObject = (value) => value !== null && typeof value === "object";

const makeEventId = () => `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const createMatchSave = ({ matchId, matchTitle, pixel, claimer, challenger, account }) => ({
  schemaVersion: SAVE_SCHEMA_VERSION,
  saveId: `save-${matchId}-${Date.now()}`,
  matchId,
  matchTitle,
  pixel: isObject(pixel)
    ? { row: Number(pixel.row) || 1, col: Number(pixel.col) || 1 }
    : { row: 1, col: 1 },
  players: {
    claimer: typeof claimer === "string" ? claimer : "Unknown",
    challenger: typeof challenger === "string" ? challenger : null,
  },
  account: isObject(account) ? account : null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  events: [],
  result: null,
});

export const createMoveEvent = ({ boardIndex, cellIndex, player, accountHandle }) => ({
  id: makeEventId(),
  type: "move",
  boardIndex,
  cellIndex,
  player,
  accountHandle: typeof accountHandle === "string" ? accountHandle : "Unknown",
  occurredAt: Date.now(),
});

export const appendMoveToSave = (save, moveEvent, nextGameState) => {
  const nextResult =
    nextGameState?.winner || nextGameState?.isDraw
      ? {
          winner: nextGameState.winner ?? null,
          isDraw: Boolean(nextGameState.isDraw),
          finishedAt: moveEvent.occurredAt,
        }
      : save.result;

  return {
    ...save,
    updatedAt: moveEvent.occurredAt,
    events: [...save.events, moveEvent],
    result: nextResult,
  };
};

export const buildReplayFrames = (save) => {
  const frames = [];
  let gameState = createInitialGameState(FIXED_SIZE);
  frames.push(gameState);

  for (const event of save.events) {
    const nextGame = makeMove(gameState, event.boardIndex, event.cellIndex);
    if (nextGame === gameState) {
      continue;
    }

    gameState = {
      ...nextGame,
      lastMove: nextGame.lastMove
        ? {
            ...nextGame.lastMove,
            timestamp: Number.isFinite(event.occurredAt) ? event.occurredAt : Date.now(),
          }
        : null,
    };
    frames.push(gameState);
  }

  return frames;
};

export const serializeMatchSave = (save) => JSON.stringify(save, null, 2);

const isValidMoveEvent = (event) =>
  isObject(event) &&
  Number.isInteger(event.boardIndex) &&
  Number.isInteger(event.cellIndex) &&
  (event.player === "X" || event.player === "O");

export const isValidMatchSave = (save) =>
  isObject(save) &&
  save.schemaVersion === SAVE_SCHEMA_VERSION &&
  typeof save.matchId === "string" &&
  Array.isArray(save.events) &&
  save.events.every(isValidMoveEvent);

export const parseMatchSave = (rawText) => {
  const parsed = JSON.parse(rawText);
  if (!isValidMatchSave(parsed)) {
    throw new Error("Invalid match save format.");
  }
  return parsed;
};

export const matchSummaryFromSave = (save) => {
  const status = save.result ? "completed" : save.players.challenger ? "live" : "claim-open";
  return {
    id: save.matchId,
    title: save.matchTitle || `Recorded ${save.matchId}`,
    status,
    pixel: save.pixel || { row: 1, col: 1 },
    claimer: save.players?.claimer ?? "Unknown",
    challenger: save.players?.challenger ?? null,
    winner: save.result?.winner ?? null,
    updatedAtEpoch: Number.isFinite(save.updatedAt) ? save.updatedAt : Date.now(),
    hasLocalSave: true,
  };
};
