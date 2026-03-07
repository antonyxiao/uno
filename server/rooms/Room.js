import { generateRoomCode } from '../utils/idGenerator.js';
import { DEFAULT_HOUSE_RULES, GAME_CONSTANTS } from '../config.js';
import { GameEngine } from '../game/GameEngine.js';

export class Room {
  constructor(id, hostId, hostName) {
    this.id = id;
    this.code = generateRoomCode();
    this.hostId = hostId;
    this.players = [];
    this.settings = { ...DEFAULT_HOUSE_RULES };
    this.status = 'waiting'; // waiting, playing, finished
    this.gameEngine = null;
    this.maxPlayers = GAME_CONSTANTS.MAX_PLAYERS;
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
    this.turnTimer = null;
    this.botTimers = [];
  }

  addPlayer(player) {
    if (this.players.length >= this.maxPlayers) {
      return { success: false, error: 'Room is full' };
    }
    if (this.status === 'playing') {
      return { success: false, error: 'Game already in progress' };
    }
    if (this.players.find(p => p.id === player.id)) {
      return { success: false, error: 'Already in room' };
    }
    this.players.push(player);
    this.updatedAt = Date.now();
    return { success: true };
  }

  removePlayer(playerId) {
    const index = this.players.findIndex(p => p.id === playerId);
    if (index === -1) return { success: false, error: 'Player not in room' };

    this.players.splice(index, 1);
    this.updatedAt = Date.now();

    // If host left, assign new host
    if (playerId === this.hostId && this.players.length > 0) {
      // Pick first non-bot player, or first player if all bots
      const newHost = this.players.find(p => !p.isBot) || this.players[0];
      this.hostId = newHost.id;
    }

    // If game is in progress, remove from game engine
    if (this.status === 'playing' && this.gameEngine) {
      this.gameEngine.removePlayer(playerId);
      // Check if game should end
      if (this.gameEngine.players.length < 2) {
        this.status = 'finished';
      }
    }

    return { success: true, newHostId: this.hostId };
  }

  updateSettings(settings) {
    Object.assign(this.settings, settings);
    this.updatedAt = Date.now();
  }

  canStart() {
    return this.players.length >= GAME_CONSTANTS.MIN_PLAYERS && this.status === 'waiting';
  }

  startGame() {
    if (!this.canStart()) {
      return { success: false, error: 'Cannot start game' };
    }

    this.status = 'playing';
    this.gameEngine = new GameEngine(this.players, this.settings);
    const result = this.gameEngine.startGame();
    this.updatedAt = Date.now();
    return { success: true, gameState: result };
  }

  get playerCount() {
    return this.players.length;
  }

  get isEmpty() {
    return this.players.length === 0;
  }

  isHost(playerId) {
    return this.hostId === playerId;
  }

  getPlayer(playerId) {
    return this.players.find(p => p.id === playerId) || null;
  }

  toJSON() {
    return {
      id: this.id,
      code: this.code,
      hostId: this.hostId,
      players: this.players.map(p => p.toJSON ? p.toJSON(false) : p),
      settings: { ...this.settings },
      status: this.status,
      maxPlayers: this.maxPlayers,
      playerCount: this.playerCount,
      createdAt: this.createdAt,
    };
  }
}
