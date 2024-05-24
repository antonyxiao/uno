const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const cookieParser = require('cookie-parser');
const { userInfo } = require('os');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(cookieParser());

const PORT = process.env.PORT || 4000;

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

var SOCKET_LIST = {};
var ROOM_CODE = null;
var ROOMS = {};
var COOKIE_MAP = {};

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.get('/:roomId', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
  ROOM_CODE = req.params.roomId;
});

var Player = function(id){
  var self = {
    id: '',
    username: '',
    isReady: false,
    hand: []
  }
  self.id = id

  Player.list[id] = self;

  return self;
}

Player.list = {};

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  SOCKET_LIST[socket.id] = socket;

  // Read cookies from the client
  const cookies = socket.handshake.headers.cookie;

  /*
  if (cookies) {
    const parsedCookies = parseCookies(cookies);
    const clientPlayerId = parsedCookies.playerId;
    console.log('Previous client player ID from cookie:', clientPlayerId);

    if (clientPlayerId && COOKIE_MAP[clientPlayerId]) {
      const oldSocketId = COOKIE_MAP[clientPlayerId];
      SOCKET_LIST[oldSocketId] = socket;
      console.log('Reconnected socket with old ID:', oldSocketId);
    } else {
      // Player ID exists in cookies, but not in the server map
      COOKIE_MAP[clientPlayerId] = socket.id;
      SOCKET_LIST[socket.id] = socket;
      console.log('New socket connection for existing player ID:', clientPlayerId);
    }

  } else {
    console.log('New player connection');
    const newPlayerId = generatePlayerId(); // Implement this function to generate a unique player ID
    socket.emit('setCookie', { playerId: newPlayerId });
    COOKIE_MAP[newPlayerId] = socket.id;
    SOCKET_LIST[socket.id] = socket;
    console.log('Assigned new player ID:', newPlayerId);
  }
  */

  console.log(`Socket Count: ${Object.keys(SOCKET_LIST).length}`);

  // not sure 
  Player.onConnect(socket);

  // provide the new user id to the client    
  socket.emit('newUserId',{
    newUserId:socket.id
  });

  // if room code was in the URL
  if (ROOM_CODE) {
    socket.emit('roomCode', {code:ROOM_CODE});
    ROOM_CODE = null;
  }

  // creating a room
  socket.on('createRoom', (data) => {
    const roomId = uuidv4();
    ROOMS[roomId] = { players: {}, started: false, deck: [] , gameType: null};
    socket.join(roomId);
    socket.emit('roomCreated', roomId);
    console.log(`Room created: ${roomId} by ${data.createRoomUserId}`);
    console.log(`Current rooms: ${JSON.stringify(ROOMS)}`);
  });

  // joining a room
  socket.on('joinRoom', (data) => {
    const roomExists = data.roomId in ROOMS;
    socket.emit('roomExists',roomExists);
  });

  // submits username
  socket.on('joinWaitingRoom', (data) => {
    var player = Player(data.userId);
    player.username = data.username;
    ROOMS[data.roomId].players[data.userId] = player;
    
    console.log(ROOMS[data.roomId]);
    
    for (let uid in ROOMS[data.roomId].players) {
      console.log('update id: ' + uid);
      SOCKET_LIST[uid].emit('updateWaitingRoom', ROOMS[data.roomId]);
    }
  });

  // clicks ready in waiting room
  socket.on('ready', (data) => {
    console.log(`${data.userId} is readyb`)
    ROOMS[data.roomId].players[data.userId].isReady = true;
    for (let uid in ROOMS[data.roomId].players) {
      console.log('update id: ' + uid);
      SOCKET_LIST[uid].emit('updateWaitingRoom', ROOMS[data.roomId]);
    }
  });

  // clicks quit in waiting room
  socket.on('quitWaitingRoom', (data) => {
    console.log(`${data.userId} quit waiting`)

    const room = ROOMS[data.roomId];

    room.players[data.userId].isReady = false;
    delete room.players[data.userId];

    for (let uid in room.players) {
      SOCKET_LIST[uid].emit('updateWaitingRoom', room);
    }
    
    if (Object.keys(room.players).length === 0) {
      delete ROOMS[data.roomId];
      console.log(`Room deleted: ${data.roomId}`);
    }

  });
  

  // player disconnects
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    delete SOCKET_LIST[socket.id];
    delete Player.list[socket.id];
    /*
    const clientPlayerId = getPlayerIdFromSocket(socket.id); // Implement this function to retrieve player ID using socket ID
    if (clientPlayerId) {
      delete SOCKET_LIST[socket.id];
      console.log('Player disconnected:', clientPlayerId);
    }
    */
    
    for (const roomId in ROOMS) {

      const room = ROOMS[roomId];
      delete room.players[socket.id];
      
      for (let uid in room.players) {
        SOCKET_LIST[uid].emit('updateWaitingRoom', room);
      }   


      if (Object.keys(room.players).length === 0) {
        delete ROOMS[roomId];
        console.log(`Room deleted: ${roomId}`);
      } else {
        //io.to(roomId).emit('playerLeft', ROOMS[roomId].players.map(player => ({ username: player.username, ready: player.ready })));
      }
    }
  });

});

// not sure
Player.onConnect = function(socket){
  var player = Player(socket.id);
}

// Function to parse cookies
function parseCookies(cookieString) {
  return cookieString.split(';').reduce((cookies, cookie) => {
    const [name, value] = cookie.split('=').map(c => c.trim());
    cookies[name] = value;
    return cookies;
  }, {});
}

// returns Player object with id in a list of players
function findPlayerById(players, id) {
  return players.find(player => player.id === id);
}

function generatePlayerId() {
  // Implement your logic to generate a unique player ID
  return 'player' + Math.floor(Math.random()*10000);
}

function getPlayerIdFromSocket(socketId) {
  for (const [playerId, id] of Object.entries(COOKIE_MAP)) {
    if (id === socketId) {
      return playerId;
    }
  }
  return null;
}

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
