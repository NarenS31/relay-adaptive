import { AccessibilityPriorityEngine } from '../services/accessibility-priority-engine.js';
import { normalizeAccessibilityProfile } from '../services/accessibility-profile.js';

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export class AccessibilityPriorityController {
    constructor(options = {}) {
        this.eventBus = options.eventBus || null;
        this.appStore = options.appStore || null;
        this.container = options.container || document.body;
        this.getSettings = typeof options.getSettings === 'function' ? options.getSettings : () => ({});
        this.getMode = typeof options.getMode === 'function' ? options.getMode : () => 'deaf';
        this.blindMode = options.blindMode || null;
        this.engine = new AccessibilityPriorityEngine({ electronAPI: options.electronAPI || null });
        this.items = [];
        this.lastKey = '';
        this.panel = null;
        this.listEl = null;
        this.enabled = true;
    }

    init() {
        this.#createPanel();
        this.#bind('transcript.final', async (result) => {
            await this.#rankAndRender({
                type: 'transcript',
                text: result?.transcript || '',
                title: 'Important speech detected'
            });
        });
        this.#bind('sound.detected', async (event) => {
            await this.#rankAndRender({
                type: 'sound',
                category: event?.category,
                label: event?.label || event?.className || 'Detected sound',
                text: event?.label || event?.className || ''
            });
        });
        this.#bind('meeting.started', async (detail) => {
            await this.#rankAndRender({
                type: 'meeting',
                title: 'Meeting started',
                text: `${detail?.appInfo?.name || 'Meeting app'} is active`
            });
        });
        this.#bind('context.updated', async (detail) => {
            if (!detail?.appName) return;
            await this.#rankAndRender({
                type: 'screen',
                title: 'App context changed',
                text: `${detail.appName} is now active`
            });
        });
    }

    #bind(eventName, handler) {
        this.eventBus?.on?.(eventName, handler);
    }

    #createPanel() {
        const panel = document.createElement('div');
        panel.id = 'priority-feed';
        panel.style.cssText = `
            position: fixed;
            left: 18px;
            top: 74px;
            width: min(360px, calc(100vw - 36px));
            display: flex;
            flex-direction: column;
            gap: 10px;
            z-index: 450;
            pointer-events: none;
        `;

        const list = document.createElement('div');
        list.style.cssText = 'display:flex;flex-direction:column;gap:10px;';
        panel.appendChild(list);
        this.container.appendChild(panel);
        this.panel = panel;
        this.listEl = list;
    }

    async #rankAndRender(payload) {
        const settings = this.getSettings() || {};
        this.enabled = settings.priorityEngineEnabled !== false;
        if (!this.enabled) {
            this.#render();
            return;
        }

        const profile = normalizeAccessibilityProfile(settings.accessibilityPriorityProfile || {});
        const scored = await this.engine.scoreEvent(payload, {
            profile,
            mode: this.getMode(),
            settings
        });

        const dedupeKey = `${scored.type}:${scored.title}:${scored.summary}`.toLowerCase();
        if (dedupeKey === this.lastKey) return;
        this.lastKey = dedupeKey;

        this.items = [scored, ...this.items]
            .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
            .slice(0, 4);
        this.appStore?.setState?.({
            priorityFeed: this.items
        });

        const threshold = Number(settings.priorityInterruptThreshold || 8);
        if (this.getMode() === 'blind' && scored.score >= threshold && scored.delivery.includes('tts')) {
            this.blindMode?.speak?.(`${scored.title}. ${scored.summary}`, 'critical');
        }

        this.#render();
    }

    #render() {
        if (!this.listEl) return;
        this.listEl.innerHTML = '';

        if (!this.enabled || this.items.length === 0) {
            this.panel.style.display = 'none';
            return;
        }

        this.panel.style.display = 'flex';

        this.items.forEach((item) => {
            const card = document.createElement('div');
            const accent = item.priority === 'critical'
                ? '#ff453a'
                : item.priority === 'high'
                    ? '#ff9f0a'
                    : item.priority === 'medium'
                        ? '#30b0c7'
                        : '#6e6e73';
            card.style.cssText = `
                pointer-events: auto;
                background: rgba(15, 17, 23, 0.88);
                border: 1px solid rgba(255,255,255,0.1);
                border-left: 4px solid ${accent};
                border-radius: 14px;
                padding: 12px 14px;
                color: #f5f5f7;
                box-shadow: 0 14px 40px rgba(0,0,0,0.28);
                backdrop-filter: blur(18px);
                -webkit-backdrop-filter: blur(18px);
            `;
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;">
                    <div style="font-size:13px;font-weight:700;line-height:1.35;">${escapeHtml(item.title)}</div>
                    <div style="font-size:11px;font-weight:700;color:${accent};text-transform:uppercase;">${escapeHtml(item.priority)} ${escapeHtml(String(item.score))}</div>
                </div>
                <div style="margin-top:6px;font-size:13px;line-height:1.45;opacity:0.96;">${escapeHtml(item.summary)}</div>
                <div style="margin-top:8px;font-size:11px;line-height:1.35;opacity:0.66;">Why highlighted: ${escapeHtml(item.reason)}</div>
            `;
            this.listEl.appendChild(card);
        });
    }
}

export default AccessibilityPriorityController;
