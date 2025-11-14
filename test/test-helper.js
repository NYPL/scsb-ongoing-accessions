require('../app')
global.expect = require('chai').expect

// Express opens a bunch of /tmp/server* sockets during tests, so make sure they're closed on exit:
const exitHandler = require('../index').exitHandler
process.on('exit', exitHandler.bind(null, { cleanup: true }))
process.on('SIGINT', exitHandler.bind(null, { exit: true })) // ctrl+c event
process.on('SIGTSTP', exitHandler.bind(null, { exit: true })) // ctrl+v event
process.on('uncaughtException', exitHandler.bind(null, { exit: true }))

after(function () {
  exitHandler({ exit: true })
})
