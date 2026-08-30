// Server-Sent Events broadcaster
// Holds one response object per connected client and pushes events to all of them.

const clients = new Set();

function addClient(res) {
  clients.add(res);
}

function removeClient(res) {
  clients.delete(res);
}

function broadcast(event = 'update') {
  for (const res of clients) {
    res.write(`data: ${event}\n\n`);
  }
}

module.exports = { addClient, removeClient, broadcast };
