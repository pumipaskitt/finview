import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { Account } from '../../models/account.model';
import { AccountService } from '../../services/account.service';
import { AccountFormComponent } from '../account-form/account-form.component';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../auth/auth.service';
import { inject } from '@angular/core';

@Component({
  selector: 'app-account-list',
  standalone: true,
  imports: [CommonModule, RouterModule, AccountFormComponent, FormsModule],
  template: `
    <div class="page">

      <!-- Topbar -->
      <div class="topbar">
        <span class="topbar-title">finView <span class="topbar-badge">Admin</span></span>
        <div class="topbar-right">
          <span class="topbar-user">{{ username }}</span>
          <button class="logout-btn" (click)="logout()">Logout</button>
        </div>
      </div>

      <!-- Tabs -->
      <div class="tabs">
        <button class="tab" [class.active]="tab==='accounts'" (click)="tab='accounts'">MT5 Accounts</button>
        <button class="tab" [class.active]="tab==='users'"    (click)="tab='users'; loadUsers()">Users</button>
      </div>

      <!-- ─── Accounts Tab ─── -->
      <ng-container *ngIf="tab==='accounts'">
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
              <span class="last-sync" *ngIf="acc.lastSync">Synced {{ acc.lastSync | date:'HH:mm:ss' }}</span>
              <div class="card-actions">
                <button class="btn-sm btn-view" [routerLink]="['/admin/accounts', acc._id]">Detail</button>
                <button class="btn-sm btn-start" *ngIf="acc.status !== 'deployed' && acc.status !== 'connected'" (click)="deploy(acc)">▶ Start</button>
                <button class="btn-sm btn-stop"  *ngIf="acc.status === 'deployed' || acc.status === 'connected'" (click)="undeploy(acc)">⏹ Stop</button>
                <button class="btn-sm btn-del" (click)="remove(acc)">🗑</button>
              </div>
            </div>
          </div>
          <div class="empty" *ngIf="accounts.length === 0 && !loading">
            No accounts yet. Click "+ Add Account" to get started.
          </div>
        </div>
      </ng-container>

      <!-- ─── Users Tab ─── -->
      <ng-container *ngIf="tab==='users'">
        <div class="page-header">
          <div>
            <h1>Users</h1>
            <p class="subtitle">{{ users.length }} users registered</p>
          </div>
          <button class="btn-primary" (click)="showUserForm = !showUserForm">
            {{ showUserForm ? '✕ Cancel' : '+ Add User' }}
          </button>
        </div>

        <!-- Add User Form -->
        <div class="form-card" *ngIf="showUserForm">
          <h3>Register New User</h3>
          <div class="form-row">
            <input class="input" [(ngModel)]="newUser.username" placeholder="Username" />
            <input class="input" [(ngModel)]="newUser.password" type="password" placeholder="Password" />
          </div>
          <div class="form-row">
            <select class="input" [(ngModel)]="newUser.accountId">
              <option value="">-- Select MT5 Account --</option>
              <option *ngFor="let acc of accounts" [value]="acc._id">
                {{ acc.name }} ({{ acc.login }})
              </option>
            </select>
          </div>
          <div class="form-error" *ngIf="userError">{{ userError }}</div>
          <div class="form-actions">
            <button class="btn-primary" (click)="registerUser()" [disabled]="registerLoading">
              {{ registerLoading ? 'Creating...' : 'Create User' }}
            </button>
          </div>
        </div>

        <!-- Users List -->
        <div class="user-list">
          <div class="user-row" *ngFor="let u of users">
            <div class="user-info">
              <span class="user-name">{{ u.username }}</span>
              <span class="user-account" *ngIf="u.accountId">
                → {{ u.accountId?.name }} ({{ u.accountId?.login }})
              </span>
            </div>
            <button class="btn-sm btn-del" (click)="removeUser(u)">🗑</button>
          </div>
          <div class="empty" *ngIf="users.length === 0">No users yet.</div>
        </div>
      </ng-container>

    </div>
  `,
  styles: [`
    .page { padding:24px; max-width:1200px; margin:0 auto; font-family:system-ui,sans-serif; }
    .tabs { display:flex; gap:4px; margin-bottom:24px; border-bottom:2px solid #e5e7eb; padding-bottom:0; }
    .tab { background:none; border:none; padding:10px 20px; cursor:pointer; font-size:14px; font-weight:500; color:#6b7280; border-bottom:2px solid transparent; margin-bottom:-2px; }
    .tab.active { color:#2563eb; border-bottom-color:#2563eb; }
    .page-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:24px; }
    h1 { margin:0 0 4px; font-size:26px; } h3 { margin:0 0 16px; }
    .subtitle { margin:0; color:#6b7280; font-size:14px; }
    .btn-primary { background:#2563eb; color:#fff; border:none; padding:10px 20px; border-radius:8px; cursor:pointer; font-size:14px; font-weight:500; }
    .btn-primary:disabled { opacity:0.6; cursor:not-allowed; }
    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:16px; }
    .card { background:#fff; border:1px solid #e5e7eb; border-radius:14px; padding:18px; }
    .card-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
    .card-title { font-weight:700; font-size:16px; }
    .status-badge { padding:3px 10px; border-radius:999px; font-size:12px; font-weight:600; text-transform:uppercase; }
    .connected  { background:#d1fae5; color:#065f46; }
    .connecting { background:#fef3c7; color:#92400e; }
    .deployed   { background:#dbeafe; color:#1e40af; }
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
    .form-card { background:#fff; border:1px solid #e5e7eb; border-radius:14px; padding:20px; margin-bottom:24px; }
    .form-row { display:flex; gap:12px; margin-bottom:12px; }
    .input { flex:1; border:1px solid #d1d5db; border-radius:8px; padding:9px 12px; font-size:14px; outline:none; }
    .input:focus { border-color:#2563eb; }
    .form-error { color:#dc2626; font-size:13px; margin-bottom:12px; }
    .form-actions { display:flex; justify-content:flex-end; }
    .user-list { display:flex; flex-direction:column; gap:8px; }
    .user-row { background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:14px 18px; display:flex; justify-content:space-between; align-items:center; }
    .user-info { display:flex; gap:12px; align-items:center; }
    .user-name { font-weight:600; font-size:15px; }
    .user-account { font-size:13px; color:#6b7280; }
    .topbar { display:flex; justify-content:space-between; align-items:center; padding:14px 0 20px; border-bottom:1px solid #e5e7eb; margin-bottom:24px; }
    .topbar-title { font-size:18px; font-weight:700; color:#111827; }
    .topbar-badge { background:#dbeafe; color:#1e40af; font-size:11px; font-weight:600; padding:2px 8px; border-radius:999px; margin-left:8px; vertical-align:middle; }
    .topbar-right { display:flex; align-items:center; gap:12px; }
    .topbar-user { font-size:13px; color:#6b7280; font-weight:500; }
    .logout-btn { background:#fee2e2; color:#991b1b; border:none; padding:7px 14px; border-radius:8px; cursor:pointer; font-size:13px; font-weight:600; transition:background 0.2s; }
    .logout-btn:hover { background:#fecaca; }
  `]
})
export class AccountListComponent implements OnInit, OnDestroy {
  accounts: Account[] = [];
  users: any[] = [];
  loading = true;
  showForm = false;
  showUserForm = false;
  tab = 'accounts';
  registerLoading = false;
  userError = '';
  newUser = { username: '', password: '', accountId: '' };
  private sub!: Subscription;
  private api = environment.apiUrl;
  private auth = inject(AuthService);
  username = this.auth.getUsername() ?? 'admin';

  get connectedCount() { return this.accounts.filter(a => a.status === 'connected').length; }
  logout() { this.auth.logout(); }

  constructor(private svc: AccountService, private http: HttpClient) {}

  ngOnInit() {
    this.load();
    this.sub = this.svc.wsUpdates$.subscribe(({ event, data }) => {
      if (event === 'account_update' || event === 'status_update') {
        const idx = this.accounts.findIndex(a => a._id === data.accountId);
        if (idx > -1) {
          if (data.info)   this.accounts[idx].info   = data.info;
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

  loadUsers() {
    this.http.get<any[]>(`${this.api}/auth/users`).subscribe({ next: (d) => this.users = d });
  }

  registerUser() {
    this.userError = '';
    if (!this.newUser.username || !this.newUser.password || !this.newUser.accountId) {
      this.userError = 'Please fill in all fields'; return;
    }
    this.registerLoading = true;
    this.http.post(`${this.api}/auth/register`, this.newUser).subscribe({
      next: () => {
        this.registerLoading = false;
        this.showUserForm = false;
        this.newUser = { username: '', password: '', accountId: '' };
        this.loadUsers();
      },
      error: (e) => {
        this.registerLoading = false;
        this.userError = e.error?.error || 'Error creating user';
      }
    });
  }

  removeUser(u: any) {
    if (!confirm(`Remove user "${u.username}"?`)) return;
    this.http.delete(`${this.api}/auth/users/${u._id}`).subscribe(() => this.loadUsers());
  }

  deploy(acc: Account)   { this.svc.deploy(acc._id).subscribe(() => this.load()); }
  undeploy(acc: Account) { this.svc.undeploy(acc._id).subscribe(() => this.load()); }
  remove(acc: Account) {
    if (!confirm(`Remove "${acc.name}"?`)) return;
    this.svc.remove(acc._id).subscribe(() => this.load());
  }
  onCreated() { this.showForm = false; this.load(); }
}
