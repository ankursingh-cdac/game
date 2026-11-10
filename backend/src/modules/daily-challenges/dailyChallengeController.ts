import { Response } from 'express';
import { DailyChallengeModel, DailyChallengeCompletionModel, PuzzleModel, PlayerProfileModel } from '../../database/models';
import { AuthenticatedRequest } from '../../common/middleware/auth';
import { Sudoku6x6Engine, Grid6x6 } from '../puzzles/engine/sudoku6x6';

function getTodayString(): string {
  const d = new Date();
  return d.toISOString().split('T')[0];
}

export class DailyChallengeController {
  public static async getDailyChallenge(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const today = getTodayString();
      let challenge = await DailyChallengeModel.findOne({ dateString: today });

      if (!challenge) {
        // Generate daily puzzle
        const generated = Sudoku6x6Engine.generatePuzzle('medium');
        const puzzleId = `daily_${today}`;

        await PuzzleModel.create({
          puzzleId,
          difficulty: 'medium',
          regions: generated.regions,
          initialGrid: generated.initialGrid,
          solution: generated.solution,
          cluesCount: generated.cluesCount,
        });

        challenge = await DailyChallengeModel.create({
          dateString: today,
          puzzleId,
          difficulty: 'medium',
          rewardCoins: 120,
          rewardXp: 180,
        });
      }

      const puzzle = await PuzzleModel.findOne({ puzzleId: challenge.puzzleId });
      let isCompletedToday = false;

      if (req.user) {
        const completion = await DailyChallengeCompletionModel.findOne({
          userId: req.user.userId,
          dateString: today,
        });
        isCompletedToday = !!completion;
      }

      res.status(200).json({
        success: true,
        challenge: {
          dateString: challenge.dateString,
          puzzleId: challenge.puzzleId,
          difficulty: challenge.difficulty,
          regions: puzzle?.regions,
          initialGrid: puzzle?.initialGrid,
          cluesCount: puzzle?.cluesCount,
          rewardCoins: challenge.rewardCoins,
          rewardXp: challenge.rewardXp,
          isCompletedToday,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  public static async completeDailyChallenge(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, message: 'Authentication required' });
        return;
      }

      const { submittedGrid, durationMs = 0 } = req.body;
      const today = getTodayString();

      // Check if already completed today (anti-duplicate)
      const existing = await DailyChallengeCompletionModel.findOne({ userId, dateString: today });
      if (existing) {
        res.status(400).json({ success: false, message: 'You have already completed today’s Daily Challenge!' });
        return;
      }

      const challenge = await DailyChallengeModel.findOne({ dateString: today });
      if (!challenge) {
        res.status(404).json({ success: false, message: 'Daily challenge not found' });
        return;
      }

      const puzzle = await PuzzleModel.findOne({ puzzleId: challenge.puzzleId });
      if (!puzzle) {
        res.status(404).json({ success: false, message: 'Puzzle not found' });
        return;
      }

      // Authoritative Queens validation
      const validation = Sudoku6x6Engine.validateQueensSolution(submittedGrid, puzzle.regions);
      if (!validation.isValid) {
        res.status(400).json({
          success: false,
          message: validation.errors[0] || 'Solution is incorrect',
          isCorrect: false,
        });
        return;
      }

      await DailyChallengeCompletionModel.create({
        userId,
        dateString: today,
        durationMs,
      });

      // Update player profile streak, coins, XP
      const profile = await PlayerProfileModel.findOne({ userId });
      let streak = 1;
      if (profile) {
        // Calculate streak
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        if (profile.lastDailyDate === yesterday) {
          streak = (profile.streakDays || 0) + 1;
        } else {
          streak = 1;
        }

        profile.streakDays = streak;
        profile.lastDailyDate = today;
        profile.coins += challenge.rewardCoins;
        profile.xp += challenge.rewardXp;
        profile.level = Math.floor(Math.sqrt(profile.xp / 100)) + 1;
        await profile.save();
      }

      res.status(200).json({
        success: true,
        message: 'Daily Challenge Completed!',
        rewards: {
          coinsEarned: challenge.rewardCoins,
          xpEarned: challenge.rewardXp,
          streakDays: streak,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
}
