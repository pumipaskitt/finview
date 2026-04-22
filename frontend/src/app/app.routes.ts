import { Routes } from '@angular/router';
import { authGuard }  from './auth/auth.guard';
import { adminGuard } from './auth/admin.guard';
import { loginGuard } from './auth/login.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [loginGuard],  // login แล้วไม่ต้องเข้าหน้านี้
    loadComponent: () => import('./auth/login.component').then(m => m.LoginComponent)
  },
  {
    path: '',
    loadComponent: () => import('./dashboard.component').then(m => m.DashboardComponent),
    canActivate: [authGuard]   // ต้อง login เท่านั้น
  },
  {
    path: 'admin',
    canActivate: [adminGuard], // ต้อง login + เป็น admin
    loadChildren: () => import('./admin/admin.routes').then(m => m.ADMIN_ROUTES)
  }
];
