import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Layer from 'effect/Layer'
import { TaskPersistence } from '@vidbee/task-queue/TaskPersistence.service'
import { makeMemory } from '@vidbee/task-queue/TaskPersistence.layer'
import { NativePersistAdapter } from './native.js'
import type { ProcessJournalRow } from '../types.js'
export class MemoryPersistAdapter extends NativePersistAdapter {
  private readonly snapshot:()=>readonly ProcessJournalRow[]
  constructor() {
    const memory=makeMemory()
    const runtime=ManagedRuntime.make(Layer.succeed(TaskPersistence)(memory.service))
    super(memory.service,effect=>runtime.runSyncExit(effect))
    this.snapshot=memory.journalSnapshot
  }
  journalSnapshot():readonly ProcessJournalRow[] {return this.snapshot()}
}
