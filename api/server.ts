/**
 * Local server entry — boots the HTTP server on :30003 and attaches the
 * WebSocket signaling endpoint at /signal.
 */
import http from 'http'
import app from './app.js'
import { setupSignaling } from './signaling.js'

const PORT = Number(process.env.PORT) || 30003

const server = http.createServer(app)
setupSignaling(server)

server.listen(PORT, () => {
  console.log(`[signal-lab] HTTP + WebSocket signaling listening on :${PORT}`)
  console.log(`  health  → http://localhost:${PORT}/api/health`)
  console.log(`  ws path → ws://localhost:${PORT}/signal`)
})

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received')
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('SIGINT signal received')
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

export default app
