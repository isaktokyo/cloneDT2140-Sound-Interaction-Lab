//==========================================================================================
// INTERACTION 5: "HALLELUJAH" (Statue of Liberty pose)
//------------------------------------------------------------------------------------------
// Raise the phone up above your head like the Statue of Liberty's torch and a choir
// sings "Haaaa-le-lu-jah! Hal-le-lu-jah! Hal-le-lu-jaaah!".
//
// A phone can't measure its height, so "above your head" is detected as:
//   1. a quick upward lift (an acceleration burst), followed within LIFT_WINDOW_MS by
//   2. the phone being held pointing at the sky or tipped back past vertical
//      (the torch pose), for at least HOLD_MS.
// The choir won't sing again until it has finished AND you've lowered the phone.
//
// Self-contained: the choir is synthesised here with the Web Audio API (formant synthesis:
// buzzy "vocal cord" oscillators shaped by filters into the vowels a-e-u-a, plus reverb).
// The melody is based on Handel's Hallelujah chorus (1741, public domain). No .wasm needed.
//==========================================================================================

// sketch.js only lets "Turn On DSP" start the audio once dspNode is set,
// so dspNode is the master output of this file's synth.
let dspNode = null;
let dspNodeParams = null;
let jsonParams = null;

//------------------------------------------------------------------------------------------
// SETTINGS (tune these on the day)
//------------------------------------------------------------------------------------------
const REQUIRE_LIFT = true;   // set to false if the lift detection is unreliable: then the pose alone triggers it
const LIFT_THRESHOLD = 12;   // acceleration strength that counts as "lifting" (p5 acceleration units)
const LIFT_WINDOW_MS = 1500; // the pose must be reached within this long after the lift
const HOLD_MS = 250;         // how long the pose must be held
const POSE_MIN_PITCH = 70;   // rotationX above this (upright or tipped back) = torch pose

//------------------------------------------------------------------------------------------
// AUDIO SETUP: choir -> (dry + reverb) -> compressor -> master
//------------------------------------------------------------------------------------------
const choirMaster = audioContext.createGain();
choirMaster.gain.value = 0.6;
const choirComp = audioContext.createDynamicsCompressor();
choirComp.threshold.value = -18;
choirComp.ratio.value = 4;
choirComp.connect(choirMaster);
choirMaster.connect(audioContext.destination);
dspNode = choirMaster;

const choirBus = audioContext.createGain();
const choirDry = audioContext.createGain();
choirDry.gain.value = 0.7;
const choirWet = audioContext.createGain();
choirWet.gain.value = 0.55;
const choirReverb = audioContext.createConvolver();
choirReverb.buffer = makeHallImpulse(audioContext, 3.5);
choirBus.connect(choirDry);
choirBus.connect(choirReverb);
choirReverb.connect(choirWet);
choirDry.connect(choirComp);
choirWet.connect(choirComp);

// A big stone hall: decaying stereo noise used as a reverb impulse response.
function makeHallImpulse(ctx, seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) {
            d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
        }
    }
    return buf;
}

// Vowel formants (resonances of the vocal tract) in Hz, with relative loudness.
const VOWELS = {
    a: [[800, 1.0], [1150, 0.5], [2900, 0.25]],   // "ah"  (HA, JAH)
    e: [[480, 1.0], [1750, 0.35], [2550, 0.2]],   // "eh"  (LE)
    u: [[350, 1.0], [640, 0.3], [2700, 0.1]],     // "oo"  (LU)
    i: [[280, 1.0], [2200, 0.3], [2950, 0.2]],    // "ee"  (the "y" glide at the start of JAH)
    l: [[360, 1.0], [1000, 0.2], [2400, 0.1]],    // "l"
};

const midiToHz = m => 440 * Math.pow(2, (m - 69) / 12);

// One choir section (soprano, alto, tenor or bass): 3 slightly detuned buzzy oscillators
// with vibrato, shaped into vowels by 3 formant filters.
function createSection(ctx, pan) {
    const out = ctx.createGain();
    out.gain.value = 0;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    out.connect(panner);
    panner.connect(choirBus);

    const source = ctx.createGain();
    source.gain.value = 0.35;
    const vibrato = ctx.createOscillator();
    vibrato.frequency.value = 5 + Math.random();
    const vibratoDepth = ctx.createGain();
    vibratoDepth.gain.value = 18; // cents
    vibrato.connect(vibratoDepth);

    const oscs = [-9, 0, 9].map(cents => {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.detune.value = cents + (Math.random() * 4 - 2);
        vibratoDepth.connect(o.detune);
        o.connect(source);
        return o;
    });

    const formants = [0, 1, 2].map(k => {
        const f = ctx.createBiquadFilter();
        f.type = "bandpass";
        f.Q.value = [5, 9, 12][k];
        const g = ctx.createGain();
        source.connect(f);
        f.connect(g);
        g.connect(out);
        return { f, g };
    });

    return {
        start(t) { oscs.forEach(o => o.start(t)); vibrato.start(t); },
        stop(t) { oscs.forEach(o => o.stop(t)); vibrato.stop(t); },
        pitch(midi, t) { oscs.forEach(o => o.frequency.setTargetAtTime(midiToHz(midi), t, 0.015)); },
        vowel(v, t, speed) {
            VOWELS[v].forEach(([freq, amp], k) => {
                formants[k].f.frequency.setTargetAtTime(freq, t, speed || 0.025);
                formants[k].g.gain.setTargetAtTime(amp * 3, t, speed || 0.025);
            });
        },
        level(value, t, speed) { out.gain.setTargetAtTime(value, t, speed || 0.03); },
        out,
    };
}

// Breathy "H" at the start of a phrase.
function breath(ctx, t, dur) {
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 1300;
    f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.value = 0.25;
    src.connect(f); f.connect(g); g.connect(choirBus);
    src.start(t);
}

// The score. Each phrase is one "Hallelujah": 4 syllables, each with a duration (seconds)
// and a chord as MIDI notes for [bass, tenor, alto, soprano]. Key: D major.
const D = [50, 57, 66, 74], D_A = [45, 62, 66, 69], G = [43, 62, 67, 71], D2 = [50, 62, 66, 69];
const A = [45, 64, 69, 73], Bm = [47, 62, 66, 74];
const D_HI = [50, 62, 69, 78], G_HI = [43, 62, 71, 79], A_HI = [45, 64, 69, 76], D_END = [38, 57, 66, 74];
const SCORE = [
    // "Haaaa - le - lu - jah"  (slow and grand)
    { syl: [["a", 1.4, D], ["e", 0.32, D_A], ["u", 0.32, G], ["a", 1.0, D2]], gap: 0.12 },
    // "Hal - le - lu - jah"
    { syl: [["a", 0.36, A], ["e", 0.2, A], ["u", 0.2, Bm], ["a", 0.5, A]], gap: 0.1 },
    // "Hal - le - lu - jaaaah!"  (up high, held, with a swell)
    { syl: [["a", 0.36, D_HI], ["e", 0.2, G_HI], ["u", 0.2, A_HI], ["a", 2.0, D_END]], gap: 0 },
];

let choirBusyUntil = -1;

// Schedules the whole sung phrase starting at time t0. Returns its length in seconds.
function singHallelujah(ctx, t0) {
    const sections = [-0.5, -0.15, 0.15, 0.5].map(p => createSection(ctx, p)); // B, T, A, S
    sections.forEach(s => s.start(t0));
    let t = t0 + 0.05;

    SCORE.forEach((phrase, pi) => {
        breath(ctx, t - 0.05, 0.15);                                  // "H"
        phrase.syl.forEach(([vowel, dur, chord], si) => {
            const isLast = pi === SCORE.length - 1 && si === phrase.syl.length - 1;
            sections.forEach((s, v) => {
                s.pitch(chord[v], t);
                if (si === 0) {                                       // phrase onset: fade in on "ah"
                    s.vowel(vowel, t, 0.01);
                    s.level(1, t, 0.04);
                } else if (vowel === "e" || vowel === "u") {          // "L" before LE and LU: brief dip
                    s.vowel("l", t, 0.01);
                    s.level(0.55, t, 0.01);
                    s.vowel(vowel, t + 0.05);
                    s.level(1, t + 0.05, 0.02);
                } else {                                              // "Y" glide into JAH
                    s.vowel("i", t, 0.01);
                    s.vowel(vowel, t + 0.06, 0.03);
                }
                if (isLast) s.level(1.3, t + 0.2, 0.4);               // final swell
            });
            t += dur;
        });
        // end of phrase: release (long release on the last one)
        const release = pi === SCORE.length - 1 ? 0.35 : 0.04;
        sections.forEach(s => s.level(0, t - 0.03, release));
        t += phrase.gap;
    });

    const end = t + 2.0;
    sections.forEach(s => s.stop(end));
    return end - t0 + 2.5; // plus reverb tail
}

//==========================================================================================
// INTERACTIONS
//==========================================================================================
let lastLift = -Infinity;
let poseSince = null;
let choirArmed = true;

function accelerationChange(accx, accy, accz) {
    const strength = Math.sqrt(accx * accx + accy * accy + accz * accz);
    if (strength > LIFT_THRESHOLD) lastLift = millis();
}

function rotationChange(rotx, roty, rotz) {
    if (!dspNode || audioContext.state !== "running") return;
    const now = millis();
    // Torch pose: pointing at the sky (~90) or tipped back past vertical towards face-down (up to +-180)
    const inPose = rotx > POSE_MIN_PITCH || rotx < -150;
    const lifted = !REQUIRE_LIFT || now - lastLift < LIFT_WINDOW_MS;

    if (inPose) {
        if (poseSince === null) poseSince = now;
        if (choirArmed && lifted && now - poseSince > HOLD_MS && audioContext.currentTime > choirBusyUntil) {
            choirArmed = false;
            playAudio();
        }
    } else {
        poseSince = null;
        if (rotx < 40 && rotx > -100 && audioContext.currentTime > choirBusyUntil) choirArmed = true; // lowered again
    }

    if (statusLabels[1]) {
        statusLabels[1].html(choirArmed ? ("lift " + (now - lastLift < LIFT_WINDOW_MS ? "&#10003;" : "&ndash;") +
            " pose " + (inPose ? "&#10003;" : "&ndash;")) : "lower to reset");
    }
}

function mousePressed() {
    playAudio()
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
    shaketimer = millis();
    statusLabels[0].style("color", "pink");
}

//==========================================================================================
// AUDIO INTERACTION
//==========================================================================================
function playAudio() {
    if (!dspNode) {
        return;
    }
    if (audioContext.state === 'suspended') {
        return;
    }
    if (audioContext.currentTime < choirBusyUntil) return; // already singing
    const t0 = audioContext.currentTime + 0.05;
    choirBusyUntil = t0 + singHallelujah(audioContext, t0) - 2.5;
}

//==========================================================================================
// END
//==========================================================================================
