let timer = null;

/* =========================
   Firebase初期化
========================= */
const db = firebase.database();
const dataRef = db.ref("timebank");

/* =========================
   初期化
========================= */
let seconds = 0;
let mode = "stop";
let lastUpdate = Date.now();
let history = [];
let lastHistorySave = 0;

/* =========================
   ユーティリティ
========================= */
const now = () => Date.now();

function formatTime(sec) {
    const h = String(Math.floor(sec / 3600)).padStart(2, "0");
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
}

function updateUI() {
    const timerText = document.getElementById("timer");
    if (timerText) timerText.textContent = formatTime(seconds);
}

/* =========================
   ページ切り替え（ここが重要）
========================= */
window.showPage = function (page) {
    const timerPage = document.getElementById("timerPage");
    const graphPage = document.getElementById("graphPage");
    const timerTab = document.getElementById("timerTab");
    const graphTab = document.getElementById("graphTab");

    if (page === "timer") {
        if (timerPage) timerPage.style.display = "block";
        if (graphPage) graphPage.style.display = "none";
        if (timerTab) timerTab.classList.add("active");
        if (graphTab) graphTab.classList.remove("active");
    } else {
        if (timerPage) timerPage.style.display = "none";
        if (graphPage) graphPage.style.display = "block";
        if (timerTab) timerTab.classList.remove("active");
        if (graphTab) graphTab.classList.add("active");
        showSubTab('min');
    }
};

window.showSubTab = function(type) {
    const tabs = ["Min", "Hour", "Day", "Week"];
    tabs.forEach(t => {
        const el = document.getElementById("sub" + t);
        if (el) el.style.display = "none";
    });

    const targetId = "sub" + type.charAt(0).toUpperCase() + type.slice(1);
    const target = document.getElementById(targetId);
    if (target) target.style.display = "block";

    if (type === "min") initMinSliders();
};

/* =========================
   Firebase保存・同期
========================= */
function saveData() {
    const t = now();
    dataRef.update({ seconds, mode, lastUpdate: t });

    if (t - lastHistorySave > 10000) {
        db.ref("timebank/history").push({ timestamp: t, seconds });
        lastHistorySave = t;
    }
}

function applyOfflineProgress() {
    if (mode === "stop") return;
    const diff = Math.floor((now() - lastUpdate) / 1000);
    if (diff > 0) {
        if (mode === "up") seconds += diff;
        if (mode === "down") {
            seconds -= diff;
            if (seconds < 0) { seconds = 0; mode = "stop"; }
        }
    }
}

/* =========================
   タイマー制御
========================= */
function startLoop() {
    clearInterval(timer);
    timer = setInterval(() => {
        if (mode === "up") seconds++;
        if (mode === "down") {
            seconds--;
            if (seconds <= 0) { seconds = 0; mode = "stop"; clearInterval(timer); }
        }
        updateUI();
        saveData();
    }, 1000);
}

/* =========================
   チャート描画 (Chart.js)
========================= */
function renderChart(canvasId, labels, data, label) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const key = "_chart_" + canvasId;
    if (window[key]) window[key].destroy();

    window[key] = new Chart(ctx, {
        type: "line",
        data: {
            labels,
            datasets: [{ label, data, borderColor: '#007aff', fill: false, tension: 0.1 }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function initMinSliders() {
    if (history.length === 0) return;
    const days = [...new Set(history.map(h => {
        const d = new Date(h.timestamp);
        return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
    }))];
    
    const dateSlider = document.getElementById("dateSlider");
    const hourSlider = document.getElementById("hourSlider");
    if (!dateSlider || !hourSlider) return;

    dateSlider.max = days.length - 1;
    const dateStr = days[dateSlider.value];
    renderMinChart(dateStr, +hourSlider.value);
}

function renderMinChart(dateStr, hour) {
    if (!dateStr) return;
    const [y, m, d] = dateStr.split("/").map(Number);
    const start = new Date(y, m - 1, d, hour, 0, 0).getTime();
    const end = start + 3600000;
    const labels = Array.from({ length: 60 }, (_, i) => `${hour}:${String(i).padStart(2, "0")}`);
    const data = Array(60).fill(null);

    history.forEach(h => {
        if (h.timestamp >= start && h.timestamp < end) {
            const min = new Date(h.timestamp).getMinutes();
            data[min] = h.seconds;
        }
    });
    renderChart("minChart", labels, data, `${dateStr} ${hour}時`);
}

/* =========================
   メインイベントリスナー
========================= */
window.addEventListener("load", () => {
    // タブ
    const tTab = document.getElementById("timerTab");
    const gTab = document.getElementById("graphTab");
    if (tTab) tTab.onclick = () => showPage("timer");
    if (gTab) gTab.onclick = () => showPage("graph");

    // ボタン
    const btns = {
        "upBtn": () => { mode = "up"; saveData(); startLoop(); },
        "downBtn": () => { mode = "down"; saveData(); startLoop(); },
        "stopBtn": () => { mode = "stop"; clearInterval(timer); saveData(); },
        "resetBtn": () => { if(confirm("消去？")){ seconds=0; mode="stop"; dataRef.set({seconds:0, mode:"stop", lastUpdate:now()}); db.ref("timebank/history").remove(); updateUI(); }}
    };

    Object.keys(btns).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.onclick = btns[id];
    });

    // Firebase同期開始
    dataRef.on("value", snap => {
        const d = snap.val();
        if (!d) return;
        seconds = d.seconds || 0;
        mode = d.mode || "stop";
        lastUpdate = d.lastUpdate || now();
        applyOfflineProgress();
        updateUI();
        if (mode !== "stop") startLoop();
    });

    db.ref("timebank/history").on("value", snap => {
        const d = snap.val();
        history = d ? Object.values(d).sort((a,b) => a.timestamp - b.timestamp) : [];
    });
});
