export type Trade = {
  TicketID: string
  Symbol: string
  Side: 'Buy' | 'Sell'
  Lots: number
  Open_Time: string
  Close_Time: string
  Open_Price: number
  Close_Price: number
  Profit_USD: number
  Strategy_Tag: string
}
