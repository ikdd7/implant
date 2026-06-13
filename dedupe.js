/*
 * dedupe.js — 같은 치과 병합 + 잡음(비-치과) 제거
 *   - 초근접(35m 이내)이면 이름이 달라도 같은 건물로 보고 병합
 *   - 35~150m면 이름이 관련(첫 어절 동일 또는 한쪽이 다른쪽 접두어)일 때 병합
 *   - 기공소/재료상/의료기 등 비-치과는 제거
 *
 * 단독 실행:  node dedupe.js   (clinics.js 갱신)
 * 모듈:       const { dedupeClinics, isJunk } = require("./dedupe.js")
 */
function normName(s) { return String(s || "").replace(/[\s()\-·_]/g, ""); }
function firstTok(s) { return String(s || "").trim().split(/\s+/)[0]; }
function distM(a, b) {
  var dlat = a.lat - b.lat, dlng = (a.lng - b.lng) * Math.cos(a.lat * Math.PI / 180);
  return Math.sqrt(dlat * dlat + dlng * dlng) * 111000;
}
// 명백한 비-치과(잡음) 제거 — 치과의원/병원만 남김
var JUNK = /(기공소|치과재료|의료기|덴탈상사|상사|주차|충전소|홀딩스|부동산|공인중개|중개사|주유소|정비소|세차장|편의점|약국|독서실|고시원|찜질|사우나|노래방|pc방|당구|볼링장|네일|세탁소)/i;
function isJunk(name) { return JUNK.test(String(name || "")); }
function related(a, b) {
  var ta = firstTok(a.name), tb = firstTok(b.name);
  if (ta === tb && ta.length >= 3) return true;
  var na = normName(a.name), nb = normName(b.name);
  var sh = na.length <= nb.length ? na : nb, lo = na.length <= nb.length ? nb : na;
  if (sh.length >= 3 && lo.indexOf(sh) === 0) return true; // 짧은 이름이 긴 이름의 접두어
  return false;
}

function dedupeClinics(vs) {
  // 가격 있는(큐레이션) 치과는 무조건 보존, 그 외 잡음만 제거
  var clean = vs.filter(function (v) { return (typeof v.price === "number" && v.price) || !isJunk(v.name); });
  var clusters = [];
  clean.forEach(function (v) {
    if (!(v.lat && v.lng)) { clusters.push({ rep: v, items: [v] }); return; }
    var hit = null;
    for (var i = 0; i < clusters.length; i++) {
      var c = clusters[i];
      if (!c.rep.lat) continue;
      var d = distM(c.rep, v);
      if (d < 35 || (d < 150 && related(c.rep, v))) { hit = c; break; }
    }
    if (hit) hit.items.push(v); else clusters.push({ rep: v, items: [v] });
  });

  return clusters.map(function (c) {
    var items = c.items;
    if (items.length === 1) return items[0];
    var priced = items.filter(function (x) { return typeof x.price === "number" && x.price; });
    var lead = priced[0] || items.slice().sort(function (a, b) { return a.name.length - b.name.length; })[0];
    var merged = {
      name: lead.name,
      region: lead.region, district: lead.district,
      price: null, lat: lead.lat, lng: lead.lng,
      verified: items.some(function (x) { return x.verified; }),
      source: lead.source,
    };
    if (lead.addr) merged.addr = lead.addr;
    if (lead.phone) merged.phone = lead.phone;
    if (priced.length) {
      merged.price = Math.round(priced.reduce(function (s, x) { return s + x.price; }, 0) / priced.length);
    }
    return merged;
  });
}

module.exports = { dedupeClinics: dedupeClinics, isJunk: isJunk };

if (require.main === module) {
  var store = require("./store.js");
  var loaded = store.load();
  var before = loaded.clinics;
  var after = dedupeClinics(before);
  store.write(after, loaded.sample);
  console.log("정리: " + before.length + " → " + after.length + "곳 (" + (before.length - after.length) + "곳 병합/제거)");
}
