/*
 * overrides.js — 수동 가격 오버라이드 (홈페이지 수가표 등 직접 확인한 값)
 *
 * 여기에 적은 값은 build.js가 매 빌드마다 clinics.js에 다시 입혀서,
 * harvest/hira/npay 재수집을 해도 덮이지 않고 유지됩니다(verified=true).
 *
 * 형식:
 *   { name:"치과명", price:1200000, min?:990000, max?:1500000,
 *     mats?:[["지르코니아",1200000],["PFM",990000]], url?:"http://.../price" }
 *   - name: clinics.js의 치과명과 매칭(부분/핵심상호 일치 허용)
 *   - price: 대표가(핀 색·계산용). min/max 있으면 범위로 표시.
 *   - mats: 재료별(선택). url: 수가표 페이지(팝업 📋수가표 링크).
 */
module.exports = [
  // 예) { name:"연세제일치과의원", price:1200000, min:990000, max:1500000, url:"http://ysjeildent.co.kr/price" },
];
