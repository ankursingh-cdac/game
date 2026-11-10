import http from 'http';
import mongoose from 'mongoose';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../src/app';
import { connectDatabase, disconnectDatabase } from '../src/config/database';
import { SocketServer } from '../src/sockets/socketServer';
import { PuzzleModel } from '../src/database/models';
import { generateToken } from '../src/common/middleware/auth';

describe('Multiplayer Real-time 1v1 Battles', () => {
  jest.setTimeout(35000);
  let server: http.Server;
  let serverPort: number;
  let client1: ClientSocket;
  let client2: ClientSocket;

  let socketServer: SocketServer;

  beforeAll(async () => {
    await connectDatabase();
    const app = createApp();
    server = http.createServer(app);
    socketServer = new SocketServer(server);

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        serverPort = typeof addr === 'object' && addr ? addr.port : 4001;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (client1?.connected) client1.disconnect();
    if (client2?.connected) client2.disconnect();
    socketServer.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await disconnectDatabase();
  });

  test('Critical Acceptance Test: 2 players matched with identical puzzle, fastest valid submission wins', async () => {
    const p1Id = new mongoose.Types.ObjectId().toHexString();
    const p2Id = new mongoose.Types.ObjectId().toHexString();
    const user1Token = generateToken({ userId: p1Id, username: 'SpeedyKitty' });
    const user2Token = generateToken({ userId: p2Id, username: 'CozyLamb' });

    client1 = Client(`http://localhost:${serverPort}`, {
      auth: { token: user1Token },
      transports: ['websocket'],
    });

    client2 = Client(`http://localhost:${serverPort}`, {
      auth: { token: user2Token },
      transports: ['websocket'],
    });

    await Promise.all([
      new Promise<void>((resolve) => client1.on('connect', resolve)),
      new Promise<void>((resolve) => client2.on('connect', resolve)),
    ]);

    let matchData1: any = null;
    let matchData2: any = null;

    const matchFoundPromise = Promise.all([
      new Promise<void>((resolve) => {
        client1.on('matchmaking:found', (data) => {
          matchData1 = data;
          resolve();
        });
      }),
      new Promise<void>((resolve) => {
        client2.on('matchmaking:found', (data) => {
          matchData2 = data;
          resolve();
        });
      }),
    ]);

    // Both players join matchmaking queue for medium difficulty
    client1.emit('matchmaking:join', { difficulty: 'medium' });
    client2.emit('matchmaking:join', { difficulty: 'medium' });

    await matchFoundPromise;

    // Verify SAME PUZZLE GUARANTEE
    expect(matchData1.matchId).toBe(matchData2.matchId);
    expect(matchData1.initialGrid).toEqual(matchData2.initialGrid);
    expect(matchData1.countdownSeconds).toBe(3);

    // Retrieve the secret solution from server database
    const puzzleDoc = await PuzzleModel.findOne({ puzzleId: matchData1.puzzleId });
    expect(puzzleDoc).not.toBeNull();
    const solution = puzzleDoc!.solution;

    // Player 1 finishes and submits first
    const player1CompletedPromise = new Promise<any>((resolve) => {
      client1.on('match:player_completed', (data) => {
        resolve(data);
      });
    });

    const matchFinishedPromise = Promise.all([
      new Promise<any>((resolve) => client1.on('match:finished', resolve)),
      new Promise<any>((resolve) => client2.on('match:finished', resolve)),
    ]);

    client1.emit('match:submit', {
      matchId: matchData1.matchId,
      submittedGrid: solution,
    });

    const p1Completed = await player1CompletedPromise;
    expect(p1Completed.userId).toBe(p1Id);
    expect(p1Completed.isFirst).toBe(true);

    // Player 2 finishes slightly later and submits too
    await new Promise((r) => setTimeout(r, 200));
    client2.emit('match:submit', {
      matchId: matchData2.matchId,
      submittedGrid: solution,
    });

    const [finishResult1, finishResult2] = await matchFinishedPromise;

    // Both players received the exact same finish payload
    expect(finishResult1.matchId).toBe(finishResult2.matchId);
    expect(finishResult1.winnerId).toBe(p1Id);
    expect(finishResult1.winnerUsername).toBe('SpeedyKitty');
    expect(finishResult1.ratingDelta).toBe(25);

    // Both players have distinct times recorded
    expect(finishResult1.player1.isWinner).toBe(true);
    expect(finishResult1.player2.isWinner).toBe(false);
    expect(finishResult1.player1.timeMs).toBeGreaterThan(0);
    expect(finishResult1.player2.timeMs).toBeGreaterThan(finishResult1.player1.timeMs);
  });
});
