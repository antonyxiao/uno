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
    ROOMS[roomId] = { manager: data.createRoomUserId, 
                      started: false, 
                      players: {}, 
                      deck: [], 
                      discardPile: [], 
                      gameType: '', 
                      rules: {
                        playMultiple: false,
                        draw2Stack: false,
                        draw4Stack: false,
                        draw4OnDraw2: false,
                        draw2OnDraw4: false
                      }, 
                      chat: []};
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
  
  // rule update
  socket.on('ruleUpdate', (data) => {
    const room = ROOMS[data.roomId];

    if (room.manager == data.userId) {
      room.rules[data.rule] = data.active;
      //console.log(room.rules);
    }

  })

  // clicks ready in waiting room
  socket.on('ready', (data) => {
    console.log(`${data.userId} is readyb`)
    ROOMS[data.roomId].players[data.userId].isReady = true;
    var allReady = true;
    for (let uid in ROOMS[data.roomId].players) {
      console.log('update id: ' + uid);
      SOCKET_LIST[uid].emit('updateWaitingRoom', ROOMS[data.roomId]);
      // check whether all players are ready
      if (ROOMS[data.roomId].players[uid].isReady == false) {
        allReady = false;
      }
    }

    if (allReady) {
      const deck = generateUnoDeck();
      const shuffledDeck = shuffleDeck(deck);

      const room = ROOMS[data.roomId];

      // get top card for discard      
      room.discardPile = shuffledDeck.shift();

      room.deck = shuffledDeck;

        
      for (let uid in room.players) {
        const deal = dealCards(room.deck);
        room.players[uid].hand = deal['deal'];
        room.deck = deal['updatedDeck'];
        //console.log(ROOMS[data.roomId].players[uid]);
        //console.log(ROOMS[data.roomId].deck.length);

        //console.log(obfuscatedPlayers);
        console.log(room.players[uid].hand);

      }// for uid in room.players

      for (let uid in room.players) {
        
        var obfuscatedPlayers = {};
        // only shows the number of cards the other players have
        for (let player of Object.keys(room.players)) {
          if (player != uid) {
            obfuscatedPlayers[room.players[player].username] = room.players[player].hand.length;
          }
        }

        SOCKET_LIST[uid].emit('gameStarted', { 
          started: true, 
          deal: room.players[uid].hand, 
          obfPlayers: obfuscatedPlayers,
          discardPile: room.discardPile
        });
      }

    }// if allReady
    
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

// populates list with original uno cards
function generateUnoDeck() {
  const colors = ['red', 'blue', 'green', 'yellow'];
  const numbers = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const specialCards = ['Draw 2', 'Reverse', 'Skip'];
  const deck = [];

  // Add number cards
  colors.forEach(color => {
      // One 0 card
      deck.push(`${color} 0`);
      // Two of each number card 1-9
      numbers.slice(1).forEach(number => {
          deck.push(`${color} ${number}`);
          deck.push(`${color} ${number}`);
      });
  });

  // Add special cards
  colors.forEach(color => {
      specialCards.forEach(card => {
          deck.push(`${color} ${card}`);
          deck.push(`${color} ${card}`);
      });
  });

  // Add Wild cards
  for (let i = 0; i < 4; i++) {
      deck.push('Wild');
      deck.push('Wild Draw 4');
  }

  return deck;
}

function shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]]; // Swap elements
    }
    return deck;
}

function dealCards(deck, numCards = 7) {
    if (deck.length < numCards) {
        throw new Error('Not enough cards in the deck to draw the requested number of cards.');
    }

    const drawnCards = [];
    for (let i = 0; i < numCards; i++) {
        const randomIndex = Math.floor(Math.random() * deck.length);
        drawnCards.push(deck[randomIndex]);
        deck.splice(randomIndex, 1);  // Remove the drawn card from the deck
    }

    return { 'deal': drawnCards, 'updatedDeck': deck };
}

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
