import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  if (!auth.isLoggedIn()) {
    router.navigate(['/login']);
    return false;
  }

  // admin ที่เข้ามาหน้า / ให้ redirect ไป /admin
  if (auth.isAdmin()) {
    router.navigate(['/admin']);
    return false;
  }

  return true;
};
