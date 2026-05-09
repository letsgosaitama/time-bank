/* =========================
   Firebase設定
========================= */
const firebaseConfig = {
  apiKey: "AIzaSyBOxVHqeHmdL3KVvUDFCGh6hGAd8LbEL2w",
  authDomain: "timebank-1c2f8.firebaseapp.com",
  databaseURL: "https://timebank-1c2f8-default-rtdb.firebaseio.com",
  projectId: "timebank-1c2f8",
  storageBucket: "timebank-1c2f8.firebasestorage.app",
  messagingSenderId: "879959904736",
  appId: "1:879959904736:web:bee79380194a6b3ba1db85"
};

if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
const db = firebase.database();
const dataRef = db.ref("timebank");

/* =========================
   基本変数
========================= */
let timer = null;
let seconds = 0;
let mode = "stop";
let dailySummary = [];
let currentYMax = null;
let displayMode = "hms";
let lastPush = 0;

const timerText = document.getElementById("timer");

function formatTime(sec) {
    if (displayMode === "sec") return sec + "s";
    const h = String(Math.floor(sec / 3600)).padStart(2, "0");
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
}

timerText.onclick = () => {
    displayMode = (displayMode === "hms") ? "sec" : "hms";
    timerText.textContent = formatTime(seconds);
};

/* =========================
   保存 & クリーンアップロジック
========================= */
function saveData(force = false) {
    const now = new Date();
    const t = now.getTime();
    const todayStr = now.toLocaleDateString().replace(/\//g, '-');

    if (force || (t - lastPush > 300000)) { // 5分毎または強制保存
        dataRef.update({ seconds, mode, lastUpdate: t });
        db.ref(`timebank/history/${todayStr}`).push({ timestamp: t, seconds });
        db.ref(`timebank/daily_summary/${todayStr}`).set({ timestamp: t, seconds });
        lastPush = t;
        cleanupOldHistory();
    }
}

function cleanupOldHistory() {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    db.ref("timebank/history").once("value", snap => {
        const historyData = snap.val();
        if (!historyData) return;
        Object.keys(historyData).forEach(dateStr => {
            const folderDate = new Date(dateStr).getTime();
            if (folderDate < sevenDaysAgo) db.ref(`timebank/history/${dateStr}`).remove();
        });
    });
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
            if (seconds <= 0) { seconds = 0; mode = "stop"; clearInterval(timer); saveData(true); }
        }
        timerText.textContent = formatTime(seconds);
        saveData(false);
    }, 1000);
}

document.getElementById("upBtn").onclick = () => { mode = "up"; startLoop(); };
document.getElementById("downBtn").onclick = () => { mode = "down"; startLoop(); };
document.getElementById("stopBtn").onclick = () => { mode = "stop"; clearInterval(timer); saveData(true); };
document.getElementById("resetBtn").onclick = () => {
    if (!confirm("全データを完全に削除しますか？")) return;
    seconds = 0; mode = "stop";
    dataRef.set({ seconds: 0, mode: "stop", lastUpdate: Date.now() });
    db.ref("timebank/history").remove();
    db.ref("timebank/daily_summary").remove();
};

/* =========================
   データ同期
========================= */
dataRef.on("value", snap => {
    const d = snap.val(); if (!d) return;
    if (mode === "stop") {
        seconds = d.seconds || 0;
        mode = d.mode || "stop";
        timerText.textContent = formatTime(seconds);
    }
    if (lastPush === 0) lastPush = Date.now();
});

db.ref("timebank/daily_summary").on("value", snap => {
    const d = snap.val();
    dailySummary = d ? Object.values(d).sort((a, b) => a.timestamp - b.timestamp) : [];
    if (document.getElementById("graphPage").style.display === "block") refreshChart();
});

/* =========================
   グラフ描画
========================= */
function refreshChart() {
    const activeTab = document.querySelector(".subTab.active");
    if (!activeTab) return;
    const name = activeTab.textContent.toLowerCase();
    
    if (name === 'min' || name === 'hour') {
        fetchHistoryAndRender(name);
    } else {
        const updateMap = { day:updateDaySliders, month:updateMonthSliders, year:updateYearSliders };
        if (updateMap[name]) updateMap[name]();
    }
}

function fetchHistoryAndRender(type) {
    const ds = (type === 'min') ? document.getElementById("dateSlider") : document.getElementById("hourDateSlider");
    
    db.ref("timebank/history").once("value", snap => {
        const hData = snap.val() || {};
        const days = Object.keys(hData).sort();
        if (days.length === 0) return;

        // 日付スライダーの最大値を設定し、最新（今日）を選択
        ds.max = days.length - 1;
        if (ds.dataset.initialized !== "true") {
            ds.value = ds.max; // 初期表示は最新日
            ds.dataset.initialized = "true";
        }

        const selectedDate = days[ds.value];
        const dayHistory = Object.values(hData[selectedDate] || {}).sort((a, b) => a.timestamp - b.timestamp);
        
        if (type === 'min') renderMinChart(selectedDate, dayHistory);
        else renderHourChart(selectedDate, dayHistory);
    });
}

function renderMinChart(selectedDate, dayHistory) {
    const hSlider = document.getElementById("hourSlider");
    
    // 【追加】初めてグラフを開いた時、スライダーを現在の時刻に合わせる
    if (hSlider.dataset.initialized !== "true") {
        hSlider.value = new Date().getHours();
        hSlider.dataset.initialized = "true";
    }

    const hour = parseInt(hSlider.value);
    document.getElementById("dateLabel").textContent = selectedDate;
    document.getElementById("hourLabel").textContent = hour + "時";
    
    const labels = Array.from({length:60}, (_,i) => `${hour}:${String(i).padStart(2,'0')}`);
    const map = {};
    dayHistory.forEach(h => {
        const d = new Date(h.timestamp);
        if (d.getHours() === hour) map[d.getMinutes()] = h.seconds;
    });
    renderChart("minChart", labels, labels.map((_,i) => map[i] ?? null), "分次（5分毎更新）");
}

function renderHourChart(selectedDate, dayHistory) {
    document.getElementById("hourDateLabel").textContent = selectedDate;
    const labels = Array.from({length:24}, (_,i) => i+":00");
    const map = {};
    dayHistory.forEach(h => {
        const d = new Date(h.timestamp);
        map[d.getHours()] = h.seconds;
    });
    renderChart("historyChart", labels, labels.map((_,i) => map[i] ?? null), "時間次");
}

function updateDaySliders() {
    const months = [...new Set(dailySummary.map(h => { const d = new Date(h.timestamp); return `${d.getFullYear()}/${d.getMonth()+1}`; }))];
    const slider = document.getElementById("dayMonthSlider");
    slider.max = Math.max(0, months.length - 1);
    const selectedMonth = months[slider.value];
    document.getElementById("dayMonthLabel").textContent = selectedMonth || "-";
    if (!selectedMonth) return;
    const [y, m] = selectedMonth.split("/").map(Number);
    const labels = Array.from({length: new Date(y, m, 0).getDate()}, (_,i) => (i+1)+"日");
    const map = {}; dailySummary.forEach(h => {
        const d = new Date(h.timestamp);
        if(d.getFullYear()===y && (d.getMonth()+1)===m) map[d.getDate()] = h.seconds;
    });
    renderChart("dayChart", labels, labels.map((_,i) => map[i+1] ?? null), "日別");
}

function updateMonthSliders() {
    const years = [...new Set(dailySummary.map(h => new Date(h.timestamp).getFullYear()))].sort();
    const slider = document.getElementById("monthYearSlider");
    slider.max = Math.max(0, years.length - 1);
    const selectedYear = years[slider.value];
    document.getElementById("monthYearLabel").textContent = selectedYear || "-";
    if (!selectedYear) return;
    const map = {}; dailySummary.forEach(h => {
        const d = new Date(h.timestamp);
        if(d.getFullYear() === selectedYear) map[d.getMonth()+1] = h.seconds;
    });
    const labels = Array.from({length:12}, (_,i) => (i+1)+"月");
    renderChart("monthChart", labels, labels.map((_,i) => map[i+1] ?? null), "月別");
}

function updateYearSliders() {
    const years = [...new Set(dailySummary.map(h => new Date(h.timestamp).getFullYear()))].sort();
    const map = {}; dailySummary.forEach(h => { const d = new Date(h.timestamp); map[d.getFullYear()] = h.seconds; });
    renderChart("yearChart", years.map(String), years.map(y => map[y] ?? null), "年別");
}

function renderChart(canvasId, labels, data, label) {
    const canvas = document.getElementById(canvasId); if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const key = "_chart_" + canvasId;
    if (window[key]) window[key].destroy();
    window[key] = new Chart(ctx, {
        type: "line",
        data: { labels, datasets: [{ label, data, borderColor: '#007aff', backgroundColor: 'rgba(0,122,255,0.1)', fill: true, tension: 0.1, pointRadius: 2 }] },
        options: { responsive: true, maintainAspectRatio: false, animation: false, scales: { y: { beginAtZero: true, max: currentYMax ? Number(currentYMax) : undefined } } }
    });
}

/* =========================
   タブ & 設定
========================= */
window.showSubTab = function (type, isFirstOpen = false) {
    document.querySelectorAll(".subTabContent").forEach(c => c.style.display = "none");
    const target = document.getElementById("sub" + type.charAt(0).toUpperCase() + type.slice(1));
    if (target) target.style.display = "block";
    document.querySelectorAll(".subTab").forEach(b => b.classList.toggle("active", b.textContent.toLowerCase() === type));
    refreshChart();
};

window.toggleConfig = () => { const p = document.getElementById("configPanel"); p.style.display = p.style.display === "none" ? "flex" : "none"; };
document.getElementById("yMaxSlider").oninput = function() {
    currentYMax = (this.value >= 85000) ? null : this.value;
    document.getElementById("yMaxDisplay").textContent = currentYMax ? currentYMax + "s" : "AUTO";
    refreshChart();
};

document.getElementById("dateSlider").oninput = refreshChart;
document.getElementById("hourSlider").oninput = refreshChart;
document.getElementById("hourDateSlider").oninput = refreshChart;
document.getElementById("dayMonthSlider").oninput = refreshChart;
document.getElementById("monthYearSlider").oninput = refreshChart;

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
    showSubTab('min', true); 
};
