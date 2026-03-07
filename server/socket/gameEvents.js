import { logger } from '../utils/logger.js';
import { isValidColor } from '../utils/validation.js';
import { _executeBotTurn } from './lobbyEvents.js';
import { GAME_CONSTANTS } from '../config.js';

export function registerGameEvents(socket, io, roomManager) {

  socket.on('play-card', ({ cardId, chosenColor }, callback) => {
    try {
      const room = _getRoom(socket, roomManager);
      if (!room || !room.gameEngine) return callback?.({ success: false, error: 'No active game' });

      const result = room.gameEngine.playCard(socket.playerId, cardId, chosenColor);
      if (!result.success) return callback?.(result);

      io.to(room.code).emit('card-played', {
        playerId: socket.playerId,
        card: room.gameEngine.lastPlayedCard.toJSON(),
      });

      if (result.needsColorChoice) {
        callback?.({ success: true, needsColorChoice: true });
        return;
      }

      _broadcastState(room, io);
      callback?.({ success: true });

      if (result.roundOver || result.gameOver) {
        _handleEnd(room, io, result);
        return;
      }

      _resetTurnTimer(room, io, roomManager);
      _executeBotTurn(room, io);
    } catch (e) {
      logger.error('Error playing card', { error: e.message });
      callback?.({ success: false, error: 'Failed to play card' });
    }
  });

  socket.on('play-combo', ({ cardIds }, callback) => {
    try {
      const room = _getRoom(socket, roomManager);
      if (!room || !room.gameEngine) return callback?.({ success: false, error: 'No active game' });

      const result = room.gameEngine.playCombo(socket.playerId, cardIds);
      if (!result.success) return callback?.(result);

      // Gather the played cards info for the event
      io.to(room.code).emit('combo-played', {
        playerId: socket.playerId,
        cardsPlayed: result.cardsPlayed,
      });

      _broadcastState(room, io);
      callback?.({ success: true });

      if (result.roundOver || result.gameOver) {
        _handleEnd(room, io, result);
        return;
      }

      _resetTurnTimer(room, io, roomManager);
      _executeBotTurn(room, io);
    } catch (e) {
      logger.error('Error playing combo', { error: e.message });
      callback?.({ success: false, error: 'Failed to play combo' });
    }
  });

  socket.on('draw-card', (_, callback) => {
    try {
      const room = _getRoom(socket, roomManager);
      if (!room || !room.gameEngine) return callback?.({ success: false, error: 'No active game' });

      const result = room.gameEngine.drawCard(socket.playerId);
      if (!result.success) return callback?.(result);

      io.to(room.code).emit('card-drawn', {
        playerId: socket.playerId,
        count: result.drawnCount,
      });

      _broadcastState(room, io);

      callback?.({
        success: true,
        drawnCount: result.drawnCount,
        cards: result.cards,
        canPlay: result.canPlay,
        drawnCardId: result.drawnCardId,
      });

      _resetTurnTimer(room, io, roomManager);
      _executeBotTurn(room, io);
    } catch (e) {
      logger.error('Error drawing card', { error: e.message });
      callback?.({ success: false, error: 'Failed to draw card' });
    }
  });

  socket.on('keep-or-play', ({ action, cardId, chosenColor }, callback) => {
    try {
      const room = _getRoom(socket, roomManager);
      if (!room || !room.gameEngine) return callback?.({ success: false, error: 'No active game' });

      if (action === 'play' && cardId) {
        const result = room.gameEngine.playCard(socket.playerId, cardId, chosenColor);
        _broadcastState(room, io);
        callback?.(result);
        if (result.roundOver || result.gameOver) {
          _handleEnd(room, io, result);
        }
      } else {
        const result = room.gameEngine.keepDrawnCard(socket.playerId);
        _broadcastState(room, io);
        callback?.(result);
      }

      _resetTurnTimer(room, io, roomManager);
      _executeBotTurn(room, io);
    } catch (e) {
      logger.error('Error keep-or-play', { error: e.message });
      callback?.({ success: false, error: 'Failed to process action' });
    }
  });

  socket.on('call-uno', (_, callback) => {
    try {
      const room = _getRoom(socket, roomManager);
      if (!room || !room.gameEngine) return callback?.({ success: false, error: 'No active game' });

      const result = room.gameEngine.callUno(socket.playerId);
      if (result.success) {
        const player = room.gameEngine.players.find(p => p.id === socket.playerId);
        io.to(room.code).emit('uno-called', {
          playerId: socket.playerId,
          playerName: player?.name,
        });
      }
      callback?.(result);
    } catch (e) {
      callback?.({ success: false, error: 'Failed to call UNO' });
    }
  });

  socket.on('challenge-uno', ({ targetId }, callback) => {
    try {
      const room = _getRoom(socket, roomManager);
      if (!room || !room.gameEngine) return callback?.({ success: false, error: 'No active game' });

      const result = room.gameEngine.challengeUno(socket.playerId, targetId);
      if (result.success && result.caught) {
        io.to(room.code).emit('uno-challenged', {
          challengerId: socket.playerId,
          targetId,
          caught: true,
          penaltyCards: result.penaltyCards,
        });
        _broadcastState(room, io);
      }
      callback?.(result);
    } catch (e) {
      callback?.({ success: false, error: 'Failed to challenge UNO' });
    }
  });

  socket.on('choose-color', ({ color }, callback) => {
    try {
      const room = _getRoom(socket, roomManager);
      if (!room || !room.gameEngine) return callback?.({ success: false, error: 'No active game' });

      if (!isValidColor(color)) return callback?.({ success: false, error: 'Invalid color' });

      const result = room.gameEngine.chooseColor(socket.playerId, color);
      if (result.success) {
        io.to(room.code).emit('color-chosen', { color, playerId: socket.playerId });
        _broadcastState(room, io);

        if (result.roundOver || result.gameOver) {
          _handleEnd(room, io, result);
          return;
        }

        _resetTurnTimer(room, io, roomManager);
        _executeBotTurn(room, io);
      }
      callback?.(result);
    } catch (e) {
      callback?.({ success: false, error: 'Failed to choose color' });
    }
  });

  socket.on('swap-target', ({ targetId }, callback) => {
    try {
      const room = _getRoom(socket, roomManager);
      if (!room || !room.gameEngine) return callback?.({ success: false, error: 'No active game' });

      const result = room.gameEngine.chooseSwapTarget(socket.playerId, targetId);
      if (result.success) {
        _broadcastState(room, io);
        _resetTurnTimer(room, io, roomManager);
        _executeBotTurn(room, io);
      }
      callback?.(result);
    } catch (e) {
      callback?.({ success: false, error: 'Failed to swap' });
    }
  });

  socket.on('game-state', (_, callback) => {
    try {
      const room = _getRoom(socket, roomManager);
      if (!room || !room.gameEngine) return callback?.({ success: false, error: 'No active game' });

      const state = room.gameEngine.getGameState(socket.playerId);
      callback?.({ success: true, state });
    } catch (e) {
      callback?.({ success: false, error: 'Failed to get game state' });
    }
  });

  socket.on('chat-message', ({ message }) => {
    try {
      const code = socket.roomCode;
      if (!code) return;

      const room = roomManager.getRoomByCode(code);
      if (!room) return;

      const player = room.getPlayer(socket.playerId);
      if (!player) return;

      const text = (message || '').trim().slice(0, 200);
      if (!text) return;

      io.to(code).emit('chat-message', {
        playerId: socket.playerId,
        playerName: player.name,
        message: text,
        timestamp: Date.now(),
      });
    } catch (e) {
      logger.error('Error with chat', { error: e.message });
    }
  });

  socket.on('rematch', (_, callback) => {
    try {
      const room = _getRoom(socket, roomManager);
      if (!room) return callback?.({ success: false, error: 'Room not found' });

      if (room.gameEngine && room.gameEngine.state === 'ROUND_OVER') {
        const result = room.gameEngine.startNextRound();
        if (result) {
          _broadcastState(room, io);
          _executeBotTurn(room, io);
          callback?.({ success: true });
          return;
        }
      }

      // Full rematch - restart game
      room.status = 'waiting';
      room.gameEngine = null;
      io.to(room.code).emit('room-updated', room.toJSON());
      callback?.({ success: true, backToLobby: true });
    } catch (e) {
      callback?.({ success: false, error: 'Failed to rematch' });
    }
  });
}

function _getRoom(socket, roomManager) {
  const code = socket.roomCode;
  if (!code) return null;
  return roomManager.getRoomByCode(code);
}

function _broadcastState(room, io) {
  for (const player of room.players) {
    if (player.isBot) continue;
    const playerSocket = [...io.sockets.sockets.values()].find(s => s.playerId === player.id);
    if (playerSocket) {
      playerSocket.emit('game-state-update', room.gameEngine.getGameState(player.id));
    }
  }
}

function _handleEnd(room, io, result) {
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

function _resetTurnTimer(room, io, roomManager) {
  if (room.turnTimer) clearTimeout(room.turnTimer);

  const engine = room.gameEngine;
  if (!engine || engine.state !== 'PLAYING') return;

  const currentPlayer = engine.getCurrentPlayer();
  if (!currentPlayer || currentPlayer.isBot) return;

  room.turnTimer = setTimeout(() => {
    // Auto-draw for timed-out player
    const result = engine.drawCard(currentPlayer.id);
    if (result.success) {
      if (result.canPlay) {
        engine.keepDrawnCard(currentPlayer.id);
      }
      io.to(room.code).emit('turn-timeout', { playerId: currentPlayer.id });
      _broadcastState(room, io);
      _executeBotTurn(room, io);
    }
  }, GAME_CONSTANTS.TURN_TIMEOUT_MS);
}
