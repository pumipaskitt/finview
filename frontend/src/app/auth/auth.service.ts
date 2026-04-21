import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http   = inject(HttpClient);
  private router = inject(Router);
  private base   = environment.apiUrl;

  login(username: string, password: string) {
    return this.http.post<{ token: string; username: string; accountId: string }>(
      `${this.base}/auth/login`,
      { username, password }
    ).pipe(
      tap(res => {
        localStorage.setItem('token',     res.token);
        localStorage.setItem('username',  res.username);
        localStorage.setItem('accountId', res.accountId);
      })
    );
  }

  logout() {
    localStorage.clear();
    this.router.navigate(['/login']);
  }

  getToken()    { return localStorage.getItem('token'); }
  getUsername() { return localStorage.getItem('username'); }
  isLoggedIn()  { return !!this.getToken(); }
}
