import { Routes } from '@angular/router';
import { AccountListComponent }   from './components/account-list/account-list.component';
import { AccountDetailComponent } from './components/account-detail/account-detail.component';

export const ADMIN_ROUTES: Routes = [
  { path: '',              component: AccountListComponent },
  { path: 'accounts/:id', component: AccountDetailComponent },
];
