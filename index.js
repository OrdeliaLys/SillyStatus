// Status Effects for SillyTavern
// A small floating panel that tracks ongoing effects (hypnosis, training,
// transformations, curses, injuries...) with stages and progress bars.
// After each character reply, a short extra AI call checks whether any
// effect started, changed or ended. The current effects are also sent to
// the AI with every prompt so it can play them at the right stage.

import { VISUALS, VISUALS_VERSION, isVisual, visualLabel, guessVisual, renderVisuals } from './visuals.js';

const VERSION = '1.2.2';

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
    layer: 'over',
};

const CHECK_PROMPT = `You keep the status-effect tracker for an ongoing roleplay. You read the newest part of the story and report which tracked effects started, changed or ended. You never write story text.

WHAT COUNTS AS AN EFFECT
Lasting conditions that build, fade or matter later: hypnosis, mind control, conditioning, training, transformations, curses, corruption, possession, addictions, injuries, illnesses, buffs and debuffs, magical marks, bonds, lasting fear or trust. Not single actions, passing moods or things that are over within the scene.

RULES
- Only report what the story actually shows. Most replies change nothing; then return {"changes": []}.
- Stages are whole numbers from 0 to max. A new effect usually starts at stage 1. Pick a max of 5 to 10 that fits how long it should take.
- Change a stage by 1 when an effect clearly advances or is resisted or treated. Bigger jumps only for overwhelming events.
- "effects" is one short sentence saying what the effect does at its current stage, written so a storyteller can play it.
- "target" is who it affects (a character name).
- Remove an effect only when the story clearly ends it.
- Refer to existing effects by their id.
- "visual" is the screen effect shown while it is active. Pick the closest from this list, or "none" if nothing fits:
${VISUALS.map(v => `  ${v.key}: ${v.hint}`).join('\n')}

ANSWER WITH JSON ONLY, in this shape:
{"changes": [
  {"op": "add", "name": "Hypnotic conditioning", "target": "Name", "stage": 1, "max": 8, "effects": "Feels drowsy and pliant when hearing the pendulum chime.", "visual": "spiral", "note": "First session with the pendulum."},
  {"op": "update", "id": "e1", "stage": 3, "effects": "...", "note": "Why it changed."},
  {"op": "remove", "id": "e2", "note": "Why it ended."}
]}`;

let busy = false;
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

function stateBefore(index) {
    const c = ctx();
    const chat = c.chat ?? [];
    for (let i = Math.min(index, chat.length) - 1; i >= 0; i--) {
        const saved = chat[i]?.extra?.[MODULE];
        if (Array.isArray(saved)) return copyList(saved);
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
    msg.extra ??= {};
    msg.extra[MODULE] = list;
    const swipe = Array.isArray(msg.swipe_info) ? msg.swipe_info[msg.swipe_id ?? 0] : null;
    if (swipe && typeof swipe === 'object') {
        swipe.extra ??= {};
        swipe.extra[MODULE] = structuredClone(list);
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
    return { system: CHECK_PROMPT, user };
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
                if (maxStep > 0) stage = Math.max(oldStage - maxStep, Math.min(oldStage + maxStep, stage));
                e.stage = stage;
            }
            e.stage = Math.min(e.stage, e.max);
            if (ch.effects) e.effects = text(ch.effects, 300);
            if (ch.visual && (isVisual(ch.visual) || ch.visual === 'none')) e.visual = ch.visual;
            if (ch.note) e.note = text(ch.note, 200);
            if (e.stage !== oldStage) log.push(`${e.name}: ${oldStage} → ${e.stage}/${e.max}`);
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
    renderPanel();
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
        if (log.length) toast('info', log.join('<br>'));
        else if (manual) toast('info', 'No changes.');
    } catch (err) {
        console.error('[Status Effects] check failed', err);
        toast('error', `Check failed: ${err?.message ?? err}`);
    } finally {
        busy = false;
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
    let note = '[Status effects are tracked by a panel outside the chat. Never write tracker lines or stage numbers in the reply.';
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
            <span class="sfx-name">${escapeHtml(e.name)}</span>
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

function updateVisuals() {
    const s = settings();
    const best = new Map();
    if (s.enabled && s.visuals && hasChat()) {
        for (const e of currentState()) {
            const key = visualOf(e);
            const i = e.max > 0 ? e.stage / e.max : 0;
            if (key && i > 0) best.set(key, Math.max(best.get(key) ?? 0, i));
        }
    }
    if (preview) best.set(preview.key, preview.i);
    const active = [...best].map(([key, i]) => ({ key, i }));
    if (preview) active.sort((a, b) => (b.key === preview.key) - (a.key === preview.key));
    renderVisuals(active, { strength: s.visualStrength / 100, animate: s.animate, over: s.layer !== 'behind' });
}

function refresh() {
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
    lines.push(`enabled ${s.enabled}, visuals ${s.visuals}, layer ${s.layer}, strength ${s.visualStrength}%, animate ${s.animate}`);
    lines.push(`preview ${preview ? `${preview.key} ${preview.i}` : 'off'}, chat open ${hasChat()}`);
    const root = document.getElementById('sfx-fx-root');
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
                <label>Draw screen effects
                    <select class="text_pole" data-key="layer">
                        <option value="over">Over the chat (always visible)</option>
                        <option value="behind">Behind the chat (needs a see-through chat background)</option>
                    </select>
                </label>
                <label>Screen effect strength <span id="sfx-strength-val"></span>
                    <input type="range" min="0" max="200" step="10" data-key="visualStrength">
                </label>
                <div class="sfx-preview">
                    <b>Preview</b>
                    <small>Tap Show, then close this panel to see it.</small>
                    <select class="text_pole" id="sfx-preview-key">${VISUALS.map(v => `<option value="${v.key}">${escapeHtml(v.label)}</option>`).join('')}</select>
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
