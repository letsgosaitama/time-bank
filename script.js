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
let history = [];
let dailySummary = [];
let currentYMax = null;
let displayMode = "hms";
let lastPush = 0;
let lastDate = new Date().toDateString();

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
   保存・クリーンアップロジック
========================= */

// 古いヒストリ（詳細ログ）だけを消し、サマリーと秒数は維持する
function cleanupOldHistory() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    db.ref("timebank/history").once("value", snap => {
        const data = snap.val();
        if (!data) return;
        Object.entries(data).forEach(([key, val]) => {
            if (val.timestamp < todayStart) {
                db.ref("timebank/history/" + key).remove();
            }
        });
    });
    console.log("0時のクリーンアップ完了: 詳細ヒストリを削除しました。");
}

function saveData() {
    const now = new Date();
    const t = now.getTime();
    const todayStr = now.toLocaleDateString().replace(/\//g, '-');

    // 1. 日付またぎのチェック
    const nowDate = now.toDateString();
    if (nowDate !== lastDate) {
        // 0時を過ぎた瞬間、前日の最終集計を確定保存
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yestStr = yesterday.toLocaleDateString().replace(/\//g, '-');
        db.ref("timebank/daily_summary/" + yestStr).set({ timestamp: t - 1000, seconds: seconds });
        
        // 履歴の削除を実行
        cleanupOldHistory();
        lastDate = nowDate;
    }

    // 2. 現在の秒数を常に同期（リセットせず昨日の記録から継続）
    dataRef.update({ seconds, mode, lastUpdate: t });

    // 3. グラフ用データ保存（1分間隔）
    if (t - lastPush > 60000) {
        db.ref("timebank/history").push({ timestamp: t, seconds });
        db.ref("timebank/daily_summary/" + todayStr).set({ timestamp: t, seconds });
        lastPush = t;
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
    if (!confirm("データを全消去しますか？")) return;
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
    seconds = d.seconds || 0;
    mode = d.mode || "stop";
    if (mode !== "stop") startLoop();
    timerText.textContent = formatTime(seconds);
    if (lastPush === 0) lastPush = Date.now();
});

db.ref("timebank/history").on("value", snap => {
    const d = snap.val();
    history = d ? Object.values(d).sort((a, b) => a.timestamp - b.timestamp) : [];
});

db.ref("timebank/daily_summary").on("value", snap => {
    const d = snap.val();
    dailySummary = d ? Object.values(d).sort((a, b) => a.timestamp - b.timestamp) : [];
    if (document.getElementById("graphPage").style.display === "block") refreshChart();
});

/* =========================
   グラフ描画
========================= */
window.toggleConfig = function() {
    const panel = document.getElementById("configPanel");
    panel.style.display = (panel.style.display === "none") ? "flex" : "none";
};

document.getElementById("yMaxSlider").oninput = function() {
    const val = parseInt(this.value);
    if (val >= 85000) { currentYMax = null; document.getElementById("yMaxDisplay").textContent = "AUTO"; }
    else { currentYMax = val; document.getElementById("yMaxDisplay").textContent = val + "s"; }
    refreshChart();
};

function refreshChart() {
    const activeTab = document.querySelector(".subTab.active");
    if (!activeTab) return;
    const name = activeTab.textContent.toLowerCase();
    const updateMap = { min:updateMinSliders, hour:updateHourSliders, day:updateDaySliders, month:updateMonthSliders, year:updateYearSliders };
    if (updateMap[name]) updateMap[name]();
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

function setSliderToCurrent(sliderId, list, currentVal) {
    const slider = document.getElementById(sliderId); if (!slider) return;
    slider.max = Math.max(0, list.length - 1);
    const idx = list.indexOf(currentVal);
    slider.value = (idx !== -1) ? idx : slider.max;
}

// 各グラフロジック（当日分のhistoryと永久保存のdailySummaryを使い分け）
function updateMinSliders() {
    const days = [...new Set(history.map(h => new Date(h.timestamp).toLocaleDateString()))];
    const ds = document.getElementById("dateSlider");
    const selectedDate = days[ds.value];
    const hour = parseInt(document.getElementById("hourSlider").value);
    document.getElementById("dateLabel").textContent = selectedDate || "-";
    document.getElementById("hourLabel").textContent = hour + "時";
    if (!selectedDate) return;
    const labels = Array.from({length:60}, (_,i) => `${hour}:${String(i).padStart(2,'0')}`);
    const map = {}; history.forEach(h => {
        const d = new Date(h.timestamp);
        if(d.toLocaleDateString() === selectedDate && d.getHours() === hour) map[d.getMinutes()] = h.seconds;
    });
    renderChart("minChart", labels, labels.map((_,i) => map[i] ?? null), "分次推移(当日)");
}

function updateHourSliders() {
    const days = [...new Set(history.map(h => new Date(h.timestamp).toLocaleDateString()))];
    const ds = document.getElementById("hourDateSlider");
    const selectedDate = days[ds.value];
    document.getElementById("hourDateLabel").textContent = selectedDate || "-";
    if (!selectedDate) return;
    const labels = Array.from({length:24}, (_,i) => i+":00");
    const map = {}; history.forEach(h => {
        const d = new Date(h.timestamp);
        if(d.toLocaleDateString() === selectedDate) map[d.getHours()] = h.seconds;
    });
    renderChart("historyChart", labels, labels.map((_,i) => map[i] ?? null), "24時間推移(当日)");
}

function updateDaySliders() {
    const months = [...new Set(dailySummary.map(h => { const d = new Date(h.timestamp); return `${d.getFullYear()}/${d.getMonth()+1}`; }))];
    const ds = document.getElementById("dayMonthSlider");
    const selectedMonth = months[ds.value];
    document.getElementById("dayMonthLabel").textContent = selectedMonth || "-";
    if (!selectedMonth) return;
    const [y, m] = selectedMonth.split("/").map(Number);
    const labels = Array.from({length: new Date(y, m, 0).getDate()}, (_,i) => (i+1)+"日");
    const map = {}; dailySummary.forEach(h => {
        const d = new Date(h.timestamp);
        if(d.getFullYear()===y && (d.getMonth()+1)===m) map[d.getDate()] = h.seconds;
    });
    renderChart("dayChart", labels, labels.map((_,i) => map[i+1] ?? null), "日別推移(全期間)");
}

function updateMonthSliders() {
    const years = [...new Set(dailySummary.map(h => new Date(h.timestamp).getFullYear()))].sort();
    const ds = document.getElementById("monthYearSlider");
    const selectedYear = years[ds.value];
    document.getElementById("monthYearLabel").textContent = selectedYear || "-";
    if (!selectedYear) return;
    const map = {}; dailySummary.forEach(h => {
        const d = new Date(h.timestamp);
        if(d.getFullYear() === selectedYear) map[d.getMonth()+1] = h.seconds;
    });
    const labels = Array.from({length:12}, (_,i) => (i+1)+"月");
    renderChart("monthChart", labels, labels.map((_,i) => map[i+1] ?? null), "月別推移");
}

function updateYearSliders() {
    const years = [...new Set(dailySummary.map(h => new Date(h.timestamp).getFullYear()))].sort();
    const map = {}; dailySummary.forEach(h => { const d = new Date(h.timestamp); map[d.getFullYear()] = h.seconds; });
    renderChart("yearChart", years.map(String), years.map(y => map[y] ?? null), "年別推移");
}

/* =========================
   タブ
========================= */
window.showSubTab = function (type, isFirstOpen = false) {
    document.querySelectorAll(".subTabContent").forEach(c => c.style.display = "none");
    const target = document.getElementById("sub" + type.charAt(0).toUpperCase() + type.slice(1));
    if (target) target.style.display = "block";
    document.querySelectorAll(".subTab").forEach(b => b.classList.toggle("active", b.textContent.toLowerCase() === type));

    const now = new Date();
    const historyDays = [...new Set(history.map(h => new Date(h.timestamp).toLocaleDateString()))];
    const monthsSummary = [...new Set(dailySummary.map(h => { const d = new Date(h.timestamp); return `${d.getFullYear()}/${d.getMonth()+1}`; }))];
    const yearsSummary = [...new Set(dailySummary.map(h => new Date(h.timestamp).getFullYear()))].sort();

    if (type === 'min') {
        if (isFirstOpen) { setSliderToCurrent("dateSlider", historyDays, now.toLocaleDateString()); document.getElementById("hourSlider").value = now.getHours(); }
        updateMinSliders();
    } else if (type === 'hour') {
        setSliderToCurrent("hourDateSlider", historyDays, now.toLocaleDateString()); updateHourSliders();
    } else if (type === 'day') {
        setSliderToCurrent("dayMonthSlider", monthsSummary, `${now.getFullYear()}/${now.getMonth()+1}`); updateDaySliders();
    } else if (type === 'month') {
        setSliderToCurrent("monthYearSlider", yearsSummary, now.getFullYear()); updateMonthSliders();
    } else if (type === 'year') {
        updateYearSliders();
    }
};

document.getElementById("dateSlider").oninput = updateMinSliders;
document.getElementById("hourSlider").oninput = updateMinSliders;
document.getElementById("hourDateSlider").oninput = updateHourSliders;
document.getElementById("dayMonthSlider").oninput = updateDaySliders;
document.getElementById("monthYearSlider").oninput = updateMonthSliders;

document.getElementById("timerTab").onclick = () => { document.getElementById("timerPage").style.display = "block"; document.getElementById("graphPage").style.display = "none"; document.getElementById("timerTab").classList.add("active"); document.getElementById("graphTab").classList.remove("active"); };
document.getElementById("graphTab").onclick = () => { document.getElementById("timerPage").style.display = "none"; document.getElementById("graphPage").style.display = "block"; document.getElementById("graphTab").classList.add("active"); document.getElementById("timerTab").classList.remove("active"); showSubTab('min', true); };
