import { Response } from 'express';
import { GameSessionModel, PlayerProfileModel, PuzzleModel } from '../../database/models';
import { AuthenticatedRequest } from '../../common/middleware/auth';
import { Sudoku6x6Engine, Grid6x6 } from '../puzzles/engine/sudoku6x6';

export class GameController {
  public static async startGame(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { puzzleId, difficulty } = req.body;
      const userId = req.user?.userId || 'guest_local';

      const sessionId = `sess_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

      const session = await GameSessionModel.create({
        sessionId,
        userId,
        puzzleId,
        difficulty: difficulty || 'medium',
      });

      res.status(201).json({ success: true, session });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  public static async completeGame(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const { submittedGrid, hintsUsed = 0, mistakes = 0, durationMs = 0 } = req.body;
      const userId = req.user?.userId;

      const session = await GameSessionModel.findOne({ sessionId });
      if (!session) {
        res.status(404).json({ success: false, message: 'Game session not found' });
        return;
      }

      const puzzle = await PuzzleModel.findOne({ puzzleId: session.puzzleId });
      if (!puzzle) {
        res.status(404).json({ success: false, message: 'Puzzle not found' });
        return;
      }

      // Authoritative Queens validation
      const validation = Sudoku6x6Engine.validateQueensSolution(submittedGrid, puzzle.regions);
      if (!validation.isValid) {
        res.status(400).json({
          success: false,
          message: validation.errors[0] || 'Submitted solution is incorrect or incomplete',
          errors: validation.errors,
          isCorrect: false,
        });
        return;
      }

      // Calculate XP and Coins based on difficulty and performance
      const baseScores: Record<string, { xp: number; coins: number }> = {
        level1: { xp: 50, coins: 25 },
        level2: { xp: 75, coins: 35 },
        level3: { xp: 100, coins: 50 },
        level4: { xp: 140, coins: 65 },
        level5: { xp: 180, coins: 80 },
        level6: { xp: 220, coins: 100 },
        level7: { xp: 260, coins: 120 },
        easy: { xp: 50, coins: 25 },
        medium: { xp: 100, coins: 50 },
        hard: { xp: 175, coins: 80 },
        expert: { xp: 250, coins: 120 },
      };

      const base = baseScores[session.difficulty] || baseScores.medium;
      // Bonus for fast solve (< 3 minutes)
      const speedBonus = durationMs < 180000 ? 20 : 0;
      // Penalty for hints and mistakes
      const hintsPenalty = hintsUsed * 5;
      const mistakesPenalty = mistakes * 5;

      const finalXp = Math.max(20, base.xp + speedBonus - hintsPenalty - mistakesPenalty);
      const finalCoins = Math.max(10, base.coins + Math.floor(speedBonus / 2));

      session.isCompleted = true;
      session.hintsUsed = hintsUsed;
      session.mistakes = mistakes;
      session.durationMs = durationMs;
      session.xpEarned = finalXp;
      session.coinsEarned = finalCoins;
      session.completedAt = new Date();
      await session.save();

      // Update player profile if authenticated
      let newLevel = 1;
      let totalXp = 0;
      let totalCoins = 0;
      let unlockedLevel = 2;

      let completedLevelNum = 1;
      if (session.difficulty.startsWith('level')) {
        completedLevelNum = parseInt(session.difficulty.replace('level', ''), 10) || 1;
      }
      unlockedLevel = completedLevelNum + 1;

      if (userId) {
        const profile = await PlayerProfileModel.findOne({ userId });
        if (profile) {
          profile.xp += finalXp;
          profile.coins += finalCoins;

          // Level formula: level = Math.floor(sqrt(xp / 100)) + 1
          newLevel = Math.floor(Math.sqrt(profile.xp / 100)) + 1;
          profile.level = newLevel;

          // Unlock next level in campaign
          if (!profile.unlockedLevel || profile.unlockedLevel <= completedLevelNum) {
            profile.unlockedLevel = completedLevelNum + 1;
          }
          unlockedLevel = profile.unlockedLevel;

          // Update best time for difficulty
          const currentBest = profile.bestTimes[session.difficulty as keyof typeof profile.bestTimes];
          if (!currentBest || durationMs < currentBest) {
            profile.bestTimes[session.difficulty as keyof typeof profile.bestTimes] = durationMs;
          }

          await profile.save();
          totalXp = profile.xp;
          totalCoins = profile.coins;
        }
      }

      res.status(200).json({
        success: true,
        isCorrect: true,
        rewards: {
          xpEarned: finalXp,
          coinsEarned: finalCoins,
          newLevel,
          totalXp,
          totalCoins,
          durationMs,
          unlockedLevel,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  public static async getHistory(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }

      const sessions = await GameSessionModel.find({ userId, isCompleted: true })
        .sort({ completedAt: -1 })
        .limit(20);

      res.status(200).json({ success: true, sessions });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
}
