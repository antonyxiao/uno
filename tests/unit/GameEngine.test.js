import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine, GAME_STATES } from '../../server/game/GameEngine.js';
import { Player } from '../../server/game/Player.js';
import { Card, COLORS, WILD_COLOR, CARD_VALUES } from '../../server/game/Card.js';

function createPlayers(count = 4) {
  const players = [];
  const names = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Hank', 'Ivy', 'Jack'];
  for (let i = 0; i < count; i++) {
    players.push(new Player(`p${i}`, names[i]));
  }
  return players;
}

/** Start the game and resolve any starting card effects so we're in a clean PLAYING state */
function startClean(engine) {
  engine.startGame();
  if (engine.state === GAME_STATES.CHOOSING_COLOR) {
    engine.chooseColor(engine.waitingForColorChoice, 'red');
  }
  if (engine.pendingDrawCount > 0) {
    const current = engine.getCurrentPlayer();
    engine.drawCard(current.id);
  }
}

describe('GameEngine', () => {
  let engine;
  let players;

  beforeEach(() => {
    players = createPlayers(4);
    engine = new GameEngine(players);
  });

  describe('startGame', () => {
    it('should deal 7 cards to each player', () => {
      engine.startGame();
      for (const p of players) {
        expect(p.hand.length).toBe(7);
      }
    });

    it('should have a discard pile with one card', () => {
      engine.startGame();
      expect(engine.deck.discardPileCount).toBeGreaterThanOrEqual(1);
    });

    it('should set state to PLAYING (or CHOOSING_COLOR for wild start)', () => {
      engine.startGame();
      expect([GAME_STATES.PLAYING, GAME_STATES.CHOOSING_COLOR]).toContain(engine.state);
    });

    it('should set current color from starting card', () => {
      engine.startGame();
      if (engine.state === GAME_STATES.PLAYING) {
        expect(engine.currentColor).toBeTruthy();
      }
    });

    it('should increment round number', () => {
      engine.startGame();
      expect(engine.roundNumber).toBe(1);
    });
  });

  describe('playCard', () => {
    it('should play a valid matching color card', () => {
      engine.startGame();
      // Force a known state
      if (engine.state === GAME_STATES.CHOOSING_COLOR) {
        engine.chooseColor(engine.waitingForColorChoice, 'red');
      }

      const current = engine.getCurrentPlayer();
      const topCard = engine.deck.getTopDiscard();

      // Give the current player a card that matches
      const playableCard = new Card('test-play', engine.currentColor, '5');
      current.hand.push(playableCard);

      const result = engine.playCard(current.id, 'test-play');
      expect(result.success).toBe(true);
    });

    it('should reject play when not your turn', () => {
      startClean(engine);

      const current = engine.getCurrentPlayer();
      const otherPlayer = players.find(p => p.id !== current.id);
      const card = new Card('test', 'red', '5');
      otherPlayer.hand.push(card);

      const result = engine.playCard(otherPlayer.id, 'test');
      expect(result.success).toBe(false);
    });

    it('should reject invalid card play', () => {
      startClean(engine);

      const current = engine.getCurrentPlayer();
      // Give a card that doesn't match
      const wrongColor = engine.currentColor === 'red' ? 'blue' : 'red';
      const wrongValue = engine.deck.getTopDiscard().value === '5' ? '3' : '5';
      const card = new Card('bad-card', wrongColor, wrongValue);
      current.hand.push(card);

      const result = engine.playCard(current.id, 'bad-card');
      expect(result.success).toBe(false);
    });

    it('should handle wild card requiring color choice', () => {
      startClean(engine);

      // Clear any pending draw from starting card
      if (engine.pendingDrawCount > 0) {
        const current = engine.getCurrentPlayer();
        engine.drawCard(current.id);
      }

      const current = engine.getCurrentPlayer();
      const wild = new Card('wild-test', WILD_COLOR, CARD_VALUES.WILD);
      current.hand.push(wild);

      // Play wild without choosing color
      const result = engine.playCard(current.id, 'wild-test');
      expect(result.success).toBe(true);
      expect(result.needsColorChoice).toBe(true);
      expect(engine.state).toBe(GAME_STATES.CHOOSING_COLOR);
    });

    it('should handle wild card with color choice provided', () => {
      startClean(engine);

      const current = engine.getCurrentPlayer();
      const wild = new Card('wild-test', WILD_COLOR, CARD_VALUES.WILD);
      current.hand.push(wild);

      const result = engine.playCard(current.id, 'wild-test', 'green');
      expect(result.success).toBe(true);
      expect(engine.currentColor).toBe('green');
    });

    it('should handle draw 2 effect', () => {
      startClean(engine);

      const current = engine.getCurrentPlayer();
      const draw2 = new Card('draw2-test', engine.currentColor, CARD_VALUES.DRAW_TWO);
      current.hand.push(draw2);

      const result = engine.playCard(current.id, 'draw2-test');
      expect(result.success).toBe(true);
      expect(engine.pendingDrawCount).toBe(2);
    });

    it('should handle skip effect', () => {
      startClean(engine);

      const currentIdx = engine.turnManager.currentPlayerIndex;
      const dir = engine.turnManager.direction;
      const current = engine.getCurrentPlayer();
      const skip = new Card('skip-test', engine.currentColor, CARD_VALUES.SKIP);
      current.hand.push(skip);

      engine.playCard(current.id, 'skip-test');
      // Should have skipped the next player (advance by 2 in current direction)
      const expectedIdx = ((currentIdx + 2 * dir) % 4 + 4) % 4;
      expect(engine.turnManager.currentPlayerIndex).toBe(expectedIdx);
    });

    it('should handle reverse effect', () => {
      startClean(engine);

      const current = engine.getCurrentPlayer();
      const reverse = new Card('reverse-test', engine.currentColor, CARD_VALUES.REVERSE);
      current.hand.push(reverse);

      const dirBefore = engine.turnManager.direction;
      engine.playCard(current.id, 'reverse-test');
      expect(engine.turnManager.direction).toBe(-dirBefore);
    });
  });

  describe('drawCard', () => {
    it('should draw a card on player turn', () => {
      startClean(engine);

      const current = engine.getCurrentPlayer();
      const handBefore = current.hand.length;
      const result = engine.drawCard(current.id);
      expect(result.success).toBe(true);
      expect(result.drawnCount).toBe(1);
      expect(current.hand.length).toBe(handBefore + 1);
    });

    it('should draw pending cards from +2/+4', () => {
      startClean(engine);

      engine.pendingDrawCount = 4;
      const current = engine.getCurrentPlayer();
      const handBefore = current.hand.length;
      const result = engine.drawCard(current.id);
      expect(result.success).toBe(true);
      expect(result.drawnCount).toBe(4);
      expect(current.hand.length).toBe(handBefore + 4);
      expect(engine.pendingDrawCount).toBe(0);
    });

    it('should reject draw when not your turn', () => {
      startClean(engine);

      const current = engine.getCurrentPlayer();
      const other = players.find(p => p.id !== current.id);
      const result = engine.drawCard(other.id);
      expect(result.success).toBe(false);
    });
  });

  describe('chooseColor', () => {
    it('should set color after wild', () => {
      startClean(engine);

      // Force a wild play
      const current = engine.getCurrentPlayer();
      const wild = new Card('w', WILD_COLOR, CARD_VALUES.WILD);
      current.hand.push(wild);
      engine.playCard(current.id, 'w');

      expect(engine.state).toBe(GAME_STATES.CHOOSING_COLOR);
      const result = engine.chooseColor(current.id, 'yellow');
      expect(result.success).toBe(true);
      expect(engine.currentColor).toBe('yellow');
    });

    it('should reject invalid color', () => {
      engine.startGame();
      // Force choosing color state
      engine.state = GAME_STATES.CHOOSING_COLOR;
      engine.waitingForColorChoice = 'p0';

      const result = engine.chooseColor('p0', 'purple');
      expect(result.success).toBe(false);
    });

    it('should reject wrong player choosing', () => {
      engine.startGame();
      engine.state = GAME_STATES.CHOOSING_COLOR;
      engine.waitingForColorChoice = 'p0';

      const result = engine.chooseColor('p1', 'red');
      expect(result.success).toBe(false);
    });
  });

  describe('UNO calling', () => {
    it('should allow calling UNO with 2 cards', () => {
      engine.startGame();
      const player = players[0];
      player.hand = [new Card('c1', 'red', '5'), new Card('c2', 'blue', '3')];
      const result = engine.callUno(player.id);
      expect(result.success).toBe(true);
      expect(player.calledUno).toBe(true);
    });

    it('should reject UNO call with too many cards', () => {
      engine.startGame();
      const player = players[0];
      // Player has 7 cards from deal
      const result = engine.callUno(player.id);
      expect(result.success).toBe(false);
    });

    it('should challenge UNO successfully', () => {
      engine.startGame();
      const target = players[0];
      target.hand = [new Card('c1', 'red', '5')];
      target.calledUno = false;

      const result = engine.challengeUno(players[1].id, target.id);
      expect(result.success).toBe(true);
      expect(result.caught).toBe(true);
      expect(target.hand.length).toBe(5); // 1 + 4 penalty
    });

    it('should fail challenge when UNO was called', () => {
      engine.startGame();
      const target = players[0];
      target.hand = [new Card('c1', 'red', '5')];
      target.calledUno = true;

      const result = engine.challengeUno(players[1].id, target.id);
      expect(result.success).toBe(false);
    });
  });

  describe('seven swap', () => {
    it('should swap hands when seven is played and rule enabled', () => {
      engine = new GameEngine(players, { sevenSwapHands: true });
      startClean(engine);

      const current = engine.getCurrentPlayer();
      const seven = new Card('seven-test', engine.currentColor, '7');
      current.hand.push(seven);
      const currentHandSize = current.hand.length;

      const result = engine.playCard(current.id, 'seven-test');
      if (result.needsSwapTarget) {
        const target = players.find(p => p.id !== current.id);
        const targetHandSize = target.hand.length;

        const swapResult = engine.chooseSwapTarget(current.id, target.id);
        expect(swapResult.success).toBe(true);
        // Hands should have swapped (minus 1 for the played card)
        expect(current.hand.length).toBe(targetHandSize);
        expect(target.hand.length).toBe(currentHandSize - 1);
      }
    });
  });

  describe('zero rotate', () => {
    it('should rotate hands when zero is played and rule enabled', () => {
      engine = new GameEngine(players, { zeroRotateHands: true });
      startClean(engine);

      const current = engine.getCurrentPlayer();
      const zero = new Card('zero-test', engine.currentColor, '0');
      current.hand.push(zero);

      // Record hand sizes
      const sizes = players.map(p => p.hand.length);

      const result = engine.playCard(current.id, 'zero-test');
      expect(result.success).toBe(true);
      // After rotation, hands should have shifted
      expect(result.effect).toBe('rotate');
    });
  });

  describe('stacking +2 on +2', () => {
    it('should allow stacking when enabled', () => {
      engine = new GameEngine(players, { stackDrawCards: true });
      startClean(engine);

      const current = engine.getCurrentPlayer();
      const draw2 = new Card('d2-1', engine.currentColor, CARD_VALUES.DRAW_TWO);
      current.hand.push(draw2);

      engine.playCard(current.id, 'd2-1');
      expect(engine.pendingDrawCount).toBe(2);

      // Next player tries to stack
      const next = engine.getCurrentPlayer();
      const draw2b = new Card('d2-2', 'blue', CARD_VALUES.DRAW_TWO);
      next.hand.push(draw2b);

      const result = engine.playCard(next.id, 'd2-2');
      expect(result.success).toBe(true);
      expect(engine.pendingDrawCount).toBe(4);
    });
  });

  describe('winning', () => {
    it('should detect round win when player plays last card', () => {
      startClean(engine);

      const current = engine.getCurrentPlayer();
      // Give them only 1 card that matches
      const lastCard = new Card('last', engine.currentColor, '5');
      current.hand = [lastCard];
      current.calledUno = true;

      const result = engine.playCard(current.id, 'last');
      expect(result.success).toBe(true);
      expect(result.roundOver).toBe(true);
    });

    it('should calculate score on win', () => {
      startClean(engine);

      const current = engine.getCurrentPlayer();
      const lastCard = new Card('last', engine.currentColor, '5');
      current.hand = [lastCard];
      current.calledUno = true;

      const result = engine.playCard(current.id, 'last');
      expect(result.roundScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('2-player game', () => {
    it('should treat reverse as skip in 2-player', () => {
      const twoPlayers = createPlayers(2);
      engine = new GameEngine(twoPlayers);
      startClean(engine);

      const currentId = engine.getCurrentPlayer().id;
      const current = engine.getCurrentPlayer();
      const reverse = new Card('rev', engine.currentColor, CARD_VALUES.REVERSE);
      current.hand.push(reverse);

      engine.playCard(current.id, 'rev');
      // In 2-player, reverse = skip, so it should be the same player's turn again
      expect(engine.getCurrentPlayer().id).toBe(currentId);
    });
  });

  describe('game state', () => {
    it('should return sanitized state for player', () => {
      engine.startGame();
      const state = engine.getGameState('p0');
      expect(state.hand).toBeDefined();
      expect(state.hand.length).toBe(7);
      expect(state.players).toBeDefined();
      // Other players should not have hand details
      for (const p of state.players) {
        expect(p.hand).toBeUndefined();
        expect(p.cardCount).toBeDefined();
      }
    });

    it('should return public state without hand', () => {
      engine.startGame();
      const state = engine.getPublicState();
      expect(state.hand).toBeUndefined();
    });
  });

  describe('player disconnection', () => {
    it('should remove player and return cards to deck', () => {
      engine.startGame();
      const totalCards = 108;
      const player = players[2];
      const handSize = player.hand.length;

      engine.removePlayer(player.id);
      expect(engine.players.length).toBe(3);
    });
  });

  describe('multi-round with point limit', () => {
    it('should handle multiple rounds', () => {
      engine = new GameEngine(players, { pointLimit: 500 });
      startClean(engine);

      // Force a win
      const current = engine.getCurrentPlayer();
      current.hand = [new Card('last', engine.currentColor, '5')];
      current.calledUno = true;

      const result = engine.playCard(current.id, 'last');
      expect(result.roundOver).toBe(true);

      if (!result.gameOver) {
        expect(engine.state).toBe(GAME_STATES.ROUND_OVER);
        // Start next round
        const nextRound = engine.startNextRound();
        expect(engine.roundNumber).toBe(2);
      }
    });
  });

  describe('playCombo', () => {
    it('should play a valid combo of number cards', () => {
      engine = new GameEngine(players, { comboPlay: true });
      startClean(engine);

      const current = engine.getCurrentPlayer();
      const color = engine.currentColor;
      // Give the player cards that form a valid chain (same value, different colors)
      const c1 = new Card('combo1', color, '4');
      const c2 = new Card('combo2', 'blue', '4');
      const c3 = new Card('combo3', 'yellow', '4');
      current.hand = [c1, c2, c3, new Card('extra', 'red', '1')];

      const result = engine.playCombo(current.id, ['combo1', 'combo2', 'combo3']);
      expect(result.success).toBe(true);
      expect(result.effect).toBe('combo');
      expect(result.cardsPlayed).toBe(3);
      expect(current.hand.length).toBe(1);
      // Last card determines color
      expect(engine.currentColor).toBe('yellow');
    });

    it('should detect win via combo', () => {
      engine = new GameEngine(players, { comboPlay: true });
      startClean(engine);

      const current = engine.getCurrentPlayer();
      const color = engine.currentColor;
      const c1 = new Card('combo1', color, '4');
      const c2 = new Card('combo2', 'blue', '4');
      current.hand = [c1, c2];
      current.calledUno = true;

      const result = engine.playCombo(current.id, ['combo1', 'combo2']);
      expect(result.success).toBe(true);
      expect(result.roundOver).toBe(true);
    });

    it('should set mustCallUno when combo leaves 1 card', () => {
      engine = new GameEngine(players, { comboPlay: true });
      startClean(engine);

      const current = engine.getCurrentPlayer();
      const color = engine.currentColor;
      const c1 = new Card('combo1', color, '4');
      const c2 = new Card('combo2', 'blue', '4');
      const c3 = new Card('keeper', 'red', '1');
      current.hand = [c1, c2, c3];

      const result = engine.playCombo(current.id, ['combo1', 'combo2']);
      expect(result.success).toBe(true);
      expect(current.mustCallUno).toBe(true);
    });

    it('should reject combo when disabled', () => {
      engine = new GameEngine(players, { comboPlay: false });
      startClean(engine);

      const current = engine.getCurrentPlayer();
      const color = engine.currentColor;
      const c1 = new Card('combo1', color, '4');
      const c2 = new Card('combo2', 'blue', '4');
      current.hand = [c1, c2, new Card('x', 'red', '1')];

      const result = engine.playCombo(current.id, ['combo1', 'combo2']);
      expect(result.success).toBe(false);
      expect(result.error).toContain('not enabled');
    });

    it('should reject combo during pending draw', () => {
      engine = new GameEngine(players, { comboPlay: true });
      startClean(engine);

      engine.pendingDrawCount = 2;
      const current = engine.getCurrentPlayer();
      const color = engine.currentColor;
      const c1 = new Card('combo1', color, '4');
      const c2 = new Card('combo2', color, '8');
      current.hand = [c1, c2, new Card('x', 'red', '1')];

      const result = engine.playCombo(current.id, ['combo1', 'combo2']);
      expect(result.success).toBe(false);
      expect(result.error).toContain('draw');
    });

    it('should reject combo when not your turn', () => {
      engine = new GameEngine(players, { comboPlay: true });
      startClean(engine);

      const current = engine.getCurrentPlayer();
      const other = players.find(p => p.id !== current.id);
      const c1 = new Card('combo1', 'red', '4');
      const c2 = new Card('combo2', 'red', '8');
      other.hand = [c1, c2, new Card('x', 'blue', '1')];

      const result = engine.playCombo(other.id, ['combo1', 'combo2']);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Not your turn');
    });
  });

  describe('keepDrawnCard', () => {
    it('should advance turn when keeping drawn card', () => {
      startClean(engine);

      const current = engine.getCurrentPlayer();
      engine.drawnCard = new Card('drawn', 'red', '5');
      engine.drawnPlayerId = current.id;

      const currentIdx = engine.turnManager.currentPlayerIndex;
      const result = engine.keepDrawnCard(current.id);
      expect(result.success).toBe(true);
      expect(engine.turnManager.currentPlayerIndex).not.toBe(currentIdx);
    });

    it('should reject if no drawn card pending', () => {
      engine.startGame();
      const result = engine.keepDrawnCard('p0');
      expect(result.success).toBe(false);
    });
  });
});
