/**
 * Jeopardy Game Server
 * Texas History — Oil, Cattle, and Cotton
 * Node.js + Express + Socket.io
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// ── CORS ──
// Allow your Netlify frontend URL and local dev
const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL,       // set this in Render environment variables
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  /\.netlify\.app$/,              // any netlify preview URLs
].filter(Boolean);

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // allow non-browser requests
      const allowed = ALLOWED_ORIGINS.some(o =>
        o instanceof RegExp ? o.test(origin) : o === origin
      );
      allowed ? callback(null, true) : callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// ── HEALTH CHECK ──
app.get('/', (req, res) => {
  res.json({ status: 'Jeopardy server running', games: Object.keys(games).length });
});

// ── GAME STATE ──
// games[code] = { ...gameState }
const games = {};

const VALUES = [100, 200, 300, 400, 500];

function generateCode() {
  let code;
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
  } while (games[code]);
  return code;
}

function createGame(mode, categories, clues, finalJeopardy) {
  const code = generateCode();
  games[code] = {
    code,
    mode,           // 'team' | 'individual'
    phase: 'lobby', // lobby | playing | final | ended
    teacherSocketId: null,
    teams: {},      // teamId -> { name, score, members: [socketId] }
    players: {},    // socketId -> { name, teamId }
    board: Array.from({ length: 5 }, () => Array(5).fill(false)), // used[col][row]
    activeClue: null,   // { col, row, timerSecs, timerStart } | null
    buzzOrder: [],      // socketIds in buzz order
    verdicts: {},       // teamId -> 'correct' | 'wrong' | null
    categories,
    clues,
    finalJeopardy,
    createdAt: Date.now()
  };
  return code;
}

function getPublicGame(code) {
  const g = games[code];
  if (!g) return null;
  return {
    code: g.code,
    mode: g.mode,
    phase: g.phase,
    teams: g.teams,
    board: g.board,
    activeClue: g.activeClue ? {
      col: g.activeClue.col,
      row: g.activeClue.row,
      question: g.clues[g.activeClue.col][g.activeClue.row].q,
      timerSecs: g.activeClue.timerSecs,
      timerStart: g.activeClue.timerStart,
    } : null,
    buzzOrder: g.buzzOrder,
    verdicts: g.verdicts,
    categories: g.categories,
    finalJeopardy: g.phase === 'final' ? g.finalJeopardy : null,
  };
}

// ── SHEET PROXY ──
const SHEET_BASE = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRUkte7Ys_f2Bp1b7eCQnOsxLYCkQ29p1qOdwMMt2_-0p8Hk50nFM8yotjSB-sDVGGvI_-xE6JMjMvc/pub';

app.get('/sheet', async (req, res) => {
  const { gid } = req.query;
  if (!gid) return res.status(400).json({ error: 'Missing gid parameter' });
  const url = `${SHEET_BASE}?gid=${gid}&single=true&output=csv`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Google returned ${response.status}`);
    const text = await response.text();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(text);
  } catch (e) {
    console.error(`[sheet proxy] error for gid=${gid}:`, e.message);
    res.status(502).json({ error: e.message });
  }
});

// ── DEFAULT QUESTION DATA ──
const DEFAULT_CATEGORIES = [
  "Cotton & Cowboys",
  "Cattle Drives",
  "Railroads",
  "Spindletop & Oil",
  "Texas Transforms"
];

const DEFAULT_CLUES = [
  [
    { q: "This crop dominated the Texas economy after the Civil War and relied on sharecropping labor.", a: "Cotton" },
    { q: "These workers, often Black or Hispanic, farmed land they didn't own in exchange for a share of the crop.", a: "Sharecroppers / Tenant farmers" },
    { q: "Overproduction of this crop caused falling prices and sent many Texas farmers into debt in the late 1800s.", a: "Cotton" },
    { q: "This organization united struggling Texas farmers to fight railroad rates and demand economic reform.", a: "The Farmers' Alliance (Grange)" },
    { q: "Farmers who couldn't pay debts lost this, leading to a cycle of poverty that defined rural Texas for decades.", a: "Their land (foreclosure)" }
  ],
  [
    { q: "This Texas cattle breed was perfectly adapted to the dry plains and became the backbone of the cattle industry.", a: "Texas Longhorn" },
    { q: "This famous trail stretched from San Antonio north to Abilene, Kansas, and moved millions of cattle to market.", a: "The Chisholm Trail" },
    { q: "This invention ended the open range era by allowing ranchers to fence off land across the Texas plains.", a: "Barbed wire" },
    { q: "Cowboys driving cattle north were paid at the end of the trail in these Kansas railroad towns.", a: "Cow towns (Abilene, Dodge City)" },
    { q: "About one in three cowboys on the Texas cattle trails came from this background.", a: "Black / African American (Buffalo Soldiers, freed slaves)" }
  ],
  [
    { q: "Railroads transformed Texas by connecting farms and ranches to these distant markets.", a: "National markets (Northern cities)" },
    { q: "This city became a major railroad hub and meatpacking center, earning it the nickname 'Cowtown.'", a: "Fort Worth" },
    { q: "This Texas governor championed railroad regulation and created the Texas Railroad Commission in 1891.", a: "James Stephen Hogg" },
    { q: "Railroads caused these Texas towns to appear almost overnight along new rail lines.", a: "Boomtowns" },
    { q: "The Texas Railroad Commission, created in 1891, still regulates this industry today.", a: "Oil and gas (energy industry)" }
  ],
  [
    { q: "This January 10, 1901 event near Beaumont changed Texas — and the world — forever.", a: "The Spindletop oil gusher / blowout" },
    { q: "The Spindletop gusher produced more oil per day than all other U.S. oil fields combined at the time. It was located near this Southeast Texas city.", a: "Beaumont, Texas" },
    { q: "These rapid population explosions near oil strikes brought workers, businesses, and lawlessness to Texas towns.", a: "Oil booms" },
    { q: "After the oil ran out, these towns lost population just as fast as they had gained it.", a: "Bust / Bust towns (boom-and-bust cycle)" },
    { q: "Oil discoveries transformed Texas from an agricultural state into a leading producer of this resource that powered the 20th century.", a: "Petroleum / fossil fuels / energy" }
  ],
  [
    { q: "The growth of railroads, cattle, and oil all contributed to the rapid growth of Texas in this era.", a: "Urbanization / industrialization (late 1800s–early 1900s)" },
    { q: "The cattle, railroad, and oil industries all relied heavily on the labor of these groups who were often paid less and given fewer rights.", a: "Black Texans, Mexican Texans, immigrants" },
    { q: "Texas went from an economy based on farming to one based on industry. Historians call this large-scale shift this.", a: "Industrialization" },
    { q: "Oil wealth funded the growth of Texas cities, universities, and this type of public infrastructure.", a: "Roads, schools, public buildings (infrastructure)" },
    { q: "The discovery of oil at Spindletop made Texas one of the wealthiest states in the nation. The industry it created is still the backbone of the Texas economy today, known as this.", a: "The oil and gas (energy) industry" }
  ]
];

const DEFAULT_FINAL = {
  category: "Texas Rising",
  clue: "This January 10, 1901 discovery near Beaumont transformed Texas from an agricultural state into an industrial powerhouse and is considered the birth of the modern oil industry.",
  answer: "Spindletop"
};

// ── SOCKET EVENTS ──
io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);

  // ── TEACHER: CREATE GAME ──
  socket.on('create-game', ({ mode, categories, clues, finalJeopardy } = {}) => {
    const code = createGame(
      mode || 'team',
      categories || DEFAULT_CATEGORIES,
      clues || DEFAULT_CLUES,
      finalJeopardy || DEFAULT_FINAL
    );
    const g = games[code];
    g.teacherSocketId = socket.id;
    socket.join(code);
    socket.emit('game-created', { code, game: getPublicGame(code) });
    console.log(`[create] game ${code} mode=${mode}`);
  });

  // ── STUDENT: JOIN GAME ──
  socket.on('join-game', ({ code, name, teamName }) => {
    const g = games[code];
    if (!g) return socket.emit('error', { message: 'Game not found. Check your code.' });
    if (g.phase !== 'lobby') return socket.emit('error', { message: 'Game already started.' });

    const mode = g.mode;

    if (mode === 'individual') {
      // Each player is their own team
      const teamId = socket.id;
      g.teams[teamId] = { name, score: 0, members: [socket.id] };
      g.players[socket.id] = { name, teamId };
    } else {
      // Team mode: join or create a team by teamName
      const existingTeam = Object.entries(g.teams).find(([, t]) => t.name === teamName);
      let teamId;
      if (existingTeam) {
        teamId = existingTeam[0];
        g.teams[teamId].members.push(socket.id);
      } else {
        teamId = `team-${Object.keys(g.teams).length + 1}`;
        g.teams[teamId] = { name: teamName, score: 0, members: [socket.id] };
      }
      g.players[socket.id] = { name, teamId };
    }

    socket.join(code);
    socket.emit('joined', { game: getPublicGame(code), playerId: socket.id, teamId: g.players[socket.id].teamId });
    io.to(code).emit('game-update', getPublicGame(code));
    console.log(`[join] ${name} → game ${code}`);
  });

  // ── TEACHER: REJOIN (page refresh) ──
  socket.on('rejoin-teacher', ({ code }) => {
    const g = games[code];
    if (!g) return socket.emit('error', { message: 'Game not found.' });
    g.teacherSocketId = socket.id;
    socket.join(code);
    socket.emit('game-update', getPublicGame(code));
  });

  // ── TEACHER: START GAME ──
  socket.on('start-game', ({ code }) => {
    const g = games[code];
    if (!g || g.teacherSocketId !== socket.id) return;
    g.phase = 'playing';
    io.to(code).emit('game-update', getPublicGame(code));
    console.log(`[start] game ${code}`);
  });

  // ── TEACHER: OPEN CLUE ──
  socket.on('open-clue', ({ code, col, row, timerSecs }) => {
    const g = games[code];
    if (!g || g.teacherSocketId !== socket.id) return;
    if (g.board[col][row]) return; // already used
    g.activeClue = { col, row, timerSecs: timerSecs || 30, timerStart: Date.now() };
    g.buzzOrder = [];
    g.verdicts = {};
    g.submissions = {}; // teamId -> submitted answer string
    Object.keys(g.teams).forEach(tid => g.verdicts[tid] = null);
    io.to(code).emit('game-update', getPublicGame(code));
  });

  // ── STUDENT: SUBMIT ANSWER ──
  socket.on('submit-answer', ({ code, answer }) => {
    const g = games[code];
    if (!g || !g.activeClue) return;
    const player = g.players[socket.id];
    if (!player) return;
    const { teamId } = player;
    g.submissions[teamId] = answer.trim();
    // Notify teacher only
    if (g.teacherSocketId) {
      io.to(g.teacherSocketId).emit('submission-update', {
        submissions: g.submissions,
        teamNames: Object.fromEntries(Object.entries(g.teams).map(([tid, t]) => [tid, t.name]))
      });
    }
  });

  // ── STUDENT: SUBMIT WAGER ──
  socket.on('submit-wager', ({ code, wager }) => {
    const g = games[code];
    if (!g || g.phase !== 'final-wager') return;
    const player = g.players[socket.id];
    if (!player) return;
    const { teamId } = player;
    const maxWager = g.teams[teamId]?.score || 0;
    g.wagers[teamId] = Math.min(Math.max(0, parseInt(wager) || 0), maxWager);
    if (g.teacherSocketId) {
      io.to(g.teacherSocketId).emit('wager-update', {
        wagers: g.wagers,
        teamNames: Object.fromEntries(Object.entries(g.teams).map(([tid, t]) => [tid, t.name]))
      });
    }
  });

  // ── STUDENT: SUBMIT FINAL ANSWER ──
  socket.on('submit-final-answer', ({ code, answer }) => {
    const g = games[code];
    if (!g || g.phase !== 'final-answer') return;
    const player = g.players[socket.id];
    if (!player) return;
    const { teamId } = player;
    g.finalSubmissions[teamId] = answer.trim();
    if (g.teacherSocketId) {
      io.to(g.teacherSocketId).emit('final-submission-update', {
        finalSubmissions: g.finalSubmissions,
        teamNames: Object.fromEntries(Object.entries(g.teams).map(([tid, t]) => [tid, t.name]))
      });
    }
  });

  // ── STUDENT: BUZZ IN ──
  socket.on('buzz-in', ({ code }) => {
    const g = games[code];
    if (!g || !g.activeClue) return;
    const player = g.players[socket.id];
    if (!player) return;
    if (g.buzzOrder.includes(socket.id)) return; // already buzzed
    g.buzzOrder.push(socket.id);
    io.to(code).emit('buzz-update', {
      buzzOrder: g.buzzOrder,
      playerNames: g.buzzOrder.map(id => ({
        id,
        name: g.players[id]?.name,
        team: g.teams[g.players[id]?.teamId]?.name
      }))
    });
  });

  // ── TEACHER: REVEAL ANSWER ──
  socket.on('reveal-answer', ({ code }) => {
    const g = games[code];
    if (!g || g.teacherSocketId !== socket.id) return;
    const isNormalClue = g.activeClue && g.phase === 'playing';
    const isFinal = g.phase === 'final-answer';
    if (!isNormalClue && !isFinal) return;

    if (isNormalClue) {
      const { col, row } = g.activeClue;
      io.to(code).emit('answer-revealed', {
        answer: g.clues[col][row].a,
        submissions: g.submissions || {},
        game: getPublicGame(code)
      });
    } else {
      io.to(code).emit('answer-revealed', {
        answer: g.finalJeopardy.answer,
        submissions: g.finalSubmissions || {},
        game: getPublicGame(code)
      });
    }
  });

  // ── TEACHER: SET VERDICT ──
  socket.on('set-verdict', ({ code, teamId, verdict }) => {
    const g = games[code];
    if (!g || g.teacherSocketId !== socket.id) return;
    g.verdicts[teamId] = verdict; // 'correct' | 'wrong' | null
    io.to(code).emit('verdicts-update', { verdicts: g.verdicts });
  });

  // ── TEACHER: APPLY VERDICTS ──
  socket.on('apply-verdicts', ({ code }) => {
    const g = games[code];
    if (!g || g.teacherSocketId !== socket.id) return;
    const isFinal = g.phase === 'final-answer';
    if (!isFinal && !g.activeClue) return;

    const results = [];

    if (isFinal) {
      // Final Jeopardy — use wagers
      Object.entries(g.verdicts).forEach(([teamId, verdict]) => {
        if (!g.teams[teamId]) return;
        const wager = g.wagers?.[teamId] || 0;
        if (verdict === 'correct') {
          g.teams[teamId].score += wager;
          results.push({ team: g.teams[teamId].name, delta: wager });
        } else if (verdict === 'wrong') {
          g.teams[teamId].score = Math.max(0, g.teams[teamId].score - wager);
          results.push({ team: g.teams[teamId].name, delta: -wager });
        }
      });
      g.phase = 'ended';
      g.verdicts = {};
    } else {
      // Normal clue — use point value
      const pts = VALUES[g.activeClue.row];
      Object.entries(g.verdicts).forEach(([teamId, verdict]) => {
        if (!g.teams[teamId]) return;
        if (verdict === 'correct') {
          g.teams[teamId].score += pts;
          results.push({ team: g.teams[teamId].name, delta: pts });
        } else if (verdict === 'wrong') {
          g.teams[teamId].score = Math.max(0, g.teams[teamId].score - pts);
          results.push({ team: g.teams[teamId].name, delta: -pts });
        }
      });
      g.board[g.activeClue.col][g.activeClue.row] = true;
      g.activeClue = null;
      g.buzzOrder = [];
      g.submissions = {};
      g.verdicts = {};
    }

    io.to(code).emit('points-applied', { results, game: getPublicGame(code) });
  });

  // ── TEACHER: OPEN FINAL JEOPARDY ──
  socket.on('open-final', ({ code }) => {
    const g = games[code];
    if (!g || g.teacherSocketId !== socket.id) return;
    g.phase = 'final-wager';
    g.wagers = {};
    g.finalSubmissions = {};
    g.verdicts = {};
    Object.keys(g.teams).forEach(tid => g.verdicts[tid] = null);
    io.to(code).emit('game-update', getPublicGame(code));
  });

  // ── TEACHER: ADVANCE FINAL (wager → answer phase) ──
  socket.on('advance-final', ({ code }) => {
    const g = games[code];
    if (!g || g.teacherSocketId !== socket.id) return;
    g.phase = 'final-answer';
    io.to(code).emit('game-update', getPublicGame(code));
    // Send clue to everyone
    io.to(code).emit('final-clue-revealed', {
      clue: g.finalJeopardy.clue,
      category: g.finalJeopardy.category
    });
  });

  // ── TEACHER: MANUAL SCORE ADJUST ──
  socket.on('adjust-score', ({ code, teamId, delta }) => {
    const g = games[code];
    if (!g || g.teacherSocketId !== socket.id) return;
    if (!g.teams[teamId]) return;
    g.teams[teamId].score = Math.max(0, g.teams[teamId].score + delta);
    io.to(code).emit('game-update', getPublicGame(code));
  });

  // ── DISCONNECT ──
  socket.on('disconnect', () => {
    console.log(`[disconnect] ${socket.id}`);
    // Clean up player from all games
    Object.values(games).forEach(g => {
      if (g.players[socket.id]) {
        const { teamId } = g.players[socket.id];
        if (g.teams[teamId]) {
          g.teams[teamId].members = g.teams[teamId].members.filter(id => id !== socket.id);
          // Remove team if empty and game is in lobby
          if (g.teams[teamId].members.length === 0 && g.phase === 'lobby') {
            delete g.teams[teamId];
          }
        }
        delete g.players[socket.id];
        io.to(g.code).emit('game-update', getPublicGame(g.code));
      }
    });
  });
});

// ── CLEANUP stale games (older than 4 hours) ──
setInterval(() => {
  const now = Date.now();
  Object.keys(games).forEach(code => {
    if (now - games[code].createdAt > 4 * 60 * 60 * 1000) {
      delete games[code];
      console.log(`[cleanup] removed stale game ${code}`);
    }
  });
}, 30 * 60 * 1000);

// ── START ──
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Jeopardy server running on port ${PORT}`);
});