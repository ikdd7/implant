/*
 * build.js — 구(자치구)별 랜딩 페이지 정적 생성기 + sitemap
 * 실행:  node build.js
 * 입력:  clinics.js · stats.js · regions.js
 * 출력:  region/{slug}.html (가격 보유 3곳 이상 구만) · sitemap.xml
 *
 * 핵심: H1·메타·요약문에 '임플란트 1치 중앙값 숫자'를 정적으로 박아 SEO 즉답 + thin content 방지.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const Stats = require("./stats.js").Stats;
const SLUGS = require("./regions.js").DISTRICT_SLUGS;

const SITE = "https://ikdd7.github.io/implant";
const MIN_PAGE = 3;
const ROOT = __dirname;

function loadData() {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, "clinics.js"), "utf8"), sandbox);
  return (sandbox.window.CLINICS || []).filter(Stats.plausible);
}
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function districtPage(district, recs, all) {
  const slug = SLUGS[district];
  const prices = recs.map((d) => d.price);
  const r = Stats.robust(prices);
  const med = r.median;
  const q1 = Math.round(Stats.quantile(prices, 0.25)), q3 = Math.round(Stats.quantile(prices, 0.75));
  const verified = recs.filter((d) => d.verified).length;
  const today = new Date().toISOString().slice(0, 10);
  const medTxt = Stats.manwon(med) + "원";

  const summary = `${district} 임플란트(1치당) 비급여가는 중앙값 ${medTxt}, 대부분 ${Stats.manwon(q1)}~${Stats.manwon(q3)}원 사이입니다. (치과 ${recs.length}곳 기준, 부가수술·뼈이식 별도일 수 있음)`;
  const title = `${district} 임플란트 가격 ${medTxt} (1치 중앙값) — 비급여가 비교`;
  const desc = `인천 ${district} 치과 임플란트 1치당 비급여가 중앙값 ${medTxt}. 심평원 비급여정보·홈페이지 게시가 기준 ${recs.length}곳 분포·내 견적 비교.`;

  const near = all.filter((r) => r !== district).slice(0, 6).map((r) => `<a href="${SLUGS[r]}.html">${esc(r)}</a>`).join(" · ");

  const gateRows = recs.slice().sort((a, b) => a.price - b.price).slice(0, 30).map((d) => {
    const src = /hira/i.test(d.priceSources || d.source || "") ? "심평원" : (/site\//i.test(d.priceSources || d.source || "") ? "홈페이지" : "—");
    return `<tr><td>${esc(d.name || "-")}</td><td>${Stats.won(d.price)}</td><td>${src}</td><td>${d.verified ? "✅" : "–"}</td></tr>`;
  }).join("");

  const ld = {
    "@context": "https://schema.org", "@type": "Dataset",
    name: `인천 ${district} 임플란트 비급여가 데이터`, description: desc,
    creator: { "@type": "Organization", name: "연수구 임플란트 지도" },
    variableMeasured: ["임플란트 1치당 비급여가"], dateModified: today,
  };
  const faq = {
    "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [
      { "@type": "Question", name: `${district} 임플란트 가격은 얼마인가요?`, acceptedAnswer: { "@type": "Answer", text: `${district} 임플란트 1치당 비급여가 중앙값은 ${medTxt}이며, 대부분 ${Stats.manwon(q1)}~${Stats.manwon(q3)}원 사이입니다. (치과 ${recs.length}곳 기준)` } },
      { "@type": "Question", name: "이 가격은 어떻게 모았나요?", acceptedAnswer: { "@type": "Answer", text: "건강보험심사평가원 비급여진료비 정보와 치과 홈페이지에 게시된 비급여가를 모아 중앙값으로 집계하고 IQR 이상치를 제외합니다. 자세한 방법은 방법론 페이지를 참고하세요." } },
    ],
  };
  const crumb = {
    "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "연수구 임플란트 지도", item: SITE + "/map.html" },
      { "@type": "ListItem", position: 2, name: district, item: `${SITE}/region/${slug}.html` },
    ],
  };

  const embed = JSON.stringify(recs.map((d) => ({ name: d.name, price: d.price, verified: !!d.verified, source: d.priceSources || d.source })));

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
<link rel="canonical" href="${SITE}/region/${slug}.html" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${esc(district)} 임플란트 ${esc(medTxt)} (1치 중앙값)" />
<meta property="og:description" content="${esc(summary)}" />
<meta property="og:locale" content="ko_KR" />
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🦷</text></svg>" />
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<script type="application/ld+json">${JSON.stringify(faq)}</script>
<script type="application/ld+json">${JSON.stringify(crumb)}</script>
<link rel="stylesheet" href="../style.css" />
</head>
<body>

<nav class="sitenav"><div class="in">
  <span class="brand">🦷 연수구 임플란트</span>
  <a href="../map.html">🗺️ 지도</a>
  <a href="../method.html">방법론</a>
</div></nav>

<header class="wrap">
  <nav class="crumb"><a href="../map.html">연수구 임플란트 지도</a> › <b>${esc(district)}</b></nav>
  <h1 style="margin-top:8px">${esc(district)} 임플란트 비급여가 중앙값<br><span class="hero">${esc(medTxt)}</span> <span class="heroin">/ 1치(개)</span></h1>
  <p class="metaline">치과 ${recs.length}곳 · 검증 ${verified}건 · 2026 기준 · ${today} 갱신</p>
  <p class="summary">${esc(summary)}</p>
  <a class="cta" href="#compare">내 견적은 평균보다 비쌀까? →</a>
</header>

<main class="wrap">
  <div class="chart-card"><h3>📊 임플란트가 분포 (1치, 20만원 구간)</h3><div id="cDist"></div>
    <p class="cap">막대가 높을수록 그 가격대 치과가 많다는 뜻. 내 견적 위치는 아래 비교에서.</p></div>

  <h2 id="compare" style="margin:28px 0 12px;font-size:1.3rem">💰 내 견적 vs ${esc(district)} 평균</h2>
  <div class="card">
    <div class="grid2">
      <div class="field"><label>견적받은 1치 가격</label><div class="inputrow"><input id="mM" inputmode="numeric" placeholder="1,500,000"/><span class="unit">원</span></div></div>
      <div class="field"><label>임플란트 개수</label><div class="inputrow"><input id="mC" inputmode="numeric" placeholder="2"/><span class="unit">개</span></div></div>
    </div>
  </div>
  <div class="result">
    <div class="lbl">내 예상 비용</div><div class="big" id="pRes">–</div>
    <div class="verdict" id="pVer"></div>
  </div>
  <div class="share" id="share"></div>

  <div class="chart-card gatewrap">
    <h3>🏥 ${esc(district)} 치과별 임플란트가 (1치)</h3>
    <div id="gate" class="gate">
      <table class="seedtbl"><thead><tr><th>치과</th><th>1치당</th><th>출처</th><th>검증</th></tr></thead>
      <tbody>${gateRows}</tbody></table>
    </div>
    <div class="gateover"><button type="button" class="sharebtn alt" id="gateBtn">🔓 전체 보기</button>
      <p class="cap">집계는 누구나, 치과별 상세는 한 번 더 눌러 확인하세요.</p></div>
  </div>
  <p class="cap" style="margin-top:8px">※ <b>심평원 신고가와 실제 진료가·이용자 경험가는 다를 수 있습니다.</b> 출처(심평원/홈페이지)를 표에 함께 표기하니 참고용으로만 봐주세요.</p>

  <h2 style="margin:26px 0 12px;font-size:1.2rem">자주 묻는 질문</h2>
  <details open><summary>${esc(district)} 임플란트 가격은 얼마인가요?</summary><div class="a">1치당 비급여가 중앙값은 ${esc(medTxt)}이며, 대부분 ${esc(Stats.manwon(q1))}~${esc(Stats.manwon(q3))}원 사이입니다. (치과 ${recs.length}곳 기준, 이상치 제외)</div></details>
  <details><summary>이 가격은 믿을 수 있나요?</summary><div class="a">평균이 아닌 중앙값으로 집계하고 IQR 이상치를 자동 제외합니다. 심평원 비급여정보와 치과 홈페이지 게시가를 출처로 표기합니다. <a href="../method.html">방법론 보기</a></div></details>
  <details><summary>표시가에 뼈이식·부가수술이 포함되나요?</summary><div class="a">아니요. 임플란트 1치(픽스처+지대주+크라운) 기준이며, 발치·뼈이식(골이식)·상악동거상술 등 부가수술은 별도일 수 있습니다. 실제 비용은 치과 상담에서 확인하세요.</div></details>
</main>

<footer class="wrap">
  <p>표시 데이터는 공개정보·게시가 기반 추정치이며 실제 진료비와 다를 수 있습니다. 진료 전 직접 확인하세요.</p>
  <p style="margin-top:6px">인근 지역: ${near || "준비 중"}</p>
  <p style="margin-top:6px"><a href="../method.html">방법론·신뢰</a> · © <span id="yr"></span> 연수구 임플란트 지도</p>
</footer>

<script>window.REGION_NAME=${JSON.stringify(district)};window.REGION_DATA=${embed};</script>
<script src="../stats.js"></script>
<script src="../charts.js"></script>
<script src="../share.js"></script>
<script src="../region.js"></script>
</body>
</html>
`;
}

function sitemap(slugs) {
  const today = new Date().toISOString().slice(0, 10);
  const statics = [["/map.html", "1.0", "weekly"], ["/method.html", "0.5", "monthly"]];
  let x = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  statics.forEach(([u, p, f]) => { x += `  <url><loc>${SITE}${u}</loc><changefreq>${f}</changefreq><priority>${p}</priority></url>\n`; });
  slugs.forEach((s) => { x += `  <url><loc>${SITE}/region/${s}.html</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>\n`; });
  return x + "</urlset>\n";
}

// 수동 오버라이드(overrides.js) 적용 — 매 빌드마다 재적용되어 재수집에도 안 덮임
function applyOverrides() {
  let overrides = [];
  try { overrides = require("./overrides.js"); } catch (e) { return; }
  if (!overrides.length) return;
  const store = require("./store.js");
  const { matchClinic } = require("./pricemerge.js");
  const hostOf = (u) => { try { return new URL(u).host; } catch (e) { return "manual"; } };
  const { clinics, sample } = store.load();
  let n = 0;
  overrides.forEach((o) => {
    if (!o || !o.name) return;
    const c = clinics.find((x) => matchClinic(x, { name: o.name, district: o.district || "연수구" }));
    if (!c) { console.warn("  오버라이드 매칭 실패:", o.name); return; }
    if (o.price) c.price = o.price;
    if (o.min && o.max) { c.priceMin = o.min; c.priceMax = o.max; } else { delete c.priceMin; delete c.priceMax; }
    if (o.mats) c.mats = o.mats; else delete c.mats;
    const h = o.url ? hostOf(o.url) : "manual";
    c.source = "site/" + h;
    c.priceSources = (c.priceSources ? c.priceSources.split("|").filter((s) => !/^site\//.test(s)).join("|") : "");
    c.priceSources = (c.priceSources ? c.priceSources + "|" : "") + "site/" + h;
    if (o.url) c.priceUrl = o.url;
    c.verified = true;
    n++;
  });
  if (n) { store.write(clinics, sample); console.log("수동 오버라이드 적용: " + n + "곳"); }
}

function main() {
  applyOverrides();
  const data = loadData();
  const byD = {};
  data.forEach((d) => (byD[d.district] = byD[d.district] || []).push(d));
  const eligible = Object.keys(byD).filter((r) => SLUGS[r] && byD[r].length >= MIN_PAGE)
    .sort((a, b) => byD[b].length - byD[a].length);

  const dir = path.join(ROOT, "region");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  fs.readdirSync(dir).filter((f) => f.endsWith(".html")).forEach((f) => fs.unlinkSync(path.join(dir, f)));
  eligible.forEach((r) => fs.writeFileSync(path.join(dir, SLUGS[r] + ".html"), districtPage(r, byD[r], eligible), "utf8"));
  fs.writeFileSync(path.join(ROOT, "sitemap.xml"), sitemap(eligible.map((r) => SLUGS[r])), "utf8");

  console.log(`구 페이지 ${eligible.length}개 생성: ${eligible.map((r) => r + "(" + byD[r].length + ")").join(", ") || "없음(가격 보유 3곳 미만)"}`);
}
main();
