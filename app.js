/**
 * AeroGlow // app.js
 * Core game script. Modules are structured cleanly to handle:
 * 1. Sound Synthesis (Web Audio)
 * 2. Camera & WebRTC Feed
 * 3. MediaPipe Hand Landmark Tracking
 * 4. Coordinate Smoothing & Calibration
 * 5. Particle Systems & Entity Physics
 * 6. High-Performance Canvas Rendering
 * 7. Game Loop & UI State Machine
 */

import { FilesetResolver, HandLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/vision_bundle.mjs";

// --- GAME CONSTANTS ---
const GAME_WIDTH = 1000;
const GAME_HEIGHT = 700;
const LERP_FACTOR = 0.16; // Adjust between 0.05 (very smooth/laggy) and 0.4 (fast/twitchy)
const HAND_LOST_THRESHOLD = 300; // Milliseconds of no hand before pausing
const FPS_FILTER_STRENGTH = 20;

// Game States
const STATE_LOADING = 'loading';
const STATE_START = 'start';
const STATE_PLAYING = 'playing';
const STATE_PAUSED_HAND_LOST = 'paused_lost';
const STATE_GAME_OVER = 'game_over';
const STATE_CAM_ERROR = 'cam_error';

// --- MODULE 1: SOUND SYNTHESIS (WEB AUDIO) ---
class SoundEffectsManager {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
  }

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    const btn = document.getElementById('mute-btn');
    const icon = document.getElementById('volume-icon');
    
    if (this.isMuted) {
      btn.classList.add('muted');
      icon.innerHTML = '<path fill="currentColor" d="M3.27,3L2,4.27L8.28,10.55L7,11.82H3V17.82H7L12,22.82V14.27L17.73,20C16.89,20.5 16,20.88 15,21.1V23.18C16.55,22.88 18,22.13 19.18,21.09L20.73,22.64L22,21.37L3.27,3M12,4.82L9.91,6.91L12,9V4.82M16.5,12.82C16.5,11.05 15.5,9.53 14,8.79V10.27L16.43,12.7C16.48,12.74 16.5,12.78 16.5,12.82M19,12.82C19,14.07 18.66,15.24 18.09,16.27L19.58,17.76C20.47,16.32 21,14.63 21,12.82C21,8.54 18,4.96 14,4.05V6.11C16.89,6.97 19,9.65 19,12.82Z"/>';
    } else {
      btn.classList.remove('muted');
      icon.innerHTML = '<path fill="currentColor" d="M14,3.23V5.29C16.89,6.15 19,8.83 19,12C19,15.17 16.89,17.85 14,18.71V20.77C18,19.86 21,16.28 21,12C21,7.72 18,4.14 14,3.23M16.5,12C16.5,10.23 15.5,8.71 14,7.97V16C15.5,15.29 16.5,13.77 16.5,12M3,9V15H7L12,20V4L7,9H3Z"/>';
      this.init();
      // Play a short indicator chime
      this.playCoin();
    }
  }

  playCoin() {
    if (this.isMuted) return;
    this.init();
    const now = this.ctx.currentTime;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'triangle';
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    // Quick rising retro coin sound (C5 then G5)
    osc.frequency.setValueAtTime(523.25, now);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
    
    osc.frequency.setValueAtTime(783.99, now + 0.08);
    gain.gain.setValueAtTime(0.12, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
    
    osc.start(now);
    osc.stop(now + 0.22);
  }

  playHit() {
    if (this.isMuted) return;
    this.init();
    const now = this.ctx.currentTime;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    // Fast frequency pitch dive (explosive crunch)
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.25);
    
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
    
    osc.start(now);
    osc.stop(now + 0.25);
  }

  playLevelUp() {
    if (this.isMuted) return;
    this.init();
    const now = this.ctx.currentTime;
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50]; // Ascending C Major scale arpeggio
    const duration = 0.06;
    
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      const noteTime = now + (i * duration);
      gain.gain.setValueAtTime(0.08, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.01, noteTime + 0.12);
      
      osc.start(noteTime);
      osc.stop(noteTime + 0.12);
    });
  }

  playGameOver() {
    if (this.isMuted) return;
    this.init();
    const now = this.ctx.currentTime;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    // Slow downward pitch slide
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.linearRampToValueAtTime(30, now + 0.6);
    
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.6);
    
    osc.start(now);
    osc.stop(now + 0.6);
  }

  playSystemStart() {
    if (this.isMuted) return;
    this.init();
    const now = this.ctx.currentTime;
    
    // Retro synth sweeping chord
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    const gain2 = this.ctx.createGain();
    
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(293.66, now); // D4
    osc1.frequency.exponentialRampToValueAtTime(587.33, now + 0.5); // D5
    
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(370.01, now + 0.15); // F#4
    osc2.frequency.exponentialRampToValueAtTime(740.02, now + 0.55); // F#5
    
    osc1.connect(gain1);
    osc2.connect(gain2);
    gain1.connect(this.ctx.destination);
    gain2.connect(this.ctx.destination);
    
    gain1.gain.setValueAtTime(0.12, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
    
    gain2.gain.setValueAtTime(0.12, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.55);
    
    osc1.start(now);
    osc1.stop(now + 0.5);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.55);
  }
}

// --- MODULE 2: CAMERA MANAGEMENT ---
class CameraHelper {
  constructor(videoElement) {
    this.video = videoElement;
    this.stream = null;
    this.isReady = false;
  }

  async start() {
    if (this.stream) return true;
    
    const constraints = {
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: "user" // Selfie camera
      },
      audio: false
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.video.srcObject = this.stream;
      this.isReady = true;
      
      // Await video play to ensure stream has actively started
      await this.video.play();
      return true;
    } catch (err) {
      console.warn("Webcam access denied or unavailable:", err);
      this.isReady = false;
      throw err;
    }
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.video.srcObject = null;
    this.isReady = false;
  }
}

// --- MODULE 3: HAND TRACKER (MEDIAPIPE TASKS VISION) ---
class HandTracker {
  constructor(videoElement, landmarkCanvasElement) {
    this.video = videoElement;
    this.canvas = landmarkCanvasElement;
    this.ctx = this.canvas.getContext('2d');
    this.landmarker = null;
    this.isLoading = false;
    
    // Latest tracking coordinates normalized [0..1]
    this.latestX = 0.5;
    this.latestY = 0.5;
    this.handDetected = false;
    this.lastDetectedTime = -1; // Ensure 0 is recognized as new frame
    this.handLostTimer = 0; // ms tracker for buffer
    
    // Diagnostics properties
    this.accelerationMode = 'OFFLINE';
    this.inferenceTime = 0;
  }

  async loadModel(onProgress) {
    if (this.landmarker) return;
    this.isLoading = true;
    
    try {
      onProgress("Downloading WebAssembly fileset...");
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm"
      );
      
      onProgress("Assembling Landmarker AI model...");
      
      try {
        // Try GPU delegation first for hardware acceleration
        this.landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 1,
          minHandDetectionConfidence: 0.35,
          minHandPresenceConfidence: 0.35,
          minTrackingConfidence: 0.35
        });
        this.accelerationMode = 'GPU (WebGL)';
        console.log("MediaPipe initialized with GPU acceleration.");
      } catch (gpuError) {
        console.warn("GPU delegation failed, falling back to CPU execution:", gpuError);
        onProgress("Optimizing model for CPU fallback...");
        
        // Fall back to CPU delegation
        this.landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "CPU"
          },
          runningMode: "VIDEO",
          numHands: 1,
          minHandDetectionConfidence: 0.35,
          minHandPresenceConfidence: 0.35,
          minTrackingConfidence: 0.35
        });
        this.accelerationMode = 'CPU (Fallback)';
        console.log("MediaPipe initialized with CPU fallback.");
      }
      
      this.isLoading = false;
    } catch (error) {
      this.isLoading = false;
      this.accelerationMode = 'LOAD FAILED';
      console.error("Failed to load MediaPipe model:", error);
      throw error;
    }
  }

  detectFrame(timestamp, deltaTime) {
    if (!this.landmarker || this.video.readyState < 2) return;
    
    // Only detect if video has progressed to a new frame
    if (this.video.currentTime !== this.lastDetectedTime) {
      this.lastDetectedTime = this.video.currentTime;
      
      const t0 = performance.now();
      // Perform tracking
      const results = this.landmarker.detectForVideo(this.video, timestamp);
      this.inferenceTime = Math.round(performance.now() - t0);
      
      this.processResults(results, deltaTime);
    }
  }

  processResults(results, deltaTime) {
    const previewContainer = document.getElementById('video-preview-container');
    
    if (results.landmarks && results.landmarks.length > 0) {
      this.handDetected = true;
      this.handLostTimer = 0;
      
      previewContainer.className = 'glass-panel hand-detected';
      
      // Landmark 8 is INDEX_FINGER_TIP
      const indexTip = results.landmarks[0][8];
      this.latestX = indexTip.x;
      this.latestY = indexTip.y;
      
      this.drawLandmarks(results.landmarks[0]);
    } else {
      this.handLostTimer += deltaTime;
      if (this.handLostTimer >= HAND_LOST_THRESHOLD) {
        this.handDetected = false;
        previewContainer.className = 'glass-panel hand-lost';
      }
      this.clearOverlay();
    }
  }

  clearOverlay() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  drawLandmarks(landmarks) {
    this.clearOverlay();
    
    // Align coordinates
    if (this.canvas.width !== this.video.clientWidth || this.canvas.height !== this.video.clientHeight) {
      this.canvas.width = this.video.clientWidth;
      this.canvas.height = this.video.clientHeight;
    }

    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Draw skeleton joints (simple connectors for retro UI vibe)
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    // Connect index finger (landmarks 5 -> 6 -> 7 -> 8)
    for (let i = 5; i < 8; i++) {
      ctx.moveTo(landmarks[i].x * w, landmarks[i].y * h);
      ctx.lineTo(landmarks[i+1].x * w, landmarks[i+1].y * h);
    }
    ctx.stroke();

    // Draw fingertip highlight
    const tip = landmarks[8];
    ctx.fillStyle = '#ff007f';
    ctx.shadowColor = '#ff007f';
    ctx.shadowBlur = 10;
    
    ctx.beginPath();
    ctx.arc(tip.x * w, tip.y * h, 6, 0, Math.PI * 2);
    ctx.fill();
    
    // Reset shadow
    ctx.shadowBlur = 0;
  }
}

// --- MODULE 4: INPUT & COORDINATE SMOOTHING ---
class InputManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.mode = 'camera'; // 'camera' or 'mouse'
    
    // Target coordinate (where player wants to go)
    this.targetX = GAME_WIDTH / 2;
    this.targetY = GAME_HEIGHT / 2;
    
    // Calibration bounds (comfort zone: maps central camera region to full canvas size)
    this.calibMinX = 0.22;
    this.calibMaxX = 0.78;
    this.calibMinY = 0.25;
    this.calibMaxY = 0.75;

    this.setupMouseEvents();
  }

  setMode(mode) {
    this.mode = mode;
    const statusText = document.getElementById('input-status');
    if (mode === 'camera') {
      statusText.textContent = "CAMERA: ACTIVE";
      statusText.style.color = "var(--neon-green)";
    } else {
      statusText.textContent = "MOUSE/TOUCH ACTIVE";
      statusText.style.color = "var(--neon-gold)";
    }
  }

  updateCameraCoords(rawX, rawY) {
    if (this.mode !== 'camera') return;
    
    // Mirroring: Since camera is mirrored, flip X-axis
    const mirroredX = 1.0 - rawX;
    
    // Stretches central bounding box coordinates to cover entire canvas edges
    const scaledX = (mirroredX - this.calibMinX) / (this.calibMaxX - this.calibMinX);
    const scaledY = (rawY - this.calibMinY) / (this.calibMaxY - this.calibMinY);
    
    // Clamp to canvas margins [0..1]
    const clampedX = Math.max(0, Math.min(1, scaledX));
    const clampedY = Math.max(0, Math.min(1, scaledY));
    
    // Assign targets
    this.targetX = clampedX * GAME_WIDTH;
    this.targetY = clampedY * GAME_HEIGHT;
  }

  setupMouseEvents() {
    const handleMove = (e) => {
      if (this.mode !== 'mouse') return;
      
      const rect = this.canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      
      // Calculate position relative to viewport layout
      const relativeX = (clientX - rect.left) / rect.width;
      const relativeY = (clientY - rect.top) / rect.height;
      
      this.targetX = relativeX * GAME_WIDTH;
      this.targetY = relativeY * GAME_HEIGHT;
    };

    // Standard event listeners
    this.canvas.addEventListener('mousemove', handleMove);
    this.canvas.addEventListener('touchmove', handleMove, { passive: true });
    this.canvas.addEventListener('mousedown', (e) => {
      if (this.mode === 'mouse') handleMove(e);
    });
    this.canvas.addEventListener('touchstart', (e) => {
      if (this.mode === 'mouse') handleMove(e);
    }, { passive: true });
  }
}

// --- MODULE 5: GAME ENTITIES & PARTICLE PHYSICS ---
class Player {
  constructor() {
    this.x = GAME_WIDTH / 2;
    this.y = GAME_HEIGHT / 2;
    this.radius = 16;
    this.color = '#00f3ff';
    this.glowSize = 25;
    this.shieldTime = 0; // Invincibility time after hit (ms)
  }

  update(targetX, targetY, deltaTime) {
    // Smoothed movement using Lerp (Linear Interpolation) to filter high-frequency noise
    this.x += (targetX - this.x) * LERP_FACTOR;
    this.y += (targetY - this.y) * LERP_FACTOR;

    if (this.shieldTime > 0) {
      this.shieldTime -= deltaTime;
    }
  }

  draw(ctx) {
    ctx.save();
    
    const isInvincible = this.shieldTime > 0;
    const opacity = isInvincible ? (Math.floor(Date.now() / 80) % 2 ? 0.3 : 0.9) : 1;
    
    // Draw outer neon pulse ring
    ctx.strokeStyle = `rgba(0, 243, 255, ${0.4 * opacity})`;
    ctx.lineWidth = 3;
    ctx.shadowBlur = this.glowSize;
    ctx.shadowColor = '#00f3ff';
    
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius + 6 + Math.sin(Date.now() / 150) * 3, 0, Math.PI * 2);
    ctx.stroke();

    // Draw inner solid white/cyan core
    ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#00f3ff';
    
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius - 2, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
  }
}

class Coin {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = Math.random() * (GAME_WIDTH - 80) + 40;
    this.y = Math.random() * (GAME_HEIGHT - 80) + 40;
    this.radius = 10;
    this.color = '#ffd700'; // Neon Gold
    this.spin = Math.random() * Math.PI;
    this.pulseFactor = Math.random() * 100;
  }

  update(player, deltaTime) {
    this.spin += 0.04;
    this.pulseFactor += 0.05;
    
    // Magnetism: pull towards player if close
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const distance = Math.hypot(dx, dy);
    
    if (distance < 150) {
      // Accelerates speed as distance reduces
      const pullForce = (150 - distance) * 0.12;
      this.x += (dx / distance) * pullForce;
      this.y += (dy / distance) * pullForce;
    }
  }

  draw(ctx) {
    ctx.save();
    
    const sizeOffset = Math.sin(this.pulseFactor) * 2;
    const rad = this.radius + sizeOffset;
    
    ctx.translate(this.x, this.y);
    ctx.rotate(this.spin);
    
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#ffd700';
    ctx.fillStyle = '#ffd700';
    
    // Draw 4-point star shape
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      ctx.lineTo(0, -rad);
      ctx.rotate(Math.PI / 4);
      ctx.lineTo(0, -rad * 0.4);
      ctx.rotate(Math.PI / 4);
    }
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}

class Obstacle {
  constructor(speedMultiplier = 1.0) {
    this.reset(speedMultiplier);
  }

  reset(speedMultiplier = 1.0) {
    this.radius = Math.random() * 16 + 12; // Radius 12..28
    
    // Determine screen entry side (0: top, 1: right, 2: left)
    const side = Math.floor(Math.random() * 3);
    
    if (side === 0) { // Enters from top
      this.x = Math.random() * GAME_WIDTH;
      this.y = -this.radius - 10;
      this.vx = (Math.random() - 0.5) * 3;
      this.vy = (Math.random() * 2 + 2) * speedMultiplier;
    } else if (side === 1) { // Enters from right
      this.x = GAME_WIDTH + this.radius + 10;
      this.y = Math.random() * (GAME_HEIGHT * 0.8);
      this.vx = -(Math.random() * 3 + 250) * 0.01 * speedMultiplier;
      this.vy = (Math.random() - 0.2) * 2;
    } else { // Enters from left
      this.x = -this.radius - 10;
      this.y = Math.random() * (GAME_HEIGHT * 0.8);
      this.vx = (Math.random() * 3 + 2) * speedMultiplier;
      this.vy = (Math.random() - 0.2) * 2;
    }

    this.color = '#ff007f'; // Neon Pink
    this.rotation = Math.random() * Math.PI;
    this.rotSpeed = (Math.random() - 0.5) * 0.05;
    
    // Visual type variation: triangle vs hexagon vs rotating rectangle
    this.shapeType = Math.floor(Math.random() * 3);
  }

  update(deltaTime) {
    // Standard linear movement
    this.x += this.vx;
    this.y += this.vy;
    this.rotation += this.rotSpeed;
  }

  isOffscreen() {
    return (
      this.x < -this.radius - 20 ||
      this.x > GAME_WIDTH + this.radius + 20 ||
      this.y > GAME_HEIGHT + this.radius + 20
    );
  }

  draw(ctx) {
    ctx.save();
    
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#ff007f';
    ctx.strokeStyle = '#ff007f';
    ctx.fillStyle = 'rgba(255, 0, 127, 0.15)';
    ctx.lineWidth = 3;

    ctx.beginPath();
    
    if (this.shapeType === 0) {
      // Triangle
      ctx.moveTo(0, -this.radius);
      ctx.lineTo(this.radius * 0.86, this.radius * 0.5);
      ctx.lineTo(-this.radius * 0.86, this.radius * 0.5);
    } else if (this.shapeType === 1) {
      // Pentagon
      for (let i = 0; i < 5; i++) {
        const angle = (i * 2 * Math.PI) / 5;
        ctx.lineTo(Math.cos(angle) * this.radius, Math.sin(angle) * this.radius);
      }
    } else {
      // Rotating diamond
      ctx.moveTo(0, -this.radius);
      ctx.lineTo(this.radius * 0.6, 0);
      ctx.lineTo(0, this.radius);
      ctx.lineTo(-this.radius * 0.6, 0);
    }

    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }
}

class Particle {
  constructor() {
    this.active = false;
  }

  spawn(x, y, color, speedScale = 1.0) {
    this.x = x;
    this.y = y;
    this.color = color;
    
    const angle = Math.random() * Math.PI * 2;
    const speed = (Math.random() * 4 + 2) * speedScale;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    
    this.size = Math.random() * 4 + 2;
    this.alpha = 1.0;
    this.decay = Math.random() * 0.03 + 0.02;
    this.active = true;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.alpha -= this.decay;
    if (this.alpha <= 0) {
      this.active = false;
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.shadowBlur = 8;
    ctx.shadowColor = this.color;
    ctx.fillStyle = this.color;
    
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// --- MODULE 6: RENDERER & GAME LOOP ENGINE ---
class GameEngine {
  constructor() {
    // Connect elements
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.video = document.getElementById('webcam-video');
    this.landmarkCanvas = document.getElementById('landmark-canvas');
    
    // Sub-systems
    this.sounds = new SoundEffectsManager();
    this.camera = new CameraHelper(this.video);
    this.tracker = new HandTracker(this.video, this.landmarkCanvas);
    this.input = new InputManager(this.canvas);
    
    // Global error listener for diagnostics HUD
    window.onerror = (message, source, lineno, colno, error) => {
      const errBox = document.getElementById('diag-errors');
      if (errBox) {
        // Strip long error messages for readability
        const cleanMsg = String(message).split('ReferenceError:').pop().split('TypeError:').pop();
        errBox.textContent = `${cleanMsg.substring(0, 30)} (${lineno}:${colno})`;
      }
      return false;
    };

    // Setup responsive rendering parameters
    this.setupCanvasResizing();
    
    // Core game state
    this.state = STATE_LOADING;
    this.score = 0;
    this.lives = 3;
    this.level = 1;
    this.highScore = parseInt(localStorage.getItem('aeroglow_highscore') || '0');
    this.waitingForInitialHand = false;
    
    // Dynamic lists & object pools (to prevent Garbage Collector spikes)
    this.player = new Player();
    this.coins = [new Coin(), new Coin(), new Coin()];
    this.obstacles = [];
    this.particles = Array.from({ length: 150 }, () => new Particle());
    
    // Level settings
    this.baseObstacleCount = 4;
    this.obstacleSpawnTimer = 0;
    this.levelUpTextTimer = 0; // Fades out a text display on canvas
    
    // Timers
    this.lastTime = 0;
    this.fps = 60;
    
    // Bind UI actions
    this.bindUI();
    
    // Auto start booting
    this.initSystems();
  }

  setupCanvasResizing() {
    const resize = () => {
      const rect = this.canvas.parentNode.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      
      // Virtual size remains GAME_WIDTH x GAME_HEIGHT
      // Physical resolution matches size scaled by DPR (super-sharp pixel art)
      this.canvas.width = rect.width * dpr;
      this.canvas.height = rect.height * dpr;
      this.ctx.scale(this.canvas.width / GAME_WIDTH, this.canvas.height / GAME_HEIGHT);
    };

    window.addEventListener('resize', resize);
    // Execute resize on next frame context
    setTimeout(resize, 100);
  }

  async initSystems() {
    try {
      this.setState(STATE_LOADING);
      
      // Load Hand landmarker network
      await this.tracker.loadModel((statusMsg) => {
        document.getElementById('loading-status').textContent = statusMsg;
      });
      
      this.setState(STATE_START);
      this.sounds.playSystemStart();
    } catch (e) {
      console.error(e);
      document.getElementById('loading-status').innerHTML = 
        `<span style="color: var(--neon-magenta)">WASM/Model Load Error.</span><br>Check internet access and console.`;
    }
  }

  bindUI() {
    // Mode toggles
    document.getElementById('mode-cam-btn').onclick = () => {
      document.getElementById('mode-cam-btn').classList.add('active');
      document.getElementById('mode-mouse-btn').classList.remove('active');
      document.getElementById('cam-instructions').style.display = 'block';
      this.input.setMode('camera');
    };

    document.getElementById('mode-mouse-btn').onclick = () => {
      document.getElementById('mode-mouse-btn').classList.add('active');
      document.getElementById('mode-cam-btn').classList.remove('active');
      document.getElementById('cam-instructions').style.display = 'none';
      this.input.setMode('mouse');
    };

    // Mute button
    document.getElementById('mute-btn').onclick = () => {
      this.sounds.toggleMute();
    };

    // Play Game button
    document.getElementById('play-btn').onclick = async () => {
      if (this.input.mode === 'camera') {
        document.getElementById('loading-status').textContent = "Accessing webcam feed...";
        this.setState(STATE_LOADING);
        
        try {
          await this.camera.start();
          this.setState(STATE_PLAYING);
          this.resetGame();
        } catch (error) {
          console.warn("Camera failed. Switched to error screen:", error);
          const errorMsg = error ? `${error.name}: ${error.message}` : "Device resource busy or blocked.";
          document.getElementById('cam-error-message').textContent = errorMsg;
          this.setState(STATE_CAM_ERROR);
        }
      } else {
        // Mouse Mode
        this.setState(STATE_PLAYING);
        this.resetGame();
      }
    };

    // Camera Error Screen: Retry Camera
    document.getElementById('cam-error-retry-btn').onclick = async () => {
      document.getElementById('loading-status').textContent = "Retrying webcam access...";
      this.setState(STATE_LOADING);
      try {
        await this.camera.start();
        this.setState(STATE_PLAYING);
        this.resetGame();
      } catch (error) {
        console.warn("Camera retry failed:", error);
        const errorMsg = error ? `${error.name}: ${error.message}` : "Device resource busy or blocked.";
        document.getElementById('cam-error-message').textContent = errorMsg;
        this.setState(STATE_CAM_ERROR);
      }
    };

    // Camera Error Screen: Switch to Mouse
    document.getElementById('cam-error-mouse-btn').onclick = () => {
      this.input.setMode('mouse');
      // Update HUD select buttons visual state
      document.getElementById('mode-mouse-btn').classList.add('active');
      document.getElementById('mode-cam-btn').classList.remove('active');
      document.getElementById('cam-instructions').style.display = 'none';
      
      this.setState(STATE_PLAYING);
      this.resetGame();
    };

    // Restart button
    document.getElementById('restart-btn').onclick = () => {
      this.resetGame();
      this.setState(STATE_PLAYING);
    };

    // Manual resume button (in case webcam fails and they want mouse)
    document.getElementById('manual-resume-btn').onclick = () => {
      this.input.setMode('mouse');
      // Update HUD buttons visual state
      document.getElementById('mode-mouse-btn').classList.add('active');
      document.getElementById('mode-cam-btn').classList.remove('active');
      document.getElementById('cam-instructions').style.display = 'none';
      this.setState(STATE_PLAYING);
    };
  }

  resetGame() {
    this.score = 0;
    this.lives = 3;
    this.level = 1;
    this.levelUpTextTimer = 0;
    this.player = new Player();
    this.coins.forEach(c => c.reset());
    this.obstacles = [];
    this.particles.forEach(p => p.active = false);
    this.updateHUD();
    
    // Freeze physics and wait for initial hand detection in camera mode
    this.waitingForInitialHand = (this.input.mode === 'camera');
    
    // Spawn initial obstacles
    const targetObstacles = this.baseObstacleCount + this.level * 2;
    for (let i = 0; i < targetObstacles; i++) {
      this.obstacles.push(new Obstacle(1.0));
    }
  }

  setState(state) {
    this.state = state;
    
    // Hide all overlay components initially
    document.getElementById('loading-screen').classList.add('hidden');
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('pause-screen').classList.add('hidden');
    document.getElementById('game-over-screen').classList.add('hidden');
    document.getElementById('cam-error-screen').classList.add('hidden');
    
    const backdrop = document.getElementById('screen-overlay');
    backdrop.classList.remove('hidden');

    if (state === STATE_LOADING) {
      document.getElementById('loading-screen').classList.remove('hidden');
    } else if (state === STATE_START) {
      document.getElementById('start-screen').classList.remove('hidden');
    } else if (state === STATE_PAUSED_HAND_LOST) {
      document.getElementById('pause-screen').classList.remove('hidden');
      // If camera mode: show hand lost. If they get stuck, offer switch to mouse
      if (this.input.mode === 'camera') {
        document.getElementById('manual-resume-btn').classList.remove('hidden');
      }
    } else if (state === STATE_GAME_OVER) {
      document.getElementById('game-over-screen').classList.remove('hidden');
      document.getElementById('final-score').textContent = this.score.toString().padStart(5, '0');
      document.getElementById('high-score').textContent = this.highScore.toString().padStart(5, '0');
      document.getElementById('final-level').textContent = this.level;
    } else if (state === STATE_CAM_ERROR) {
      document.getElementById('cam-error-screen').classList.remove('hidden');
    } else if (state === STATE_PLAYING) {
      backdrop.classList.add('hidden');
    }
  }

  updateHUD() {
    document.getElementById('score-val').textContent = this.score.toString().padStart(5, '0');
    document.getElementById('level-val').textContent = this.level;
    
    // Render lives indicators
    const dots = document.querySelectorAll('.live-dot');
    dots.forEach((dot, idx) => {
      if (idx < this.lives) {
        dot.classList.remove('lost');
      } else {
        dot.classList.add('lost');
      }
    });
  }

  triggerSpawnParticle(x, y, color, speed = 1.0, count = 10) {
    let spawned = 0;
    for (let i = 0; i < this.particles.length; i++) {
      if (!this.particles[i].active) {
        this.particles[i].spawn(x, y, color, speed);
        spawned++;
        if (spawned >= count) break;
      }
    }
  }

  checkCollisions() {
    // Invincibility check
    const isInvincible = this.player.shieldTime > 0;

    // 1. Coin collection
    this.coins.forEach(coin => {
      const dist = Math.hypot(this.player.x - coin.x, this.player.y - coin.y);
      if (dist < this.player.radius + coin.radius) {
        // Collect!
        this.score += 150;
        this.sounds.playCoin();
        
        // Spawn shiny gold sparks
        this.triggerSpawnParticle(coin.x, coin.y, '#ffd700', 1.0, 12);
        coin.reset();
        
        this.updateHUD();
        this.checkLevelUp();
      }
    });

    // 2. Obstacle hits
    this.obstacles.forEach(obs => {
      const dist = Math.hypot(this.player.x - obs.x, this.player.y - obs.y);
      if (dist < this.player.radius + obs.radius) {
        if (!isInvincible) {
          // Take damage
          this.lives--;
          this.player.shieldTime = 1600; // 1.6s invincibility
          this.sounds.playHit();
          
          // Large red explosion sparks
          this.triggerSpawnParticle(this.player.x, this.player.y, '#ff007f', 1.8, 25);
          
          this.updateHUD();
          
          if (this.lives <= 0) {
            this.handleGameOver();
          }
        }
      }
    });
  }

  checkLevelUp() {
    const scoreThreshold = this.level * 1800; // Score required for next level
    if (this.score >= scoreThreshold) {
      this.level++;
      this.levelUpTextTimer = 120; // Show level up text for 2 seconds
      this.sounds.playLevelUp();
      
      // Spark burst
      this.triggerSpawnParticle(this.player.x, this.player.y, '#00f3ff', 2.0, 30);
      this.updateHUD();
    }
  }

  handleGameOver() {
    this.setState(STATE_GAME_OVER);
    this.sounds.playGameOver();
    
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem('aeroglow_highscore', this.highScore.toString());
    }
  }

  startLoop() {
    const loop = (timestamp) => {
      const deltaTime = timestamp - this.lastTime;
      this.lastTime = timestamp;
      
      // Calculate framerate stats
      if (deltaTime > 0) {
        const frameFps = 1000 / deltaTime;
        this.fps += (frameFps - this.fps) / FPS_FILTER_STRENGTH;
        document.getElementById('fps-counter').textContent = `${Math.round(this.fps)} FPS`;
      }

      this.update(timestamp, deltaTime);
      this.render();

      requestAnimationFrame(loop);
    };
    
    requestAnimationFrame(loop);
  }

  update(timestamp, deltaTime) {
    // 1. Run detection loop (separate tracking clock)
    if (this.input.mode === 'camera' && this.camera.isReady) {
      this.tracker.detectFrame(timestamp, deltaTime);
      
      // Read state
      if (this.tracker.handDetected) {
        this.input.updateCameraCoords(this.tracker.latestX, this.tracker.latestY);
        
        // Hand detected: clear initial wait state
        if (this.waitingForInitialHand) {
          this.waitingForInitialHand = false;
        }
        
        // Auto-resume if tracker recovered
        if (this.state === STATE_PAUSED_HAND_LOST) {
          this.setState(STATE_PLAYING);
        }
      } else {
        // Tracker lost: pause game (only if NOT waiting for initial hand detection)
        if (this.state === STATE_PLAYING && !this.waitingForInitialHand) {
          this.setState(STATE_PAUSED_HAND_LOST);
        }
      }
    }

    // 2. Play physics updates
    if (this.state === STATE_PLAYING && !this.waitingForInitialHand) {
      // Update player (LERP smoothing towards targets)
      this.player.update(this.input.targetX, this.input.targetY, deltaTime);
      
      // Update coins
      this.coins.forEach(c => c.update(this.player, deltaTime));
      
      // Level speed multiplier scales obstacles
      const speedMultiplier = 1.0 + (this.level - 1) * 0.15;
      const targetObstacleCount = this.baseObstacleCount + (this.level - 1) * 2;
      
      // Refill obstacles array
      while (this.obstacles.length < targetObstacleCount) {
        this.obstacles.push(new Obstacle(speedMultiplier));
      }

      // Update obstacles
      this.obstacles.forEach((obs, idx) => {
        obs.update(deltaTime);
        if (obs.isOffscreen()) {
          obs.reset(speedMultiplier); // Object reuse!
        }
      });
      
      // Particle decay
      this.particles.forEach(p => {
        if (p.active) p.update();
      });

      // Handle level up display ticker
      if (this.levelUpTextTimer > 0) {
        this.levelUpTextTimer--;
      }

      // Physics collision checks
      this.checkCollisions();
    }
  }

  render() {
    const ctx = this.ctx;
    
    // Clear screen
    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Draw background glowing aura lines if active
    if (this.state === STATE_PLAYING) {
      // 1. Active stars/coins
      this.coins.forEach(c => c.draw(ctx));

      // 2. Player ship core
      this.player.draw(ctx);
      
      // 3. Obstacles
      this.obstacles.forEach(o => o.draw(ctx));
      
      // 4. Shiny particles
      this.particles.forEach(p => {
        if (p.active) p.draw(ctx);
      });

      // 5. Draw Level-Up Banner on canvas
      if (this.levelUpTextTimer > 0) {
        ctx.save();
        const alpha = Math.min(1.0, this.levelUpTextTimer / 30);
        ctx.fillStyle = `rgba(0, 243, 255, ${alpha})`;
        ctx.font = '800 2.5rem Outfit';
        ctx.textAlign = 'center';
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#00f3ff';
        ctx.fillText(`LEVEL ${this.level} // INITIATED`, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 80);
        ctx.restore();
      }
      // 6. Draw "Place hand to start" overlay if waiting for hand
      if (this.waitingForInitialHand) {
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

        ctx.fillStyle = '#00f3ff';
        ctx.font = '800 2.2rem Outfit';
        ctx.textAlign = 'center';
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#00f3ff';
        ctx.fillText('PLACE HAND IN FRONT OF CAMERA TO START', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20);

        ctx.font = '400 1.1rem Outfit';
        ctx.fillStyle = '#a0aec0';
        ctx.shadowBlur = 0;
        ctx.fillText('Align your hand so the tracker detects your index finger tip', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 20);
        ctx.restore();
      }
    } else {
      // Draw a subtle placeholder ring at target point during screens
      ctx.save();
      ctx.strokeStyle = 'rgba(0, 243, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(this.input.targetX, this.input.targetY, 30, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

// --- BOOTSTRAP INITIALIZATION ---
window.addEventListener('DOMContentLoaded', () => {
  const game = new GameEngine();
  game.startLoop();
});
