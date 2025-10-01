// Simple JSON DB (works on Replit; on Railway files may reset on redeploy)
import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'

const adapter = new JSONFile('data/orders.json')
export const db = new Low(adapter, { orders: [] })
await db.read()

export function pushOrder(order) {
  db.data.orders.push(order)
  return order
}
