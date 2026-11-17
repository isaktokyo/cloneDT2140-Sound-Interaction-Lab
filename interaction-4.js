//==========================================================================================
// INTERACTION 4: MARACA
//------------------------------------------------------------------------------------------
// Shake the phone like a maraca. Every flick rattles the "beads": a hard flick gives a
// loud, dense rattle, a gentle one a soft, sparse one.
//
// Self-contained: the sound is synthesised here with the Web Audio API, using a simplified
// version of Perry Cook's PhISEM shaker model (many tiny random bead collisions, filtered
// by the resonance of the gourd). No .wasm file is needed.
//==========================================================================================

// sketch.js only lets "Turn On DSP" start the audio once dspNode is set,
// so dspNode is the master output of this file's synth.
let dspNode = null;
let dspNodeParams = null;
let jsonParams = null;

//------------------------------------------------------------------------------------------
// SETTINGS (tune these on the day)
//------------------------------------------------------------------------------------------
const HIT_THRESHOLD = 7;     // flick strength (m/s^2, gravity removed) that fires a rattle
const MAX_STRENGTH = 30;     // flick strength that gives the loudest rattle
const MIN_GAP_MS = 45;       // shortest time between two rattles (allows ~11 rattles a second)
const GOURD_FREQ = 4200;     // resonance of the gourd in Hz (higher = smaller, brighter maraca)
const RATTLE_MS = 70;        // length of one rattle (shorter = more staccato)

//------------------------------------------------------------------------------------------
// AUDIO SETUP
//------------------------------------------------------------------------------------------
const maracaOut = audioContext.createGain();
maracaOut.gain.value = 0.9;
const maracaComp = audioContext.createDynamicsCompressor();
maracaComp.attack.value = 0.001;   // fast, so it doesn't soften the clicky attack
maracaOut.connect(maracaComp);
maracaComp.connect(audioContext.destination);
dspNode = maracaOut;

// Shared filters (made once, not per rattle, to keep each trigger as cheap as possible)
const maracaGourd = audioContext.createBiquadFilter();
maracaGourd.type = "bandpass";
maracaGourd.frequency.value = GOURD_FREQ;
maracaGourd.Q.value = 2.2;
const maracaHighpass = audioContext.createBiquadFilter();
maracaHighpass.type = "highpass";
maracaHighpass.frequency.value = 1800;
maracaGourd.connect(maracaHighpass);
maracaHighpass.connect(maracaOut);

// One rattle: all the beads slam into the shell at once (a sharp, dense burst of tiny
// clicks) and the collisions die away within a few tens of milliseconds.
function maracaRattle(intensity, when) {
    const ctx = audioContext;
    const t = when === undefined ? ctx.currentTime : when;
    const sr = ctx.sampleRate;
    const dur = (RATTLE_MS + 30 * intensity) / 1000;          // harder = slightly longer tail
    const len = Math.floor(sr * dur);
    const buffer = ctx.createBuffer(1, len, sr);
    const data = buffer.getChannelData(0);

    const energyDecay = Math.exp(-1 / (sr * dur * 0.22));      // beads lose energy fast
    const clickDecay = Math.exp(-1 / (sr * 0.0006));           // each collision is a ~0.6 ms click
    const collisionsPerSecond = 6000 + 14000 * intensity;      // harder flick = more collisions
    let energy = 1;
    let level = 0;
    for (let i = 0; i < len; i++) {
        energy *= energyDecay;
        if (Math.random() < (collisionsPerSecond / sr) * energy) {
            level += energy * (0.3 + 0.7 * Math.random());
        }
        level *= clickDecay;
        // short fade at the very end so there's no click when the buffer stops
        const fade = Math.min(1, (len - i) / (sr * 0.004));
        data[i] = level * (Math.random() * 2 - 1) * fade;
    }
    let peak = 0;                                              // normalise so loudness only depends on intensity
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(data[i]));
    if (peak > 0) for (let i = 0; i < len; i++) data[i] /= peak;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = 0.94 + 0.12 * Math.random();     // tiny variation, so no two rattles are identical
    const gain = ctx.createGain();
    gain.gain.value = 2.2 * (0.3 + 0.7 * intensity);
    src.connect(gain);
    gain.connect(maracaGourd);
    src.start(t);
}

//==========================================================================================
// INTERACTIONS
//------------------------------------------------------------------------------------------
// For speed this reads the motion sensor directly (every sensor update, ~60 per second)
// instead of waiting for p5's screen redraw. A rattle fires the moment a flick crosses
// HIT_THRESHOLD, i.e. at the start of the flick, not after its peak. It then waits for the
// flick to die down before the next one can fire, so each flick gives exactly one rattle.
//==========================================================================================
let maracaArmed = true;
let flickPeak = 0;
let lastRattle = 0;
let rattleCount = 0;
let prevStrength = 0;

function onMaracaMotion(event) {
    const a = event.acceleration;                 // acceleration without gravity, m/s^2
    if (!a || a.x === null) return;
    const strength = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
    const now = performance.now();

    if (maracaArmed && strength > HIT_THRESHOLD && now - lastRattle > MIN_GAP_MS) {
        // Loudness from how hard the flick is: the current strength plus how fast it is rising.
        const sharpness = strength + Math.max(0, strength - prevStrength);
        playAudio(Math.min(sharpness / (MAX_STRENGTH * 1.5), 1));
        lastRattle = now;
        maracaArmed = false;
        flickPeak = strength;
    } else if (!maracaArmed) {
        flickPeak = Math.max(flickPeak, strength);
        // Re-arm once the flick has died down (relative to its own peak, so fast shakes work too)
        if (strength < Math.max(HIT_THRESHOLD * 0.5, flickPeak * 0.4)) maracaArmed = true;
    }
    prevStrength = strength;
}
window.addEventListener("devicemotion", onMaracaMotion);

function accelerationChange(accx, accy, accz) {
    // Not used: the maraca listens to the sensor directly (onMaracaMotion) to react faster.
}

function rotationChange(rotx, roty, rotz) {
}

function mousePressed() {
    playAudio(0.7)
    // Use this for debugging from the desktop!
}

function deviceMoved() {
    movetimer = millis();
    statusLabels[2].style("color", "pink");
}

function deviceTurned() {
    threshVals[1] = turnAxis;
}

function deviceShaken() {
    // Only flashes the label: the rattles come from onMaracaMotion above.
    shaketimer = millis();
    statusLabels[0].style("color", "pink");
}

//==========================================================================================
// AUDIO INTERACTION
//==========================================================================================
function playAudio(intensity) {
    if (!dspNode) {
        return;
    }
    if (audioContext.state === 'suspended') {
        return;
    }
    maracaRattle(intensity);
    rattleCount++;
    if (statusLabels[0]) statusLabels[0].html("shaken " + rattleCount);
}

//==========================================================================================
// END
//==========================================================================================
