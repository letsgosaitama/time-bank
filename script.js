// Firebase設定（ご自身のものを入れてください）
const firebaseConfig = { /* ... */ };
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

let timer = null;
const db = firebase.database();
const dataRef = db.ref("timebank");

let seconds = 0;
let mode = "stop";
let lastUpdate = Date.now();
let history = [];
let lastHistorySave = 0;
let currentYMax = null; // 縦軸の最大値

const timerText = document.getElementById("timer");

/* ユーティリティ */
function now() { return Date.now(); }
function formatTime(sec) {
    const h = String(Math.floor(sec / 3600)).padStart(2, "0");
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
}

/* 描画の核心：縦軸maxを反映 */
function renderChart(canvasId, labels, data, label) {
    const ctx = document.getElementById(canvasId).getContext("2d");
    const key = "_chart_" + canvasId;
    if (window[key]) window[key].destroy();
    window[key] = new Chart(ctx, {
        type: "line",
        data: {
            labels,
            datasets: [{ 
                label, data, borderColor: '#007aff', 
                backgroundColor: 'rgba(0, 122, 255, 0.1)', 
                tension: 0.1, fill: true, spanGaps: true 
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, animation: false,
            scales: {
                y: { 
                    beginAtZero: true,
                    max: currentYMax ? Number(currentYMax) : undefined 
                }
            }
        }
    });
}

/* 縦軸の更新 */
function updateAllChartsScale() {
    const val = document.getElementById("yMaxInput").value;
    currentYMax = (val && val > 0) ? val : null;
    
    // 現在表示中のグラフを即時更新
    const activeSubTab = document.querySelector(".subTab.active").textContent;
    if(activeSubTab === "MIN") updateMinSliders();
    if(activeSubTab === "HOUR") updateHourSliders();
    if(activeSubTab === "DAY") updateDaySliders();
    if(activeSubTab === "WEEK") updateWeekSliders();
}

/* 各グラフの更新ロジック */
function updateMinSliders() {
    const days = [...new Set(history.map(h => {
        const d = new Date(h.timestamp);
        return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
    }))];
    const dSlider = document.getElementById("dateSlider");
    const hSlider = document.getElementById("hourSlider");
    if (days.length === 0) return;

    const selectedDate = days[dSlider.value];
    const selectedHour = Number(hSlider.value);
    document.getElementById("dateLabel").textContent = selectedDate || "-";
    document.getElementById("hourLabel").textContent = `${selectedHour}時`;

    const start = new Date(selectedDate).setHours(selectedHour, 0, 0, 0);
    const labels = Array.from({length: 60}, (_, i) => `${String(selectedHour).padStart(2,"0")}:${String(i).padStart(2,"0")}`);
    const filtered = history.filter(h => h.timestamp >= start && h.timestamp < start + 3600000);
    const map = {};
    filtered.forEach(h => { map[new Date(h.timestamp).getMinutes()] = h.seconds; });
    const data = labels.map((_, i) => map[i] !== undefined ? map[i] : null);
    renderChart("minChart", labels, data, `${selectedDate} ${selectedHour}時台`);
}

function updateHourSliders() {
    const days = [...new Set(history.map(h => {
        const d = new Date(h.timestamp);
        return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
    }))];
    const slider = document.getElementById("hourDateSlider");
    const selectedDate = days[slider.value];
    document.getElementById("hourDateLabel").textContent = selectedDate || "-";
    
    const start = new Date(selectedDate).setHours(0,0,0,0);
    const labels = Array.from({length: 24}, (_, i) => `${String(i).padStart(2,"0")}:00`);
    const filtered = history.filter(h => h.timestamp >= start && h.timestamp < start + 86400000);
    const map = {};
    filtered.forEach(h => { map[new Date(h.timestamp).getHours()] = h.seconds; });
    const data = labels.map((_, i) => map[i] !== undefined ? map[i] : null);
    renderChart("historyChart", labels, data, `${selectedDate} (毎時)`);
}

function updateDaySliders() {
    const months = [...new Set(history.map(h => {
        const d = new Date(h.timestamp);
        return `${d.getFullYear()}/${d.getMonth()+1}`;
    }))];
    const slider = document.getElementById("dayMonthSlider");
    const selectedMonth = months[slider.value];
    document.getElementById("dayMonthLabel").textContent = selectedMonth || "-";

    const [y, m] = selectedMonth.split("/").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const labels = Array.from({length: lastDay}, (_, i) => `${i + 1}日`);
    const start = new Date(y, m - 1, 1).getTime();
    const end = new Date(y, m, 1).getTime();
    const filtered = history.filter(h => h.timestamp >= start && h.timestamp < end);
    const map = {};
    filtered.forEach(h => { map[new Date(h.timestamp).getDate()] = h.seconds; });
    const data = labels.map((_, i) => map[i + 1] !== undefined ? map[i + 1] : null);
    renderChart("dayChart", labels, data, `${selectedMonth} (日別)`);
}

function updateWeekSliders() {
    const months = [...new Set(history.map(h => {
        const d = new Date(h.timestamp);
        return `${d.getFullYear()}/${d.getMonth()+1}`;
    }))];
    const slider = document.getElementById("weekMonthSlider");
    const selectedMonth = months[slider.value];
    document.getElementById("weekMonthLabel").textContent = selectedMonth || "-";

    const [y, m] = selectedMonth.split("/").map(Number);
    const labels = [];
    let d = new Date(y, m - 1, 1);
    while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
    while (d.getMonth() === m - 1) {
        labels.push(`${d.getMonth() + 1}/${d.getDate()}(週)`);
        d.setDate(d.getDate() + 7);
    }
    const start = new Date(y, m - 1, 1).getTime();
    const end = new Date(y, m, 1).getTime();
    const filtered = history.filter(h => h.timestamp >= start && h.timestamp < end);
    const map = {};
    filtered.forEach(h => {
        const dt = new Date(h.timestamp);
        const diff = dt.getDate() - (dt.getDay() === 0 ? 6 : dt.getDay() - 1);
        const mon = new Date(dt.getFullYear(), dt.getMonth(), diff);
        map[`${mon.getMonth() + 1}/${mon.getDate()}(週)`] = h.seconds;
    });
    const data = labels.map(l => map[l] !== undefined ? map[l] : null);
    renderChart("weekChart", labels, data, `${selectedMonth} (週別)`);
}

/* タブ切り替え時の初期化 */
function initMinSliders() {
    const days = [...new Set(history.map(h => {
        const d = new Date(h.timestamp);
        return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
    }))];
    if(days.length > 0) {
        document.getElementById("dateSlider").max = days.length - 1;
        document.getElementById("dateSlider").value = days.length - 1;
        document.getElementById("hourSlider").value = new Date().getHours();
    }
    updateMinSliders();
}

function initHourSliders() {
    const days = [...new Set(history.map(h => {
        const d = new Date(h.timestamp);
        return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
    }))];
    if(days.length > 0) {
        document.getElementById("hourDateSlider").max = days.length - 1;
        document.getElementById("hourDateSlider").value = days.length - 1;
    }
    updateHourSliders();
}

function initDaySliders() {
    const months = [...new Set(history.map(h => {
        const d = new Date(h.timestamp);
        return `${d.getFullYear()}/${d.getMonth()+1}`;
    }))];
    if(months.length > 0) {
        document.getElementById("dayMonthSlider").max = months.length - 1;
        document.getElementById("dayMonthSlider").value = months.length - 1;
    }
    updateDaySliders();
}

function initWeekSliders() {
    const months = [...new Set(history.map(h => {
        const d = new Date(h.timestamp);
        return `${d.getFullYear()}/${d.getMonth()+1}`;
    }))];
    if(months.length > 0) {
        document.getElementById("weekMonthSlider").max = months.length - 1;
        document.getElementById("weekMonthSlider").value = months.length - 1;
    }
    updateWeekSliders();
}

/* イベント登録 */
window.showSubTab = function(type) {
    document.querySelectorAll(".subTabContent").forEach(c => c.style.display = "none");
    document.getElementById("sub" + type.charAt(0).toUpperCase() + type.slice(1)).style.display = "block";
    document.querySelectorAll(".subTab").forEach(b => b.classList.remove("active"));
    event.currentTarget.classList.add("active");
    if(type === "min") initMinSliders();
    if(type === "hour") initHourSliders();
    if(type === "day") initDaySliders();
    if(type === "week") initWeekSliders();
};

document.getElementById("dateSlider").oninput = updateMinSliders;
document.getElementById("hourSlider").oninput = updateMinSliders;
document.getElementById("hourDateSlider").oninput = updateHourSliders;
document.getElementById("dayMonthSlider").oninput = updateDaySliders;
document.getElementById("weekMonthSlider").oninput = updateWeekSliders;

document.getElementById("timerTab").onclick = () => {
    document.getElementById("timerPage").style.display = "block";
    document.getElementById("graphPage").style.display = "none";
    document.getElementById("timerTab").classList.add("active");
    document.getElementById("graphTab").classList.remove("active");
};

document.getElementById("graphTab").onclick = () => {
    document.getElementById("timerPage").style.display = "none";
    document.getElementById("graphPage").style.display = "block";
    document.getElementById("graphTab").classList.add("active");
    document.getElementById("timerTab").classList.remove("active");
    showSubTab("min");
};

/* タイマー基本機能 */
function startLoop() {
    clearInterval(timer);
    timer = setInterval(() => {
        if (mode === "up") seconds++;
        if (mode === "down") {
            seconds--;
            if (seconds <= 0) { seconds = 0; mode = "stop"; clearInterval(timer); }
        }
        timerText.textContent = formatTime(seconds);
        saveData();
    }, 1000);
}

document.getElementById("upBtn").onclick = () => { mode = "up"; startLoop(); };
document.getElementById("downBtn").onclick = () => { mode = "down"; startLoop(); };
document.getElementById("stopBtn").onclick = () => { mode = "stop"; clearInterval(timer); saveData(); };
document.getElementById("resetBtn").onclick = () => {
    if (!confirm("リセット？")) return;
    seconds = 0; mode = "stop"; history = []; clearInterval(timer);
    dataRef.set({ seconds: 0, mode: "stop", lastUpdate: now() });
    db.ref("timebank/history").remove();
    timerText.textContent = formatTime(0);
};

/* データ同期 */
dataRef.on("value", snap => {
    const data = snap.val();
    if (!data) return;
    seconds = data.seconds || 0;
    mode = data.mode || "stop";
    lastUpdate = data.lastUpdate || now();
    if (mode !== "stop") {
        const diff = Math.floor((now() - lastUpdate) / 1000);
        if (mode === "up") seconds += diff;
        else seconds -= Math.max(0, diff);
        startLoop();
    }
    timerText.textContent = formatTime(seconds);
});

db.ref("timebank/history").on("value", snap => {
    const data = snap.val();
    history = data ? Object.values(data).sort((a, b) => a.timestamp - b.timestamp) : [];
});

function saveData() {
    const t = now();
    dataRef.update({ seconds, mode, lastUpdate: t });
    if (t - lastHistorySave > 10000) {
        db.ref("timebank/history").push({ timestamp: t, seconds });
        lastHistorySave = t;
    }
}
