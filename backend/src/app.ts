import express from 'express';
import cors from 'cors';
import { AuthController } from './modules/auth/authController';
import { PuzzleController } from './modules/puzzles/puzzleController';
import { GameController } from './modules/game/gameController';
import { LeaderboardController } from './modules/leaderboard/leaderboardController';
import { DailyChallengeController } from './modules/daily-challenges/dailyChallengeController';
import { ShopController } from './modules/shop/shopController';
import { authenticate } from './common/middleware/auth';

export function createApp(): express.Application {
  const app = express();

  app.use(cors({ origin: '*' }));
  app.use(express.json());

  // Health check
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', game: 'Pawdoku', timestamp: new Date().toISOString() });
  });

  const apiRouter = express.Router();

  // Auth routes
  apiRouter.post('/auth/guest', AuthController.guestLogin);
  apiRouter.post('/auth/register', AuthController.register);
  apiRouter.post('/auth/login', AuthController.login);
  apiRouter.get('/auth/me', authenticate as any, AuthController.getMe as any);

  // Puzzle routes
  apiRouter.get('/puzzles/random', PuzzleController.getRandomPuzzle);
  apiRouter.post('/puzzles/:id/hint', authenticate as any, PuzzleController.getHint as any);
  apiRouter.post('/puzzles/:id/check', PuzzleController.checkCell);

  // Game (Single Player) routes
  apiRouter.post('/games/start', authenticate as any, GameController.startGame as any);
  apiRouter.post('/games/:sessionId/complete', authenticate as any, GameController.completeGame as any);
  apiRouter.get('/games/history', authenticate as any, GameController.getHistory as any);

  // Leaderboard routes
  apiRouter.get('/leaderboard/global', LeaderboardController.getGlobal);
  apiRouter.get('/leaderboard/weekly', LeaderboardController.getWeekly);
  apiRouter.get('/leaderboard/monthly', LeaderboardController.getMonthly);

  // Daily Challenge routes
  apiRouter.get('/daily-challenge', authenticate as any, DailyChallengeController.getDailyChallenge as any);
  apiRouter.post('/daily-challenge/complete', authenticate as any, DailyChallengeController.completeDailyChallenge as any);

  // Shop & Spin Wheel routes
  apiRouter.get('/shop/items', authenticate as any, ShopController.getItems as any);
  apiRouter.post('/shop/purchase', authenticate as any, ShopController.purchaseItem as any);
  apiRouter.post('/shop/equip', authenticate as any, ShopController.equipItem as any);
  apiRouter.post('/shop/spin-wheel', authenticate as any, ShopController.spinWheel as any);

  app.use('/api/v1', apiRouter);

  // Error handling middleware
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(err.status || 500).json({
      success: false,
      message: err.message || 'Internal server error',
    });
  });

  return app;
}
