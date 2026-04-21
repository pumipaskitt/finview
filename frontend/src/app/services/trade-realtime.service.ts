import { Injectable } from '@angular/core'
import { io, Socket } from 'socket.io-client'

import { Trade } from '../models/trade'
import { environment } from '../../environments/environment'

@Injectable({ providedIn: 'root' })
export class TradeRealtimeService {
  private readonly socket: Socket = io(environment.apiUrl, {
    autoConnect: true,
    reconnection: true,
  })

  constructor() {
    this.socket.on('connect', () => {
      console.log('[socket] connected ', this.socket.id)
    })

    this.socket.on('disconnect', (reason) => {
      console.log('[socket] disconnected', reason)
    })

    this.socket.on('connect_error', (error) => {
      console.error('[socket] connect_error', error)
    })
  }

  onNewTrade(handler: (trade: Trade) => void) {
    this.socket.on('new_trade', handler)
  }

  offNewTrade(handler: (trade: Trade) => void) {
    this.socket.off('new_trade', handler)
  }
}
