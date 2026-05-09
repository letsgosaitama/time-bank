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

const timerText = document.getElementById("timer");
const timerPage = document.getElementById("timerPage");
const graphPage = document.getElementById("graphPage");

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
    timerText.textContent = formatTime(seconds);
}

/* =========================
   ページ・タブ切り替え
========================= */
window.showPage = function (page) {
    if (page === "timer") {
        timerPage.style.display = "block";
        graphPage.style.display = "none";
    } else if (page === "graph") {
        timerPage.style.display = "none";
        graphPage.style.display = "block";
        // グラフページ表示時に初期タブを表示
        showSubTab('min');
    }
};

window.showSubTab = function(type) {
    // 全サブページを隠す
    ["Min", "Hour", "Day", "Week"].forEach(t => {
        const el = document.getElementById("sub" + t);
        if (el) el.style.display = "none";
    });

    // ターゲットを表示
    const targetId = "sub" + type.charAt(0).toUpperCase() + type.slice(1);
    const target = document.getElementById(targetId);
    if (target) target.style.display = "block";

    // グラフ初期化
    if (type === "min") initMinSliders();
    // 他のグラフ（hour, day）も同様にデータがあればここでrenderを呼ぶ
};

/* =========================
   Firebase保存・同期
========================= */
function saveData() {
    const t = now();
    dataRef.update({
        seconds,
        mode,
        lastUpdate: t
    });

    if (t - lastHistorySave > 10000) { // 10秒ごとに履歴保存
        db.ref("timebank/history").push({
            timestamp: t,
            seconds
        });
        lastHistorySave = t;
    }
}

function applyOfflineProgress() {
    if (mode === "stop") return;
    const diff = Math.floor((now() - lastUpdate) / 1000);
    if (!Number.isFinite(diff) || diff <= 0) return;

    if (mode === "up") seconds += diff;
    if (mode === "down") {
        seconds -= diff;
        if (seconds < 0) { seconds = 0; mode = "stop"; }
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
            if (seconds <= 0) {
                seconds = 0; mode = "stop";
                clearInterval(timer);
            }
        }
        updateUI();
        saveData();
    }, 1000);
}

/* =========================
   チャート描画
======================== */
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
            datasets: [{
                label,
                data,
                borderColor: '#007aff',
                backgroundColor: 'rgba(0, 122, 255, 0.1)',
                fill: true,
                spanGaps: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false
        }
    });
}

function renderMinChart(dateStr, hour) {
    if (!dateStr) return;
    const [y, m, d] = dateStr.split("/").map(Number);
    const start = new Date(y, m - 1, d, hour, 0, 0).getTime();
    const end = start + 3600000;

    const labels = Array.from({ length: 60 }, (_, i) =>
        `${String(hour).padStart(2, "0")}:${String(i).padStart(2, "0")}`
    );
    const data = Array(60).fill(null);

    history.forEach(h => {
        if (h.timestamp < start || h.timestamp >= end) return;
        const min = new Date(h.timestamp).getMinutes();
        data[min] = h.seconds;
    });

    renderChart("minChart", labels, data, `${dateStr} ${hour}:00`);
}

function initMinSliders() {
    if (history.length === 0) return;

    const days = [...new Set(history.map(h => {
        const d = new Date(h.timestamp);
        return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
    }))];

    const dateSlider = document.getElementById("dateSlider");
    const dateLabel = document.getElementById("dateLabel");
    const hourSlider = document.getElementById("hourSlider");
    const hourLabel = document.getElementById("hourLabel");

    dateSlider.max = days.length - 1;
    dateSlider.value = days.length - 1;
    dateLabel.textContent = days.at(-1);
    
    hourSlider.oninput = () => {
        hourLabel.textContent = hourSlider.value + "時";
        renderMinChart(days[dateSlider.value], +hourSlider.value);
    };

    dateSlider.oninput = () => {
        dateLabel.textContent = days[dateSlider.value];
        renderMinChart(days[dateSlider.value], +hourSlider.value);
    };

    renderMinChart(days.at(-1), +hourSlider.value);
}

/* =========================
   Firebaseイベント
========================= */
dataRef.on("value", snap => {
    const data = snap.val();
    if (!data) return;
    seconds = data.seconds || 0;
    mode = data.mode || "stop";
    lastUpdate = data.lastUpdate || Date.now();

    applyOfflineProgress();
    updateUI();

    if (mode !== "stop") startLoop();
    else clearInterval(timer);
});

db.ref("timebank/history").on("value", snap => {
    const data = snap.val();
    history = data ? Object.values(data).sort((a, b) => a.timestamp - b.timestamp) : [];
});

/* =========================
   起動時処理
========================= */
window.addEventListener("DOMContentLoaded", () => {
    // ページ切り替えタブ
    document.getElementById("timerTab").onclick = () => {
        showPage("timer");
        document.getElementById("timerTab").classList.add("active");
        document.getElementById("graphTab").classList.remove("active");
    };

    document.getElementById("graphTab").onclick = () => {
        showPage("graph");
        document.getElementById("graphTab").classList.add("active");
        document.getElementById("timerTab").classList.remove("active");
    };

    // 操作ボタン
    document.getElementById("upBtn").onclick = () => { mode = "up"; saveData(); startLoop(); };
    document.getElementById("downBtn").onclick = () => { mode = "down"; saveData(); startLoop(); };
    document.getElementById("stopBtn").onclick = () => { mode = "stop"; clearInterval(timer); saveData(); };
    document.getElementById("resetBtn").onclick = () => {
        if(!confirm("リセットしますか？")) return;
        seconds = 0; mode = "stop"; history = [];
        clearInterval(timer);
        dataRef.set({ seconds: 0, mode: "stop", lastUpdate: now() });
        db.ref("timebank/history").remove();
        updateUI();
    };
});
