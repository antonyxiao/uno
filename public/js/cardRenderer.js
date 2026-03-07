// Card Renderer - Creates card DOM elements from card data

const CardRenderer = {
  createCard(cardData, options = {}) {
    const { clickable = false, mini = false, faceDown = false } = options;
    const el = document.createElement('div');

    if (faceDown) {
      el.className = `card card-back ${mini ? 'mini' : ''}`;
      el.innerHTML = mini ? '' : '<div class="card-back-inner">UNO</div>';
      return el;
    }

    const colorClass = cardData.color === 'wild' ? 'wild' : cardData.color;
    el.className = `card ${colorClass} ${mini ? 'mini' : ''}`;
    el.dataset.cardId = cardData.id;

    if (clickable) {
      el.style.cursor = 'pointer';
    }

    // Determine display value
    const displayValue = this._getDisplayValue(cardData);
    const cornerValue = this._getCornerValue(cardData);

    if (cardData.color === 'wild') {
      el.innerHTML = this._renderWild(cardData, mini);
    } else {
      el.innerHTML = `
        <span class="card-corner top">${cornerValue}</span>
        <div class="card-inner">
          <span class="card-value">${displayValue}</span>
        </div>
        <span class="card-corner bottom">${cornerValue}</span>
      `;
    }

    return el;
  },

  _getDisplayValue(card) {
    switch (card.value) {
      case 'skip': return '\u29D8';
      case 'reverse': return '\u21BB';
      case 'draw2': return '+2';
      case 'wild': return '';
      case 'wild_draw4': return '+4';
      default: return card.value;
    }
  },

  _getCornerValue(card) {
    switch (card.value) {
      case 'skip': return '\u29D8';
      case 'reverse': return '\u21BB';
      case 'draw2': return '+2';
      case 'wild': return 'W';
      case 'wild_draw4': return '+4';
      default: return card.value;
    }
  },

  _renderWild(card, mini) {
    if (mini) return '';

    const isWD4 = card.value === 'wild_draw4';
    return `
      <span class="card-corner top" style="color:white">${isWD4 ? '+4' : 'W'}</span>
      <div class="card-inner" style="background:transparent">
        <div class="wild-symbol">
          <div class="q1"></div>
          <div class="q2"></div>
          <div class="q3"></div>
          <div class="q4"></div>
        </div>
      </div>
      ${isWD4 ? '<span class="wd4-label">+4</span>' : ''}
      <span class="card-corner bottom" style="color:white">${isWD4 ? '+4' : 'W'}</span>
    `;
  },

  createCardBack(mini = false) {
    return this.createCard({}, { faceDown: true, mini });
  },

  // Create a hand of fanned cards (for opponents)
  createOpponentHand(cardCount, maxVisible = 7) {
    const container = document.createElement('div');
    container.className = 'opponent-cards';

    const visible = Math.min(cardCount, maxVisible);
    for (let i = 0; i < visible; i++) {
      container.appendChild(this.createCardBack(true));
    }

    return container;
  },
};

window.CardRenderer = CardRenderer;
