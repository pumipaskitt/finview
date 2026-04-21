import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { Account, CreateAccountDto, Position, Trade, Summary } from '../models/account.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AccountService {
  private base = `${environment.apiUrl}/api/accounts`;
  private socket: Socket;
  wsUpdates$ = new Subject<{ event: string; data: any }>();

  constructor(private http: HttpClient) {
    this.socket = io(environment.apiUrl, { reconnection: true });
    this.socket.on('account_update', (data: any) =>
      this.wsUpdates$.next({ event: 'account_update', data })
    );
    this.socket.on('status_update', (data: any) =>
      this.wsUpdates$.next({ event: 'status_update', data })
    );
  }

  getAll(): Observable<Account[]>              { return this.http.get<Account[]>(this.base); }
  getById(id: string): Observable<Account>     { return this.http.get<Account>(`${this.base}/${id}`); }
  getPositions(id: string): Observable<Position[]> { return this.http.get<Position[]>(`${this.base}/${id}/positions`); }
  getTrades(id: string): Observable<Trade[]>   { return this.http.get<Trade[]>(`${this.base}/${id}/trades`); }
  getSummary(id: string): Observable<Summary>  { return this.http.get<Summary>(`${this.base}/${id}/summary`); }
  create(dto: CreateAccountDto): Observable<Account> { return this.http.post<Account>(this.base, dto); }
  deploy(id: string): Observable<any>   { return this.http.post(`${this.base}/${id}/deploy`, {}); }
  undeploy(id: string): Observable<any> { return this.http.post(`${this.base}/${id}/undeploy`, {}); }
  remove(id: string): Observable<any>   { return this.http.delete(`${this.base}/${id}`); }
}
