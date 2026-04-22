const express  = require('express');
const router   = express.Router();
const authMw   = require('../middleware/auth');
const Account  = require('../models/Account');
const Trade    = require('../models/Trade');

// GET /api/stats — ดึง stats ของ account ที่ผูกกับ user ที่ login
router.get('/', authMw, async (req, res) => {
  try {
    const accountId = req.user.accountId;
    const trades    = await Trade.find({ accountId }).sort({ time: 1 });

    if (!trades.length) {
      return res.json(buildEmptyStats());
    }

    // แปลง Trade → StatTrade format
    const statTrades = trades.map(t => ({
      ticketId:    t.ticket,
      symbol:      t.symbol,
      side:        t.type === 'buy' ? 'Buy' : 'Sell',
      lots:        t.volume,
      openTime:    t.time,
      closeTime:   t.time,
      openPrice:   t.price,
      closePrice:  t.price,
      profitUsd:   t.profit,
      strategyTag: '',
    }));

    // คำนวณ stats
    const totalPnL       = trades.reduce((s, t) => s + t.profit, 0);
    const winners        = trades.filter(t => t.profit > 0);
    const losers         = trades.filter(t => t.profit < 0);
    const grossProfit    = winners.reduce((s, t) => s + t.profit, 0);
    const grossLoss      = Math.abs(losers.reduce((s, t) => s + t.profit, 0));
    const tradeWinPct    = trades.length ? (winners.length / trades.length) * 100 : 0;
    const avgWin         = winners.length ? grossProfit / winners.length : 0;
    const avgLoss        = losers.length ? grossLoss / losers.length : 0;
    const profitFactor   = grossLoss ? grossProfit / grossLoss : 0;
    const totalLots      = trades.reduce((s, t) => s + (t.volume || 0), 0);

    // Daily breakdown
    const dailyMap = new Map();
    for (const t of trades) {
      const date = new Date(t.time).toISOString().slice(0, 10);
      const day  = dailyMap.get(date) || { date, pnl: 0, trades: 0 };
      day.pnl    += t.profit;
      day.trades += 1;
      dailyMap.set(date, day);
    }
    const daily = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    // Monthly breakdown
    const monthlyMap = new Map();
    for (const d of daily) {
      const month = d.date.slice(0, 7);
      const m     = monthlyMap.get(month) || { month, pnl: 0 };
      m.pnl       += d.pnl;
      monthlyMap.set(month, m);
    }
    const monthly = Array.from(monthlyMap.values()).sort((a, b) => a.month.localeCompare(b.month));

    // Best/worst day
    const sortedDays = [...daily].sort((a, b) => b.pnl - a.pnl);
    const bestDay    = sortedDays[0] || null;

    // Win day %
    const winDays   = daily.filter(d => d.pnl > 0).length;
    const dayWinPct = daily.length ? (winDays / daily.length) * 100 : 0;

    // Best day % of total profit
    const bestDayPct = totalPnL !== 0 && bestDay ? (bestDay.pnl / Math.abs(totalPnL)) * 100 : 0;

    res.json({
      summary: {
        totalPnL,
        monthlyPnL:               monthly,
        bestDayPercentOfTotalProfit: bestDayPct,
        tradeWinPercent:          tradeWinPct,
        dayWinPercent:            dayWinPct,
        avgWinLossRatio:          avgLoss ? avgWin / avgLoss : 0,
        profitFactor,
        avgWinningTrade:          avgWin,
        avgLosingTrade:           avgLoss,
        totalTrades:              trades.length,
        totalLots,
        avgTradesPerDay:          daily.length ? trades.length / daily.length : 0,
        activeDays:               daily.length,
        averageTradeDurationSec:  0,
        averageWinDurationSec:    0,
        averageLossDurationSec:   0,
      },
      highlights: {
        bestDay,
        grossProfit,
        grossLossAbs: grossLoss,
        winningTrades: winners.length,
        losingTrades:  losers.length,
      },
      breakdowns: { daily, monthly },
      trades: statTrades,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function buildEmptyStats() {
  return {
    summary: {
      totalPnL: 0, monthlyPnL: [], bestDayPercentOfTotalProfit: 0,
      tradeWinPercent: 0, dayWinPercent: 0, avgWinLossRatio: 0,
      profitFactor: 0, avgWinningTrade: 0, avgLosingTrade: 0,
      totalTrades: 0, totalLots: 0, avgTradesPerDay: 0,
      activeDays: 0, averageTradeDurationSec: 0,
      averageWinDurationSec: 0, averageLossDurationSec: 0,
    },
    highlights: { bestDay: null, grossProfit: 0, grossLossAbs: 0, winningTrades: 0, losingTrades: 0 },
    breakdowns: { daily: [], monthly: [] },
    trades: [],
  };
}

module.exports = router;
