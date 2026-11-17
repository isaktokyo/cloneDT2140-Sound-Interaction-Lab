//==========================================================================================
// INTERACTION 4: OCEAN WAVES
//------------------------------------------------------------------------------------------
// The phone is a little tank of sea water. Tilt it left or right and the water rolls
// downhill: you hear it rush across, and when it hits the side of the tank it crashes as a
// breaking wave, from that side (stereo). Tip hard and fast for a big crash, rock gently for
// small laps. Rock it back and forth in rhythm to build up huge waves. With the phone held
// level the sea keeps breathing on its own, so it never goes fully silent.
//
// Self-contained: the sound is synthesised here with the Web Audio API (filtered noise for
// surf, foam and the low thump of the breaking wave). No .wasm file is needed. The water is
// drawn on the background canvas, so you can see it slosh.
//==========================================================================================

// sketch.js only lets "Turn On DSP" start the audio once dspNode is set,
// so dspNode is the master output of this file's synth.
let dspNode = null;
let dspNodeParams = null;
let jsonParams = null;

//------------------------------------------------------------------------------------------
// SETTINGS (tune these on the day)
//------------------------------------------------------------------------------------------
const DEAD_ZONE = 4;         // degrees of tilt ignored around level, so a resting phone stays calm
const GRAVITY = 12;          // how strongly tilt pulls the water (higher = faster slosh)
const DRAG = 0.6;            // how quickly the water slows down by itself
const BOUNCE = 0.45;         // how much speed the water keeps when it bounces off a wall
const CRASH_MIN_SPEED = 0.8; // slowest hit that still makes a (soft) wave sound
const CRASH_FULL_SPEED = 4.5;// hit speed that gives the biggest crash
const CRASH_GAP_MS = 220;    // shortest time between two crashes on the same side

//------------------------------------------------------------------------------------------
// AUDIO SETUP
//------------------------------------------------------------------------------------------
const oceanOut = audioContext.createGain();
oceanOut.gain.value = 0.9;
const oceanComp = audioContext.createDynamicsCompressor();
oceanComp.threshold.value = -14;
oceanComp.ratio.value = 4;
oceanOut.connect(oceanComp);
oceanComp.connect(audioContext.destination);
dspNode = oceanOut;

// Noise buffers, made once and reused by every sound below
function makeNoise(seconds, kind) {
    const sr = audioContext.sampleRate;
    const len = Math.floor(sr * seconds);
    const buffer = audioContext.createBuffer(1, len, sr);
    const d = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, brown = 0;
    for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === "pink") {               // soft, ocean-like hiss (Paul Kellet's filter)
            b0 = 0.99765 * b0 + w * 0.0990460;
            b1 = 0.96300 * b1 + w * 0.2965164;
            b2 = 0.57000 * b2 + w * 1.0526913;
            d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
        } else if (kind === "brown") {       // deep rumble
            brown = (brown + 0.02 * w) / 1.02;
            d[i] = brown * 3.5;
        } else {
            d[i] = w;
        }
    }
    // crossfade the ends so the loop has no click
    const fade = Math.floor(sr * 0.05);
    for (let i = 0; i < fade; i++) {
        const k = i / fade;
        d[i] = d[i] * k + d[len - fade + i] * (1 - k);
    }
    return buffer;
}
const pinkNoise = makeNoise(4, "pink");
const brownNoise = makeNoise(4, "brown");
const whiteNoise = makeNoise(3, "white");

// 1) The rushing water bed: always running, louder and brighter while the water moves.
const bedSrc = audioContext.createBufferSource();
bedSrc.buffer = pinkNoise;
bedSrc.loop = true;
const bedFilter = audioContext.createBiquadFilter();
bedFilter.type = "lowpass";
bedFilter.frequency.value = 400;
bedFilter.Q.value = 0.7;
const bedGain = audioContext.createGain();
bedGain.gain.value = 0.05;
const bedPan = audioContext.createStereoPanner();
bedSrc.connect(bedFilter);
bedFilter.connect(bedGain);
bedGain.connect(bedPan);
bedPan.connect(oceanOut);
bedSrc.start();

// 2) A breaking wave on one side. intensity 0..1, side -1 (left) or +1 (right).
function waveCrash(intensity, side) {
    const ctx = audioContext;
    const t = ctx.currentTime;
    const size = 0.25 + 0.75 * intensity;
    const length = 1.0 + 2.2 * intensity;              // big waves wash out for longer

    const pan = ctx.createStereoPanner();
    pan.pan.value = side * 0.85;
    pan.connect(oceanOut);

    // Body: the wave curling over, a roar that darkens as the water settles
    const body = ctx.createBufferSource();
    body.buffer = pinkNoise;
    const bodyFilter = ctx.createBiquadFilter();
    bodyFilter.type = "lowpass";
    bodyFilter.Q.value = 0.9;
    bodyFilter.frequency.setValueAtTime(900, t);
    bodyFilter.frequency.linearRampToValueAtTime(1800 + 3500 * intensity, t + 0.12);
    bodyFilter.frequency.exponentialRampToValueAtTime(350, t + length);
    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(0.0001, t);
    bodyGain.gain.exponentialRampToValueAtTime(1.6 * size, t + 0.08 + 0.1 * intensity);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    body.connect(bodyFilter);
    bodyFilter.connect(bodyGain);
    bodyGain.connect(pan);
    body.start(t, Math.random() * 2, length + 0.1);

    // Foam: the fizzing white water left behind, wobbling like bubbles popping
    const foam = ctx.createBufferSource();
    foam.buffer = whiteNoise;
    const foamFilter = ctx.createBiquadFilter();
    foamFilter.type = "bandpass";
    foamFilter.frequency.value = 3500 + 2500 * Math.random();
    foamFilter.Q.value = 0.8;
    const foamGain = ctx.createGain();
    foamGain.gain.setValueAtTime(0.0001, t);
    foamGain.gain.exponentialRampToValueAtTime(0.35 * size, t + 0.15);
    let ft = t + 0.15;
    while (ft < t + length * 0.8) {                    // random bubbly flutter
        ft += 0.04 + Math.random() * 0.08;
        const left = 1 - (ft - t) / length;
        foamGain.gain.linearRampToValueAtTime(0.35 * size * left * (0.4 + 0.6 * Math.random()), ft);
    }
    foamGain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    foam.connect(foamFilter);
    foamFilter.connect(foamGain);
    foamGain.connect(pan);
    foam.start(t, Math.random() * 1.5, length + 0.1);

    // Thump: the weight of the water hitting the wall, only for real crashes
    if (intensity > 0.3) {
        const thump = ctx.createBufferSource();
        thump.buffer = brownNoise;
        const thumpFilter = ctx.createBiquadFilter();
        thumpFilter.type = "lowpass";
        thumpFilter.frequency.value = 160;
        const thumpGain = ctx.createGain();
        thumpGain.gain.setValueAtTime(0.0001, t);
        thumpGain.gain.exponentialRampToValueAtTime(2.2 * intensity, t + 0.02);
        thumpGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
        thump.connect(thumpFilter);
        thumpFilter.connect(thumpGain);
        thumpGain.connect(pan);
        thump.start(t, Math.random() * 2, 0.5);
    }
}

//==========================================================================================
// WATER PHYSICS
//------------------------------------------------------------------------------------------
// The water is one blob with a position (-1 = piled against the left wall, +1 = right wall)
// and a speed. Tilt pulls it downhill like a ball in a tray; hitting a wall fast = crash.
//==========================================================================================
let tiltDeg = 0;             // left/right tilt, from the sensor (or the mouse on a desktop)
let waterPos = 0;
let waterVel = 0;
let lastCrash = { "-1": 0, "1": 0 };
let crashCount = 0;
let biggestCrash = 0;
let foam = [];               // visual foam particles
let lastStep = performance.now();

function stepWater() {
    const now = performance.now();
    // Real time, even on a slow phone: a long frame is split into small physics steps.
    const frame = Math.min((now - lastStep) / 1000, 0.15);
    lastStep = now;
    const steps = Math.max(1, Math.ceil(frame / (1 / 120)));
    const dt = frame / steps;

    let tilt = tiltDeg;
    if (Math.abs(tilt) < DEAD_ZONE) tilt = 0;
    const pull = GRAVITY * Math.sin(tilt * Math.PI / 180);

    for (let s = 0; s < steps; s++) {
        waterVel += (pull - DRAG * waterVel) * dt;
        waterPos += waterVel * dt;
        for (const side of [-1, 1]) {
            if (waterPos * side > 1) {
                const speed = Math.abs(waterVel);
                waterPos = side;
                waterVel = -waterVel * BOUNCE;
                if (speed > CRASH_MIN_SPEED && now - lastCrash[side] > CRASH_GAP_MS) {
                    // curved, so gentle rocking stays gentle and only real tips crash hard
                    const intensity = Math.pow(Math.min((speed - CRASH_MIN_SPEED) / (CRASH_FULL_SPEED - CRASH_MIN_SPEED), 1), 1.3);
                    lastCrash[side] = now;
                    playAudio(intensity, side);
                }
            }
        }
    }

    // Moving water rushes: louder and brighter the faster it goes. Plus a slow swell
    // so the sea keeps breathing when the phone is still.
    const speed = Math.min(Math.abs(waterVel) / 4, 1);
    const swell = 0.5 + 0.5 * Math.sin(now / 1000 * 2 * Math.PI / 7);   // one swell every 7 s
    const at = audioContext.currentTime;
    bedGain.gain.setTargetAtTime(0.04 + 0.05 * swell + 0.55 * speed, at, 0.08);
    bedFilter.frequency.setTargetAtTime(300 + 250 * swell + 2600 * speed, at, 0.08);
    bedPan.pan.setTargetAtTime(Math.max(-1, Math.min(1, waterPos * 0.7)), at, 0.1);
}

//==========================================================================================
// VISUALS: the water, drawn on the p5 background canvas after every frame
//==========================================================================================
p5.prototype.registerMethod("post", function () {
    stepWater();
    const p = this;
    const w = p.width, h = p.height;
    const t = p.millis() / 1000;
    p.clear();
    p.noStroke();

    // Water piles up on the side it is sloshing towards
    const base = h * 0.84;
    const pile = h * 0.12 * waterPos;
    const surface = (x) => {
        const u = x / w * 2 - 1;                        // -1..1 across the screen
        return base - pile * u
            + Math.sin(u * 5 + t * 1.6) * (6 + 7 * Math.abs(waterVel))
            + Math.sin(u * 11 - t * 2.3) * 3;
    };
    for (const [shade, offset] of [[[70, 150, 210, 140], 18], [[30, 110, 190, 200], 0]]) {
        p.fill(...shade);
        p.beginShape();
        p.vertex(0, h);
        for (let x = 0; x <= w; x += 12) p.vertex(x, surface(x) + offset);
        p.vertex(w, h);
        p.endShape(p.CLOSE);
    }

    // Foam spray from the latest crashes
    const ft = Math.min(p.deltaTime / 1000, 0.1);
    for (const f of foam) {
        f.vy += 900 * ft;
        f.x += f.vx * ft;
        f.y += f.vy * ft;
        f.life -= ft;
        p.fill(255, 255, 255, 255 * Math.max(f.life, 0));
        p.circle(f.x, f.y, f.r);
    }
    foam = foam.filter((f) => f.life > 0 && f.y < h);
});

function sprayFoam(intensity, side) {
    const w = window.innerWidth, h = window.innerHeight;
    const x = side > 0 ? w : 0;
    const n = Math.round(10 + 50 * intensity);
    for (let i = 0; i < n; i++) {
        foam.push({
            x: x,
            y: h * (0.72 + 0.1 * Math.random()),
            vx: -side * (60 + 380 * Math.random() * (0.4 + intensity)),
            vy: -(150 + 650 * Math.random() * (0.3 + intensity)),
            r: 3 + 9 * Math.random(),
            life: 0.7 + 0.8 * Math.random(),
        });
    }
}

//==========================================================================================
// INTERACTIONS
//==========================================================================================
function accelerationChange(accx, accy, accz) {
    // Not used: the waves only follow the tilt.
}

// roty is the left/right tilt (roll) in degrees. On a desktop there is no sensor, so
// dragging the mouse left/right tilts the tank instead.
function rotationChange(rotx, roty, rotz) {
    if (rotx === 0 && roty === 0) {
        tiltDeg = mouseIsPressed ? (mouseX / windowWidth * 2 - 1) * 45 : 0;
    } else {
        tiltDeg = Math.max(-60, Math.min(60, roty));
    }
    if (statusLabels[1]) {
        const dir = tiltDeg < -DEAD_ZONE ? "left" : tiltDeg > DEAD_ZONE ? "right" : "level";
        statusLabels[1].html("tilt " + dir + " " + Math.abs(Math.round(tiltDeg)) + "°");
    }
}

function mousePressed() {
    // Use this for debugging from the desktop: hold and drag left/right to tilt.
}

function deviceMoved() {
    movetimer = millis();
    statusLabels[2].style("color", "pink");
}

function deviceTurned() {
    threshVals[1] = turnAxis;
}

function deviceShaken() {
    shaketimer = millis();
    statusLabels[0].style("color", "pink");
}

//==========================================================================================
// AUDIO INTERACTION
//==========================================================================================
function playAudio(intensity, side) {
    sprayFoam(intensity, side);                         // the picture works even with sound off
    if (!dspNode || audioContext.state === 'suspended') {
        return;
    }
    waveCrash(intensity, side);
    // Android buzzes on big crashes (iPhones ignore this). Browsers only allow it after a tap.
    const tapped = !navigator.userActivation || navigator.userActivation.hasBeenActive;
    if (intensity > 0.6 && navigator.vibrate && tapped) navigator.vibrate(Math.round(40 + 80 * intensity));
    crashCount++;
    biggestCrash = Math.max(biggestCrash, Math.round(intensity * 100));
    if (statusLabels[0]) statusLabels[0].html("waves " + crashCount + " (biggest " + biggestCrash + "%)");
}

//==========================================================================================
// END
//==========================================================================================
