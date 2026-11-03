"use strict";

/**
 * Server-Sent Events (SSE) broadcaster for real-time order lifecycle updates.
 */

const clients = new Set();

function registerClient(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  // Initial connection acknowledgement
  res.write(`event: connected\ndata: ${JSON.stringify({ connected: true, timestamp: new Date().toISOString() })}\n\n`);

  const client = { res, id: Date.now() + Math.random().toString(36).slice(2) };
  clients.add(client);

  req.on("close", () => {
    clients.delete(client);
  });

  return client;
}

function broadcastEvent(eventType, payload) {
  const data = JSON.stringify(payload);
  const message = `event: ${eventType}\ndata: ${data}\n\n`;

  for (const client of clients) {
    try {
      client.res.write(message);
    } catch (_) {
      clients.delete(client);
    }
  }
}

function getClientCount() {
  return clients.size;
}

// Keepalive heartbeat every 25 seconds
const heartbeat = setInterval(() => {
  for (const client of clients) {
    try {
      client.res.write(": heartbeat\n\n");
    } catch (_) {
      clients.delete(client);
    }
  }
}, 25000);

if (heartbeat.unref) {
  heartbeat.unref();
}

module.exports = {
  registerClient,
  broadcastEvent,
  getClientCount
};

