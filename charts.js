/*
 * charts.js — 의존성 0 미니 차트 (가로 막대 + 산점도). SVG/CSS만 사용.
 * Charts.bars(el, {data:[{label,value,sub?,hi?}], fmt})
 * Charts.scatter(el, {points:[{x,y,label?}], xfmt, yfmt, xlabel, ylabel})
 */
(function (root) {
  "use strict";
  function esc(s){ return String(s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];}); }
  var won = function (n) { return Math.round(n || 0).toLocaleString("ko-KR") + "원"; };

  function bars(el, o) {
    if (!el) return;
    var data = o.data || [], fmt = o.fmt || won;
    var max = Math.max.apply(null, data.map(function (d) { return d.value; }).concat([1]));
    var h = '<div class="chart-bars">';
    data.forEach(function (d) {
      var pct = Math.max(2, (d.value / max) * 100);
      h += '<div class="cb' + (d.hi ? " hi" : "") + '">' +
        '<span class="cb-l">' + esc(d.label) + '</span>' +
        '<span class="cb-t"><span class="cb-f" style="width:' + pct.toFixed(1) + '%"></span></span>' +
        '<span class="cb-v">' + fmt(d.value) + (d.sub ? ' <i>' + esc(d.sub) + '</i>' : '') + '</span>' +
        '</div>';
    });
    el.innerHTML = h + "</div>";
  }

  function scatter(el, o) {
    if (!el) return;
    var pts = o.points || [], W = 520, H = 300, pad = 52;
    if (!pts.length) { el.innerHTML = '<p class="note">데이터 없음</p>'; return; }
    var xs = pts.map(function (p) { return p.x; }), ys = pts.map(function (p) { return p.y; });
    var xmin = Math.min.apply(null, xs), xmax = Math.max.apply(null, xs);
    var ymin = 0, ymax = Math.max.apply(null, ys) * 1.05;
    if (xmin === xmax) xmax = xmin + 1;
    var sx = function (x) { return pad + (x - xmin) / (xmax - xmin) * (W - pad - 14); };
    var sy = function (y) { return H - pad - (y - ymin) / (ymax - ymin) * (H - pad - 14); };
    var xf = o.xfmt || function (v) { return v; }, yf = o.yfmt || won;
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="chart-svg" preserveAspectRatio="xMidYMid meet">';
    // grid + y labels
    for (var g = 0; g <= 4; g++) {
      var yy = pad + g * (H - pad - 14) / 4, val = ymax - g * (ymax - ymin) / 4;
      s += '<line x1="' + pad + '" y1="' + yy + '" x2="' + (W - 14) + '" y2="' + yy + '" class="cg"/>';
      s += '<text x="' + (pad - 6) + '" y="' + (yy + 4) + '" class="ct" text-anchor="end">' + yf(val) + '</text>';
    }
    // x labels (min/mid/max)
    [xmin, (xmin + xmax) / 2, xmax].forEach(function (xv) {
      s += '<text x="' + sx(xv) + '" y="' + (H - pad + 22) + '" class="ct" text-anchor="middle">' + xf(Math.round(xv)) + '</text>';
    });
    pts.forEach(function (p) {
      s += '<circle cx="' + sx(p.x).toFixed(1) + '" cy="' + sy(p.y).toFixed(1) + '" r="5" class="cd' + (p.hi ? " hi" : "") + '"><title>' + esc((p.label || "") + " " + xf(p.x) + " / " + yf(p.y)) + '</title></circle>';
    });
    if (o.xlabel) s += '<text x="' + (W / 2) + '" y="' + (H - 6) + '" class="cax" text-anchor="middle">' + esc(o.xlabel) + '</text>';
    if (o.ylabel) s += '<text x="14" y="' + (pad - 14) + '" class="cax" text-anchor="start">' + esc(o.ylabel) + '</text>';
    el.innerHTML = s + "</svg>";
  }

  root.Charts = { bars: bars, scatter: scatter, won: won };
})(typeof window !== "undefined" ? window : this);
