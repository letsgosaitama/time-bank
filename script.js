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

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const ref = db.ref("timebank/state");

/* =========================
   内部状態
========================= */
let timer = null;
let state = {
    mode: "stop",
    startTime: null,
    endTime: null,
    accumulated: 0
};

let lastPush = 0;
let displayMode = "hms";
const timerText = document.getElementById("timer");

/* =========================
   計算・表示
========================= */
function getSeconds() {
    const now = Date.now();
    if (state.mode === "up") {
        return Math.floor(state.accumulated + (now - state.startTime) / 1000);
    }
    if (state.mode === "down") {
        return Math.max(0, Math.floor((state.endTime - now) / 1000));
    }
    return Math.floor(state.accumulated);
}

function formatTime(sec) {
    if (displayMode === "sec") return sec + "s";
    const h = String(Math.floor(sec / 3600)).padStart(2, "0");
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
}

function render() {
    if (timerText) timerText.textContent = formatTime(getSeconds());
}

/* =========================
   Firebase送信 (ここ以外で保存しない)
========================= */
function saveState() {
    ref.set({
        mode: state.mode,
        startTime: state.startTime,
        endTime: state.endTime,
        accumulated: state.accumulated,
        updatedAt: Date.now()
    });
}

function pushHistory() {
    const today = new Date().toISOString().slice(0, 10);
    const currentSec = getSeconds();
    db.ref(`timebank/history/${today}`).push({
        timestamp: Date.now(),
        seconds: currentSec
    });
    db.ref(`timebank/daily_summary/${today}`).set({
        timestamp: Date.now(),
        seconds: currentSec
    });
}

/* =========================
   タイマー制御
========================= */
function startLoop() {
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
        render();
        const now = Date.now();
        if (now - lastPush > 60000) {
            pushHistory();
            lastPush = now;
        }
        if (state.mode === "down" && state.endTime <= now) {
            state.mode = "stop";
            state.endTime = null;
            state.accumulated = 0;
            saveState();
            clearInterval(timer);
        }
    }, 1000);
}

/* =========================
   Firebase受信 (無限ループ防止)
========================= */
ref.on("value", snap => {
    const d = snap.val();
    if (!d) return;

    state = {
        mode: d.mode || "stop",
        startTime: d.startTime || null,
        endTime: d.endTime || null,
        accumulated: d.accumulated || 0
    };

    if (state.mode !== "stop") {
        if (!timer) startLoop();
    } else {
        if (timer) { clearInterval(timer); timer = null; }
    }
    render();
    if (lastPush === 0) lastPush = Date.now();
});

/* =========================
   UI切り替え (TIMER / GRAPH)
========================= */
document.addEventListener("DOMContentLoaded", () => {
    const graphTab = document.getElementById("graphTab");
    const timerTab = document.getElementById("timerTab");
    const graphPage = document.getElementById("graphPage");
    const timerPage = document.getElementById("timerPage");

    graphTab.addEventListener("click", () => {
        graphPage.style.display = "block";
        timerPage.style.display = "none";
        graphTab.classList.add("active");
        timerTab.classList.remove("active");
        showSubTab('min'); 
    });

    timerTab.addEventListener("click", () => {
        graphPage.style.display = "none";
        timerPage.style.display = "block";
        timerTab.classList.add("active");
        graphTab.classList.remove("active");
    });
});

/* =========================
   サブタブ表示 (MIN, HOUR, DAY...)
========================= */
window.showSubTab = function(type) {
    document.querySelectorAll(".subTabContent").forEach(c => c.style.display = "none");

    const targetId = "sub" + type.charAt(0).toUpperCase() + type.slice(1);
    const targetEl = document.getElementById(targetId);
    if (targetEl) targetEl.style.display = "block";

    document.querySelectorAll(".subTab").forEach(btn => {
        btn.classList.remove("active");
        if (btn.textContent.trim().toLowerCase() === type.toLowerCase()) {
            btn.classList.add("active");
        }
    });

    refreshChart();
};

/* =========================
   グラフ更新ロジック
========================= */
function refreshChart() {
    const active = document.querySelector(".subTab.active");
    if (!active) return;
    const name = active.textContent.trim().toLowerCase();

    if (name === "min") fetchHistory("min");
    // 他の updateDay, updateMonth 等もここに繋げる
}

function fetchHistory(type) {
    const slider = document.getElementById("dateSlider");
    if (!slider) return;

    db.ref("timebank/history").once("value", snap => {
        const data = snap.val() || {};
        const days = Object.keys(data).sort();
        if (days.length === 0) return;

        slider.max = days.length - 1;
        const selectedDate = days[slider.value || 0];
        document.getElementById("dateLabel").textContent = selectedDate;

        const list = Object.values(data[selectedDate]).sort((a,b)=>a.timestamp-b.timestamp);
        const labels = list.map(x => {
            const d = new Date(x.timestamp);
            return `${d.getHours()}:${String(d.getMinutes()).padStart(2,"0")}`;
        });
        const values = list.map(x => x.seconds);

        renderChart("minChart", labels, values, "Time Log (sec)");
    });
}

function renderChart(id, labels, data, label) {
    const canvas = document.getElementById(id);
    if (!canvas || !window.Chart) return;
    const ctx = canvas.getContext("2d");
    const key = "_chart_" + id;
    if (window[key]) window[key].destroy();

    window[key] = new Chart(ctx, {
        type: "line",
        data: {
            labels,
            datasets: [{
                label,
                data,
                borderColor: "#007aff",
                backgroundColor: "rgba(0,122,255,0.1)",
                fill: true,
                tension: 0.2
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, animation: false }
    });
}

/* =========================
   ボタン操作
========================= */
document.getElementById("upBtn").onclick = () => {
    if (state.mode === "up") return;
    state.mode = "up"; state.startTime = Date.now(); saveState();
};
document.getElementById("downBtn").onclick = () => {
    if (state.mode === "down" || state.accumulated <= 0) return;
    state.mode = "down"; state.endTime = Date.now() + (state.accumulated * 1000); saveState();
};
document.getElementById("stopBtn").onclick = () => {
    if (state.mode === "stop") return;
    if (state.mode === "up") state.accumulated += Math.floor((Date.now() - state.startTime) / 1000);
    else if (state.mode === "down") state.accumulated = Math.max(0, Math.floor((state.endTime - Date.now()) / 1000));
    state.mode = "stop"; state.startTime = null; state.endTime = null; saveState();
};
document.getElementById("resetBtn").onclick = () => {
    if (!confirm("リセットしますか？")) return;
    db.ref("timebank").remove(); location.reload();
};
