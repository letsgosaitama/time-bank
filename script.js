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
   状態
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
   秒計算（核）
========================= */
function getSeconds() {
    const now = Date.now();

    if (state.mode === "up") {
        if (!state.startTime) return state.accumulated;
        return Math.floor(state.accumulated + (now - state.startTime) / 1000);
    }

    if (state.mode === "down") {
        if (!state.endTime) return 0;
        return Math.max(0, Math.floor((state.endTime - now) / 1000));
    }

    return Math.floor(state.accumulated);
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
    if (!timerText) return;
    timerText.textContent = formatTime(getSeconds());
}

timerText?.addEventListener("click", () => {
    displayMode = displayMode === "hms" ? "sec" : "hms";
    render();
});

/* =========================
   Firebase保存（最小）
========================= */
function saveState() {
    ref.update({
        mode: state.mode,
        startTime: state.startTime,
        endTime: state.endTime,
        accumulated: state.accumulated,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    });
}

/* =========================
   履歴
========================= */
function pushHistory() {
    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);

    const sec = getSeconds();

    db.ref(`timebank/history/${today}`).push({
        timestamp: now,
        seconds: sec
    });

    db.ref(`timebank/daily_summary/${today}`).set({
        timestamp: now,
        seconds: sec
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

        if (state.mode === "down" && state.endTime && state.endTime <= now) {
            state.mode = "stop";
            state.endTime = null;
            state.accumulated = 0;
            saveState();
            clearInterval(timer);
            timer = null;
        }

    }, 1000);
}

/* =========================
   ボタン
========================= */
document.getElementById("upBtn")?.addEventListener("click", () => {
    const now = Date.now();

    if (state.mode !== "up") {
        state.startTime = now;
    }

    state.mode = "up";
    saveState();
    startLoop();
});

document.getElementById("downBtn")?.addEventListener("click", () => {
    const now = Date.now();

    state.mode = "down";
    state.endTime = now + (state.accumulated * 1000);

    saveState();
    startLoop();
});

document.getElementById("stopBtn")?.addEventListener("click", () => {
    const now = Date.now();

    if (state.mode === "up" && state.startTime) {
        state.accumulated += Math.floor((now - state.startTime) / 1000);
    }

    if (state.mode === "down" && state.endTime) {
        state.accumulated = Math.max(0, Math.floor((state.endTime - now) / 1000));
    }

    state.mode = "stop";
    state.startTime = null;
    state.endTime = null;

    saveState();

    if (timer) clearInterval(timer);
    timer = null;

    render();
});

document.getElementById("resetBtn")?.addEventListener("click", () => {
    if (!confirm("全部消す？")) return;

    state = {
        mode: "stop",
        startTime: null,
        endTime: null,
        accumulated: 0
    };

    db.ref("timebank").set(state);

    db.ref("timebank/history").remove();
    db.ref("timebank/daily_summary").remove();

    if (timer) clearInterval(timer);
    timer = null;

    render();
});

/* =========================
   同期（安全版）
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

    if (state.mode !== "stop" && !timer) {
        startLoop();
    }

    render();

    if (lastPush === 0) lastPush = Date.now();
});

/* =========================
   グラフ安全起動
========================= */
function safeShowGraph() {
    const graphPage = document.getElementById("graphPage");
    const timerPage = document.getElementById("timerPage");

    if (timerPage) timerPage.style.display = "none";
    if (graphPage) graphPage.style.display = "block";

    document.getElementById("graphTab")?.classList.add("active");
    document.getElementById("timerTab")?.classList.remove("active");

    showSubTab("min", true);
}

/* タブ */
window.showSubTab = function (type) {
    document.querySelectorAll(".subTabContent").forEach(c => c.style.display = "none");

    const target = document.getElementById("sub" + type.charAt(0).toUpperCase() + type.slice(1));
    if (target) target.style.display = "block";

    document.querySelectorAll(".subTab").forEach(b => {
        b.classList.remove("active");
        if (b.textContent.toLowerCase() === type) {
            b.classList.add("active");
        }
    });

    refreshChart();
};

/* =========================
   グラフ防御版
========================= */
function refreshChart() {
    const activeTab = document.querySelector(".subTab.active");

    if (!activeTab) {
        console.warn("no active tab → fallback min");
        return;
    }

    const name = activeTab.textContent.toLowerCase();

    const map = {
        min: fetchHistoryAndRender,
        hour: fetchHistoryAndRender,
        day: updateDaySliders,
        month: updateMonthSliders,
        year: updateYearSliders
    };

    if (map[name]) map[name](name);
}

/* =========================
   Chart安全化
========================= */
function renderChart(canvasId, labels, data, label) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const key = "_chart_" + canvasId;

    if (window[key]) {
        try { window[key].destroy(); } catch(e) {}
    }

    window[key] = new Chart(ctx, {
        type: "line",
        data: {
            labels,
            datasets: [{
                label,
                data,
                borderColor: '#007aff',
                backgroundColor: 'rgba(0,122,255,0.1)',
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
   グラフボタン
========================= */
document.getElementById("graphTab")?.addEventListener("click", safeShowGraph);
document.getElementById("timerTab")?.addEventListener("click", () => {
    document.getElementById("graphPage").style.display = "none";
    document.getElementById("timerPage").style.display = "block";
});
