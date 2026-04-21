import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="login-page">
      <div class="login-box">
        <div class="logo">
          <span class="logo-text">finView</span>
          <span class="logo-sub">Analytics Terminal</span>
        </div>

        <form (ngSubmit)="submit()">
          <div class="field">
            <label>Username</label>
            <input [(ngModel)]="username" name="username"
                   placeholder="Enter username" autocomplete="username" />
          </div>
          <div class="field">
            <label>Password</label>
            <input [(ngModel)]="password" name="password"
                   type="password" placeholder="Enter password"
                   autocomplete="current-password" />
          </div>

          <div class="error" *ngIf="error">{{ error }}</div>

          <button type="submit" [disabled]="loading">
            {{ loading ? 'Signing in...' : 'Sign In' }}
          </button>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .login-page {
      min-height: 100vh;
      background: #0d1117;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .login-box {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 16px;
      padding: 40px;
      width: 100%;
      max-width: 380px;
    }
    .logo {
      text-align: center;
      margin-bottom: 32px;
    }
    .logo-text {
      display: block;
      font-size: 28px;
      font-weight: 800;
      color: #fff;
      letter-spacing: -0.5px;
    }
    .logo-sub {
      font-size: 12px;
      color: #8b949e;
      text-transform: uppercase;
      letter-spacing: 2px;
    }
    .field {
      margin-bottom: 16px;
    }
    label {
      display: block;
      font-size: 13px;
      color: #8b949e;
      margin-bottom: 6px;
    }
    input {
      width: 100%;
      padding: 10px 14px;
      background: #0d1117;
      border: 1px solid #30363d;
      border-radius: 8px;
      color: #fff;
      font-size: 14px;
      box-sizing: border-box;
      outline: none;
      transition: border-color 0.2s;
    }
    input:focus { border-color: #58a6ff; }
    button {
      width: 100%;
      padding: 12px;
      background: #238636;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      margin-top: 8px;
      transition: background 0.2s;
    }
    button:hover:not(:disabled) { background: #2ea043; }
    button:disabled { opacity: 0.6; cursor: not-allowed; }
    .error {
      color: #f85149;
      font-size: 13px;
      margin-bottom: 12px;
      padding: 8px 12px;
      background: rgba(248,81,73,0.1);
      border-radius: 6px;
    }
  `]
})
export class LoginComponent {
  private auth   = inject(AuthService);
  private router = inject(Router);

  username = '';
  password = '';
  loading  = false;
  error    = '';

  submit() {
    if (!this.username || !this.password) {
      this.error = 'Please enter username and password';
      return;
    }
    this.loading = true;
    this.error   = '';

    this.auth.login(this.username, this.password).subscribe({
      next: () => { this.loading = false; this.router.navigate(['/']); },
      error: (e) => {
        this.loading = false;
        this.error = e.error?.error || 'Login failed';
      }
    });
  }
}
