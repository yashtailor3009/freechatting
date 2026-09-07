import "dotenv/config";
import express, { NextFunction, Request, Response } from 'express';
import cors from "cors";
import connectDB from "./config/db.js";
import { clerkMiddleware } from '@clerk/express'
import userRouter from "./routes/userRoutes.js";
import messageRouter from "./routes/messageRoutes.js";
import storyRouter from "./routes/storyRoutes.js";
import http from 'http'
import { initSocketServer } from "./socket/socketManager.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

await connectDB();

// ✅ CORS: Sabko allow karo (Localhost + Production dono kaam karega)
app.use(cors());

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ✅ Clerk middleware
app.use(clerkMiddleware());

app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ✅ PORT: Render ke liye 10000, localhost ke liye 3000
const port = process.env.PORT || 3000;

app.get('/', (req: Request, res: Response) => {
  res.send('Server is Live!');
});

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ✅ Serve uploaded files
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.use("/api/users", userRouter);
app.use("/api/messages", messageRouter);
app.use("/api/stories", storyRouter);

//  404 HANDLER 
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.path}`
  });
});

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error details:', {
    message: err?.message,
    stack: err?.stack,
    name: err?.name
  });
  
  res.status(err?.status || 500).json({
    success: false,
    message: err?.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err?.stack })
  });
});

const server = http.createServer(app);

initSocketServer(server);

server.listen(port, () => {
  console.log(`=================================`);
  console.log(`🚀 Server is running at http://localhost:${port}`);
  console.log(`📡 WebSocket server attached`);
  console.log(`=================================`);
});

export default app;