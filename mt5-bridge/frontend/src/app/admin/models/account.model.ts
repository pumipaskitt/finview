export interface AccountInfo {
  balance: number; equity: number; margin: number;
  freeMargin: number; profit: number; currency: string; leverage: number;
}
export interface Account {
  _id: string; name: string; login: string; server: string;
  status: 'stopped' | 'connecting' | 'connected' | 'error';
  deployed: boolean; running: boolean;
  info: AccountInfo; errorMsg: string; lastSync: string;
}
export interface Position {
  ticket: string; symbol: string; type: 'buy' | 'sell';
  volume: number; openPrice: number; currentPrice: number;
  profit: number; swap: number; openTime: string;
}
export interface Trade {
  ticket: string; symbol: string; type: string;
  volume: number; price: number; profit: number;
  swap: number; commission: number; time: string;
}
export interface Summary {
  totalProfit: number; totalTrades: number; winTrades: number; lossTrades: number;
}
export interface CreateAccountDto {
  name: string; login: string; password: string; server: string;
}
