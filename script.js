let timer = null;

/* =========================
   安全な初期化（ここが重要）
========================= */

// seconds
let rawSeconds = Number(localStorage.getItem("seconds"));
let seconds = Number.isFinite(rawSeconds) && rawSeconds >= 0 ? rawSeconds : 0;

// mode
let mode = localStorage.getItem("mode") || "stop";

// lastUpdate（ms統一・壊れデータ対策）
let rawLast = Number(localStorage.getItem("lastUpdate"));
let lastUpdate =
    Number.isFinite(rawLast) && rawLast > 1e12
        ? rawLast
        : Date.now();

// history（壊れてても復旧）
let history = [];
try {
    const h = JSON.parse(localStorage.getItem("history"));
    if (Array.isArray(h)) history = h;
} catch (e) {
    history = [];
}

let lastHistorySave = 0;

let chart = null;
let currentGraphType = "sec";



const timerText = document.getElementById("timer");

/* =========================
   基本ユーティリティ
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
   保存（壊れ防止付き）
========================= */

function saveData() {
    localStorage.setItem("seconds", String(seconds));
    localStorage.setItem("mode", mode);
    localStorage.setItem("lastUpdate", String(now()));

    const t = now();

    // 10秒ごとにログ
    if (t - lastHistorySave > 10000) {
        history.push({
            timestamp: t,
            seconds: seconds
        });

        // 軽くサイズ制限（暴走防止）
        if (history.length > 5000) {
            history.shift();
        }

        localStorage.setItem("history", JSON.stringify(history));
        lastHistorySave = t;
    }

    changeGraph(currentGraphType);
}

/* =========================
   オフライン補正
========================= */

function applyOfflineProgress() {
    if (mode === "stop") return;

    const diff = Math.floor((now() - lastUpdate) / 1000);

    if (!Number.isFinite(diff) || diff <= 0) return;

    if (mode === "up") {
        seconds += diff;
    }

    if (mode === "down") {
        seconds -= diff;
        if (seconds < 0) {
            seconds = 0;
            mode = "stop";
        }
    }
}

/* =========================
   タイマー本体
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
   グラフ処理
========================= */

function groupHistory(type) {
    const grouped = {};

    history.forEach(h => {
        const d = new Date(h.timestamp);
        let key = "";

        if (type === "sec") {
            key = d.toLocaleTimeString();
        } else if (type === "min") {
            key = `${d.toLocaleDateString()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
        } else if (type === "hour") {
            key = `${d.toLocaleDateString()} ${d.getHours()}:00`;
        } else if (type === "day") {
            key = d.toLocaleDateString();
        } else if (type === "week") {
            const w = new Date(d);
            w.setDate(d.getDate() - ((d.getDay() + 6) % 7));
            key = w.toLocaleDateString();
        }

        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(h.seconds);
    });

    const divisor = { sec: 1, min: 60, hour: 3600, day: 86400, week: 604800 }[type];

    return {
        labels: Object.keys(grouped),
        data: Object.values(grouped).map(arr =>
            parseFloat((arr[arr.length - 1] / divisor).toFixed(2))
        )
    };
}


function changeGraph(type) {
    currentGraphType = type;

    if (!chart) return;

    const g = groupHistory(type);

    const values = g.data;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = (max - min) * 0.1 || 1;

    chart.data.labels = g.labels;
    chart.data.datasets[0].data = g.data;
    chart.data.datasets[0].label = type.toUpperCase();

    chart.options.scales.y.min = Math.max(0, parseFloat((min - padding).toFixed(2)));
    chart.options.scales.y.max = parseFloat((max + padding).toFixed(2));

    chart.resetZoom();
    chart.update();
}

/* =========================
   UI操作
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
    localStorage.clear();
    updateUI();
    changeGraph(currentGraphType);
};

/* =========================
   タブ
========================= */

const timerPage = document.getElementById("timerPage");
const graphPage = document.getElementById("graphPage");

document.getElementById("timerTab").onclick = () => {
    timerPage.style.display = "block";
    graphPage.style.display = "none";
};

document.getElementById("graphTab").onclick = () => {
    timerPage.style.display = "none";
    graphPage.style.display = "block";
};

/* =========================
   Chart初期化
========================= */

const ctx = document.getElementById("historyChart").getContext("2d");

Chart.register(window.ChartZoom);

chart = new Chart(ctx, {
    type: "line",
    data: {
        labels: [],
        datasets: [{
            label: "Balance",
            data: []
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
            zoom: {
                pan: {
                    enabled: true,
                    mode: "xy"
                },
                zoom: {
                    wheel: { enabled: true },
                    pinch: { enabled: true },
                    mode: "xy"
                }
            }
        }
    }
});

/* =========================
   初期実行
========================= */

applyOfflineProgress();
updateUI();
saveData();

if (mode !== "stop") startLoop();

changeGraph("sec");

window.addEventListener("beforeunload", saveData);