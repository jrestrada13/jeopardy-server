# Jeopardy Game Server — Deployment Guide

## What This Is
The real-time backend for your multiplayer Jeopardy game.
Handles join codes, game state, buzz-ins, and live score sync between teacher and student devices.

---

## Step 1 — Push to GitHub

### First time setup
```bash
# In your terminal, navigate to this folder
cd jeopardy-server

# Initialize git
git init

# Add all files
git add .

# First commit
git commit -m "Initial jeopardy server"

# Create a new repo on GitHub (github.com → New repository → name it "jeopardy-server")
# Then connect and push:
git remote add origin https://github.com/YOUR_USERNAME/jeopardy-server.git
git branch -M main
git push -u origin main
```

### Future updates
```bash
git add .
git commit -m "describe your change"
git push
```

---

## Step 2 — Deploy to Render (Free)

1. Go to **https://render.com** and sign up (free, no credit card)
2. Click **New → Web Service**
3. Connect your GitHub account and select **jeopardy-server**
4. Fill in the settings:
   - **Name:** `jeopardy-server` (or whatever you want)
   - **Region:** US East (closest to Texas)
   - **Branch:** `main`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free`
5. Click **Create Web Service**
6. Wait ~2 minutes for the first deploy
7. Render gives you a URL like: `https://jeopardy-server-xxxx.onrender.com`
   **Copy this URL — you'll need it in Step 3**

---

## Step 3 — Set Environment Variable on Render

After deploy, go to your Render service → **Environment** tab → Add:

| Key | Value |
|-----|-------|
| `FRONTEND_URL` | Your Netlify URL (e.g. `https://your-jeopardy.netlify.app`) |

Then click **Save Changes** — Render will redeploy automatically.

> ⚠️ **Note:** Render free tier spins down after 15 minutes of inactivity.
> The first request after sleep takes ~30 seconds to wake up.
> Just open the teacher view a minute before class and it'll be awake and ready.

---

## Step 4 — Verify It's Running

Open your Render URL in a browser. You should see:
```json
{ "status": "Jeopardy server running", "games": 0 }
```

If you see that — the server is live. ✅

---

## How the Server Works (Quick Reference)

### Join Codes
- Teacher creates a game → server generates a 4-digit code
- Students enter the code at your Netlify URL
- Code is unique and expires after 4 hours

### Game Modes
- **Team mode:** Students enter a shared team name — multiple students share one team score
- **Individual mode:** Each student is their own player/team

### Events (for reference when building the frontend)
| Event | Direction | Description |
|-------|-----------|-------------|
| `create-game` | Teacher → Server | Start a new game session |
| `join-game` | Student → Server | Join with code + name |
| `start-game` | Teacher → Server | Move from lobby to playing |
| `open-clue` | Teacher → Server | Open a board clue |
| `buzz-in` | Student → Server | Student buzzes in |
| `reveal-answer` | Teacher → Server | Show the answer |
| `set-verdict` | Teacher → Server | Mark a team correct/wrong |
| `apply-verdicts` | Teacher → Server | Apply all points and close clue |
| `adjust-score` | Teacher → Server | Manual score change |
| `open-final` | Teacher → Server | Start Final Jeopardy |
| `game-update` | Server → All | Full game state sync |
| `buzz-update` | Server → All | Live buzz order |
| `answer-revealed` | Server → All | Answer text |
| `verdicts-update` | Server → All | Live verdict status |
| `points-applied` | Server → All | Score results after apply |

---

## Troubleshooting

**Server won't start on Render**
- Check Build Command is `npm install` and Start Command is `npm start`
- Check the Render logs tab for errors

**Students can't connect**
- Make sure `FRONTEND_URL` env variable is set correctly (no trailing slash)
- Make sure the student is using the exact Netlify URL

**Game not found error**
- Codes expire after 4 hours — teacher needs to create a new game
- Render may have restarted (free tier) — create a new game

---

## Next Step
Once this is deployed and you have your Render URL, come back and we'll build the Netlify frontend — teacher board + student view — and connect them to this server.
