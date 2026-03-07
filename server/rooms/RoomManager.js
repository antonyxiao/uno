import { Room } from './Room.js';
import { generatePlayerId } from '../utils/idGenerator.js';
import { GAME_CONSTANTS } from '../config.js';
import { logger } from '../utils/logger.js';

export class RoomManager {
  constructor(db = null) {
    this.rooms = new Map(); // code -> Room
    this.playerRooms = new Map(); // playerId -> roomCode
    this.db = db;
    this.cleanupInterval = null;
  }

  createRoom(hostPlayer) {
    const roomId = generatePlayerId();
    const room = new Room(roomId, hostPlayer.id, hostPlayer.name);
    room.addPlayer(hostPlayer);

    this.rooms.set(room.code, room);
    this.playerRooms.set(hostPlayer.id, room.code);

    // Persist to DB if available
    if (this.db) {
      try {
        this.db.prepare(
          'INSERT INTO rooms (id, code, host_id, status, settings) VALUES (?, ?, ?, ?, ?)'
        ).run(room.id, room.code, hostPlayer.id, room.status, JSON.stringify(room.settings));
        this.db.prepare(
          'INSERT OR REPLACE INTO players (id, name, room_id, is_bot) VALUES (?, ?, ?, ?)'
        ).run(hostPlayer.id, hostPlayer.name, room.id, hostPlayer.isBot ? 1 : 0);
      } catch (e) {
        logger.error('DB error creating room', { error: e.message });
      }
    }

    logger.info('Room created', { code: room.code, host: hostPlayer.name });
    return room;
  }

  joinRoom(roomCode, player) {
    const room = this.rooms.get(roomCode);
    if (!room) return { success: false, error: 'Room not found' };

    const result = room.addPlayer(player);
    if (!result.success) return result;

    this.playerRooms.set(player.id, roomCode);

    // Persist to DB
    if (this.db) {
      try {
        this.db.prepare(
          'INSERT OR REPLACE INTO players (id, name, room_id, is_bot) VALUES (?, ?, ?, ?)'
        ).run(player.id, player.name, room.id, player.isBot ? 1 : 0);
      } catch (e) {
        logger.error('DB error joining room', { error: e.message });
      }
    }

    logger.info('Player joined room', { code: roomCode, player: player.name });
    return { success: true, room };
  }

  leaveRoom(roomCode, playerId) {
    const room = this.rooms.get(roomCode);
    if (!room) return { success: false, error: 'Room not found' };

    const result = room.removePlayer(playerId);
    if (!result.success) return result;

    this.playerRooms.delete(playerId);

    // If room is empty, delete it
    if (room.isEmpty) {
      this.deleteRoom(roomCode);
      return { success: true, roomDeleted: true };
    }

    // Update DB
    if (this.db) {
      try {
        this.db.prepare('DELETE FROM players WHERE id = ?').run(playerId);
        if (result.newHostId) {
          this.db.prepare('UPDATE rooms SET host_id = ? WHERE code = ?').run(result.newHostId, roomCode);
        }
      } catch (e) {
        logger.error('DB error leaving room', { error: e.message });
      }
    }

    return { success: true, roomDeleted: false, newHostId: result.newHostId };
  }

  deleteRoom(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) return false;

    // Clear timers
    if (room.turnTimer) clearTimeout(room.turnTimer);
    for (const timer of room.botTimers) clearTimeout(timer);

    // Clean up player mappings
    for (const player of room.players) {
      this.playerRooms.delete(player.id);
    }

    this.rooms.delete(roomCode);

    // Remove from DB
    if (this.db) {
      try {
        this.db.prepare('DELETE FROM players WHERE room_id = ?').run(room.id);
        this.db.prepare('DELETE FROM rooms WHERE code = ?').run(roomCode);
      } catch (e) {
        logger.error('DB error deleting room', { error: e.message });
      }
    }

    logger.info('Room deleted', { code: roomCode });
    return true;
  }

  getRoomByCode(code) {
    return this.rooms.get(code) || null;
  }

  getPlayerRoom(playerId) {
    const code = this.playerRooms.get(playerId);
    if (!code) return null;
    return this.rooms.get(code) || null;
  }

  getRoomCodeForPlayer(playerId) {
    return this.playerRooms.get(playerId) || null;
  }

  startCleanupInterval() {
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleRooms();
    }, 60 * 1000); // Check every minute
  }

  stopCleanupInterval() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  cleanupStaleRooms() {
    const now = Date.now();
    const staleThreshold = GAME_CONSTANTS.ROOM_CLEANUP_MS;
    let cleaned = 0;

    for (const [code, room] of this.rooms) {
      if (now - room.updatedAt > staleThreshold) {
        this.deleteRoom(code);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info('Cleaned up stale rooms', { count: cleaned });
    }
    return cleaned;
  }

  get roomCount() {
    return this.rooms.size;
  }

  getAllRooms() {
    return Array.from(this.rooms.values());
  }
}
