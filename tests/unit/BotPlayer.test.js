import { describe, it, expect } from 'vitest';
import { BotPlayer, getRandomBotName } from '../../server/game/BotPlayer.js';
import { Card, WILD_COLOR, CARD_VALUES, COLORS } from '../../server/game/Card.js';
import { RuleEngine } from '../../server/game/RuleEngine.js';
import { GameEngine, GAME_STATES } from '../../server/game/GameEngine.js';
import { Player } from '../../server/game/Player.js';

describe('BotPlayer', () => {
  it('should be a bot', () => {
    const bot = new BotPlayer('b1', 'TestBot', 'medium');
    expect(bot.isBot).toBe(true);
    expect(bot.botDifficulty).toBe('medium');
  });

  it('should get random bot names', () => {
    const names = new Set();
    for (let i = 0; i < 5; i++) {
      names.add(getRandomBotName());
    }
    expect(names.size).toBeGreaterThan(1);
  });

  describe('choosePlay', () => {
    it('should choose a valid card to play', () => {
      const bot = new BotPlayer('b1', 'Bot', 'medium');
      bot.addCards([
        new Card('c1', 'red', '5'),
        new Card('c2', 'blue', '3'),
        new Card('c3', 'red', '7'),
      ]);

      const topCard = new Card('top', 'red', '2');
      const re = new RuleEngine();
      const play = bot.choosePlay(topCard, 'red', 0, re);
      expect(play).not.toBeNull();
      // Should play a red card
      const card = bot.getCard(play.cardId);
      expect(card.color).toBe('red');
    });

    it('should return null when no playable cards', () => {
      const bot = new BotPlayer('b1', 'Bot', 'medium');
      bot.addCards([
        new Card('c1', 'blue', '3'),
        new Card('c2', 'green', '8'),
      ]);

      const topCard = new Card('top', 'red', '5');
      const re = new RuleEngine();
      const play = bot.choosePlay(topCard, 'red', 0, re);
      expect(play).toBeNull();
    });

    it('should choose wild card when no color matches', () => {
      const bot = new BotPlayer('b1', 'Bot', 'medium');
      bot.addCards([
        new Card('c1', 'blue', '3'),
        new Card('c2', WILD_COLOR, CARD_VALUES.WILD),
      ]);

      const topCard = new Card('top', 'red', '5');
      const re = new RuleEngine();
      const play = bot.choosePlay(topCard, 'red', 0, re);
      expect(play).not.toBeNull();
      expect(play.chosenColor).toBeTruthy();
    });

    it('easy bot should play a valid card', () => {
      const bot = new BotPlayer('b1', 'Bot', 'easy');
      bot.addCards([
        new Card('c1', 'red', '5'),
        new Card('c2', 'red', '7'),
      ]);

      const topCard = new Card('top', 'red', '2');
      const re = new RuleEngine();
      const play = bot.choosePlay(topCard, 'red', 0, re);
      expect(play).not.toBeNull();
    });

    it('hard bot should save wilds and play high-point cards', () => {
      const bot = new BotPlayer('b1', 'Bot', 'hard');
      bot.addCards([
        new Card('c1', 'red', '2'),
        new Card('c2', 'red', '9'),
        new Card('wild', WILD_COLOR, CARD_VALUES.WILD),
      ]);

      const topCard = new Card('top', 'red', '5');
      const re = new RuleEngine();
      const play = bot.choosePlay(topCard, 'red', 0, re);
      expect(play).not.toBeNull();
      // Hard bot should play non-wild first, and prefer high points
      const card = bot.getCard(play.cardId);
      expect(card.isWild()).toBe(false);
      expect(card.value).toBe('9'); // highest non-wild
    });

    it('should stack draw cards when possible', () => {
      const bot = new BotPlayer('b1', 'Bot', 'medium');
      bot.addCards([
        new Card('c1', 'blue', CARD_VALUES.DRAW_TWO),
        new Card('c2', 'red', '5'),
      ]);

      const topCard = new Card('top', 'red', CARD_VALUES.DRAW_TWO);
      const re = new RuleEngine({ stackDrawCards: true });
      const play = bot.choosePlay(topCard, 'red', 2, re);
      expect(play).not.toBeNull();
      const card = bot.getCard(play.cardId);
      expect(card.value).toBe(CARD_VALUES.DRAW_TWO);
    });

    it('should draw when only option during pending draw', () => {
      const bot = new BotPlayer('b1', 'Bot', 'medium');
      bot.addCards([new Card('c1', 'red', '5')]);

      const topCard = new Card('top', 'blue', CARD_VALUES.DRAW_TWO);
      const re = new RuleEngine({ stackDrawCards: true });
      const play = bot.choosePlay(topCard, 'blue', 2, re);
      expect(play).toBeNull();
    });
  });

  describe('chooseSwapTarget', () => {
    it('should target player with fewest cards', () => {
      const bot = new BotPlayer('b1', 'Bot', 'medium');
      const players = [
        bot,
        Object.assign(new Player('p1', 'A'), { hand: [1, 2, 3] }),
        Object.assign(new Player('p2', 'B'), { hand: [1] }),
        Object.assign(new Player('p3', 'C'), { hand: [1, 2] }),
      ];
      // Override cardCount getter
      Object.defineProperty(players[1], 'cardCount', { get: () => 3 });
      Object.defineProperty(players[2], 'cardCount', { get: () => 1 });
      Object.defineProperty(players[3], 'cardCount', { get: () => 2 });

      const target = bot.chooseSwapTarget(players);
      expect(target).toBe('p2');
    });
  });

  describe('shouldCallUno', () => {
    it('medium bot always calls UNO', () => {
      const bot = new BotPlayer('b1', 'Bot', 'medium');
      expect(bot.shouldCallUno()).toBe(true);
    });

    it('hard bot always calls UNO', () => {
      const bot = new BotPlayer('b1', 'Bot', 'hard');
      expect(bot.shouldCallUno()).toBe(true);
    });
  });

  describe('full bot game simulation', () => {
    it('should complete a game with 4 bots without errors', () => {
      const bots = [
        new BotPlayer('b1', 'Bot1', 'easy'),
        new BotPlayer('b2', 'Bot2', 'medium'),
        new BotPlayer('b3', 'Bot3', 'hard'),
        new BotPlayer('b4', 'Bot4', 'medium'),
      ];

      const engine = new GameEngine(bots);
      engine.startGame();

      // Handle starting wild card
      if (engine.state === GAME_STATES.CHOOSING_COLOR) {
        const bot = engine.getCurrentPlayer();
        engine.chooseColor(bot.id, bot._pickColor());
      }
      if (engine.pendingDrawCount > 0) {
        const bot = engine.getCurrentPlayer();
        engine.drawCard(bot.id);
      }

      let turns = 0;
      const maxTurns = 1000;

      while (turns < maxTurns && engine.state === GAME_STATES.PLAYING) {
        const bot = engine.getCurrentPlayer();

        if (engine.state === GAME_STATES.CHOOSING_COLOR) {
          engine.chooseColor(bot.id, bot._pickColor());
          continue;
        }

        if (engine.state === GAME_STATES.CHOOSING_SWAP_TARGET) {
          const target = bot.chooseSwapTarget(engine.players);
          engine.chooseSwapTarget(bot.id, target);
          continue;
        }

        if (engine.state !== GAME_STATES.PLAYING) break;

        const topCard = engine.deck.getTopDiscard();
        const play = bot.choosePlay(topCard, engine.currentColor, engine.pendingDrawCount, engine.ruleEngine);

        if (play) {
          if (bot.hand.length === 2) engine.callUno(bot.id);
          const result = engine.playCard(bot.id, play.cardId, play.chosenColor);

          if (result.needsColorChoice) {
            engine.chooseColor(bot.id, bot._pickColor());
          }
          if (result.needsSwapTarget) {
            const target = bot.chooseSwapTarget(engine.players);
            engine.chooseSwapTarget(bot.id, target);
          }
          if (result.roundOver || result.gameOver) break;
        } else {
          const drawResult = engine.drawCard(bot.id);
          if (drawResult.canPlay && drawResult.drawnCardId) {
            const drawnCard = bot.getCard(drawResult.drawnCardId);
            if (drawnCard) {
              const playResult = engine.playCard(bot.id, drawResult.drawnCardId,
                drawnCard.isWild() ? bot._pickColor() : null);
              if (playResult.needsColorChoice) {
                engine.chooseColor(bot.id, bot._pickColor());
              }
              if (playResult.roundOver || playResult.gameOver) break;
            } else {
              engine.keepDrawnCard(bot.id);
            }
          }
        }

        turns++;
      }

      // Game should have ended
      expect([GAME_STATES.ROUND_OVER, GAME_STATES.GAME_OVER, GAME_STATES.PLAYING]).toContain(engine.state);
      if (engine.state !== GAME_STATES.PLAYING) {
        // Someone won
        const winner = engine.players.find(p => p.hand.length === 0);
        expect(winner).toBeDefined();
      }
      // No errors should have occurred
      expect(turns).toBeLessThan(maxTurns);
    });
  });
});
