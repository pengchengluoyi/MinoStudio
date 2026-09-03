// public/recorder-preload.js

console.log('🚀 [Recorder] Preload script active for:', window.location.href);

// ==========================================
// 1. 通信核心
// ==========================================
let safeIpc = null;
try {
    const electron = require('electron');
    safeIpc = electron.ipcRenderer;
} catch (e) { /* ignore */ }

function sendToHost(channel, data) {
    const payload = { type: channel, ...data, timestamp: Date.now() };
    if (window.electronAPI && window.electronAPI.sendToHost) {
        window.electronAPI.sendToHost(channel, payload);
    } else if (safeIpc) {
        safeIpc.sendToHost(channel, payload);
    }
}

function report(type, data) {
    // console.log(`[Recorder] 📡 ${type}`, data); // 调试可开
    sendToHost('recorder-event', { type, ...data });
}

// ==========================================
// 2. XPath 算法
// ==========================================
function isUniqueId(id) {
    if (!id) return false;
    try {
        return document.querySelectorAll(`[id="${id}"]`).length === 1;
    } catch (e) { return false; }
}

function getOptimizedXPath(element) {
    if (element.id && isUniqueId(element.id)) return `//*[@id="${element.id}"]`;
    if (element === document.body) return '/html/body';

    let ix = 0;
    const siblings = element.parentNode ? element.parentNode.childNodes : [];
    for (let i = 0; i < siblings.length; i++) {
        const sibling = siblings[i];
        if (sibling === element) {
            const tagName = element.tagName.toLowerCase();
            const parentXPath = getOptimizedXPath(element.parentNode);
            return `${parentXPath}/${tagName}[${ix + 1}]`;
        }
        if (sibling.nodeType === 1 && sibling.tagName === element.tagName) ix++;
    }
    return '';
}

// ==========================================
// 3. UI 注入与操作 (核心修复：支持页面跳转)
// ==========================================

// 检查并注入 UI (幂等操作：如果没有就注入，有了就跳过)
function ensureUI() {
    // 1. 如果页面还没有 body，没法注入，等下次
    if (!document.body) return false;

    // 2. 如果已经存在，直接返回 true
    if (document.getElementById('recorder-inspector-overlay')) return true;

    console.log('🎨 [Recorder] UI missing, injecting now...');

    // 3. 创建样式
    if (!document.getElementById('recorder-ui-styles')) {
        const style = document.createElement('style');
        style.id = 'recorder-ui-styles';
        style.innerHTML = `
            #recorder-inspector-overlay {
                position: fixed; z-index: 2147483647; pointer-events: none;
                background-color: rgba(100, 149, 237, 0.3);
                border: 1px solid #4a90e2;
                display: none; box-sizing: border-box;
                transition: all 0.05s ease;
            }
            #recorder-click-flash {
                position: fixed; z-index: 2147483647; pointer-events: none;
                border: 2px solid red; background-color: rgba(255, 0, 0, 0.2);
                display: none; box-sizing: border-box; transition: opacity 0.3s ease;
            }
            #recorder-inspector-tooltip {
                position: fixed; z-index: 2147483647; pointer-events: none;
                background: rgba(255, 255, 255, 0.98); border: 1px solid #ddd;
                border-radius: 4px; padding: 6px 10px;
                box-shadow: 0 4px 10px rgba(0,0,0,0.15);
                font-family: Consolas, monospace; font-size: 12px; color: #333;
                display: none; white-space: nowrap;
            }
            .inspector-tag { color: #881280; font-weight: bold; }
            .inspector-id { color: #1a1aa6; }
            .inspector-class { color: #1a1aa6; }
            .inspector-size { color: #666; font-size: 11px; margin-left: 8px; }
        `;
        document.head.appendChild(style);
    }

    // 4. 创建 DOM 元素
    const overlay = document.createElement('div');
    overlay.id = 'recorder-inspector-overlay';

    const flash = document.createElement('div');
    flash.id = 'recorder-click-flash';

    const tooltip = document.createElement('div');
    tooltip.id = 'recorder-inspector-tooltip';

    document.body.appendChild(overlay);
    document.body.appendChild(flash);
    document.body.appendChild(tooltip);

    return true;
}

// 尝试初始化 (在加载阶段)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureUI);
} else {
    ensureUI();
}

// 高亮函数
function highlightInspector(target) {
    // 🔥🔥🔥 核心修复：每次高亮前，先检查 UI 还在不在 🔥🔥🔥
    // 如果页面刚跳转，body 被重置了，这里会重新注入 UI
    if (!ensureUI()) return;

    const overlay = document.getElementById('recorder-inspector-overlay');
    const tooltip = document.getElementById('recorder-inspector-tooltip');

    if (!target || target === document.body || target === document.documentElement || target.id.startsWith('recorder-')) {
        if(overlay) overlay.style.display = 'none';
        if(tooltip) tooltip.style.display = 'none';
        return;
    }

    const rect = target.getBoundingClientRect();

    // 更新遮罩
    overlay.style.display = 'block';
    overlay.style.top = `${rect.top}px`;
    overlay.style.left = `${rect.left}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;

    // 更新提示
    const tagName = target.tagName.toLowerCase();
    const id = target.id ? '#' + target.id : '';
    const classes = target.classList.length > 0 ? '.' + Array.from(target.classList).slice(0, 2).join('.') : '';

    tooltip.innerHTML = `
        <span class="inspector-tag">${tagName}</span><span class="inspector-id">${id}</span><span class="inspector-class">${classes}</span>
        <span class="inspector-size">${Math.round(rect.width)} × ${Math.round(rect.height)}</span>
    `;

    tooltip.style.display = 'block';
    const tooltipRect = tooltip.getBoundingClientRect();
    let top = rect.top - tooltipRect.height - 5;
    if (top < 0) top = rect.bottom + 5;

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${rect.left}px`;
}

function flashClick(target) {
    if (!ensureUI()) return; // 点击时也要检查
    const flash = document.getElementById('recorder-click-flash');
    const rect = target.getBoundingClientRect();

    flash.style.display = 'block';
    flash.style.opacity = '1';
    flash.style.top = `${rect.top}px`;
    flash.style.left = `${rect.left}px`;
    flash.style.width = `${rect.width}px`;
    flash.style.height = `${rect.height}px`;

    setTimeout(() => {
        flash.style.opacity = '0';
        setTimeout(() => { flash.style.display = 'none'; }, 300);
    }, 200);
}

// ==========================================
// 4. 事件监听
// ==========================================

let lastTarget = null;
let scrollTimer;

// [MouseOver]
document.addEventListener('mouseover', (e) => {
    const target = e.target;
    if (target === lastTarget) return;
    lastTarget = target;
    highlightInspector(target);
}, true);

// [Scroll]
document.addEventListener('scroll', (e) => {
    // 1. 视觉层：如果当前有高亮元素，让框跟着走
    // 加个 try-catch 防止视觉逻辑报错阻塞数据上报
    try {
        if (typeof lastTarget !== 'undefined' && lastTarget && typeof highlightInspector === 'function') {
            highlightInspector(lastTarget);
        }
    } catch (err) { /* ignore visual error */ }

    // 2. 数据层：防抖上报
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
        // 🔥 获取真实的滚动位置
        //有些页面是 body 滚动，有些是 documentElement 滚动
        const x = window.scrollX || window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft;
        const y = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop;

        // 只有当 y > 0 或者 x > 0 时才认为有效 (可选)
        report('scroll', { x: Math.round(x), y: Math.round(y) });
    }, 500); // 500ms 防抖
}, true); // useCapture = true 捕获模式


// [Click]
document.addEventListener('click', (e) => {
    flashClick(e.target);
    const xpath = getOptimizedXPath(e.target);
    report('click', {
        xpath: xpath,
        text: e.target.innerText || '',
        id: e.target.id || '',
        className: e.target.className || '',
        tag: e.target.tagName.toLowerCase()
    });
}, true);

// [Input]
document.addEventListener('input', (e) => {
    report('input', { xpath: getOptimizedXPath(e.target), value: e.target.value });
}, true);

console.log('✅ [Recorder] Preload ready.');