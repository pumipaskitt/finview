const express    = require('express');
const router     = express.Router();
const { requireAuth } = require('../middleware/auth');
const Friendship = require('../models/Friendship');
const User       = require('../models/User');
const Account    = require('../models/Account');
const Trade      = require('../models/Trade');

// ทุก route ต้อง login
router.use(requireAuth);

// ─── Search users ───────────────────────────────────────────
// GET /api/friends/search?q=username
router.get('/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json([]);

    const users = await User.find({
      username: { $regex: q, $options: 'i' },
      _id:      { $ne: req.user._id },         // ไม่รวมตัวเอง
      role:     'user',
    }).select('username _id').limit(10);

    // เอา friendship status มาด้วย
    const myId = req.user._id.toString();
    const ids  = users.map(u => u._id);
    const friendships = await Friendship.find({
      $or: [
        { requester: myId, recipient: { $in: ids } },
        { requester: { $in: ids }, recipient: myId },
      ]
    });

    const result = users.map(u => {
      const uid = u._id.toString();
      const fs = friendships.find(f =>
        f.requester?.toString() === uid ||
        f.recipient?.toString() === uid
      );
      return {
        _id:      u._id,
        username: u.username,
        friendshipStatus: fs?.status ?? null,
        friendshipId:     fs?._id ?? null,
        iSentRequest: fs?.requester?.toString() === myId,
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ส่ง friend request ──────────────────────────────────────
// POST /api/friends/request/:userId
router.post('/request/:userId', async (req, res) => {
  try {
    const to = req.params.userId;
    if (to === req.user._id.toString()) {
      return res.status(400).json({ error: 'Cannot add yourself' });
    }
    const target = await User.findById(to);
    if (!target) return res.status(404).json({ error: 'User not found' });

    // ตรวจว่ามีอยู่แล้วไหม
    const exists = await Friendship.findOne({
      $or: [
        { requester: req.user._id, recipient: to },
        { requester: to, recipient: req.user._id },
      ]
    });
    if (exists) return res.status(400).json({ error: 'Request already exists' });

    const fs = await Friendship.create({ requester: req.user._id, recipient: to });
    res.json({ message: 'Request sent', friendshipId: fs._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Accept ──────────────────────────────────────────────────
// POST /api/friends/accept/:id
router.post('/accept/:id', async (req, res) => {
  try {
    const fs = await Friendship.findById(req.params.id);
    if (!fs) return res.status(404).json({ error: 'Not found' });
    if (fs.recipient.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not your request' });
    }
    fs.status = 'accepted';
    await fs.save();
    res.json({ message: 'Accepted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Reject / Cancel / Remove ────────────────────────────────
// DELETE /api/friends/:id
router.delete('/:id', async (req, res) => {
  try {
    const fs = await Friendship.findById(req.params.id);
    if (!fs) return res.status(404).json({ error: 'Not found' });

    const myId = req.user._id.toString();
    if (fs.requester.toString() !== myId && fs.recipient.toString() !== myId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await fs.deleteOne();
    res.json({ message: 'Removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── รายชื่อ friends ─────────────────────────────────────────
// GET /api/friends
router.get('/', async (req, res) => {
  try {
    const myId = req.user._id;
    const friendships = await Friendship.find({
      $or: [{ requester: myId }, { recipient: myId }],
      status: 'accepted',
    });

    const friendIds = friendships.map(f =>
      f.requester.toString() === myId.toString() ? f.recipient : f.requester
    );
    const users = await User.find({ _id: { $in: friendIds } }).select('username _id');

    const result = friendships.map(f => {
      const friendId = f.requester.toString() === myId.toString() ? f.recipient : f.requester;
      const user = users.find(u => u._id.toString() === friendId.toString());
      return { friendshipId: f._id, userId: friendId, username: user?.username ?? '?' };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── pending requests (incoming) ─────────────────────────────
// GET /api/friends/pending
router.get('/pending', async (req, res) => {
  try {
    const myId = req.user._id;
    const incoming = await Friendship.find({ recipient: myId, status: 'pending' })
      .populate('requester', 'username');
    const outgoing = await Friendship.find({ requester: myId, status: 'pending' })
      .populate('recipient', 'username');

    res.json({
      incoming: incoming.map(f => ({
        friendshipId: f._id,
        userId:   f.requester._id,
        username: f.requester.username,
      })),
      outgoing: outgoing.map(f => ({
        friendshipId: f._id,
        userId:   f.recipient._id,
        username: f.recipient.username,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Privacy settings ────────────────────────────────────────
// GET /api/friends/privacy
router.get('/privacy', async (req, res) => {
  const user = await User.findById(req.user._id).select('privacySettings');
  res.json(user?.privacySettings ?? {});
});

// PUT /api/friends/privacy
router.put('/privacy', async (req, res) => {
  const allowed = ['showPnL', 'showWinRate', 'showChart', 'showTrades', 'showBalance'];
  const update  = {};
  for (const key of allowed) {
    if (typeof req.body[key] === 'boolean') {
      update[`privacySettings.${key}`] = req.body[key];
    }
  }
  await User.findByIdAndUpdate(req.user._id, { $set: update });
  res.json({ message: 'Saved' });
});

// ─── ดู stats ของ friend ──────────────────────────────────────
// GET /api/friends/:userId/stats
router.get('/:userId/stats', async (req, res) => {
  try {
    const myId   = req.user._id.toString();
    const target = req.params.userId;

    // ต้องเป็น friend ก่อนถึงจะดูได้
    const fs = await Friendship.findOne({
      $or: [
        { requester: myId, recipient: target },
        { requester: target, recipient: myId },
      ],
      status: 'accepted',
    });
    if (!fs) return res.status(403).json({ error: 'Not friends' });

    const targetUser = await User.findById(target).select('username privacySettings accountId');
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    const privacy = targetUser.privacySettings ?? {};
    const accountId = targetUser.accountId;

    const trades = accountId
      ? await Trade.find({ accountId }).sort({ time: 1 })
      : [];

    // คำนวณ stats (เหมือน stats.js)
    const totalPnL    = trades.reduce((s, t) => s + t.profit, 0);
    const winners     = trades.filter(t => t.profit > 0);
    const losers      = trades.filter(t => t.profit < 0);
    const grossProfit = winners.reduce((s, t) => s + t.profit, 0);
    const grossLoss   = Math.abs(losers.reduce((s, t) => s + t.profit, 0));
    const tradeWinPct = trades.length ? (winners.length / trades.length) * 100 : 0;
    const avgWin      = winners.length ? grossProfit / winners.length : 0;
    const avgLoss     = losers.length ? grossLoss / losers.length : 0;
    const totalLots   = trades.reduce((s, t) => s + (t.volume || 0), 0);

    const dailyMap = new Map();
    for (const t of trades) {
      const date = new Date(t.time).toISOString().slice(0, 10);
      const day  = dailyMap.get(date) || { date, pnl: 0, trades: 0 };
      day.pnl += t.profit; day.trades += 1;
      dailyMap.set(date, day);
    }
    const daily = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    const monthlyMap = new Map();
    for (const d of daily) {
      const month = d.date.slice(0, 7);
      const m = monthlyMap.get(month) || { month, pnl: 0 };
      m.pnl += d.pnl; monthlyMap.set(month, m);
    }
    const monthly  = Array.from(monthlyMap.values()).sort((a, b) => a.month.localeCompare(b.month));
    const winDays  = daily.filter(d => d.pnl > 0).length;
    const dayWinPct = daily.length ? (winDays / daily.length) * 100 : 0;
    const bestDay  = [...daily].sort((a, b) => b.pnl - a.pnl)[0] ?? null;
    const bestDayPct = totalPnL !== 0 && bestDay ? (bestDay.pnl / Math.abs(totalPnL)) * 100 : 0;

    // ใช้ privacy filter กรองข้อมูล
    const statTrades = (privacy.showTrades ?? false)
      ? trades.map(t => ({
          ticketId: t.ticket, symbol: t.symbol,
          side: t.type === 'buy' ? 'Buy' : 'Sell',
          lots: t.volume, openTime: t.time, closeTime: t.time,
          openPrice: t.price, closePrice: t.price,
          profitUsd: t.profit, strategyTag: '',
        }))
      : [];

    res.json({
      username: targetUser.username,
      privacy,
      summary: {
        totalPnL:                   privacy.showPnL     ? totalPnL    : null,
        tradeWinPercent:            privacy.showWinRate ? tradeWinPct : null,
        dayWinPercent:              privacy.showWinRate ? dayWinPct   : null,
        avgWinLossRatio:            privacy.showWinRate ? (avgLoss ? avgWin / avgLoss : 0) : null,
        profitFactor:               privacy.showWinRate ? (grossLoss ? grossProfit / grossLoss : 0) : null,
        avgWinningTrade:            privacy.showWinRate ? avgWin      : null,
        avgLosingTrade:             privacy.showWinRate ? avgLoss     : null,
        totalTrades:                trades.length,
        totalLots,
        bestDayPercentOfTotalProfit: privacy.showPnL   ? bestDayPct  : null,
        avgTradesPerDay:            daily.length ? trades.length / daily.length : 0,
        activeDays:                 daily.length,
        averageTradeDurationSec:    0,
        averageWinDurationSec:      0,
        averageLossDurationSec:     0,
        monthlyPnL:                 privacy.showPnL ? monthly : []      },
      breakdowns: {
        daily:   privacy.showChart ? daily   : [],
        monthly: privacy.showPnL   ? monthly : [],
      },
      trades: statTrades,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
