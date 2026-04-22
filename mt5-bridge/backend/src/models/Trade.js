const mongoose = require('mongoose');
const s = new mongoose.Schema({
  accountId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
  ticket:     { type: String, required: true },
  symbol:     String,
  type:       String,
  volume:     Number,
  price:      Number,
  profit:     Number,
  swap:       Number,
  commission: Number,
  time:       Date,
  createdAt:  { type: Date, default: Date.now }
});
s.index({ accountId: 1, ticket: 1 }, { unique: true });
module.exports = mongoose.model('Trade', s);
