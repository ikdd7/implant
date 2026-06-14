/* map.js — 카카오 지도 기반 연수구 임플란트 치과 지도 (필터·팝업·찜·비교). SDK 미설정/실패 시 목록 폴백. */
(function () {
  "use strict";
  var S = window.Stats, SLUGS = window.REGION_SLUGS || {};
  var won = S.won, manwon = S.manwon;
  var SRC = (window.CLINICS && window.CLINICS.length) ? window.CLINICS : (window.CLINIC_SAMPLE || []);
  var USING_SAMPLE = !(window.CLINICS && window.CLINICS.length);
  var DATA = S.aggregateByName(SRC.filter(function (d) { return d.lat && d.lng; }));
  var fVer = false, fPriced = false, fFav = false;
  var $ = function (id) { return document.getElementById(id); };
  function hasPrice(d) { return d.price >= S.PRICE_MIN && d.price <= S.PRICE_MAX; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  // 가격 출처 종류 분류(여러 종류가 섞일 수 있음). 심평원 신고가 ≠ 실제가일 수 있어 구분해 표기.
  function sourceTypes(d) {
    var s = (d.priceSources || d.source || ""), t = [];
    if (/hira/i.test(s)) t.push("심평원");
    if (/site\//i.test(s)) t.push("홈페이지");
    if (/report\//i.test(s)) t.push("이용자 제보");
    return t;
  }
  function sourceLabel(d) { return sourceTypes(d).join("·"); }
  // 출처별 주의문구 — 심평원 신고가/홈페이지 게시가/제보가 서로, 그리고 실제 진료가와 다를 수 있음
  function priceCaveat(d) {
    var t = sourceTypes(d);
    if (t.length > 1) return "※ " + t.join("·") + " 정보가 섞여 있어요. 출처마다, 그리고 실제 진료가와 다를 수 있습니다.";
    if (t[0] === "심평원") return "※ 심평원 신고가 기준 — 실제 진료가/이용자 경험가와 다를 수 있습니다.";
    if (t[0] === "홈페이지") return "※ 홈페이지 게시가 — 시점·조건(이벤트가 등)에 따라 다를 수 있습니다.";
    if (t[0] === "이용자 제보") return "※ 이용자 제보가 — 검증 전이며 실제와 다를 수 있습니다.";
    return "";
  }

  // ── 찜(favorite) ──
  var FAVS = {};
  try { FAVS = JSON.parse(localStorage.getItem("implant_favs") || "{}"); } catch (e) { FAVS = {}; }
  function favKey(d) { return String(d.name || "").replace(/[^\wㄱ-힣]/g, "") + Math.round((d.lat || 0) * 1000); }
  function saveFavs() { try { localStorage.setItem("implant_favs", JSON.stringify(FAVS)); } catch (e) {} }
  function favCount() { return Object.keys(FAVS).length; }
  function updateFavChip() { var c = $("fFav"); if (c) c.textContent = "💗 찜" + (favCount() ? " (" + favCount() + ")" : ""); }
  window.__toggleFav = function (key, el) {
    if (FAVS[key]) delete FAVS[key]; else FAVS[key] = 1;
    saveFavs();
    if (el) { el.className = "kk-fav" + (FAVS[key] ? " on" : ""); el.textContent = FAVS[key] ? "💗 찜됨" : "🤍 찜하기"; }
    updateFavChip();
    var fn = $("favN"); if (fn) fn.textContent = favCount();
    if (panelOpen) renderFavPanel();
    if (fFav && currentRefresh) currentRefresh();
  };
  var currentRefresh = null;

  // ── 임플란트 개수 / 메모 / 예상비용 ──
  var COUNT = parseInt(localStorage.getItem("implant_count"), 10) || 2;
  function setCount(n) { COUNT = n || 0; try { localStorage.setItem("implant_count", COUNT); } catch (e) {} }
  function totalCost(d) { return hasPrice(d) ? d.price * COUNT : null; }
  function favList() { return DATA.filter(function (d) { return FAVS[favKey(d)]; }); }
  function getMemo(d) { try { return localStorage.getItem("implant_memo_" + favKey(d)) || ""; } catch (e) { return ""; } }

  // ── 키워드 평가(로컬) ──
  var KEYWORDS = [
    ["🙂", "응대가 친절해요"], ["💬", "설명이 자세해요"], ["💰", "가격이 합리적이에요"],
    ["🦷", "임플란트 잘해요"], ["🏥", "시설이 깨끗해요"], ["🅿️", "주차가 편해요"],
    ["🚇", "교통이 편해요"], ["⏱️", "대기가 짧아요"], ["😌", "통증 케어 좋아요"],
  ];
  function kwVoteKey(d) { return "implant_kw_" + favKey(d); }
  function getVotes(d) { try { return JSON.parse(localStorage.getItem(kwVoteKey(d)) || "[]"); } catch (e) { return []; } }
  function setVotes(d, a) { try { localStorage.setItem(kwVoteKey(d), JSON.stringify(a)); } catch (e) {} }
  function kwCount(d, label) { return getVotes(d).indexOf(label) >= 0 ? 1 : 0; }
  function kwRanked(d) {
    return KEYWORDS.map(function (k) { return { emoji: k[0], label: k[1], n: kwCount(d, k[1]) }; })
      .filter(function (x) { return x.n > 0; });
  }
  // 후기(로컬)
  function revKey(d) { return "implant_rev_" + favKey(d); }
  function getRevs(d) { try { return JSON.parse(localStorage.getItem(revKey(d)) || "[]"); } catch (e) { return []; } }
  function setRevs(d, a) { try { localStorage.setItem(revKey(d), JSON.stringify(a)); } catch (e) {} }
  function revDate(ts) { var d = new Date(ts); return (d.getMonth() + 1) + "." + d.getDate(); }

  // ── 화면 고정 팝업 패널 ──
  var currentPop = null, panelEl = null;
  function getPanel() {
    if (!panelEl) { panelEl = document.createElement("div"); panelEl.id = "venuePanel"; panelEl.className = "venue-panel"; document.body.appendChild(panelEl); }
    return panelEl;
  }
  function lockMap(on) { if (map) { try { map.setDraggable(!on); map.setZoomable(!on); } catch (e) {} } }
  function rerenderPanel() {
    if (!panelEl || !currentPop) return;
    var card = panelEl.querySelector(".kkcard"), st = card ? card.scrollTop : 0;
    var ta = panelEl.querySelector(".kk-cmt textarea"), draft = ta ? ta.value : null;
    panelEl.innerHTML = popupHtml(currentPop);
    var nc = panelEl.querySelector(".kkcard"); if (nc) nc.scrollTop = st;
    var nta = panelEl.querySelector(".kk-cmt textarea"); if (nta && draft != null) nta.value = draft;
  }
  window.__kwVote = function (idx) {
    if (!currentPop || !KEYWORDS[idx]) return;
    var d = currentPop, label = KEYWORDS[idx][1], arr = getVotes(d), i = arr.indexOf(label);
    if (i >= 0) arr.splice(i, 1); else arr.push(label);
    setVotes(d, arr); rerenderPanel();
  };
  window.__addReview = function () {
    if (!currentPop || !panelEl) return;
    var d = currentPop, ta = panelEl.querySelector(".kk-cmt textarea"), t = ta ? ta.value.trim() : "";
    if (!t) { if (ta) ta.focus(); return; }
    var a = getRevs(d); a.unshift({ id: Date.now(), t: t, d: Date.now() }); setRevs(d, a);
    if (ta) ta.value = ""; rerenderPanel();
  };
  window.__delReview = function (id) {
    if (!currentPop) return;
    var d = currentPop; setRevs(d, getRevs(d).filter(function (r) { return r.id !== id; })); rerenderPanel();
  };
  window.__closePop = function () {
    if (panelEl) panelEl.classList.remove("open"); lockMap(false); currentPop = null;
    if (selectedMarker) { try { selectedMarker.setImage(selectedMarker.__img); selectedMarker.setZIndex(0); } catch (e) {} selectedMarker = null; }
  };
  function openPop(d) {
    currentPop = d;
    var p = getPanel();
    p.innerHTML = popupHtml(d);
    p.classList.add("open");
    lockMap(true);
  }

  function visible() {
    return DATA.filter(function (d) {
      return (!fVer || d.verified) && (!fPriced || hasPrice(d)) && (!fFav || FAVS[favKey(d)]);
    });
  }
  function priceColor(m, lo, hi, mid) {
    mid = mid || (lo + hi) / 2;
    var v;
    if (m <= mid) v = mid > lo ? 0.5 * (m - lo) / (mid - lo) : 0;
    else v = hi > mid ? 0.5 + 0.5 * (m - mid) / (hi - mid) : 1;
    v = Math.max(0, Math.min(1, v));
    return "hsl(" + Math.round(120 * (1 - v)) + ",72%,45%)";
  }

  function renderStats(rows) {
    var priced = rows.filter(hasPrice);
    $("mStatN").textContent = rows.length;
    $("mStatPrice").textContent = priced.length ? won(S.robust(priced.map(function (d) { return d.price; })).median) : "–";
  }

  function popupHtml(d) {
    var sub = [d.region + (d.district ? " " + d.district : ""), "치과"].join(" · ");
    var srcLab = sourceLabel(d);
    var chips = [];
    if (srcLab) chips.push("출처: " + srcLab);
    if (d.nobs > 1) chips.push(d.nobs + "개 소스 평균");
    if (d.verified) chips.push("✅ 검증");
    var chipHtml = chips.length ? '<div class="kk-chips">' + chips.map(function (c) { return "<span>" + esc(c) + "</span>"; }).join("") + "</div>" : "";
    var body;
    if (hasPrice(d)) {
      var hasRange = d.priceMin && d.priceMax && d.priceMin !== d.priceMax;
      var pv = hasRange ? (manwon(d.priceMin) + "~" + manwon(d.priceMax) + "원") : won(d.price);
      var matsHtml = (d.mats && d.mats.length) ? '<div class="kk-mats"><div class="kk-matst">재료별 (1치당)</div>' +
        d.mats.map(function (m) { return '<span><i>' + esc(m[0]) + "</i> " + manwon(m[1]) + "</span>"; }).join("") + "</div>" : "";
      body = '<div class="kk-pricerow">' +
          '<div class="kk-pb meal"><div class="kk-pblab">임플란트 1치당</div><div class="kk-pbval">' + pv + "</div></div>" +
        "</div>" + matsHtml +
        '<div class="kk-total">' + COUNT + "개 예상 ≈ <b>" + manwon(totalCost(d)) + "원</b> <small>(중앙값 기준 · 부가수술·뼈이식 별도)</small></div>" +
        '<div class="kk-caveat">' + esc(priceCaveat(d)) + "</div>" + chipHtml;
    } else {
      body = '<div class="kk-soon">💬 임플란트 비급여가 수집 중</div><div class="kk-soonsub">게시가/심평원 정보가 확인되면 표시돼요 🙏</div>' + chipHtml;
    }
    var contact = "";
    if (d.addr || d.phone) {
      contact = '<div class="kk-feat"><div class="kk-feattitle">📍 정보</div>' +
        (d.addr ? '<div class="kk-pc">' + esc(d.addr) + "</div>" : "") +
        (d.phone ? '<div class="kk-pc">☎ ' + esc(d.phone) + "</div>" : "") + "</div>";
    }
    var ranked = kwRanked(d), total = ranked.reduce(function (a, b) { return a + b.n; }, 0);
    var summary = ranked.length
      ? '<div class="kk-sum"><div class="kk-sumt">😊 여기는 이런 점이 좋아요</div><div class="kk-sumchips">' +
        ranked.slice(0, 4).map(function (x) { return "<span>" + x.emoji + " " + esc(x.label) + "</span>"; }).join("") + "</div></div>"
      : '<div class="kk-sum empty"><div class="kk-sumt">아직 평가가 없어요</div><div class="kk-sumemp">아래에서 좋았던 점을 평가해 주세요 🙏</div></div>';
    var myVotes = getVotes(d);
    var kwGrid = '<div class="kk-kw"><div class="kk-kwt">이 치과, 어떤 점이 좋았나요?</div><div class="kk-kwgrid">' +
      KEYWORDS.map(function (k, i) {
        var mine = myVotes.indexOf(k[1]) >= 0;
        return '<button class="kk-kwb' + (mine ? " on" : "") + '" onclick="window.__kwVote(' + i + ')">' +
          '<span class="kk-kwlab">' + k[0] + " " + esc(k[1]) + "</span></button>";
      }).join("") + "</div></div>";
    var revs = getRevs(d);
    var revList = revs.length ? '<div class="kk-revs">' + revs.map(function (r) {
      return '<div class="kk-rev"><div class="kk-revtxt">' + esc(r.t) + "</div>" +
        '<div class="kk-revmeta"><span>' + revDate(r.d) + " · 내 후기</span>" +
        '<button class="kk-revdel" onclick="window.__delReview(' + r.id + ')">삭제</button></div></div>';
    }).join("") + "</div>" : "";
    var cmt = '<div class="kk-cmt"><div class="kk-cmth">📝 후기 ' + (revs.length ? "<b>" + revs.length + "</b>개" : "남기기") + "</div>" +
      '<textarea maxlength="300" placeholder="다녀온 후기를 남겨보세요 (이 기기에만 저장)"></textarea>' +
      '<button class="kk-cmtbtn" onclick="window.__addReview()">후기 등록</button>' + revList + "</div>";
    var key = favKey(d), on = !!FAVS[key];
    var fav = '<button class="kk-fav' + (on ? " on" : "") + '" onclick="window.__toggleFav(\'' + key + '\',this)">' +
      (on ? "💗 찜됨" : "🤍 찜하기") + "</button>";
    var hpLink = d.homepage ? '<a class="kk-link" href="' + esc(d.homepage) + '" target="_blank" rel="noopener">🌐 홈페이지</a>' : "";
    return '<div class="kkcard">' +
      '<button class="kk-x" onclick="window.__closePop&&window.__closePop()" aria-label="닫기">×</button>' +
      '<div class="kk-name">' + esc(d.name || sub) + "</div>" +
      '<div class="kk-sub">' + esc(sub) + "</div>" +
      summary + body + contact + kwGrid + cmt +
      '<div class="kk-actions">' + fav + hpLink + "</div>" +
      '<div class="kk-tail"></div></div>';
  }

  // ── 필터 UI ──
  function buildFilters(onChange) {
    currentRefresh = onChange;
    var ff = $("fFav"); if (ff) { ff.className = "chip" + (fFav ? " on" : ""); ff.onclick = function () { fFav = !fFav; buildFilters(onChange); onChange(); }; }
    var pb = $("fPriced"); if (pb) { pb.className = "chip" + (fPriced ? " on" : ""); pb.onclick = function () { fPriced = !fPriced; buildFilters(onChange); onChange(); }; }
    var vb = $("fVer"); if (vb) { vb.className = "chip" + (fVer ? " on" : ""); vb.onclick = function () { fVer = !fVer; buildFilters(onChange); onChange(); }; }
    updateFavChip();
  }

  // ── 검색 ──
  function goToClinic(d) {
    if (!map) return;
    var pos = new kakao.maps.LatLng(d.lat, d.lng);
    map.setLevel(3); map.setCenter(pos); openPop(d);
  }
  function setupSearch() {
    var inp = $("qInput"), box = $("qResults");
    if (!inp) return;
    var current = [];
    function close() { box.innerHTML = ""; box.style.display = "none"; }
    inp.addEventListener("input", function () {
      var q = inp.value.replace(/\s/g, "").toLowerCase();
      if (q.length < 1) { close(); return; }
      current = DATA.filter(function (d) {
        var hay = ((d.name || "") + (d.district || "") + (d.addr || "")).replace(/\s/g, "").toLowerCase();
        return hay.indexOf(q) >= 0;
      }).sort(function (a, b) { return (hasPrice(b) ? 1 : 0) - (hasPrice(a) ? 1 : 0); }).slice(0, 10);
      if (!current.length) { box.innerHTML = '<div class="qempty">검색 결과 없음</div>'; box.style.display = "block"; return; }
      box.innerHTML = current.map(function (d, i) {
        return '<button class="qitem" data-i="' + i + '"><b>' + esc(d.name || "") + "</b><small>" +
          esc(d.district || "연수구") + (hasPrice(d) ? " · " + manwon(d.price) + "원" : " · 가격 미확인") + "</small></button>";
      }).join("");
      box.style.display = "block";
      Array.prototype.forEach.call(box.querySelectorAll(".qitem"), function (b) {
        b.addEventListener("click", function () { var d = current[+b.getAttribute("data-i")]; inp.value = d.name || ""; close(); goToClinic(d); });
      });
    });
    inp.addEventListener("blur", function () { setTimeout(close, 200); });
  }

  // ── 카카오 지도 ──
  var map, clusterer, imgCache = {}, selectedMarker = null;
  function pillSVG(text, color, sel) {
    var w = 24 + Math.max(2, text.length) * 10 + 8, h = 24, th = h + 8, cx = w / 2;
    var bg = sel ? "#1f2937" : "#ffffff", fg = sel ? "#ffffff" : "#0f1620", bd = sel ? "#1f2937" : color;
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + th + '">' +
      '<path d="M' + (cx - 6) + ' ' + (h - 1) + ' L' + cx + ' ' + (th - 1) + ' L' + (cx + 6) + ' ' + (h - 1) + ' Z" fill="' + bg + '" stroke="' + bd + '" stroke-width="2"/>' +
      '<rect x="1.5" y="1.5" rx="11" ry="11" width="' + (w - 3) + '" height="' + (h - 3) + '" fill="' + bg + '" stroke="' + bd + '" stroke-width="2"/>' +
      '<circle cx="14" cy="' + (h / 2) + '" r="4.5" fill="' + color + '"/>' +
      '<text x="24" y="' + (h / 2 + 4.5) + '" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="12.5" font-weight="700" fill="' + fg + '">' + text + '</text>' +
      '</svg>';
  }
  function markerImage(d, lo, hi, mid, sel) {
    if (!hasPrice(d)) {
      if (imgCache.g) return imgCache.g;
      var g = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22"><circle cx="11" cy="11" r="7" fill="#9aa4ba" fill-opacity="0.30" stroke="#9aa4ba" stroke-width="2.5"/></svg>';
      imgCache.g = new kakao.maps.MarkerImage("data:image/svg+xml," + encodeURIComponent(g), new kakao.maps.Size(22, 22), { offset: new kakao.maps.Point(11, 11) });
      return imgCache.g;
    }
    var t = manwon(d.price), color = priceColor(d.price, lo, hi, mid);
    var key = (sel ? "s|" : "p|") + t + "|" + color;
    if (imgCache[key]) return imgCache[key];
    var w = 24 + Math.max(2, t.length) * 10 + 8, th = 32;
    var img = new kakao.maps.MarkerImage("data:image/svg+xml," + encodeURIComponent(pillSVG(t, color, sel)),
      new kakao.maps.Size(w, th), { offset: new kakao.maps.Point(w / 2, th) });
    imgCache[key] = img; return img;
  }
  function drawKakao() {
    var rows = visible();
    var pm = DATA.filter(hasPrice).map(function (d) { return d.price; });
    var lo = pm.length ? Math.min.apply(null, pm) : 800000, hi = pm.length ? Math.max.apply(null, pm) : 2500000;
    var sm = pm.slice().sort(function (a, b) { return a - b; });
    var mid = sm.length ? sm[Math.floor(sm.length / 2)] : (lo + hi) / 2;
    clusterer.clear(); selectedMarker = null;
    var markers = rows.map(function (d) {
      var normal = markerImage(d, lo, hi, mid, false);
      var mk = new kakao.maps.Marker({
        position: new kakao.maps.LatLng(d.lat, d.lng), image: normal,
        title: (d.name || "") + (hasPrice(d) ? " " + manwon(d.price) : ""),
      });
      mk.__img = normal;
      if (hasPrice(d)) mk.__selImg = markerImage(d, lo, hi, mid, true);
      kakao.maps.event.addListener(mk, "click", function () {
        if (selectedMarker && selectedMarker !== mk) { try { selectedMarker.setImage(selectedMarker.__img); selectedMarker.setZIndex(0); } catch (e) {} }
        if (mk.__selImg) { mk.setImage(mk.__selImg); mk.setZIndex(10000); selectedMarker = mk; }
        openPop(d); map.panTo(mk.getPosition());
      });
      return mk;
    });
    clusterer.addMarkers(markers);
    renderStats(rows);
  }
  function initKakao() {
    map = new kakao.maps.Map($("map"), { center: new kakao.maps.LatLng(37.4106, 126.6782), level: 6 });
    map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
    var cstyle = function (sz, fs) {
      return {
        width: sz + "px", height: sz + "px", background: "rgba(34,211,238,.9)", borderRadius: (sz / 2) + "px",
        color: "#0f1620", textAlign: "center", lineHeight: sz + "px", fontSize: fs + "px", fontWeight: "700",
        border: "2px solid #fff", boxShadow: "0 3px 12px rgba(34,211,238,.35)",
      };
    };
    clusterer = new kakao.maps.MarkerClusterer({
      map: map, averageCenter: true, minLevel: 5, gridSize: 60, disableClickZoom: false,
      calculator: [10, 30, 100], styles: [cstyle(34, 13), cstyle(40, 14), cstyle(48, 15), cstyle(58, 17)],
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") window.__closePop(); });
    buildFilters(drawKakao); drawKakao(); setupSearch();
    try {
      var b = new kakao.maps.LatLngBounds();
      DATA.forEach(function (d) { b.extend(new kakao.maps.LatLng(d.lat, d.lng)); });
      if (DATA.length) map.setBounds(b);
    } catch (e) {}
    if (USING_SAMPLE) {
      var ob = $("offlineBanner");
      if (ob) { ob.textContent = "ℹ️ 아직 실데이터가 없어 예시(샘플)로 표시 중이에요. 수집(harvest/hira) 후 실제 치과로 채워집니다."; ob.style.display = "block"; }
    }
  }

  // ── 폴백(목록) ──
  function initFallback() {
    $("map").style.display = "none";
    var ms = $("msearch"); if (ms) ms.style.display = "none";
    var ob = $("offlineBanner");
    ob.textContent = "🗺️ 카카오 지도를 불러오지 못했어요. 카카오 개발자 콘솔 → 플랫폼 → Web 에 도메인(https://ikdd7.github.io) 등록 후 새로고침 해주세요." +
      (USING_SAMPLE ? " (현재 예시 데이터 표시 중)" : "");
    ob.style.display = "block";
    var fb = $("mapFallback"); fb.style.display = "flex";
    buildFilters(renderList); renderList();
    function renderList() {
      var rows = visible().slice().sort(function (a, b) {
        var pa = hasPrice(a) ? a.price : Infinity, pb = hasPrice(b) ? b.price : Infinity; return pa - pb;
      });
      renderStats(visible());
      var el = $("fbList");
      el.innerHTML = '<div class="fb-h">🦷 연수구 임플란트 치과 ' + rows.length + '곳</div>' + rows.map(function (d) {
        return '<div class="fb-item"><div class="fb-n">' + esc(d.name) + (d.verified ? " ✅" : "") + "</div>" +
          '<div class="fb-p">' + (hasPrice(d) ? won(d.price) + " <small>/1치</small>" : "가격 미확인") + "</div></div>";
      }).join("");
    }
  }

  // ── 찜·비교 패널 ──
  var panelOpen = false;
  function renderFavPanel() {
    var list = favList(), el = $("fpList");
    var fn = $("favN"); if (fn) fn.textContent = favCount();
    if (!el) return;
    if (!list.length) { el.innerHTML = '<div class="fp-empty">아직 찜한 곳이 없어요.<br>지도 핀을 눌러 🤍 를 탭해보세요 💗</div>'; return; }
    list.sort(function (a, b) { var ta = totalCost(a), tb = totalCost(b); if (ta == null) return 1; if (tb == null) return -1; return ta - tb; });
    el.innerHTML = list.map(function (d, i) {
      var k = favKey(d), t = totalCost(d);
      var cost = hasPrice(d)
        ? '<div class="fp-cost"><span>1치 ' + manwon(d.price) + "원 × " + COUNT + "개</span><b>" + manwon(t) + "원</b></div>"
        : '<div class="fp-cost"><span>가격 미확인</span></div>';
      var rank = (hasPrice(d) && i === 0) ? '<span class="fp-best">최저</span>' : "";
      return '<div class="fp-item"><div class="fp-top"><div><div class="fp-name">' + esc(d.name) + rank +
        '</div><div class="fp-sub">' + esc((d.district || "연수구") + (sourceLabel(d) ? " · " + sourceLabel(d) : "")) + "</div></div>" +
        "<button class=\"fp-rem\" onclick=\"window.__toggleFav('" + k + "')\">💔</button></div>" + cost +
        '<input class="fp-memo" data-k="' + k + '" placeholder="메모 (예: 상담 친절? 뼈이식 별도?)" value="' + esc(getMemo(d)) + '"></div>';
    }).join("");
    Array.prototype.forEach.call(el.querySelectorAll(".fp-memo"), function (inp) {
      inp.addEventListener("input", function () { try { localStorage.setItem("implant_memo_" + inp.getAttribute("data-k"), inp.value); } catch (e) {} });
    });
  }
  function shareFavs() {
    var list = favList();
    if (!list.length) { alert("먼저 마음에 드는 치과를 찜해보세요 💗"); return; }
    list.sort(function (a, b) { var ta = totalCost(a), tb = totalCost(b); if (ta == null) return 1; if (tb == null) return -1; return ta - tb; });
    var lines = list.map(function (d) { var t = totalCost(d); return "· " + d.name + (t != null ? " ≈ " + manwon(t) + "원" : " (가격 미확인)"); });
    var text = "🦷 연수구 임플란트 치과 찜 (임플란트 " + COUNT + "개 기준)\n" + lines.join("\n") + "\n\n연수구 임플란트 지도에서 비교했어요!";
    if (navigator.share) navigator.share({ title: "내 임플란트 치과 찜", text: text }).catch(function () {});
    else if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { alert("찜 목록을 복사했어요! 카톡에 붙여넣기 하세요 📋"); });
    else alert(text);
  }
  function initPanel() {
    var openB = $("favOpen"), panel = $("favPanel");
    if (!openB || !panel) return;
    openB.onclick = function () { panelOpen = !panelOpen; panel.classList.toggle("open", panelOpen); if (panelOpen) renderFavPanel(); };
    $("favClose").onclick = function () { panelOpen = false; panel.classList.remove("open"); };
    var gi = $("fpCount"); gi.value = COUNT;
    gi.addEventListener("input", function () { setCount(parseInt(gi.value.replace(/[^0-9]/g, ""), 10) || 0); renderFavPanel(); });
    $("fpShare").onclick = shareFavs;
    var fn = $("favN"); if (fn) fn.textContent = favCount();
  }
  initPanel();

  // ── SDK 로드 ──
  function loadKakaoSDK(ok, fail) {
    var s = document.createElement("script");
    s.src = "https://dapi.kakao.com/v2/maps/sdk.js?appkey=" + window.KAKAO_JS_KEY + "&libraries=clusterer&autoload=false";
    s.onload = function () { if (window.kakao && kakao.maps) kakao.maps.load(ok); else fail(); };
    s.onerror = fail;
    document.head.appendChild(s);
  }
  if (window.KAKAO_JS_KEY) loadKakaoSDK(initKakao, initFallback);
  else initFallback();
})();
