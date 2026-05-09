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
   基本変数
========================= */
let timer = null;
let mode = "stop";

let accumulated = 0;      // 累積時間（秒）
let lastStartTime = null; // 最後にスタートした時刻

let dailySummary = [];
let currentYMax = null;
let displayMode = "hms";

let lastPush = 0;

const timerText = document.getElementById("timer");

/* =========================
   秒数計算（超重要）
========================= */
function getSeconds() {
    if (mode === "up") {
        return Math.floor(accumulated + (Date.now() - lastStartTime) / 1000);
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

timerText.onclick = () => {
    displayMode = (displayMode === "hms") ? "sec" : "hms";
    timerText.textContent = formatTime(getSeconds());
};

/* =========================
   保存（最小化）
========================= */
function saveState() {
    dataRef.update({
        mode,
        accumulated,
        lastStartTime
    });
}

/* =========================
   履歴保存（軽量化版）
========================= */
function pushHistory(seconds) {
    const now = Date.now();
    const todayStr = new Date().toISOString().slice(0, 10);

    db.ref(`timebank/history/${todayStr}`).push({
        timestamp: now,
        seconds
    });

    db.ref(`timebank/daily_summary/${todayStr}`).set({
        timestamp: now,
        seconds
    });

    cleanupOldHistory();
}

/* =========================
   古い履歴削除
========================= */
function cleanupOldHistory() {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    db.ref("timebank/history").once("value", snap => {
        const data = snap.val();
        if (!data) return;

        Object.keys(data).forEach(date => {
            const d = new Date(date).getTime();
            if (d < sevenDaysAgo) {
                db.ref(`timebank/history/${date}`).remove();
            }
        });
    });
}

/* =========================
   タイマー制御
========================= */
function render() {
    const sec = getSeconds();
    timerText.textContent = formatTime(sec);
}

function startLoop() {
    clearInterval(timer);

    timer = setInterval(() => {
        if (mode === "up") {
            render();
        }

        if (mode === "down") {
            let sec = getSeconds() - 1;

            if (sec <= 0) {
                accumulated = 0;
                mode = "stop";
                clearInterval(timer);
            } else {
                accumulated = sec;
            }

            render();
        }

        const now = Date.now();

        // 1分ごとにだけ履歴保存
        if (now - lastPush > 60000) {
            pushHistory(getSeconds());
            lastPush = now;
        }

    }, 1000);
}

/* =========================
   ボタン
========================= */
document.getElementById("upBtn").onclick = () => {
    if (mode !== "up") {
        lastStartTime = Date.now();
    }
    mode = "up";
    startLoop();
    saveState();
};

document.getElementById("downBtn").onclick = () => {
    if (mode === "up") {
        accumulated += Math.floor((Date.now() - lastStartTime) / 1000);
    }
    mode = "down";
    startLoop();
    saveState();
};

document.getElementById("stopBtn").onclick = () => {
    if (mode === "up") {
        accumulated += Math.floor((Date.now() - lastStartTime) / 1000);
    }
    mode = "stop";
    clearInterval(timer);
    saveState();
};

document.getElementById("resetBtn").onclick = () => {
    if (!confirm("完全リセットしますか？")) return;

    accumulated = 0;
    lastStartTime = null;
    mode = "stop";

    dataRef.set({
        mode: "stop",
        accumulated: 0,
        lastStartTime: null
    });

    db.ref("timebank/history").remove();
    db.ref("timebank/daily_summary").remove();
};

/* =========================
   同期
========================= */
dataRef.on("value", snap => {
    const d = snap.val();
    if (!d) return;

    mode = d.mode || "stop";
    accumulated = d.accumulated || 0;
    lastStartTime = d.lastStartTime || null;

    if (mode !== "stop" && !timer) startLoop();

    render();

    if (lastPush === 0) lastPush = Date.now();
});

/* =========================
   ここから下（グラフ系はそのまま使える）
========================= */
db.ref("timebank/daily_summary").on("value", snap => {
    const d = snap.val();
    dailySummary = d ? Object.values(d).sort((a,b)=>a.timestamp-b.timestamp) : [];
    if (document.getElementById("graphPage").style.display === "block") refreshChart();
});

/* --- 以降グラフ関数は元コードそのままでOK --- */
