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
   変数管理
========================= */
let timer = null;
let seconds = 0;
let mode = "stop";
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
   タイマー
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
    if (!confirm("データを全消去してリセットしますか？")) return;
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
    if (mode !== "stop") startLoop();
    timerText.textContent = formatTime(seconds);
});

db.ref("timebank/history").on("value", snap => {
    const d = snap.val();
    history = d ? Object.values(d).sort((a, b) => a.timestamp - b.timestamp) : [];
    if(document.getElementById("graphPage").style.display === "block") refreshChart();
});

/* =========================
   UI操作
========================= */
window.toggleConfig = function() {
    const panel = document.getElementById("configPanel");
    panel.style.display = (panel.style.display === "none") ? "flex" : "none";
};

document.getElementById("yMaxSlider").oninput = function() {
    const val = parseInt(this.value);
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
    const activeTab = document.querySelector(".subTab.active");
    if (!activeTab) return;
    const name = activeTab.textContent.toLowerCase();
    const updateMap = { min:updateMinSliders, hour:updateHourSliders, day:updateDaySliders, week:updateWeekSliders, month:updateMonthSliders, year:updateYearSliders };
    if(updateMap[name]) updateMap[name]();
}

/* =========================
   描画
========================= */
function renderChart(canvasId, labels, data, label) {
    const canvas = document.getElementById(canvasId);
    if(!canvas) return;
    const ctx = canvas.getContext("2d");
    const key = "_chart_" + canvasId;
    if (window[key]) window[key].destroy();
    window[key] = new Chart(ctx, {
        type: "line",
        data: { labels, datasets: [{ label, data, borderColor: '#007aff', backgroundColor: 'rgba(0,122,255,0.1)', fill: true, tension: 0.1, pointRadius: 2 }] },
        options: {
            responsive: true, maintainAspectRatio: false, animation: false,
            scales: { y: { beginAtZero: true, max: currentYMax ? Number(currentYMax) : undefined } }
        }
    });
}

// スライダー位置を現在時刻に合わせる便利関数
function setSliderToCurrent(sliderId, list, currentVal) {
    const slider = document.getElementById(sliderId);
    slider.max = Math.max(0, list.length - 1);
    const idx = list.indexOf(currentVal);
    if (idx !== -1) slider.value = idx;
}

function updateMinSliders() {
    const days = [...new Set(history.map(h => new Date(h.timestamp).toLocaleDateString()))];
    const ds = document.getElementById("dateSlider");
    const selectedDate = days[ds.value];
    const hour = parseInt(document.getElementById("hourSlider").value);
    document.getElementById("dateLabel").textContent = selectedDate || "-";
    document.getElementById("hourLabel").textContent = hour + "時";
    if (!selectedDate) return;
    const start = new Date(selectedDate).setHours(hour,0,0,0);
    const labels = Array.from({length:60}, (_,i) => `${hour}:${String(i).padStart(2,'0')}`);
    const filtered = history.filter(h => h.timestamp >= start && h.timestamp < start + 3600000);
    const map = {}; filtered.forEach(h => map[new Date(h.timestamp).getMinutes()] = h.seconds);
    renderChart("minChart", labels, labels.map((_,i) => map[i] ?? null), "分次推移");
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
    renderChart("historyChart", labels, labels.map((_,i) => map[i] ?? null), "24時間推移");
}

function updateDaySliders() {
    const months = [...new Set(history.map(h => { const d = new Date(h.timestamp); return `${d.getFullYear()}/${d.getMonth()+1}`; }))];
    const selectedMonth = months[document.getElementById("dayMonthSlider").value];
    document.getElementById("dayMonthLabel").textContent = selectedMonth || "-";
    if (!selectedMonth) return;
    const [y, m] = selectedMonth.split("/").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const labels = Array.from({length: lastDay}, (_,i) => (i+1)+"日");
    const filtered = history.filter(h => { const d = new Date(h.timestamp); return d.getFullYear()===y && (d.getMonth()+1)===m; });
    const map = {}; filtered.forEach(h => map[new Date(h.timestamp).getDate()] = h.seconds);
    renderChart("dayChart", labels, labels.map((_,i) => map[i+1] ?? null), "日別推移");
}

function updateWeekSliders() {
    const months = [...new Set(history.map(h => { const d = new Date(h.timestamp); return `${d.getFullYear()}/${d.getMonth()+1}`; }))];
    const selectedMonth = months[document.getElementById("weekMonthSlider").value];
    document.getElementById("weekMonthLabel").textContent = selectedMonth || "-";
    if (!selectedMonth) return;
    const map = {};
    history.forEach(h => {
        const d = new Date(h.timestamp);
        if(`${d.getFullYear()}/${d.getMonth()+1}` === selectedMonth) {
            const week = Math.ceil(d.getDate() / 7);
            map[week] = h.seconds;
        }
    });
    renderChart("weekChart", ["第1週","第2週","第3週","第4週","第5週"], [1,2,3,4,5].map(w => map[w] ?? null), "週別推移");
}

function updateMonthSliders() {
    const years = [...new Set(history.map(h => new Date(h.timestamp).getFullYear()))];
    const selectedYear = years[document.getElementById("monthYearSlider").value];
    document.getElementById("monthYearLabel").textContent = selectedYear || "-";
    if (!selectedYear) return;
    const map = {};
    history.forEach(h => {
        const d = new Date(h.timestamp);
        if(d.getFullYear() === selectedYear) map[d.getMonth()+1] = h.seconds;
    });
    const labels = Array.from({length:12}, (_,i) => (i+1)+"月");
    renderChart("monthChart", labels, labels.map((_,i) => map[i+1] ?? null), "月別推移");
}

function updateYearSliders() {
    const years = [...new Set(history.map(h => new Date(h.timestamp).getFullYear()))].sort();
    const map = {};
    history.forEach(h => { const d = new Date(h.timestamp); map[d.getFullYear()] = h.seconds; });
    renderChart("yearChart", years.map(String), years.map(y => map[y] ?? null), "年別推移");
}

/* =========================
   タブ・初期化
========================= */
window.showSubTab = function(type, isFirstOpen = false) {
    document.getElementById("configPanel").style.display = "none";
    document.querySelectorAll(".subTabContent").forEach(c => c.style.display="none");
    const target = document.getElementById("sub"+type.charAt(0).toUpperCase()+type.slice(1));
    if(target) target.style.display="block";
    
    document.querySelectorAll(".subTab").forEach(b => {
        b.classList.remove("active");
        if(b.textContent.toLowerCase() === type) b.classList.add("active");
    });

    const now = new Date();
    const curDate = now.toLocaleDateString();
    const curMonth = `${now.getFullYear()}/${now.getMonth()+1}`;
    const curYear = now.getFullYear();

    if(type==='min') {
        const days = [...new Set(history.map(h => new Date(h.timestamp).toLocaleDateString()))];
        if(isFirstOpen) {
            setSliderToCurrent("dateSlider", days, curDate);
            document.getElementById("hourSlider").value = now.getHours();
        }
        updateMinSliders();
    }
    if(type==='hour') {
        const days = [...new Set(history.map(h => new Date(h.timestamp).toLocaleDateString()))];
        if(isFirstOpen) setSliderToCurrent("hourDateSlider", days, curDate);
        updateHourSliders();
    }
    if(type==='day') {
        const months = [...new Set(history.map(h => { const d = new Date(h.timestamp); return `${d.getFullYear()}/${d.getMonth()+1}`; }))];
        if(isFirstOpen) setSliderToCurrent("dayMonthSlider", months, curMonth);
        updateDaySliders();
    }
    if(type==='week') {
        const months = [...new Set(history.map(h => { const d = new Date(h.timestamp); return `${d.getFullYear()}/${d.getMonth()+1}`; }))];
        if(isFirstOpen) setSliderToCurrent("weekMonthSlider", months, curMonth);
        updateWeekSliders();
    }
    if(type==='month') {
        const years = [...new Set(history.map(h => new Date(h.timestamp).getFullYear()))];
        if(isFirstOpen) setSliderToCurrent("monthYearSlider", years, curYear);
        updateMonthSliders();
    }
    if(type==='year') updateYearSliders();
};

// イベント登録
document.getElementById("dateSlider").oninput = updateMinSliders;
document.getElementById("hourSlider").oninput = updateMinSliders;
document.getElementById("hourDateSlider").oninput = updateHourSliders;
document.getElementById("dayMonthSlider").oninput = updateDaySliders;
document.getElementById("weekMonthSlider").oninput = updateWeekSliders;
document.getElementById("monthYearSlider").oninput = updateMonthSliders;

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
    // 初回オープン時は現在時刻に合わせる
    showSubTab('min', true);
};
