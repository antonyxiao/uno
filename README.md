# UNO Online

A real-time multiplayer UNO card game built with Node.js, Express, Socket.IO, and vanilla HTML/CSS/JS. No images, all cards are rendered with pure CSS.

## Quick Start

```bash
# Install dependencies
npm install

# Start the server
npm start

# Open in browser
# http://localhost:3000
```

The server runs on port 3000 by default. Set the `PORT` environment variable to change it:

```bash
PORT=8080 npm start
```

## How to Play

1. **Create a Room** — Enter your name and click "Create Room"
2. **Share the Code** — Give the 6-character room code to friends, or copy the invite link
3. **Add Bots** — The host can add Easy/Medium/Hard bots to fill seats
4. **Configure Rules** — The host can toggle house rules before starting
5. **Start the Game** — The host clicks "Start Game" once 2+ players have joined

### In-Game Controls

| Action | Mouse | Keyboard |
|--------|-------|----------|
| Select card | Click once | Arrow Left / Right |
| Play card | Click selected card again | Enter |
| Draw card | Click draw pile | Space |
| Call UNO | Click UNO button | U |

## Features

- **2–10 players** per room (humans + bots)
- **Bot AI** with 3 difficulty levels (Easy, Medium, Hard)
- **12 house rules** — stacking, draw rules, jump-in, seven-swap, zero-rotate, and more
- **Real-time updates** via WebSocket (Socket.IO)
- **Reconnection support** — rejoin a game in progress if you disconnect
- **Sound effects** via Web Audio API (no audio files needed)
- **Responsive design** — works on desktop and mobile
- **No sign-up required** — just enter a name and play

## House Rules

| Rule | Description |
|------|-------------|
| Stack Draw Cards | Stack +2 on +2 |
| Stack Wild Draw 4 | Stack +4 on +4 |
| Stack +2 on +4 | Play +2 on a +4 |
| Play on Draw | Play a drawn card immediately if it matches |
| Force Play on Draw | Must play drawn card if it matches |
| Draw Until Playable | Keep drawing until you get a playable card |
| Jump-In | Play same number out of turn |
| Seven Swap | Playing a 7 swaps hands with another player |
| Zero Rotate | Playing a 0 rotates all hands |
| No Bluffing +4 | Wild Draw 4 only playable when no color match in hand |
| Win Condition | First Out or Last Standing |
| Point Limit | Single round, or play to 200/300/500 points |

## Project Structure

```
uno-game/
├── server/
│   ├── index.js              # Express + Socket.IO server
│   ├── config.js             # Game constants and default rules
│   ├── db.js                 # SQLite database
│   ├── game/
│   │   ├── Card.js           # Card class (color, value, points)
│   │   ├── Deck.js           # 108-card deck with shuffle/draw/reshuffle
│   │   ├── Player.js         # Player state and hand management
│   │   ├── TurnManager.js    # Turn order, direction, skip, reverse
│   │   ├── RuleEngine.js     # House rules validation
│   │   ├── ScoreCalculator.js# Round scoring and standings
│   │   ├── GameEngine.js     # Core state machine
│   │   └── BotPlayer.js      # Bot AI (Easy/Medium/Hard)
│   ├── rooms/
│   │   ├── Room.js           # Room state and lifecycle
│   │   └── RoomManager.js    # Room CRUD and cleanup
│   └── socket/
│       ├── socketHandler.js  # Connection/disconnection/reconnection
│       ├── lobbyEvents.js    # Room management events
│       └── gameEvents.js     # Gameplay events
├── public/
│   ├── index.html            # Home page
│   ├── lobby.html            # Game lobby
│   ├── game.html             # Game board
│   ├── css/
│   │   ├── global.css        # Theme, variables, shared components
│   │   ├── home.css          # Home page styles
│   │   ├── lobby.css         # Lobby styles
│   │   ├── cards.css         # Pure CSS card rendering
│   │   └── game.css          # Game board layout
│   └── js/
│       ├── home.js           # Home page logic
│       ├── lobby.js          # Lobby logic
│       ├── game.js           # Game client controller
│       ├── cardRenderer.js   # Card DOM element factory
│       └── uiHelpers.js      # Toasts, modals, animations
└── tests/
    ├── unit/                 # 158 unit tests
    └── integration/          # 14 integration tests (Socket.IO)
```

## Development

```bash
# Run with auto-restart on file changes
npm run dev

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch
```

## Tech Stack

- **Runtime**: Node.js 20+
- **Server**: Express 5
- **Real-time**: Socket.IO 4
- **Database**: SQLite (better-sqlite3)
- **Testing**: Vitest
- **Frontend**: Vanilla HTML/CSS/JS (no frameworks)
- **IDs**: UUID v4
