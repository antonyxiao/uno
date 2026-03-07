import { describe, it, expect } from 'vitest';
import { Deck } from '../../server/game/Deck.js';
import { Card, COLORS, WILD_COLOR, CARD_VALUES } from '../../server/game/Card.js';

describe('Deck', () => {
  it('should have exactly 108 cards', () => {
    const deck = new Deck();
    expect(deck.drawPile.length).toBe(108);
  });

  it('should have correct distribution per color', () => {
    const deck = new Deck();
    for (const color of COLORS) {
      const colorCards = deck.drawPile.filter(c => c.color === color);
      // 1 zero + 2*(1-9) = 19 number cards + 2 skip + 2 reverse + 2 draw2 = 25
      expect(colorCards.length).toBe(25);

      // Check zeros
      const zeros = colorCards.filter(c => c.value === '0');
      expect(zeros.length).toBe(1);

      // Check 1-9 (two each)
      for (let n = 1; n <= 9; n++) {
        const nums = colorCards.filter(c => c.value === String(n));
        expect(nums.length).toBe(2);
      }

      // Check action cards (two each)
      for (const action of [CARD_VALUES.SKIP, CARD_VALUES.REVERSE, CARD_VALUES.DRAW_TWO]) {
        const actions = colorCards.filter(c => c.value === action);
        expect(actions.length).toBe(2);
      }
    }
  });

  it('should have 4 Wild and 4 Wild Draw Four cards', () => {
    const deck = new Deck();
    const wilds = deck.drawPile.filter(c => c.value === CARD_VALUES.WILD);
    const wd4s = deck.drawPile.filter(c => c.value === CARD_VALUES.WILD_DRAW_FOUR);
    expect(wilds.length).toBe(4);
    expect(wd4s.length).toBe(4);
  });

  it('should have all unique card IDs', () => {
    const deck = new Deck();
    const ids = new Set(deck.drawPile.map(c => c.id));
    expect(ids.size).toBe(108);
  });

  it('should shuffle the deck (different order)', () => {
    // This is probabilistic but with 108 cards the chance of same order is essentially 0
    const deck1 = new Deck();
    const order1 = deck1.drawPile.map(c => c.id).join(',');
    const deck2 = new Deck();
    const order2 = deck2.drawPile.map(c => c.id).join(',');
    // IDs are random UUIDs so they'll always differ. Check that positions differ.
    // More meaningful: create one deck, record order, shuffle again, should differ
    const deck = new Deck();
    const beforeShuffle = deck.drawPile.map(c => c.id).join(',');
    deck.shuffle();
    const afterShuffle = deck.drawPile.map(c => c.id).join(',');
    expect(afterShuffle).not.toBe(beforeShuffle);
  });

  describe('deal', () => {
    it('should deal correct number of cards to each player', () => {
      const deck = new Deck();
      const hands = deck.deal(4, 7);
      expect(hands.length).toBe(4);
      for (const hand of hands) {
        expect(hand.length).toBe(7);
      }
      // 108 - 28 = 80 remaining
      expect(deck.drawPile.length).toBe(80);
    });

    it('should deal 7 cards by default', () => {
      const deck = new Deck();
      const hands = deck.deal(2);
      expect(hands[0].length).toBe(7);
      expect(hands[1].length).toBe(7);
    });

    it('should deal unique cards', () => {
      const deck = new Deck();
      const hands = deck.deal(4, 7);
      const allDealt = hands.flat();
      const ids = new Set(allDealt.map(c => c.id));
      expect(ids.size).toBe(28);
    });
  });

  describe('draw', () => {
    it('should draw cards from draw pile', () => {
      const deck = new Deck();
      const initialCount = deck.drawPile.length;
      const drawn = deck.draw(3);
      expect(drawn.length).toBe(3);
      expect(deck.drawPile.length).toBe(initialCount - 3);
    });

    it('should draw 1 card by default', () => {
      const deck = new Deck();
      const drawn = deck.draw();
      expect(drawn.length).toBe(1);
    });

    it('should reshuffle discard pile when draw pile is empty', () => {
      const deck = new Deck();
      // Empty the draw pile
      deck.draw(deck.drawPile.length);
      expect(deck.drawPile.length).toBe(0);

      // Add cards to discard pile
      for (let i = 0; i < 10; i++) {
        deck.discardPile.push(new Card(`discard-${i}`, 'red', String(i % 10)));
      }

      // Draw should reshuffle
      const drawn = deck.draw(3);
      expect(drawn.length).toBe(3);
      // Discard pile should have 1 card (the top was kept)
      expect(deck.discardPile.length).toBe(1);
    });

    it('should handle empty draw and discard piles', () => {
      const deck = new Deck();
      deck.drawPile = [];
      deck.discardPile = [];
      const drawn = deck.draw(1);
      expect(drawn.length).toBe(0);
    });
  });

  describe('startDiscard', () => {
    it('should flip top card to discard pile', () => {
      const deck = new Deck();
      const topCard = deck.drawPile[deck.drawPile.length - 1];
      // Only test if top card is not wild_draw4, otherwise deck reshuffles
      const result = deck.startDiscard();
      expect(result).toBeDefined();
      expect(deck.discardPile.length).toBe(1);
      expect(deck.discardPile[0]).toBe(result);
    });

    it('should not start with Wild Draw 4', () => {
      const deck = new Deck();
      const result = deck.startDiscard();
      expect(result.value).not.toBe(CARD_VALUES.WILD_DRAW_FOUR);
    });

    it('should preserve total card count', () => {
      const deck = new Deck();
      deck.startDiscard();
      expect(deck.getTotalCardCount()).toBe(108);
    });
  });

  describe('reshuffle', () => {
    it('should keep top discard card when reshuffling', () => {
      const deck = new Deck();
      deck.deal(4, 7); // 80 remaining
      deck.startDiscard(); // 79 draw, 1 discard

      // Draw all remaining cards
      deck.draw(deck.drawPile.length);
      expect(deck.drawPile.length).toBe(0);

      // Add 20 cards to discard pile
      for (let i = 0; i < 20; i++) {
        deck.discardPile.push(new Card(`extra-${i}`, 'blue', String(i % 10)));
      }
      const topBefore = deck.getTopDiscard();

      // Drawing should trigger reshuffle
      const drawn = deck.draw(5);
      expect(drawn.length).toBe(5);

      // Top discard should still be there
      expect(deck.discardPile.length).toBe(1);
      expect(deck.discardPile[0].id).toBe(topBefore.id);
    });
  });

  it('should report correct pile counts', () => {
    const deck = new Deck();
    expect(deck.drawPileCount).toBe(108);
    expect(deck.discardPileCount).toBe(0);
    deck.startDiscard();
    expect(deck.drawPileCount).toBe(107);
    expect(deck.discardPileCount).toBe(1);
  });
});
