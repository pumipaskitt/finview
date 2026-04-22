import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

// ถ้า login แล้วไม่ต้องเข้าหน้า login อีก
export const loginGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  if (!auth.isLoggedIn()) return true;

  // login แล้ว → redirect ตาม role
  router.navigate([auth.isAdmin() ? '/admin' : '/']);
  return false;
};
