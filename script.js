
/* =========================
   グラフUI初期化（最重要）
========================= */
window.addEventListener("load", () => {
    const graphPage = document.getElementById("graphPage");
    const timerPage = document.getElementById("timerPage");

    const graphTab = document.getElementById("graphTab");
    const timerTab = document.getElementById("timerTab");

    // 初期状態
    if (graphPage) graphPage.style.display = "none";
    if (timerPage) timerPage.style.display = "block";

    // MINを必ず初期表示
    showSubTab("min");
});

/* =========================
   タブ切り替え
========================= */
document.getElementById("graphTab")?.addEventListener("click", () => {
    const graphPage = document.getElementById("graphPage");
    const timerPage = document.getElementById("timerPage");

    if (graphPage) graphPage.style.display = "block";
    if (timerPage) timerPage.style.display = "none";

    document.getElementById("graphTab")?.classList.add("active");
    document.getElementById("timerTab")?.classList.remove("active");

    showSubTab("min"); // ★これ必須
});

document.getElementById("timerTab")?.addEventListener("click", () => {
    const graphPage = document.getElementById("graphPage");
    const timerPage = document.getElementById("timerPage");

    if (graphPage) graphPage.style.display = "none";
    if (timerPage) timerPage.style.display = "block";

    document.getElementById("timerTab")?.classList.add("active");
    document.getElementById("graphTab")?.classList.remove("active");
});

/* =========================
   subTab制御（完全安全版）
========================= */
window.showSubTab = function(type) {
    const contents = document.querySelectorAll(".subTabContent");
    contents.forEach(c => c.style.display = "none");

    const target = document.getElementById("sub" + type.charAt(0).toUpperCase() + type.slice(1));
    if (target) target.style.display = "block";

    document.querySelectorAll(".subTab").forEach(btn => {
        btn.classList.remove("active");
    });

    const activeBtn = [...document.querySelectorAll(".subTab")]
        .find(b => b.textContent.toLowerCase() === type);

    if (activeBtn) activeBtn.classList.add("active");

    // ★ここ超重要（undefined防止）
    if (typeof refreshChart === "function") {
        refreshChart();
    }
};

/* =========================
   グラフ更新（完全防御）
========================= */
function refreshChart() {
    const active = document.querySelector(".subTab.active");

    if (!active) {
        console.warn("No active subTab → fallback min");
        fetchHistory("min");
        return;
    }

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
   履歴取得（安全版）
========================= */
function fetchHistory(type) {
    const slider = document.getElementById("dateSlider");
    if (!slider) return;

    db.ref("timebank/history").once("value", snap => {
        const data = snap.val() || {};
        const days = Object.keys(data).sort();

        if (days.length === 0) return;

        slider.max = Math.max(0, days.length - 1);

        const selected = days[slider.value || 0];
        if (!selected) return;

        const list = Object.values(data[selected])
            .sort((a,b)=>a.timestamp-b.timestamp);

        const labels = list.map(x => {
            const d = new Date(x.timestamp);
            return `${d.getHours()}:${String(d.getMinutes()).padStart(2,"0")}`;
        });

        const values = list.map(x => x.seconds);

        renderChart("minChart", labels, values, "Time Log");
    });
}

/* =========================
   Chart安全生成
========================= */
function renderChart(id, labels, data, label) {
    const canvas = document.getElementById(id);
    if (!canvas) {
        console.warn("Canvas not found:", id);
        return;
    }

    const ctx = canvas.getContext("2d");
    const key = "_chart_" + id;

    if (window[key]) {
        try { window[key].destroy(); } catch(e) {}
    }

    if (!window.Chart) {
        console.error("Chart.js not loaded");
        return;
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
function updateDay() {}
function updateMonth() {}
function updateYear() {}
