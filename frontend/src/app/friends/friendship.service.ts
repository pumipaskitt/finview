import { Injectable, inject } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { environment } from '../../environments/environment'

export interface FriendResult {
  _id: string
  username: string
  friendshipStatus: 'pending' | 'accepted' | 'rejected' | null
  friendshipId: string | null
  iSentRequest: boolean
}

export interface Friend {
  friendshipId: string
  userId: string
  username: string
}

export interface PendingRequests {
  incoming: Friend[]
  outgoing: Friend[]
}

export interface PrivacySettings {
  showPnL:     boolean
  showWinRate: boolean
  showChart:   boolean
  showTrades:  boolean
  showBalance: boolean
}

@Injectable({ providedIn: 'root' })
export class FriendshipService {
  private http = inject(HttpClient)
  private base = `${environment.apiUrl}/api/friends`

  search(q: string)                    { return this.http.get<FriendResult[]>(`${this.base}/search?q=${q}`) }
  sendRequest(userId: string)          { return this.http.post(`${this.base}/request/${userId}`, {}) }
  accept(friendshipId: string)         { return this.http.post(`${this.base}/accept/${friendshipId}`, {}) }
  remove(friendshipId: string)         { return this.http.delete(`${this.base}/${friendshipId}`) }
  listFriends()                        { return this.http.get<Friend[]>(`${this.base}`) }
  listPending()                        { return this.http.get<PendingRequests>(`${this.base}/pending`) }
  getPrivacy()                         { return this.http.get<PrivacySettings>(`${this.base}/privacy`) }
  updatePrivacy(settings: PrivacySettings) { return this.http.put(`${this.base}/privacy`, settings) }
  getFriendStats(userId: string)       { return this.http.get<any>(`${this.base}/${userId}/stats`) }
}
