/* region.js — 연수구 랜딩 페이지 클라이언트 (분포 차트·백분위 비교·소프트 게이트) */
(function () {
  "use strict";
  var S = window.Stats, C = window.Charts;
  var D = window.REGION_DATA || [], NAME = window.REGION_NAME || "연수구";
  var won = S.won, manwon = S.manwon;
  var $ = function (id) { return document.getElementById(id); };
  var prices = D.map(function (d) { return d.price; }).filter(function (p) { return p; });

  // 가격 분포(20만원 구간)
  var STEP = 200000, buckets = {};
  prices.forEach(function (m) { var b = Math.floor(m / STEP) * STEP; buckets[b] = (buckets[b] || 0) + 1; });
  var dist = Object.keys(buckets).sort(function (a, b) { return a - b; })
    .map(function (b) { return { label: manwon(+b) + "원~", value: buckets[b] }; });
  if ($("cDist")) C.bars($("cDist"), { data: dist, fmt: function (v) { return v + "곳"; } });

  // 백분위 비교 (내 견적 1치 가격)
  var mI = $("mM"), cI = $("mC"), last = null;
  function intn(el) { return parseInt(String(el.value).replace(/[^0-9]/g, ""), 10) || 0; }
  function comma(el) { var v = intn(el); el.value = v ? v.toLocaleString("ko-KR") : ""; }
  function calc() {
    var m = intn(mI), c = cI ? (intn(cI) || 1) : 1;
    if (!m) { $("pRes").textContent = "–"; $("pVer").textContent = ""; last = null; return; }
    var total = m * c;
    $("pRes").textContent = won(total);
    var pct = S.percentileBelow(prices, m), top = 100 - pct;
    var v = $("pVer");
    if (!prices.length) { v.className = "verdict"; v.textContent = "데이터를 모으는 중이에요."; }
    else if (top <= 50) { v.className = "verdict exp"; v.textContent = "💸 " + NAME + " 임플란트가 중 상위 " + Math.max(1, top) + "% (비싼 편)"; }
    else { v.className = "verdict cheap"; v.textContent = "✅ " + NAME + " 임플란트가 중 하위 " + pct + "% (저렴한 편)"; }
    last = { total: total, count: c, price: m, pct: pct, top: top };
  }
  [mI, cI].forEach(function (el) { if (el) el.addEventListener("input", function () { comma(el); calc(); }); });

  if (window.ShareCard) window.ShareCard.mount($("share"), function () {
    if (!last) return null;
    return {
      title: NAME + " 임플란트, 내 견적은?", big: won(last.total), ratio: "9:16",
      fileName: NAME + "_임플란트견적",
      lines: [
        { k: "1치당", v: won(last.price) },
        { k: "개수", v: last.count + "개" },
        { k: NAME + " 가격 순위", v: last.top <= 50 ? "상위 " + Math.max(1, last.top) + "%" : "하위 " + last.pct + "%" },
      ],
      site: "연수구 임플란트 지도", cta: "우리 동네 평균 보러가기 →",
    };
  });

  // 소프트 게이트
  var unlocked = false; try { unlocked = localStorage.getItem("implant_unlock") === "1"; } catch (e) {}
  function applyGate() { var el = $("gate"); if (el) el.classList.toggle("locked", !unlocked); var o = document.querySelector(".gateover"); if (o) o.style.display = unlocked ? "none" : ""; }
  var gb = $("gateBtn");
  if (gb) gb.addEventListener("click", function () {
    try { localStorage.setItem("implant_unlock", "1"); } catch (e) {}
    unlocked = true; applyGate();
  });
  applyGate();

  if (mI && prices.length) { mI.value = S.median(prices).toLocaleString("ko-KR"); if (cI) cI.value = "2"; calc(); }
  if ($("yr")) $("yr").textContent = new Date().getFullYear();
})();
