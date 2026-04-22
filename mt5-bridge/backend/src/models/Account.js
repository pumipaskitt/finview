const mongoose = require('mongoose');

const AccountSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  login:     { type: String, required: true, unique: true },
  password:  { type: String, required: true },   // เก็บแบบ encrypted
  server:    { type: String, required: true },
  status:    {
    type: String,
    enum: ['stopped', 'connecting', 'connected', 'error'],
    default: 'stopped'
  },
  errorMsg:  { type: String, default: '' },
  deployed:  { type: Boolean, default: false },

  // ข้อมูล account ล่าสุด
  info: {
    balance:    { type: Number, default: 0 },
    equity:     { type: Number, default: 0 },
    margin:     { type: Number, default: 0 },
    freeMargin: { type: Number, default: 0 },
    profit:     { type: Number, default: 0 },
    currency:   { type: String, default: '' },
    leverage:   { type: Number, default: 0 },
  },

  lastSync:  { type: Date },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Account', AccountSchema);
