import { CARD_VALUES, WILD_COLOR } from './Card.js';
import { DEFAULT_HOUSE_RULES } from '../config.js';

export class RuleEngine {
  constructor(houseRules = {}) {
    this.rules = { ...DEFAULT_HOUSE_RULES, ...houseRules };
  }

  updateRules(newRules) {
    Object.assign(this.rules, newRules);
  }

  canPlayCard(card, topCard, currentColor, player) {
    // Basic play validation
    if (card.canPlayOn(topCard, currentColor)) {
      // If noBluffingWildDraw4 and it's a WD4, check if player has matching color
      if (this.rules.noBluffingWildDraw4 && card.value === CARD_VALUES.WILD_DRAW_FOUR) {
        if (player && player.hasColorInHand(currentColor)) {
          return false; // Can't play WD4 if you have matching color
        }
      }
      return true;
    }
    return false;
  }

  canStackDrawCard(card, topCard, pendingDrawCount) {
    if (pendingDrawCount === 0) return false;

    // +2 on +2
    if (this.rules.stackDrawCards &&
        card.value === CARD_VALUES.DRAW_TWO &&
        topCard.value === CARD_VALUES.DRAW_TWO) {
      return true;
    }

    // +4 on +4
    if (this.rules.stackWildDraw4 &&
        card.value === CARD_VALUES.WILD_DRAW_FOUR &&
        topCard.value === CARD_VALUES.WILD_DRAW_FOUR) {
      return true;
    }

    // Cross-stacking +2 on +4 or +4 on +2
    if (this.rules.stackDraw2OnDraw4) {
      if ((card.value === CARD_VALUES.DRAW_TWO && topCard.value === CARD_VALUES.WILD_DRAW_FOUR) ||
          (card.value === CARD_VALUES.WILD_DRAW_FOUR && topCard.value === CARD_VALUES.DRAW_TWO)) {
        return true;
      }
    }

    return false;
  }

  canJumpIn(card, topCard) {
    if (!this.rules.allowSameNumberDifferentColor) return false;
    // Same value, different color (not wild cards)
    return card.value === topCard.value &&
           card.color !== topCard.color &&
           card.color !== WILD_COLOR &&
           topCard.color !== WILD_COLOR;
  }

  shouldSwapHands(card) {
    return this.rules.sevenSwapHands && card.value === CARD_VALUES.SEVEN;
  }

  shouldRotateHands(card) {
    return this.rules.zeroRotateHands && card.value === CARD_VALUES.ZERO;
  }

  isComboPlayEnabled() {
    return this.rules.comboPlay;
  }

  validateComboChain(cards, topCard, currentColor, player) {
    if (!this.rules.comboPlay) {
      return { valid: false, error: 'Combo play is not enabled' };
    }
    if (cards.length < 2) {
      return { valid: false, error: 'Combo requires at least 2 cards' };
    }
    // All cards must be number cards (no wilds, no action cards)
    for (const card of cards) {
      if (!card.isNumber()) {
        return { valid: false, error: 'Combo can only contain number cards' };
      }
    }
    // First card must be playable on the top card
    if (!cards[0].canPlayOn(topCard, currentColor)) {
      return { valid: false, error: 'First card cannot be played on the current discard' };
    }
    // Each subsequent card must match previous by value (same number, any color)
    for (let i = 1; i < cards.length; i++) {
      const prev = cards[i - 1];
      const curr = cards[i];
      if (curr.value !== prev.value) {
        return { valid: false, error: `Card ${i + 1} does not match previous card's value` };
      }
    }
    return { valid: true };
  }

  canPlayDrawnCard() {
    return this.rules.playMatchingCardOnDraw;
  }

  mustPlayDrawnCard() {
    return this.rules.forcePlayOnDraw;
  }

  shouldDrawUntilPlayable() {
    return this.rules.drawUntilPlayable;
  }

  getDrawAmount(card) {
    if (card.value === CARD_VALUES.DRAW_TWO) return 2;
    if (card.value === CARD_VALUES.WILD_DRAW_FOUR) return 4;
    return 0;
  }

  isGameOver(players) {
    if (this.rules.winCondition === 'first_out') {
      return players.some(p => p.hand.length === 0);
    }
    if (this.rules.winCondition === 'last_standing') {
      const activePlayers = players.filter(p => p.hand.length > 0);
      return activePlayers.length <= 1;
    }
    return false;
  }

  getRoundWinner(players) {
    if (this.rules.winCondition === 'first_out') {
      return players.find(p => p.hand.length === 0) || null;
    }
    if (this.rules.winCondition === 'last_standing') {
      const activePlayers = players.filter(p => p.hand.length > 0);
      if (activePlayers.length <= 1) {
        // Winner is the last one standing (or the one with no cards)
        const winner = players.find(p => p.hand.length === 0);
        if (winner) return winner;
        // If everyone still has cards but only 1 left, they win
        return activePlayers.length === 1 ? activePlayers[0] : null;
      }
    }
    return null;
  }

  hasReachedPointLimit(players) {
    if (this.rules.pointLimit === 0) return true; // Single round mode
    return players.some(p => p.totalScore >= this.rules.pointLimit);
  }

  getGameWinner(players) {
    if (this.rules.pointLimit === 0) {
      return this.getRoundWinner(players);
    }
    // Highest total score wins
    return players.reduce((best, p) => (!best || p.totalScore > best.totalScore) ? p : best, null);
  }

  toJSON() {
    return { ...this.rules };
  }
}
