import { logger } from '../utils/logger.js';
import { RoomManager } from '../rooms/RoomManager.js';
import { registerLobbyEvents } from './lobbyEvents.js';
import { registerGameEvents } from './gameEvents.js';
import { generatePlayerId } from '../utils/idGenerator.js';
import { GAME_CONSTANTS } from '../config.js';

let roomManager;

export function setupSocketHandler(io, db = null) {
  roomManager = new RoomManager(db);
  roomManager.startCleanupInterval();

  io.on('connection', (socket) => {
    // Assign a player ID to this socket
    socket.playerId = generatePlayerId();
    socket.roomCode = null;

    logger.debug('Client connected', { socketId: socket.id, playerId: socket.playerId });

    // Register event handlers
    registerLobbyEvents(socket, io, roomManager);
    registerGameEvents(socket, io, roomManager);

    // Handle disconnection
    socket.on('disconnect', () => {
      logger.debug('Client disconnected', { socketId: socket.id, playerId: socket.playerId });

      const code = socket.roomCode;
      if (code) {
        const room = roomManager.getRoomByCode(code);
        if (room) {
          const player = room.getPlayer(socket.playerId);
          if (player) {
            player.setDisconnected();

            // If game is in progress, give player time to reconnect
            if (room.status === 'playing') {
              io.to(code).emit('player-disconnected', {
                playerId: socket.playerId,
                playerName: player.name,
              });

              // Set timeout for removal
              setTimeout(() => {
                if (player.connected) return; // Reconnected
                roomManager.leaveRoom(code, socket.playerId);
                const updatedRoom = roomManager.getRoomByCode(code);
                if (updatedRoom) {
                  io.to(code).emit('room-updated', updatedRoom.toJSON());
                  if (updatedRoom.gameEngine) {
                    // Broadcast updated state
                    for (const p of updatedRoom.players) {
                      if (p.isBot) continue;
                      const ps = [...io.sockets.sockets.values()].find(s => s.playerId === p.id);
                      if (ps) {
                        ps.emit('game-state-update', updatedRoom.gameEngine.getGameState(p.id));
                      }
                    }
                  }
                }
              }, GAME_CONSTANTS.RECONNECT_TIMEOUT_MS);
            } else {
              // In lobby — give a short grace period for page navigation
              io.to(code).emit('player-disconnected', {
                playerId: socket.playerId,
                playerName: player.name,
              });

              setTimeout(() => {
                if (player.connected) return; // Reconnected in time
                roomManager.leaveRoom(code, socket.playerId);
                const updatedRoom = roomManager.getRoomByCode(code);
                if (updatedRoom) {
                  io.to(code).emit('room-updated', updatedRoom.toJSON());
                }
              }, 10000); // 10s grace period for page navigation
            }
          }
        }
      }
    });

    // Handle reconnection
    socket.on('reconnect-player', ({ playerId, roomCode }, callback) => {
      try {
        const room = roomManager.getRoomByCode(roomCode);
        if (!room) return callback?.({ success: false, error: 'Room not found' });

        const player = room.getPlayer(playerId);
        if (!player) return callback?.({ success: false, error: 'Player not found' });

        // Update socket mapping
        socket.playerId = playerId;
        socket.roomCode = roomCode;
        socket.join(roomCode);
        player.setConnected();

        // Update player rooms mapping
        roomManager.playerRooms.set(playerId, roomCode);

        io.to(roomCode).emit('player-reconnected', {
          playerId,
          playerName: player.name,
        });

        const state = room.gameEngine ? room.gameEngine.getGameState(playerId) : null;
        callback?.({
          success: true,
          room: room.toJSON(),
          gameState: state,
        });
      } catch (e) {
        logger.error('Error reconnecting', { error: e.message });
        callback?.({ success: false, error: 'Failed to reconnect' });
      }
    });
  });

  return roomManager;
}

export function getRoomManager() {
  return roomManager;
}
