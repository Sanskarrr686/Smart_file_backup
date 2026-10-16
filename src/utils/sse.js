// src/utils/sse.js
// Server-Sent Events manager for broadcasting real-time updates to connected clients

class SSEManager {
  constructor() {
    this.clients = new Set();
  }

  addClient(req, res) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    res.write(": heartbeat\n\n");
    this.clients.add(res);

    req.on("close", () => {
      this.clients.delete(res);
    });
  }

  broadcast(event) {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of this.clients) {
      try {
        client.write(payload);
      } catch (e) {
        this.clients.delete(client);
      }
    }
  }
}

const sseManager = new SSEManager();
module.exports = sseManager;
