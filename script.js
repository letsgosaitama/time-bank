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
   タイマー制御
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
   汎用チャート描画関数
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
                spanGaps: true
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
            },
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

/* =========================
   各グラフの初期化と更新
========================= */

// --- MIN (分次) ---
function initMinSliders() {
    const days = [...new Set(history.map(h => {
        const d = new Date(h.timestamp);
        return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
    }))];
    const dSlider = document.getElementById("dateSlider");
    const hSlider = document.getElementById("hourSlider");
    if (days.length === 0) return;

    dSlider.max = days.length - 1;
    dSlider.value = days.length - 1;
    hSlider.value = new Date().getHours();

    updateMinSliders();
}

function updateMinSliders() {
    const days = [...new Set(history.map(h => {
        const d = new Date(h.timestamp);
        return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
    }))];
    const dSlider = document.getElementById("dateSlider");
    const hSlider = document.getElementById("hourSlider");
    
    const selectedDate = days[dSlider.value];
    const selectedHour = Number(hSlider.value);
    
    document.getElementById("dateLabel").textContent = selectedDate || "-";
    document.getElementById("hourLabel").textContent = `${selectedHour}時`;

    renderMinChart(selectedDate, selectedHour);
}

function renderMinChart(dateStr, hour) {
    if (!dateStr) return;
    const [y, m, d] = dateStr.split("/").map(Number);
    const start = new Date(y, m - 1, d, hour, 0, 0).getTime();
    const labels = Array.from({length: 60}, (_, i) => `${String(hour).padStart(2,"0")}:${String(i).padStart(2,"0")}`);
    const filtered = history.filter(h => h.timestamp >= start && h.timestamp < start + 3600000);
    const map = {};
    filtered.forEach(h => { map[new Date(h.timestamp).getMinutes()] = h.seconds; });
    const data = labels.map((_, i) => map[i] !== undefined ? map[i] : null);
    renderChart("minChart", labels, data, `${dateStr} ${hour}時台`);
}

// --- HOUR (毎時) ---
function initHourSliders() {
    const days = [...new Set(history.map(h => {
        const d = new Date(h.timestamp);
        return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
    }))];
    const slider = document.getElementById("hourDateSlider");
    if (days.length === 0) return;
    slider.max = days.length - 1;
    slider.value = days.length - 1;
    updateHourSliders();
}

function updateHourSliders() {
    const days = [...new Set(history.map(h => {
        const d = new Date(h.timestamp);
        return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
    }))];
    const slider = document.getElementById("hourDateSlider");
    const selectedDate = days[slider.value];
    document.getElementById("hourDateLabel").textContent = selectedDate || "-";
    renderHourChart(selectedDate);
}

function renderHourChart(dateStr) {
    if (!dateStr) return;
    const [y, m, d] = dateStr.split("/").map(Number);
    const start = new Date(y, m - 1, d, 0, 0, 0).getTime();
    const labels = Array.from({length: 24}, (_, i) => `${String(i).padStart(2,"0")}:00`);
    const filtered = history.filter(h => h.timestamp >= start && h.timestamp < start + 86400000);
    const map = {};
    filtered.forEach(h => { map[new Date(h.timestamp).getHours()] = h.seconds; });
    const data = labels.map((_, i) => map[i] !== undefined ? map[i] : null);
    renderChart("historyChart", labels, data, `${dateStr} (24時間)`);
}

// --- DAY (日別) ---
function initDaySliders() {
    const months = [...new Set(history.map(h => {
        const d = new Date(h.timestamp);
        return `${d.getFullYear()}/${d.getMonth()+1}`;
    }))];
    const slider = document.getElementById("dayMonthSlider");
    if (months.length === 0) return;
    slider.max = months.length - 1;
    slider.value = months.length - 1;
    updateDaySliders();
}

function updateDaySliders() {
    const months = [...new Set(history.map(h => {
        const d = new Date(h.timestamp);
        return `${d.getFullYear()}/${d.getMonth()+1}`;
    }))];
    const slider = document.getElementById("dayMonthSlider");
    const selectedMonth = months[slider.value];
    document.getElementById("dayMonthLabel").textContent = selectedMonth || "-";
    renderDayChart(selectedMonth);
}

function renderDayChart(monthStr) {
    if (!monthStr) return;
    const [y, m] = monthStr.split("/").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const labels = Array.from({length: lastDay}, (_, i) => `${i + 1}日`);
    const start = new Date(y, m - 1, 1).getTime();
    const end = new Date(y, m, 1).getTime();
    const filtered = history.filter(h => h.timestamp >= start && h.timestamp < end);
    const map = {};
    filtered.forEach(h => { map[new Date(h.timestamp).getDate()] = h.seconds; });
    const data = labels.map((_, i) => map[i + 1] !== undefined ? map[i + 1] : null);
    renderChart("dayChart", labels, data, `${monthStr} (日次)`);
}

// --- WEEK (週別) ---
function initWeekSliders() {
    const months = [...new Set(history.map(h => {
        const d = new Date(h.timestamp);
        return `${d.getFullYear()}/${d.getMonth()+1}`;
    }))];
    const slider = document.getElementById("weekMonthSlider");
    if (months.length === 0) return;
    slider.max = months.length - 1;
    slider.value = months.length - 1;
    updateWeekSliders();
}

function updateWeekSliders() {
    const months = [...new Set(history.map(h => {
        const d = new Date(h.timestamp);
        return `${d.getFullYear()}/${d.getMonth()+1}`;
    }))];
    const slider = document.getElementById("weekMonthSlider");
    const selectedMonth = months[slider.value];
    document.getElementById("weekMonthLabel").textContent = selectedMonth || "-";
    renderWeekChart(selectedMonth);
}

function renderWeekChart(monthStr) {
    if (!monthStr) return;
    const [y, m] = monthStr.split("/").map(Number);
    const labels = [];
    let d = new Date(y, m - 1, 1);
    while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
    while (d.getMonth() === m - 1) {
        labels.push(`${d.getMonth() + 1}/${d.getDate()}(週)`);
        d.setDate(d.getDate() + 7);
    }
    const filtered = history.filter(h => h.timestamp >= new Date(y, m - 1, 1).getTime() && h.timestamp < new Date(y, m, 1).getTime());
    const map = {};
    filtered.forEach(h => {
        const dt = new Date(h.timestamp);
        const day = dt.getDay();
        const diff = dt.getDate() - (day === 0 ? 6 : day - 1);
        const mon = new Date(dt.getFullYear(), dt.getMonth(), diff);
        map[`${mon.getMonth() + 1}/${mon.getDate()}(週)`] = h.seconds;
    });
    const data = labels.map(l => map[l] !== undefined ? map[l] : null);
    renderChart("weekChart", labels, data, `${monthStr} (週次)`);
}

/* =========================
   イベント設定
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

document.getElementById("dateSlider").oninput = updateMinSliders;
document.getElementById("hourSlider").oninput = updateMinSliders;
document.getElementById("hourDateSlider").oninput = updateHourSliders;
document.getElementById("dayMonthSlider").oninput = updateDaySliders;
document.getElementById("weekMonthSlider").oninput = updateWeekSliders;

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
   タイマー操作・Firebase同期
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
