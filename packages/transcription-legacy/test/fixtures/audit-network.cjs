// Characterization uses injected fetches and fixture executables exclusively.
// Fail closed if a regression accidentally reaches any network or Unix socket.
const net = require('node:net')
const denied = () => { throw new Error('characterization forbids network and session sockets') }
net.Socket.prototype.connect = denied
net.connect = denied
net.createConnection = denied
globalThis.fetch = denied
require('node:module').syncBuiltinESMExports()
