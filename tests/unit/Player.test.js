import { describe, it, expect } from 'vitest';
import { Player } from '../../server/game/Player.js';
import { Card, WILD_COLOR, CARD_VALUES } from '../../server/game/Card.js';

describe('Player', () => {
  it('should create a player with correct properties', () => {
    const player = new Player('p1', 'Alice');
    expect(player.id).toBe('p1');
    expect(player.name).toBe('Alice');
    expect(player.hand).toEqual([]);
    expect(player.score).toBe(0);
    expect(player.isBot).toBe(false);
    expect(player.connected).toBe(true);
  });

  it('should create a bot player', () => {
    const bot = new Player('b1', 'Bot', true, 'medium');
    expect(bot.isBot).toBe(true);
    expect(bot.botDifficulty).toBe('medium');
  });

  it('should add cards to hand', () => {
    const player = new Player('p1', 'Alice');
    const cards = [
      new Card('c1', 'red', '5'),
      new Card('c2', 'blue', '3'),
    ];
    player.addCards(cards);
    expect(player.hand.length).toBe(2);
    expect(player.cardCount).toBe(2);
  });

  it('should remove a card from hand', () => {
    const player = new Player('p1', 'Alice');
    const card = new Card('c1', 'red', '5');
    player.addCards([card]);
    const removed = player.removeCard('c1');
    expect(removed).toBe(card);
    expect(player.hand.length).toBe(0);
  });

  it('should return null when removing non-existent card', () => {
    const player = new Player('p1', 'Alice');
    expect(player.removeCard('nonexistent')).toBeNull();
  });

  it('should check if card is in hand', () => {
    const player = new Player('p1', 'Alice');
    player.addCards([new Card('c1', 'red', '5')]);
    expect(player.hasCard('c1')).toBe(true);
    expect(player.hasCard('c2')).toBe(false);
  });

  it('should check if color is in hand', () => {
    const player = new Player('p1', 'Alice');
    player.addCards([new Card('c1', 'red', '5'), new Card('c2', 'blue', '3')]);
    expect(player.hasColorInHand('red')).toBe(true);
    expect(player.hasColorInHand('green')).toBe(false);
  });

  it('should get playable cards', () => {
    const player = new Player('p1', 'Alice');
    const cards = [
      new Card('c1', 'red', '5'),
      new Card('c2', 'blue', '3'),
      new Card('c3', 'red', '7'),
      new Card('c4', WILD_COLOR, CARD_VALUES.WILD),
    ];
    player.addCards(cards);

    const topCard = new Card('top', 'red', '2');
    const playable = player.getPlayableCards(topCard, 'red');
    expect(playable.length).toBe(3); // red 5, red 7, wild
  });

  it('should detect win condition', () => {
    const player = new Player('p1', 'Alice');
    expect(player.hasWon).toBe(true); // empty hand at start
    player.addCards([new Card('c1', 'red', '5')]);
    expect(player.hasWon).toBe(false);
  });

  it('should handle disconnection state', () => {
    const player = new Player('p1', 'Alice');
    player.setDisconnected();
    expect(player.connected).toBe(false);
    expect(player.disconnectedAt).toBeGreaterThan(0);

    player.setConnected();
    expect(player.connected).toBe(true);
    expect(player.disconnectedAt).toBeNull();
  });

  it('should serialize to JSON without hand', () => {
    const player = new Player('p1', 'Alice');
    player.addCards([new Card('c1', 'red', '5')]);
    const json = player.toJSON(false);
    expect(json.hand).toBeUndefined();
    expect(json.cardCount).toBe(1);
  });

  it('should serialize to JSON with hand', () => {
    const player = new Player('p1', 'Alice');
    player.addCards([new Card('c1', 'red', '5')]);
    const json = player.toJSON(true);
    expect(json.hand).toBeDefined();
    expect(json.hand.length).toBe(1);
  });

  it('should reset UNO status when adding cards to hand > 1', () => {
    const player = new Player('p1', 'Alice');
    player.addCards([new Card('c1', 'red', '5')]);
    player.calledUno = true;
    player.addCards([new Card('c2', 'blue', '3')]);
    expect(player.calledUno).toBe(false);
  });

  it('should set hand directly', () => {
    const player = new Player('p1', 'Alice');
    const cards = [new Card('c1', 'red', '5'), new Card('c2', 'blue', '3')];
    player.setHand(cards);
    expect(player.hand.length).toBe(2);
    expect(player.calledUno).toBe(false);
  });
});
