import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { Account, Position, Trade, Summary } from '../../models/account.model';
import { AccountService } from '../../services/account.service';

@Component({
  selector: 'app-account-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, DatePipe, DecimalPipe],
  template: `
    <div class="page">
      <a class="back" routerLink="/admin">← Back to accounts</a>

      <div class="loading" *ngIf="loading">Loading...</div>

      <ng-container *ngIf="acc">
        <div class="header">
          <div>
            <h2>{{ acc.name }}</h2>
            <span class="meta">{{ acc.login }} · {{ acc.server }}</span>
          </div>
          <div class="header-right">
            <span class="badge" [class]="acc.status">{{ acc.status }}</span>
            <button class="btn-sm btn-start" *ngIf="!acc.deployed" (click)="deploy()">▶ Start</button>
            <button class="btn-sm btn-stop"  *ngIf="acc.deployed"  (click)="undeploy()">⏹ Stop</button>
          </div>
        </div>

        <!-- Stats -->
        <div class="stats">
          <div class="stat" *ngFor="let s of stats">
            <div class="stat-label">{{ s.label }}</div>
            <div class="stat-val" [class]="s.cls">{{ s.value }}</div>
          </div>
        </div>

        <!-- Summary -->
        <div class="summary" *ngIf="summary">
          <div class="sum-item">
            <div class="sum-label">Total Profit</div>
            <div class="sum-val" [class.pos]="summary.totalProfit>=0" [class.neg]="summary.totalProfit<0">
              {{ summary.totalProfit | number:'1.2-2' }} {{ acc.info?.currency }}
            </div>
          </div>
          <div class="sum-item">
            <div class="sum-label">Total Trades</div>
            <div class="sum-val">{{ summary.totalTrades }}</div>
          </div>
          <div class="sum-item">
            <div class="sum-label">Win Rate</div>
            <div class="sum-val pos">
              {{ summary.totalTrades > 0 ? (summary.winTrades / summary.totalTrades * 100 | number:'1.0-0') : 0 }}%
            </div>
          </div>
          <div class="sum-item">
            <div class="sum-label">Win / Loss</div>
            <div class="sum-val">{{ summary.winTrades }} / {{ summary.lossTrades }}</div>
          </div>
        </div>

        <!-- Open Positions -->
        <h3>Open Positions <span class="count">{{ positions.length }}</span></h3>
        <table class="tbl" *ngIf="positions.length > 0">
          <thead><tr><th>Symbol</th><th>Type</th><th>Lot</th><th>Open</th><th>Current</th><th>SL</th><th>TP</th><th>Profit</th></tr></thead>
          <tbody>
            <tr *ngFor="let p of positions">
              <td><strong>{{ p.symbol }}</strong></td>
              <td><span class="type" [class]="p.type">{{ p.type | uppercase }}</span></td>
              <td>{{ p.volume }}</td>
              <td>{{ p.openPrice }}</td>
              <td>{{ p.currentPrice }}</td>
              <td>{{ p.sl || '-' }}</td>
              <td>{{ p.tp || '-' }}</td>
              <td [class.pos]="p.profit>=0" [class.neg]="p.profit<0">{{ p.profit | number:'1.2-2' }}</td>
            </tr>
          </tbody>
        </table>
        <p class="empty" *ngIf="positions.length === 0">No open positions</p>

        <!-- Trade History -->
        <h3>Trade History <span class="count">{{ trades.length }}</span></h3>
        <table class="tbl" *ngIf="trades.length > 0">
          <thead><tr><th>Time</th><th>Symbol</th><th>Type</th><th>Lot</th><th>Price</th><th>Profit</th><th>Commission</th></tr></thead>
          <tbody>
            <tr *ngFor="let t of trades">
              <td>{{ t.time | date:'dd/MM/yy HH:mm' }}</td>
              <td><strong>{{ t.symbol }}</strong></td>
              <td>{{ t.type }}</td>
              <td>{{ t.volume }}</td>
              <td>{{ t.price }}</td>
              <td [class.pos]="t.profit>=0" [class.neg]="t.profit<0">{{ t.profit | number:'1.2-2' }}</td>
              <td>{{ t.commission | number:'1.2-2' }}</td>
            </tr>
          </tbody>
        </table>
        <p class="empty" *ngIf="trades.length === 0">No trade history</p>
      </ng-container>
    </div>
  `,
  styles: [`
    .page { padding:24px; max-width:1200px; margin:0 auto; font-family:system-ui,sans-serif; }
    .back { color:#2563eb; text-decoration:none; font-size:13px; display:block; margin-bottom:16px; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; }
    h2 { margin:0 0 4px; font-size:22px; }
    .meta { font-size:13px; color:#6b7280; }
    .header-right { display:flex; align-items:center; gap:8px; }
    .badge { padding:4px 12px; border-radius:999px; font-size:12px; font-weight:600; text-transform:uppercase; }
    .connected{background:#d1fae5;color:#065f46;} .connecting{background:#fef3c7;color:#92400e;} .stopped{background:#f3f4f6;color:#6b7280;} .error{background:#fee2e2;color:#991b1b;}
    .stats { display:grid; grid-template-columns:repeat(5,1fr); gap:12px; margin-bottom:20px; }
    .stat { background:#f9fafb; border:1px solid #e5e7eb; border-radius:10px; padding:14px; }
    .stat-label { font-size:11px; color:#9ca3af; margin-bottom:4px; }
    .stat-val { font-size:18px; font-weight:700; }
    .summary { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:24px; background:#eff6ff; border-radius:10px; padding:16px; }
    .sum-label { font-size:11px; color:#6b7280; } .sum-val { font-size:16px; font-weight:700; }
    .pos{color:#16a34a;} .neg{color:#dc2626;}
    h3 { font-size:15px; margin:20px 0 10px; display:flex; align-items:center; gap:8px; }
    .count { background:#e5e7eb; color:#374151; padding:1px 8px; border-radius:999px; font-size:12px; }
    .tbl { width:100%; border-collapse:collapse; font-size:13px; margin-bottom:24px; }
    .tbl th { background:#f9fafb; padding:8px 12px; text-align:left; font-size:11px; color:#6b7280; border-bottom:1px solid #e5e7eb; }
    .tbl td { padding:8px 12px; border-bottom:1px solid #f3f4f6; }
    .type { padding:2px 6px; border-radius:4px; font-size:11px; font-weight:600; }
    .buy{background:#d1fae5;color:#065f46;} .sell{background:#fee2e2;color:#991b1b;}
    .empty { color:#9ca3af; font-size:13px; }
    .loading { text-align:center; padding:60px; color:#9ca3af; }
    .btn-sm { border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:500; }
    .btn-start{background:#d1fae5;color:#065f46;} .btn-stop{background:#fef3c7;color:#92400e;}
  `]
})
export class AccountDetailComponent implements OnInit, OnDestroy {
  acc?: Account; positions: Position[] = []; trades: Trade[] = []; summary: any;
  loading = true; private sub!: Subscription;

  get stats() {
    if (!this.acc?.info) return [];
    const i = this.acc.info;
    return [
      { label: 'Balance',     value: `${i.balance?.toFixed(2)} ${i.currency}`,     cls: '' },
      { label: 'Equity',      value: `${i.equity?.toFixed(2)} ${i.currency}`,      cls: '' },
      { label: 'Profit',      value: `${i.profit?.toFixed(2)} ${i.currency}`,      cls: i.profit >= 0 ? 'pos' : 'neg' },
      { label: 'Free Margin', value: `${i.freeMargin?.toFixed(2)} ${i.currency}`,  cls: '' },
      { label: 'Leverage',    value: `1:${i.leverage}`,                            cls: '' },
    ];
  }

  constructor(private svc: AccountService, private route: ActivatedRoute) {}

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.svc.getById(id).subscribe(d => { this.acc = d; this.loading = false; });
    this.svc.getPositions(id).subscribe(d => this.positions = d);
    this.svc.getTrades(id).subscribe(d => this.trades = d);
    this.svc.getSummary(id).subscribe(d => this.summary = d);

    this.sub = this.svc.wsUpdates$.subscribe(({ event, data }) => {
      if (event === 'account_update' && data.accountId === id) {
        if (this.acc && data.info) this.acc.info = data.info;
        if (data.positions) this.positions = data.positions;
      }
    });
  }

  ngOnDestroy() { this.sub?.unsubscribe(); }

  deploy()   { this.svc.deploy(this.acc!._id).subscribe(() => this.acc!.deployed = true); }
  undeploy() { this.svc.undeploy(this.acc!._id).subscribe(() => this.acc!.deployed = false); }
}
