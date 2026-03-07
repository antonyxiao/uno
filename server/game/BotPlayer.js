import { Player } from './Player.js';
import { CARD_VALUES, WILD_COLOR, COLORS } from './Card.js';
import { GAME_CONSTANTS } from '../config.js';

const BOT_NAMES = [
  'Botsworth', 'RoboUno', 'CardBot', 'UnoMaster', 'DeepDraw',
  'WildCard', 'SkipBot', 'ReverseBot', 'DrawTwo', 'StackBot',
  'AceBot', 'CardShark', 'BlueBolt', 'RedRocket', 'GreenGear',
];

let botNameIndex = 0;

export function getRandomBotName() {
  const name = BOT_NAMES[botNameIndex % BOT_NAMES.length];
  botNameIndex++;
  return name;
}

export function getBotDelay() {
  return GAME_CONSTANTS.BOT_DELAY_MIN_MS +
    Math.random() * (GAME_CONSTANTS.BOT_DELAY_MAX_MS - GAME_CONSTANTS.BOT_DELAY_MIN_MS);
}

export class BotPlayer extends Player {
  constructor(id, name, difficulty = 'medium') {
    super(id, name, true, difficulty);
  }

  /**
   * Choose a card to play given the game state.
   * Returns { cardId, chosenColor } or null if should draw.
   */
  choosePlay(topCard, currentColor, pendingDrawCount, ruleEngine) {
    const playable = this.getPlayableCards(topCard, currentColor);

    // If there's a pending draw, check for stacking
    if (pendingDrawCount > 0) {
      const stackable = playable.filter(c =>
        ruleEngine.canStackDrawCard(c, topCard, pendingDrawCount)
      );
      if (stackable.length > 0) {
        const card = this._pickBestCard(stackable, currentColor);
        return { cardId: card.id, chosenColor: card.isWild() ? this._pickColor() : null };
      }
      return null; // Must draw
    }

    if (playable.length === 0) return null; // Must draw

    switch (this.botDifficulty) {
      case 'easy': return this._easyStrategy(playable, currentColor);
      case 'hard': return this._hardStrategy(playable, currentColor, topCard);
      default: return this._mediumStrategy(playable, currentColor);
    }
  }

  _easyStrategy(playable, currentColor) {
    // Play random valid card
    const card = playable[Math.floor(Math.random() * playable.length)];
    return {
      cardId: card.id,
      chosenColor: card.isWild() ? COLORS[Math.floor(Math.random() * COLORS.length)] : null,
    };
  }

  _mediumStrategy(playable, currentColor) {
    // Prioritize action cards, try to match color majority
    const actions = playable.filter(c => c.isAction() || c.isDrawCard());
    const numbers = playable.filter(c => c.isNumber());
    const wilds = playable.filter(c => c.isWild());

    let card;
    // Play action cards first (but save wilds)
    if (actions.length > 0) {
      card = actions[0];
    } else if (numbers.length > 0) {
      card = this._pickBestCard(numbers, currentColor);
    } else {
      card = wilds[0] || playable[0];
    }

    return {
      cardId: card.id,
      chosenColor: card.isWild() ? this._pickColor() : null,
    };
  }

  _hardStrategy(playable, currentColor, topCard) {
    // Strategic: save wilds, play high-point non-wilds first, optimal color selection
    const wilds = playable.filter(c => c.isWild());
    const nonWilds = playable.filter(c => !c.isWild());

    let card;
    if (nonWilds.length > 0) {
      // Play highest point non-wild card
      nonWilds.sort((a, b) => b.points - a.points);
      card = nonWilds[0];
    } else {
      // Must play wild
      // Prefer regular wild over WD4
      const regularWild = wilds.find(c => c.value === CARD_VALUES.WILD);
      card = regularWild || wilds[0];
    }

    return {
      cardId: card.id,
      chosenColor: card.isWild() ? this._pickColor() : null,
    };
  }

  _pickBestCard(cards, currentColor) {
    // Prefer cards matching current color
    const matching = cards.filter(c => c.color === currentColor);
    if (matching.length > 0) return matching[0];
    return cards[0];
  }

  _pickColor() {
    // Pick color based on most cards of that color in hand
    const colorCount = {};
    for (const color of COLORS) colorCount[color] = 0;
    for (const card of this.hand) {
      if (card.color !== WILD_COLOR) {
        colorCount[card.color]++;
      }
    }
    let bestColor = COLORS[0];
    let bestCount = 0;
    for (const color of COLORS) {
      if (colorCount[color] > bestCount) {
        bestCount = colorCount[color];
        bestColor = color;
      }
    }
    return bestColor;
  }

  /**
   * Choose a combo play (chain of number cards).
   * Returns { cardIds } or null if no valid combo found.
   */
  chooseComboPlay(topCard, currentColor, ruleEngine) {
    if (!ruleEngine.isComboPlayEnabled()) return null;

    // Find all playable number cards for the first position
    const playable = this.hand.filter(c =>
      c.isNumber() && c.canPlayOn(topCard, currentColor)
    );

    let bestCombo = null;

    for (const startCard of playable) {
      const chain = [startCard];
      const used = new Set([startCard.id]);

      // Greedily extend the chain
      let extended = true;
      while (extended) {
        extended = false;
        const prev = chain[chain.length - 1];
        for (const card of this.hand) {
          if (used.has(card.id)) continue;
          if (!card.isNumber()) continue;
          if (card.value === prev.value) {
            chain.push(card);
            used.add(card.id);
            extended = true;
            break;
          }
        }
      }

      if (chain.length >= 2 && (!bestCombo || chain.length > bestCombo.length)) {
        bestCombo = chain;
      }
    }

    if (bestCombo) {
      return { cardIds: bestCombo.map(c => c.id) };
    }
    return null;
  }

  /**
   * Choose a swap target (for seven-swap rule)
   */
  chooseSwapTarget(players) {
    // Target player with fewest cards
    let target = null;
    let minCards = Infinity;
    for (const p of players) {
      if (p.id === this.id) continue;
      if (p.cardCount < minCards) {
        minCards = p.cardCount;
        target = p;
      }
    }
    return target ? target.id : players.find(p => p.id !== this.id)?.id;
  }

  /**
   * Should this bot call UNO?
   */
  shouldCallUno() {
    if (this.botDifficulty === 'easy') {
      return Math.random() > 0.3; // Sometimes forgets
    }
    return true; // Medium and Hard always call
  }
}
