const DEFAULT_SIZE = 3;

export const normalizeSize = (rawValue) => {
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed < 2) {
    return DEFAULT_SIZE;
  }
  return parsed;
};

export const indexToCoords = (index, size) => ({
  row: Math.floor(index / size),
  col: index % size,
});

export const createInitialGameState = (requestedSize = DEFAULT_SIZE) => {
  const size = normalizeSize(requestedSize);
  const boardCellCount = size * size;

  return {
    size,
    currentPlayer: "X",
    nextBoardIndex: null,
    winner: null,
    isDraw: false,
    moveCount: 0,
    boards: Array.from({ length: boardCellCount }, () => ({
      cells: Array(boardCellCount).fill(null),
      winner: null,
      isDraw: false,
    })),
  };
};

const getLineWinner = (cells, size) => {
  for (const player of ["X", "O"]) {
    for (let row = 0; row < size; row += 1) {
      let rowWin = true;
      for (let col = 0; col < size; col += 1) {
        if (cells[row * size + col] !== player) {
          rowWin = false;
          break;
        }
      }
      if (rowWin) {
        return player;
      }
    }

    for (let col = 0; col < size; col += 1) {
      let colWin = true;
      for (let row = 0; row < size; row += 1) {
        if (cells[row * size + col] !== player) {
          colWin = false;
          break;
        }
      }
      if (colWin) {
        return player;
      }
    }

    let diagOneWin = true;
    for (let i = 0; i < size; i += 1) {
      if (cells[i * size + i] !== player) {
        diagOneWin = false;
        break;
      }
    }
    if (diagOneWin) {
      return player;
    }

    let diagTwoWin = true;
    for (let i = 0; i < size; i += 1) {
      if (cells[i * size + (size - 1 - i)] !== player) {
        diagTwoWin = false;
        break;
      }
    }
    if (diagTwoWin) {
      return player;
    }
  }

  return null;
};

export const isBoardResolved = (board) => Boolean(board.winner) || board.isDraw;

const getForcedBoardIndexIfPlayable = (state) => {
  if (state.nextBoardIndex === null) {
    return null;
  }

  const forcedBoard = state.boards[state.nextBoardIndex];
  if (!forcedBoard || isBoardResolved(forcedBoard)) {
    return null;
  }

  return state.nextBoardIndex;
};

export const canPlayInBoard = (state, boardIndex) => {
  if (state.winner || state.isDraw) {
    return false;
  }

  const board = state.boards[boardIndex];
  if (!board || isBoardResolved(board)) {
    return false;
  }

  const forcedBoardIndex = getForcedBoardIndexIfPlayable(state);
  if (forcedBoardIndex === null) {
    return true;
  }

  return forcedBoardIndex === boardIndex;
};

export const getAllowedBoardIndexes = (state) => {
  const allowed = [];
  for (let i = 0; i < state.boards.length; i += 1) {
    if (canPlayInBoard(state, i)) {
      allowed.push(i);
    }
  }
  return allowed;
};

const togglePlayer = (player) => (player === "X" ? "O" : "X");

export const makeMove = (state, boardIndex, cellIndex) => {
  if (!canPlayInBoard(state, boardIndex)) {
    return state;
  }

  const board = state.boards[boardIndex];
  if (board.cells[cellIndex] !== null) {
    return state;
  }

  const updatedBoards = state.boards.slice();
  const updatedCells = board.cells.slice();
  updatedCells[cellIndex] = state.currentPlayer;

  const localWinner = getLineWinner(updatedCells, state.size);
  const localDraw = !localWinner && updatedCells.every((cell) => cell !== null);

  updatedBoards[boardIndex] = {
    cells: updatedCells,
    winner: localWinner,
    isDraw: localDraw,
  };

  const metaCells = updatedBoards.map((smallBoard) => smallBoard.winner);
  const winner = getLineWinner(metaCells, state.size);
  const isDraw = !winner && updatedBoards.every((smallBoard) => isBoardResolved(smallBoard));

  let nextBoardIndex = null;
  if (!winner && !isDraw) {
    const nextBoard = updatedBoards[cellIndex];
    if (nextBoard && !isBoardResolved(nextBoard)) {
      nextBoardIndex = cellIndex;
    }
  }

  return {
    ...state,
    boards: updatedBoards,
    moveCount: state.moveCount + 1,
    winner,
    isDraw,
    nextBoardIndex,
    currentPlayer: winner || isDraw ? state.currentPlayer : togglePlayer(state.currentPlayer),
  };
};
