import { describe, expect, test } from "vitest";
import { createInitialGameState, makeMove } from "./gameLogic";
import {
  appendMoveToSave,
  buildReplayFrames,
  createMatchSave,
  matchSummaryFromSave,
  parseMatchSave,
  serializeMatchSave,
} from "./matchSave";

describe("matchSave event replay", () => {
  test("rebuilds game state from ordered move events", () => {
    const matchSave = createMatchSave({
      matchId: "match-1",
      matchTitle: "Test Match",
      pixel: { row: 2, col: 3 },
      claimer: "Alice",
      challenger: "Bob",
      account: { provider: "dynamic.xyz", accountId: "local-alice", handle: "Alice" },
    });

    const legalMoves = [
      { boardIndex: 0, cellIndex: 1 },
      { boardIndex: 1, cellIndex: 4 },
      { boardIndex: 4, cellIndex: 0 },
    ];

    let expectedState = createInitialGameState(3);
    let saveUnderTest = matchSave;

    legalMoves.forEach((move, index) => {
      const nextState = makeMove(expectedState, move.boardIndex, move.cellIndex);
      expect(nextState).not.toBe(expectedState);

      const event = {
        id: `evt-${index}`,
        type: "move",
        boardIndex: move.boardIndex,
        cellIndex: move.cellIndex,
        player: expectedState.currentPlayer,
        accountHandle: "Alice",
        occurredAt: 10_000 + index,
      };

      saveUnderTest = appendMoveToSave(saveUnderTest, event, nextState);
      expectedState = nextState;
    });

    const frames = buildReplayFrames(saveUnderTest);
    expect(frames).toHaveLength(legalMoves.length + 1);

    const replayFinalState = frames[frames.length - 1];
    expect(replayFinalState.boards).toEqual(expectedState.boards);
    expect(replayFinalState.moveCount).toBe(expectedState.moveCount);
    expect(replayFinalState.currentPlayer).toBe(expectedState.currentPlayer);
  });
});

describe("matchSave format", () => {
  test("round-trips through serialize and parse", () => {
    const save = createMatchSave({
      matchId: "match-roundtrip",
      matchTitle: "Roundtrip",
      pixel: { row: 1, col: 1 },
      claimer: "Alice",
      challenger: null,
      account: { provider: "dynamic.xyz", accountId: "local-alice", handle: "Alice" },
    });

    const serialized = serializeMatchSave(save);
    const parsed = parseMatchSave(serialized);
    expect(parsed.matchId).toBe("match-roundtrip");
    expect(parsed.events).toHaveLength(0);
  });

  test("rejects invalid save payloads", () => {
    const invalidPayload = JSON.stringify({
      schemaVersion: 1,
      matchId: "broken",
      events: [{ boardIndex: "bad", cellIndex: 0, player: "X" }],
    });

    expect(() => parseMatchSave(invalidPayload)).toThrow("Invalid match save format.");
  });

  test("derives summary status from save lifecycle", () => {
    const base = createMatchSave({
      matchId: "summary-case",
      matchTitle: "Summary",
      pixel: { row: 4, col: 5 },
      claimer: "Alice",
      challenger: null,
      account: null,
    });
    expect(matchSummaryFromSave(base).status).toBe("claim-open");

    const live = {
      ...base,
      players: {
        ...base.players,
        challenger: "Bob",
      },
    };
    expect(matchSummaryFromSave(live).status).toBe("live");

    const completed = {
      ...live,
      result: { winner: "Bob", isDraw: false, finishedAt: 1234 },
    };
    expect(matchSummaryFromSave(completed).status).toBe("completed");
  });
});
