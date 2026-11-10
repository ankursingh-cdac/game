import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { UserModel, PlayerProfileModel, PlayerInventoryModel } from '../../database/models';
import { generateToken, AuthenticatedRequest } from '../../common/middleware/auth';

const CUTE_NAMES = ['FluffyPaws', 'SpeedyWhiskers', 'CleverKitty', 'LuckyPanda', 'CozyLamb', 'BravePup', 'GentleColt', 'SweetCalf'];

function generateGuestName(): string {
  const prefix = CUTE_NAMES[Math.floor(Math.random() * CUTE_NAMES.length)];
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}_${suffix}`;
}

export class AuthController {
  public static async guestLogin(req: Request, res: Response): Promise<void> {
    try {
      const username = generateGuestName();
      const user = await UserModel.create({
        username,
        isGuest: true,
      });

      const profile = await PlayerProfileModel.create({
        userId: user._id,
        username,
        coins: 200,
      });

      await PlayerInventoryModel.create({
        userId: user._id.toString(),
      });

      const token = generateToken({
        userId: user._id.toString(),
        username: user.username,
        isGuest: true,
      });

      res.status(201).json({
        success: true,
        token,
        user: {
          id: user._id,
          username: user.username,
          isGuest: true,
        },
        profile,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  public static async register(req: Request, res: Response): Promise<void> {
    try {
      const { username, email, password } = req.body;

      if (!username || !email || !password) {
        res.status(400).json({ success: false, message: 'Username, email and password are required' });
        return;
      }

      const existingUser = await UserModel.findOne({
        $or: [{ username }, { email: email.toLowerCase() }],
      });

      if (existingUser) {
        res.status(409).json({ success: false, message: 'Username or email already in use' });
        return;
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const user = await UserModel.create({
        username,
        email: email.toLowerCase(),
        passwordHash,
        isGuest: false,
      });

      const profile = await PlayerProfileModel.create({
        userId: user._id,
        username,
        coins: 300,
      });

      await PlayerInventoryModel.create({
        userId: user._id.toString(),
      });

      const token = generateToken({
        userId: user._id.toString(),
        username: user.username,
        isGuest: false,
      });

      res.status(201).json({
        success: true,
        token,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          isGuest: false,
        },
        profile,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  public static async login(req: Request, res: Response): Promise<void> {
    try {
      const { emailOrUsername, password } = req.body;
      if (!emailOrUsername || !password) {
        res.status(400).json({ success: false, message: 'Credentials are required' });
        return;
      }

      const user = await UserModel.findOne({
        $or: [
          { email: emailOrUsername.toLowerCase() },
          { username: emailOrUsername },
        ],
      });

      if (!user || !user.passwordHash) {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
        return;
      }

      const isMatch = await bcrypt.compare(password, user.passwordHash);
      if (!isMatch) {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
        return;
      }

      const profile = await PlayerProfileModel.findOne({ userId: user._id });

      const token = generateToken({
        userId: user._id.toString(),
        username: user.username,
        isGuest: user.isGuest,
      });

      res.status(200).json({
        success: true,
        token,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          isGuest: user.isGuest,
        },
        profile,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  public static async getMe(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }

      const user = await UserModel.findById(req.user.userId);
      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }

      const profile = await PlayerProfileModel.findOne({ userId: user._id });
      const inventory = await PlayerInventoryModel.findOne({ userId: user._id.toString() });

      res.status(200).json({
        success: true,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          isGuest: user.isGuest,
        },
        profile,
        inventory,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
}
