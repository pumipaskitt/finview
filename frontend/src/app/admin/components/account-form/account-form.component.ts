import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AccountService } from '../../services/account.service';

@Component({
  selector: 'app-account-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="form-box">
      <h3>Add MT5 Account</h3>
      <div class="form-row">
        <div class="field">
          <label>ชื่อ (Name)</label>
          <input [(ngModel)]="form.name" placeholder="เช่น John Doe" />
        </div>
        <div class="field">
          <label>MT5 Login</label>
          <input [(ngModel)]="form.login" placeholder="267806322" />
        </div>
        <div class="field">
          <label>Password</label>
          <input [(ngModel)]="form.password" type="password" placeholder="Investor password" />
        </div>
        <div class="field">
          <label>Server</label>
          <input [(ngModel)]="form.server" placeholder="Exness-MT5Real39" />
        </div>
      </div>
      <p class="hint">💡 แนะนำใช้ Investor Password เพื่อความปลอดภัย (read-only)</p>
      <div class="error" *ngIf="error">{{ error }}</div>
      <div class="btns">
        <button class="btn-save" (click)="submit()" [disabled]="loading">
          {{ loading ? 'Adding...' : '✓ Add & Start' }}
        </button>
        <button class="btn-cancel" (click)="cancelled.emit()">Cancel</button>
      </div>
    </div>
  `,
  styles: [`
    .form-box { background:#f0f9ff; border:1px solid #bae6fd; border-radius:12px; padding:20px; margin-bottom:20px; }
    h3 { margin:0 0 16px; font-size:15px; font-weight:600; }
    .form-row { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:10px; }
    .field { display:flex; flex-direction:column; gap:4px; }
    label { font-size:12px; color:#374151; font-weight:500; }
    input { padding:8px 10px; border:1px solid #d1d5db; border-radius:6px; font-size:13px; }
    .hint { font-size:12px; color:#0369a1; margin:4px 0 12px; }
    .btns { display:flex; gap:8px; }
    .btn-save { background:#2563eb; color:#fff; border:none; padding:9px 18px; border-radius:6px; cursor:pointer; font-size:13px; }
    .btn-save:disabled { opacity:.6; cursor:not-allowed; }
    .btn-cancel { background:#f3f4f6; border:none; padding:9px 18px; border-radius:6px; cursor:pointer; font-size:13px; }
    .error { color:#dc2626; font-size:12px; margin-bottom:8px; }
  `]
})
export class AccountFormComponent {
  @Output() created   = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();
  form = { name: '', login: '', password: '', server: 'Exness-MT5Real39' };
  loading = false; error = '';

  constructor(private svc: AccountService) {}

  submit() {
    if (!this.form.name || !this.form.login || !this.form.password || !this.form.server) {
      this.error = 'กรุณากรอกข้อมูลให้ครบ'; return;
    }
    this.loading = true; this.error = '';
    this.svc.create(this.form).subscribe({
      next: (acc) => {
        // Auto-deploy ทันทีหลัง create
        this.svc.deploy(acc._id).subscribe(() => {
          this.loading = false;
          this.created.emit();
        });
      },
      error: (e) => { this.loading = false; this.error = e.error?.error || 'Error'; }
    });
  }
}
