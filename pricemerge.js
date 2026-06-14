/*
 * pricemerge.js — 치과에 임플란트 가격을 더할 때, 다른 소스면 평균 / 같은 소스면 스킵
 *   addPrice(clinic, {price, source})
 *   반환: 'filled'(처음) | 'averaged'(다른 소스 평균) | 'dup'(같은 소스) | 'invalid'
 *   누적 정보: clinic.nobs(관측 수), clinic.priceSources(소스 목록 '|' 구분)
 * 가격 단위: 임플란트 1치(개)당 비급여가.
 */
var PRICE_MIN = 300000, PRICE_MAX = 6000000;

function addPrice(v, p) {
  if (!(p.price >= PRICE_MIN && p.price <= PRICE_MAX)) return "invalid";
  var existing = v.priceSources || (v.price ? v.source : "") || "";
  var srcs = existing.split("|").filter(Boolean);
  var has = typeof v.price === "number" && v.price > 0;

  if (has) {
    if (p.source && srcs.indexOf(p.source) >= 0) return "dup"; // 같은 소스 → 스킵
    var n = v.nobs || 1;
    v.price = Math.round((v.price * n + p.price) / (n + 1));
    v.nobs = n + 1;
    v.priceSources = srcs.concat(p.source ? [p.source] : []).join("|");
    return "averaged";
  } else {
    v.price = p.price;
    v.nobs = 1;
    v.priceSources = p.source || "";
    v.source = p.source || v.source;
    v.verified = false;
    return "filled";
  }
}
module.exports = { addPrice: addPrice };

// ── 이름 매칭 + 신규 치과 삽입(수집기 공용) ──
var norm = function (s) { return String(s || "").replace(/[\s()\-·_]/g, "").toLowerCase(); };

// 정규화 이름의 포함관계(짧은 쪽이 4자 이상). 브랜드/지점명 변형을 폭넓게 잡되 과매칭 방지.
function nameOverlap(an, bn) {
  var a = norm(an), b = norm(bn);
  if (!a || !b) return false;
  if (a === b) return true;
  var sh = a.length <= b.length ? a : b, lo = a.length <= b.length ? b : a;
  return sh.length >= 4 && lo.indexOf(sh) >= 0;
}

// 핵심 상호명: 끝의 치과/의원/병원류 접미어 제거(연세제일치과의원 → 연세제일)
function core(s) {
  return norm(s).replace(/(치과교정과치과의원|치과교정과의원|구강악안면외과치과의원|치과병원|치과의원|아동치과|어린이치과|치과|의원|병원)$/g, "");
}
// 가격을 채울 대상 매칭: 이름 일치/포함/핵심상호 일치 + 구 호환(완전일치는 구 무시).
function matchClinic(v, p) {
  var a = norm(v.name), b = norm(p.name);
  if (!a || !b) return false;
  if (a === b) return true;                                  // 완전일치 → 구 무관
  if (p.district && v.district && v.district !== p.district) return false;
  var sh = a.length <= b.length ? a : b, lo = a.length <= b.length ? b : a;
  if (sh.length >= 4 && lo.indexOf(sh) >= 0) return true;    // 포함 매칭
  var ca = core(a), cb = core(b);                            // 핵심 상호명 비교
  if (ca && cb && ca.length >= 3) {
    if (ca === cb) return true;
    var cs = ca.length <= cb.length ? ca : cb, cl = ca.length <= cb.length ? cb : ca;
    if (cs.length >= 3 && cl.indexOf(cs) === 0) return true; // 핵심상호 접두 일치
  }
  return false;
}

// 잡음(비-치과) 이름 컷 — dedupe.js와 동일 기준
var JUNK = /(기공소|치과재료|의료기|덴탈상사|상사|주차|충전소|홀딩스|부동산|공인중개|중개사|주유소|정비소|세차장|편의점|약국|독서실|고시원|찜질|사우나|노래방|pc방|당구|볼링장|네일|세탁소)/i;

// 좌표 없이 신규 치과 생성(이후 geocode가 name+district로 좌표 채움). map.js는 좌표 없으면 핀 미표시 → 안전.
function makeClinic(p) {
  var v = { name: p.name, region: p.region || "인천", district: p.district || "연수구", price: null, verified: false, source: p.source, inserted: true };
  if (p.addr) v.addr = p.addr;
  if (p.phone) v.phone = p.phone;
  addPrice(v, { price: p.price, source: p.source });
  return v;
}

// 수집 결과 1건을 clinics에 반영. fill(기존 채움)/insert(신규)/skip(모호)/junk 자동 판단.
// 반환: { status, clinic }  status: filled|averaged|dup|invalid|inserted|ambiguous|junk
function applyScrape(clinics, p) {
  if (!p.name || !(p.price > 0)) return { status: "invalid", clinic: null };
  var hit = clinics.find(function (v) { return matchClinic(v, p); });
  if (hit) {
    var res = addPrice(hit, { price: p.price, source: p.source });
    if (p.addr && !hit.addr) hit.addr = p.addr;
    if (p.phone && !hit.phone) hit.phone = p.phone;
    return { status: res, clinic: hit };
  }
  // 매칭 실패 → 구 무관 이름겹침이 있으면 동일 치과일 수 있어 보류(중복/오기입 방지)
  if (clinics.some(function (v) { return nameOverlap(v.name, p.name); })) return { status: "ambiguous", clinic: null };
  if (norm(p.name).length < 3 || JUNK.test(p.name)) return { status: "junk", clinic: null };
  var nv = makeClinic(p);
  clinics.push(nv);
  return { status: "inserted", clinic: nv };
}

module.exports.matchClinic = matchClinic;
module.exports.nameOverlap = nameOverlap;
module.exports.applyScrape = applyScrape;
module.exports.makeClinic = makeClinic;
