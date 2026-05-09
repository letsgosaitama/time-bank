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
   変数・タイマー
========================= */
let timer = null;
let seconds = 0;
let mode = "stop";
let lastUpdate = Date.now();
let history = [];
let currentYMax = null;

const timerText = document.getElementById("timer");

function formatTime(sec) {
    const h = String(Math.floor(sec / 3600)).padStart(2, "0");
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
}

function saveData() {
    const t = Date.now();
    dataRef.update({ seconds, mode, lastUpdate: t });
    if (t - (window._lastPush || 0) > 10000) {
        db.ref("timebank/history").push({ timestamp: t, seconds });
        window._lastPush = t;
    }
}

/* =========================
   タイマー操作
========================= */
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
    seconds = 0; mode = "stop";
    dataRef.set({ seconds: 0, mode: "stop", lastUpdate: Date.now() });
    db.ref("timebank/history").remove();
};

/* =========================
   Firebase同期
========================= */
dataRef.on("value", snap => {
    const d = snap.val(); if (!d) return;
    seconds = d.seconds || 0; mode = d.mode || "stop";
    lastUpdate = d.lastUpdate || Date.now();
    if (mode !== "stop") startLoop();
    timerText.textContent = formatTime(seconds);
});

db.ref("timebank/history").on("value", snap => {
    const d = snap.val();
    history = d ? Object.values(d).sort((a, b) => a.timestamp - b.timestamp) : [];
});

/* =========================
   縦スライダー機能
========================= */
document.getElementById("yMaxSlider").oninput = function() {
    const val = parseInt(this.value);
    // スライダー最大付近は自動調整(null)
    if (val >= 85000) {
        currentYMax = null;
        document.getElementById("yMaxDisplay").textContent = "AUTO";
    } else {
        currentYMax = val;
        document.getElementById("yMaxDisplay").textContent = val + "s";
    }
    refreshChart();
};

function refreshChart() {
    const active = document.querySelector(".subTab.active").textContent.toLowerCase();
    if (active === "min") updateMinSliders();
    else if (active === "hour") updateHourSliders();
    else if (active === "day") updateDaySliders();
    else if (active === "week") updateWeekSliders();
}

/* =========================
   グラフ描画
========================= */
function renderChart(canvasId, labels, data, label) {
    const ctx = document.getElementById(canvasId).getContext("2d");
    const key = "_chart_" + canvasId;
    if (window[key]) window[key].destroy();
    window[key] = new Chart(ctx, {
        type: "line",
        data: { labels, datasets: [{ label, data, borderColor: '#007aff', backgroundColor: 'rgba(0,122,255,0.1)', fill: true, tension: 0.1 }] },
        options: {
            responsive: true, maintainAspectRatio: false, animation: false,
            scales: { y: { beginAtZero: true, max: currentYMax ? Number(currentYMax) : undefined } }
        }
    });
}

// 各グラフ更新関数 (簡略化)
function updateMinSliders() {
    const days = [...new Set(history.map(h => new Date(h.timestamp).toLocaleDateString()))];
    const dIdx = document.getElementById("dateSlider").value;
    const selectedDate = days[dIdx];
    const hour = parseInt(document.getElementById("hourSlider").value);
    document.getElementById("dateLabel").textContent = selectedDate || "-";
    document.getElementById("hourLabel").textContent = hour + "時";
    
    if (!selectedDate) return;
    const start = new Date(selectedDate).setHours(hour,0,0,0);
    const labels = Array.from({length:60}, (_,i) => `${hour}:${String(i).padStart(2,'0')}`);
    const filtered = history.filter(h => h.timestamp >= start && h.timestamp < start + 3600000);
    const map = {}; filtered.forEach(h => map[new Date(h.timestamp).getMinutes()] = h.seconds);
    const data = labels.map((_,i) => map[i] || null);
    renderChart("minChart", labels, data, "分次推移");
}

function updateHourSliders() {
    const days = [...new Set(history.map(h => new Date(h.timestamp).toLocaleDateString()))];
    const selectedDate = days[document.getElementById("hourDateSlider").value];
    document.getElementById("hourDateLabel").textContent = selectedDate || "-";
    if (!selectedDate) return;
    const start = new Date(selectedDate).setHours(0,0,0,0);
    const labels = Array.from({length:24}, (_,i) => i+":00");
    const filtered = history.filter(h => h.timestamp >= start && h.timestamp < start+86400000);
    const map = {}; filtered.forEach(h => map[new Date(h.timestamp).getHours()] = h.seconds);
    const data = labels.map((_,i) => map[i] || null);
    renderChart("historyChart", labels, data, "24時間推移");
}

function updateDaySliders() {
    const months = [...new Set(history.map(h => { const d = new Date(h.timestamp); return `${d.getFullYear()}/${d.getMonth()+1}`; }))];
    const selectedMonth = months[document.getElementById("dayMonthSlider").value];
    document.getElementById("dayMonthLabel").textContent = selectedMonth || "-";
    if (!selectedMonth) return;
    const [y, m] = selectedMonth.split("/").map(Number);
    const labels = Array.from({length: new Date(y, m, 0).getDate()}, (_,i) => (i+1)+"日");
    const filtered = history.filter(h => { const d = new Date(h.timestamp); return d.getFullYear()===y && (d.getMonth()+1)===m; });
    const map = {}; filtered.forEach(h => map[new Date(h.timestamp).getDate()] = h.seconds);
    const data = labels.map((_,i) => map[i+1] || null);
    renderChart("dayChart", labels, data, "日別推移");
}

function updateWeekSliders() {
    const months = [...new Set(history.map(h => { const d = new Date(h.timestamp); return `${d.getFullYear()}/${d.getMonth()+1}`; }))];
    const selectedMonth = months[document.getElementById("weekMonthSlider").value];
    document.getElementById("weekMonthLabel").textContent = selectedMonth || "-";
    if (!selectedMonth) return;
    const labels = ["第1週", "第2週", "第3週", "第4週", "第5週"];
    // 簡易的な週計算
    const map = {};
    history.forEach(h => {
        const d = new Date(h.timestamp);
        if(`${d.getFullYear()}/${d.getMonth()+1}` === selectedMonth) {
            const week = Math.ceil(d.getDate() / 7);
            map[week] = h.seconds;
        }
    });
    const data = [1,2,3,4,5].map(w => map[w] || null);
    renderChart("weekChart", labels, data, "週別推移");
}

/* =========================
   タブ・イベント
========================= */
window.showSubTab = function(type) {
    document.querySelectorAll(".subTabContent").forEach(c => c.style.display="none");
    document.getElementById("sub"+type.charAt(0).toUpperCase()+type.slice(1)).style.display="block";
    document.querySelectorAll(".subTab").forEach(b => b.classList.remove("active"));
    event.currentTarget.classList.add("active");

    const days = [...new Set(history.map(h => new Date(h.timestamp).toLocaleDateString()))];
    const months = [...new Set(history.map(h => { const d = new Date(h.timestamp); return `${d.getFullYear()}/${d.getMonth()+1}`; }))];
    
    if(type==='min') { document.getElementById("dateSlider").max = days.length-1; updateMinSliders(); }
    if(type==='hour') { document.getElementById("hourDateSlider").max = days.length-1; updateHourSliders(); }
    if(type==='day') { document.getElementById("dayMonthSlider").max = months.length-1; updateDaySliders(); }
    if(type==='week') { document.getElementById("weekMonthSlider").max = months.length-1; updateWeekSliders(); }
};

document.getElementById("dateSlider").oninput = updateMinSliders;
document.getElementById("hourSlider").oninput = updateMinSliders;
document.getElementById("hourDateSlider").oninput = updateHourSliders;
document.getElementById("dayMonthSlider").oninput = updateDaySliders;
document.getElementById("weekMonthSlider").oninput = updateWeekSliders;

document.getElementById("timerTab").onclick = () => {
    document.getElementById("timerPage").style.display="block";
    document.getElementById("graphPage").style.display="none";
    document.getElementById("timerTab").classList.add("active");
    document.getElementById("graphTab").classList.remove("active");
};
document.getElementById("graphTab").onclick = () => {
    document.getElementById("timerPage").style.display="none";
    document.getElementById("graphPage").style.display="block";
    document.getElementById("graphTab").classList.add("active");
    document.getElementById("timerTab").classList.remove("active");
    showSubTab('min');
};
