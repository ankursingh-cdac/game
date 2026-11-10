import mongoose, { Schema, Document } from 'mongoose';
import { Difficulty, Grid6x6 } from '../../modules/puzzles/engine/sudoku6x6';

// --- User Model ---
export interface IUser extends Document {
  username: string;
  email?: string;
  passwordHash?: string;
  isGuest: boolean;
  avatar: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    username: { type: String, required: true, unique: true, trim: true },
    email: { type: String, sparse: true, trim: true, lowercase: true },
    passwordHash: { type: String },
    isGuest: { type: Boolean, default: false },
    avatar: { type: String, default: 'cat_avatar_default' },
  },
  { timestamps: true }
);

export const UserModel = mongoose.model<IUser>('User', UserSchema);

// --- PlayerProfile Model ---
export interface IPlayerProfile extends Document {
  userId: mongoose.Types.ObjectId;
  username: string;
  avatar: string;
  level: number;
  xp: number;
  coins: number;
  mmr: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  bestTimes: {
    easy?: number;
    medium?: number;
    hard?: number;
    expert?: number;
  };
  streakDays: number;
  lastDailyDate?: string;
  unlockedLevel?: number;
  createdAt: Date;
  updatedAt: Date;
}

const PlayerProfileSchema = new Schema<IPlayerProfile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    username: { type: String, required: true },
    avatar: { type: String, default: 'cat_avatar_default' },
    level: { type: Number, default: 1 },
    xp: { type: Number, default: 0 },
    coins: { type: Number, default: 200 }, // Starting balance for hints/spins
    mmr: { type: Number, default: 1000 },  // Elo rating starting at 1000
    matchesPlayed: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    winRate: { type: Number, default: 0 },
    bestTimes: {
      easy: { type: Number },
      medium: { type: Number },
      hard: { type: Number },
      expert: { type: Number },
    },
    streakDays: { type: Number, default: 0 },
    lastDailyDate: { type: String },
    unlockedLevel: { type: Number, default: 1 },
  },
  { timestamps: true }
);

PlayerProfileSchema.index({ mmr: -1 });
PlayerProfileSchema.index({ wins: -1 });
PlayerProfileSchema.index({ xp: -1 });

export const PlayerProfileModel = mongoose.model<IPlayerProfile>('PlayerProfile', PlayerProfileSchema);

// --- Puzzle Model ---
export interface IPuzzle extends Document {
  puzzleId: string;
  difficulty: Difficulty;
  regions: number[][];
  initialGrid: Grid6x6;
  solution: Grid6x6;
  cluesCount: number;
  verifiedUnique: boolean;
  createdAt: Date;
}

const PuzzleSchema = new Schema<IPuzzle>(
  {
    puzzleId: { type: String, required: true, unique: true },
    difficulty: { type: String, required: true }, // supports 'level1'..'level7', 'easy', 'medium', 'hard', etc.
    regions: { type: [[Number]], required: true },
    initialGrid: { type: [[Number]], required: true },
    solution: { type: [[Number]], required: true },
    cluesCount: { type: Number, required: true },
    verifiedUnique: { type: Boolean, default: true },
  },
  { timestamps: true }
);

PuzzleSchema.index({ difficulty: 1 });

export const PuzzleModel = mongoose.model<IPuzzle>('Puzzle', PuzzleSchema);

// --- Match Model ---
export interface IMatchSubmission {
  userId: string;
  submittedAt: Date;
  elapsedMs: number;
  isCorrect: boolean;
  cellsFilled: number;
}

export interface IMatch extends Document {
  matchId: string;
  mode: 'quick' | 'ranked' | 'room';
  difficulty: Difficulty;
  puzzleId: string;
  regions: number[][];
  initialGrid: Grid6x6;
  solution: Grid6x6;
  player1: {
    userId: string;
    username: string;
    avatar: string;
    mmr: number;
  };
  player2: {
    userId: string;
    username: string;
    avatar: string;
    mmr: number;
  };
  scheduledStart: Date;
  actualStart: Date;
  completedAt?: Date;
  status: 'waiting' | 'countdown' | 'in_progress' | 'completed' | 'cancelled' | 'abandoned';
  winnerId?: string;
  submissions: IMatchSubmission[];
  ratingDelta?: {
    player1: number;
    player2: number;
  };
  createdAt: Date;
}

const MatchSchema = new Schema<IMatch>(
  {
    matchId: { type: String, required: true, unique: true },
    mode: { type: String, required: true, enum: ['quick', 'ranked', 'room'] },
    difficulty: { type: String, required: true },
    puzzleId: { type: String, required: true },
    regions: { type: [[Number]], required: true },
    initialGrid: { type: [[Number]], required: true },
    solution: { type: [[Number]], required: true, select: false }, // Never select solution by default
    player1: {
      userId: { type: String, required: true },
      username: { type: String, required: true },
      avatar: { type: String, default: 'cat_avatar_default' },
      mmr: { type: Number, default: 1000 },
    },
    player2: {
      userId: { type: String, required: true },
      username: { type: String, required: true },
      avatar: { type: String, default: 'cat_avatar_default' },
      mmr: { type: Number, default: 1000 },
    },
    scheduledStart: { type: Date, required: true },
    actualStart: { type: Date, required: true },
    completedAt: { type: Date },
    status: {
      type: String,
      enum: ['waiting', 'countdown', 'in_progress', 'completed', 'cancelled', 'abandoned'],
      default: 'waiting',
    },
    winnerId: { type: String },
    submissions: [
      {
        userId: { type: String },
        submittedAt: { type: Date },
        elapsedMs: { type: Number },
        isCorrect: { type: Boolean },
        cellsFilled: { type: Number },
      },
    ],
    ratingDelta: {
      player1: { type: Number, default: 0 },
      player2: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

export const MatchModel = mongoose.model<IMatch>('Match', MatchSchema);

// --- GameSession Model (Single-Player) ---
export interface IGameSession extends Document {
  sessionId: string;
  userId: string;
  puzzleId: string;
  difficulty: Difficulty;
  hintsUsed: number;
  mistakes: number;
  durationMs: number;
  isCompleted: boolean;
  score: number;
  xpEarned: number;
  coinsEarned: number;
  completedAt?: Date;
  createdAt: Date;
}

const GameSessionSchema = new Schema<IGameSession>(
  {
    sessionId: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    puzzleId: { type: String, required: true },
    difficulty: { type: String, required: true },
    hintsUsed: { type: Number, default: 0 },
    mistakes: { type: Number, default: 0 },
    durationMs: { type: Number, default: 0 },
    isCompleted: { type: Boolean, default: false },
    score: { type: Number, default: 0 },
    xpEarned: { type: Number, default: 0 },
    coinsEarned: { type: Number, default: 0 },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

export const GameSessionModel = mongoose.model<IGameSession>('GameSession', GameSessionSchema);

// --- PrivateRoom Model ---
export interface IPrivateRoom extends Document {
  roomCode: string;
  hostId: string;
  guestId?: string;
  hostReady: boolean;
  guestReady: boolean;
  difficulty: Difficulty;
  matchId?: string;
  status: 'open' | 'starting' | 'active' | 'closed';
  createdAt: Date;
}

const PrivateRoomSchema = new Schema<IPrivateRoom>(
  {
    roomCode: { type: String, required: true, unique: true },
    hostId: { type: String, required: true },
    guestId: { type: String },
    hostReady: { type: Boolean, default: false },
    guestReady: { type: Boolean, default: false },
    difficulty: { type: String, default: 'medium' },
    matchId: { type: String },
    status: { type: String, enum: ['open', 'starting', 'active', 'closed'], default: 'open' },
  },
  { timestamps: true }
);

PrivateRoomSchema.index({ createdAt: 1 }, { expireAfterSeconds: 3600 }); // Expire after 1 hr

export const PrivateRoomModel = mongoose.model<IPrivateRoom>('PrivateRoom', PrivateRoomSchema);

// --- DailyChallenge Model ---
export interface IDailyChallenge extends Document {
  dateString: string; // YYYY-MM-DD
  puzzleId: string;
  difficulty: Difficulty;
  rewardCoins: number;
  rewardXp: number;
}

const DailyChallengeSchema = new Schema<IDailyChallenge>(
  {
    dateString: { type: String, required: true, unique: true },
    puzzleId: { type: String, required: true },
    difficulty: { type: String, default: 'medium' },
    rewardCoins: { type: Number, default: 100 },
    rewardXp: { type: Number, default: 150 },
  },
  { timestamps: true }
);

export const DailyChallengeModel = mongoose.model<IDailyChallenge>('DailyChallenge', DailyChallengeSchema);

// --- DailyChallengeCompletion Model ---
export interface IDailyChallengeCompletion extends Document {
  userId: string;
  dateString: string;
  durationMs: number;
  completedAt: Date;
}

const DailyChallengeCompletionSchema = new Schema<IDailyChallengeCompletion>(
  {
    userId: { type: String, required: true },
    dateString: { type: String, required: true },
    durationMs: { type: Number, required: true },
    completedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

DailyChallengeCompletionSchema.index({ userId: 1, dateString: 1 }, { unique: true });

export const DailyChallengeCompletionModel = mongoose.model<IDailyChallengeCompletion>(
  'DailyChallengeCompletion',
  DailyChallengeCompletionSchema
);

// --- ShopItem & PlayerInventory Models ---
export interface IShopItem extends Document {
  itemId: string;
  name: string;
  description: string;
  category: 'theme' | 'avatar' | 'frame' | 'skin';
  priceCoins: number;
  previewColor?: string;
  iconName: string;
  isDefault: boolean;
}

const ShopItemSchema = new Schema<IShopItem>(
  {
    itemId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String },
    category: { type: String, enum: ['theme', 'avatar', 'frame', 'skin'], required: true },
    priceCoins: { type: Number, default: 100 },
    previewColor: { type: String },
    iconName: { type: String, default: 'paw' },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const ShopItemModel = mongoose.model<IShopItem>('ShopItem', ShopItemSchema);

export interface IPlayerInventory extends Document {
  userId: string;
  ownedItemIds: string[];
  equippedTheme: string;
  equippedAvatar: string;
  equippedFrame: string;
  lastSpinDate?: string;
}

const PlayerInventorySchema = new Schema<IPlayerInventory>(
  {
    userId: { type: String, required: true, unique: true },
    ownedItemIds: { type: [String], default: ['theme_pastel_default', 'avatar_cat_default'] },
    equippedTheme: { type: String, default: 'theme_pastel_default' },
    equippedAvatar: { type: String, default: 'avatar_cat_default' },
    equippedFrame: { type: String, default: 'frame_wood_default' },
    lastSpinDate: { type: String },
  },
  { timestamps: true }
);

export const PlayerInventoryModel = mongoose.model<IPlayerInventory>('PlayerInventory', PlayerInventorySchema);
