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
const ref = db.ref("timebank");

/* =========================
   状態
========================= */
let timer = null;

let state = {
    mode: "stop",        // up / down / stop
    startTime: null,     // up用
    endTime: null,       // down用
    accumulated: 0       // up用の累積
};

let lastPush = 0;
const timerText = document.getElementById("timer");

let displayMode = "hms";

/* =========================
   計算ロジック（ここが核）
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
   Firebase保存（最小）
========================= */
function saveState() {
    ref.update({
        mode: state.mode,
        startTime: state.startTime,
        endTime: state.endTime,
        accumulated: state.accumulated
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
    clearInterval(timer);

    timer = setInterval(() => {
        render();

        const now = Date.now();

        // 1分ごと履歴
        if (now - lastPush > 60000) {
            pushHistory();
            lastPush = now;
        }

        // down終了処理
        if (state.mode === "down" && state.endTime <= now) {
            state.mode = "stop";
            state.endTime = null;
            saveState();
        }

    }, 1000);
}

/* =========================
   ボタン操作
========================= */

/* UP開始 */
document.getElementById("upBtn").onclick = () => {
    const now = Date.now();

    if (state.mode === "up") return;

    state.mode = "up";
    state.startTime = now;

    saveState();
    startLoop();
};

/* DOWN開始 */
document.getElementById("downBtn").onclick = () => {
    const now = Date.now();

    const duration = state.accumulated || 0;

    state.mode = "down";
    state.endTime = now + duration * 1000;

    saveState();
    startLoop();
};

/* STOP */
document.getElementById("stopBtn").onclick = () => {
    const now = Date.now();

    if (state.mode === "up") {
        state.accumulated += Math.floor((now - state.startTime) / 1000);
    }

    state.mode = "stop";
    state.startTime = null;

    saveState();
    clearInterval(timer);
    render();
};

/* RESET */
document.getElementById("resetBtn").onclick = () => {
    if (!confirm("リセットする？")) return;

    state = {
        mode: "stop",
        startTime: null,
        endTime: null,
        accumulated: 0
    };

    ref.set(state);

    db.ref("timebank/history").remove();
    db.ref("timebank/daily_summary").remove();

    clearInterval(timer);
    render();
};

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
   初期表示
========================= */
render();
