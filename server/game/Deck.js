import { Card, COLORS, WILD_COLOR, CARD_VALUES } from './Card.js';
import { generateCardId } from '../utils/idGenerator.js';

export class Deck {
  constructor() {
    this.drawPile = [];
    this.discardPile = [];
    this._buildDeck();
    this.shuffle();
  }

  _buildDeck() {
    this.drawPile = [];
    let cards = [];

    // For each color: one 0, two each of 1-9, two Skip, two Reverse, two Draw Two
    for (const color of COLORS) {
      // One zero per color
      cards.push(new Card(generateCardId(), color, CARD_VALUES.ZERO));

      // Two each of 1-9
      for (let num = 1; num <= 9; num++) {
        cards.push(new Card(generateCardId(), color, String(num)));
        cards.push(new Card(generateCardId(), color, String(num)));
      }

      // Two each of action cards
      for (const action of [CARD_VALUES.SKIP, CARD_VALUES.REVERSE, CARD_VALUES.DRAW_TWO]) {
        cards.push(new Card(generateCardId(), color, action));
        cards.push(new Card(generateCardId(), color, action));
      }
    }

    // Four Wild and Four Wild Draw Four
    for (let i = 0; i < 4; i++) {
      cards.push(new Card(generateCardId(), WILD_COLOR, CARD_VALUES.WILD));
      cards.push(new Card(generateCardId(), WILD_COLOR, CARD_VALUES.WILD_DRAW_FOUR));
    }

    this.drawPile = cards;
  }

  shuffle() {
    // Fisher-Yates shuffle
    const arr = this.drawPile;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  deal(numPlayers, cardsPerPlayer = 7) {
    const hands = [];
    for (let p = 0; p < numPlayers; p++) {
      hands.push([]);
    }
    // Deal one card at a time to each player
    for (let c = 0; c < cardsPerPlayer; c++) {
      for (let p = 0; p < numPlayers; p++) {
        if (this.drawPile.length === 0) {
          this._reshuffleDiscardIntoDraw();
        }
        hands[p].push(this.drawPile.pop());
      }
    }
    return hands;
  }

  draw(count = 1) {
    const drawn = [];
    for (let i = 0; i < count; i++) {
      if (this.drawPile.length === 0) {
        this._reshuffleDiscardIntoDraw();
      }
      if (this.drawPile.length === 0) {
        // Both piles empty - extremely rare edge case
        break;
      }
      drawn.push(this.drawPile.pop());
    }
    return drawn;
  }

  startDiscard() {
    // Flip top card of draw pile to start discard pile
    // If it's a Wild Draw 4, put it back and try again (official rules)
    let attempts = 0;
    while (attempts < this.drawPile.length) {
      const card = this.drawPile.pop();
      if (card.value === CARD_VALUES.WILD_DRAW_FOUR) {
        // Put it back somewhere in the draw pile and reshuffle
        this.drawPile.unshift(card);
        this.shuffle();
        attempts++;
        continue;
      }
      this.discardPile.push(card);
      return card;
    }
    // Fallback: if all remaining cards somehow are wild draw 4, just use one
    const card = this.drawPile.pop();
    this.discardPile.push(card);
    return card;
  }

  addToDiscard(card) {
    this.discardPile.push(card);
  }

  getTopDiscard() {
    return this.discardPile[this.discardPile.length - 1] || null;
  }

  _reshuffleDiscardIntoDraw() {
    if (this.discardPile.length <= 1) return; // Keep top card
    const topCard = this.discardPile.pop();
    this.drawPile = [...this.discardPile];
    this.discardPile = [topCard];
    this.shuffle();
  }

  get drawPileCount() {
    return this.drawPile.length;
  }

  get discardPileCount() {
    return this.discardPile.length;
  }

  getTotalCardCount() {
    return this.drawPile.length + this.discardPile.length;
  }
}
