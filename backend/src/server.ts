import http from 'http';
import dotenv from 'dotenv';
dotenv.config();

import { createApp } from './app';
import { connectDatabase } from './config/database';
import { SocketServer } from './sockets/socketServer';

async function bootstrap() {
  const port = process.env.PORT || 4000;

  // Connect to database
  await connectDatabase();

  const app = createApp();
  const server = http.createServer(app);

  // Initialize Socket.IO server
  new SocketServer(server);

  server.listen(port, () => {
    console.log(`🐾 PAWDOKU Server is running on http://localhost:${port}`);
    console.log(`🎮 Socket.IO listening on port ${port}`);
    console.log(`✨ Ready for cute animal Sudoku battles!`);
  });
}

bootstrap().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
