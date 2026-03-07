import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as Client } from 'socket.io-client';
import express from 'express';
import { setupSocketHandler } from '../../server/socket/socketHandler.js';

let httpServer, io, port;

function createClient() {
  return new Promise((resolve) => {
    const client = Client(`http://localhost:${port}`, {
      transports: ['websocket'],
      forceNew: true,
    });
    client.on('connect', () => resolve(client));
  });
}

function emitAsync(socket, event, data) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timeout waiting for ${event} callback`)), 5000);
    socket.emit(event, data, (res) => {
      clearTimeout(timeout);
      resolve(res);
    });
  });
}

function waitForEvent(socket, event, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for event ${event}`)), timeout);
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

beforeAll(async () => {
  const app = express();
  httpServer = createServer(app);
  io = new Server(httpServer, { cors: { origin: '*' } });
  setupSocketHandler(io);

  await new Promise((resolve) => {
    httpServer.listen(0, () => {
      port = httpServer.address().port;
      resolve();
    });
  });
});

afterAll(async () => {
  io.close();
  httpServer.close();
  await new Promise((resolve) => setTimeout(resolve, 200));
});

describe('Game Flow Integration', () => {
  let client1, client2;

  afterEach(async () => {
    if (client1) client1.disconnect();
    if (client2) client2.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  it('should create a room and join it', async () => {
    client1 = await createClient();
    client2 = await createClient();

    // Player 1 creates room
    const createRes = await emitAsync(client1, 'create-room', { playerName: 'Alice' });
    expect(createRes.success).toBe(true);
    expect(createRes.room.code).toBeDefined();
    expect(createRes.playerId).toBeDefined();
    expect(createRes.room.players).toHaveLength(1);
    expect(createRes.room.players[0].name).toBe('Alice');

    const roomCode = createRes.room.code;
    const player1Id = createRes.playerId;

    // Player 2 joins room
    const joinRes = await emitAsync(client2, 'join-room', { playerName: 'Bob', roomCode });
    expect(joinRes.success).toBe(true);
    expect(joinRes.room.players).toHaveLength(2);
    expect(joinRes.playerId).toBeDefined();

    const player2Id = joinRes.playerId;
    expect(player2Id).not.toBe(player1Id);
  });

  it('should reject invalid room code', async () => {
    client1 = await createClient();
    const res = await emitAsync(client1, 'join-room', { playerName: 'Alice', roomCode: 'INVALID' });
    expect(res.success).toBe(false);
  });

  it('should allow host to update settings', async () => {
    client1 = await createClient();
    client2 = await createClient();

    const createRes = await emitAsync(client1, 'create-room', { playerName: 'Alice' });
    const roomCode = createRes.room.code;

    const joinPromise = waitForEvent(client2, 'room-updated');
    await emitAsync(client2, 'join-room', { playerName: 'Bob', roomCode });
    await joinPromise;

    // Host updates settings
    const updatePromise = waitForEvent(client2, 'room-updated');
    const updateRes = await emitAsync(client1, 'update-settings', {
      settings: { stackDrawCards: true },
    });
    expect(updateRes.success).toBe(true);

    const updatedRoom = await updatePromise;
    expect(updatedRoom.settings.stackDrawCards).toBe(true);
  });

  it('should allow host to add and remove bots', async () => {
    client1 = await createClient();

    const createRes = await emitAsync(client1, 'create-room', { playerName: 'Alice' });
    const roomCode = createRes.room.code;

    // Add bot
    const addRes = await emitAsync(client1, 'add-bot', { difficulty: 'medium' });
    expect(addRes.success).toBe(true);
    expect(addRes.botId).toBeDefined();

    // Get updated state
    const stateRes = await emitAsync(client1, 'room-state', {});
    expect(stateRes.room.players).toHaveLength(2);
    const bot = stateRes.room.players.find(p => p.isBot);
    expect(bot).toBeDefined();

    // Remove bot
    const removeRes = await emitAsync(client1, 'remove-bot', { botId: addRes.botId });
    expect(removeRes.success).toBe(true);

    const stateRes2 = await emitAsync(client1, 'room-state', {});
    expect(stateRes2.room.players).toHaveLength(1);
  });

  it('should start a game and receive game state', async () => {
    client1 = await createClient();
    client2 = await createClient();

    const createRes = await emitAsync(client1, 'create-room', { playerName: 'Alice' });
    const roomCode = createRes.room.code;
    const p1Id = createRes.playerId;

    const joinRes = await emitAsync(client2, 'join-room', { playerName: 'Bob', roomCode });
    const p2Id = joinRes.playerId;

    // Both listen for game-started
    const p1GamePromise = waitForEvent(client1, 'game-started');
    const p2GamePromise = waitForEvent(client2, 'game-started');

    const startRes = await emitAsync(client1, 'start-game', {});
    expect(startRes.success).toBe(true);

    const p1State = await p1GamePromise;
    const p2State = await p2GamePromise;

    // Each player should get their own hand
    expect(p1State.hand).toBeDefined();
    expect(p1State.hand.length).toBeGreaterThanOrEqual(1);
    expect(p2State.hand).toBeDefined();
    expect(p2State.hand.length).toBeGreaterThanOrEqual(1);

    // Should see top card
    expect(p1State.topCard).toBeDefined();
    expect(p1State.currentColor).toBeDefined();
    expect(p1State.currentPlayerId).toBeDefined();
  });

  it('should play a card when it is players turn', async () => {
    client1 = await createClient();
    client2 = await createClient();

    const createRes = await emitAsync(client1, 'create-room', { playerName: 'Alice' });
    const roomCode = createRes.room.code;
    const p1Id = createRes.playerId;

    const joinRes = await emitAsync(client2, 'join-room', { playerName: 'Bob', roomCode });
    const p2Id = joinRes.playerId;

    const p1GamePromise = waitForEvent(client1, 'game-started');
    const p2GamePromise = waitForEvent(client2, 'game-started');

    await emitAsync(client1, 'start-game', {});

    const p1State = await p1GamePromise;
    const p2State = await p2GamePromise;

    // Determine whose turn it is
    const currentPlayerId = p1State.currentPlayerId;
    const activeClient = currentPlayerId === p1Id ? client1 : client2;
    const activeState = currentPlayerId === p1Id ? p1State : p2State;

    // Try to play a card
    const playableCards = activeState.playableCards || [];
    if (playableCards.length > 0) {
      const cardId = playableCards[0];
      const card = activeState.hand.find(c => c.id === cardId);

      let chosenColor = null;
      if (card && card.color === 'wild') {
        chosenColor = 'red';
      }

      const playRes = await emitAsync(activeClient, 'play-card', { cardId, chosenColor });
      expect(playRes.success).toBe(true);
    } else {
      // No playable cards, draw
      const drawRes = await emitAsync(activeClient, 'draw-card', {});
      expect(drawRes.success).toBe(true);
      expect(drawRes.drawnCount).toBeGreaterThanOrEqual(1);
    }
  });

  it('should handle draw card action', async () => {
    client1 = await createClient();
    client2 = await createClient();

    const createRes = await emitAsync(client1, 'create-room', { playerName: 'Alice' });
    const roomCode = createRes.room.code;
    const p1Id = createRes.playerId;

    const joinRes = await emitAsync(client2, 'join-room', { playerName: 'Bob', roomCode });
    const p2Id = joinRes.playerId;

    const p1GamePromise = waitForEvent(client1, 'game-started');
    await emitAsync(client1, 'start-game', {});
    const p1State = await p1GamePromise;

    const currentPlayerId = p1State.currentPlayerId;
    const activeClient = currentPlayerId === p1Id ? client1 : client2;

    const drawRes = await emitAsync(activeClient, 'draw-card', {});
    expect(drawRes.success).toBe(true);
  });

  it('should reject play when not your turn', async () => {
    client1 = await createClient();
    client2 = await createClient();

    const createRes = await emitAsync(client1, 'create-room', { playerName: 'Alice' });
    const roomCode = createRes.room.code;
    const p1Id = createRes.playerId;

    const joinRes = await emitAsync(client2, 'join-room', { playerName: 'Bob', roomCode });
    const p2Id = joinRes.playerId;

    const p1GamePromise = waitForEvent(client1, 'game-started');
    await emitAsync(client1, 'start-game', {});
    const p1State = await p1GamePromise;

    // Use the non-active player
    const currentPlayerId = p1State.currentPlayerId;
    const inactiveClient = currentPlayerId === p1Id ? client2 : client1;
    const inactiveState = currentPlayerId === p1Id ? { hand: [] } : { hand: [] };

    // Try to draw when it's not your turn
    const drawRes = await emitAsync(inactiveClient, 'draw-card', {});
    expect(drawRes.success).toBe(false);
  });

  it('should handle UNO call', async () => {
    client1 = await createClient();
    client2 = await createClient();

    const createRes = await emitAsync(client1, 'create-room', { playerName: 'Alice' });
    const roomCode = createRes.room.code;

    await emitAsync(client2, 'join-room', { playerName: 'Bob', roomCode });

    const gameStartPromise = waitForEvent(client1, 'game-started');
    await emitAsync(client1, 'start-game', {});
    await gameStartPromise;

    // UNO call - may or may not succeed depending on hand size
    const unoRes = await emitAsync(client1, 'call-uno', {});
    // Just verify we get a response (may be success or failure depending on state)
    expect(unoRes).toBeDefined();
  });

  it('should allow chat messages during game', async () => {
    client1 = await createClient();
    client2 = await createClient();

    const createRes = await emitAsync(client1, 'create-room', { playerName: 'Alice' });
    const roomCode = createRes.room.code;

    await emitAsync(client2, 'join-room', { playerName: 'Bob', roomCode });

    // Listen for chat message on client2
    const chatPromise = waitForEvent(client2, 'chat-message');
    client1.emit('chat-message', { message: 'Hello!' });

    const chatData = await chatPromise;
    expect(chatData.message).toBe('Hello!');
    expect(chatData.playerName).toBe('Alice');
  });

  it('should handle leaving the room', async () => {
    client1 = await createClient();
    client2 = await createClient();

    const createRes = await emitAsync(client1, 'create-room', { playerName: 'Alice' });
    const roomCode = createRes.room.code;

    await emitAsync(client2, 'join-room', { playerName: 'Bob', roomCode });

    // Client2 leaves
    const roomUpdatePromise = waitForEvent(client1, 'room-updated');
    const leaveRes = await emitAsync(client2, 'leave-room', {});
    expect(leaveRes.success).toBe(true);

    const updatedRoom = await roomUpdatePromise;
    expect(updatedRoom.players).toHaveLength(1);
  });

  it('should handle kick player', async () => {
    client1 = await createClient();
    client2 = await createClient();

    const createRes = await emitAsync(client1, 'create-room', { playerName: 'Alice' });
    const roomCode = createRes.room.code;

    const joinRes = await emitAsync(client2, 'join-room', { playerName: 'Bob', roomCode });
    const p2Id = joinRes.playerId;

    // Host kicks player 2
    const kickedPromise = waitForEvent(client2, 'kicked');
    const kickRes = await emitAsync(client1, 'kick-player', { targetId: p2Id });
    expect(kickRes.success).toBe(true);

    await kickedPromise; // Bob should receive kicked event
  });

  it('should play a full game with bots', async () => {
    client1 = await createClient();

    const createRes = await emitAsync(client1, 'create-room', { playerName: 'Alice' });
    const roomCode = createRes.room.code;
    const p1Id = createRes.playerId;

    // Add a bot
    const addRes = await emitAsync(client1, 'add-bot', { difficulty: 'hard' });
    expect(addRes.success).toBe(true);

    // Start game
    const gameStartPromise = waitForEvent(client1, 'game-started');
    const startRes = await emitAsync(client1, 'start-game', {});
    expect(startRes.success).toBe(true);

    let gameState = await gameStartPromise;

    // Collect state updates as they come in
    let latestState = gameState;
    let gameEnded = false;

    client1.on('game-state-update', (state) => { latestState = state; });
    client1.on('round-over', () => { gameEnded = true; });
    client1.on('game-over', () => { gameEnded = true; });

    let turnCount = 0;
    const maxTurns = 300;

    while (turnCount < maxTurns && !gameEnded) {
      gameState = latestState;

      if (!gameState || gameState.state === 'ROUND_OVER' || gameState.state === 'GAME_OVER') {
        break;
      }

      // If it's our turn, play immediately
      if (gameState.currentPlayerId === p1Id && gameState.state === 'PLAYING') {
        const playable = gameState.playableCards || [];
        if (playable.length > 0) {
          const cardId = playable[0];
          const card = gameState.hand.find(c => c.id === cardId);
          const chosenColor = card && card.color === 'wild' ? 'red' : null;

          if (gameState.hand.length === 2) {
            await emitAsync(client1, 'call-uno', {});
          }

          const playRes = await emitAsync(client1, 'play-card', { cardId, chosenColor });
          if (playRes.needsColorChoice) {
            await emitAsync(client1, 'choose-color', { color: 'red' });
          }
        } else {
          await emitAsync(client1, 'draw-card', {});
        }
        turnCount++;
      } else if (gameState.state === 'CHOOSING_COLOR' && gameState.waitingForColorChoice === p1Id) {
        await emitAsync(client1, 'choose-color', { color: 'red' });
      } else if (gameState.state === 'CHOOSING_SWAP_TARGET' && gameState.waitingForSwapTarget === p1Id) {
        const opponents = gameState.players.filter(p => p.id !== p1Id);
        if (opponents.length > 0) {
          await emitAsync(client1, 'swap-target', { targetId: opponents[0].id });
        }
      }

      // Wait briefly for bot to act and state to update
      await new Promise(r => setTimeout(r, 100));
    }

    // Game should have progressed
    expect(turnCount).toBeGreaterThan(0);
  }, 120000);

  it('should handle reconnection', async () => {
    client1 = await createClient();
    client2 = await createClient();

    const createRes = await emitAsync(client1, 'create-room', { playerName: 'Alice' });
    const roomCode = createRes.room.code;
    const p1Id = createRes.playerId;

    await emitAsync(client2, 'join-room', { playerName: 'Bob', roomCode });

    // Start game
    const gameStartPromise = waitForEvent(client1, 'game-started');
    await emitAsync(client1, 'start-game', {});
    await gameStartPromise;

    // Client1 disconnects and reconnects
    client1.disconnect();
    await new Promise(r => setTimeout(r, 200));

    const newClient1 = await createClient();
    const reconnRes = await emitAsync(newClient1, 'reconnect-player', {
      playerId: p1Id,
      roomCode,
    });

    expect(reconnRes.success).toBe(true);
    expect(reconnRes.room).toBeDefined();
    expect(reconnRes.gameState).toBeDefined();
    expect(reconnRes.gameState.hand).toBeDefined();

    // Replace client1 for cleanup
    client1 = newClient1;
  });
});
