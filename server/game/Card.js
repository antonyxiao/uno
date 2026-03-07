export const COLORS = ['red', 'blue', 'green', 'yellow'];
export const WILD_COLOR = 'wild';

export const CARD_TYPES = {
  NUMBER: 'number',
  ACTION: 'action',
  WILD: 'wild',
};

export const CARD_VALUES = {
  // Numbers
  ZERO: '0', ONE: '1', TWO: '2', THREE: '3', FOUR: '4',
  FIVE: '5', SIX: '6', SEVEN: '7', EIGHT: '8', NINE: '9',
  // Actions
  SKIP: 'skip', REVERSE: 'reverse', DRAW_TWO: 'draw2',
  // Wilds
  WILD: 'wild', WILD_DRAW_FOUR: 'wild_draw4',
};

export const POINTS = {
  [CARD_VALUES.ZERO]: 0,
  [CARD_VALUES.ONE]: 1,
  [CARD_VALUES.TWO]: 2,
  [CARD_VALUES.THREE]: 3,
  [CARD_VALUES.FOUR]: 4,
  [CARD_VALUES.FIVE]: 5,
  [CARD_VALUES.SIX]: 6,
  [CARD_VALUES.SEVEN]: 7,
  [CARD_VALUES.EIGHT]: 8,
  [CARD_VALUES.NINE]: 9,
  [CARD_VALUES.SKIP]: 20,
  [CARD_VALUES.REVERSE]: 20,
  [CARD_VALUES.DRAW_TWO]: 20,
  [CARD_VALUES.WILD]: 50,
  [CARD_VALUES.WILD_DRAW_FOUR]: 50,
};

export class Card {
  constructor(id, color, value) {
    this.id = id;
    this.color = color;
    this.value = value;
    this.type = this._determineType();
    this.points = POINTS[value] ?? 0;
  }

  _determineType() {
    if (this.color === WILD_COLOR) return CARD_TYPES.WILD;
    const numberValues = ['0','1','2','3','4','5','6','7','8','9'];
    if (numberValues.includes(this.value)) return CARD_TYPES.NUMBER;
    return CARD_TYPES.ACTION;
  }

  isWild() {
    return this.type === CARD_TYPES.WILD;
  }

  isAction() {
    return this.type === CARD_TYPES.ACTION;
  }

  isNumber() {
    return this.type === CARD_TYPES.NUMBER;
  }

  isDrawCard() {
    return this.value === CARD_VALUES.DRAW_TWO || this.value === CARD_VALUES.WILD_DRAW_FOUR;
  }

  canPlayOn(topCard, currentColor) {
    // Wild cards can always be played
    if (this.isWild()) return true;
    // Match current color (important for after wild is played)
    if (this.color === currentColor) return true;
    // Match value/symbol
    if (this.value === topCard.value) return true;
    return false;
  }

  toJSON() {
    return {
      id: this.id,
      color: this.color,
      value: this.value,
      type: this.type,
      points: this.points,
    };
  }

  toString() {
    if (this.isWild()) return this.value === 'wild' ? 'Wild' : 'Wild Draw 4';
    return `${this.color} ${this.value}`;
  }
}
