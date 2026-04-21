export type DailyBreakdown = {
  date: string
  pnl: number
  trades: number
}

export type MonthlyBreakdown = {
  month: string
  pnl: number
}

export type StatTrade = {
  ticketId: string
  symbol: string
  side: 'Buy' | 'Sell' | string
  lots: number
  openTime: string
  closeTime: string
  openPrice: number
  closePrice: number
  profitUsd: number
  strategyTag: string
}

export type StatsResponse = {
  summary: {
    totalPnL: number
    monthlyPnL: MonthlyBreakdown[]
    bestDayPercentOfTotalProfit: number
    tradeWinPercent: number
    dayWinPercent: number
    avgWinLossRatio: number
    profitFactor: number
    avgWinningTrade: number
    avgLosingTrade: number
    totalTrades: number
    totalLots: number
    avgTradesPerDay: number
    activeDays: number
    averageTradeDurationSec: number
    averageWinDurationSec: number
    averageLossDurationSec: number
  }
  highlights: {
    bestDay: DailyBreakdown | null
    grossProfit: number
    grossLossAbs: number
    winningTrades: number
    losingTrades: number
  }
  breakdowns: {
    daily: DailyBreakdown[]
    monthly: MonthlyBreakdown[]
  }
  trades: StatTrade[]
}
