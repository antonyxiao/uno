import { describe, it, expect } from 'vitest';
import { Card, COLORS, WILD_COLOR, CARD_TYPES, CARD_VALUES, POINTS } from '../../server/game/Card.js';

describe('Card', () => {
  it('should create a number card with correct properties', () => {
    const card = new Card('test-1', 'red', '5');
    expect(card.id).toBe('test-1');
    expect(card.color).toBe('red');
    expect(card.value).toBe('5');
    expect(card.type).toBe(CARD_TYPES.NUMBER);
    expect(card.points).toBe(5);
  });

  it('should create an action card with correct properties', () => {
    const card = new Card('test-2', 'blue', CARD_VALUES.SKIP);
    expect(card.type).toBe(CARD_TYPES.ACTION);
    expect(card.points).toBe(20);
  });

  it('should create a wild card with correct properties', () => {
    const card = new Card('test-3', WILD_COLOR, CARD_VALUES.WILD);
    expect(card.type).toBe(CARD_TYPES.WILD);
    expect(card.points).toBe(50);
    expect(card.isWild()).toBe(true);
  });

  it('should create a wild draw 4 with 50 points', () => {
    const card = new Card('test-4', WILD_COLOR, CARD_VALUES.WILD_DRAW_FOUR);
    expect(card.type).toBe(CARD_TYPES.WILD);
    expect(card.points).toBe(50);
    expect(card.isDrawCard()).toBe(true);
  });

  it('should identify draw cards', () => {
    const draw2 = new Card('t1', 'red', CARD_VALUES.DRAW_TWO);
    const wd4 = new Card('t2', WILD_COLOR, CARD_VALUES.WILD_DRAW_FOUR);
    const normal = new Card('t3', 'blue', '3');
    expect(draw2.isDrawCard()).toBe(true);
    expect(wd4.isDrawCard()).toBe(true);
    expect(normal.isDrawCard()).toBe(false);
  });

  describe('canPlayOn', () => {
    it('should allow same color', () => {
      const card = new Card('a', 'red', '3');
      const top = new Card('b', 'red', '7');
      expect(card.canPlayOn(top, 'red')).toBe(true);
    });

    it('should allow same value different color', () => {
      const card = new Card('a', 'blue', '5');
      const top = new Card('b', 'red', '5');
      expect(card.canPlayOn(top, 'red')).toBe(true);
    });

    it('should reject different color and value', () => {
      const card = new Card('a', 'blue', '3');
      const top = new Card('b', 'red', '7');
      expect(card.canPlayOn(top, 'red')).toBe(false);
    });

    it('should allow wild on anything', () => {
      const card = new Card('a', WILD_COLOR, CARD_VALUES.WILD);
      const top = new Card('b', 'red', '7');
      expect(card.canPlayOn(top, 'red')).toBe(true);
    });

    it('should allow wild draw 4 on anything', () => {
      const card = new Card('a', WILD_COLOR, CARD_VALUES.WILD_DRAW_FOUR);
      const top = new Card('b', 'green', CARD_VALUES.SKIP);
      expect(card.canPlayOn(top, 'green')).toBe(true);
    });

    it('should use currentColor for matching after wild', () => {
      const card = new Card('a', 'blue', '5');
      const top = new Card('b', WILD_COLOR, CARD_VALUES.WILD);
      // Current color was set to blue after wild
      expect(card.canPlayOn(top, 'blue')).toBe(true);
      expect(card.canPlayOn(top, 'red')).toBe(false);
    });

    it('should allow matching action cards by value', () => {
      const card = new Card('a', 'blue', CARD_VALUES.SKIP);
      const top = new Card('b', 'red', CARD_VALUES.SKIP);
      expect(card.canPlayOn(top, 'red')).toBe(true);
    });
  });

  it('should serialize to JSON correctly', () => {
    const card = new Card('test-id', 'green', '8');
    const json = card.toJSON();
    expect(json).toEqual({
      id: 'test-id',
      color: 'green',
      value: '8',
      type: 'number',
      points: 8,
    });
  });

  it('should have correct toString', () => {
    expect(new Card('a', 'red', '5').toString()).toBe('red 5');
    expect(new Card('b', WILD_COLOR, CARD_VALUES.WILD).toString()).toBe('Wild');
    expect(new Card('c', WILD_COLOR, CARD_VALUES.WILD_DRAW_FOUR).toString()).toBe('Wild Draw 4');
  });

  it('should have 4 valid colors', () => {
    expect(COLORS).toEqual(['red', 'blue', 'green', 'yellow']);
  });

  it('should have correct point values for all cards', () => {
    expect(POINTS['0']).toBe(0);
    expect(POINTS['9']).toBe(9);
    expect(POINTS[CARD_VALUES.SKIP]).toBe(20);
    expect(POINTS[CARD_VALUES.REVERSE]).toBe(20);
    expect(POINTS[CARD_VALUES.DRAW_TWO]).toBe(20);
    expect(POINTS[CARD_VALUES.WILD]).toBe(50);
    expect(POINTS[CARD_VALUES.WILD_DRAW_FOUR]).toBe(50);
  });
});
