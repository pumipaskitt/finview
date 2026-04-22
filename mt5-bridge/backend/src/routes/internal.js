// Internal routes — รับข้อมูลจาก Python worker
const express  = require('express');
const router   = express.Router();
const Account  = require('../models/Account');
const Position = require('../models/Position');
const Trade    = require('../models/Trade');
const { broadcast } = require('../services/wsServer');

// Middleware ตรวจ secret key
const auth = (req, res, next) => {
  if (req.body.secretKey !== process.env.SECRET_KEY)
    return res.status(401).json({ error: 'Unauthorized' });
  next();
};

// POST /internal/sync — รับข้อมูลจาก worker
router.post('/sync', auth, async (req, res) => {
  const { accountId, account, positions, history } = req.body;

  try {
    // 1. Update account info
    const updatedAcc = await Account.findByIdAndUpdate(
      accountId,
      {
        status:   'connected',
        errorMsg: '',
        lastSync: new Date(),
        info: {
          balance:    account.balance,
          equity:     account.equity,
          margin:     account.margin,
          freeMargin: account.freeMargin,
          profit:     account.profit,
          currency:   account.currency,
          leverage:   account.leverage,
        }
      },
      { new: true }
    );

    // 2. Sync positions
    if (positions.length > 0 || true) {
      const openTickets = positions.map(p => p.ticket);
      await Position.deleteMany({ accountId, ticket: { $nin: openTickets } });

      for (const p of positions) {
        await Position.findOneAndUpdate(
          { accountId, ticket: p.ticket },
          {
            accountId,
            ...p,
            openTime:  new Date(p.openTime * 1000),
            updatedAt: new Date()
          },
          { upsert: true }
        );
      }
    }

    // 3. Sync history (upsert only)
    for (const t of history) {
      await Trade.findOneAndUpdate(
        { accountId, ticket: t.ticket },
        { accountId, ...t, time: new Date(t.time * 1000) },
        { upsert: true }
      );
    }

    // 4. Broadcast real-time ไปหา frontend
    // broadcast account_update สำหรับ admin
    broadcast('account_update', {
      accountId,
      info:      updatedAcc?.info,
      positions: await Position.find({ accountId }),
    });

    // broadcast new_trade เพื่อให้ dashboard reload stats
    if (history.length > 0) {
      const latest = history[history.length - 1];
      broadcast('new_trade', {
        ticketId:   latest.ticket,
        symbol:     latest.symbol,
        side:       latest.type === 'buy' ? 'Buy' : 'Sell',
        lots:       latest.volume,
        openTime:   new Date(latest.time * 1000),
        closeTime:  new Date(latest.time * 1000),
        openPrice:  latest.price,
        closePrice: latest.price,
        profitUsd:  latest.profit,
        strategyTag: '',
      });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Sync error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /internal/status — รับ status จาก worker
router.post('/status', auth, async (req, res) => {
  const { accountId, status, error } = req.body;
  await Account.findByIdAndUpdate(accountId, {
    status:   status,
    errorMsg: error || ''
  });
  broadcast('status_update', { accountId, status, error });
  res.json({ ok: true });
});

// GET /internal/accounts — ให้ Windows controller ดึง deployed accounts พร้อม password
router.get('/accounts', (req, res, next) => {
  if (req.query.secretKey !== process.env.SECRET_KEY)
    return res.status(401).json({ error: 'Unauthorized' });
  next();
}, async (req, res) => {
  const accounts = await Account.find({ status: { $in: ['deployed', 'connected', 'connecting', 'error'] } });
  res.json(accounts);
});

module.exports = router;
