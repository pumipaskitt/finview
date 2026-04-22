import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, signal } from '@angular/core'

import { DailyBreakdown, StatTrade } from './models/stats'
import { DashboardStore } from './stores/dashboard.store'
import { AuthService } from './auth/auth.service'
import { FriendPanelComponent } from './friends/friend-panel.component'
import { FriendStatsComponent } from './friends/friend-stats.component'
import { FriendshipService, Friend } from './friends/friendship.service'

type DurationBucket = {
  label: string
  count: number
  wins: number
  losses: number
  winRate: number
}

type CalendarCell = {
  date: Date | null
  key: string | null
  pnl: number
  trades: number
  isCurrentMonth: boolean
  isToday: boolean
}

type DayCard = DailyBreakdown & {
  weekday: string
}

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, FriendPanelComponent, FriendStatsComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent {
  protected readonly store    = inject(DashboardStore)
  protected readonly auth     = inject(AuthService)
  protected readonly friendSvc = inject(FriendshipService)
  protected readonly username = this.auth.getUsername()

  // Friends feature
  protected readonly showFriendPanel = signal(false)
  protected readonly selectedFriend  = signal<Friend | null>(null)
  protected readonly pendingCount    = signal(0)

  logout() { this.auth.logout() }

  openFriendStats(friend: Friend) {
    this.showFriendPanel.set(false)
    this.selectedFriend.set(friend)
  }
  protected readonly summary = this.store.summary
  protected readonly highlights = this.store.highlights
  protected readonly liveTrades = this.store.liveTrades
  protected readonly dailyBreakdown = this.store.dailyBreakdown
  protected readonly loading = this.store.loading
  protected readonly stats = this.store.stats
  protected readonly trades = computed(() => this.stats()?.trades ?? [])
  protected readonly calendarMonth = signal<string | null>(null)

  protected readonly monthlyBreakdown = computed(
    () => this.stats()?.breakdowns.monthly ?? [],
  )

  protected readonly latestMonthKey = computed(() => {
    const monthly = this.monthlyBreakdown()
    return monthly.length ? monthly[monthly.length - 1].month : this.monthKey(new Date())
  })

  protected readonly activeMonthKey = computed(
    () => this.calendarMonth() ?? this.latestMonthKey(),
  )

  protected readonly activeMonthPnl = computed(() => {
    const month = this.monthlyBreakdown().find(
      (item) => item.month === this.activeMonthKey(),
    )
    return month?.pnl ?? 0
  })

  protected readonly dailyCards = computed(() =>
    this.dailyBreakdown().map((day) => ({
      ...day,
      weekday: new Date(day.date).toLocaleDateString('en-US', {
        weekday: 'long',
        timeZone: 'UTC',
      }),
    })),
  )

  protected readonly mostActiveDay = computed(() =>
    this.pickDay(this.dailyCards(), (left, right) => right.trades - left.trades),
  )

  protected readonly mostProfitableDay = computed(() =>
    this.pickDay(this.dailyCards(), (left, right) => right.pnl - left.pnl),
  )

  protected readonly leastProfitableDay = computed(() =>
    this.pickDay(this.dailyCards(), (left, right) => left.pnl - right.pnl),
  )

  protected readonly bestTrade = computed(() =>
    this.pickTrade(this.trades(), (left, right) => right.profitUsd - left.profitUsd),
  )

  protected readonly worstTrade = computed(() =>
    this.pickTrade(this.trades(), (left, right) => left.profitUsd - right.profitUsd),
  )

  protected readonly buyCount = computed(
    () => this.trades().filter((trade) => trade.side === 'Buy').length,
  )

  protected readonly sellCount = computed(
    () => this.trades().filter((trade) => trade.side === 'Sell').length,
  )

  protected readonly directionPercent = computed(() => {
    const total = this.summary()?.totalTrades ?? 0
    if (!total) {
      return 0
    }

    return Number((((this.buyCount() || this.sellCount()) / total) * 100).toFixed(2))
  })

  protected readonly durationBuckets = computed<DurationBucket[]>(() => {
    const buckets = [
      { label: 'Under 15 sec', min: 0, max: 15 },
      { label: '15-45 sec', min: 15, max: 45 },
      { label: '45 sec - 1 min', min: 45, max: 60 },
      { label: '1 min - 2 min', min: 60, max: 120 },
      { label: '2 min - 5 min', min: 120, max: 300 },
      { label: '5 min - 10 min', min: 300, max: 600 },
      { label: '10 min - 30 min', min: 600, max: 1800 },
      { label: '30 min - 1 hour', min: 1800, max: 3600 },
      { label: '1 hour - 2 hours', min: 3600, max: 7200 },
      { label: '2 hours - 4 hours', min: 7200, max: 14400 },
      { label: '4 hours and up', min: 14400, max: Number.POSITIVE_INFINITY },
    ]

    return buckets.map((bucket) => {
      const trades = this.trades().filter((trade) => {
        const duration = this.durationSeconds(trade)
        return duration >= bucket.min && duration < bucket.max
      })

      const wins = trades.filter((trade) => trade.profitUsd > 0).length
      const losses = trades.filter((trade) => trade.profitUsd < 0).length
      const count = trades.length

      return {
        label: bucket.label,
        count,
        wins,
        losses,
        winRate: count ? Number(((wins / count) * 100).toFixed(2)) : 0,
      }
    })
  })

  protected readonly calendarWeeks = computed(() =>
    this.buildCalendar(this.activeMonthKey(), this.dailyBreakdown()),
  )

  protected readonly equitySeries = computed(() => {
    const trades = [...this.trades()].sort(
      (left, right) =>
        new Date(left.closeTime).getTime() - new Date(right.closeTime).getTime(),
    )

    let cumulative = 0
    return trades.map((trade, index) => {
      cumulative += trade.profitUsd
      return {
        x: index,
        date: trade.closeTime,
        value: Number(cumulative.toFixed(2)),
      }
    })
  })

  protected readonly equitySvgLine = computed(() => this.buildEquityLine())
  protected readonly equitySvgArea = computed(() => this.buildEquityArea())
  protected readonly maxLossSvgLine = computed(() => this.buildMaxLossLine())

  constructor() {
    this.store.initialize()

    effect(() => {
      const month = this.latestMonthKey()
      if (!this.calendarMonth() && month) {
        this.calendarMonth.set(month)
      }
    })

    // โหลด pending count สำหรับ badge บนปุ่ม Friends
    this.friendSvc.listPending().subscribe(p => {
      this.pendingCount.set(p.incoming.length)
    })
  }

  protected trackByLabel(_index: number, item: DurationBucket) {
    return item.label
  }

  protected trackByWeek(_index: number, week: CalendarCell[]) {
    return week.map((item) => item.key ?? 'x').join('|')
  }

  protected trackByCell(_index: number, item: CalendarCell) {
    return item.key ?? `empty-${_index}`
  }

  protected formatMoney(value: number) {
    return `$${Math.abs(value).toFixed(2)}`
  }

  protected formatSignedMoney(value: number) {
    return `${value < 0 ? '-' : ''}$${Math.abs(value).toFixed(2)}`
  }

  protected formatDuration(totalSeconds: number) {
    const seconds = Math.max(0, Math.round(totalSeconds))
    const minutes = Math.floor(seconds / 60)
    const remainder = seconds % 60
    const hours = Math.floor(minutes / 60)
    const minutePart = minutes % 60

    if (hours > 0) {
      return `${hours} hr ${minutePart} min`
    }

    return `${minutes} min ${remainder} sec`
  }

  protected gaugeStyle(value: number, max = 100) {
    const ratio = Math.max(0, Math.min(1, max === 0 ? 0 : value / max))
    const angle = 180 * ratio
    return { '--angle': `${angle}deg` }
  }

  protected donutStyle() {
    const buy = this.buyCount()
    const sell = this.sellCount()
    const total = buy + sell
    const buyAngle = total ? (buy / total) * 360 : 0
    return {
      '--buy-angle': `${buyAngle}deg`,
    }
  }

  protected bucketBarWidth(value: number, max: number) {
    const width = max ? (value / max) * 100 : 0
    return `${Math.max(width, value > 0 ? 3 : 0)}%`
  }

  protected stackedBarHeight(value: number, max: number) {
    const height = max ? (value / max) * 100 : 0
    return `${Math.max(height, value > 0 ? 4 : 0)}%`
  }

  protected prevMonth() {
    this.calendarMonth.set(this.shiftMonth(this.activeMonthKey(), -1))
  }

  protected nextMonth() {
    this.calendarMonth.set(this.shiftMonth(this.activeMonthKey(), 1))
  }

  protected resetMonth() {
    this.calendarMonth.set(this.latestMonthKey())
  }

  protected monthLabel(monthKey: string) {
    const [year, month] = monthKey.split('-').map(Number)
    return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    })
  }

  protected weekTotal(week: CalendarCell[]) {
    return Number(
      week.reduce((sum, cell) => sum + (cell.date ? cell.pnl : 0), 0).toFixed(2),
    )
  }

  protected weekTrades(week: CalendarCell[]) {
    return week.reduce((sum, cell) => sum + (cell.date ? cell.trades : 0), 0)
  }

  protected circleMetricValue(value: number) {
    return Math.max(0, Math.min(100, value))
  }

  private pickDay(days: DayCard[], compare: (a: DayCard, b: DayCard) => number) {
    return days.length ? [...days].sort(compare)[0] : null
  }

  private pickTrade(
    trades: StatTrade[],
    compare: (a: StatTrade, b: StatTrade) => number,
  ) {
    return trades.length ? [...trades].sort(compare)[0] : null
  }

  private durationSeconds(trade: StatTrade) {
    return Math.max(
      0,
      Math.round(
        (new Date(trade.closeTime).getTime() - new Date(trade.openTime).getTime()) / 1000,
      ),
    )
  }

  private monthKey(date: Date) {
    const year = date.getUTCFullYear()
    const month = `${date.getUTCMonth() + 1}`.padStart(2, '0')
    return `${year}-${month}`
  }

  private shiftMonth(monthKey: string, offset: number) {
    const [year, month] = monthKey.split('-').map(Number)
    const shifted = new Date(Date.UTC(year, month - 1 + offset, 1))
    return this.monthKey(shifted)
  }

  private buildCalendar(monthKey: string, daily: DailyBreakdown[]) {
    const [year, month] = monthKey.split('-').map(Number)
    const firstDay = new Date(Date.UTC(year, month - 1, 1))
    const startOffset = firstDay.getUTCDay()
    const gridStart = new Date(Date.UTC(year, month - 1, 1 - startOffset))
    const map = new Map(daily.map((day) => [day.date, day]))
    const todayKey = new Date().toISOString().slice(0, 10)
    const weeks: CalendarCell[][] = []

    for (let weekIndex = 0; weekIndex < 6; weekIndex++) {
      const week: CalendarCell[] = []
      for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
        const cellDate = new Date(gridStart)
        cellDate.setUTCDate(gridStart.getUTCDate() + weekIndex * 7 + dayIndex)
        const key = cellDate.toISOString().slice(0, 10)
        const item = map.get(key)

        week.push({
          date: cellDate,
          key,
          pnl: item?.pnl ?? 0,
          trades: item?.trades ?? 0,
          isCurrentMonth: cellDate.getUTCMonth() === month - 1,
          isToday: key === todayKey,
        })
      }
      weeks.push(week)
    }

    return weeks
  }

  private buildEquityLine() {
    const points = this.equitySeries()
    if (!points.length) {
      return ''
    }

    const width = 1040
    const height = 280
    const values = points.map((point) => point.value)
    const min = Math.min(0, ...values)
    const max = Math.max(0, ...values)
    const range = max - min || 1

    return points
      .map((point, index) => {
        const x = (index / Math.max(points.length - 1, 1)) * width
        const y = height - ((point.value - min) / range) * height
        return `${x},${y}`
      })
      .join(' ')
  }

  private buildEquityArea() {
    const line = this.buildEquityLine()
    if (!line) {
      return ''
    }

    const width = 1040
    const height = 280
    return `0,${height} ${line} ${width},${height}`
  }

  private buildMaxLossLine() {
    const points = this.equitySeries()
    if (!points.length) {
      re