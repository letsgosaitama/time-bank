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
            datasets: [{
                label,
                data,
                spanGaps: true // nullの穴を線でつなぐ（任意だけど地味に重要）
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,

            scales: {
                x: {
                    type: "category",

                    ticks: {
                        autoSkip: false,   // ★全部表示
                        maxRotation: 90,   // ★詰まり対策
                        minRotation: 90
                    }
                },
                y: {
                    beginAtZero: true
                }
            },

            plugins: {
                zoom: {
                    pan: {
                        enabled: true,
                        mode: "x"
                    },
                    zoom: {
                        wheel: {
                            enabled: true
                        },
                        pinch: {
                            enabled: true
                        },
                        mode: "x"
                    }
                },

                legend: {
                    display: true
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
   HOURグラフ
========================= */

function initHourSliders() {
    const days = [...new Set(history.map(h => {
        const d = new Date(h.timestamp);
        return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
    }))];

    const slider = document.getElementById("hourDateSlider");
    const label = document.getElementById("hourDateLabel");

    slider.max = Math.max(0, days.length - 1);
    slider.value = days.length - 1;
    label.textContent = days[days.length - 1] || "-";

    slider.oninput = () => {
        label.textContent = days[slider.value];
        renderHourChart(days[slider.value]);
    };

    renderHourChart(days[days.length - 1]);
}

function renderHourChart(dateStr) {
    if (!dateStr) return;
    const [y, m, d] = dateStr.split("/").map(Number);
    const start = new Date(y, m - 1, d, 0, 0, 0).getTime();
    const end = start + 86400000;

    const filtered = history.filter(h => h.timestamp >= start && h.timestamp < end);
    const grouped = {};
    filtered.forEach(h => {
        const d = new Date(h.timestamp);
        const key = `${d.getHours()}:00`;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(h.seconds);
    });

    const labels = Object.keys(grouped);
    const data = Object.values(grouped).map(arr => arr[arr.length - 1]);
    renderChart("historyChart", labels, data, dateStr);
}

/* =========================
   DAYグラフ
========================= */

function initDaySliders() {
    const months = [...new Set(history.map(h => {
        const d = new Date(h.timestamp);
        return `${d.getFullYear()}/${d.getMonth()+1}`;
    }))];

    const slider = document.getElementById("dayMonthSlider");
    const label = document.getElementById("dayMonthLabel");

    slider.max = Math.max(0, months.length - 1);
    slider.value = months.length - 1;
    label.textContent = months[months.length - 1] || "-";

    slider.oninput = () => {
        label.textContent = months[slider.value];
        renderDayChart(months[slider.value]);
    };

    renderDayChart(months[months.length - 1]);
}

function renderDayChart(monthStr) {
    if (!monthStr) return;
    const [y, m] = monthStr.split("/").map(Number);
    const start = new Date(y, m - 1, 1).getTime();
    const end = new Date(y, m, 1).getTime();

    const filtered = history.filter(h => h.timestamp >= start && h.timestamp < end);
    const grouped = {};
    filtered.forEach(h => {
        const d = new Date(h.timestamp);
        const key = `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(h.seconds);
    });

    const labels = Object.keys(grouped);
    const data = Object.values(grouped).map(arr => arr[arr.length - 1]);
    renderChart("dayChart", labels, data, monthStr);
}

/* =========================
   WEEKグラフ
========================= */

function initWeekSliders() {
    const months = [...new Set(history.map(h => {
        const d = new Date(h.timestamp);
        return `${d.getFullYear()}/${d.getMonth()+1}`;
    }))];

    const slider = document.getElementById("weekMonthSlider");
    const label = document.getElementById("weekMonthLabel");

    slider.max = Math.max(0, months.length - 1);
    slider.value = months.length - 1;
    label.textContent = months[months.length - 1] || "-";

    slider.oninput = () => {
        label.textContent = months[slider.value];
        renderWeekChart(months[slider.value]);
    };

    renderWeekChart(months[months.length - 1]);
}

function renderWeekChart(monthStr) {
    if (!monthStr) return;
    const [y, m] = monthStr.split("/").map(Number);
    const start = new Date(y, m - 1, 1).getTime();
    const end = new Date(y, m, 1).getTime();

    const filtered = history.filter(h => h.timestamp >= start && h.timestamp < end);
    const grouped = {};
    filtered.forEach(h => {
        const d = new Date(h.timestamp);
        const w = new Date(d);
        w.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        const key = `${w.getFullYear()}/${w.getMonth()+1}/${w.getDate()}`;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(h.seconds);
    });

    const labels = Object.keys(grouped);
    const data = Object.values(grouped).map(arr => arr[arr.length - 1]);
    renderChart("weekChart", labels, data, monthStr);
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
