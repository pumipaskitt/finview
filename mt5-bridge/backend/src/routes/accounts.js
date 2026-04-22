// Admin API — จัดการ accounts (ต้อง login + เป็น admin เท่านั้น)
const express  = require('express');
const router   = express.Router();
const Account  = require('../models/Account');
const Position = require('../models/Position');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// ทุก route ใน /api/accounts ต้องผ่าน auth + admin
router.use(requireAuth, requireAdmin);
const Trade    = require('../models/Trade');

// GET /api/accounts
router.get('/', async (req, res) => {
  const accounts = await Account.find().select('-password').sort({ createdAt: -1 });
  res.json(accounts);
});

// GET /api/accounts/:id
router.get('/:id', async (req, res) => {
  const acc = await Account.findById(req.params.id).select('-password');
  if (!acc) return res.status(404).json({ error: 'Not found' });
  res.json(acc);
});

// GET /api/accounts/:id/positions
router.get('/:id/positions', async (req, res) => {
  const positions = await Position.find({ accountId: req.params.id }).sort({ openTime: -1 });
  res.json(positions);
});

// GET /api/accounts/:id/trades
router.get('/:id/trades', async (req, res) => {
  const { limit = 50, symbol } = req.query;
  const filter = { accountId: req.params.id };
  if (symbol) filter.symbol = symbol.toUpperCase();
  const trades = await Trade.find(filter).sort({ time: -1 }).limit(+limit);
  res.json(trades);
});

// GET /api/accounts/:id/summary
router.get('/:id/summary', async (req, res) => {
  const result = await Trade.aggregate([
    { $match: { accountId: new (require('mongoose').Types.ObjectId)(req.params.id) } },
    { $group: {
        _id: null,
        totalProfit: { $sum: '$profit' },
        totalTrades: { $count: {} },
        winTrades:   { $sum: { $cond: [{ $gt: ['$profit', 0] }, 1, 0] } },
        lossTrades:  { $sum: { $cond: [{ $lt: ['$profit', 0] }, 1, 0] } }
    }}
  ]);
  res.json(result[0] || { totalProfit: 0, totalTrades: 0, winTrades: 0, lossTrades: 0 });
});

// POST /api/accounts — เพิ่ม account ใหม่
router.post('/', async (req, res) => {
  try {
    const { name, login, password, server } = req.body;
    if (!name || !login || !password || !server)
      return res.status(400).json({ error: 'name, login, password, server required' });

    const acc = await Account.create({ name, login, password, server });
    res.status(201).json({ ...acc.toObject(), password: undefined });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: 'Login already exists' });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/accounts/:id/deploy — set status = deployed
router.post('/:id/deploy', async (req, res) => {
  const acc = await Account.findByIdAndUpdate(
    req.params.id,
    { status: 'deployed' },
    { new: true }
  );
  if (!acc) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true, status: 'deployed' });
});

// POST /api/accounts/:id/undeploy — set status = stopped
router.post('/:id/undeploy', async (req, res) => {
  await Account.findByIdAndUpdate(req.params.id, { status: 'stopped' });
  res.json({ ok: true, status: 'stopped' });
});

// DELETE /api/accounts/:id
router.delete('/:id', async (req, res) => {
  // set stopped ก่อน ให้ controller บน Windows VPS หยุด worker เอง
  await Account.findByIdAndUpdate(req.params.id, { status: 'stopped' });
  await Account.findByIdAndDelete(req.params.id);
  await Position.deleteMany({ accountId: req.params.id });
  await Trade.deleteMany({ accountId: req.params.id });
  res.json({ ok: true });
});

module.exports = router;
