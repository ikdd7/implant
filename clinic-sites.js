/*
 * clinic-sites.js — 홈페이지 비급여가 스크랩 대상 목록(운영자가 채움)
 *
 * 치과 홈페이지에 임플란트 비급여가가 '게시'되어 있는 곳만 등록하세요.
 * scrape-clinic.js가 각 url을 렌더링해 '임플란트 + 금액'을 best-effort로 추출합니다.
 * 추출이 애매하면 price를 직접 적어 강제 입력할 수도 있습니다(검증 권장).
 *
 *   { name: "○○치과", url: "https://...", price?: 1200000, source?: "..." }
 *
 * name은 clinics.js의 치과명과 매칭됩니다(부분일치 허용).
 */
module.exports = [
  // 예) { name: "송도서울대치과", url: "https://example-dental.kr/price" },
];
