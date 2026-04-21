import { Injectable, computed, inject, signal } from '@angular/core'

import { Trade } from '../models/trade'
import { StatsResponse } from '../models/stats'
import { TradeRealtimeService } from '../services/trade-realtime.service'
import { TradeService } from '../services/trade.service'

@Injectable({ providedIn: 'root' })
export class DashboardStore {
  private readonly tradeService = inject(TradeService)
  private readonly realtimeService = inject(TradeRealtimeService)

  private readonly statsState = signal<StatsResponse | null>(null)
  private readonly liveTradesState = signal<Trade[]>([])
  private readonly loadingState = signal(false)
  private readonly initializedState = signal(false)

  readonly stats = this.statsState.asReadonly()
  readonly liveTrades = this.liveTradesState.asReadonly()
  readonly loading = this.loadingState.asReadonly()
  readonly summary = computed(() => this.statsState()?.summary ?? null)
  readonly highlights = computed(() => this.statsState()?.highlights ?? null)
  readonly dailyBreakdown = computed(() => this.statsState()?.breakdowns.daily ?? [])

  initialize() {
    if (this.initializedState()) {
      return
    }

    console.log('[store] initialize')
    this.initializedState.set(true)
    this.loadStats()
    this.realtimeService.onNewTrade((trade) => {
      console.log('[store] new_trade received', trade)
      this.liveTradesState.update((current) => [trade, ...current].slice(0, 10))
      this.loadStats()
    })
  }

  loadStats() {
    console.log('[store] loading stats')
    this.loadingState.set(true)

    this.tradeService.getStats().subscribe({
      next: (stats) => {
        console.log('[store] stats loaded', stats)
        this.statsState.set(stats)
        this.loadingState.set(false)
      },
      error: (error) => {
        console.error('[store] stats load failed', error)
        this.loadingState.set(false)
      },
    })
  }
}
