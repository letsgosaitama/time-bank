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
let minChart = null;
let currentGraphType = "min";

const timerText = document.getElementById("timer");
const timerPage = document.getElementById("timerPage");
const graphPage = document.getElementById("graphPage");

/* =========================
   ユーティリティ
========================= */

function now() { return Date.now(); }

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
   Firebase保存
========================= */

function saveData() {
    const t = now();

    dataRef.update({
        seconds: seconds,
        mode: mode,
        lastUpdate: t
    });

    if (t - lastHistorySave > 10000) {
        db.ref("timebank/history").push({
            timestamp: t,
            seconds: seconds
        });
        lastHistorySave = t;
    }
}

/* =========================
   オフライン補正
========================= */

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
   タイマー
========================= */

function startLoop() {
    clearInterval(timer);
    timer = setInterval(() => {
        if (mode === "up") seconds++;
        if (mode === "down") {
            seconds--;
            if (seconds <= 0) {
                seconds = 0;
                mode = "stop";
                clearInterval(timer);
            }
        }
        updateUI();
        saveData();
    }, 1000);
}

/* =========================
   汎用チャート描画
========================= */

function renderChart(canvasId, labels, data, label) {
    const ctx = document.getElementById(canvasId).getContext("2d");
    const key = "_chart_" + canvasId;
    if (window[key]) window[key].destroy();
    window[key] = new Chart(ctx, {
        type: "line",
        data: {
            labels,
            datasets: [{ label, data }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
                zoom: {
                    pan: { enabled: true, mode: "x" },
                    zoom: {
                        pinch: { enabled: true },
                        wheel: { enabled: true },
                        mode: "x"
                    }
                }
            }
        }
    });
}

/* =========================
   MINグラフ
========================= */

function initMinSliders() {
    const days = [...new Set(history.map(h => {
        const d = new Date(h.timestamp);
        return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
    }))];

    const dateSlider = document.getElementById("dateSlider");
    const dateLabel = document.getElementById("dateLabel");
    const hourSlider = document.getElementById("hourSlider");
    const hourLabel = document.getElementById("hourLabel");

    dateSlider.max = Math.max(0, days.length - 1);
    dateSlider.value = days.length - 1;
    dateLabel.textContent = days[days.length - 1] || "-";

    dateSlider.oninput = () => {
        dateLabel.textContent = days[dateSlider.value];
        renderMinChart(days[dateSlider.value], Number(hourSlider.value));
    };

    hourSlider.value = new Date().getHours();
    hourLabel.textContent = `${hourSlider.value}時`;

    hourSlider.oninput = () => {
        hourLabel.textContent = `${hourSlider.value}時`;
        renderMinChart(days[dateSlider.value], Number(hourSlider.value));
    };

    renderMinChart(days[days.length - 1], Number(hourSlider.value));
}

function renderMinChart(dateStr, hour) {
    if (!dateStr) return;
    const [y, m, d] = dateStr.split("/").map(Number);
    const start = new Date(y, m - 1, d, hour, 0, 0).getTime();
    const end = start + 3600000;

    // 0分〜59分の固定ラベルを作成
    const fixedLabels = [];
    for (let min = 0; min < 60; min++) {
        fixedLabels.push(`${String(hour).padStart(2,"0")}:${String(min).padStart(2,"0")}`);
    }

    // 各分のデータをマッピング（データがない分はnull）
    const filtered = history.filter(h => h.timestamp >= start && h.timestamp < end);
    const byMinute = {};
    filtered.forEach(h => {
        const d = new Date(h.timestamp);
        const key = d.getMinutes();
        byMinute[key] = h.seconds;
    });

    const data = fixedLabels.map((_, i) => byMinute[i] !== undefined ? byMinute[i] : null);
    renderChart("minChart", fixedLabels, data, `${dateStr} ${hour}:00〜${hour}:59`);
}

/* =========================
   HOUR用の初期化
========================= */
function initHourSliders() {
    const days = [...new Set(history.map(h => {
        const d = new Date(h.timestamp);
        return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
    }))];

    const slider = document.getElementById("hourDateSlider");
    const label = document.getElementById("hourDateLabel");

    // データがない場合の防衛策
    if (days.length === 0) {
        label.textContent = "データなし";
        slider.max = 0;
        return; 
    }

    slider.max = days.length - 1;
    slider.value = days.length - 1;
    label.textContent = days[days.length - 1];

    slider.oninput = () => {
        label.textContent = days[slider.value];
        renderHourChart(days[slider.value]);
    };

    renderHourChart(days[days.length - 1]);
}

// ※ initDaySliders, initWeekSliders も同様に days ではなく months で作成してください。
/* =========================
   HOURグラフ (00:00 - 23:00)
========================= */
function renderHourChart(dateStr) {
    if (!dateStr || dateStr === "-") return;
    const [y, m, d] = dateStr.split("/").map(Number);
    const start = new Date(y, m - 1, d, 0, 0, 0).getTime();
    const end = start + 86400000;

    // 固定ラベル：00:00 〜 23:00
    const fixedLabels = [];
    for (let h = 0; h < 24; h++) {
        fixedLabels.push(`${String(h).padStart(2, "0")}:00`);
    }

    const filtered = history.filter(h => h.timestamp >= start && h.timestamp < end);
    const byHour = {};
    filtered.forEach(h => {
        const key = new Date(h.timestamp).getHours();
        byHour[key] = h.seconds;
    });

    const data = fixedLabels.map((_, i) => byHour[i] !== undefined ? byHour[i] : null);
    renderChart("historyChart", fixedLabels, data, `${dateStr}`);
}

/* =========================
   DAYグラフ (1日 - 末日)
========================= */
function renderDayChart(monthStr) {
    if (!monthStr || monthStr === "-") return;
    const [y, m] = monthStr.split("/").map(Number);
    const lastDay = new Date(y, m, 0).getDate();

    // 固定ラベル：1日 〜 末日
    const fixedLabels = [];
    for (let i = 1; i <= lastDay; i++) {
        fixedLabels.push(`${i}日`);
    }

    const start = new Date(y, m - 1, 1).getTime();
    const end = new Date(y, m, 1).getTime();

    const filtered = history.filter(h => h.timestamp >= start && h.timestamp < end);
    const byDay = {};
    filtered.forEach(h => {
        const key = new Date(h.timestamp).getDate();
        byDay[key] = h.seconds;
    });

    const data = fixedLabels.map((_, i) => byDay[i + 1] !== undefined ? byDay[i + 1] : null);
    renderChart("dayChart", fixedLabels, data, `${monthStr}`);
}
/* =========================
   サブタブ切り替え
========================= */

window.showSubTab = function(type) {
    ["Min", "Hour", "Day", "Week"].forEach(t => {
        document.getElementById("sub" + t).style.display = "none";
    });
    document.getElementById("sub" + type.charAt(0).toUpperCase() + type.slice(1)).style.display = "block";

    document.querySelectorAll(".subTab").forEach((btn, i) => {
        btn.classList.toggle("active", ["min","hour","day","week"][i] === type);
    });

    if (type === "min") initMinSliders();
    if (type === "hour") initHourSliders();
    if (type === "day") initDaySliders();
    if (type === "week") initWeekSliders();
}

/* =========================
   メインタブ切り替え
========================= */

document.getElementById("timerTab").onclick = () => {
    timerPage.style.display = "block";
    graphPage.style.display = "none";
    document.getElementById("timerTab").classList.add("active");
    document.getElementById("graphTab").classList.remove("active");
};

document.getElementById("graphTab").onclick = () => {
    timerPage.style.display = "none";
    graphPage.style.display = "block";
    document.getElementById("graphTab").classList.add("active");
    document.getElementById("timerTab").classList.remove("active");
    showSubTab("min");
};

/* =========================
   タイマーボタン
========================= */

document.getElementById("upBtn").onclick = () => {
    mode = "up";
    saveData();
    startLoop();
};

document.getElementById("downBtn").onclick = () => {
    mode = "down";
    saveData();
    startLoop();
};

document.getElementById("stopBtn").onclick = () => {
    mode = "stop";
    clearInterval(timer);
    saveData();
};

document.getElementById("resetBtn").onclick = () => {
    if (!confirm("タイマーをリセットしますか？")) return;
    seconds = 0;
    mode = "stop";
    history = [];
    clearInterval(timer);
    dataRef.set({ seconds: 0, mode: "stop", lastUpdate: now() });
    db.ref("timebank/history").remove();
    updateUI();
};

/* =========================
   ピンチズーム対策
========================= */

["historyChart", "minChart", "dayChart", "weekChart"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener("touchstart", e => {
            if (e.touches.length === 2) e.preventDefault();
        }, { passive: false });
    }
});

/* =========================
   Firebase読み込み＆リアルタイム同期
========================= */

Chart.register(window.ChartZoom);

// メインデータ（seconds/mode/lastUpdate）をリアルタイム同期
dataRef.on("value", snapshot => {
    const data = snapshot.val();
    if (!data) return;

    const remoteSeconds = data.seconds || 0;
    const remoteMode = data.mode || "stop";
    const remoteLastUpdate = data.lastUpdate || Date.now();

    seconds = remoteSeconds;
    mode = remoteMode;
    lastUpdate = remoteLastUpdate;

    // オフライン補正
    applyOfflineProgress();
    updateUI();

    if (mode !== "stop") {
        startLoop();
    } else {
        clearInterval(timer);
    }
});

// historyをリアルタイム同期
db.ref("timebank/history").on("value", snapshot => {
    const data = snapshot.val();
    if (!data) { history = []; return; }
    history = Object.values(data).sort((a, b) => a.timestamp - b.timestamp);
});
