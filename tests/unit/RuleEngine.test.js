import { describe, it, expect } from 'vitest';
import { RuleEngine } from '../../server/game/RuleEngine.js';
import { Card, WILD_COLOR, CARD_VALUES } from '../../server/game/Card.js';
import { Player } from '../../server/game/Player.js';

describe('RuleEngine', () => {
  describe('canPlayCard', () => {
    it('should allow matching color', () => {
      const re = new RuleEngine();
      const card = new Card('a', 'red', '3');
      const top = new Card('b', 'red', '7');
      expect(re.canPlayCard(card, top, 'red')).toBe(true);
    });

    it('should allow matching value', () => {
      const re = new RuleEngine();
      const card = new Card('a', 'blue', '5');
      const top = new Card('b', 'red', '5');
      expect(re.canPlayCard(card, top, 'red')).toBe(true);
    });

    it('should allow wild on anything', () => {
      const re = new RuleEngine();
      const card = new Card('a', WILD_COLOR, CARD_VALUES.WILD);
      const top = new Card('b', 'green', '9');
      expect(re.canPlayCard(card, top, 'green')).toBe(true);
    });

    it('should reject non-matching card', () => {
      const re = new RuleEngine();
      const card = new Card('a', 'blue', '3');
      const top = new Card('b', 'red', '7');
      expect(re.canPlayCard(card, top, 'red')).toBe(false);
    });

    it('should enforce noBluffingWildDraw4', () => {
      const re = new RuleEngine({ noBluffingWildDraw4: true });
      const player = new Player('p1', 'Alice');
      player.addCards([
        new Card('c1', 'red', '5'),
        new Card('wd4', WILD_COLOR, CARD_VALUES.WILD_DRAW_FOUR),
      ]);
      const top = new Card('t', 'red', '3');
      // Player has red card, so can't bluff WD4
      expect(re.canPlayCard(player.getCard('wd4'), top, 'red', player)).toBe(false);
    });

    it('should allow WD4 when no matching color (noBluffing)', () => {
      const re = new RuleEngine({ noBluffingWildDraw4: true });
      const player = new Player('p1', 'Alice');
      player.addCards([
        new Card('c1', 'blue', '5'),
        new Card('wd4', WILD_COLOR, CARD_VALUES.WILD_DRAW_FOUR),
      ]);
      const top = new Card('t', 'red', '3');
      expect(re.canPlayCard(player.getCard('wd4'), top, 'red', player)).toBe(true);
    });
  });

  describe('stacking', () => {
    it('should not allow stacking by default', () => {
      const re = new RuleEngine();
      const card = new Card('a', 'blue', CARD_VALUES.DRAW_TWO);
      const top = new Card('b', 'red', CARD_VALUES.DRAW_TWO);
      expect(re.canStackDrawCard(card, top, 2)).toBe(false);
    });

    it('should allow stacking +2 on +2 when enabled', () => {
      const re = new RuleEngine({ stackDrawCards: true });
      const card = new Card('a', 'blue', CARD_VALUES.DRAW_TWO);
      const top = new Card('b', 'red', CARD_VALUES.DRAW_TWO);
      expect(re.canStackDrawCard(card, top, 2)).toBe(true);
    });

    it('should allow stacking +4 on +4 when enabled', () => {
      const re = new RuleEngine({ stackWildDraw4: true });
      const card = new Card('a', WILD_COLOR, CARD_VALUES.WILD_DRAW_FOUR);
      const top = new Card('b', WILD_COLOR, CARD_VALUES.WILD_DRAW_FOUR);
      expect(re.canStackDrawCard(card, top, 4)).toBe(true);
    });

    it('should allow cross-stacking when enabled', () => {
      const re = new RuleEngine({ stackDraw2OnDraw4: true });
      const draw2 = new Card('a', 'red', CARD_VALUES.DRAW_TWO);
      const wd4 = new Card('b', WILD_COLOR, CARD_VALUES.WILD_DRAW_FOUR);
      expect(re.canStackDrawCard(draw2, wd4, 4)).toBe(true);
      expect(re.canStackDrawCard(wd4, draw2, 2)).toBe(true);
    });

    it('should not stack when pending draw is 0', () => {
      const re = new RuleEngine({ stackDrawCards: true });
      const card = new Card('a', 'blue', CARD_VALUES.DRAW_TWO);
      const top = new Card('b', 'red', CARD_VALUES.DRAW_TWO);
      expect(re.canStackDrawCard(card, top, 0)).toBe(false);
    });
  });

  describe('jump-in', () => {
    it('should not allow jump-in by default', () => {
      const re = new RuleEngine();
      const card = new Card('a', 'blue', '5');
      const top = new Card('b', 'red', '5');
      expect(re.canJumpIn(card, top)).toBe(false);
    });

    it('should allow jump-in when enabled', () => {
      const re = new RuleEngine({ allowSameNumberDifferentColor: true });
      const card = new Card('a', 'blue', '5');
      const top = new Card('b', 'red', '5');
      expect(re.canJumpIn(card, top)).toBe(true);
    });

    it('should not jump-in with same color', () => {
      const re = new RuleEngine({ allowSameNumberDifferentColor: true });
      const card = new Card('a', 'red', '5');
      const top = new Card('b', 'red', '5');
      expect(re.canJumpIn(card, top)).toBe(false);
    });

    it('should not jump-in with wild cards', () => {
      const re = new RuleEngine({ allowSameNumberDifferentColor: true });
      const card = new Card('a', WILD_COLOR, CARD_VALUES.WILD);
      const top = new Card('b', 'red', '5');
      expect(re.canJumpIn(card, top)).toBe(false);
    });
  });

  describe('special rules', () => {
    it('should detect seven swap', () => {
      const re = new RuleEngine({ sevenSwapHands: true });
      const seven = new Card('a', 'red', '7');
      const five = new Card('b', 'red', '5');
      expect(re.shouldSwapHands(seven)).toBe(true);
      expect(re.shouldSwapHands(five)).toBe(false);
    });

    it('should detect zero rotate', () => {
      const re = new RuleEngine({ zeroRotateHands: true });
      const zero = new Card('a', 'red', '0');
      const five = new Card('b', 'red', '5');
      expect(re.shouldRotateHands(zero)).toBe(true);
      expect(re.shouldRotateHands(five)).toBe(false);
    });

    it('should handle draw rules', () => {
      const re = new RuleEngine({ playMatchingCardOnDraw: true, forcePlayOnDraw: false, drawUntilPlayable: true });
      expect(re.canPlayDrawnCard()).toBe(true);
      expect(re.mustPlayDrawnCard()).toBe(false);
      expect(re.shouldDrawUntilPlayable()).toBe(true);
    });
  });

  describe('game over conditions', () => {
    it('should detect first-out win', () => {
      const re = new RuleEngine({ winCondition: 'first_out' });
      const p1 = new Player('p1', 'Alice');
      const p2 = new Player('p2', 'Bob');
      p2.addCards([new Card('c1', 'red', '5')]);
      expect(re.isGameOver([p1, p2])).toBe(true);
      expect(re.getRoundWinner([p1, p2]).id).toBe('p1');
    });

    it('should not be over if no one has empty hand', () => {
      const re = new RuleEngine({ winCondition: 'first_out' });
      const p1 = new Player('p1', 'Alice');
      const p2 = new Player('p2', 'Bob');
      p1.addCards([new Card('c1', 'red', '5')]);
      p2.addCards([new Card('c2', 'blue', '3')]);
      expect(re.isGameOver([p1, p2])).toBe(false);
    });

    it('should detect last-standing win', () => {
      const re = new RuleEngine({ winCondition: 'last_standing' });
      const p1 = new Player('p1', 'Alice');
      const p2 = new Player('p2', 'Bob');
      const p3 = new Player('p3', 'Charlie');
      p3.addCards([new Card('c1', 'red', '5')]);
      // p1 and p2 have no cards, p3 has 1 → only 1 player with cards
      expect(re.isGameOver([p1, p2, p3])).toBe(true);
    });

    it('should check point limit', () => {
      const re = new RuleEngine({ pointLimit: 200 });
      const p1 = new Player('p1', 'Alice');
      p1.totalScore = 250;
      const p2 = new Player('p2', 'Bob');
      p2.totalScore = 100;
      expect(re.hasReachedPointLimit([p1, p2])).toBe(true);
    });

    it('should return true for point limit 0 (single round)', () => {
      const re = new RuleEngine({ pointLimit: 0 });
      expect(re.hasReachedPointLimit([])).toBe(true);
    });
  });

  it('should get draw amount for draw cards', () => {
    const re = new RuleEngine();
    expect(re.getDrawAmount(new Card('a', 'red', CARD_VALUES.DRAW_TWO))).toBe(2);
    expect(re.getDrawAmount(new Card('b', WILD_COLOR, CARD_VALUES.WILD_DRAW_FOUR))).toBe(4);
    expect(re.getDrawAmount(new Card('c', 'red', '5'))).toBe(0);
  });

  it('should update rules', () => {
    const re = new RuleEngine();
    expect(re.rules.stackDrawCards).toBe(false);
    re.updateRules({ stackDrawCards: true });
    expect(re.rules.stackDrawCards).toBe(true);
  });

  describe('combo play', () => {
    it('should detect combo play enabled', () => {
      const re = new RuleEngine({ comboPlay: true });
      expect(re.isComboPlayEnabled()).toBe(true);
    });

    it('should detect combo play disabled by default', () => {
      const re = new RuleEngine();
      expect(re.isComboPlayEnabled()).toBe(false);
    });

    it('should validate a valid combo chain (same value, different colors)', () => {
      const re = new RuleEngine({ comboPlay: true });
      const top = new Card('t', 'green', '4');
      const cards = [
        new Card('c1', 'green', '8'),
        new Card('c2', 'red', '8'),
        new Card('c3', 'blue', '8'),
      ];
      const result = re.validateComboChain(cards, top, 'green', null);
      expect(result.valid).toBe(true);
    });

    it('should reject combo when disabled', () => {
      const re = new RuleEngine({ comboPlay: false });
      const top = new Card('t', 'green', '4');
      const cards = [
        new Card('c1', 'green', '8'),
        new Card('c2', 'red', '8'),
      ];
      const result = re.validateComboChain(cards, top, 'green', null);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not enabled');
    });

    it('should reject combo with fewer than 2 cards', () => {
      const re = new RuleEngine({ comboPlay: true });
      const top = new Card('t', 'green', '4');
      const cards = [new Card('c1', 'green', '8')];
      const result = re.validateComboChain(cards, top, 'green', null);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('at least 2');
    });

    it('should reject combo with non-number cards', () => {
      const re = new RuleEngine({ comboPlay: true });
      const top = new Card('t', 'red', '5');
      const cards = [
        new Card('c1', 'red', '3'),
        new Card('c2', 'red', CARD_VALUES.SKIP),
      ];
      const result = re.validateComboChain(cards, top, 'red', null);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('number cards');
    });

    it('should reject combo with wild cards', () => {
      const re = new RuleEngine({ comboPlay: true });
      const top = new Card('t', 'red', '5');
      const cards = [
        new Card('c1', 'red', '3'),
        new Card('c2', WILD_COLOR, CARD_VALUES.WILD),
      ];
      const result = re.validateComboChain(cards, top, 'red', null);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('number cards');
    });

    it('should reject combo where first card does not match top', () => {
      const re = new RuleEngine({ comboPlay: true });
      const top = new Card('t', 'green', '4');
      const cards = [
        new Card('c1', 'blue', '7'),
        new Card('c2', 'blue', '3'),
      ];
      const result = re.validateComboChain(cards, top, 'green', null);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('First card');
    });

    it('should reject broken chain (different value)', () => {
      const re = new RuleEngine({ comboPlay: true });
      const top = new Card('t', 'green', '4');
      const cards = [
        new Card('c1', 'green', '8'),
        new Card('c2', 'blue', '3'),  // value 3 != value 8
      ];
      const result = re.validateComboChain(cards, top, 'green', null);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('does not match');
    });

    it('should reject same color different value in chain', () => {
      const re = new RuleEngine({ comboPlay: true });
      const top = new Card('t', 'green', '4');
      const cards = [
        new Card('c1', 'green', '8'),
        new Card('c2', 'green', '3'),  // same color but different value
      ];
      const result = re.validateComboChain(cards, top, 'green', null);
      expect(result.valid).toBe(false);
    });
  });
});
