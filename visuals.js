// Screen visuals for status effects.
// Each visual is a full-screen layer drawn behind the chat. Its strength
// follows the effect's stage: stage / max gives an intensity from 0 to 1,
// which sets how visible the layer is, how fast it moves and, for some,
// how many particles appear.

export const VISUALS_VERSION = '1.3.1';

export const VISUALS = [
    { key: 'spiral', place: 'under', label: 'Hypnotic spiral', hint: 'hypnosis, trance, suggestion, mind control', words: ['hypno', 'trance', 'mesmer', 'pendulum', 'suggestion', 'mind control', 'brainwash', 'obedien'], min: 0.07, max: 0.32, slow: 22, fast: 2.6 },
    { key: 'tunnel', place: 'under', label: 'Tunnel vision', hint: 'fixation, obsession, narrowing focus, compulsion', words: ['obsess', 'fixat', 'compuls', 'focus', 'tunnel', 'fascinat'], min: 0.06, max: 0.4, slow: 9, fast: 2.5 },
    { key: 'pink', place: 'under', label: 'Pink haze', hint: 'arousal, lust, heat, desire', words: ['arous', 'lust', 'desire', 'horny', 'aphrodis', 'heat cycle', 'in heat'], min: 0.08, max: 0.55, slow: 7, fast: 2 },
    { key: 'hearts', place: 'under', label: 'Floating hearts', hint: 'infatuation, love, charm, crush, devotion', words: ['love', 'infatuat', 'crush', 'charm', 'smitten', 'devot', 'adore'], min: 0.25, max: 0.85, slow: 16, fast: 6, particles: { glyph: '♥', min: 3, max: 14 } },
    { key: 'red', place: 'over', label: 'Red pulse', hint: 'rage, anger, bloodlust, frenzy', words: ['rage', 'anger', 'angry', 'fury', 'furious', 'berserk', 'bloodlust', 'frenzy'], min: 0.08, max: 0.55, slow: 2.2, fast: 0.7 },
    { key: 'blood', place: 'over', label: 'Bleeding edges', hint: 'injury, pain, wounds, bleeding', words: ['injur', 'wound', 'bleed', 'blood', 'broken', 'bruis', 'pain', 'fractur', 'cut'], min: 0.1, max: 0.65, slow: 6, fast: 2 },
    { key: 'dread', place: 'over', label: 'Closing darkness', hint: 'fear, dread, panic, terror', words: ['fear', 'dread', 'panic', 'terror', 'afraid', 'scared', 'phobia', 'paranoi'], min: 0.15, max: 0.92, slow: 9, fast: 2.5 },
    { key: 'fog', place: 'under', label: 'Drifting fog', hint: 'drowsiness, exhaustion, sleep, confusion, sedation', words: ['drows', 'sleep', 'tired', 'exhaust', 'fatigue', 'sedat', 'confus', 'daze'], min: 0.08, max: 0.5, slow: 40, fast: 12 },
    { key: 'sickly', place: 'under', label: 'Sickly green', hint: 'poison, illness, nausea, disease', words: ['poison', 'venom', 'sick', 'ill', 'nause', 'disease', 'plague', 'infect', 'toxin'], min: 0.08, max: 0.5, slow: 10, fast: 3 },
    { key: 'frost', place: 'over', label: 'Frost', hint: 'cold, ice, freezing, frostbite curse', words: ['cold', 'frost', 'ice', 'icy', 'freez', 'chill', 'hypotherm'], min: 0.1, max: 0.7, slow: 8, fast: 3 },
    { key: 'fire', place: 'under', label: 'Flames', hint: 'burning, fever, fire magic, overheating', words: ['burn', 'fire', 'flame', 'fever', 'scorch', 'heatstroke', 'inferno'], min: 0.08, max: 0.6, slow: 3, fast: 0.8 },
    { key: 'corruption', place: 'under', label: 'Creeping corruption', hint: 'corruption, dark magic, taint, demonic influence', words: ['corrupt', 'taint', 'demon', 'dark magic', 'defil', 'blight', 'curse'], min: 0.1, max: 0.7, slow: 14, fast: 4 },
    { key: 'holy', place: 'under', label: 'Holy light', hint: 'blessing, divine power, purification, sanctity', words: ['bless', 'holy', 'divine', 'sanct', 'purif', 'angel', 'radian'], min: 0.06, max: 0.45, slow: 90, fast: 25 },
    { key: 'madness', place: 'under', label: 'Shifting colours', hint: 'madness, eldritch influence, insanity, hallucination', words: ['mad', 'insan', 'eldritch', 'hallucin', 'delir', 'psychede', 'unreal'], min: 0.06, max: 0.45, slow: 40, fast: 8 },
    { key: 'drunk', place: 'under', label: 'Woozy sway', hint: 'intoxication, drugs, dizziness', words: ['drunk', 'intox', 'tipsy', 'wine', 'alcohol', 'dizz', 'drug'], min: 0.08, max: 0.5, slow: 8, fast: 2.5 },
    { key: 'glitch', place: 'over', label: 'Glitch scanlines', hint: 'technological control, programming, digital interference, implants', words: ['glitch', 'program', 'digital', 'implant', 'cyber', 'hack', 'robot', 'android', 'chip'], min: 0.08, max: 0.55, slow: 6, fast: 1.5 },
    { key: 'sparkle', place: 'under', label: 'Sparkles', hint: 'magic buff, enchantment, empowerment, glamour', words: ['enchant', 'buff', 'empower', 'glamour', 'magic', 'spell', 'fairy', 'boon'], min: 0.3, max: 0.9, slow: 5, fast: 1.8, particles: { glyph: '✦', min: 4, max: 18 } },
    { key: 'shadow', place: 'over', label: 'Shadows', hint: 'possession, shadow curse, being watched or haunted', words: ['possess', 'shadow', 'haunt', 'ghost', 'spirit', 'watched', 'stalk'], min: 0.15, max: 0.92, slow: 6, fast: 1.8 },
    { key: 'static', place: 'over', label: 'Static', hint: 'dissociation, memory loss, numbness, emptiness', words: ['dissociat', 'memory', 'amnesi', 'forget', 'numb', 'empty', 'blank', 'hollow'], min: 0.04, max: 0.3, slow: 0.6, fast: 0.25 },
    { key: 'water', place: 'under', label: 'Underwater', hint: 'drowning, water magic, submersion, deep calm', words: ['drown', 'water', 'submer', 'ocean', 'sea', 'tide', 'mermaid', 'calm'], min: 0.1, max: 0.6, slow: 20, fast: 7 },
    { key: 'drained', place: 'over', label: 'Drained colour', hint: 'energy drain, despair, weakness, life drain', words: ['drain', 'despair', 'weak', 'depress', 'hopeless', 'wither', 'leech'], min: 0.15, max: 1, slow: 10, fast: 4 },
    { key: 'morph', place: 'under', label: 'Morphing blobs', hint: 'transformation, mutation, shapeshifting, body change', words: ['transform', 'mutat', 'shapeshift', 'morph', 'ears', 'tail', 'fur', 'scales', 'slime'], min: 0.08, max: 0.5, slow: 20, fast: 6 },
];

const BY_KEY = new Map(VISUALS.map(v => [v.key, v]));
const BLOB_COUNT = { fog: 4, morph: 3 };
const MAX_LAYERS = 4;

export function isVisual(key) {
    return BY_KEY.has(key);
}

export function visualLabel(key) {
    return BY_KEY.get(key)?.label ?? '';
}

// Picks a visual from the effect's name and description when none is set.
// Short words (3 letters or less) must match a whole word, so "ill" does not
// match "will" and "mad" does not match "made". Longer ones match word starts.
const WORD_RULES = VISUALS.map(v => ({
    key: v.key,
    patterns: v.words.map(w => new RegExp(w.length <= 3 ? `\\b${w}\\b` : `\\b${w}`, 'i')),
}));

export function guessVisual(textToSearch) {
    const t = String(textToSearch ?? '');
    if (!t) return null;
    for (const rule of WORD_RULES) {
        if (rule.patterns.some(p => p.test(t))) return rule.key;
    }
    return null;
}

function svgUrl(svg) {
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function spiralImage() {
    let paths = '';
    for (const arm of [0, Math.PI]) {
        let d = '';
        for (let t = 0; t <= Math.PI * 12; t += 0.07) {
            const r = t * 2.6;
            d += `${d ? 'L' : 'M'}${(Math.cos(t + arm) * r).toFixed(1)} ${(Math.sin(t + arm) * r).toFixed(1)}`;
        }
        paths += `<path d='${d}'/>`;
    }
    return svgUrl(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='-100 -100 200 200'><g fill='none' stroke='rgb(190,130,255)' stroke-width='5' stroke-linecap='round'>${paths}</g></svg>`);
}

function noiseImage() {
    return svgUrl("<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1.4 0 0 0 -0.5'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>");
}

// Two layers: "under" sits beneath the chat messages, "over" sits on top of them.
const roots = { under: null, over: null };
const layers = new Map(); // key -> { el, count }

function makeRoot(place) {
    const r = document.createElement('div');
    r.id = place === 'over' ? 'sfx-fx-root' : 'sfx-fx-under';
    r.className = `sfx-fx-layer sfx-${place}`;
    r.style.setProperty('--sfx-spiral', spiralImage());
    r.style.setProperty('--sfx-noise', noiseImage());
    if (place === 'under') {
        const tint = document.createElement('div');
        tint.className = 'sfx-tint';
        r.appendChild(tint);
    }
    document.body.appendChild(r);
    return r;
}

function ensureRoot(place) {
    roots[place] ??= makeRoot(place);
    return roots[place];
}

// ---- taking over the chat tint while something is drawn underneath ----
// The chat area normally has a mostly solid background colour. While an
// effect is drawn under the messages, that colour is copied onto our own
// layer (below the effects) and the chat's own background is made clear.
const TINT_TARGETS = ['#sheld', '#chat'];
let tintSaved = null;

function takeOverTint() {
    const under = ensureRoot('under');
    const tint = under.querySelector('.sfx-tint');
    if (!tintSaved) {
        tintSaved = [];
        const colours = [];
        let blur = '';
        for (const sel of TINT_TARGETS) {
            const el = document.querySelector(sel);
            if (!el) continue;
            const cs = getComputedStyle(el);
            const bg = cs.backgroundColor;
            const bf = cs.backdropFilter || cs.webkitBackdropFilter || 'none';
            const clear = !bg || bg === 'transparent' || /rgba\(.*,\s*0\)$/.test(bg);
            if (!clear) colours.push(bg);
            if (bf && bf !== 'none' && !blur) blur = bf;
            tintSaved.push({
                el,
                bg: el.style.getPropertyValue('background-color'),
                bgPrio: el.style.getPropertyPriority('background-color'),
                bf: el.style.getPropertyValue('backdrop-filter'),
                bfPrio: el.style.getPropertyPriority('backdrop-filter'),
            });
            el.style.setProperty('background-color', 'transparent', 'important');
            el.style.setProperty('backdrop-filter', 'none', 'important');
            el.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
        }
        tint.style.background = colours.length ? colours.map(c => `linear-gradient(${c}, ${c})`).join(', ') : 'none';
        tint.style.backdropFilter = blur || 'none';
        tint.style.webkitBackdropFilter = blur || 'none';
    }
    // Match the tint to the chat column (full width on phones).
    const host = document.querySelector('#sheld') ?? document.querySelector('#chat');
    const r = host?.getBoundingClientRect();
    if (r && r.width > 0 && r.height > 0) {
        Object.assign(tint.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    } else {
        Object.assign(tint.style, { left: '0', top: '0', width: '100%', height: '100%' });
    }
    tint.hidden = false;
}

function releaseTint() {
    if (!tintSaved) return;
    for (const t of tintSaved) {
        t.el.style.removeProperty('-webkit-backdrop-filter');
        if (t.bg) t.el.style.setProperty('background-color', t.bg, t.bgPrio); else t.el.style.removeProperty('background-color');
        if (t.bf) t.el.style.setProperty('backdrop-filter', t.bf, t.bfPrio); else t.el.style.removeProperty('backdrop-filter');
    }
    tintSaved = null;
    const tint = roots.under?.querySelector('.sfx-tint');
    if (tint) tint.hidden = true;
}

addEventListener('resize', () => { if (tintSaved) takeOverTint(); });

export function tintInfo() {
    return tintSaved ? `taken over (${tintSaved.length} element${tintSaved.length === 1 ? '' : 's'})` : 'normal';
}

function placeParticles(el, v, count) {
    el.replaceChildren();
    for (let n = 0; n < count; n++) {
        const p = document.createElement('i');
        p.textContent = v.particles.glyph;
        p.style.left = `${Math.random() * 96}%`;
        if (v.key === 'sparkle') p.style.top = `${Math.random() * 94}%`;
        p.style.fontSize = `${14 + Math.random() * 18}px`;
        p.style.animationDelay = `${(-Math.random() * 12).toFixed(2)}s`;
        el.appendChild(p);
    }
}

function makeLayer(v) {
    const el = document.createElement('div');
    el.className = `sfx-fx sfx-fx-${v.key}`;
    el.style.opacity = '0';
    for (let n = 0; n < (BLOB_COUNT[v.key] ?? 0); n++) el.appendChild(document.createElement('i'));
    return el;
}

function applyIntensity(entry, v, i, strength) {
    const { el } = entry;
    const level = Math.min(1, i * strength);
    el.style.setProperty('--i', level.toFixed(3));
    el.style.setProperty('--dur', `${(v.slow - (v.slow - v.fast) * i).toFixed(2)}s`);
    if (v.key === 'drained') {
        el.style.opacity = '1';
        const f = `grayscale(${level.toFixed(2)}) brightness(${(1 - 0.35 * level).toFixed(2)})`;
        el.style.backdropFilter = f;
        el.style.webkitBackdropFilter = f;
    } else {
        el.style.opacity = Math.min(1, (v.min + (v.max - v.min) * i) * strength).toFixed(3);
    }
    if (v.particles) {
        const count = Math.round(v.particles.min + (v.particles.max - v.particles.min) * i);
        if (count !== entry.count) {
            placeParticles(el, v, count);
            entry.count = count;
        }
    }
}

// active: [{ key, i }] with i from 0 to 1. Layers are reused so their
// animations keep running smoothly when the values change.
// placement: 'auto' (each visual's own default), 'under' or 'over'.
export function renderVisuals(active, { strength = 1, animate = true, placement = 'auto' } = {}) {
    const wanted = active
        .filter(a => BY_KEY.has(a.key) && a.i > 0)
        .sort((a, b) => b.i - a.i)
        .slice(0, MAX_LAYERS);
    const keep = new Set(wanted.map(a => a.key));

    for (const [key, entry] of layers) {
        if (keep.has(key)) continue;
        layers.delete(key);
        entry.el.style.opacity = '0';
        setTimeout(() => entry.el.remove(), 1300);
    }

    let anyUnder = false;
    for (const a of wanted) {
        const v = BY_KEY.get(a.key);
        const place = placement === 'auto' ? v.place : placement;
        if (place === 'under') anyUnder = true;
        const box = ensureRoot(place);
        box.classList.toggle('sfx-still', !animate);
        let entry = layers.get(a.key);
        if (!entry) {
            entry = { el: makeLayer(v), count: -1 };
            layers.set(a.key, entry);
            box.appendChild(entry.el);
            void entry.el.offsetWidth; // let the fade-in transition run
        } else if (entry.el.parentElement !== box) {
            box.appendChild(entry.el);
        }
        applyIntensity(entry, v, a.i, strength);
    }
    for (const r of Object.values(roots)) r?.classList.toggle('sfx-still', !animate);

    if (anyUnder) takeOverTint();
    else setTimeout(() => { if (![...layers.values()].some(e => e.el.parentElement === roots.under)) releaseTint(); }, 1300);
}
