const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors({
	origin: '*'
  }));
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

io.on('connection', (socket) => {
  socket.onAny((event, data) => {
    socket.broadcast.emit(event, data);
  });
});

server.listen(3069, () => {
  console.log('listening on *:3069');
});