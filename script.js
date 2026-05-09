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
const ref = db.ref("timebank/state"); // 状態は専用のパスに

/* =========================
   状態（state）
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
   計算・表示ロジック
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
    timerText.textContent = formatTime(getSeconds());
}

/* =========================
   保存・履歴（送信側）
========================= */
function saveState() {
    // ⚠️ ref.on の外側（ボタン操作時など）からのみ呼ぶこと！
    ref.set({
        mode: state.mode,
        startTime: state.startTime,
        endTime: state.endTime,
        accumulated: state.accumulated,
        updatedAt: Date.now() // 更新トリガー用
    });
}

function pushHistory() {
    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    const currentSec = getSeconds();

    db.ref(`timebank/history/${today}`).push({
        timestamp: now,
        seconds: currentSec
    });

    db.ref(`timebank/daily_summary/${today}`).set({
        timestamp: now,
        seconds: currentSec
    });
}

/* =========================
   タイマー・ループ
========================= */
function startLoop() {
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
        render();

        const now = Date.now();
        // 1分ごとに履歴保存
        if (now - lastPush > 60000) {
            pushHistory();
            lastPush = now;
        }

        // カウントダウン終了判定
        if (state.mode === "down" && state.endTime <= now) {
            state.mode = "stop";
            state.endTime = null;
            state.accumulated = 0; // 使い切ったら0
            saveState(); // ここは状態変化の終点なのでOK
            clearInterval(timer);
        }
    }, 1000);
}

/* =========================
   受信（ここが重要：無限ループ防止）
========================= */
ref.on("value", snap => {
    const d = snap.val();
    if (!d) return;

    // 1. 内部状態を更新（saveStateは絶対に呼ばない！）
    state = {
        mode: d.mode || "stop",
        startTime: d.startTime || null,
        endTime: d.endTime || null,
        accumulated: d.accumulated || 0
    };

    // 2. モードに応じてタイマーの開始・停止を判断
    if (state.mode !== "stop") {
        if (!timer) startLoop();
    } else {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
    }

    // 3. 画面に反映
    render();
    if (lastPush === 0) lastPush = Date.now();
});

/* =========================
   ボタン操作
========================= */
document.getElementById("upBtn").onclick = () => {
    if (state.mode === "up") return;
    state.mode = "up";
    state.startTime = Date.now();
    saveState();
};

document.getElementById("downBtn").onclick = () => {
    if (state.mode === "down" || state.accumulated <= 0) return;
    state.mode = "down";
    state.endTime = Date.now() + (state.accumulated * 1000);
    saveState();
};

document.getElementById("stopBtn").onclick = () => {
    if (state.mode === "stop") return;

    if (state.mode === "up") {
        state.accumulated += Math.floor((Date.now() - state.startTime) / 1000);
    } else if (state.mode === "down") {
        state.accumulated = Math.max(0, Math.floor((state.endTime - Date.now()) / 1000));
    }

    state.mode = "stop";
    state.startTime = null;
    state.endTime = null;
    saveState();
};

document.getElementById("resetBtn").onclick = () => {
    if (!confirm("データをすべて消去しますか？")) return;
    state = { mode: "stop", startTime: null, endTime: null, accumulated: 0 };
    db.ref("timebank").remove(); // 全削除
    location.reload(); // 念のためリロード
};

timerText.onclick = () => {
    displayMode = displayMode === "hms" ? "sec" : "hms";
    render();
};
