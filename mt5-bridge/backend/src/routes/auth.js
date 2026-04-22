const express = require('express');
const jwt     = require('jsonwebtoken');
const router  = express.Router();
const User    = require('../models/User');
const Account = require('../models/Account');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// ── POST /auth/setup-admin ────────────────────────────────────────────────────
// ใช้สร้าง admin user ครั้งแรก — ใช้ได้เฉพาะตอนยังไม่มี admin ในระบบ
router.post('/setup-admin', async (req, res) => {
  try {
    const existing = await User.findOne({ role: 'admin' });
    if (existing)
      return res.status(403).json({ error: 'Admin already exists' });

    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'username and password required' });

    const admin = await User.create({ username, password, role: 'admin' });
    res.status(201).json({ ok: true, username: admin.username, role: admin.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /auth/login ──────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ error: 'Invalid username or password' });

    const token = jwt.sign(
      { userId: user._id, accountId: user.accountId, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      username:  user.username,
      role:      user.role,
      accountId: user.accountId,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /auth/register — Admin สร้าง user ให้ลูกค้า ─────────────────────────
router.post('/register', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { username, password, accountId } = req.body;
    if (!username || !password || !accountId)
      return res.status(400).json({ error: 'username, password, accountId required' });

    const account = await Account.findById(accountId);
    if (!account) return res.status(404).json({ error: 'Account not found' });

    const user = await User.create({ username, password, role: 'user', accountId });
    res.status(201).json({ id: user._id, username: user.username, role: user.role });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: 'Username already exists' });
    res.status(500).json({ error: err.message });
  }
});

// ── GET /auth/users — Admin ดู users ทั้งหมด ─────────────────────────────────
router.get('/users', requireAuth, requireAdmin, async (req, res) => {
  const users = await User.find().select('-password')
    .populate('accountId', 'name login server');
  res.json(users);
});

// ── DELETE /auth/users/:id — Admin ลบ user ───────────────────────────────────
router.delete('/users/:id', requireAuth, requireAdmin, async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
