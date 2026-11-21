// Status Effects for SillyTavern
// A small floating panel that tracks ongoing effects (hypnosis, training,
// transformations, curses, injuries...) with stages and progress bars.
// After each character reply, a short extra AI call checks whether any
// effect started, changed or ended. The current effects are also sent to
// the AI with every prompt so it can play them at the right stage.

import { VISUALS, VISUALS_VERSION, isVisual, visualLabel, guessVisual, renderVisuals, tintInfo } from './visuals.js';

const VERSION = '1.9.1';

// Status icons: shown in the panel and on the affected character's portrait.
const ICONS = [
    ['🌀', 'hypnosis, trance'], ['🔔', 'trigger, conditioning'], ['🎯', 'obsession, fixation'], ['⛓️', 'control, binding'],
    ['🧠', 'mind, memory'], ['💭', 'suggestion, thoughts'], ['💗', 'arousal, desire'], ['💘', 'love, infatuation'],
    ['💢', 'anger, rage'], ['😨', 'fear, dread'], ['🩸', 'injury, bleeding'], ['💤', 'sleep, drowsiness'],
    ['🤢', 'nausea, sickness'], ['☠️', 'poison, curse'], ['❄️', 'cold, ice'], ['🔥', 'fire, fever'],
    ['😈', 'corruption, demonic'], ['😇', 'holy, blessing'], ['✨', 'magic, buff'], ['🍷', 'drunk, intoxicated'],
    ['💫', 'dizzy, dazed'], ['⚙️', 'tech, implant'], ['👻', 'possession, haunting'], ['👁️', 'watched, madness'],
    ['🌫️', 'dissociation, numbness'], ['🌊', 'water, drowning'], ['🥀', 'drained, weakened'], ['🧬', 'transformation'],
    ['🐾', 'animal traits'], ['🎓', 'training, skill'], ['💪', 'strength, empowered'], ['🛡️', 'protection, ward'],
    ['🔒', 'sealed, restricted'], ['🎭', 'disguise, persona'], ['💧', 'craving, thirst'], ['⭐', 'other'],
];
const ICON_FOR_VISUAL = {
    spiral: '🌀', ring: '🔔', tunnel: '🎯', pink: '💗', hearts: '💘', red: '💢', blood: '🩸', dread: '😨',
    fog: '💤', sickly: '🤢', frost: '❄️', fire: '🔥', corruption: '😈', holy: '😇', madness: '👁️', drunk: '🍷',
    glitch: '⚙️', sparkle: '✨', shadow: '👻', static: '🌫️', water: '🌊', drained: '🥀', morph: '🧬',
};

const MODULE = 'status_effects';
const PROMPT_KEY = 'status_effects_panel';
const IN_CHAT = 1;      // extension_prompt_types.IN_CHAT
const ROLE_SYSTEM = 0;  // extension_prompt_roles.SYSTEM

const DEFAULTS = {
    enabled: true,
    autoCheck: true,
    contextMessages: 6,
    maxStep: 1,
    injectDepth: 1,
    side: 'left',
    visuals: true,
    visualStrength: 100,
    animate: true,
    placement: 'auto',
    ringVibrate: false,
    badges: true,
    footers: true,
    sendCast: true,
    toasts: false,
};

const CHECK_PROMPT = `You keep the status-effect tracker for an ongoing roleplay. You read the newest part of the story and report which tracked effects started, changed or ended. You never write story text.

WHAT COUNTS AS AN EFFECT
Lasting conditions that build, fade or matter later: hypnosis, mind control, conditioning, training, transformations, curses, corruption, possession, addictions, injuries, illnesses, buffs and debuffs, magical marks, bonds, lasting fear or trust. Not single actions, passing moods or things that are over within the scene.

RULES
- Write about each character with the gender and pronouns their own description in CAST gives. Never infer gender from appearance, clothing or behaviour: a femboy, a feminine man, a tomboy or an androgynous character keeps the gender and pronouns their description states. If a description doesn't say, follow how the story refers to them, and when unsure use their name instead of a pronoun.
- Only report what the story actually shows. Most replies change nothing; then return {"changes": []}.
- Stages are whole numbers from 0 to max. A new effect usually starts at stage 1. Pick a max of 5 to 10 that fits how long it should take.
- Change a stage by 1 when an effect clearly advances or is resisted or treated.
- Overwhelming exposure jumps further: deliberately throwing oneself into the source (face pressed to the hypnotic screen, diving into the fire, downing the whole bottle), a massive dose, or a direct full-strength hit. Move 2 to 4 stages, or straight to the end if nothing could withstand it, and add "intense": true. A sudden, powerful cure or rescue can drop stages the same way.
- "effects" is one short sentence saying what the effect does at its current stage, written so a storyteller can play it.
- "target" is who it affects (a character name).
- Remove an effect only when the story clearly ends it.
- Refer to existing effects by their id.
- "icon" is one emoji for the effect, ideally from this list: ${ICONS.map(([e, h]) => `${e} ${h}`).join('; ')}.
- Follow out-of-character requests from the player (in ((double parentheses)) or marked OOC) to add, remove or change effects. For those, set any stage directly and add "ooc": true.
- If an effect involves words (mantras, commands, trigger words, intrusive thoughts, chants, whispers), end its "effects" sentence with up to 6 short ones in square brackets separated by semicolons, like [sleep; obey; deeper]. They will flash on screen.
- "visual" is the screen effect shown while it is active. Pick the closest from this list, or "none" if nothing fits:
${VISUALS.map(v => `  ${v.key}: ${v.hint}`).join('\n')}

ANSWER WITH JSON ONLY, in this shape:
{"changes": [
  {"op": "add", "name": "Hypnotic conditioning", "target": "Name", "stage": 1, "max": 8, "effects": "Feels drowsy and pliant when hearing the pendulum chime.", "visual": "spiral", "icon": "🌀", "note": "First session with the pendulum."},
  {"op": "update", "id": "e1", "stage": 3, "effects": "...", "note": "Why it changed."},
  {"op": "remove", "id": "e2", "note": "Why it ended."}
]}`;

let busy = false;
let checkingIndex = null;
let pending = null;
let armed = false;
let openId = null;
let editing = null;      // null, 'new' or an effect id
let confirmRemove = null;

// ---------- helpers ----------

function ctx() {
    return SillyTavern.getContext();
}

function settings() {
    const store = ctx().extensionSettings;
    if (store[MODULE] && 'layer' in store[MODULE]) delete store[MODULE].layer;
    if (!store[MODULE] || typeof store[MODULE] !== 'object') store[MODULE] = structuredClone(DEFAULTS);
    const s = store[MODULE];
    for (const [k, v] of Object.entries(DEFAULTS)) if (s[k] === undefined) s[k] = v;
    return s;
}

function saveSettings() {
    ctx().saveSettingsDebounced();
}

function toast(type, message, title) {
    globalThis.toastr?.[type]?.(message, title ?? 'Status effects');
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function text(value, limit) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function clampInt(value, min, max, fallback) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

function hasChat() {
    const c = ctx();
    return (c.characterId !== undefined && c.characterId !== null) || !!c.groupId;
}

function chatKey() {
    const c = ctx();
    return c.getCurrentChatId?.() ?? c.chatId ?? null;
}

function nextId(list) {
    let n = 0;
    for (const e of list) {
        const m = /^e(\d+)$/.exec(e.id ?? '');
        if (m) n = Math.max(n, Number(m[1]));
    }
    return `e${n + 1}`;
}

function pickVisual(requested, fallbackText) {
    if (requested === 'none') return 'none';
    if (isVisual(requested)) return requested;
    return guessVisual(fallbackText) ?? 'none';
}

// One emoji (or a couple of characters). Anything longer is ignored.
function cleanIcon(value) {
    const t = String(value ?? '').trim();
    if (!t || t === 'auto' || [...t].length > 4) return '';
    return t;
}

function iconOf(e) {
    return cleanIcon(e.icon) || ICON_FOR_VISUAL[visualOf(e)] || '⭐';
}

// The visual an effect shows. 'auto' or missing means guess from its text.
function visualOf(e) {
    if (e.visual === 'none') return null;
    if (isVisual(e.visual)) return e.visual;
    return guessVisual(`${e.name} ${e.effects}`);
}

// ---------- state ----------
// The effect list is saved on each message (message.extra.status_effects),
// so swiping or deleting a reply rolls the effects back with it.

function copyList(list) {
    return Array.isArray(list) ? structuredClone(list) : [];
}

// Each saved state is tagged with the exact swipe it belongs to, so a state
// written for one swipe is never read back for another.
const SWIPES_KEY = `${MODULE}_swipes`;
const TAG_KEY = `${MODULE}_tag`;

function swipeTag(msg) {
    const id = Number(msg?.swipe_id ?? 0);
    const date = msg?.swipe_info?.[id]?.send_date ?? msg?.send_date ?? '';
    return `${id}@${date}`;
}

// The state saved on this message for its current swipe, or null if this
// swipe has none (then the state carries over from earlier messages).
function ownState(msg) {
    const ex = msg?.extra;
    if (!ex) return null;
    const tag = swipeTag(msg);
    const map = ex[SWIPES_KEY];
    if (map && Array.isArray(map[tag])) return copyList(map[tag]);
    if (Array.isArray(ex[MODULE])) {
        if (ex[TAG_KEY] === tag) return copyList(ex[MODULE]);
        if (ex[TAG_KEY] === undefined && !map) return copyList(ex[MODULE]); // saved by an older version
    }
    return null;
}

function stateBefore(index) {
    const c = ctx();
    const chat = c.chat ?? [];
    for (let i = Math.min(index, chat.length) - 1; i >= 0; i--) {
        const saved = ownState(chat[i]);
        if (saved) return saved;
    }
    return copyList(c.chatMetadata?.[MODULE]);
}

function currentState() {
    return stateBefore((ctx().chat ?? []).length);
}

async function writeState(index, list) {
    const c = ctx();
    const msg = c.chat?.[index];
    if (!msg) {
        if (!hasChat()) return;
        c.chatMetadata[MODULE] = list;
        await c.saveMetadata();
        return;
    }
    const tag = swipeTag(msg);
    const put = (extra) => {
        const map = { ...(extra[SWIPES_KEY] ?? {}) };
        map[tag] = structuredClone(list);
        const keys = Object.keys(map);
        for (const k of keys.slice(0, Math.max(0, keys.length - 30))) delete map[k];
        extra[SWIPES_KEY] = map;
        extra[MODULE] = structuredClone(list);
        extra[TAG_KEY] = tag;
    };
    msg.extra ??= {};
    put(msg.extra);
    const swipe = Array.isArray(msg.swipe_info) ? msg.swipe_info[msg.swipe_id ?? 0] : null;
    if (swipe && typeof swipe === 'object') {
        swipe.extra ??= {};
        put(swipe.extra);
    }
    await (c.saveChat ?? c.saveChatConditional)?.();
}

async function saveManual(list) {
    await writeState((ctx().chat ?? []).length - 1, list);
    refresh();
}

// ---------- the AI check ----------

function cleanMessage(mes) {
    return String(mes ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2500);
}

// Who's who: the player's persona and the chat's character cards, shortened.
// Sent so effects are written about the right people with the right
// pronouns. Kept in the system message, which stays the same from check to
// check, so providers with prompt caching (like DeepSeek) charge little for it.
function shorten(text, limit) {
    const t = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (t.length <= limit) return t;
    const cut = t.slice(0, limit);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    return `${end > limit * 0.5 ? cut.slice(0, end + 1) : cut}…`;
}

function castBlock() {
    const c = ctx();
    if (!settings().sendCast) return '';
    const fill = (text, charName) => {
        const t = String(text ?? '');
        try {
            if (c.substituteParams) return c.substituteParams(t, c.name1, charName);
        } catch { /* fall back below */ }
        return t.replace(/{{user}}/gi, c.name1 ?? 'User').replace(/{{char}}/gi, charName ?? '');
    };
    const lines = [];
    const persona = c.powerUserSettings?.persona_description;
    if (c.name1) lines.push(`- ${c.name1} (the player): ${persona ? shorten(fill(persona, c.name2), 700) : 'no description'}`);
    const cards = [];
    if (c.groupId) {
        const group = c.groups?.find(g => g.id == c.groupId);
        for (const avatar of group?.members ?? []) {
            const ch = c.characters?.find(x => x.avatar === avatar);
            if (ch) cards.push(ch);
        }
    } else if (c.characterId !== undefined && c.characterId !== null) {
        const ch = c.characters?.[c.characterId];
        if (ch) cards.push(ch);
    }
    for (const ch of cards.slice(0, 6)) {
        lines.push(`- ${ch.name}: ${shorten(fill(ch.description || ch.data?.description || ch.personality, ch.name), cards.length > 2 ? 350 : 500) || 'no description'}`);
    }
    return lines.length ? `\n\nCAST (from the persona and character cards):\n${lines.join('\n')}` : '';
}

function buildCheck(index, before) {
    const c = ctx();
    const s = settings();
    const start = Math.max(0, index - s.contextMessages + 1);
    const lines = [];
    for (let i = start; i <= index; i++) {
        const m = c.chat[i];
        if (!m || m.is_system) continue;
        lines.push(`${m.name}: ${cleanMessage(m.mes)}`);
    }
    const current = before.length
        ? JSON.stringify(before.map(({ id, name, target, stage, max, effects }) => ({ id, name, target, stage, max, effects })))
        : '[] (none yet)';
    const user = `PLAYER CHARACTER: ${c.name1}\n\nCURRENT EFFECTS:\n${current}\n\nRECENT STORY (oldest first, the last message is the one to check):\n\n${lines.join('\n\n')}\n\nAnswer with the JSON now.`;
    return { system: CHECK_PROMPT + castBlock(), user };
}

async function askModel({ system, user }) {
    const c = ctx();
    const chatCompletion = (c.mainApi ?? 'openai') === 'openai';
    if (chatCompletion) {
        return await c.generateRaw({ prompt: [{ role: 'system', content: system }, { role: 'user', content: user }] });
    }
    return await c.generateRaw({ systemPrompt: system, prompt: user });
}

function parseAnswer(raw) {
    if (!raw) return null;
    const t = String(raw).replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '');
    const a = t.indexOf('{');
    const b = t.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    try {
        const parsed = JSON.parse(t.slice(a, b + 1));
        return Array.isArray(parsed?.changes) ? parsed : null;
    } catch {
        return null;
    }
}

function findEffect(list, change) {
    return list.find(e => e.id === change.id)
        ?? list.find(e => change.name && e.name.toLowerCase() === String(change.name).toLowerCase());
}

function applyChanges(before, changes, maxStep) {
    const list = copyList(before);
    const log = [];
    for (const ch of changes) {
        if (!ch || typeof ch !== 'object') continue;
        const op = String(ch.op ?? '').toLowerCase();
        if (op === 'add') {
            const name = text(ch.name, 60);
            if (!name) continue;
            if (list.some(e => e.name.toLowerCase() === name.toLowerCase())) continue;
            const max = clampInt(ch.max, 2, 20, 8);
            list.push({
                id: nextId(list),
                name,
                target: text(ch.target, 40),
                stage: clampInt(ch.stage, 0, max, 1),
                max,
                effects: text(ch.effects, 300),
                visual: pickVisual(ch.visual, `${name} ${ch.effects ?? ''}`),
                icon: cleanIcon(ch.icon),
                note: text(ch.note, 200),
            });
            log.push(`New: ${name}`);
        } else if (op === 'update') {
            const e = findEffect(list, ch);
            if (!e) continue;
            const oldStage = e.stage;
            if (ch.max !== undefined) e.max = clampInt(ch.max, 2, 20, e.max);
            if (ch.stage !== undefined) {
                let stage = clampInt(ch.stage, 0, e.max, e.stage);
                if (maxStep > 0 && !ch.ooc && !ch.intense) stage = Math.max(oldStage - maxStep, Math.min(oldStage + maxStep, stage));
                e.stage = stage;
            }
            e.stage = Math.min(e.stage, e.max);
            if (ch.effects) e.effects = text(ch.effects, 300);
            if (ch.visual && (isVisual(ch.visual) || ch.visual === 'none')) e.visual = ch.visual;
            if (cleanIcon(ch.icon)) e.icon = cleanIcon(ch.icon);
            if (ch.note) e.note = text(ch.note, 200);
            if (e.stage !== oldStage) log.push(`${e.name}: ${oldStage} → ${e.stage}/${e.max}${ch.intense && Math.abs(e.stage - oldStage) > 1 ? ' ⚡' : ''}`);
        } else if (op === 'remove') {
            const e = findEffect(list, ch);
            if (!e) continue;
            list.splice(list.indexOf(e), 1);
            log.push(`Ended: ${e.name}`);
        }
    }
    return { list, log };
}

async function runCheck(index, manual = false) {
    const s = settings();
    if (!s.enabled) return;
    if (busy) {
        pending = index;
        return;
    }
    const c = ctx();
    const msg = c.chat?.[index];
    if (!msg || msg.is_user || msg.is_system) {
        if (manual) toast('info', 'There is no character reply to check yet.');
        return;
    }
    const key = chatKey();
    busy = true;
    checkingIndex = index;
    renderPanel();
    renderFooters();
    try {
        const before = stateBefore(index);
        const raw = await askModel(buildCheck(index, before));
        if (chatKey() !== key || ctx().chat?.[index] !== msg) return; // chat changed meanwhile
        const answer = parseAnswer(raw);
        if (!answer) {
            await writeState(index, before);
            toast('warning', "Couldn't read the AI's answer, so nothing changed. Tap the refresh button in the panel to try again.");
            return;
        }
        const { list, log } = applyChanges(before, answer.changes, s.maxStep);
        await writeState(index, list);
        if (log.length && s.toasts) toast('info', log.join('<br>'));
        else if (manual && !log.length) toast('info', 'No changes.');
    } catch (err) {
        console.error('[Status Effects] check failed', err);
        toast('error', `Check failed: ${err?.message ?? err}`);
    } finally {
        busy = false;
        checkingIndex = null;
        refresh();
        if (pending !== null) {
            const p = pending;
            pending = null;
            runCheck(p);
        }
    }
}

// ---------- prompt injection ----------

function updateInjection(list) {
    const c = ctx();
    const s = settings();
    if (!s.enabled || !hasChat()) {
        c.setExtensionPrompt(PROMPT_KEY, '', IN_CHAT, 0);
        return;
    }
    let note = '[Status effects are tracked by a panel outside the chat. Never write tracker lines or stage numbers in the reply. Words in [brackets] are an effect\'s trigger words, mantras or intrusive thoughts.';
    if (list.length) {
        note += ' Currently active, play each at its stage when relevant:\n'
            + list.map(e => `- ${e.name}${e.target ? ` (on ${e.target})` : ''}: stage ${e.stage}/${e.max}. ${e.effects}`).join('\n');
    }
    note += ']';
    c.setExtensionPrompt(PROMPT_KEY, note, IN_CHAT, s.injectDepth, false, ROLE_SYSTEM);
}

// ---------- panel UI ----------

function buildPanel() {
    if (document.getElementById('sfx-root')) return;
    const root = document.createElement('div');
    root.id = 'sfx-root';
    root.innerHTML = `
        <button id="sfx-toggle" type="button" title="Status effects">
            <i class="fa-solid fa-wand-sparkles"></i><span id="sfx-count">0</span>
        </button>
        <div id="sfx-panel" hidden>
            <div class="sfx-head">
                <b>Status effects</b>
                <div class="sfx-head-buttons">
                    <button type="button" data-act="check" title="Check the last reply now"><i class="fa-solid fa-rotate"></i></button>
                    <button type="button" data-act="new" title="Add an effect"><i class="fa-solid fa-plus"></i></button>
                    <button type="button" data-act="close" title="Close"><i class="fa-solid fa-xmark"></i></button>
                </div>
            </div>
            <div id="sfx-list"></div>
        </div>`;
    document.body.appendChild(root);

    root.querySelector('#sfx-toggle').addEventListener('click', () => {
        const panel = root.querySelector('#sfx-panel');
        panel.hidden = !panel.hidden;
        renderPanel();
    });
    root.querySelector('#sfx-panel').addEventListener('click', onPanelClick);
}

function effectHtml(e) {
    const pct = e.max > 0 ? Math.round((e.stage / e.max) * 100) : 0;
    const open = openId === e.id;
    let html = `<div class="sfx-item${open ? ' sfx-open' : ''}" data-id="${escapeHtml(e.id)}">
        <button type="button" class="sfx-row" data-act="toggle">
            <span class="sfx-name"><span class="sfx-icon">${escapeHtml(iconOf(e))}</span> ${escapeHtml(e.name)}</span>
            <span class="sfx-stage">${e.stage}/${e.max}</span>
            <span class="sfx-bar"><span style="width:${pct}%"></span></span>
            ${e.target ? `<span class="sfx-target">${escapeHtml(e.target)}</span>` : ''}
            ${visualOf(e) ? `<span class="sfx-visual-tag"><i class="fa-solid fa-eye"></i> ${escapeHtml(visualLabel(visualOf(e)))}</span>` : ''}
        </button>`;
    if (open) {
        const sure = confirmRemove === e.id;
        html += `<div class="sfx-detail">
            ${e.effects ? `<div class="sfx-effects">${escapeHtml(e.effects)}</div>` : ''}
            ${e.note ? `<div class="sfx-note">Last change: ${escapeHtml(e.note)}</div>` : ''}
            <div class="sfx-actions">
                <button type="button" data-act="dec" title="Stage down">−</button>
                <button type="button" data-act="inc" title="Stage up">+</button>
                <button type="button" data-act="edit">Edit</button>
                <button type="button" data-act="remove" class="${sure ? 'sfx-danger' : ''}">${sure ? 'Tap again' : 'Remove'}</button>
            </div>
        </div>`;
    }
    return html + '</div>';
}

function visualOptions(selected) {
    const opts = [['auto', 'Automatic (from name)'], ['none', 'None'], ...VISUALS.map(v => [v.key, v.label])];
    return opts.map(([k, l]) => `<option value="${k}"${k === selected ? ' selected' : ''}>${escapeHtml(l)}</option>`).join('');
}

function formHtml(e) {
    const v = e ?? { name: '', target: ctx().name1 ?? '', stage: 1, max: 8, effects: '' };
    return `<div class="sfx-form" data-id="${escapeHtml(e?.id ?? 'new')}">
        <label>Name<input class="text_pole" name="name" value="${escapeHtml(v.name)}" maxlength="60"></label>
        <label>Affects<input class="text_pole" name="target" value="${escapeHtml(v.target)}" maxlength="40"></label>
        <div class="sfx-form-row">
            <label>Stage<input class="text_pole" name="stage" type="number" inputmode="numeric" min="0" max="20" value="${v.stage}"></label>
            <label>Out of<input class="text_pole" name="max" type="number" inputmode="numeric" min="2" max="20" value="${v.max}"></label>
        </div>
        <label>What it does now<textarea class="text_pole" name="effects" rows="3" maxlength="300">${escapeHtml(v.effects)}</textarea></label>
        <label>Screen effect<select class="text_pole" name="visual">${visualOptions(v.visual ?? 'auto')}</select></label>
        <div class="sfx-icon-pick">
            <span>Icon</span>
            <input type="hidden" name="icon" value="${escapeHtml(cleanIcon(v.icon) || 'auto')}">
            <div class="sfx-icon-grid">
                <button type="button" data-act="pick-icon" data-icon="auto" class="${cleanIcon(v.icon) ? '' : 'sfx-picked'}" title="Automatic">Auto</button>
                ${ICONS.map(([em, hint]) => `<button type="button" data-act="pick-icon" data-icon="${em}" title="${escapeHtml(hint)}" class="${cleanIcon(v.icon) === em ? 'sfx-picked' : ''}">${em}</button>`).join('')}
            </div>
        </div>
        <div class="sfx-actions">
            <button type="button" data-act="save">Save</button>
            <button type="button" data-act="cancel">Cancel</button>
        </div>
    </div>`;
}

function renderPanel() {
    const root = document.getElementById('sfx-root');
    if (!root) return;
    const s = settings();
    const show = s.enabled && hasChat();
    root.hidden = !show;
    root.classList.toggle('sfx-right', s.side === 'right');
    root.classList.toggle('sfx-busy', busy);
    if (!show) return;

    const list = currentState();
    root.querySelector('#sfx-count').textContent = String(list.length);
    const panel = root.querySelector('#sfx-panel');
    if (panel.hidden) return;

    const box = root.querySelector('#sfx-list');
    let html = '';
    if (editing === 'new') html += formHtml(null);
    for (const e of list) html += editing === e.id ? formHtml(e) : effectHtml(e);
    if (!list.length && editing !== 'new') {
        html += '<div class="sfx-empty">No active effects. They appear here when the story starts one, or tap + to add one.</div>';
    }
    if (busy) html += '<div class="sfx-empty"><i class="fa-solid fa-spinner fa-spin"></i> Checking the last reply…</div>';
    box.innerHTML = html;
}

async function onPanelClick(event) {
    const btn = event.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const item = btn.closest('[data-id]');
    const id = item?.dataset.id;
    const list = currentState();
    const effect = list.find(e => e.id === id);

    if (act === 'pick-icon') {
        const form = btn.closest('.sfx-form');
        form.querySelector('[name="icon"]').value = btn.dataset.icon;
        for (const b of form.querySelectorAll('[data-act="pick-icon"]')) b.classList.toggle('sfx-picked', b === btn);
        return;
    }
    if (act !== 'remove') confirmRemove = null;

    switch (act) {
        case 'close':
            document.getElementById('sfx-panel').hidden = true;
            break;
        case 'check': {
            const chat = ctx().chat ?? [];
            let i = chat.length - 1;
            while (i >= 0 && (chat[i].is_user || chat[i].is_system)) i--;
            if (i < 0) toast('info', 'There is no character reply to check yet.');
            else runCheck(i, true);
            break;
        }
        case 'new':
            editing = 'new';
            openId = null;
            break;
        case 'toggle':
            openId = openId === id ? null : id;
            editing = null;
            break;
        case 'inc':
        case 'dec':
            if (effect) {
                effect.stage = clampInt(effect.stage + (act === 'inc' ? 1 : -1), 0, effect.max, effect.stage);
                effect.note = 'Changed by hand.';
                await saveManual(list);
            }
            break;
        case 'edit':
            editing = id;
            break;
        case 'remove':
            if (confirmRemove !== id) {
                confirmRemove = id;
                break;
            }
            confirmRemove = null;
            openId = null;
            await saveManual(list.filter(e => e.id !== id));
            break;
        case 'cancel':
            editing = null;
            break;
        case 'save': {
            const form = btn.closest('.sfx-form');
            const val = n => form.querySelector(`[name="${n}"]`).value;
            const name = text(val('name'), 60);
            if (!name) {
                toast('warning', 'Give the effect a name.');
                return;
            }
            const max = clampInt(val('max'), 2, 20, 8);
            const fields = {
                name,
                target: text(val('target'), 40),
                stage: clampInt(val('stage'), 0, max, 1),
                max,
                effects: text(val('effects'), 300),
                visual: val('visual'),
                icon: cleanIcon(val('icon')),
                note: 'Changed by hand.',
            };
            if (id === 'new') {
                const added = { id: nextId(list), ...fields, note: 'Added by hand.' };
                list.push(added);
                openId = added.id;
            } else if (effect) {
                Object.assign(effect, fields);
                openId = effect.id;
            }
            editing = null;
            await saveManual(list);
            break;
        }
    }
    renderPanel();
}

let preview = null; // { key, i } while previewing from settings

const SAMPLE_WORDS = ['sleep', 'deeper', 'relax', 'obey', 'good', 'listen'];

// Words in [a; b; c] lists inside an effect's description.
function wordsOf(e) {
    const out = [];
    for (const m of String(e.effects ?? '').matchAll(/\[([^\]]+)\]/g)) {
        for (const w of m[1].split(';')) {
            const t = w.trim().slice(0, 40);
            if (t) out.push(t);
        }
    }
    return out;
}

function updateVisuals() {
    const s = settings();
    const best = new Map();
    let words = [];
    let wordsI = 0;
    if (s.enabled && s.visuals && hasChat()) {
        for (const e of currentState()) {
            const key = visualOf(e);
            const i = e.max > 0 ? e.stage / e.max : 0;
            if (key && i > 0) best.set(key, Math.max(best.get(key) ?? 0, i));
            const ws = wordsOf(e);
            if (ws.length && i > 0) {
                words.push(...ws);
                wordsI = Math.max(wordsI, i);
            }
        }
    }
    if (preview?.key === '__words') {
        words = SAMPLE_WORDS;
        wordsI = preview.i;
    } else if (preview) {
        best.set(preview.key, preview.i);
    }
    words = [...new Set(words)].slice(0, 24);
    const active = [...best].map(([key, i]) => ({ key, i }));
    if (preview) active.sort((a, b) => (b.key === preview.key) - (a.key === preview.key));
    renderVisuals(active, { strength: s.visualStrength / 100, animate: s.animate, placement: s.placement, words, wordsI, vibrate: s.ringVibrate });
}

// ---------- portrait badges ----------

function sameName(a, b) {
    const x = String(a ?? '').trim().toLowerCase();
    const y = String(b ?? '').trim().toLowerCase();
    if (!x || !y) return false;
    return x === y || x.split(/\s+/)[0] === y.split(/\s+/)[0];
}

// Shows the active effects' icons on the latest message portrait of each affected character.
function renderBadges() {
    const chatEl = document.getElementById('chat');
    if (!chatEl) return;
    const s = settings();
    const list = s.enabled && s.badges && hasChat() ? currentState().filter(e => e.stage > 0 && e.target) : [];
    const messages = [...chatEl.querySelectorAll('.mes')];
    const latest = new Map(); // name -> last .mes element
    for (const mes of messages) {
        const name = mes.getAttribute('ch_name');
        if (name) latest.set(name.trim().toLowerCase(), mes);
    }
    const wanted = new Map(); // .mes -> effects
    for (const [name, mes] of latest) {
        const effects = list.filter(e => sameName(e.target, name));
        if (effects.length) wanted.set(mes, effects);
    }
    for (const mes of messages) {
        const effects = wanted.get(mes);
        let box = mes.querySelector('.sfx-badges');
        if (!effects) {
            box?.remove();
            continue;
        }
        const host = mes.querySelector('.mesAvatarWrapper') ?? mes.querySelector('.avatar')?.parentElement;
        if (!host) continue;
        if (!box) {
            box = document.createElement('div');
            box.className = 'sfx-badges';
            host.classList.add('sfx-badge-host');
            host.appendChild(box);
        }
        const sig = effects.map(e => `${e.id}:${iconOf(e)}:${e.stage}/${e.max}`).join('|');
        if (box.dataset.sig === sig) continue;
        box.dataset.sig = sig;
        const shown = effects.slice(0, 3).map(e => {
            const pct = e.max > 0 ? Math.round((e.stage / e.max) * 100) : 0;
            return `<button type="button" class="sfx-badge" data-sfx-id="${escapeHtml(e.id)}" title="${escapeHtml(`${e.name} · ${e.stage}/${e.max}`)}" style="--p:${pct}%">${escapeHtml(iconOf(e))}</button>`;
        });
        if (effects.length > 3) shown.push(`<button type="button" class="sfx-badge sfx-badge-more" data-sfx-id="">+${effects.length - 3}</button>`);
        box.innerHTML = shown.join('');
    }
}

// What changed on each message: a small strip under the message text.
function diffStates(before, after) {
    const out = [];
    const old = new Map(before.map(e => [e.id, e]));
    for (const e of after) {
        const b = old.get(e.id);
        if (!b) out.push({ kind: 'add', e, to: e.stage });
        else if (b.stage !== e.stage) out.push({ kind: e.stage > b.stage ? 'up' : 'down', e, from: b.stage, to: e.stage });
        else if (b.effects !== e.effects || iconOf(b) !== iconOf(e)) out.push({ kind: 'edit', e, to: e.stage });
        old.delete(e.id);
    }
    for (const b of old.values()) out.push({ kind: 'end', e: b });
    return out;
}

function chipHtml(d) {
    const e = d.e;
    const pct = e.max > 0 ? Math.round(((d.to ?? e.stage) / e.max) * 100) : 0;
    const icon = escapeHtml(iconOf(e));
    const name = escapeHtml(e.name);
    let tail = '';
    if (d.kind === 'add') tail = `<b>new · ${d.to}/${e.max}</b>`;
    else if (d.kind === 'up' || d.kind === 'down') tail = `<b>${d.from} → ${d.to}/${e.max}</b>${Math.abs(d.to - d.from) > 1 ? ' ⚡' : ''}`;
    else if (d.kind === 'edit') tail = '<b>changed</b>';
    else tail = '<b>ended</b>';
    const bar = d.kind === 'end' ? '' : `<i class="sfx-chip-bar" style="--p:${pct}%"></i>`;
    return `<button type="button" class="sfx-chip sfx-chip-${d.kind}" data-sfx-id="${d.kind === 'end' ? '' : escapeHtml(e.id)}">${icon} ${name} ${tail}${bar}</button>`;
}

function renderFooters() {
    const chatEl = document.getElementById('chat');
    if (!chatEl) return;
    const s = settings();
    const chat = ctx().chat ?? [];
    const on = s.enabled && s.footers && hasChat();
    let lastAi = chat.length - 1;
    while (lastAi >= 0 && (chat[lastAi]?.is_user || chat[lastAi]?.is_system)) lastAi--;

    for (const mes of chatEl.querySelectorAll('.mes')) {
        const index = Number(mes.getAttribute('mesid'));
        const msg = Number.isInteger(index) ? chat[index] : null;
        let html = '';
        if (on && msg) {
            if (index === checkingIndex) {
                html = '<span class="sfx-chip sfx-chip-wait"><i class="fa-solid fa-spinner fa-spin"></i> Checking status effects…</span>';
            } else {
                const own = ownState(msg);
                if (own) {
                    const chips = diffStates(stateBefore(index), own).map(chipHtml);
                    html = chips.join('');
                }
                if (index === lastAi && !msg.is_user) {
                    html += `<button type="button" class="sfx-chip sfx-chip-recheck" data-sfx-act="recheck" title="Check this reply again">↻</button>`;
                }
            }
        }
        let foot = mes.querySelector('.sfx-footer');
        if (!html) {
            foot?.remove();
            continue;
        }
        if (!foot) {
            foot = document.createElement('div');
            foot.className = 'sfx-footer';
            (mes.querySelector('.mes_block') ?? mes).appendChild(foot);
        }
        if (foot.dataset.sig !== html) {
            foot.dataset.sig = html;
            foot.innerHTML = html;
        }
    }
}

function openEffect(id) {
    const panel = document.getElementById('sfx-panel');
    if (!panel) return;
    panel.hidden = false;
    openId = id || null;
    editing = null;
    renderPanel();
}

let badgeTimer = null;
function watchChat() {
    const chatEl = document.getElementById('chat');
    if (!chatEl || chatEl.dataset.sfxWatched) return;
    chatEl.dataset.sfxWatched = '1';
    new MutationObserver(() => {
        clearTimeout(badgeTimer);
        badgeTimer = setTimeout(() => {
            renderBadges();
            renderFooters();
        }, 120);
    }).observe(chatEl, { childList: true });
}

// Lets other extensions (like Scene Backdrop) read the active effects.
globalThis.SillyStatus = {
    version: VERSION,
    getEffects: () => (settings().enabled && hasChat() ? currentState() : []),
};

function refresh() {
    queueMicrotask(() => document.dispatchEvent(new CustomEvent('sillystatus:changed')));
    watchChat();
    renderBadges();
    renderFooters();
    renderPanel();
    if (hasChat()) updateInjection(currentState());
    else updateInjection([]);
    updateVisuals();
}

// ---------- diagnostics ----------

async function diagnose() {
    const s = settings();
    const lines = [];
    let manifestVersion = '?';
    try {
        const res = await fetch(new URL('./manifest.json', import.meta.url), { cache: 'no-store' });
        manifestVersion = (await res.json()).version;
    } catch (err) {
        manifestVersion = `error: ${err.message}`;
    }
    lines.push(`code ${VERSION} / visuals ${VISUALS_VERSION ?? 'old'} / installed ${manifestVersion}`);
    lines.push(`enabled ${s.enabled}, visuals ${s.visuals}, placement ${s.placement}, strength ${s.visualStrength}%, animate ${s.animate}, chat tint ${tintInfo()}`);
    lines.push(`preview ${preview ? `${preview.key} ${preview.i}` : 'off'}, chat open ${hasChat()}`);
    for (const id of ['sfx-fx-under', 'sfx-fx-root']) {
        const r = document.getElementById(id);
        if (!r) { lines.push(`${id}: not created yet`); continue; }
        const cs = getComputedStyle(r);
        const b = r.getBoundingClientRect();
        lines.push(`${id}: z ${cs.zIndex}, size ${Math.round(b.width)}x${Math.round(b.height)}, layers ${r.querySelectorAll('.sfx-fx').length}`);
    }
    const root = document.getElementById('sfx-fx-root') ?? document.getElementById('sfx-fx-under');
    if (!root) {
        lines.push('effect layer: missing');
    } else {
        const cs = getComputedStyle(root);
        const r = root.getBoundingClientRect();
        lines.push(`effect layer: display ${cs.display}, z ${cs.zIndex}, opacity ${cs.opacity}, size ${Math.round(r.width)}x${Math.round(r.height)}, class "${root.className}"`);
        for (const el of root.querySelectorAll('.sfx-fx')) {
            const before = getComputedStyle(el, '::before');
            lines.push(`  ${el.className.replace('sfx-fx ', '')}: opacity ${getComputedStyle(el).opacity}, before ${before.backgroundImage === 'none' ? 'no image' : 'has image'} ${before.animationName}`);
        }
        root.style.pointerEvents = 'auto';
        const hit = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
        root.style.pointerEvents = '';
        const name = el => el ? `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}` : 'nothing';
        lines.push(`on top at screen centre: ${name(hit)}`);
        let el = hit;
        const chain = [];
        while (el && el !== document.body && chain.length < 6) {
            const z = getComputedStyle(el).zIndex;
            if (z !== 'auto') chain.push(`${name(el)} z${z}`);
            el = el.parentElement;
        }
        if (chain.length) lines.push(`  stacking: ${chain.join(' < ')}`);
    }
    return lines.join('\n');
}

// ---------- settings UI ----------

function buildSettings() {
    const host = document.getElementById('extensions_settings2') ?? document.getElementById('extensions_settings');
    if (!host || document.getElementById('sfx-settings')) return;
    const s = settings();
    const wrap = document.createElement('div');
    wrap.id = 'sfx-settings';
    wrap.innerHTML = `
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>Status Effects <small>v${VERSION}</small></b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <label class="checkbox_label"><input type="checkbox" data-key="enabled"> Enabled</label>
                <label class="checkbox_label"><input type="checkbox" data-key="autoCheck"> Check automatically after each reply</label>
                <label class="checkbox_label"><input type="checkbox" data-key="badges"> Show status icons on portraits</label>
                <label class="checkbox_label"><input type="checkbox" data-key="footers"> Show changes under each message</label>
                <label class="checkbox_label"><input type="checkbox" data-key="toasts"> Also show changes as pop-ups</label>
                <label class="checkbox_label"><input type="checkbox" data-key="sendCast"> Send persona and character descriptions to the check (for correct names and pronouns)</label>
                <label>Messages the check reads <input class="text_pole" type="number" min="2" max="20" data-key="contextMessages"></label>
                <label>Max stage change per reply (0 = no limit) <input class="text_pole" type="number" min="0" max="10" data-key="maxStep"></label>
                <label>Reminder depth in chat <input class="text_pole" type="number" min="0" max="10" data-key="injectDepth"></label>
                <label>Button side
                    <select class="text_pole" data-key="side">
                        <option value="left">Left</option>
                        <option value="right">Right</option>
                    </select>
                </label>
                <small>The automatic check is one extra short AI request per character reply, using your current connection.</small>
                <hr>
                <label class="checkbox_label"><input type="checkbox" data-key="visuals"> Screen effects behind the chat</label>
                <label class="checkbox_label"><input type="checkbox" data-key="animate"> Animate screen effects</label>
                <label class="checkbox_label"><input type="checkbox" data-key="ringVibrate"> Short vibration on each ring pulse (phones)</label>
                <label>Where screen effects go
                    <select class="text_pole" data-key="placement">
                        <option value="auto">Each effect's best spot (recommended)</option>
                        <option value="under">All under the messages</option>
                        <option value="over">All over the messages</option>
                    </select>
                </label>
                <label>Screen effect strength <span id="sfx-strength-val"></span>
                    <input type="range" min="0" max="200" step="10" data-key="visualStrength">
                </label>
                <div class="sfx-preview">
                    <b>Preview</b>
                    <small>Tap Show, then close this panel to see it.</small>
                    <select class="text_pole" id="sfx-preview-key">${VISUALS.map(v => `<option value="${v.key}">${escapeHtml(v.label)}</option>`).join('')}<option value="__words">Flashing words (sample)</option></select>
                    <small>Words flash for any effect whose description has a list like [sleep; obey; deeper]. Preview words and the ring together by adding the words to an effect.</small>
                    <label>Intensity <input type="range" min="0.1" max="1" step="0.1" value="0.6" id="sfx-preview-i"></label>
                    <div class="sfx-actions">
                        <button type="button" class="menu_button" id="sfx-preview-go">Show</button>
                        <button type="button" class="menu_button" id="sfx-preview-stop">Stop</button>
                        <button type="button" class="menu_button" id="sfx-diagnose">Diagnose</button>
                    </div>
                    <pre id="sfx-diag" class="sfx-diag" hidden></pre>
                </div>
            </div>
        </div>`;
    host.appendChild(wrap);

    for (const input of wrap.querySelectorAll('[data-key]')) {
        const key = input.dataset.key;
        if (input.type === 'checkbox') input.checked = !!s[key];
        else input.value = s[key];
        const onChange = () => {
            if (input.type === 'checkbox') s[key] = input.checked;
            else if (input.type === 'number' || input.type === 'range') s[key] = clampInt(input.value, Number(input.min), Number(input.max), DEFAULTS[key]);
            else s[key] = input.value;
            if (input.type === 'number') input.value = s[key];
            showStrength();
            saveSettings();
            refresh();
        };
        input.addEventListener(input.type === 'range' ? 'input' : 'change', onChange);
    }

    const showStrength = () => { wrap.querySelector('#sfx-strength-val').textContent = `${s.visualStrength}%`; };
    showStrength();

    const startPreview = () => {
        preview = { key: wrap.querySelector('#sfx-preview-key').value, i: Number(wrap.querySelector('#sfx-preview-i').value) };
        updateVisuals();
    };
    wrap.querySelector('#sfx-preview-go').addEventListener('click', startPreview);
    wrap.querySelector('#sfx-preview-key').addEventListener('change', () => preview && startPreview());
    wrap.querySelector('#sfx-preview-i').addEventListener('input', () => preview && startPreview());
    wrap.querySelector('#sfx-diagnose').addEventListener('click', async () => {
        const out = wrap.querySelector('#sfx-diag');
        out.hidden = false;
        out.textContent = await diagnose();
    });
    wrap.querySelector('#sfx-preview-stop').addEventListener('click', () => {
        preview = null;
        updateVisuals();
    });
}

// ---------- events ----------

function wireEvents() {
    const { eventSource, event_types: ev } = ctx();

    eventSource.on(ev.CHAT_CHANGED, () => {
        openId = null;
        editing = null;
        confirmRemove = null;
        pending = null;
        armed = false;
        refresh();
    });

    eventSource.on(ev.GENERATION_STARTED, (type, _options, dryRun) => {
        if (dryRun || type === 'quiet' || type === 'impersonate') return;
        armed = true;
        // When swiping or continuing, the effects should be the ones from
        // before the reply that is being replaced.
        if (type === 'swipe' || type === 'continue') {
            const chat = ctx().chat ?? [];
            updateInjection(stateBefore(chat.length - 1));
        }
    });

    eventSource.on(ev.GENERATION_STOPPED, () => {
        armed = false;
    });

    eventSource.on(ev.CHARACTER_MESSAGE_RENDERED, (messageId) => {
        const index = Number(messageId);
        const chat = ctx().chat ?? [];
        const shouldCheck = armed && index === chat.length - 1;
        armed = false;
        refresh();
        const s = settings();
        if (shouldCheck && s.enabled && s.autoCheck) runCheck(index);
    });

    for (const name of ['MESSAGE_SWIPED', 'MESSAGE_DELETED', 'MESSAGE_EDITED']) {
        if (ev[name]) eventSource.on(ev[name], () => refresh());
    }
}

// Tapping a badge opens that effect in the panel (and not the avatar zoom).
document.addEventListener('click', (event) => {
    const el = event.target.closest?.('.sfx-badge, .sfx-chip');
    if (!el) return;
    event.preventDefault();
    event.stopPropagation();
    if (el.dataset.sfxAct === 'recheck') {
        const mes = el.closest('.mes');
        const index = Number(mes?.getAttribute('mesid'));
        if (Number.isInteger(index)) runCheck(index, true);
        return;
    }
    if (el.classList.contains('sfx-chip-wait')) return;
    openEffect(el.dataset.sfxId);
}, true);

jQuery(() => {
    try {
        settings();
        buildPanel();
        buildSettings();
        wireEvents();
        refresh();
    } catch (err) {
        console.error('[Status Effects] failed to start', err);
    }
});
