// UI Helpers - Toasts, Modals, etc.

const UIHelpers = {
  showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  showModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'flex';
  },

  hideModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'none';
  },

  updateConnectionStatus(status) {
    const dot = document.getElementById('connectionDot');
    const label = document.getElementById('connectionLabel');
    if (!dot || !label) return;

    dot.className = 'connection-dot';
    switch (status) {
      case 'connected':
        dot.classList.add('connected');
        label.textContent = 'Connected';
        break;
      case 'disconnected':
        dot.classList.add('disconnected');
        label.textContent = 'Disconnected';
        break;
      case 'reconnecting':
        dot.classList.add('reconnecting');
        label.textContent = 'Reconnecting...';
        break;
    }
  },

  showSkipAnimation(text = 'SKIP!') {
    const container = document.querySelector('.play-area');
    if (!container) return;
    const overlay = document.createElement('div');
    overlay.className = 'skip-overlay';
    overlay.textContent = text;
    container.appendChild(overlay);
    setTimeout(() => overlay.remove(), 800);
  },

  showConfetti() {
    const container = document.createElement('div');
    container.className = 'confetti-container';
    document.body.appendChild(container);

    const colors = ['#FF5555', '#5555FF', '#55AA55', '#FFAA00', '#7c4dff'];
    for (let i = 0; i < 50; i++) {
      const confetti = document.createElement('div');
      confetti.className = 'confetti';
      confetti.style.left = Math.random() * 100 + 'vw';
      confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
      confetti.style.animationDelay = Math.random() * 2 + 's';
      confetti.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
      container.appendChild(confetti);
    }

    setTimeout(() => container.remove(), 5000);
  },

  formatPlayerName(name, isBot) {
    return isBot ? `Bot ${name}` : name;
  },
};

// Make globally available
window.UIHelpers = UIHelpers;
