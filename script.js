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
                borderColor: '#007aff',
                backgroundColor: 'rgba(0, 122, 255, 0.1)',
                tension: 0.1,
                fill: true,
                spanGaps: true // データが飛んでいても線を繋ぐ
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
                zoom: {
                    pan: { enabled: true, mode: "x" },
                    zoom: { pinch: { enabled: true }, wheel: { enabled: true }, mode: "x" }
                }
            }
        }
    });
}

/* =========================
   MINグラフ (1時間分固定)
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

    if (days.length === 0) { dateLabel.textContent = "-"; return; }

    dateSlider.max = Math.max(0, days.length - 1);
    dateSlider.value = days.length - 1;
    dateLabel.textContent = days[days.length - 1];

    dateSlider.oninput = () => {
        dateLabel.textContent = days[dateSlider.value];
        renderMinChart(days[dateSlider.value], Number(hourSlider.value));
    };
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

    const fixedLabels = [];
    for (let min = 0; min < 60; min++) {
        fixedLabels.push(`${String(hour).padStart(2,"0")}:${String(min).padStart(2,"0")}`);
    }

    const filtered = history.filter(h => h.timestamp >= start && h.timestamp < end);
    const byMinute = {};
    filtered.forEach(h => { byMinute[new Date(h.timestamp).getMinutes()] = h.seconds; });

    const data = fixedLabels.map((_, i) => byMinute[i] !== undefined ? byMinute[i] : null);
    renderChart("minChart", fixedLabels, data, `${dateStr} ${hour}時台`);
}

/* =========================
   HOURグラフ (24時間固定)
========================= */
function initHourSliders() {
    const days = [...new Set(history.map(h => {
        const d = new Date(h.timestamp);
        return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
    }))];

    const slider = document.getElementById("hourDateSlider");
    const label = document.getElementById("hourDateLabel");

    if (days.length === 0) { label.textContent = "-"; return; }

    slider.max = days.length - 1;
    slider.value = days.length - 1;
    label.textContent = days[days.length - 1];

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

    const fixedLabels = [];
    for (let h = 0; h < 24; h++) { fixedLabels.push(`${String(h).padStart(2, "0")}:00`); }

    const filtered = history.filter(h => h.timestamp >= start && h.timestamp < (start + 86400000));
    const byHour = {};
    filtered.forEach(h => { byHour[new Date(h.timestamp).getHours()] = h.seconds; });

    const data = fixedLabels.map((_, i) => byHour[i] !== undefined ? byHour[i] : null);
    renderChart("historyChart", fixedLabels, data, `${dateStr} (24h)`);
}

/* =========================
   DAYグラフ (1ヶ月固定)
========================= */
function initDaySliders() {
    const months = [...new Set(history.map(h => {
        const d = new Date(h.timestamp);
        return `${d.getFullYear()}/${d.getMonth()+1}`;
    }))];

    const slider = document.getElementById("dayMonthSlider");
    const label = document.getElementById("dayMonthLabel");

    if (months.length === 0) { label.textContent = "-"; return; }

    slider.max = months.length - 1;
    slider.value = months.length - 1;
    label.textContent = months[months.length - 1];

    slider.oninput = () => {
        label.textContent = months[slider.value];
        renderDayChart(months[slider.value]);
    };
    renderDayChart(months[months.length - 1]);
}

function renderDayChart(monthStr) {
    if (!monthStr) return;
    const [y, m] = monthStr.split("/").map(Number);
    const lastDay = new Date(y, m, 0).getDate();

    const fixedLabels = [];
    for (let i = 1; i <= lastDay; i++) { fixedLabels.push(`${i}日`); }

    const start = new Date(y, m - 1, 1).getTime();
    const end = new Date(y, m, 1).getTime();

    const filtered = history.filter(h => h.timestamp >= start && h.timestamp < end);
    const byDay = {};
    filtered.forEach(h => { byDay[new Date(h.timestamp).getDate()] = h.seconds; });

    const data = fixedLabels.map((_, i) => byDay[i + 1] !== undefined ? byDay[i + 1] : null);
    renderChart("dayChart", fixedLabels, data, `${monthStr} (日次)`);
}

/* =========================
   WEEKグラフ (月曜始まり固定)
========================= */
function initWeekSliders() {
    const months = [...new Set(history.map(h => {
        const d = new Date(h.timestamp);
        return `${d.getFullYear()}/${d.getMonth()+1}`;
    }))];

    const slider = document.getElementById("weekMonthSlider");
    const label = document.getElementById("weekMonthLabel");

    if (months.length === 0) { label.textContent = "-"; return; }

    slider.max = months.length - 1;
    slider.value = months.length - 1;
    label.textContent = months[months.length - 1];

    slider.oninput = () => {
        label.textContent = months[slider.value];
        renderWeekChart(months[slider.value]);
    };
    renderWeekChart(months[months.length - 1]);
}

function renderWeekChart(monthStr) {
    if (!monthStr) return;
    const [y, m] = monthStr.split("/").map(Number);
    const fixedLabels = [];
    let d = new Date(y, m - 1, 1);
    while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
    while (d.getMonth() === m - 1) {
        fixedLabels.push(`${d.getMonth() + 1}/${d.getDate()}(週)`);
        d.setDate(d.getDate() + 7);
    }

    const start = new Date(y, m - 1, 1).getTime();
    const end = new Date(y, m, 1).getTime();
    const filtered = history.filter(h => h.timestamp >= start && h.timestamp < end);

    const byWeek = {};
    filtered.forEach(h => {
        const dt = new Date(h.timestamp);
        const diff = dt.getDate() - dt.getDay() + (dt.getDay() === 0 ? -6 : 1);
        const mon = new Date(y, m - 1, diff);
        const key = `${mon.getMonth() + 1}/${mon.getDate()}(週)`;
        byWeek[key] = h.seconds;
    });

    const data = fixedLabels.map(label => byWeek[label] !== undefined ? byWeek[label] : null);
    renderChart("weekChart", fixedLabels, data, `${monthStr} (週次)`);
}

/* =========================
   タブ・ボタン制御
========================= */
window.showSubTab = function(type) {
    ["Min", "Hour", "Day", "Week"].forEach(t => document.getElementById("sub" + t).style.display = "none");
    document.getElementById("sub" + type.charAt(0).toUpperCase() + type.slice(1)).style.display = "block";
    document.querySelectorAll(".subTab").forEach((btn, i) => {
        btn.classList.toggle("active", ["min","hour","day","week"][i] === type);
    });
    if (type === "min") initMinSliders();
    if (type === "hour") initHourSliders();
    if (type === "day") initDaySliders();
    if (type === "week") initWeekSliders();
};

document.getElementById("timerTab").onclick = () => {
    timerPage.style.display = "block"; graphPage.style.display = "none";
    document.getElementById("timerTab").classList.add("active");
    document.getElementById("graphTab").classList.remove("active");
};

document.getElementById("graphTab").onclick = () => {
    timerPage.style.display = "none"; graphPage.style.display = "block";
    document.getElementById("graphTab").classList.add("active");
    document.getElementById("timerTab").classList.remove("active");
    showSubTab("min");
};

/* =========================
   タイマー操作
========================= */
document.getElementById("upBtn").onclick = () => { mode = "up"; saveData(); startLoop(); };
document.getElementById("downBtn").onclick = () => { mode = "down"; saveData(); startLoop(); };
document.getElementById("stopBtn").onclick = () => { mode = "stop"; clearInterval(timer); saveData(); };
document.getElementById("resetBtn").onclick = () => {
    if (!confirm("リセットしますか？")) return;
    seconds = 0; mode = "stop"; history = []; clearInterval(timer);
    dataRef.set({ seconds: 0, mode: "stop", lastUpdate: now() });
    db.ref("timebank/history").remove();
    updateUI();
};

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
    if (mode !== "stop") startLoop(); else clearInterval(timer);
});

db.ref("timebank/history").on("value", snap => {
    const data = snap.val();
    history = data ? Object.values(data).sort((a, b) => a.timestamp - b.timestamp) : [];
});
