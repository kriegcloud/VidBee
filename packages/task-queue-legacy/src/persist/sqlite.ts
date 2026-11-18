import type BetterSqlite3 from 'better-sqlite3'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import { runtimeForHandle, releaseHandle } from '@vidbee/db/legacy'
import { TaskPersistence } from '@vidbee/task-queue/TaskPersistence.service'
import { layerSql, JournalAgeMs } from '@vidbee/task-queue/TaskPersistence.layer'
import { NativePersistAdapter } from './native.js'
interface SqliteLikeStatement {
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint }
  all(...params: unknown[]): unknown[]
  get(...params: unknown[]): unknown
}

// Match better-sqlite3's `transaction()` shape without depending on its types:
// `transaction(fn)` returns the same callable plus `.immediate / .deferred /
// .exclusive` variants. We accept any function shape here because the wrapper
// is a transparent proxy.
type SqliteTransactionFn<F extends (...args: never[]) => unknown> = F & {
  immediate: F
  deferred: F
  exclusive: F
}

interface SqliteLikeDatabase {
  prepare(sql: string): SqliteLikeStatement
  exec(sql: string): void
  pragma(sql: string, opts?: { simple?: boolean }): unknown
  // biome-ignore lint/suspicious/noExplicitAny: structural match against better-sqlite3
  transaction<F extends (...args: any[]) => unknown>(fn: F): SqliteTransactionFn<F>
  close(): void
}

export interface SqlitePersistOptions {
  /** Open better-sqlite3 db; passed in so we don't import it eagerly. */
  db: SqliteLikeDatabase
  /** Override journal-aging window. Default 30 days. */
  journalAgeMs?: number
  /**
   * When false, `close()` does not close the underlying connection. Hosts
   * that share `vidbee.db` with other services must pass false.
   */
  ownsConnection?: boolean
}


export class SqlitePersistAdapter extends NativePersistAdapter {
 private readonly db:SqliteLikeDatabase
 private readonly ownsConnection:boolean
 private readonly handle:BetterSqlite3.Database
 constructor(opts:SqlitePersistOptions) {
  try {opts.db.pragma('journal_mode = WAL');opts.db.pragma('synchronous = NORMAL');opts.db.pragma('foreign_keys = ON')} catch {}
  const rawHandle=opts.db as BetterSqlite3.Database
  let active=false
  const handle=typeof rawHandle.inTransaction==='boolean'?rawHandle:new Proxy(rawHandle,{
   get(target,key){
    if(key==='inTransaction')return active
    if(key==='prepare')return (sql:string)=>{
     const statement=target.prepare(sql)
     return new Proxy(statement,{get(stmt,property){
      if(property==='run')return (...params:unknown[])=>{const result=stmt.run(...params);if(/^BEGIN(?:\s|$)/i.test(sql))active=true;else if(/^(?:COMMIT|ROLLBACK)\s*$/i.test(sql))active=false;return result}
      const value=Reflect.get(stmt,property,stmt)
      return typeof value==='function'?value.bind(stmt):value
     }})
    }
    const value=Reflect.get(target,key,target)
    return typeof value==='function'?value.bind(target):value
   }
  })
  const runtime=runtimeForHandle(handle)
  const service=runtime.runSync(Effect.scoped(Layer.build(layerSql)).pipe(Effect.map(context=>Context.get(context,TaskPersistence))))
  super({...service,maintenance:service.maintenance.pipe(Effect.provideService(JournalAgeMs,opts.journalAgeMs??30*24*60*60*1000))},effect=>runtime.runSyncExit(effect))
  this.db=opts.db;this.ownsConnection=opts.ownsConnection??true;this.handle=handle
 }
 override close():void { if(!this.ownsConnection)return;try {releaseHandle(this.handle);this.db.close()} catch {} }
}
