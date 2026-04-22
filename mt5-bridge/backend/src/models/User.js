const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  username:  { type: String, required: true, unique: true, trim: true },
  password:  { type: String, required: true },
  role:      { type: String, enum: ['admin', 'user'], default: 'user' },
  // accountId จำเป็นเฉพาะ role = 'user' (admin ไม่ต้องมี)
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', default: null },
  createdAt: { type: Date, default: Date.now },
  // ตั้งค่าว่าจะให้ friend เห็นอะไรได้บ้าง
  privacySettings: {
    showPnL:      { type: Boolean, default: true  },
    showWinRate:  { type: Boolean, default: true  },
    showChart:    { type: Boolean, default: true  },
    showTrades:   { type: Boolean, default: false },
    showBalance:  { type: Boolean, default: false },
  }
});

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

UserSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

module.exports = mongoose.model