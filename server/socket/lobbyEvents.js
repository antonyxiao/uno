import { Player } from '../game/Player.js';
import { BotPlayer, getRandomBotName } from '../game/BotPlayer.js';
import { generatePlayerId } from '../utils/idGenerator.js';
import { sanitizeString, isValidRoomCode, isValidPlayerName } from '../utils/validation.js';
import { logger } from '../utils/logger.js';

export function registerLobbyEvents(socket, io, roomManager) {

  socket.on('create-room', ({ playerName }, callback) => {
    try {
      const name = sanitizeString(playerName || 'Player', 20);
      if (!isValidPlayerName(name)) {
        return callback({ success: false, error: 'Invalid name' });
      }

      const player = new Player(socket.playerId, name);
      const room = roomManager.createRoom(player);

      socket.join(room.code);
      socket.roomCode = room.code;

      callback({
        success: true,
        room: room.toJSON(),
        playerId: socket.playerId,
      });
    } catch (e) {
      logger.error('Error creating room', { error: e.message });
      callback({ success: false, error: 'Failed to create room' });
    }
  });

  socket.on('join-room', ({ roomCode, playerName }, callback) => {
    try {
      const code = (roomCode || '').toUpperCase().trim();
      const name = sanitizeString(playerName || 'Player', 20);

      if (!isValidRoomCode(code)) {
        return callback({ success: false, error: 'Invalid room code' });
      }
      if (!isValidPlayerName(name)) {
        return callback({ success: false, error: 'Invalid name' });
      }

      const player = new Player(socket.playerId, name);
      const result = roomManager.joinRoom(code, player);

      if (!result.success) {
        return callback(result);
      }

      socket.join(code);
      socket.roomCode = code;

      // Broadcast updated room to all in room
      io.to(code).emit('room-updated', result.room.toJSON());

      callback({
        success: true,
        room: result.room.toJSON(),
        playerId: socket.playerId,
      });
    } catch (e) {
      logger.error('Error joining room', { error: e.message });
      callback({ success: false, error: 'Failed to join room' });
    }
  });

  socket.on('leave-room', (_, callback) => {
    try {
      const code = socket.roomCode;
      if (!code) return callback?.({ success: false, error: 'Not in a room' });

      const result = roomManager.leaveRoom(code, socket.playerId);
      socket.leave(code);
      socket.roomCode = null;

      if (!result.roomDeleted) {
        const room = roomManager.getRoomByCode(code);
        if (room) {
          io.to(code).emit('room-updated', room.toJSON());
        }
      }

      callback?.({ success: true });
    } catch (e) {
      logger.error('Error leaving room', { error: e.message });
      callback?.({ success: false, error: 'Failed to leave room' });
    }
  });

  socket.on('update-settings', ({ settings }, callback) => {
    try {
      const code = socket.roomCode;
      const room = roomManager.getRoomByCode(code);
      if (!room) return callback?.({ success: false, error: 'Room not found' });
      if (!room.isHost(socket.playerId)) {
        return callback?.({ success: false, error: 'Only host can change settings' });
      }

      room.updateSettings(settings);
      io.to(code).emit('room-updated', room.toJSON());
      callback?.({ success: true });
    } catch (e) {
      logger.error('Error updating settings', { error: e.message });
      callback?.({ success: false, error: 'Failed to update settings' });
    }
  });

  socket.on('add-bot', ({ difficulty }, callback) => {
    try {
      const code = socket.roomCode;
      const room = roomManager.getRoomByCode(code);
      if (!room) return callback?.({ success: false, error: 'Room not found' });
      if (!room.isHost(socket.playerId)) {
        return callback?.({ success: false, error: 'Only host can add bots' });
      }

      const botId = generatePlayerId();
      const botName = getRandomBotName();
      const bot = new BotPlayer(botId, botName, difficulty || 'medium');
      const result = room.addPlayer(bot);

      if (!result.success) return callback?.(result);

      io.to(code).emit('room-updated', room.toJSON());
      callback?.({ success: true, botId });
    } catch (e) {
      logger.error('Error adding bot', { error: e.message });
      callback?.({ success: false, error: 'Failed to add bot' });
    }
  });

  socket.on('remove-bot', ({ botId }, callback) => {
    try {
      const code = socket.roomCode;
      const room = roomManager.getRoomByCode(code);
      if (!room) return callback?.({ success: false, error: 'Room not found' });
      if (!room.isHost(socket.playerId)) {
        return callback?.({ success: false, error: 'Only host can remove bots' });
      }

      const bot = room.getPlayer(botId);
      if (!bot || !bot.isBot) {
        return callback?.({ success: false, error: 'Bot not found' });
      }

      room.removePlayer(botId);
      io.to(code).emit('room-updated', room.toJSON());
      callback?.({ success: true });
    } catch (e) {
      logger.error('Error removing bot', { error: e.message });
      callback?.({ success: false, error: 'Failed to remove bot' });
    }
  });

  socket.on('kick-player', ({ targetId }, callback) => {
    try {
      const code = socket.roomCode;
      const room = roomManager.getRoomByCode(code);
      if (!room) return callback?.({ success: false, error: 'Room not found' });
      if (!room.isHost(socket.playerId)) {
        return callback?.({ success: false, error: 'Only host can kick players' });
      }
      if (targetId === socket.playerId) {
        return callback?.({ success: false, error: 'Cannot kick yourself' });
      }

      room.removePlayer(targetId);

      // Notify kicked player
      const kickedSocket = [...io.sockets.sockets.values()].find(s => s.playerId === targetId);
      if (kickedSocket) {
        kickedSocket.emit('kicked');
        kickedSocket.leave(code);
        kickedSocket.roomCode = null;
      }

      io.to(code).emit('room-updated', room.toJSON());
      callback?.({ success: true });
    } catch (e) {
      logger.error('Error kicking player', { error: e.message });
      callback?.({ success: false, error: 'Failed to kick player' });
    }
  });

  socket.on('start-game', (_, callback) => {
    try {
      const code = socket.roomCode;
      const room = roomManager.getRoomByCode(code);
      if (!room) return callback?.({ success: false, error: 'Room not found' });
      if (!room.isHost(socket.playerId)) {
        return callback?.({ success: false, error: 'Only host can start game' });
      }

      const result = room.startGame();
      if (!result.success) return callback?.(result);

      // Send personalized game state to each player
      for (const player of room.players) {
        if (player.isBot) continue;
        const playerSocket = [...io.sockets.sockets.values()].find(s => s.playerId === player.id);
        if (playerSocket) {
          playerSocket.emit('game-started', room.gameEngine.getGameState(player.id));
        }
      }

      callback?.({ success: true });

      // Handle starting card effects that need bot action
      _handleBotTurnIfNeeded(room, io);
    } catch (e) {
      logger.error('Error starting game', { error: e.message });
      callback?.({ success: false, error: 'Failed to start game' });
    }
  });

  socket.on('room-state', (_, callback) => {
    try {
      const code = socket.roomCode;
      const room = roomManager.getRoomByCode(code);
      if (!room) return callback?.({ success: false, error: 'Room not found' });
      callback?.({ success: true, room: room.toJSON() });
    } catch (e) {
      callback?.({ success: false, error: 'Failed to get room state' });
    }
  });
}

export function _handleBotTurnIfNeeded(room, io) {
  if (!room.gameEngine || room.status !== 'playing') return;

  const engine = room.gameEngine;
  const currentPlayer = engine.getCurrentPlayer();

  if (currentPlayer && currentPlayer.isBot) {
    _executeBotTurn(room, io);
  }
}

export function _executeBotTurn(room, io) {
  if (!room.gameEngine || room.status !== 'playing') return;

  const engine = room.gameEngine;
  const currentPlayer = engine.getCurrentPlayer();

  if (!currentPlayer || !currentPlayer.isBot) return;

  const delay = 500 + Math.random() * 1500;
  const timer = setTimeout(() => {
    try {
      _doBotAction(room, io, currentPlayer);
    } catch (e) {
      logger.error('Bot error', { error: e.message });
    }
  }, delay);

  room.botTimers.push(timer);
}

function _doBotAction(room, io, bot) {
  const engine = room.gameEngine;
  if (!engine || engine.state === 'ROUND_OVER' || engine.state === 'GAME_OVER') return;

  // Handle special states
  if (engine.state === 'CHOOSING_COLOR' && engine.waitingForColorChoice === bot.id) {
    const color = bot._pickColor();
    const result = engine.chooseColor(bot.id, color);
    _broadcastGameState(room, io);
    if (result.success) {
      _executeBotTurn(room, io);
    }
    return;
  }

  if (engine.state === 'CHOOSING_SWAP_TARGET' && engine.waitingForSwapTarget === bot.id) {
    const targetId = bot.chooseSwapTarget(engine.players);
    engine.chooseSwapTarget(bot.id, targetId);
    _broadcastGameState(room, io);
    _executeBotTurn(room, io);
    return;
  }

  const topCard = engine.deck.getTopDiscard();

  // Try combo play first
  const combo = bot.chooseComboPlay(topCard, engine.currentColor, engine.ruleEngine);
  if (combo && engine.pendingDrawCount === 0) {
    // Call UNO if combo will leave 1 card
    if (bot.hand.length - combo.cardIds.length === 1 && bot.shouldCallUno()) {
      engine.callUno(bot.id);
      io.to(room.code).emit('uno-called', { playerId: bot.id, playerName: bot.name });
    }

    const comboResult = engine.playCombo(bot.id, combo.cardIds);
    if (comboResult.success) {
      io.to(room.code).emit('combo-played', {
        playerId: bot.id,
        playerName: bot.name,
        cardsPlayed: comboResult.cardsPlayed,
      });

      _broadcastGameState(room, io);

      if (comboResult.roundOver || comboResult.gameOver) {
        _handleGameEnd(room, io, comboResult);
        return;
      }

      _executeBotTurn(room, io);
      return;
    }
  }

  const play = bot.choosePlay(topCard, engine.currentColor, engine.pendingDrawCount, engine.ruleEngine);

  if (play) {
    // Call UNO if down to 2 cards
    if (bot.hand.length === 2 && bot.shouldCallUno()) {
      engine.callUno(bot.id);
      io.to(room.code).emit('uno-called', { playerId: bot.id, playerName: bot.name });
    }

    const result = engine.playCard(bot.id, play.cardId, play.chosenColor);
    if (result.success) {
      io.to(room.code).emit('card-played', {
        playerId: bot.id,
        playerName: bot.name,
        card: engine.lastPlayedCard.toJSON(),
      });

      if (result.needsColorChoice) {
        const color = bot._pickColor();
        engine.chooseColor(bot.id, color);
        io.to(room.code).emit('color-chosen', { color });
      }

      _broadcastGameState(room, io);

      if (result.roundOver || result.gameOver) {
        _handleGameEnd(room, io, result);
        return;
      }

      _executeBotTurn(room, io);
      return;
    }
  }

  // Draw card
  const drawResult = engine.drawCard(bot.id);
  if (drawResult.success) {
    io.to(room.code).emit('card-drawn', {
      playerId: bot.id,
      playerName: bot.name,
      count: drawResult.drawnCount,
    });

    if (drawResult.canPlay && drawResult.drawnCardId) {
      // Bot plays the drawn card
      const drawnCard = bot.getCard(drawResult.drawnCardId);
      if (drawnCard) {
        const playResult = engine.playCard(bot.id, drawResult.drawnCardId,
          drawnCard.isWild() ? bot._pickColor() : null);
        if (playResult.success) {
          _broadcastGameState(room, io);
          if (playResult.roundOver || playResult.gameOver) {
            _handleGameEnd(room, io, playResult);
            return;
          }
        }
      } else {
        engine.keepDrawnCard(bot.id);
      }
    }

    _broadcastGameState(room, io);
    _executeBotTurn(room, io);
  }
}

function _broadcastGameState(room, io) {
  for (const player of room.players) {
    if (player.isBot) continue;
    const playerSocket = [...io.sockets.sockets.values()].find(s => s.playerId === player.id);
    if (playerSocket) {
      playerSocket.emit('game-state-update', room.gameEngine.getGameState(player.id));
    }
  }
}

function _handleGameEnd(room, io, result) {
  if (result.gameOver) {
    io.to(room.code).emit('game-over', {
      winner: result.winner,
      finalStandings: result.finalStandings,
    });
    room.status = 'finished';
  } else if (result.roundOver) {
    io.to(room.code).emit('round-over', {
      winner: result.winner,
      roundScore: result.roundScore,
      handValues: result.handValues,
    });
  }
}
