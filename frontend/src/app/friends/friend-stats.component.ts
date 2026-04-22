import { Component, inject, input, output, signal, computed, OnInit } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FriendshipService, Friend } from './friendship.service'

@Component({
  selector: 'app-friend-stats',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="friend-view">
      <div class="friend-view-header">
        <button class="back-btn" (click)="back.emit()">← Back</button>
        <span class="friend-title">{{ stats()?.username }}'s Dashboard</span>
        <span class="privacy-note">Only showing what {{ stats()?.username }} allows</span>
      </div>

      <div class="loading" *ngIf="loading()">Loading...</div>
      <div class="error-msg" *ngIf="error()">{{ error() }}</div>

      <ng-container *ngIf="stats() as s">
        <div class="stats-strip">

          <!-- P/L -->
          <article class="stat-card" *ngIf="s.privacy.showPnL; else hiddenCard">
            <div class="stat-title">Total P/L</div>
            <div class="stat-value" [class.loss]="s.summary.totalPnL < 0">
              {{ formatSigned(s.summary.totalPnL) }}
            </div>
          </article>

          <!-- Win Rate -->
          <article class="stat-card" *ngIf="s.privacy.showWinRate; else hiddenCard">
            <div class="stat-title">Trade Win %</div>
            <div class="stat-value">{{ s.summary.tradeWinPercent | number:'1.2-2' }}%</div>
          </article>

          <!-- Profit Factor -->
          <article class="stat-card" *ngIf="s.privacy.showWinRate; else hiddenCard">
            <div class="stat-title">Profit Factor</div>
            <div class="stat-value">{{ s.summary.profitFactor | number:'1.2-2' }}</div>
          </article>

          <!-- Total Trades (always visible) -->
          <article class="stat-card">
            <div class="stat-title">Total Trades</div>
            <div class="stat-value">{{ s.summary.totalTrades }}</div>
          </article>

        </div>

        <!-- Chart -->
        <div class="chart-panel" *ngIf="s.privacy.showChart && equityPoints(s).length > 1">
          <div class="section-title">Equity Curve</div>
          <svg viewBox="0 0 1040 200" preserveAspectRatio="none" class="balance-chart">
            <defs>
              <linearGradient id="friendFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stop-color="rgba(72,157,255,0.4)"></stop>
                <stop offset="100%" stop-color="rgba(72,157,255,0.02)"></stop>
              </linearGradient>
            </defs>
            <polygon [attr.points]="buildArea(s)" fill="url(#friendFill)"></polygon>
            <polyline [attr.points]="buildLine(s)" class="equity-line"></polyline>
          </svg>
        </div>

        <!-- Trade History -->
        <div class="trades-panel" *ngIf="s.privacy.showTrades && s.trades.length > 0">
          <div class="section-title">Trade History</div>
          <table class="trade-table">
            <thead>
              <tr><th>Symbol</th><th>Side</th><th>Lots</th><th>P/L</th><th>Date</th></tr>
            </thead>
            <tbody>
              <tr *ngFor="let t of s.trades.slice(0,50)">
                <td>{{ t.symbol }}</td>
                <td [class.buy]="t.side==='Buy'" [class.sell]="t.side==='Sell'">{{ t.side }}</td>
                <td>{{ t.lots | number:'1.2-2' }}</td>
                <td [class.profit]="t.profitUsd > 0" [class.loss]="t.profitUsd < 0">{{ formatSigned(t.profitUsd) }}</td>
                <td>{{ t.closeTime | date:'MMM d, y' }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Hidden sections notice -->
        <div class="hidden-notice" *ngIf="hasHidden(s)">
          Some sections are private
        </div>
      </ng-container>
    </div>

    <ng-template #hiddenCard>
      <article class="stat-card hidden-stat">
        <div class="stat-title">🔒 Private</div>
      </article>
    </ng-template>
  `,
  styles: [`
    .friend-view { padding: 24px; max-width: 1200px; margin: 0 auto; }
    .friend-view-header { display:flex; align-items:center; gap:16px; margin-bottom:24px; }
    .back-btn { background:#21262d; color:#e6edf3; border:1px solid #30363d; padding:7px 14px; border-radius:8px; cursor:pointer; font-size:13px; }
    .friend-title { font-size:20px; font-weight:700; flex:1; }
    .privacy-note { font-size:12px; color:#8b949e; }
    .loading { text-align:center; padding:60px; color:#8b949e; }
    .error-msg { color:#f85149; text-align:center; padding:40px; }
    .stats-strip { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:16px; margin-bottom:24px; }
    .stat-card { background:#161b22; border:1px solid #30363d; border-radius:12px; padding:20px; }
    .stat-card.hidden-stat { display:flex; align-items:center; justify-content:center; opacity:0.4; }
    .stat-title { font-size:12px; color:#8b949e; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px; }
    .stat-value { font-size:24px; font-weight:700; color:#e6edf3; }
    .stat-value.loss { color:#f85149; }
    .chart-panel { background:#161b22; border:1px solid #30363d; border-radius:12px; padding:20px; margin-bottom:24px; }
    .section-title { font-size:13px; color:#8b949e; margin-bottom:12px; text-transform:uppercase; letter-spacing:1px; }
    .balance-chart { width:100%; height:180px; display:block; }
    .equity-line { fill:none; stroke:#58a6ff; stroke-width:2; }
    .trades-panel { background:#161b22; border:1px solid #30363d; border-radius:12px; padding:20px; margin-bottom:24px; }
    .trade-table { width:100%; border-collapse:collapse; font-size:13px; }
    .trade-table th { color:#8b949e; text-align:left; padding:8px 12px; border-bottom:1px solid #30363d; }
    .trade-table td { padding:8px 12px; border-bottom:1px solid #21262d; color:#e6edf3; }
    .buy { color:#3fb950; } .sell { color:#f85149; }
    .profit { color:#3fb950; } .loss { color:#f85149; }
    .hidden-notice { text-align:center; color:#8b949e; font-size:13px; padding:16px; }
  `]
})
export class FriendStatsComponent implements OnInit {
  private svc = inject(FriendshipService)

  friend = input.required<Friend>()
  back   = output<void>()

  stats   = signal<any>(null)
  loading = signal(true)
  error   = signal('')

  ngOnInit() {
    this.svc.getFriendStats(this.friend().userId).subscribe({
      next: (data) => { this.stats.set(data); this.loading.set(false) },
      error: (e)   => { this.error.set(e.error?.error || 'Failed to load'); this.loading.set(false) },
    })
  }

  formatSigned(v: number) {
    return `${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(2)}`
  }

  equityPoints(s: any): { x: number; value: number }[] {
    const trades = [...(s.trades ?? [])].sort(
      (a: any, b: any) => new Date(a.closeTime).getTime() - new Date(b.closeTime).getTime()
    )
    let cum = 0
    return trades.map((t: any, i: number) => ({ x: i, value: (cum += t.profitUsd) }))
  }

  buildLine(s: any) {
    const pts = this.equityPoints(s)
    if (!pts.length) return ''
    const W = 1040, H = 180
    const vals = pts.map(p => p.value)
    const min = Math.min(0, ...vals), max = Math.max(0, ...vals)
    const range = max - min || 1
    return pts.map((p, i) => {
      const x = (i / Math.max(pts.length - 1, 1)) * W
      const y = H - ((p.value - min) / range) * H
      return `${x},${y}`
    }).join(' ')
  }

  buildArea(s: any) {
    const line = this.buildLine(s)
    if (!line) return ''
    return `0,180 ${line} 1040,180`
  }

  hasHidden(s: any) {
    const p = s.privacy
    return !p.showPnL || !p.showWinRate || !p.showChart || !p.showTrades || !p.showBalance
  }
}
