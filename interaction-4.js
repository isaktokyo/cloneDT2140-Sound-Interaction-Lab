//==========================================================================================
// INTERACTION 4: MARACA
//------------------------------------------------------------------------------------------
// Shake the phone like a maraca. Every stroke of the shake rattles the "beads": a hard
// flick gives a loud, dense rattle, a gentle one a soft, sparse one.
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
const HIT_THRESHOLD = 12;    // shake strength needed for a rattle (p5 acceleration units)
const MAX_STRENGTH = 50;     // shake strength that gives the loudest rattle
const MIN_GAP_MS = 60;       // shortest time between two rattles
const GOURD_FREQ = 3200;     // resonance of the gourd in Hz (higher = smaller, brighter maraca)

//------------------------------------------------------------------------------------------
// AUDIO SETUP
//------------------------------------------------------------------------------------------
const maracaOut = audioContext.createGain();
maracaOut.gain.value = 0.9;
const maracaComp = audioContext.createDynamicsCompressor();
maracaOut.connect(maracaComp);
maracaComp.connect(audioContext.destination);
dspNode = maracaOut;

// One rattle: beads collide many times, then settle as their energy dies away.
function maracaRattle(intensity, when) {
    const ctx = audioContext;
    const t = when === undefined ? ctx.currentTime : when;
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * 0.2);
    const buffer = ctx.createBuffer(1, len, sr);
    const data = buffer.getChannelData(0);

    const energyDecay = Math.exp(-1 / (sr * (0.03 + 0.03 * intensity))); // bead energy dies away
    const clickDecay = Math.exp(-1 / (sr * 0.0015));                     // each collision is a ~1.5 ms click
    const collisionsPerSecond = 1500 + 7000 * intensity;                 // harder shake = more collisions
    let energy = 1;
    let level = 0;
    for (let i = 0; i < len; i++) {
        energy *= energyDecay;
        if (Math.random() < (collisionsPerSecond / sr) * energy) {
            level += energy * (0.4 + 0.6 * Math.random());
        }
        level *= clickDecay;
        data[i] = level * (Math.random() * 2 - 1);
    }
    let peak = 0;                                   // normalise so loudness only depends on intensity
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(data[i]));
    if (peak > 0) for (let i = 0; i < len; i++) data[i] /= peak;

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    // The gourd: a resonant band around GOURD_FREQ, varied a little so no two rattles are identical
    const gourd = ctx.createBiquadFilter();
    gourd.type = "bandpass";
    gourd.frequency.value = GOURD_FREQ * (0.9 + 0.2 * Math.random());
    gourd.Q.value = 1.8;

    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 900;

    const gain = ctx.createGain();
    gain.gain.value = 1.4 * (0.25 + 0.75 * intensity);

    src.connect(gourd);
    gourd.connect(highpass);
    highpass.connect(gain);
    gain.connect(maracaOut);
    src.start(t);
}

//==========================================================================================
// INTERACTIONS
//------------------------------------------------------------------------------------------
// A shake is a back-and-forth movement. Acceleration peaks at each end of a stroke (where
// the beads slam into the shell) and drops near zero in the middle. So we watch the
// acceleration strength, wait for each peak, and rattle once per peak, as loud as the peak.
//==========================================================================================
let rattleState = "idle";   // idle -> rising (tracking a peak) -> cooldown (wait for it to drop)
let rattlePeak = 0;
let lastRattle = 0;
let rattleCount = 0;

function accelerationChange(accx, accy, accz) {
    if (!dspNode || audioContext.state !== "running") return;
    const strength = Math.sqrt(accx * accx + accy * accy + accz * accz);

    if (rattleState === "idle" && strength > HIT_THRESHOLD) {
        rattleState = "rising";
        rattlePeak = strength;
    } else if (rattleState === "rising") {
        if (strength > rattlePeak) {
            rattlePeak = strength;                    // still climbing
        } else if (strength < rattlePeak * 0.8) {    // past the peak: this is the bead impact
            if (millis() - lastRattle > MIN_GAP_MS) {
                playAudio(Math.min(rattlePeak / MAX_STRENGTH, 1));
                lastRattle = millis();
            }
            rattleState = "cooldown";
        }
    } else if (rattleState === "cooldown" && strength < Math.max(HIT_THRESHOLD * 0.5, rattlePeak * 0.35)) {
        rattleState = "idle";                         // stroke over, ready for the next one
    }
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
    // Only flashes the label: the rattles come from accelerationChange above.
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
    if (statusLabels[0]) statusLabels[0].html("rattles: " + rattleCount + " (last " + intensity.toFixed(2) + ")");
}

//==========================================================================================
// END
//==========================================================================================
