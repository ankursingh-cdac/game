import { Server as HttpServer } from 'http';
import mongoose from 'mongoose';
import { Server, Socket } from 'socket.io';
import { verifyToken, AuthPayload } from '../common/middleware/auth';
import { MatchModel, PlayerProfileModel, PrivateRoomModel, PuzzleModel } from '../database/models';
import { Sudoku6x6Engine, Difficulty, Grid6x6 } from '../modules/puzzles/engine/sudoku6x6';

interface AuthenticatedSocket extends Socket {
  user?: AuthPayload;
}

interface QueueEntry {
  socket: AuthenticatedSocket;
  userId: string;
  username: string;
  avatar: string;
  mmr: number;
  difficulty: Difficulty;
  joinedAt: number;
}

export class SocketServer {
  private io: Server;
  private matchmakingQueue: QueueEntry[] = [];
  private matchmakingInterval: NodeJS.Timeout | null = null;
  private activeMatches: Map<string, {
    matchId: string;
    puzzleId: string;
    regions: Grid6x6;
    solution: Grid6x6;
    actualStart: number;
    player1Id: string;
    player2Id: string;
    player1Username: string;
    player2Username: string;
    player1Avatar?: string;
    player2Avatar?: string;
    player1SocketId: string;
    player2SocketId: string;
    player1Progress: number;
    player2Progress: number;
    player1TimeMs: number;
    player2TimeMs: number;
    player1Finished?: boolean;
    player2Finished?: boolean;
    firstFinisherId?: string;
    graceTimeout?: NodeJS.Timeout;
    isFinished: boolean;
  }> = new Map();

  constructor(httpServer: HttpServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    this.setupAuthMiddleware();
    this.setupEventHandlers();
    this.startMatchmakingLoop();
  }

  public close(): void {
    if (this.matchmakingInterval) {
      clearInterval(this.matchmakingInterval);
      this.matchmakingInterval = null;
    }
    this.io.close();
  }

  private setupAuthMiddleware(): void {
    this.io.use((socket: AuthenticatedSocket, next) => {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) {
        // Allow guest sockets with temporary ID if no token provided
        const tempId = `guest_${socket.id.substring(0, 6)}`;
        socket.user = { userId: tempId, username: tempId, isGuest: true };
        return next();
      }

      try {
        const decoded = verifyToken(token as string);
        socket.user = decoded;
        next();
      } catch (err) {
        const tempId = `guest_${socket.id.substring(0, 6)}`;
        socket.user = { userId: tempId, username: tempId, isGuest: true };
        next();
      }
    });
  }

  private setupEventHandlers(): void {
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      const userId = socket.user?.userId || socket.id;
      const username = socket.user?.username || 'Guest';

      console.log(`🔌 Player connected: ${username} (${userId})`);

      // Matchmaking: Join
      socket.on('matchmaking:join', async (data: { difficulty?: Difficulty }) => {
        const difficulty = data?.difficulty || 'medium';
        let profile = null;
        if (mongoose.isValidObjectId(userId)) {
          profile = await PlayerProfileModel.findOne({ userId });
        }
        const mmr = profile?.mmr || 1000;
        const avatar = profile?.avatar || 'cat_avatar_default';

        // Remove existing queue entries
        this.matchmakingQueue = this.matchmakingQueue.filter(q => q.userId !== userId);

        this.matchmakingQueue.push({
          socket,
          userId,
          username,
          avatar,
          mmr,
          difficulty,
          joinedAt: Date.now(),
        });

        socket.emit('matchmaking:searching', { status: 'searching', difficulty });
      });

      // Matchmaking: Cancel
      socket.on('matchmaking:cancel', () => {
        this.matchmakingQueue = this.matchmakingQueue.filter(q => q.userId !== userId);
        socket.emit('matchmaking:cancelled');
      });

      // Private Room: Create
      socket.on('room:create', async (data: { difficulty?: Difficulty }) => {
        try {
          const difficulty = data?.difficulty || 'medium';
          const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();

          await PrivateRoomModel.create({
            roomCode,
            hostId: userId,
            difficulty,
            status: 'open',
          });

          socket.join(`room_${roomCode}`);
          socket.emit('room:created', { roomCode, difficulty, isHost: true });
        } catch (err: any) {
          socket.emit('error', { message: err.message });
        }
      });

      // Private Room: Join
      socket.on('room:join', async (data: { roomCode: string }) => {
        try {
          const { roomCode } = data;
          const room = await PrivateRoomModel.findOne({ roomCode, status: 'open' });

          if (!room) {
            socket.emit('error', { message: 'Room not found or already in progress' });
            return;
          }

          if (room.hostId === userId) {
            socket.emit('error', { message: 'You are already the host of this room' });
            return;
          }

          room.guestId = userId;
          await room.save();

          const hostProfile = await PlayerProfileModel.findOne({ userId: room.hostId });
          const guestProfile = await PlayerProfileModel.findOne({ userId });

          socket.join(`room_${roomCode}`);
          socket.emit('room:joined', {
            roomCode,
            difficulty: room.difficulty,
            isHost: false,
            hostName: hostProfile?.username || 'Host',
            hostReady: room.hostReady,
            guestReady: room.guestReady,
          });
          this.io.to(`room_${roomCode}`).emit('room:player_joined', {
            guestId: userId,
            guestName: guestProfile?.username || username,
            username: guestProfile?.username || username,
            hostName: hostProfile?.username || 'Host',
          });
        } catch (err: any) {
          socket.emit('error', { message: err.message });
        }
      });

      // Private Room: Ready Toggle
      socket.on('room:ready', async (data: { roomCode: string }) => {
        try {
          const { roomCode } = data;
          const room = await PrivateRoomModel.findOne({ roomCode });
          if (!room) return;

          if (room.hostId === userId) room.hostReady = !room.hostReady;
          if (room.guestId === userId) room.guestReady = !room.guestReady;
          await room.save();

          this.io.to(`room_${roomCode}`).emit('room:status_update', {
            hostReady: room.hostReady,
            guestReady: room.guestReady,
          });
        } catch (err: any) {
          socket.emit('error', { message: err.message });
        }
      });

      // Private Room: Start Match (User clicks PLAY)
      socket.on('room:start', async (data: { roomCode: string }) => {
        try {
          const { roomCode } = data;
          await this.startRoomMatch(roomCode);
        } catch (err: any) {
          socket.emit('error', { message: err.message });
        }
      });

      // Private Room: Rematch / Play Again in same room
      socket.on('room:rematch', async (data: { roomCode: string }) => {
        try {
          const { roomCode } = data;
          const room = await PrivateRoomModel.findOne({ roomCode });
          if (!room) return;
          room.hostReady = false;
          room.guestReady = false;
          room.status = 'open';
          await room.save();

          this.io.to(`room_${roomCode}`).emit('room:status_update', {
            hostReady: false,
            guestReady: false,
          });
          this.io.to(`room_${roomCode}`).emit('room:reset_to_lobby');
        } catch (err: any) {
          socket.emit('error', { message: err.message });
        }
      });

      // Match: Progress (send cell completion count e.g. 15/36 without leaking actual cell values)
      socket.on('match:progress', (data: { matchId: string; cellsFilled: number }) => {
        const match = this.activeMatches.get(data.matchId);
        if (!match) return;

        if (userId === match.player1Id) {
          match.player1Progress = data.cellsFilled;
        } else if (userId === match.player2Id) {
          match.player2Progress = data.cellsFilled;
        }

        socket.to(`match_${data.matchId}`).emit('match:opponent_progress', {
          userId,
          cellsFilled: data.cellsFilled,
        });
      });

      // Match: Submit (Authoritative validation and winner calculation)
      socket.on('match:submit', async (data: { matchId: string; submittedGrid: Grid6x6 }) => {
        await this.handleMatchSubmission(socket, userId, data.matchId, data.submittedGrid);
      });

      // Disconnect
      socket.on('disconnect', () => {
        this.matchmakingQueue = this.matchmakingQueue.filter(q => q.userId !== userId);
        console.log(`🔌 Player disconnected: ${username}`);
      });
    });
  }

  private startMatchmakingLoop(): void {
    this.matchmakingInterval = setInterval(async () => {
      if (this.matchmakingQueue.length < 2) {
        // If someone has been waiting alone > 5 seconds, match with a friendly Bot so they can play instantly!
        if (this.matchmakingQueue.length === 1) {
          const entry = this.matchmakingQueue[0];
          if (Date.now() - entry.joinedAt > 5000) {
            this.matchmakingQueue.shift();
            await this.matchWithBot(entry);
          }
        }
        return;
      }

      // Match first two compatible players
      const player1 = this.matchmakingQueue.shift()!;
      const player2 = this.matchmakingQueue.shift()!;

      await this.createAndStartMatch(player1, player2, 'quick');
    }, 1000);
  }

  private async matchWithBot(player: QueueEntry): Promise<void> {
    const bots = [
      { username: 'PandaPro', avatar: 'avatar_sleepy_panda', mmr: 1050 },
      { username: 'SpeedyKitty', avatar: 'avatar_cat_default', mmr: 1020 },
      { username: 'CleverPup', avatar: 'avatar_golden_pup', mmr: 980 },
    ];
    const bot = bots[Math.floor(Math.random() * bots.length)];
    const botUserId = `bot_${Date.now()}`;

    // Create puzzle
    const puzzle = Sudoku6x6Engine.generatePuzzle(player.difficulty);
    const puzzleId = `puz_${Date.now()}`;
    const matchId = `match_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    await PuzzleModel.create({
      puzzleId,
      difficulty: player.difficulty,
      regions: puzzle.regions,
      initialGrid: puzzle.initialGrid,
      solution: puzzle.solution,
      cluesCount: puzzle.cluesCount,
    });

    const scheduledStart = new Date(Date.now() + 3000); // 3-second countdown
    const actualStart = scheduledStart.getTime();

    this.activeMatches.set(matchId, {
      matchId,
      puzzleId,
      regions: puzzle.regions,
      solution: puzzle.solution,
      actualStart,
      player1Id: player.userId,
      player2Id: botUserId,
      player1Username: player.username,
      player2Username: bot.username,
      player1Avatar: player.avatar,
      player2Avatar: bot.avatar,
      player1SocketId: player.socket.id,
      player2SocketId: 'bot',
      player1Progress: 0,
      player2Progress: 0,
      player1TimeMs: 0,
      player2TimeMs: 0,
      isFinished: false,
    });

    player.socket.join(`match_${matchId}`);

    // Notify matchmaking found
    player.socket.emit('matchmaking:found', {
      matchId,
      opponent: {
        userId: botUserId,
        username: bot.username,
        avatar: bot.avatar,
        mmr: bot.mmr,
      },
      difficulty: player.difficulty,
      regions: puzzle.regions,
      initialGrid: puzzle.initialGrid,
      countdownSeconds: 3,
    });

    // Simulate bot progress and bot solve timer (e.g. 75-110 seconds)
    const botSolveTimeMs = 60000 + Math.floor(Math.random() * 45000);
    const totalCells = 6;
    let botFilled = 0;

    const progressInterval = setInterval(() => {
      const match = this.activeMatches.get(matchId);
      if (!match || match.isFinished) {
        clearInterval(progressInterval);
        return;
      }

      if (botFilled < totalCells) {
        botFilled += 1;
        match.player2Progress = botFilled;
        player.socket.emit('match:opponent_progress', {
          userId: botUserId,
          cellsFilled: Math.min(botFilled, totalCells),
        });
      }
    }, 12000);

    setTimeout(async () => {
      const match = this.activeMatches.get(matchId);
      if (match && !match.isFinished && !match.player2Finished) {
        // Bot finishes!
        match.player2Finished = true;
        match.player2TimeMs = botSolveTimeMs;
        match.player2Progress = 6;
        if (!match.firstFinisherId) {
          match.firstFinisherId = botUserId;
        }
        clearInterval(progressInterval);

        // Notify player that bot completed their puzzle
        player.socket.emit('match:player_completed', {
          matchId,
          userId: botUserId,
          username: bot.username,
          elapsedMs: botSolveTimeMs,
          isFirst: match.firstFinisherId === botUserId,
        });

        player.socket.emit('match:opponent_progress', {
          userId: botUserId,
          cellsFilled: 6,
        });

        if (match.player1Finished) {
          await this.finalizeMatch(matchId);
        } else {
          // Allow player time to solve their puzzle
          if (!match.graceTimeout) {
            match.graceTimeout = setTimeout(async () => {
              await this.finalizeMatch(matchId);
            }, 120000);
          }
        }
      }
    }, botSolveTimeMs + 3000);
  }

  private async startRoomMatch(roomCode: string): Promise<void> {
    const room = await PrivateRoomModel.findOne({ roomCode });
    if (!room || !room.guestId) return;

    const hostSocket = (await this.io.in(`room_${roomCode}`).fetchSockets()).find(
      (s) => (s as any).user?.userId === room.hostId
    );
    const guestSocket = (await this.io.in(`room_${roomCode}`).fetchSockets()).find(
      (s) => (s as any).user?.userId === room.guestId
    );

    if (hostSocket && guestSocket) {
      const hostProfile = await PlayerProfileModel.findOne({ userId: room.hostId });
      const guestProfile = await PlayerProfileModel.findOne({ userId: room.guestId });

      await this.createAndStartMatch(
        {
          socket: hostSocket as any,
          userId: room.hostId,
          username: hostProfile?.username || 'Host',
          avatar: hostProfile?.avatar || 'cat_avatar_default',
          mmr: hostProfile?.mmr || 1000,
          difficulty: room.difficulty,
          joinedAt: Date.now(),
        },
        {
          socket: guestSocket as any,
          userId: room.guestId,
          username: guestProfile?.username || 'Guest',
          avatar: guestProfile?.avatar || 'cat_avatar_default',
          mmr: guestProfile?.mmr || 1000,
          difficulty: room.difficulty,
          joinedAt: Date.now(),
        },
        'room',
        roomCode
      );
    }
  }

  private async createAndStartMatch(
    player1: QueueEntry,
    player2: QueueEntry,
    mode: 'quick' | 'ranked' | 'room',
    roomCode?: string
  ): Promise<void> {
    const difficulty = player1.difficulty || 'medium';
    const puzzle = Sudoku6x6Engine.generatePuzzle(difficulty);
    const puzzleId = `puz_${Date.now()}`;
    const matchId = `match_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    await PuzzleModel.create({
      puzzleId,
      difficulty,
      regions: puzzle.regions,
      initialGrid: puzzle.initialGrid,
      solution: puzzle.solution,
      cluesCount: puzzle.cluesCount,
    });

    const scheduledStart = new Date(Date.now() + 3000);
    const actualStart = scheduledStart.getTime();

    await MatchModel.create({
      matchId,
      mode,
      difficulty,
      puzzleId,
      regions: puzzle.regions,
      initialGrid: puzzle.initialGrid,
      solution: puzzle.solution,
      player1: {
        userId: player1.userId,
        username: player1.username,
        avatar: player1.avatar,
        mmr: player1.mmr,
      },
      player2: {
        userId: player2.userId,
        username: player2.username,
        avatar: player2.avatar,
        mmr: player2.mmr,
      },
      scheduledStart,
      actualStart: scheduledStart,
      status: 'in_progress',
    });

    this.activeMatches.set(matchId, {
      matchId,
      puzzleId,
      regions: puzzle.regions,
      solution: puzzle.solution,
      actualStart,
      player1Id: player1.userId,
      player2Id: player2.userId,
      player1Username: player1.username,
      player2Username: player2.username,
      player1Avatar: player1.avatar,
      player2Avatar: player2.avatar,
      player1SocketId: player1.socket.id,
      player2SocketId: player2.socket.id,
      player1Progress: 0,
      player2Progress: 0,
      player1TimeMs: 0,
      player2TimeMs: 0,
      player1Finished: false,
      player2Finished: false,
      firstFinisherId: undefined,
      graceTimeout: undefined,
      isFinished: false,
    });

    player1.socket.join(`match_${matchId}`);
    player2.socket.join(`match_${matchId}`);

    const matchPayload1 = {
      matchId,
      roomCode,
      puzzleId,
      opponent: {
        userId: player2.userId,
        username: player2.username,
        avatar: player2.avatar,
        mmr: player2.mmr,
      },
      difficulty,
      regions: puzzle.regions,
      initialGrid: puzzle.initialGrid,
      countdownSeconds: 3,
    };

    const matchPayload2 = {
      matchId,
      roomCode,
      puzzleId,
      opponent: {
        userId: player1.userId,
        username: player1.username,
        avatar: player1.avatar,
        mmr: player1.mmr,
      },
      difficulty,
      regions: puzzle.regions,
      initialGrid: puzzle.initialGrid,
      countdownSeconds: 3,
    };

    // Emit both events for maximum compatibility
    player1.socket.emit('matchmaking:found', matchPayload1);
    player1.socket.emit('room:match_start', matchPayload1);

    player2.socket.emit('matchmaking:found', matchPayload2);
    player2.socket.emit('room:match_start', matchPayload2);
  }

  private async handleMatchSubmission(
    socket: AuthenticatedSocket,
    userId: string,
    matchId: string,
    submittedGrid: Grid6x6
  ): Promise<void> {
    const match = this.activeMatches.get(matchId);
    if (!match) {
      socket.emit('error', { message: 'Match not found or already finished' });
      return;
    }

    if (match.isFinished) {
      socket.emit('error', { message: 'Match has already ended' });
      return;
    }

    const isPlayer1 = userId === match.player1Id;

    // Check if this player already submitted successfully
    if ((isPlayer1 && match.player1Finished) || (!isPlayer1 && match.player2Finished)) {
      socket.emit('match:submit_result', {
        isCorrect: true,
        message: 'Puzzle already submitted! Waiting for opponent to finish...',
      });
      return;
    }

    // Authoritative Queens verification
    const validation = Sudoku6x6Engine.validateQueensSolution(submittedGrid, match.regions);
    const now = Date.now();
    const elapsedMs = now >= match.actualStart 
      ? Math.max(100, now - match.actualStart)
      : Math.max(100, now - (match.actualStart - 3000));

    if (!validation.isValid) {
      socket.emit('match:submit_result', {
        isCorrect: false,
        message: validation.errors[0] || 'Your board contains mistakes! Keep going!',
      });
      return;
    }

    // Valid solution submitted!
    socket.emit('match:submit_result', {
      isCorrect: true,
      message: 'Great job! Puzzle solved!',
    });

    const username = isPlayer1 ? match.player1Username : match.player2Username;

    if (isPlayer1) {
      match.player1Finished = true;
      match.player1TimeMs = elapsedMs;
      match.player1Progress = 6;
    } else {
      match.player2Finished = true;
      match.player2TimeMs = elapsedMs;
      match.player2Progress = 6;
    }

    const isFirstToFinish = !match.firstFinisherId;
    if (isFirstToFinish) {
      match.firstFinisherId = userId;
    }

    // Broadcast that this player completed their puzzle
    this.io.to(`match_${matchId}`).emit('match:player_completed', {
      matchId,
      userId,
      username,
      elapsedMs,
      isFirst: isFirstToFinish,
    });

    // Also update opponent's view of progress to 6/6
    socket.to(`match_${matchId}`).emit('match:opponent_progress', {
      userId,
      cellsFilled: 6,
    });

    // If opponent is a bot, schedule bot completion soon so user isn't stuck waiting
    if (match.player2SocketId === 'bot' && !match.player2Finished) {
      setTimeout(async () => {
        const m = this.activeMatches.get(matchId);
        if (m && !m.isFinished && !m.player2Finished) {
          m.player2Finished = true;
          m.player2TimeMs = elapsedMs + 3500;
          m.player2Progress = 6;
          await this.finalizeMatch(matchId);
        }
      }, 3000);
      return;
    }

    // If BOTH players have now finished, end the match and show full results!
    if (match.player1Finished && match.player2Finished) {
      await this.finalizeMatch(matchId);
    } else {
      // First player finished! Start a 120-second safety grace timeout
      // so if the other player leaves or is stuck, the match cleanly concludes
      if (!match.graceTimeout) {
        match.graceTimeout = setTimeout(async () => {
          await this.finalizeMatch(matchId);
        }, 120000);
      }
    }
  }

  private async finalizeMatch(matchId: string): Promise<void> {
    const match = this.activeMatches.get(matchId);
    if (!match || match.isFinished) return;

    match.isFinished = true;
    if (match.graceTimeout) {
      clearTimeout(match.graceTimeout);
      match.graceTimeout = undefined;
    }

    // Determine winner:
    // If both finished, player with smaller solve time wins.
    // If only one finished (e.g. timeout), that finisher wins.
    let winnerId = match.firstFinisherId || match.player1Id;
    if (match.player1Finished && match.player2Finished) {
      if (match.player1TimeMs < match.player2TimeMs) {
        winnerId = match.player1Id;
      } else if (match.player2TimeMs < match.player1TimeMs) {
        winnerId = match.player2Id;
      } else {
        winnerId = match.firstFinisherId || match.player1Id;
      }
    } else if (match.player1Finished) {
      winnerId = match.player1Id;
    } else if (match.player2Finished) {
      winnerId = match.player2Id;
    }

    const isPlayer1Winner = winnerId === match.player1Id;
    const opponentId = isPlayer1Winner ? match.player2Id : match.player1Id;

    // Update match document in MongoDB
    const matchDoc = await MatchModel.findOne({ matchId });
    if (matchDoc) {
      matchDoc.status = 'completed';
      matchDoc.winnerId = winnerId;
      matchDoc.completedAt = new Date();
      matchDoc.ratingDelta = {
        player1: isPlayer1Winner ? 25 : -20,
        player2: !isPlayer1Winner ? 25 : -20,
      };
      await matchDoc.save();
    }

    // Update profiles and Elo
    let winnerProfile = null;
    if (mongoose.isValidObjectId(winnerId)) {
      winnerProfile = await PlayerProfileModel.findOne({ userId: winnerId });
      if (winnerProfile) {
        winnerProfile.wins += 1;
        winnerProfile.matchesPlayed += 1;
        winnerProfile.mmr += 25;
        winnerProfile.xp += 150;
        winnerProfile.coins += 60;
        winnerProfile.level = Math.floor(Math.sqrt(winnerProfile.xp / 100)) + 1;
        await winnerProfile.save();
      }
    }

    if (mongoose.isValidObjectId(opponentId)) {
      const loserProfile = await PlayerProfileModel.findOne({ userId: opponentId });
      if (loserProfile) {
        loserProfile.losses += 1;
        loserProfile.matchesPlayed += 1;
        loserProfile.mmr = Math.max(500, loserProfile.mmr - 20);
        loserProfile.xp += 30; // Consolation XP
        await loserProfile.save();
      }
    }

    const winnerUsername = isPlayer1Winner ? match.player1Username : match.player2Username;

    // Real distinct completion times
    const totalElapsed = Math.max(0, Date.now() - match.actualStart);
    const p1Time = match.player1Finished ? match.player1TimeMs : totalElapsed;
    const p2Time = match.player2Finished ? match.player2TimeMs : totalElapsed;

    // Broadcast victory & full player comparison to both players!
    const resultPayload = {
      matchId,
      winnerId,
      winnerUsername,
      elapsedMs: Math.min(p1Time, p2Time),
      solution: match.solution,
      player1: {
        userId: match.player1Id,
        username: match.player1Username,
        avatar: match.player1Avatar || 'cat_avatar_default',
        timeMs: p1Time,
        cellsFilled: match.player1Progress,
        isWinner: isPlayer1Winner,
        finished: match.player1Finished ?? false,
      },
      player2: {
        userId: match.player2Id,
        username: match.player2Username,
        avatar: match.player2Avatar || 'cat_avatar_default',
        timeMs: p2Time,
        cellsFilled: match.player2Progress,
        isWinner: !isPlayer1Winner,
        finished: match.player2Finished ?? false,
      },
      ratingDelta: 25,
    };

    this.io.to(`match_${matchId}`).emit('match:finished', resultPayload);
  }
}
