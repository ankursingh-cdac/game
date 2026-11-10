import { Sudoku6x6Engine } from '../src/modules/puzzles/engine/sudoku6x6';

describe('Queens-Style Cat Logic Puzzle Engine', () => {
  const levels = [
    { name: 'level1', size: 4 },
    { name: 'level2', size: 5 },
    { name: 'level3', size: 6 },
    { name: 'level4', size: 7 },
    { name: 'level5', size: 8 },
  ];

  levels.forEach(({ name, size }) => {
    test(`generates valid puzzle for ${name} (${size}x${size}) satisfying all 4 Queens rules with clean empty board`, () => {
      const puzzle = Sudoku6x6Engine.generatePuzzle(name);

      expect(puzzle.size).toBe(size);
      expect(puzzle.regions.length).toBe(size);
      expect(puzzle.solution.length).toBe(size);

      // Verify the initial board is 100% EMPTY (no pre-filled cats, no crosses)
      expect(puzzle.cluesCount).toBe(0);
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          expect(puzzle.initialGrid[r][c]).toBe(0);
        }
      }

      // Verify the 4 Queens rules on the solution:
      const validation = Sudoku6x6Engine.validateQueensSolution(puzzle.solution, puzzle.regions);
      expect(validation.isValid).toBe(true);
      expect(validation.errors.length).toBe(0);

      // Verify exactly N cats in solution
      let catCount = 0;
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (puzzle.solution[r][c] === 1) catCount++;
        }
      }
      expect(catCount).toBe(size);
    });
  });

  test('detects diagonal touching cat conflict (Rule 4 violation)', () => {
    const puzzle = Sudoku6x6Engine.generatePuzzle('level3');
    const badBoard = puzzle.solution.map(r => [...r]);

    // Move cat from row 1 to be diagonal to cat in row 0
    const cat0Col = badBoard[0].indexOf(1);
    const diagonalCol = cat0Col > 0 ? cat0Col - 1 : cat0Col + 1;

    badBoard[1].fill(0);
    badBoard[1][diagonalCol] = 1;

    const validation = Sudoku6x6Engine.validateQueensSolution(badBoard, puzzle.regions);
    expect(validation.isValid).toBe(false);
    expect(validation.errors.some(e => e.includes('touching'))).toBe(true);
  });

  test('detects row or column duplicate conflict (Rule 1 & 2 violation)', () => {
    const puzzle = Sudoku6x6Engine.generatePuzzle('level3');
    const badBoard = puzzle.solution.map(r => [...r]);

    // Place 2 cats in row 0
    badBoard[0][0] = 1;
    badBoard[0][puzzle.size - 1] = 1;

    const validation = Sudoku6x6Engine.validateQueensSolution(badBoard, puzzle.regions);
    expect(validation.isValid).toBe(false);
  });

  test('provides valid hint matching solution', () => {
    const puzzle = Sudoku6x6Engine.generatePuzzle('level3');
    const emptyBoard = Array.from({ length: puzzle.size }, () => Array(puzzle.size).fill(0));

    const hint = Sudoku6x6Engine.getCellHint(emptyBoard, puzzle.solution);
    expect(hint).not.toBeNull();
    if (hint) {
      expect(hint.val).toBe(1);
      expect(puzzle.solution[hint.row][hint.col]).toBe(1);
    }
  });
});
