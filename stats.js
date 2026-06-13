/*
 * stats.js — 강건 통계 엔진 (Node + 브라우저 겸용, 의존성 0)
 * build.js(지역 페이지 생성)·지역 페이지·map.js가 같은 코드를 씁니다 → 수치 일관성.
 * 가격 단위: 임플란트 1치(개)당 비급여 가격(원).
 */
(function (root) {
  "use strict";

  function median(arr) {
    if (!arr.length) return 0;
    var a = arr.slice().sort(function (x, y) { return x - y; }), m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  function quantile(arr, q) {
    if (!arr.length) return 0;
    var s = arr.slice().sort(function (x, y) { return x - y; }), pos = (s.length - 1) * q, b = Math.floor(pos), r = pos - b;
    return s[b + 1] !== undefined ? s[b] + r * (s[b + 1] - s[b]) : s[b];
  }
  // IQR 1.5배 밖 이상치 제외 후 중앙값 + 제외건수
  function robust(vals) {
    if (!vals.length) return { median: 0, n: 0, kept: 0, dropped: 0, q1: 0, q3: 0 };
    var q1 = quantile(vals, 0.25), q3 = quantile(vals, 0.75), iqr = q3 - q1;
    var lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
    var kept = vals.filter(function (v) { return v >= lo && v <= hi; });
    if (!kept.length) kept = vals.slice();
    return { median: median(kept), n: vals.length, kept: kept.length, dropped: vals.length - kept.length, q1: q1, q3: q3 };
  }
  // 임플란트 1치당 비급여 상식 범위(단위실수·장난 컷). 보통 80만~300만, 넉넉히 30만~600만.
  var PRICE_MIN = 300000, PRICE_MAX = 6000000;
  function plausible(d) {
    return d.price >= PRICE_MIN && d.price <= PRICE_MAX;
  }
  // x가 vals 중 몇 퍼센타일인지(이하 비율, 0~100)
  function percentileBelow(vals, x) {
    if (!vals.length) return null;
    var below = 0, eq = 0;
    vals.forEach(function (v) { if (v < x) below++; else if (v === x) eq++; });
    return Math.round((below + eq / 2) / vals.length * 100);
  }
  function won(n) { return Math.round(n || 0).toLocaleString("ko-KR") + "원"; }
  function manwon(n) { // 만원 축약 (150만 형태)
    var v = (n || 0) / 10000;
    return (Math.round(v * 10) / 10).toLocaleString("ko-KR") + "만";
  }
  // 같은 치과(name) 관측치를 하나로 합침: 가격 평균, obs=관측 수
  function aggregateByName(rows) {
    var g = {};
    rows.forEach(function (r) {
      var k = r.name || [r.region, r.district, r.lat, r.lng].join("|");
      (g[k] = g[k] || []).push(r);
    });
    return Object.keys(g).map(function (k) {
      var arr = g[k], n = arr.length, base = arr[0];
      if (n === 1) { var one = {}; for (var p in base) one[p] = base[p]; one.obs = 1; return one; }
      var priced = arr.filter(function (x) { return typeof x.price === "number" && x.price; });
      var out = {}; for (var q in base) out[q] = base[q];
      if (priced.length) out.price = Math.round(priced.reduce(function (s, x) { return s + x.price; }, 0) / priced.length);
      out.obs = n;
      out.verified = arr.some(function (x) { return x.verified; });
      return out;
    });
  }

  root.Stats = {
    median: median, quantile: quantile, robust: robust, plausible: plausible,
    percentileBelow: percentileBelow, won: won, manwon: manwon, aggregateByName: aggregateByName,
    PRICE_MIN: PRICE_MIN, PRICE_MAX: PRICE_MAX,
  };
})(typeof window !== "undefined" ? window : this);
