/**
 * Time Bank - Main Logic
 */
(function() {
    let timer = null;
    let seconds = 0;
    let mode = "stop";
    let lastUpdate = Date.now();
    let history = [];
    let lastHistorySave = 0;

    const db = firebase.database();
    const dataRef = db.ref("timebank");

    // --- ユーティリティ ---
    const now = () => Date.now();

    function formatTime(sec) {
        const h = String(Math.floor(sec / 3600)).padStart(2, "0");
        const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
        const s = String(sec % 60).padStart(2, "0");
        return `${h}:${m}:${s}`;
    }

    function updateUI() {
        const el = document.getElementById("timer");
        if (el) el.textContent = formatTime(seconds);
    }

    // --- ページ管理 ---
    window.showPage = function(page) {
        const tPage = document.getElementById("timerPage");
        const gPage = document.getElementById("graphPage");
        const tTab = document.getElementById("timerTab");
        const gTab = document.getElementById("graphTab");

        if (page === "timer") {
            tPage.style.display = "block";
            gPage.style.display = "none";
            tTab.classList.add("active");
            gTab.classList.remove("active");
        } else {
            tPage.style.display = "none";
            gPage.style.display = "block";
            tTab.classList.remove("active");
            gTab.classList.add("active");
            showSubTab('min');
        }
    };

    window.showSubTab = function(type) {
        ["Min", "Hour", "Day", "Week"].forEach(t => {
            const el = document.getElementById("sub" + t);
            if (el) el.style.display = "none";
        });
        const target = document.getElementById("sub" + type.charAt(0).toUpperCase() + type.slice(1));
        if (target) target.style.display = "block";
        if (type === "min") initMinSliders();
    };

    // --- データ保存 ---
    function saveData() {
        const t = now();
        dataRef.update({ seconds, mode, lastUpdate: t }).catch(e => console.warn("Save blocked/failed", e));

        if (t - lastHistorySave > 10000) {
            db.ref("timebank/history").push({ timestamp: t, seconds });
            lastHistorySave = t;
        }
    }

    function applyOfflineProgress() {
        if (mode === "stop") return;
        const diff = Math.floor((now() - lastUpdate) / 1000);
        if (diff > 0) {
            if (mode === "up") seconds += diff;
            if (mode === "down") {
                seconds -= diff;
                seconds = Math.max(0, seconds);
                if (seconds === 0) mode = "stop";
            }
        }
    }

    function startLoop() {
        clearInterval(timer);
        timer = setInterval(() => {
            if (mode === "up") seconds++;
            else if (mode === "down") {
                seconds--;
                if (seconds <= 0) { seconds = 0; mode = "stop"; clearInterval(timer); }
            }
            updateUI();
            saveData();
        }, 1000);
    }

    // --- グラフ表示 ---
    function initMinSliders() {
        if (history.length === 0) return;
        const days = [...new Set(history.map(h => {
            const d = new Date(h.timestamp);
            return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
        }))];
        const dateSlider = document.getElementById("dateSlider");
        const hourSlider = document.getElementById("hourSlider");
        if (!dateSlider) return;

        dateSlider.max = Math.max(0, days.length - 1);
        const dateStr = days[dateSlider.value] || "";
        renderMinChart(dateStr, +hourSlider.value);

        dateSlider.oninput = () => {
            document.getElementById("dateLabel").textContent = days[dateSlider.value];
            renderMinChart(days[dateSlider.value], +hourSlider.value);
        };
        hourSlider.oninput = () => {
            document.getElementById("hourLabel").textContent = hourSlider.value + "時";
            renderMinChart(days[dateSlider.value], +hourSlider.value);
        };
    }

    function renderMinChart(dateStr, hour) {
        if (!dateStr || typeof Chart === 'undefined') return;
        const [y, m, d] = dateStr.split("/").map(Number);
        const start = new Date(y, m - 1, d, hour, 0, 0).getTime();
        const end = start + 3600000;
        const labels = Array.from({ length: 60 }, (_, i) => `${hour}:${String(i).padStart(2, "0")}`);
        const data = Array(60).fill(null);

        history.forEach(h => {
            if (h.timestamp >= start && h.timestamp < end) {
                const min = new Date(h.timestamp).getMinutes();
                data[min] = h.seconds;
            }
        });

        const ctx = document.getElementById("minChart").getContext("2d");
        if (window.myMinChart) window.myMinChart.destroy();
        window.myMinChart = new Chart(ctx, {
            type: "line",
            data: {
                labels,
                datasets: [{ label: dateStr + " " + hour + "時", data, borderColor: "#007aff", tension: 0.1 }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    // --- 起動 ---
    window.addEventListener("load", () => {
        // タブクリックイベント
        document.getElementById("timerTab").onclick = () => showPage("timer");
        document.getElementById("graphTab").onclick = () => showPage("graph");

        // 操作ボタン
        document.getElementById("upBtn").onclick = () => { mode = "up"; startLoop(); saveData(); };
        document.getElementById("downBtn").onclick = () => { mode = "down"; startLoop(); saveData(); };
        document.getElementById("stopBtn").onclick = () => { mode = "stop"; clearInterval(timer); saveData(); };
        document.getElementById("resetBtn").onclick = () => {
            if (confirm("データを全消去しますか？")) {
                seconds = 0; mode = "stop"; 
                dataRef.set({ seconds: 0, mode: "stop", lastUpdate: now() });
                db.ref("timebank/history").remove();
                updateUI();
            }
        };

        // Firebase同期
        dataRef.on("value", snap => {
            const val = snap.val();
            if (!val) return;
            seconds = val.seconds || 0;
            mode = val.mode || "stop";
            lastUpdate = val.lastUpdate || now();
            applyOfflineProgress();
            updateUI();
            if (mode !== "stop") startLoop();
        });

        db.ref("timebank/history").on("value", snap => {
            const val = snap.val();
            history = val ? Object.values(val).sort((a, b) => a.timestamp - b.timestamp) : [];
        });
    });
})();
