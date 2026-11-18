import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import type { TaskPersistence } from '@vidbee/task-queue/TaskPersistence.service'
import type { PersistAdapter, PersistTransitionInput, RecordSpawnInput, RecordCloseInput, JournalAppendInput } from './adapter.js'
import type { Task, TaskProgress } from '../types.js'
import { legacyError } from '../bridge/errors.js'
export class NativePersistAdapter implements PersistAdapter {
  constructor(protected readonly service: typeof TaskPersistence.Service, protected readonly execute: <A,E>(effect: Effect.Effect<A,E>)=>Exit.Exit<A,E>) {}
  protected run<A,E>(effect: Effect.Effect<A,E>): A { const result=this.execute(effect);if(Exit.isFailure(result))throw legacyError(result.cause);return result.value }
  async hasTask(id:string) { return this.run(this.service.hasTask(id)) }
  async insertTask(task:Task) { this.run(this.service.insertTask(task)) }
  async upsertTask(input:PersistTransitionInput) { this.run(this.service.upsertTask(input)) }
  async upsertTasks(inputs:PersistTransitionInput[]) { this.run(this.service.upsertTasks(inputs)) }
  async upsertProgress(id:string,progress:TaskProgress) { this.run(this.service.upsertProgress(id,progress)) }
  async deleteTask(id:string) { this.run(this.service.deleteTask(id)) }
  async insertAttempt(input:RecordSpawnInput) { this.run(this.service.insertAttempt(input)) }
  async closeAttempt(input:RecordCloseInput) { this.run(this.service.closeAttempt(input)) }
  async appendJournal(input:JournalAppendInput) { this.run(this.service.appendJournal(input)) }
  async findOpenSpawns() { return this.run(this.service.findOpenSpawns) }
  async loadAllTasks() { return this.run(this.service.loadAllTasks) }
  async loadLatestAttempt(id:string) { return this.run(this.service.loadLatestAttempt(id)) }
  async maintenance() { this.run(this.service.maintenance) }
  close():void { this.run(this.service.close) }
}
