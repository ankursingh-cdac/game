import { Response } from 'express';
import { ShopItemModel, PlayerInventoryModel, PlayerProfileModel } from '../../database/models';
import { AuthenticatedRequest } from '../../common/middleware/auth';

interface DefaultShopItem {
  itemId: string;
  name: string;
  description: string;
  category: 'theme' | 'avatar' | 'frame' | 'skin';
  priceCoins: number;
  previewColor?: string;
  iconName: string;
  isDefault: boolean;
}

const DEFAULT_SHOP_ITEMS: DefaultShopItem[] = [
  // Themes
  {
    itemId: 'theme_pastel_default',
    name: 'Cozy Pastel',
    description: 'The iconic warm peach & cream theme',
    category: 'theme',
    priceCoins: 0,
    previewColor: '#FFF0E4',
    iconName: 'palette',
    isDefault: true,
  },
  {
    itemId: 'theme_candy_land',
    name: 'Candy Land',
    description: 'Sweet bubblegum pink & mint hues',
    category: 'theme',
    priceCoins: 300,
    previewColor: '#FFB6C1',
    iconName: 'palette',
    isDefault: false,
  },
  {
    itemId: 'theme_night_sky',
    name: 'Starry Twilight',
    description: 'Soft twilight purple & starlight yellow',
    category: 'theme',
    priceCoins: 500,
    previewColor: '#6C5CE7',
    iconName: 'palette',
    isDefault: false,
  },
  // Frames
  {
    itemId: 'frame_wood_default',
    name: 'Natural Wood Tray',
    description: 'Classic handcrafted wooden puzzle border',
    category: 'frame',
    priceCoins: 0,
    previewColor: '#DEB887',
    iconName: 'square',
    isDefault: true,
  },
  {
    itemId: 'frame_gold_paw',
    name: 'Golden Paws',
    description: 'Shining 24k gold tray with embossed paws',
    category: 'frame',
    priceCoins: 600,
    previewColor: '#FFD700',
    iconName: 'crown',
    isDefault: false,
  },
  // Avatars
  {
    itemId: 'avatar_cat_default',
    name: 'Curious Kitty',
    description: 'The cheerful Pawdoku black & white kitten',
    category: 'avatar',
    priceCoins: 0,
    previewColor: '#F48FB1',
    iconName: 'cat',
    isDefault: true,
  },
  {
    itemId: 'avatar_sleepy_panda',
    name: 'Sleepy Panda',
    description: 'A cozy panda munching on bamboo',
    category: 'avatar',
    priceCoins: 250,
    previewColor: '#82C8ED',
    iconName: 'panda',
    isDefault: false,
  },
  {
    itemId: 'avatar_fluffy_sheep',
    name: 'Joyful Lamb',
    description: 'A fluffy little sheep with a bright idea',
    category: 'avatar',
    priceCoins: 250,
    previewColor: '#FFD66B',
    iconName: 'sheep',
    isDefault: false,
  },
  {
    itemId: 'avatar_golden_pup',
    name: 'Playful Pup',
    description: 'A golden pup ready for adventure',
    category: 'avatar',
    priceCoins: 350,
    previewColor: '#F5A04B',
    iconName: 'dog',
    isDefault: false,
  },
];

// Wheel slices: 8 segments
const SPIN_WHEEL_REWARDS = [
  { id: 1, label: '50 Coins', type: 'coins', amount: 50, color: '#FFD66B' },
  { id: 2, label: '100 Coins', type: 'coins', amount: 100, color: '#F48FB1' },
  { id: 3, label: '200 Coins', type: 'coins', amount: 200, color: '#82C8ED' },
  { id: 4, label: '75 XP', type: 'xp', amount: 75, color: '#A7D88A' },
  { id: 5, label: '150 XP', type: 'xp', amount: 150, color: '#F5A04B' },
  { id: 6, label: '300 Coins', type: 'coins', amount: 300, color: '#B69AE8' },
  { id: 7, label: 'Double Spin', type: 'coins', amount: 80, color: '#FF7675' },
  { id: 8, label: 'Jackpot 500!', type: 'coins', amount: 500, color: '#FDCB6E' },
];

export class ShopController {
  public static async getItems(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      let items = await ShopItemModel.find();
      if (items.length === 0) {
        // Seed default items
        items = await ShopItemModel.insertMany(DEFAULT_SHOP_ITEMS);
      }

      let userInventory = null;
      if (req.user) {
        userInventory = await PlayerInventoryModel.findOne({ userId: req.user.userId });
      }

      res.status(200).json({
        success: true,
        items,
        inventory: userInventory,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  public static async purchaseItem(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, message: 'Authentication required' });
        return;
      }

      const { itemId } = req.body;
      const item = await ShopItemModel.findOne({ itemId });
      if (!item) {
        res.status(404).json({ success: false, message: 'Item not found' });
        return;
      }

      let inventory = await PlayerInventoryModel.findOne({ userId });
      if (!inventory) {
        inventory = await PlayerInventoryModel.create({ userId });
      }

      if (inventory.ownedItemIds.includes(itemId)) {
        res.status(400).json({ success: false, message: 'You already own this item!' });
        return;
      }

      const profile = await PlayerProfileModel.findOne({ userId });
      if (!profile || profile.coins < item.priceCoins) {
        res.status(400).json({ success: false, message: 'Not enough coins!' });
        return;
      }

      // Deduct coins and add to inventory
      profile.coins -= item.priceCoins;
      await profile.save();

      inventory.ownedItemIds.push(itemId);
      await inventory.save();

      res.status(200).json({
        success: true,
        message: `Unlocked ${item.name}!`,
        remainingCoins: profile.coins,
        inventory,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  public static async equipItem(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, message: 'Authentication required' });
        return;
      }

      const { itemId, category } = req.body;
      const inventory = await PlayerInventoryModel.findOne({ userId });
      if (!inventory || !inventory.ownedItemIds.includes(itemId)) {
        res.status(400).json({ success: false, message: 'Item not owned' });
        return;
      }

      if (category === 'theme') inventory.equippedTheme = itemId;
      if (category === 'avatar') {
        inventory.equippedAvatar = itemId;
        await PlayerProfileModel.updateOne({ userId }, { avatar: itemId });
      }
      if (category === 'frame') inventory.equippedFrame = itemId;

      await inventory.save();
      res.status(200).json({ success: true, inventory });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }

  public static async spinWheel(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, message: 'Authentication required' });
        return;
      }

      const today = new Date().toISOString().split('T')[0];
      const inventory = await PlayerInventoryModel.findOne({ userId });
      const profile = await PlayerProfileModel.findOne({ userId });

      if (!profile) {
        res.status(404).json({ success: false, message: 'Player profile not found' });
        return;
      }

      const isFreeSpin = inventory?.lastSpinDate !== today;
      const SPIN_COST = 50;

      if (!isFreeSpin && profile.coins < SPIN_COST) {
        res.status(400).json({ success: false, message: `Free spin used today! Extra spin costs ${SPIN_COST} coins.` });
        return;
      }

      if (!isFreeSpin) {
        profile.coins -= SPIN_COST;
      }

      // Select random prize with weights
      const prizeIndex = Math.floor(Math.random() * SPIN_WHEEL_REWARDS.length);
      const prize = SPIN_WHEEL_REWARDS[prizeIndex];

      if (prize.type === 'coins') {
        profile.coins += prize.amount;
      } else if (prize.type === 'xp') {
        profile.xp += prize.amount;
        profile.level = Math.floor(Math.sqrt(profile.xp / 100)) + 1;
      }

      await profile.save();

      if (inventory) {
        inventory.lastSpinDate = today;
        await inventory.save();
      }

      res.status(200).json({
        success: true,
        prizeIndex,
        prize,
        totalCoins: profile.coins,
        totalXp: profile.xp,
        isFreeSpin,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
}
