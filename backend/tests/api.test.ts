import request from 'supertest';
import { createApp } from '../src/app';
import { connectDatabase, disconnectDatabase } from '../src/config/database';
import { PuzzleModel, UserModel } from '../src/database/models';

describe('Pawdoku API Endpoints', () => {
  const app = createApp();
  let authToken = '';

  beforeAll(async () => {
    await connectDatabase();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  test('GET /health returns status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.game).toBe('Pawdoku');
  });

  test('POST /api/v1/auth/guest creates guest player and returns token', async () => {
    const res = await request(app).post('/api/v1/auth/guest');
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.body.profile.coins).toBe(200);
    authToken = res.body.token;
  });

  test('GET /api/v1/auth/me returns authenticated player profile', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.profile).toBeDefined();
  });

  test('GET /api/v1/puzzles/random returns puzzle without solution', async () => {
    const res = await request(app).get('/api/v1/puzzles/random?difficulty=easy');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.puzzle.initialGrid.length).toBeGreaterThanOrEqual(4);
    expect(res.body.puzzle.solution).toBeUndefined(); // Solution must NEVER be exposed!
  });

  test('GET /api/v1/leaderboard/global returns rankings', async () => {
    const res = await request(app).get('/api/v1/leaderboard/global');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.rankings)).toBe(true);
  });

  test('GET /api/v1/shop/items returns items list', async () => {
    const res = await request(app)
      .get('/api/v1/shop/items')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.items.length).toBeGreaterThan(0);
  });

  test('Single-player session lifecycle: start, validate and complete', async () => {
    // 1. Get random puzzle
    const puzzleRes = await request(app).get('/api/v1/puzzles/random?difficulty=easy');
    const puzzleId = puzzleRes.body.puzzle.puzzleId;

    // 2. Start game session
    const startRes = await request(app)
      .post('/api/v1/games/start')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ puzzleId, difficulty: 'easy' });
    expect(startRes.status).toBe(201);
    const sessionId = startRes.body.session.sessionId;

    // Retrieve internal solution from DB to simulate correct solve
    const puzzleDoc = await PuzzleModel.findOne({ puzzleId });
    expect(puzzleDoc).not.toBeNull();

    // 3. Complete game session with valid solution
    const completeRes = await request(app)
      .post(`/api/v1/games/${sessionId}/complete`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        submittedGrid: puzzleDoc?.solution,
        durationMs: 45000,
        hintsUsed: 0,
        mistakes: 0,
      });

    expect(completeRes.status).toBe(200);
    expect(completeRes.body.success).toBe(true);
    expect(completeRes.body.isCorrect).toBe(true);
    expect(completeRes.body.rewards.xpEarned).toBeGreaterThan(0);
    expect(completeRes.body.rewards.coinsEarned).toBeGreaterThan(0);
  });
});
