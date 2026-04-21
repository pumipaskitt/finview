import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { Account } from '../../models/account.model';
import { AccountService } from '../../services/account.service';
import { AccountFormComponent } from '../account-form/account-form.component';

@Component({
  selector: 'app-account-list',
  standalone: true,
  imports: [CommonModule, RouterModule, AccountFormComponent],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>MT5 Bridge</h1>
          <p class="subtitle">{{ accounts.length }} accounts · {{ connectedCount }} connected</p>
        </div>
        <button class="btn-primary" (click)="showForm = !showForm">
          {{ showForm ? '✕ Cancel' : '+ Add Account' }}
        </button>
      </div>

      <app-account-form *ngIf="showForm" (created)="onCreated()" (cancelled)="showForm=false"/>

      <div class="grid">
        <div class="card" *ngFor="let acc of accounts">
          <div class="card-top">
            <div class="card-title">{{ acc.name }}</div>
            <span class="status-badge" [class]="acc.status">{{ acc.status }}</span>
          </div>

          <div class="card-meta">
            <span>Login: <strong>{{ acc.login }}</strong></span>
            <span>{{ acc.server }}</span>
          </div>

          <div class="card-info" *ngIf="acc.info && acc.status === 'connected'">
            <div class="info-item">
              <div class="info-label">Balance</div>
              <div class="info-val">{{ acc.info.balance | number:'1.2-2' }} {{ acc.info.currency }}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Equity</div>
              <div class="info-val">{{ acc.info.equity | number:'1.2-2' }}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Profit</div>
              <div class="info-val" [class.pos]="acc.info.profit>=0" [class.neg]="acc.info.profit<0">
                {{ acc.info.profit | number:'1.2-2' }}
              </div>
            </div>
          </div>

          <div class="error-msg" *ngIf="acc.status === 'error'">⚠️ {{ acc.errorMsg }}</div>

          <div class="card-footer">
            <span class="last-sync" *ngIf="acc.lastSync">
              Synced {{ acc.lastSync | date:'HH:mm:ss' }}
            </span>
            <div class="card-actions">
              <button class="btn-sm btn-view" [routerLink]="['/admin/accounts', acc._id]">Detail</button>
              <button class="btn-sm btn-start" *ngIf="!acc.deployed" (click)="deploy(acc)">▶ Start</button>
              <button class="btn-sm btn-stop"  *ngIf="acc.deployed"  (click)="undeploy(acc)">⏹ Stop</button>
              <button class="btn-sm btn-del" (click)="remove(acc)">🗑</button>
            </div>
          </div>
        </div>

        <div class="empty" *ngIf="accounts.length === 0 && !loading">
          No accounts yet. Click "+ Add Account" to get started.
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page { padding:24px; max-width:1200px; margin:0 auto; font-family:system-ui,sans-serif; }
    .page-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:24px; }
    h1 { margin:0 0 4px; font-size:26px; }
    .subtitle { margin:0; color:#6b7280; font-size:14px; }
    .btn-primary { background:#2563eb; color:#fff; border:none; padding:10px 20px; border-radius:8px; cursor:pointer; font-size:14px; font-weight:500; }
    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:16px; }
    .card { background:#fff; border:1px solid #e5e7eb; border-radius:14px; padding:18px; }
    .card-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
    .card-title { font-weight:700; font-size:16px; }
    .status-badge { padding:3px 10px; border-radius:999px; font-size:12px; font-weight:600; text-transform:uppercase; }
    .connected  { background:#d1fae5; color:#065f46; }
    .connecting { background:#fef3c7; color:#92400e; }
    .stopped    { background:#f3f4f6; color:#6b7280; }
    .error      { background:#fee2e2; color:#991b1b; }
    .card-meta { display:flex; gap:12px; font-size:13px; color:#6b7280; margin-bottom:12px; }
    .card-info { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; background:#f9fafb; border-radius:8px; padding:10px; margin-bottom:10px; }
    .info-label { font-size:11px; color:#9ca3af; }
    .info-val { font-size:14px; font-weight:600; }
    .pos { color:#16a34a; } .neg { color:#dc2626; }
    .error-msg { font-size:12px; color:#dc2626; margin-bottom:8px; }
    .card-footer { display:flex; justify-content:space-between; align-items:center; }
    .last-sync { font-size:11px; color:#9ca3af; }
    .card-actions { display:flex; gap:6px; }
    .btn-sm { border:none; padding:5px 10px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:500; }
    .btn-view  { background:#eff6ff; color:#2563eb; }
    .btn-start { background:#d1fae5; color:#065f46; }
    .btn-stop  { background:#fef3c7; color:#92400e; }
    .btn-del   { background:#fee2e2; color:#991b1b; }
    .empty { grid-column:1/-1; text-align:center; padding:60px; color:#9ca3af; }
  `]
})
export class AccountListComponent implements OnInit, OnDestroy {
  accounts: Account[] = [];
  loading = true;
  showForm = false;
  private sub!: Subscription;

  get connectedCount() { return this.accounts.filter(a => a.status === 'connected').length; }

  constructor(private svc: AccountService) {}

  ngOnInit() {
    this.load();
    // Real-time update ผ่าน WebSocket
    this.sub = this.svc.wsUpdates$.subscribe(({ event, data }) => {
      if (event === 'account_update' || event === 'status_update') {
        const idx = this.accounts.findIndex(a => a._id === data.accountId);
        if (idx > -1) {
          if (data.info) this.accounts[idx].info = data.info;
          if (data.status) this.accounts[idx].status = data.status;
          this.accounts[idx].lastSync = new Date().toISOString();
        }
      }
    });
  }

  ngOnDestroy() { this.sub?.unsubscribe(); }

  load() {
    this.loading = true;
    this.svc.getAll().subscribe({ next: (d) => { this.accounts = d; this.loading = false; } });
  }

  deploy(acc: Account)   { this.svc.deploy(acc._id).subscribe(() => this.load()); }
  undeploy(acc: Account) { this.svc.undeploy(acc._id).subscribe(() => this.load()); }
  remove(acc: Account) {
    if (!confirm(`Remove "${acc.name}"?`)) return;
    this.svc.remove(acc._id).subscribe(() => this.load());
  }
  onCreated() { this.showForm = false; this.load(); }
}
