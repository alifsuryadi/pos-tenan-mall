import Dexie, { type EntityTable } from 'dexie'
import type { Audit, Held, Product, Rekap, Sale, Settings, Shift, StockMove, Tenant, User } from '../domain/schemas'

export type StoredRekap = Rekap & { id: string; importedAt: string }

export class PosDB extends Dexie {
  tenants!: EntityTable<Tenant, 'id'>
  users!: EntityTable<User, 'id'>
  products!: EntityTable<Product, 'id'>
  sales!: EntityTable<Sale, 'id'>
  shifts!: EntityTable<Shift, 'id'>
  stockMoves!: EntityTable<StockMove, 'id'>
  audit!: EntityTable<Audit, 'id'>
  held!: EntityTable<Held, 'id'>
  settings!: EntityTable<Settings, 'tenantId'>
  rekap!: EntityTable<StoredRekap, 'id'>

  constructor() {
    super('pos-tenan-mall')
    this.version(1).stores({
      tenants: 'id',
      users: 'id, tenantId',
      products: 'id, tenantId, [tenantId+sku]',
      sales: 'id, tenantId, shiftId, [tenantId+createdAt]',
      shifts: 'id, tenantId, [tenantId+openedAt]',
      stockMoves: 'id, tenantId, [tenantId+at]',
      audit: 'id, tenantId, [tenantId+at]',
      held: 'id, tenantId',
      settings: 'tenantId',
      rekap: 'id, month, tenantId',
    })
  }
}

export const db = new PosDB()

export const ALL_TABLES = [
  db.tenants,
  db.users,
  db.products,
  db.sales,
  db.shifts,
  db.stockMoves,
  db.audit,
  db.held,
  db.settings,
  db.rekap,
]
