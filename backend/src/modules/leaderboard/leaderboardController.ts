import { Request, Response } from 'express';
import { PlayerProfileModel } from '../../database/models';

export class LeaderboardController {
  public static async getGlobal(req: Request, res: Response): Promise<void> {
    try {
      const topPlayers = await PlayerProfileModel.find()
        .sort({ mmr: -1, wins: -1 })
        .limit(50)
        .select('username avatar level mmr wins losses winRate');

      const rankings = topPlayers.map((player, index) => ({
        rank: index + 1,
        id: player._id,
        username: player.username,
        avatar: player.avatar,
        level: player.level,
        mmr: player.mmr,
        wins: player.wins,
        losses: player.losses,
        winRate: player.matchesPlayed > 0 ? Math.round((player.wins / player.matchesPlayed) * 100) : 0,
      }));

      res.status(200).json({ success: true, rankings });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  public static async getWeekly(req: Request, res: Response): Promise<void> {
    try {
      const topPlayers = await PlayerProfileModel.find()
        .sort({ wins: -1, mmr: -1 })
        .limit(50)
        .select('username avatar level mmr wins');

      const rankings = topPlayers.map((player, index) => ({
        rank: index + 1,
        id: player._id,
        username: player.username,
        avatar: player.avatar,
        level: player.level,
        wins: player.wins,
        mmr: player.mmr,
      }));

      res.status(200).json({ success: true, rankings });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  public static async getMonthly(req: Request, res: Response): Promise<void> {
    try {
      const topPlayers = await PlayerProfileModel.find()
        .sort({ xp: -1 })
        .limit(50)
        .select('username avatar level xp mmr');

      const rankings = topPlayers.map((player, index) => ({
        rank: index + 1,
        id: player._id,
        username: player.username,
        avatar: player.avatar,
        level: player.level,
        xp: player.xp,
        mmr: player.mmr,
      }));

      res.status(200).json({ success: true, rankings });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
}
