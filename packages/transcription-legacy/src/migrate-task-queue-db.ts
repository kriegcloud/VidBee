import * as Effect from 'effect/Effect'
import * as S from 'effect/Schema'
import * as SqlError from 'effect/sql/SqlError'
import {decodeRow} from '@vidbee/db/Row'
import {runtimeForHandle,rethrowDriverError} from '@vidbee/db/legacy'
import {runLegacySync} from '@vidbee/task-queue-legacy/runtime'
import type Database from 'better-sqlite3'
import {make} from '../../transcription/src/TranscriptMigration.layer'
import {TranscriptMigrationSource} from '../../transcription/src/TranscriptMigration.service'
import {MigrationTable} from '../../transcription/src/TranscriptMigration.model'
import {HostFailure} from '../../transcription/src/Transcription.errors'
import {TranscriptionFilesLegacySync} from './host/files'
import {transcriptionCause} from './bridge/errors'
interface SqliteDatabase {
  exec(sql: string): void
  prepare(sql: string): {
    get(...params: unknown[]): unknown
    run(...params: unknown[]): { changes: number }
  }
  close(): void
}

export interface MergeTaskQueueDbResult {
  merged: boolean
  tasksCopied: number
  attemptsCopied: number
  journalCopied: number
  backupPath: string | null
}


export function mergeLegacyTaskQueueDb(input:{target:SqliteDatabase;legacyPath:string;openLegacy:(path:string)=>SqliteDatabase}):MergeTaskQueueDbResult {
 const runtime=runtimeForHandle(input.target as Database.Database)
 const fail=(operation:string)=>(cause:unknown)=>HostFailure.make({operation,cause,legacyMessage:cause instanceof Error?cause.message:String(cause)})
 const sources=TranscriptMigrationSource.of({open:path=>Effect.acquireRelease(
  Effect.try({try:()=>{
   const db=input.openLegacy(path)
   let closed=false
   const close=Effect.try({try:()=>{if(!closed){closed=true;db.close()}},catch:fail('closeLegacy')})
   return {
    hasTasks:Effect.try({try:()=>db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'").get(),catch:fail('inspectLegacy')}).pipe(
     Effect.flatMap(decodeRow('tasks')(S.UndefinedOr(MigrationTable))),
     Effect.map(row=>Boolean(row?.name))
    ),close
   }
  },catch:fail('openLegacy')}),
  source=>source.close.pipe(Effect.orDie)
 )})
 const effect=Effect.flatMap(make(),migration=>migration.merge({legacyPath:input.legacyPath})).pipe(Effect.provide(TranscriptionFilesLegacySync),Effect.provideService(TranscriptMigrationSource,sources))
 return runLegacySync(runtime,effect,cause=>{const mapped=transcriptionCause(cause);if(SqlError.isSqlError(mapped))return rethrowDriverError(cause);return mapped})
}
