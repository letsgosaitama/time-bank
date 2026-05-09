
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
   時間計算（核）
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
   Firebase保存
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
    if (!confirm("全部リセットする？")) return;

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
   同期
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
   グラフ（修正済み：エラー消し）
========================= */
function refreshChart() {
    const activeTab = document.querySelector(".subTab.active");
    if (!activeTab) return;

    const name = activeTab.textContent.toLowerCase();

    if (name === "min" || name === "hour") {
        fetchHistoryAndRender(name);
        return;
    }

    const map = {
        day: updateDaySliders,
        month: updateMonthSliders,
        year: updateYearSliders
    };

    if (map[name]) map[name]();
}

/* =========================
   ★ここが今回の修正ポイント
   （エラー原因の関数を復活）
========================= */
function fetchHistoryAndRender(type) {
    const slider = (type === "min")
        ? document.getElementById("dateSlider")
        : document.getElementById("hourDateSlider");

    if (!slider) return;

    db.ref("timebank/history").once("value", snap => {
        const data = snap.val() || {};
        const days = Object.keys(data).sort();

        slider.max = Math.max(0, days.length - 1);

        const selectedDate = days[slider.value];
        if (!selectedDate) return;

        const list = Object.values(data[selectedDate])
            .sort((a, b) => a.timestamp - b.timestamp);

        if (type === "min") {
            renderMinChart(selectedDate, list);
        } else {
            renderHourChart(selectedDate, list);
        }
    });
}

/* =========================
   Chart安全版
========================= */
function renderChart(id, labels, data, label) {
    const canvas = document.getElementById(id);
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const key = "_chart_" + id;

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
