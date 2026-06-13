# 🦷 인천 연수구 임플란트 치과 지도

연수구 치과의 **임플란트 1치(개)당 비급여가**를 카카오 지도 위에서 위치·가격으로 비교하는
정적 사이트입니다. (웨딩홀 지도와 같은 베이스 · 의존성 0)

> 우선 범위: **인천 연수구 · 임플란트만**. 점진 확장 예정.

---

## ✨ 무엇을 하나
- 🗺️ **연수구 치과 지도** — 카카오 지도에 핀 표시. 임플란트가별 색상(저렴 초록↔비쌈 빨강), 미확인은 회색
- 🔎 **필터** — 💰가격있는 곳만 · ✅검증만 · 💗찜
- 💗 **찜·비교** — 임플란트 **N개 기준 예상비용**으로 정렬 비교 → 메모 → 카톡 공유
- 📍 **클릭 팝업** — 치과명·주소·1치당 비급여가·출처(심평원/홈페이지)·로컬 후기/평가
- 📄 **구 SEO 페이지** — "연수구 임플란트 가격 중앙값"을 정적 HTML로 (가격 보유 3곳↑ 자동 생성)

## 🧱 데이터가 만들어지는 방식
| 단계 | 도구 | 소스 |
|---|---|---|
| 치과 이름·좌표 | `harvest.js` (카카오 장소검색) | 연수구 치과 순회 |
| 좌표 정밀화 | `geocode.js` (카카오) | 이름→정확 좌표 |
| **① 비급여가** | `hira.js` | **심평원 비급여진료비정보 OpenAPI** (치과임플란트 1치당) |
| **② 비급여가** | `scrape-clinic.js` | **치과 홈페이지에 게시된** 임플란트가(있을 때만) |
| 중복 병합 | `dedupe.js` | 같은 치과 합침 + 잡음(기공소 등) 제거 |
| 가격 병합 | `pricemerge.js` | **다른 소스면 평균**, 같은 소스는 스킵 |

> 가격은 1치(개)당 비급여가입니다. **뼈이식·부가수술 별도**일 수 있습니다(`method.html` 참고).

## 🤖 자동화 (GitHub Actions — Actions 탭에서 Run)
- `harvest.yml` — 연수구 치과 수확 (secret **`KAKAO_REST_KEY`**)
- `hira.yml` — 심평원 임플란트 비급여가 (secret **`HIRA_SERVICE_KEY`** = data.go.kr 인증키)
- `scrape.yml` — 홈페이지 게시가 (`clinic-sites.js`에 대상 등록 후)
- `pages.yml` — 브랜치 푸시 시 GitHub Pages 자동 배포

### 🔑 키 발급
- **KAKAO_REST_KEY**: developers.kakao.com → 내 애플리케이션 → REST API 키
  (지도 표시용 JS 키는 `map.html`의 `window.KAKAO_JS_KEY`에 입력 + Web 도메인 등록)
- **HIRA_SERVICE_KEY**: [공공데이터포털 비급여진료비정보조회서비스](https://www.data.go.kr/data/15001700/openapi.do) 활용신청 → 일반 인증키(Decoding)

> ⚠️ `hira.js`는 1회차 실행 시 응답 첫 레코드(raw)를 로그로 출력합니다.
> 항목명/금액 필드명이 다르면 `hira.js` 상단의 `NAME_KEYS`/`AMT_KEYS`만 보정하세요.

## 🗂️ 주요 파일
```
map.html / map.js   ← 메인 지도(카카오 SDK, 필터·찜·비교·팝업, 미설정 시 목록 폴백)
clinics.js          ← 연수구 치과 데이터(이름·좌표·임플란트가·출처)  ※수집기가 생성
store.js            ← clinics.js 읽기/쓰기 공용(부작용 없음)
stats.js            ← 강건 통계(중앙값·이상치제외·백분위)
dedupe.js / pricemerge.js ← 중복 병합 / 가격 병합(다중소스 평균)
harvest.js / geocode.js   ← 카카오 이름·좌표 수집/정밀화
hira.js             ← 심평원 비급여 임플란트가 수집
scrape-clinic.js / clinic-sites.js ← 홈페이지 게시가 수집 / 대상 목록
build.js → region/*.html  ← 구 SEO 랜딩 + sitemap
region.js / charts.js / share.js ← 랜딩 클라이언트(차트·백분위·공유카드)
method.html         ← 방법론·출처·면책
test.js             ← 검증
```

## 🔧 로컬에서
```bash
node test.js        # 검증
node build.js       # 구 페이지·sitemap 재생성
python3 -m http.server   # http://localhost:8000/map.html
```

## ⚖️ 한계 (정직하게)
- 모든 치과가 가격을 공개하진 않음 — 미확인은 회색
- 가격은 공개정보·게시가 기반 **추정치(검증 전)** — 진료 전 직접 확인
- 자세한 출처·집계·면책: `method.html`, `LEGAL_NOTES.md`
