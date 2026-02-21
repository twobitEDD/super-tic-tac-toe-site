import { useMemo, useState } from "react";
import Board3D from "./Board3D";
import {
  createInitialGameState,
  getAllowedBoardIndexes,
  indexToCoords,
  makeMove,
  normalizeSize,
} from "./gameLogic";

const DEFAULT_SIZE = 3;

const boardLabel = (boardIndex, size) => {
  const { row, col } = indexToCoords(boardIndex, size);
  return `(${row + 1}, ${col + 1})`;
};

const App = () => {
  const [game, setGame] = useState(() => createInitialGameState(DEFAULT_SIZE));
  const [sizeInput, setSizeInput] = useState(String(DEFAULT_SIZE));

  const allowedBoards = useMemo(() => getAllowedBoardIndexes(game), [game]);

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
    setGame((currentGame) => makeMove(currentGame, boardIndex, cellIndex));
  };

  const handleApplySize = () => {
    const nextSize = normalizeSize(sizeInput);
    setSizeInput(String(nextSize));
    setGame(createInitialGameState(nextSize));
  };

  const handleRestart = () => {
    setGame(createInitialGameState(game.size));
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
          value={sizeInput}
          onChange={(event) => setSizeInput(event.target.value)}
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
        </ol>
      </section>
    </main>
  );
};

export default App;
