import { Injectable, inject } from '@angular/core'
import { HttpClient } from '@angular/common/http'

import { StatsResponse } from '../models/stats'
import { environment } from '../../environments/environment'

@Injectable({ providedIn: 'root' })
export class TradeService {
  private readonly http = inject(HttpClient)
  private readonly apiBaseUrl = environment.apiUrl

  getStats() {
    return this.http.get<StatsResponse>(`${this.apiBaseUrl}/api/stats`)
  }
}
