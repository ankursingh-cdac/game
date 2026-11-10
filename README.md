# PAWDOKU 🐾
> **Tagline:** Think Smart. Play Cute. Win Fast!

A complete, production-ready full-stack mobile puzzle gaming application and backend inspired by the warm pastel aesthetic and cute animal theme. Combines casual single-player animal Sudoku puzzle solving with real-time competitive 1v1 multiplayer battles, private friend rooms, daily challenges, and player progression.

---

## 🎨 Visual Identity & Brand Direction

Pawdoku preserves the exact visual identity and cheerful cartoon charm of the provided reference design:

- **Warm Pastel Palette**:
  - Background Canvas: `#FFF0E4` (Warm Peach)
  - Rounded Cards: `#FFF8EF` with soft chocolate borders `#EEDCC8`
  - 6×6 Pastel Subgrid Blocks (2×3 each):
    - Block 0: `#F8A5C2` (Rose Pink)
    - Block 1: `#74B9FF` (Sky Blue)
    - Block 2: `#F5CD79` (Golden Peach)
    - Block 3: `#81ECEC` (Aqua Mint)
    - Block 4: `#FFEAA7` (Buttercup Yellow)
    - Block 5: `#55E6C1` (Fresh Meadow Green)
- **Original Animal Cast**:
  1. 🐱 **Cat**: Black & white smiling kitten with pink ears and sparkling green eyes.
  2. 🐑 **Sheep**: Fluffy white smiling lamb with rosy cheeks.
  3. 🐼 **Panda**: Chubby cheerful panda with dark eye patches.
  4. 🐶 **Dog**: Golden friendly puppy with floppy caramel ears and panting smile.
  5. 🐴 **Horse**: Chestnut brown pony with mane and white blaze.
  6. 🐮 **Cow**: Spotted dairy calf with soft pink snout and gentle horns.
- **3D Brand Logo**: Puffy golden "Pawdoku" letters, "Cat Sudoku" with side paws, and "Brain Puzzle" hot pink ribbon.
- **Navigation Cards**: Rounded cream cards with glossy icons for **SPIN WHEEL**, **SHOP**, **THEME**, and **1v1 BATTLE**.
- **Interactive Hints**: **HINT 1** (Sheep with glowing lightbulb, 10 Coins) and **HINT 2** (Elimination grid cross, 15 Coins).

---

## 🛠️ Technology Stack

### Mobile Application
- **Framework**: React Native with **Expo (SDK 51)**
- **Language**: TypeScript
- **Routing**: Expo Router (File-based navigation)
- **State Management**: Zustand
- **Networking**: Axios & TanStack Query
- **Real-Time Client**: Socket.IO Client
- **Graphics**: React Native SVG for crisp, scalable vector artwork on any screen density
- **Storage**: AsyncStorage for preferences, SecureStore for tokens
- **Animations**: React Native Animated & Reanimated

### Backend
- **Runtime**: Node.js & TypeScript
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM (configured for local MongoDB / MongoDB Compass and Docker Compose)
- **Real-time Server**: Socket.IO
- **Security**: JWT Authentication, bcrypt password hashing, and server-authoritative game validation
- **Testing**: Jest & Supertest

---

## 🚀 Quick Start & Local Development

### 1. Prerequisites
- Node.js 18+ (tested with Node 20)
- npm 10+
- MongoDB running locally (default: `mongodb://127.0.0.1:27017/pawdoku` or your MongoDB Compass instance)

### 2. Backend Setup
```bash
cd backend
npm install

# Verify with automated tests (15 unit and integration tests)
npm test

# Run backend development server
npm run dev
# Server will run at http://localhost:4000
```

### 3. Mobile App Setup
```bash
cd mobile
npm install

# Start Expo development server
npm start
# Press 'w' for Web, 'a' for Android emulator, or scan QR code with Expo Go on your physical phone!
```

---

## 🎮 Game Modes & Features

### 1. Single Player Mode
- Configurable difficulties: **Easy**, **Medium**, **Hard**, **Expert**.
- Backtracking generator verifies that each puzzle has **strictly 1 unique solution**.
- Interactive features: Undo, Erase, Notes/Pencil Mode, Hint 1 (cell reveal), Hint 2 (elimination guide).
- Victory celebration modal with solve time, XP gain, and coin rewards.

### 2. Real-Time 1v1 Multiplayer Battles
- Matchmaking finds opponents with similar Elo ratings.
- **Same-Puzzle Guarantee**: Both players receive the identical initial puzzle. The server *never* transmits the solution to the client during active matches!
- Synchronized 3-2-1 countdown.
- Live **Opponent Progress Bar**: Displays filled cell count (e.g. `18/36 🐾`) in real time without leaking cell positions.
- **Server-Authoritative Validation**: The server independently verifies the completed board and stamps the exact submission timestamp.
- Rating changes (e.g. +25 Elo for win, -20 Elo for loss).

### 3. Play with Friends (Private Rooms)
- Host creates a room with an auto-generated 6-character room code (e.g., `PAW842`).
- Friend joins by entering the code.
- Both click "READY" to trigger a synchronous countdown and start the match.

### 4. Daily Challenge
- One deterministic daily puzzle shared by all players worldwide.
- Streak tracking with fire emojis (`🔥 5 Day Streak`).
- Bonus rewards: +120 Coins & +180 XP. Anti-duplicate claim protection.

### 5. Spin Wheel
- 8-slice spinning wheel with smooth cubic easing.
- Free daily spin and 50 coins spin with server-validated reward odds.

### 6. Shop & Customization
- Unlock and equip board themes, avatar frames, and animal collections using virtual coins.

---

## 📡 REST API Reference

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/health` | Server health check | No |
| `POST` | `/api/v1/auth/guest` | Instant guest login | No |
| `POST` | `/api/v1/auth/register` | Register new user account | No |
| `POST` | `/api/v1/auth/login` | Login with username/email & password | No |
| `GET` | `/api/v1/auth/me` | Fetch authenticated profile & inventory | Yes |
| `GET` | `/api/v1/puzzles/random?difficulty=easy` | Get fresh puzzle without solution | No |
| `POST` | `/api/v1/puzzles/:id/hint` | Request Hint 1 or 2 with coin cost | Yes |
| `POST` | `/api/v1/games/start` | Start single-player game session | Yes |
| `POST` | `/api/v1/games/:id/complete` | Authoritatively submit & validate puzzle | Yes |
| `GET` | `/api/v1/leaderboard/global` | Top 50 global ranking by Elo rating | No |
| `GET` | `/api/v1/leaderboard/weekly` | Top 50 weekly ranking by wins | No |
| `GET` | `/api/v1/leaderboard/monthly` | Top 50 monthly ranking by XP | No |
| `GET` | `/api/v1/daily-challenge` | Today's challenge & user status | Yes |
| `POST` | `/api/v1/daily-challenge/complete` | Complete daily challenge | Yes |
| `GET` | `/api/v1/shop/items` | List available cosmetics | Yes |
| `POST` | `/api/v1/shop/purchase` | Buy cosmetic item with coins | Yes |
| `POST` | `/api/v1/shop/spin-wheel` | Spin wheel with server verification | Yes |

---

## 🔌 Socket.IO Event Reference

### Client -> Server
- `matchmaking:join` `{ difficulty: 'easy' | 'medium' | 'hard' }`
- `matchmaking:cancel`
- `room:create` `{ difficulty: 'medium' }`
- `room:join` `{ roomCode: string }`
- `room:ready` `{ roomCode: string }`
- `match:progress` `{ matchId: string, cellsFilled: number }`
- `match:submit` `{ matchId: string, submittedGrid: number[][] }`

### Server -> Client
- `matchmaking:searching` `{ status: 'searching' }`
- `matchmaking:found` `{ matchId, opponent, initialGrid, countdownSeconds: 3 }`
- `room:created` `{ roomCode, isHost: true }`
- `room:joined` `{ roomCode, isHost: false }`
- `room:player_joined` `{ guestId, username }`
- `room:status_update` `{ hostReady, guestReady }`
- `match:opponent_progress` `{ userId, cellsFilled }`
- `match:finished` `{ winnerId, winnerUsername, elapsedMs, ratingDelta: 25, solution }`
- `error` `{ message: string }`

---

## 📱 Mobile Build Instructions

### Android Build
1. **Local Preview / Emulator**:
   ```bash
   cd mobile
   npx expo run:android
   ```
2. **Production Android APK / AAB**:
   ```bash
   cd mobile
   # Install EAS CLI
   npm install -g eas-cli
   eas login
   eas build --platform android --profile production
   ```

### iOS Build
1. **Local Simulator**:
   ```bash
   cd mobile
   npx expo run:ios
   ```
2. **Production iOS IPA**:
   ```bash
   cd mobile
   eas build --platform ios --profile production
   ```

---

## 🐳 Docker Deployment

To launch the full backend stack with MongoDB:
```bash
docker-compose up --build -d
```
Logs:
```bash
docker-compose logs -f backend
```
Stop containers:
```bash
docker-compose down
```

---

## 🧪 Testing

Run backend unit and integration test suite:
```bash
cd backend
npm test
```
Tests cover:
- 6×6 Sudoku generator, 2×3 Latin square solver, uniqueness verifier.
- Health check, guest auth, profile fetching, hint serving.
- Single-player game lifecycle and reward calculation.
- **Critical Acceptance Test**: 2 players matched simultaneously, same puzzle distribution, fastest valid submission declared winner authoritatively.
