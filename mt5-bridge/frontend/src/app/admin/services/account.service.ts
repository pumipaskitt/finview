import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import { Account, CreateAccountDto, Position, Trade, Summary } from '../models/account.model';

@Injectable({ providedIn: 'root' })
export class AccountService {
  private base = 'http://localhost:3000/api/accounts';
  private ws!: WebSocket;
  wsUpdates$ = new Subject<{ event: string; data: any }>();

  constructor(private http: HttpClient) {
    this.connectWS();
  }

  private connectWS() {
    this.ws = new WebSocket('ws://localhost:3000');
    this.ws.onmessage = (msg) => {
      try { this.wsUpdates$.next(JSON.parse(msg.data)); } catch {}
    };
    this.ws.onclose = () => setTimeout(() => this.connectWS(), 3000);
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
