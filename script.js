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
function now() {
    return Date.now();
}

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
        seconds,
        mode,
        lastUpdate: t
    });

    if (t - lastHistorySave > 10000) {
        db.ref("timebank/history").push({
            timestamp: t,
            seconds
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
        if (seconds < 0) {
            seconds = 0;
            mode = "stop";
        }
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
   Chart共通
========================= */
function renderChart(canvasId, labels, data, label) {
    const ctx = document.getElementById(canvasId).getContext("2d");
    const key = "_chart_" + canvasId;

    if (window[key]) window[key].destroy();

    window[key] = new Chart(ctx, {
        type: "line",
        data: {
            labels,
            datasets: [{
                label,
                data,
                spanGaps: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: {
                x: {
                    type: "category",
                    offset: true,
                    ticks: {
                        autoSkip: false,
                        maxRotation: 90,
                        minRotation: 90
                    }
                },
                y: {
                    beginAtZero: true
                }
            },
            plugins: {
                zoom: {
                    pan: { enabled: true, mode: "x" },
                    zoom: {
                        wheel: { enabled: true },
                        pinch: { enabled: true },
                        mode: "x"
                    }
                }
            }
        }
    });
}

/* =========================
   MIN（60分固定・安定版）
========================= */
function renderMinChart(dateStr, hour) {
    if (!dateStr) return;

    const [y, m, d] = dateStr.split("/").map(Number);
    const start = new Date(y, m - 1, d, hour, 0, 0).getTime();
    const end = start + 3600000;

    const labels = Array.from({ length: 60 }, (_, i) =>
        `${String(hour).padStart(2, "0")}:${String(i).padStart(2, "0")}`
    );

    const map = Array.from({ length: 60 }, () => []);

    history.forEach(h => {
        const t = h.timestamp;
        if (t < start || t >= end) return;

        const minute = new Date(t).getMinutes();
        map[minute].push(h.seconds);
    });

    const data = map.map(arr =>
        arr.length ? arr[arr.length - 1] : null
    );

    renderChart("minChart", labels, data, `${dateStr} ${hour}:00`);
}

/* =========================
   HOUR（24時間固定）
========================= */
function renderHourChart(dateStr) {
    if (!dateStr) return;

    const [y, m, d] = dateStr.split("/").map(Number);
    const start = new Date(y, m - 1, d, 0, 0, 0).getTime();
    const end = start + 86400000;

    const labels = Array.from({ length: 24 }, (_, i) =>
        `${String(i).padStart(2, "0")}:00`
    );

    const map = Array.from({ length: 24 }, () => []);

    history.forEach(h => {
        const t = h.timestamp;
        if (t < start || t >= end) return;

        const hour = new Date(t).getHours();
        map[hour].push(h.seconds);
    });

    const data = map.map(arr =>
        arr.length ? arr[arr.length - 1] : null
    );

    renderChart("historyChart", labels, data, dateStr);
}

/* =========================
   DAY（30日固定）
========================= */
function renderDayChart(monthStr) {
    if (!monthStr) return;

    const [y, m] = monthStr.split("/").map(Number);

    const labels = Array.from({ length: 30 }, (_, i) =>
        `${String(i + 1).padStart(2, "0")}日`
    );

    const map = Array.from({ length: 30 }, () => []);

    history.forEach(h => {
        const d = new Date(h.timestamp);

        if (d.getFullYear() !== y || d.getMonth() + 1 !== m) return;

        const day = d.getDate() - 1;
        if (day >= 0 && day < 30) {
            map[day].push(h.seconds);
        }
    });

    const data = map.map(arr =>
        arr.length ? arr[arr.length - 1] : null
    );

    renderChart("dayChart", labels, data, monthStr);
}

/* =========================
   WEEK（30日固定・日ベース）
========================= */
function renderWeekChart(monthStr) {
    if (!monthStr) return;

    const [y, m] = monthStr.split("/").map(Number);

    const labels = Array.from({ length: 30 }, (_, i) =>
        `${String(i + 1).padStart(2, "0")}日`
    );

    const map = Array.from({ length: 30 }, () => []);

    history.forEach(h => {
        const d = new Date(h.timestamp);

        if (d.getFullYear() !== y || d.getMonth() + 1 !== m) return;

        const day = d.getDate() - 1;
        if (day >= 0 && day < 30) {
            map[day].push(h.seconds);
        }
    });

    const data = map.map(arr =>
        arr.length ? arr[arr.length - 1] : null
    );

    renderChart("weekChart", labels, data, monthStr);
}

/* =========================
   Firebase同期
========================= */
Chart.register(window.ChartZoom);

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
    history = data
        ? Object.values(data).sort((a, b) => a.timestamp - b.timestamp)
        : [];
});
