import { Request, Response } from 'express';
import { PuzzleModel, PlayerProfileModel } from '../../database/models';
import { Sudoku6x6Engine, Difficulty } from './engine/sudoku6x6';
import { AuthenticatedRequest } from '../../common/middleware/auth';

export class PuzzleController {
  public static async getRandomPuzzle(req: Request, res: Response): Promise<void> {
    try {
      const difficulty = (req.query.difficulty as string) || 'medium';
      const sizeParam = req.query.size ? parseInt(req.query.size as string, 10) : undefined;

      // Generate a fresh unique Queens puzzle
      const generated = Sudoku6x6Engine.generatePuzzle(difficulty, sizeParam);
      const puzzleId = generated.puzzleId;

      await PuzzleModel.create({
        puzzleId,
        difficulty,
        regions: generated.regions,
        initialGrid: generated.initialGrid,
        solution: generated.solution,
        cluesCount: generated.cluesCount,
        verifiedUnique: true,
      });

      // Send to client without the solution
      res.status(200).json({
        success: true,
        puzzle: {
          puzzleId,
          difficulty,
          regions: generated.regions,
          initialGrid: generated.initialGrid,
          cluesCount: generated.cluesCount,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  public static async getHint(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { type, currentGrid } = req.body; // type: 'cell' (Hint 1) or 'elimination' (Hint 2)

      const puzzle = await PuzzleModel.findOne({ puzzleId: id });
      if (!puzzle) {
        res.status(404).json({ success: false, message: 'Puzzle not found' });
        return;
      }

      // If user is authenticated, deduct coins
      if (req.user) {
        const cost = type === 'elimination' ? 15 : 10;
        const profile = await PlayerProfileModel.findOne({ userId: req.user.userId });
        if (profile) {
          if (profile.coins < cost) {
            res.status(400).json({ success: false, message: 'Not enough coins for this hint!' });
            return;
          }
          profile.coins -= cost;
          await profile.save();
        }
      }

      const hint = Sudoku6x6Engine.getCellHint(currentGrid || puzzle.initialGrid, puzzle.solution);
      res.status(200).json({ success: true, hint, hintType: type });
      return;
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  public static async checkCell(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { row, col, val } = req.body;

      const puzzle = await PuzzleModel.findOne({ puzzleId: id });
      if (!puzzle) {
        res.status(404).json({ success: false, message: 'Puzzle not found' });
        return;
      }

      const isCorrect = puzzle.solution[row][col] === val;
      res.status(200).json({ success: true, isCorrect });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
}
