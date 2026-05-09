
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
const dataRef = db.ref("timebank");

/* =========================
   状態
========================= */
let timer = null;
let mode = "stop";

let accumulated = 0;
let lastStartTime = null;

let lastPush = 0;
let displayMode = "hms";

let dailySummary = [];

const timerText = document.getElementById("timer");

/* =========================
   秒計算（核）
========================= */
function getSeconds() {
    const now = Date.now();

    if (mode === "up") {
        if (!lastStartTime) return accumulated;
        return Math.floor(accumulated + (now - lastStartTime) / 1000);
    }

    return Math.floor(accumulated);
}

/* =========================
   表示
========================= */
function formatTime(sec) {
    if (displayMode === "sec") return sec + "s";

    const h = String(Math.floor(sec / 3600)).padStart(2, "0");
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
}

function render() {
    timerText.textContent = formatTime(getSeconds());
}

timerText.onclick = () => {
    displayMode = displayMode === "hms" ? "sec" : "hms";
    render();
};

/* =========================
   Firebase保存
========================= */
function saveState() {
    dataRef.update({
        mode,
        accumulated,
        lastStartTime,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    });
}

/* =========================
   履歴保存
========================= */
function pushHistory() {
    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);

    db.ref(`timebank/history/${today}`).push({
        timestamp: now,
        seconds: getSeconds()
    });

    db.ref(`timebank/daily_summary/${today}`).set({
        timestamp: now,
        seconds: getSeconds()
    });
}

/* =========================
   タイマー
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

    }, 1000);
}

/* =========================
   ボタン
========================= */
document.getElementById("upBtn")?.addEventListener("click", () => {
    const now = Date.now();

    if (mode !== "up") {
        lastStartTime = now;
    }

    mode = "up";
    saveState();
    startLoop();
});

document.getElementById("stopBtn")?.addEventListener("click", () => {
    const now = Date.now();

    if (mode === "up" && lastStartTime) {
        accumulated += Math.floor((now - lastStartTime) / 1000);
    }

    mode = "stop";
    lastStartTime = null;

    saveState();
    clearInterval(timer);
    timer = null;

    render();
});

document.getElementById("resetBtn")?.addEventListener("click", () => {
    if (!confirm("全部リセット？")) return;

    mode = "stop";
    accumulated = 0;
    lastStartTime = null;

    dataRef.set({ mode, accumulated, lastStartTime });

    db.ref("timebank/history").remove();
    db.ref("timebank/daily_summary").remove();

    clearInterval(timer);
    timer = null;

    render();
});

/* =========================
   同期
========================= */
dataRef.on("value", snap => {
    const d = snap.val();
    if (!d) return;

    mode = d.mode || "stop";
    accumulated = d.accumulated || 0;
    lastStartTime = d.lastStartTime || null;

    if (mode !== "stop" && !timer) {
        startLoop();
    }

    render();

    if (lastPush === 0) lastPush = Date.now();
});

/* =========================
   グラフUI制御（完全追加）
========================= */

window.showSubTab = function(type) {
    document.querySelectorAll(".subTabContent").forEach(el => el.style.display = "none");

    const target = document.getElementById("sub" + type.charAt(0).toUpperCase() + type.slice(1));
    if (target) target.style.display = "block";

    document.querySelectorAll(".subTab").forEach(btn => {
        btn.classList.toggle("active", btn.textContent.toLowerCase() === type);
    });

    refreshChart();
};

function refreshChart() {
    const active = document.querySelector(".subTab.active");
    if (!active) return;

    const name = active.textContent.toLowerCase();

    if (name === "min" || name === "hour") {
        fetchHistory(name);
        return;
    }

    const map = {
        day: updateDay,
        month: updateMonth,
        year: updateYear
    };

    if (map[name]) map[name]();
}

/* =========================
   履歴取得
========================= */
function fetchHistory(type) {
    const slider = document.getElementById("dateSlider");
    if (!slider) return;

    db.ref("timebank/history").once("value", snap => {
        const data = snap.val() || {};
        const days = Object.keys(data).sort();

        slider.max = Math.max(0, days.length - 1);

        const selected = days[slider.value];
        if (!selected) return;

        const list = Object.values(data[selected]).sort((a,b)=>a.timestamp-b.timestamp);

        const labels = list.map(x => {
            const d = new Date(x.timestamp);
            return `${d.getHours()}:${String(d.getMinutes()).padStart(2,"0")}`;
        });

        const values = list.map(x => x.seconds);

        renderChart("minChart", labels, values, "min data");
    });
}

/* =========================
   Chart描画（安全版）
========================= */
function renderChart(id, labels, data, label) {
    const canvas = document.getElementById(id);
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const key = "_chart_" + id;

    if (window[key]) {
        try { window[key].destroy(); } catch(e){}
    }

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
                tension: 0.1,
                pointRadius: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false
        }
    });
}

/* =========================
   ダミー（未実装防止）
========================= */
function updateDay(){}
function updateMonth(){}
function updateYear(){}
