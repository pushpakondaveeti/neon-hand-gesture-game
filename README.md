# AeroGlow // Neon Finger-Tracking Arcade

A premium, high-performance, browser-based arcade game where you steer a neon spaceship by pointing your index finger at the webcam. Tracked using **MediaPipe Tasks Vision** and featuring dynamic retro audio synthesized directly in the browser with the **Web Audio API**.

---

## 🚀 How to Run Locally

Because the browser blocks webcam access (`getUserMedia`) and ES module imports (`import`/`export`) on standard file URLs (`file://`), **you must run the game using a local web server**.

### Option A: Using NPM / NPX (Recommended)
If you have Node.js installed, open a terminal in the project directory and run:
```bash
npx http-server -p 8080
```
Then open [http://localhost:8080](http://localhost:8080) in Chrome, Edge, or Safari.

### Option B: Using Python
If you have Python installed, run this command in your terminal:
```bash
python3 -m http.server 8080
```
Then open [http://localhost:8080](http://localhost:8080) in your browser.

---

## 🎮 How to Play

1. **Initial Calibration:**
   - Choose **Webcam Tracker** on the boot screen.
   - Allow camera access.
   - Position yourself 2–4 feet from the webcam in a reasonably lit room.
   - Point your **index finger** straight up.
2. **Move:**
   - Move your index finger left, right, up, and down. The glowing blue core follows your finger.
   - We mirror the feed naturally, so moving your hand right moves the avatar right.
3. **Objective:**
   - Collect **golden spinning stars** (150 points each).
   - Steer clear of **neon pink obstacles** (Asteroids, Beams, Diamonds).
   - You have **3 lives** (indicated by glowing green dots in the HUD).
4. **Magnetic Stars:**
   - Stars are magnetic! Getting near one drags it toward you.
5. **Autopause Safeguard:**
   - If the AI model loses track of your hand, the game automatically pauses and displays **"TRACKING INTERRUPTED"**. Raising your finger again resumes play instantly.
6. **Mute Audio:**
   - Tap the speaker icon in the top right to toggle the retro sound effects.
7. **Control Fallback:**
   - If you don't have a webcam or choose "Mouse / Touch", click and drag on the canvas to play.

---

## 🛠️ Customization & Tuning

Open `app.js` and modify the following constants to adjust performance, speed, and responsiveness:

### 1. Hand Tracking & Jitter
- **`LERP_FACTOR`** (Line 15): Defaults to `0.16`.
  - Reduce this (e.g., `0.08`) for more dampening/smoothing if the camera feed is noisy or shaky.
  - Increase this (e.g., `0.25`) for twitchier, faster, and more direct response.
- **`HAND_LOST_THRESHOLD`** (Line 16): Defaults to `300` (ms).
  - The duration of tracking dropout allowed before pausing the game. Increase it if the game pauses too easily on rapid movement.

### 2. Elastic Coordinate Bounds (Calibration)
- Inside the `InputManager` constructor (Lines 227-230):
  ```javascript
  this.calibMinX = 0.22; // Left side boundary
  this.calibMaxX = 0.78; // Right side boundary
  this.calibMinY = 0.25; // Top side boundary
  this.calibMaxY = 0.75; // Bottom side boundary
  ```
  Adjust these bounds to make the control area smaller or larger. A smaller bounding box (e.g., `0.3` to `0.7`) means you have to move your hand less to reach the corners of the canvas.

### 3. Spawning & Difficulty Scaling
- **`this.baseObstacleCount`** (Line 383):
  - Change the starting number of obstacles.
- **`speedMultiplier`** (Line 522):
  - Change the rate at which obstacles accelerate as levels progress:
    ```javascript
    const speedMultiplier = 1.0 + (this.level - 1) * 0.15;
    ```
- **`targetObstacleCount`** (Line 523):
  - Change how many additional obstacles spawn per level:
    ```javascript
    const targetObstacleCount = this.baseObstacleCount + (this.level - 1) * 2;
    ```

---

## 📂 Project Structure

```
├── index.html   # HTML UI overlays, video mirror container, and main HUD
├── style.css    # Cyberpunk design variables, glassmorphic layout, and transitions
├── app.js       # Main controller: webcam, MediaPipe solver, Web Audio synth, physics, loops
└── README.md    # Guide and customization instructions
```
