// Imported only by negative worker children. A guard regression must fail the
// test without ever falling through to a host-network CDP endpoint.
globalThis.fetch = () => { throw new Error('Safety test refused attempted network access') }
globalThis.WebSocket = class {
  constructor() { throw new Error('Safety test refused attempted WebSocket access') }
}
