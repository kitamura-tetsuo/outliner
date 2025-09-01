import http from 'http';
import { WebSocketServer } from 'ws';
import { setupWSConnection } from 'y-websocket/bin/utils';
import pino from 'pino';

const logger = pino({ level: 'info' });

export function createServer(host: string, port: number) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
  });

  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws, req) => {
    logger.info('New connection', { remoteAddress: req.socket.remoteAddress });
    setupWSConnection(ws, req);
  });

  server.listen(port, host, () => {
    logger.info(`Server listening on ws://${host}:${port}`);
  });

  const close = () => {
    wss.close();
    server.close();
  };

  return { server, wss, close };
}
