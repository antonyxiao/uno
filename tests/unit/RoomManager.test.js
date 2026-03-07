import { describe, it, expect, beforeEach } from 'vitest';
import { RoomManager } from '../../server/rooms/RoomManager.js';
import { Player } from '../../server/game/Player.js';

describe('RoomManager', () => {
  let manager;

  beforeEach(() => {
    manager = new RoomManager();
  });

  describe('createRoom', () => {
    it('should create a room and return it', () => {
      const host = new Player('p1', 'Alice');
      const room = manager.createRoom(host);
      expect(room).toBeDefined();
      expect(room.code).toMatch(/^[A-Z0-9]{6}$/);
      expect(room.hostId).toBe('p1');
      expect(room.players.length).toBe(1);
      expect(manager.roomCount).toBe(1);
    });

    it('should map player to room', () => {
      const host = new Player('p1', 'Alice');
      const room = manager.createRoom(host);
      expect(manager.getRoomCodeForPlayer('p1')).toBe(room.code);
    });
  });

  describe('joinRoom', () => {
    it('should join an existing room by code', () => {
      const host = new Player('p1', 'Alice');
      const room = manager.createRoom(host);
      const joiner = new Player('p2', 'Bob');
      const result = manager.joinRoom(room.code, joiner);
      expect(result.success).toBe(true);
      expect(room.players.length).toBe(2);
    });

    it('should reject joining non-existent room', () => {
      const player = new Player('p1', 'Alice');
      const result = manager.joinRoom('NONEXIST', player);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Room not found');
    });

    it('should reject joining full room', () => {
      const host = new Player('p1', 'Alice');
      const room = manager.createRoom(host);
      room.maxPlayers = 2;

      const p2 = new Player('p2', 'Bob');
      manager.joinRoom(room.code, p2);

      const p3 = new Player('p3', 'Charlie');
      const result = manager.joinRoom(room.code, p3);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Room is full');
    });

    it('should reject joining room in progress', () => {
      const host = new Player('p1', 'Alice');
      const room = manager.createRoom(host);
      const p2 = new Player('p2', 'Bob');
      manager.joinRoom(room.code, p2);

      room.startGame();

      const p3 = new Player('p3', 'Charlie');
      const result = manager.joinRoom(room.code, p3);
      expect(result.success).toBe(false);
    });
  });

  describe('leaveRoom', () => {
    it('should remove player from room', () => {
      const host = new Player('p1', 'Alice');
      const room = manager.createRoom(host);
      const p2 = new Player('p2', 'Bob');
      manager.joinRoom(room.code, p2);

      const result = manager.leaveRoom(room.code, 'p2');
      expect(result.success).toBe(true);
      expect(room.players.length).toBe(1);
    });

    it('should assign new host when host leaves', () => {
      const host = new Player('p1', 'Alice');
      const room = manager.createRoom(host);
      const p2 = new Player('p2', 'Bob');
      manager.joinRoom(room.code, p2);

      const result = manager.leaveRoom(room.code, 'p1');
      expect(result.success).toBe(true);
      expect(result.newHostId).toBe('p2');
      expect(room.hostId).toBe('p2');
    });

    it('should delete room when last player leaves', () => {
      const host = new Player('p1', 'Alice');
      const room = manager.createRoom(host);

      const result = manager.leaveRoom(room.code, 'p1');
      expect(result.success).toBe(true);
      expect(result.roomDeleted).toBe(true);
      expect(manager.roomCount).toBe(0);
    });

    it('should clean up player mapping', () => {
      const host = new Player('p1', 'Alice');
      const room = manager.createRoom(host);
      const p2 = new Player('p2', 'Bob');
      manager.joinRoom(room.code, p2);

      manager.leaveRoom(room.code, 'p2');
      expect(manager.getRoomCodeForPlayer('p2')).toBeNull();
    });
  });

  describe('deleteRoom', () => {
    it('should delete a room', () => {
      const host = new Player('p1', 'Alice');
      const room = manager.createRoom(host);
      const p2 = new Player('p2', 'Bob');
      manager.joinRoom(room.code, p2);

      manager.deleteRoom(room.code);
      expect(manager.roomCount).toBe(0);
      expect(manager.getRoomByCode(room.code)).toBeNull();
      expect(manager.getRoomCodeForPlayer('p1')).toBeNull();
      expect(manager.getRoomCodeForPlayer('p2')).toBeNull();
    });

    it('should return false for non-existent room', () => {
      expect(manager.deleteRoom('NOPE')).toBe(false);
    });
  });

  describe('getRoomByCode', () => {
    it('should find room by code', () => {
      const host = new Player('p1', 'Alice');
      const room = manager.createRoom(host);
      const found = manager.getRoomByCode(room.code);
      expect(found).toBe(room);
    });

    it('should return null for unknown code', () => {
      expect(manager.getRoomByCode('ABCDEF')).toBeNull();
    });
  });

  describe('getPlayerRoom', () => {
    it('should find room for player', () => {
      const host = new Player('p1', 'Alice');
      const room = manager.createRoom(host);
      const found = manager.getPlayerRoom('p1');
      expect(found).toBe(room);
    });

    it('should return null for unknown player', () => {
      expect(manager.getPlayerRoom('unknown')).toBeNull();
    });
  });

  describe('cleanupStaleRooms', () => {
    it('should clean up rooms older than threshold', () => {
      const host = new Player('p1', 'Alice');
      const room = manager.createRoom(host);
      // Set updatedAt to 3 hours ago
      room.updatedAt = Date.now() - (3 * 60 * 60 * 1000);

      const cleaned = manager.cleanupStaleRooms();
      expect(cleaned).toBe(1);
      expect(manager.roomCount).toBe(0);
    });

    it('should not clean up active rooms', () => {
      const host = new Player('p1', 'Alice');
      manager.createRoom(host);

      const cleaned = manager.cleanupStaleRooms();
      expect(cleaned).toBe(0);
      expect(manager.roomCount).toBe(1);
    });
  });

  describe('Room.startGame', () => {
    it('should start game with 2+ players', () => {
      const host = new Player('p1', 'Alice');
      const room = manager.createRoom(host);
      const p2 = new Player('p2', 'Bob');
      manager.joinRoom(room.code, p2);

      const result = room.startGame();
      expect(result.success).toBe(true);
      expect(room.status).toBe('playing');
      expect(room.gameEngine).toBeDefined();
    });

    it('should not start with 1 player', () => {
      const host = new Player('p1', 'Alice');
      const room = manager.createRoom(host);

      expect(room.canStart()).toBe(false);
      const result = room.startGame();
      expect(result.success).toBe(false);
    });

    it('should not start twice', () => {
      const host = new Player('p1', 'Alice');
      const room = manager.createRoom(host);
      const p2 = new Player('p2', 'Bob');
      manager.joinRoom(room.code, p2);

      room.startGame();
      const result = room.startGame();
      expect(result.success).toBe(false);
    });
  });

  describe('Room.toJSON', () => {
    it('should serialize room correctly', () => {
      const host = new Player('p1', 'Alice');
      const room = manager.createRoom(host);
      const json = room.toJSON();
      expect(json.code).toBe(room.code);
      expect(json.hostId).toBe('p1');
      expect(json.players.length).toBe(1);
      expect(json.status).toBe('waiting');
    });
  });
});
