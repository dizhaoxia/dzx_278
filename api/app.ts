/**
 * Express application — HTTP surface for the signaling service.
 * WebSocket signaling is attached to the same HTTP server in server.ts.
 */
import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

dotenv.config()

const app: express.Application = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

app.get('/', (_req: Request, res: Response): void => {
  res.json({
    name: 'signal-lab',
    service: 'webrtc-screen-share-signaling',
    ws: '/signal',
    health: '/api/health',
  })
})

app.use(
  '/api/health',
  (_req: Request, res: Response): void => {
    res.status(200).json({ success: true, message: 'ok', service: 'signaling' })
  },
)

app.use(
  (error: Error, _req: Request, res: Response, _next: NextFunction): void => {
    void error
    void _next
    res.status(500).json({ success: false, error: 'Server internal error' })
  },
)

app.use((_req: Request, res: Response): void => {
  res.status(404).json({ success: false, error: 'API not found' })
})

export default app
