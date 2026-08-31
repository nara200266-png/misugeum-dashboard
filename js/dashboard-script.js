/*
  미수금 현황 대시보드 - JavaScript
  ConnectBean 생두사업팀

  함수 목록:
  - init()                   : 페이지 초기화
  - injectTablePopupUI()     : 미수 상세내역 팝업 버튼/모달 DOM 주입 (레이아웃 재생성 없이 동작)
  - renderManagerFilter()    : 담당자 필터 버튼 렌더
  - renderPaytypeFilter()    : 결제조건 필터 버튼 렌더
  - renderRiskFilter()       : 위험도 필터 버튼 렌더
  - selectManager(idx)       : 담당자 선택
  - selectPaytype(idx)       : 결제조건 선택
  - selectRisk(idx)          : 위험도 선택
  - resetFilters()           : 필터 초기화
  - updateStatus()           : 상태바 업데이트
  - applyFilters()           : 전체 필터 적용 (KPI + 차트 + 테이블)
  - renderTable()            : 미수 테이블 렌더 (담당자/결제조건/위험도가 전부 "전체"면 renderDepositTable로 위임)
  - renderDepositTable(q)    : 최근 입금내역 표 렌더 (기본 최근 7일, 최신순)
  - toggleAll()              : 전체 펼치기/접기
  - openTablePopup()         : 미수 상세내역을 거래처별 목록 팝업으로 한눈에 보기
  - renderCharts()           : 차트 렌더
  - renderManagerRankList()  : 담당자별 미수금 리스트 렌더 (MANAGER_RANK_ORDER 직급순 고정)
  - selectRankPaytype(idx)   : 순위 리스트 전용 결제조건 미니 필터 선택
  - openManagerRankModal(name) : 순위 리스트에서 담당자 클릭 시 거래처별 미수금 모달 표시
  - showLedger(companyName)  : 거래처 클릭 시 오른쪽 원장 표시
  - printLedger()            : 원장을 브라우저 인쇄(→ PDF로 저장)로 내보냄
  - toggleLedgerSubtotal(kind) : 원장의 일별/월별 소계 표시 토글 (두 뷰 공통)
  - closeLedger()            : 원장 닫기
  - formatAmount(n)          : 숫자 포맷 (억/만원)
  - formatAmountFull(n)      : 숫자 포맷 (전체 원 단위)
  - formatDate(serial)       : 엑셀 날짜 시리얼 → YYYY-MM-DD
  - calcRisk(serial, paytype): 위험도 계산
  - renderFundIssues()       : 자금 특이사항(과입금/선입금) 렌더 - 필터와 무관하게 항상 표시
  - injectOutstandingListUI(): "미수 업체 리스트" 검색창+영역을 최근입금내역 아래에 1회 주입
  - renderOutstandingList()  : 미수 업체 리스트 렌더 (액수 큰 순, 거래처명 검색 반영)
  - setLedgerDateThisMonth() : 원장 기간 필터 빠른 선택 - 당월 1일~말일
  - setLedgerDateLastMonth() : 원장 기간 필터 빠른 선택 - 지난달 1일~말일
  - renderTrendWidget()      : 원장 대기화면에 이번달/지난달 매출·입금 증감 위젯 표시 - 좌측 필터에 반응
*/

// ── 입금 건의 출처 라벨 (은행/카드) ──
function depositSourceLabel(source) {
  // 은행(당월)/은행(ERP)는 구분 없이 "현금"으로 통일해서 표시 (카드는 그대로)
  var label = (source === '은행(당월)' || source === '은행(ERP)') ? '현금' : source;
  var cls = (label === '카드') ? 'paid-label card' : 'paid-label';
  return '<span class="' + cls + '">' + (label || '-') + '</span>';
}

// ── id의 엘리먼트가 있을 때만 텍스트 반영 (매크로가 아직 재생성 전이라 HTML에 새 id가 없어도 안전) ──
function setKpiText(id, text) {
  var el = document.getElementById(id);
  if (el) el.textContent = text;
}

// ── 숫자 포맷 함수 ──
function formatAmount(n) {
  if (!n || n === 0) return "0원";
  var sign = n < 0 ? "-" : "";
  var abs = Math.abs(n);
  if (abs >= 100000000) return sign + (abs / 100000000).toFixed(1) + "억원";
  if (abs >= 10000) return sign + Math.round(abs / 10000).toLocaleString("ko-KR") + "만원";
  return sign + abs.toLocaleString("ko-KR") + "원";
}
function formatAmountFull(n) { return (n || 0).toLocaleString("ko-KR") + "원"; }

// ── 날짜 변환 함수 (엑셀 시리얼 → YYYY-MM-DD) ──
function formatDate(serial) {
  if (!serial || serial < 1) return "-";
  var d = new Date((serial - 25569) * 86400000);
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, "0");
  var dd = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + dd;
}

// ── 위험도 계산 함수 ──
function calcRisk(dateSerial, paytype) {
  if (!dateSerial || dateSerial < 1) return { level: "caution", days: 0, label: "주의" };
  var d = new Date((dateSerial - 25569) * 86400000);
  var todayParts = DATA.today.split("-");
  var now = new Date(parseInt(todayParts[0]), parseInt(todayParts[1]) - 1, parseInt(todayParts[2]));
  var n = Math.floor((now - d) / (1000 * 60 * 60 * 24));
  var thresholds = {
    "7일이내 결제":  [7, 14, 30],
    "월말결제":      [31, 45, 75],
    "익월 10일결제": [41, 55, 85],
    "익월말":        [61, 75, 105]
  };
  var t = thresholds[paytype] || [30, 60, 90];
  if (n < t[0]) return { level: "normal",   days: n, label: "정상" };
  if (n < t[1]) return { level: "caution",  days: n, label: "주의" };
  if (n < t[2]) return { level: "danger",   days: n, label: "위험" };
  return         { level: "critical", days: n, label: "심각" };
}

// ── 자금 특이사항 (과입금/선입금 등) - 필터와 무관하게 항상 표시 ──
function renderFundIssues() {
  var el = document.getElementById('fund-issue-body');
  if (!el) return;
  var items = DATA.fundIssues || [];
  if (items.length === 0) {
    el.innerHTML = '<div class="fund-issue-empty">특이사항 없음</div>';
    return;
  }
  // 거래처 바로 옆에 금액이 오고, 비고는 같은 행의 마지막 칸에 오도록 표로 구성한다
  // (예전엔 금액이 맨 오른쪽에, 비고는 그 아래 별도 줄에 있어 시선이 분산됐음).
  var html = '<table class="fund-issue-table"><thead><tr>';
  html += '<th>입금일</th><th>구분</th><th>거래처</th><th style="text-align:right">금액</th><th>비고</th>';
  html += '</tr></thead><tbody>';
  items.forEach(function(it) {
    var rowCls = it.type === '과입금' ? 'overpay' : '';
    html += '<tr class="' + rowCls + '">';
    html += '<td>' + (it.date > 0 ? formatDate(it.date) : '-') + '</td>';
    html += '<td><span class="fund-issue-type-tag">' + (it.type || '-') + '</span></td>';
    html += '<td>' + (it.company || '-') + '</td>';
    html += '<td>' + formatAmountFull(it.amount) + '</td>';
    html += '<td>' + (it.note || '-') + '</td>';
    html += '</tr>';
  });
  html += '</tbody></table>';
  el.innerHTML = html;
}

// ── 초기화 ──
function init() {
  document.getElementById("date-badge").textContent = "기준일: " + DATA.today;
  document.getElementById("count-badge").textContent = "총 " + DATA.companies.length + "개 거래처";
  setDefaultDepositDateRange();
  injectTablePopupUI();
  injectOutstandingListUI();
  renderManagerFilter();
  renderPaytypeFilter();
  renderRiskFilter();
  applyFilters();
  renderFundIssues();
  renderOutstandingList();
  var btn = document.getElementById("expand-btn");
  if (btn && isAllExpanded) btn.textContent = "▲ 전체 접기";
}

// ── 미수 상세내역 팝업 버튼을 한 번만 주입. 매크로(fn_레이아웃)를 재생성하지 않아도
//    이 파일(JS)만 최신으로 받으면 바로 반영되도록, 정적 레이아웃을 건드리는 대신
//    여기서 직접 DOM에 붙인다. 팝업 자체는 별도 모달을 새로 만들지 않고 당월수금예정/
//    지연미수금과 같은 trend-modal-backdrop을 그대로 재사용한다(폭이 좁고 세로로 쭉
//    읽는 형태라 시선이 좌우로 흩어지지 않음). ──
function injectTablePopupUI() {
  var controls = document.querySelector('.table-controls');
  if (controls && !document.getElementById('popup-btn')) {
    var btn = document.createElement('button');
    btn.className = 'expand-btn';
    btn.id = 'popup-btn';
    btn.title = '미수 상세내역을 팝업으로 한눈에 보기';
    btn.textContent = '⤢ 팝업으로 보기';
    btn.onclick = openTablePopup;
    controls.insertBefore(btn, controls.firstChild);
  }
}

// ── "최근 입금내역" 표(.table-container) 바로 아래에 "미수 업체 리스트" + 검색창을
//    한 번만 주입한다. 위 injectTablePopupUI()와 같은 이유로 정적 레이아웃(매크로)을
//    건드리지 않고 JS만으로 붙인다. ──
function injectOutstandingListUI() {
  if (document.getElementById('outstanding-list-body')) return;
  var anchor = document.querySelector('.left-panel .table-container');
  if (!anchor) return;
  var wrap = document.createElement('div');
  wrap.className = 'table-container';
  wrap.innerHTML =
    '<div class="table-header">' +
      '<span class="table-title">미수 업체 리스트</span>' +
      '<div class="table-controls">' +
        '<input class="search-box" id="outstanding-search-box" placeholder="거래처명 검색..." oninput="renderOutstandingList()">' +
      '</div>' +
    '</div>' +
    '<div id="outstanding-list-body"></div>';
  anchor.insertAdjacentElement('afterend', wrap);
}

// ── 미수 업체 리스트 렌더 - DATA.companies(현재 미수금이 남은 거래처 전체)를 액수 큰
//    순으로 보여주고, 검색창으로 거래처명을 필터링한다. 좌측 담당자/결제조건/위험도
//    필터와는 무관하게 항상 전체 미수 거래처를 대상으로 한다(거래처를 찾는 용도이므로). ──
function renderOutstandingList() {
  var body = document.getElementById('outstanding-list-body');
  var searchEl = document.getElementById('outstanding-search-box');
  if (!body || !searchEl) return;
  var q = searchEl.value.toLowerCase().trim();
  var companies = (DATA.companies || []).slice()
    .filter(function(c) { return !q || (c.name || '').toLowerCase().indexOf(q) >= 0; })
    .sort(function(a, b) { return b.amount - a.amount; });

  if (companies.length === 0) {
    body.innerHTML = '<div style="padding:20px;text-align:center;color:#6B7A94;font-size:12px">해당하는 거래처가 없습니다</div>';
    return;
  }
  var rows = companies.map(function(c) {
    return '<tr>' +
      '<td class="ledger-link" style="cursor:pointer" onclick="showLedger(\'' + (c.name || '').replace(/'/g, "\\'") + '\')">' + c.name + '</td>' +
      '<td>' + (c.manager || '-') + '</td>' +
      '<td>' + (c.paytype || '-') + '</td>' +
      '<td style="text-align:right;font-weight:700;color:var(--빨강)">' + formatAmountFull(c.amount) + '</td>' +
    '</tr>';
  }).join('');
  body.innerHTML =
    '<div class="ledger-table-wrap" style="max-height:280px">' +
      '<table class="ledger-table">' +
        '<thead><tr><th>거래처</th><th>담당자</th><th>결제조건</th><th style="text-align:right">미수금</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>' +
    '</div>' +
    '<div style="padding:6px 4px 0;font-size:10px;color:var(--회색글자)">총 ' + companies.length + '개사</div>';
}

// ── 담당자 필터 버튼 렌더 ──
function renderManagerFilter() {
  var managers = ["전체"].concat(DATA.managers.map(function(m) { return m.name; }));
  var html = "";
  for (var i = 0; i < managers.length; i++) {
    var isSelected = managers[i] === filter.manager;
    var cls = isSelected ? "filter-btn selected-manager" : "filter-btn";
    html += '<button class="' + cls + '" onclick="selectManager(' + i + ')">' + managers[i] + '</button>';
  }
  document.getElementById("manager-filter").innerHTML = html;
}

// ── 결제조건 필터 버튼 렌더 ──
function renderPaytypeFilter() {
  var paytypes = ["전체", "7일이내 결제", "월말결제", "익월 10일결제", "익월말"];
  var html = "";
  for (var i = 0; i < paytypes.length; i++) {
    var p = paytypes[i];
    var isSelected = p === filter.paytype;
    var cls = isSelected ? (p === "전체" ? "filter-btn selected-manager" : "filter-btn selected-paytype") : "filter-btn";
    var dot = p !== "전체" ? '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:' + (PAYTYPE_COLORS[p] || '#ccc') + ';margin-right:4px;vertical-align:middle"></span>' : '';
    html += '<button class="' + cls + '" onclick="selectPaytype(' + i + ')">' + dot + p + '</button>';
  }
  document.getElementById("paytype-filter").innerHTML = html;
}

// ── 위험도 필터 버튼 렌더 ──
function renderRiskFilter() {
  var risks = ["전체", "정상", "주의", "위험", "심각"];
  var html = "";
  for (var i = 0; i < risks.length; i++) {
    var r = risks[i];
    var isSelected = r === filter.risk;
    var btnCls = isSelected ? (RISK_BTN_CLASS[r] || "selected-manager") : "";
    var cls = "filter-btn " + btnCls;
    var dot = r !== "전체" ? '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:' + (RISK_COLORS[r] || '#ccc') + ';margin-right:4px;vertical-align:middle"></span>' : '';
    html += '<button class="' + cls + '" onclick="selectRisk(' + i + ')">' + dot + r + '</button>';
  }
  document.getElementById("risk-filter").innerHTML = html;
}

// ── 필터 선택 함수 ──
function selectManager(idx) {
  var managers = ["전체"].concat(DATA.managers.map(function(m) { return m.name; }));
  filter.manager = managers[idx];
  // 결제조건/위험도 필터는 유지 - 초기화 버튼을 눌렀을 때만 초기화됨
  document.getElementById("search-box").value = '';
  closeLedger();
  renderManagerFilter(); renderPaytypeFilter(); renderRiskFilter(); applyFilters();
}
function selectPaytype(idx) {
  var paytypes = ["전체", "7일이내 결제", "월말결제", "익월 10일결제", "익월말"];
  filter.paytype = paytypes[idx];
  renderPaytypeFilter(); applyFilters();
}
function selectRisk(idx) {
  var risks = ["전체", "정상", "주의", "위험", "심각"];
  filter.risk = risks[idx];
  renderRiskFilter(); applyFilters();
}
function resetFilters() {
  filter = { manager: "전체", paytype: "전체", risk: "전체" };
  closeLedger();
  renderManagerFilter(); renderPaytypeFilter(); renderRiskFilter(); applyFilters();
}

// ── 상태바 업데이트 ──
function updateStatus() {
  var mEl = document.getElementById("status-manager");
  mEl.className = "status-tag default";
  mEl.innerHTML = filter.manager === "전체" ? "전체 담당자" : filter.manager;
  var pEl = document.getElementById("status-paytype");
  if (filter.paytype === "전체") {
    pEl.className = "status-tag default"; pEl.innerHTML = "전체 결제조건";
  } else {
    pEl.className = "status-tag paytype";
    pEl.innerHTML = '<span class="status-dot" style="background:' + (PAYTYPE_COLORS[filter.paytype] || '#ccc') + '"></span>' + filter.paytype;
  }
  var rEl = document.getElementById("status-risk");
  if (filter.risk === "전체") {
    rEl.className = "status-tag default"; rEl.innerHTML = "전체 위험도";
  } else {
    var rCls = RISK_CSS_CLASS[filter.risk] || "default";
    rEl.className = "status-tag risk-" + rCls;
    rEl.innerHTML = '<span class="status-dot" style="background:' + (RISK_COLORS[filter.risk] || '#ccc') + '"></span>' + filter.risk;
  }
  var hasFilter = filter.manager !== "전체" || filter.paytype !== "전체" || filter.risk !== "전체";
  document.getElementById("reset-btn").classList.toggle("active", hasFilter);
}

// ── 전체 필터 적용 ──
function applyFilters() {
  // DATA.companies의 paytype/manager 태그는 그 거래처가 "처음 집계된 인보이스" 기준으로
  // 딱 하나만 저장돼 있어서(매크로 집계 로직상), 한 거래처가 결제조건을 섞어 쓰는 경우
  // 회사 단위 필터링(c.paytype === filter.paytype)으로는 실제 미수금과 어긋날 수 있다
  // (해당 안 되는 다른 결제조건 금액까지 합쳐지거나, 반대로 통째로 빠지는 문제).
  // 그래서 항상 인보이스(DATA.records) 단위로 직접 필터링해서 정확한 금액만 합산한다.
  var filteredRecords = DATA.records.filter(function(r) {
    if (filter.manager !== "전체" && r.manager !== filter.manager) return false;
    if (filter.paytype !== "전체" && r.paytype !== filter.paytype) return false;
    // misooamt === 0(완납, 남은 잔액 없음)인 건만 제외. 마이너스(반품/과입금 상계 등 조정)는
    // 반드시 포함해서 그대로 더해야 실제 미수 잔액이 정확히 상계되어 나온다 - 예전엔 <= 0으로
    // 걸러서 마이너스 조정 건이 합계에서 통째로 빠지는 바람에 미수금이 항상 실제보다 부풀려
    // 표시되는 버그가 있었다.
    if (r.misooamt === 0) return false;
    if (filter.risk !== "전체" && calcRisk(r.saledate, r.paytype).label !== filter.risk) return false;
    return true;
  });
  var companyMap = {};
  filteredRecords.forEach(function(r) { if (!companyMap[r.company]) companyMap[r.company] = 0; companyMap[r.company] += r.misooamt; });
  var displayCompanies = Object.keys(companyMap).map(function(n) { return { name: n, amount: companyMap[n] }; }).sort(function(a, b) { return b.amount - a.amount; });
  var total = displayCompanies.reduce(function(sum, c) { return sum + c.amount; }, 0);
  currentMisooTotal = total; // 우측 트렌드 위젯의 "미수 총액"이 이 값을 그대로 바인딩해서 씀
  setKpiText("kpi-total", formatAmount(total));
  setKpiText("kpi-company-count", displayCompanies.length + "개사");
  setKpiText("kpi-manager-count", (filter.manager === "전체" ? DATA.managers.length : 1) + "명");
  var nameEl = document.getElementById("kpi-manager-name");
  if (nameEl) {
    nameEl.style.display = filter.manager === "전체" ? "none" : "block";
    nameEl.textContent = filter.manager;
  }

  // 장기 미회수 채권: 담당자/결제조건 필터 범위 안에서 위험도가 "정상"이 아닌(주의/위험/심각) 채권 합계
  // (위험도 필터 버튼 선택과 무관하게 항상 이 기준으로 계산)
  var longOverdueRecords = DATA.records.filter(function(r) {
    if (filter.manager !== "전체" && r.manager !== filter.manager) return false;
    if (filter.paytype !== "전체" && r.paytype !== filter.paytype) return false;
    return r.misooamt > 0 && calcRisk(r.saledate, r.paytype).level !== "normal";
  });
  var longOverdueTotal = longOverdueRecords.reduce(function(s, r) { return s + r.misooamt; }, 0);
  setKpiText("kpi-longoverdue-amount", formatAmount(longOverdueTotal));

  // 하단 요약: 건수 대신, 가장 오래 묵은(매출일이 가장 이른) 건의 업체명/매출일을 표시
  var oldestOverdue = null;
  longOverdueRecords.forEach(function(r) {
    if (!oldestOverdue || r.saledate < oldestOverdue.saledate) oldestOverdue = r;
  });
  setKpiText("kpi-longoverdue-count", oldestOverdue ? (oldestOverdue.company + " / " + formatDate(oldestOverdue.saledate)) : '-');
  setKpiText("table-title", filter.manager === "전체" ? "전체 미수내역" : filter.manager + " 담당 미수내역");
  var isAll = filter.manager === "전체";
  document.getElementById("chart-all").style.display = isAll ? '' : 'none';
  document.getElementById("chart-manager").style.display = isAll ? 'none' : '';
  var chartManagers = isAll ? DATA.managers : DATA.managers.filter(function(m) { return m.name === filter.manager; });
  renderCharts(chartManagers, filter.manager);
  updateStatus();
  renderTable();
  renderTrendWidget();
}

// ── 최근 30일(windowsAgo=0) / 그 이전 30일(windowsAgo=1)의 엑셀 시리얼 날짜 범위 ──
// 달력상 "이번달 1일~말일"로 하면 월초에는 며칠 치밖에 없어서 지난달(30일 치) 대비
// 증감률이 극단적으로 왜곡됨(예: -90%). 항상 같은 30일 폭으로 비교해야 공정한 비교가 됨.
function rollingRangeSerial(windowsAgo) {
  var todaySerial = dateToSerial(DATA.today);
  var to = todaySerial - windowsAgo * 30;
  var from = to - 29;
  return { from: from, to: to };
}

// ── 오른쪽 패널 대기화면: 이번달 vs 지난달 매출·입금 증감 요약 위젯 (좌측 필터에 반응) ──
// 매출은 DATA.records(매출일·담당자·결제조건·위험도 모두 보유)를 그대로 필터링하고,
// 입금은 DATA.deposits에 담당자/결제조건이 없어서 거래처명으로 DATA.companies와 대조해서 필터링한다.
// (위험도는 개별 미수 인보이스의 성격이라 입금 건에는 적용하지 않음)
function renderTrendWidget() {
  var el = document.getElementById('chart-placeholder');
  if (!el) return;

  // 거래처 → 담당자 조회용 맵. DATA.companies는 "현재 미수금이 남아있는 거래처"만 담고 있어서
  // (매크로 집계 로직상 미수금=0인 완납 거래처는 애초에 빠짐) 이걸로 입금을 매칭하면, 최근
  // 30일 안에 매출도 있고 완납까지 된 거래처의 입금이 전부 담당자 불일치로 누락되는 문제가
  // 있었다(카드 파일에 담당자 컬럼이 없어서가 아니라, 조회용 맵 자체가 그 거래처를 모르는 게
  // 원인). 그래서 완납 건까지 전부 포함하는 DATA.records를 훑어서 거래처별 담당자를 구한다.
  var companyManager = {};
  DATA.records.forEach(function(r) {
    if (!(r.company in companyManager)) companyManager[r.company] = r.manager;
  });

  // 결제조건 필터가 걸려 있을 때, 입금을 어느 거래처 것까지 포함할지 판정하는 집합.
  // DATA.companies의 c.paytype 태그는 그 거래처가 "처음 집계된 인보이스" 하나의 결제조건일
  // 뿐이라(매크로 집계 로직상), 한 거래처가 결제조건을 섞어 쓰는 경우 그 태그만으로
  // 걸러내면 실제로 발생한 입금이 통째로 0으로 빠지는 문제가 있었다. 그래서 태그 대신
  // DATA.records를 직접 훑어 "현재 결제조건 필터에 해당하는 매출 건이 실제로 있는 거래처"를
  // 구해서 그 거래처의 입금만 포함시킨다(담당자는 거래처가 바뀌는 일이 거의 없어 태그 그대로 사용).
  var paytypeCompanySet = null;
  if (filter.paytype !== "전체") {
    paytypeCompanySet = {};
    DATA.records.forEach(function(r) {
      if (filter.manager !== "전체" && r.manager !== filter.manager) return;
      if (r.paytype !== filter.paytype) return;
      paytypeCompanySet[r.company] = true;
    });
  }

  var thisM = rollingRangeSerial(0);
  var lastM = rollingRangeSerial(1);

  function sumSales(fromS, toS) {
    return DATA.records.reduce(function(sum, r) {
      if (filter.manager !== "전체" && r.manager !== filter.manager) return sum;
      if (filter.paytype !== "전체" && r.paytype !== filter.paytype) return sum;
      if (filter.risk !== "전체" && calcRisk(r.saledate, r.paytype).label !== filter.risk) return sum;
      if (r.saledate < fromS || r.saledate > toS) return sum;
      return sum + r.saleamt;
    }, 0);
  }

  function sumDeposits(fromS, toS) {
    return (DATA.deposits || []).reduce(function(sum, d) {
      if (filter.manager !== "전체" && companyManager[d.company] !== filter.manager) return sum;
      if (paytypeCompanySet && !paytypeCompanySet[d.company]) return sum;
      if (d.date < fromS || d.date > toS) return sum;
      return sum + d.amount;
    }, 0);
  }

  var saleThis = sumSales(thisM.from, thisM.to);
  var saleLast = sumSales(lastM.from, lastM.to);
  var depThis  = sumDeposits(thisM.from, thisM.to);
  var depLast  = sumDeposits(lastM.from, lastM.to);

  // 미수 총액: 좌측 KPI 카드 "전체 미수금 합계"와 별도로 계산하지 않고, applyFilters()가
  // 세팅해둔 currentMisooTotal(=이월분 포함 전체 기간 누적 AF열 합계)을 그대로 바인딩한다.
  var misooToday = currentMisooTotal;
  // 증감(▲/▼) = "오늘 누적 미수 총액 - 30일 전 누적 미수 총액". 처음엔 "매출-입금" 항등식으로
  // 역산했는데(30일 전 미수 = 오늘 미수 - 최근30일 매출 + 최근30일 입금), 입금(DATA.deposits)이
  // 거래처 단위로만 기록돼서 결제조건을 섞어 쓰는 거래처는 다른 결제조건 인보이스에 대한
  // 입금까지 섞여 들어와 수치가 크게 왜곡되는 문제가 있었다(예: 담당자+결제조건 조합이 좁을 때
  // 증감률이 -97% 등으로 튐). 그래서 입금 데이터에 전혀 의존하지 않고, 인보이스 단위로 이미
  // 갖고 있는 saledate/misooamt/paiddate만으로 "30일 전 시점에 이 건이 미수 상태였는가"를
  // 직접 재구성한다 — 결제조건이 몇 개로 갈리든 항상 정확하다(분할입금 이력은 원본 데이터에
  // 없어서 인보이스가 한 번에 전액 결제된다고 가정).
  function misooAsOf(cutoffSerial) {
    return DATA.records.reduce(function(sum, r) {
      if (filter.manager !== "전체" && r.manager !== filter.manager) return sum;
      if (filter.paytype !== "전체" && r.paytype !== filter.paytype) return sum;
      if (filter.risk !== "전체" && calcRisk(r.saledate, r.paytype).label !== filter.risk) return sum;
      if (r.saledate > cutoffSerial) return sum;                                 // 그 시점엔 아직 없던 매출
      if (r.misooamt !== 0) return sum + r.misooamt;                             // 지금도 미수(마이너스 조정 포함) → 그때도 그대로였다고 봄
      if (r.paiddate && r.paiddate > cutoffSerial) return sum + r.saleamt;        // 그 시점엔 아직 완납 전
      return sum;                                                                  // 그 시점에 이미 완납
    }, 0);
  }
  var misoo30dAgo = misooAsOf(thisM.from - 1);

  // 당월 수금 예정액 / 지연 미수금: 결제조건별 "정상 수금 기한"(매출일 + 며칠)을 계산해서,
  // 그 만기일이 정확히 "이번 달" 안에 들어오는 건만 당월 수금 예정으로 잡는다(만기일이 아직
  // 지나지 않았다는 것만으로는 부족함 - 예를 들어 익월말 결제는 만기가 50일 뒤라 이번 달을
  // 넘어 다음 달에야 만기가 되는 경우가 흔한데, 그런 건 "당월"이 아니라 "아직 안 온 미래분"
  // 이므로 당월 수금 예정에도 지연 미수금에도 넣지 않는다). 만기일이 이미 지난 건은 지연
  // 미수금으로, 만기일이 다음 달 이후인 건은 두 버킷 어디에도 넣지 않아 서로 안 겹치게 한다.
  //   7일이내 결제 → 매출일+20일 / 월말결제 → +30일 / 익월 10일결제 → +40일 / 익월말 → +50일
  var COLLECTION_DUE_DAYS = { "7일이내 결제": 20, "월말결제": 30, "익월 10일결제": 40, "익월말": 50 };
  var todaySerial = dateToSerial(DATA.today);
  var todayYM = serialToYM(todaySerial);
  var dueThisMonth = 0, overdue = 0;
  trendModalLists.due = [];
  trendModalLists.overdue = [];
  DATA.records.forEach(function(r) {
    if (r.misooamt <= 0) return;
    if (filter.manager !== "전체" && r.manager !== filter.manager) return;
    if (filter.paytype !== "전체" && r.paytype !== filter.paytype) return;
    if (filter.risk !== "전체" && calcRisk(r.saledate, r.paytype).label !== filter.risk) return;
    var dueDays = COLLECTION_DUE_DAYS[r.paytype] || 30;
    var dueSerial = r.saledate + dueDays;
    if (dueSerial < todaySerial) { overdue += r.misooamt; trendModalLists.overdue.push(r); }
    else {
      var dueYM = serialToYM(dueSerial);
      if (dueYM.y === todayYM.y && dueYM.m === todayYM.m) { dueThisMonth += r.misooamt; trendModalLists.due.push(r); }
      // 만기가 다음 달 이후면 아직 당월도 지연도 아님 - 두 버킷 모두 제외
    }
  });

  el.innerHTML =
    '<div class="trend-widget">' +
      '<div class="trend-micro">' +
        '<div class="trend-micro-item"><span class="trend-micro-label">당월 수금 예정</span>' +
          '<span class="trend-badge due" onclick="openTrendModal(\'due\')">' + formatAmount(dueThisMonth) + '</span></div>' +
        '<div class="trend-micro-item"><span class="trend-micro-label">지연 미수금</span>' +
          '<span class="trend-badge overdue" onclick="openTrendModal(\'overdue\')">' + formatAmount(overdue) + '</span></div>' +
      '</div>' +
      '<details class="trend-details">' +
        '<summary>매출 · 입금 · 미수 총액 보기</summary>' +
        trendRow('매출 총액', saleThis, saleLast) +
        trendRow('입금 총액', depThis, depLast) +
        trendRow('미수 총액', misooToday, misoo30dAgo, true) +
        '<div class="trend-period">' + (filter.risk !== "전체" ? '위험도는 매출에만 적용됨 · ' : '') +
          (filter.paytype !== "전체" ? '입금액은 거래처 단위 집계(결제조건 혼용 거래처는 추정치) · ' : '') +
          '최근 30일 ' + formatDate(thisM.from) + '~' + formatDate(thisM.to) +
          ' · 이전 30일 ' + formatDate(lastM.from) + '~' + formatDate(lastM.to) + '</div>' +
      '</details>' +
    '</div>' +
    '<div class="trend-modal-backdrop" id="trend-modal-backdrop">' +
      '<div class="trend-modal" onclick="event.stopPropagation()">' +
        '<div class="trend-modal-header"><span id="trend-modal-title"></span>' +
          '<button class="trend-modal-close" onclick="closeTrendModal()">✕</button></div>' +
        '<div class="trend-modal-body" id="trend-modal-body"></div>' +
      '</div>' +
      '<div class="trend-modal trend-detail-modal" id="trend-detail-modal" onclick="event.stopPropagation()">' +
        '<div class="trend-modal-header"><span id="trend-detail-title"></span>' +
          '<button class="trend-modal-close" onclick="closeTrendDetail()">✕</button></div>' +
        '<div class="trend-modal-body" id="trend-detail-body"></div>' +
      '</div>' +
    '</div>';

}

// ── 엑셀 시리얼 날짜 → {연,월} 변환 헬퍼 (날짜순 통합 원장의 월별 소계 등에 사용) ──
function serialToYM(serial) {
  var d = new Date((serial - 25569) * 86400000);
  return { y: d.getFullYear(), m: d.getMonth() + 1 };
}

function trendRow(label, cur, prev, highlight) {
  var diff = cur - prev;
  var pct = prev !== 0 ? (diff / prev * 100) : null;
  var cls = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  var arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '－';
  var pctText = pct === null ? '' : ' (' + (diff >= 0 ? '+' : '') + pct.toFixed(1) + '%)';
  return '<div class="trend-row' + (highlight ? ' trend-row-highlight' : '') + '">' +
    '<div class="trend-label">' + label + '</div>' +
    '<div class="trend-value-group">' +
      '<span class="trend-value">' + formatAmountFull(cur) + ' <span class="trend-value-short">(' + formatAmount(cur) + ')</span></span>' +
      '<span class="trend-diff ' + cls + '">' + arrow + ' ' + formatAmountFull(Math.abs(diff)) + ' (' + formatAmount(Math.abs(diff)) + ')' + pctText + '</span>' +
    '</div>' +
  '</div>';
}

// ── 담당자/결제조건/위험도가 전부 "전체"일 때 표시할 "최근 입금내역" 상태 ──
var depositView = { dateFrom: '', dateTo: '' };

// ── 좌측 KPI 카드 "전체 미수금 합계"와 우측 트렌드 위젯 "미수 총액"이 100% 동일한 값을
//    쓰도록 단일 소스로 관리하는 변수. applyFilters()에서만 값을 세팅하고,
//    renderTrendWidget()은 이 값을 그대로 읽기만 한다(별도 재계산 금지).
var currentMisooTotal = 0;

// ── "당월 수금 예정"/"지연 미수금" 뱃지 클릭 시 뜨는 모달에 표시할 거래처 목록.
//    renderTrendWidget()이 매번 최신 필터 기준으로 채워두고, 모달은 그걸 그대로 읽기만 한다.
var trendModalLists = { due: [], overdue: [] };
// 지금 열려 있는 모달이 due/overdue 중 뭔지 - 거래처 클릭 시 상세 팝업에서 같은 목록을 다시 훑어야 해서 기억해둠
var currentTrendModalType = null;

// ── 거래처별 미수금 목록 모달 공통 렌더러 (당월수금예정/지연미수금/담당자별 순위 클릭에서 공용) ──
function renderCompanyListModal(title, list) {
  var body = document.getElementById('trend-modal-body');
  var titleEl = document.getElementById('trend-modal-title');
  if (!body || !titleEl) return;

  var byCompany = {};
  list.forEach(function(r) {
    if (!byCompany[r.company]) byCompany[r.company] = { name: r.company, amount: 0, count: 0, oldestDate: r.saledate };
    byCompany[r.company].amount += r.misooamt;
    byCompany[r.company].count += 1;
    // 여러 건 중 가장 오래된(가장 급한) 매출일을 대표로 보여준다
    if (r.saledate < byCompany[r.company].oldestDate) byCompany[r.company].oldestDate = r.saledate;
  });
  var companies = Object.keys(byCompany).map(function(k) { return byCompany[k]; })
    .sort(function(a, b) { return b.amount - a.amount; });

  titleEl.textContent = title + ' (' + companies.length + '개사)';
  if (companies.length === 0) {
    body.innerHTML = '<div style="padding:30px;text-align:center;color:#6B7A94">해당 내역이 없습니다</div>';
    return;
  }
  var total = companies.reduce(function(s, c) { return s + c.amount; }, 0);
  // 거래처를 클릭하면 바로 원장으로 넘어가지 않고, 옆에 그 거래처의 인보이스별 상세 내역
  // 팝업을 하나 더 띄운다(openTrendDetail). 원장 이동은 그 상세 팝업 안에서 한다.
  var rows = companies.map(function(c) {
    return '<tr><td class="ledger-link" style="cursor:pointer" onclick="openTrendDetail(\'' + c.name.replace(/'/g, "\\'") + '\')">' + c.name + '</td>' +
      '<td>' + formatDate(c.oldestDate) + (c.count > 1 ? ' 외' : '') + '</td>' +
      '<td>' + c.count + '건</td>' +
      '<td style="text-align:right;font-weight:700">' + formatAmountFull(c.amount) + '</td></tr>';
  }).join('');
  body.innerHTML = '<table class="ledger-table"><thead><tr><th>거래처</th><th>매출일</th><th>건수</th><th style="text-align:right">미수금</th></tr></thead>' +
    '<tbody>' + rows + '</tbody>' +
    '<tfoot><tr class="ledger-foot"><td colspan="3">합계</td><td style="text-align:right">' + formatAmountFull(total) + '</td></tr></tfoot></table>';
}

function openTrendModal(type) {
  var backdrop = document.getElementById('trend-modal-backdrop');
  if (!backdrop) return;

  currentTrendModalType = type;
  closeTrendDetail();

  var list = trendModalLists[type] || [];
  var title = type === 'due' ? '당월 수금 예정 거래처' : '지연 미수금 거래처';
  renderCompanyListModal(title, list);
  backdrop.classList.add('show');
}

// ── 담당자별 미수금 순위에서 담당자를 클릭하면 뜨는 거래처별 미수금 모달
//    (당월수금예정/지연미수금과 같은 모달 UI를 그대로 재사용, 순위 리스트의 결제조건
//    미니 필터(rankPaytype)를 그대로 적용해서 목록도 같은 기준으로 보여준다) ──
function openManagerRankModal(managerName) {
  var backdrop = document.getElementById('trend-modal-backdrop');
  if (!backdrop) return;
  closeTrendDetail();

  var list = DATA.records.filter(function(r) {
    if (r.manager !== managerName) return false;
    if (r.misooamt === 0) return false;
    if (rankPaytype !== "전체" && r.paytype !== rankPaytype) return false;
    return true;
  });
  var modalKey = 'mgr:' + managerName;
  trendModalLists[modalKey] = list;
  currentTrendModalType = modalKey;

  var title = managerName + ' 담당 미수 거래처' + (rankPaytype !== "전체" ? ' · ' + rankPaytype : '');
  renderCompanyListModal(title, list);
  backdrop.classList.add('show');
}

function closeTrendModal() {
  var backdrop = document.getElementById('trend-modal-backdrop');
  if (backdrop) backdrop.classList.remove('show');
  closeTrendDetail();
}

// ── 지연/예정 목록 모달에서 거래처를 클릭하면 옆에 여는 인보이스별 상세 팝업 ──
function openTrendDetail(companyName) {
  var detailModal = document.getElementById('trend-detail-modal');
  var detailBody = document.getElementById('trend-detail-body');
  var detailTitle = document.getElementById('trend-detail-title');
  if (!detailModal || !detailBody || !detailTitle) return;

  var list = (trendModalLists[currentTrendModalType] || []).filter(function(r) { return r.company === companyName; })
    .sort(function(a, b) { return a.saledate - b.saledate; });
  var escaped = companyName.replace(/'/g, "\\'");

  detailTitle.innerHTML = '<span class="ledger-link" style="cursor:pointer" onclick="closeTrendModal();showLedger(\'' + escaped + '\')" title="클릭하면 거래처 원장으로 이동합니다">' + companyName + '</span>';

  var rows = list.map(function(r) {
    var risk = calcRisk(r.saledate, r.paytype);
    return '<tr class="ledger-row" style="cursor:pointer" onclick="closeTrendModal();showLedger(\'' + escaped + '\')" title="클릭하면 거래처 원장으로 이동합니다">' +
      '<td>' + formatDate(r.saledate) + '</td>' +
      '<td>' + r.paytype + '</td>' +
      '<td style="text-align:right">' + formatAmountFull(r.misooamt) + '</td>' +
      '<td><span class="risk-dot ' + risk.level + '"></span>D+' + risk.days + '일</td></tr>';
  }).join('');
  var total = list.reduce(function(s, r) { return s + r.misooamt; }, 0);

  detailBody.innerHTML = list.length === 0
    ? '<div style="padding:30px;text-align:center;color:#6B7A94">해당 내역이 없습니다</div>'
    : '<table class="ledger-table"><thead><tr><th>매출일</th><th>결제조건</th><th style="text-align:right">미수금</th><th>경과일</th></tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
      '<tfoot><tr class="ledger-foot"><td colspan="2">합계(' + list.length + '건)</td><td style="text-align:right">' + formatAmountFull(total) + '</td><td></td></tr></tfoot></table>';

  detailModal.classList.add('show');
}

function closeTrendDetail() {
  var detailModal = document.getElementById('trend-detail-modal');
  if (detailModal) detailModal.classList.remove('show');
}

function formatDateInput(d) {
  var y = d.getFullYear();
  var m = ('0' + (d.getMonth() + 1)).slice(-2);
  var day = ('0' + d.getDate()).slice(-2);
  return y + '-' + m + '-' + day;
}

// ── 기간 입력칸에 타이핑한 값을 표준 날짜(YYYY-MM-DD)로 변환.
//    "260719"(YYMMDD, 20XX년 가정) / "20260719"(YYYYMMDD) / "2026-07-19" 모두 인식.
//    실제 존재하지 않는 날짜(예: 2/30)나 형식이 안 맞으면 null을 돌려줘서, 호출부가
//    입력을 무시하고 이전 값을 그대로 유지하게 한다. ──
function parseFlexibleDateInput(raw) {
  var s = (raw || '').trim();
  var y, m, d;
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    var p = s.split('-');
    y = parseInt(p[0], 10); m = parseInt(p[1], 10); d = parseInt(p[2], 10);
  } else {
    var digits = s.replace(/[^\d]/g, '');
    if (digits.length === 6) {
      y = 2000 + parseInt(digits.slice(0, 2), 10);
      m = parseInt(digits.slice(2, 4), 10);
      d = parseInt(digits.slice(4, 6), 10);
    } else if (digits.length === 8) {
      y = parseInt(digits.slice(0, 4), 10);
      m = parseInt(digits.slice(4, 6), 10);
      d = parseInt(digits.slice(6, 8), 10);
    } else {
      return null;
    }
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  var dt = new Date(y, m - 1, d);
  // new Date()는 2/30 같은 존재하지 않는 날짜를 다음 달로 밀어서 "성공"시켜버리므로,
  // 다시 분해해서 원래 입력한 연/월/일과 정확히 일치하는지 확인한다.
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return formatDateInput(dt);
}

// 기본값: 오늘 기준 최근 7일
function setDefaultDepositDateRange() {
  var p = DATA.today.split('-');
  var today = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
  var weekAgo = new Date(today.getTime() - 7 * 86400000);
  depositView.dateFrom = formatDateInput(weekAgo);
  depositView.dateTo = formatDateInput(today);
}

function setDepositDate() {
  // "260719" 같은 6자리 타이핑도 인식 - 못 알아들으면 이전 값 그대로 두고 무시(re-render 시
  // input이 depositView의 마지막 정상값으로 다시 그려지면서 자연스럽게 원복된다)
  var from = parseFlexibleDateInput(document.getElementById("deposit-date-from").value);
  var to   = parseFlexibleDateInput(document.getElementById("deposit-date-to").value);
  if (from) depositView.dateFrom = from;
  if (to)   depositView.dateTo   = to;
  renderTable();
}

function resetDepositDate() {
  setDefaultDepositDateRange();
  renderTable();
}

function buildDepositDateFilterHtml() {
  // type=date 대신 텍스트 입력으로 바꿔서 "260719"처럼 6자리만 타이핑해도 바로 날짜로
  // 인식되게 한다(setDepositDate에서 parseFlexibleDateInput으로 파싱).
  return '<span class="ledger-date-label">기간</span>' +
    '<input type="text" inputmode="numeric" class="ledger-date-input" id="deposit-date-from" value="' + depositView.dateFrom + '" placeholder="YYMMDD" onchange="setDepositDate()">' +
    '<span style="color:var(--회색글자)">~</span>' +
    '<input type="text" inputmode="numeric" class="ledger-date-input" id="deposit-date-to" value="' + depositView.dateTo + '" placeholder="YYMMDD" onchange="setDepositDate()">' +
    '<button class="ledger-date-reset" onclick="resetDepositDate()">최근 7일</button>';
}

// ── 최근 입금내역 표 (거래처/결제조건/위험도 전부 "전체"일 때만 노출, 최신순) ──
function renderDepositTable(searchQuery) {
  var container = document.getElementById("table-body");
  var deposits = (DATA.deposits || []).slice();

  var fromSerial = dateToSerial(depositView.dateFrom);
  var toSerial   = dateToSerial(depositView.dateTo);
  if (fromSerial > 0) deposits = deposits.filter(function(d) { return d.date >= fromSerial; });
  if (toSerial > 0)   deposits = deposits.filter(function(d) { return d.date <= toSerial; });
  if (searchQuery) deposits = deposits.filter(function(d) { return (d.company || '').toLowerCase().indexOf(searchQuery) >= 0; });

  deposits.sort(function(a, b) { return b.date - a.date; }); // 최신일이 맨 위

  if (deposits.length === 0) {
    container.innerHTML = '<div style="padding:40px;text-align:center;color:#6B7A94">해당 기간에 입금 내역이 없습니다</div>';
    return;
  }

  var rows = '';
  deposits.forEach(function(d) {
    rows += '<tr class="ledger-row deposit">';
    rows += '<td>' + formatDate(d.date) + '</td>';
    rows += '<td class="ledger-link" style="cursor:pointer" onclick="showLedger(\'' + (d.company || '').replace(/'/g, "\\'") + '\')">' + (d.company || '-') + '</td>';
    rows += '<td style="text-align:right;font-weight:600;color:#0F7B52">' + formatAmountFull(d.amount) + '</td>';
    rows += '<td>' + depositSourceLabel(d.source) + '</td>';
    rows += '</tr>';
  });

  var total = deposits.reduce(function(s, d) { return s + d.amount; }, 0);

  // 거래처명 바로 옆에서 금액을 확인할 수 있도록 [입금일→거래처→입금액→출처] 순으로 재배치하고,
  // 표 폭을 줄여서 생기는 우측 여백에는 '집중 관리 대상(Top 10 최장 미회수 거래처)'를 나란히 배치한다.
  var html = '<div class="deposit-split-row">';
  html += '<div class="deposit-table-col"><div class="ledger-table-wrap">';
  html += '<table class="ledger-table">';
  html += '<thead><tr><th>입금일</th><th>거래처</th><th style="text-align:right">입금액</th><th>출처</th></tr></thead>';
  html += '<tbody>' + rows + '</tbody>';
  html += '<tfoot><tr class="ledger-foot"><td colspan="2">합계 (' + deposits.length + '건)</td><td style="text-align:right;color:#0F7B52">' + formatAmountFull(total) + '</td><td></td></tr></tfoot>';
  html += '</table></div></div>';
  html += '<div class="top-baddebt-col">' + buildTopBadDebtHtml() + '</div>';
  html += '</div>';
  container.innerHTML = html;
}

// ── 집중 관리 대상: 위험/심각 등급 미수금을 거래처 단위로 합산해, 미회수 기간(경과일)이
//    가장 긴 순으로 상위 10개사 ──
function buildTopBadDebtHtml() {
  var byCompany = {};
  DATA.records.forEach(function(r) {
    if (r.misooamt <= 0) return;
    var risk = calcRisk(r.saledate, r.paytype);
    if (risk.level !== "danger" && risk.level !== "critical") return;
    if (!byCompany[r.company]) byCompany[r.company] = { name: r.company, amount: 0, manager: r.manager, maxDays: 0 };
    byCompany[r.company].amount += r.misooamt;
    // 여러 건 중 가장 오래 묵은(경과일이 가장 큰) 건을 그 거래처의 대표 경과일로 삼는다
    if (risk.days > byCompany[r.company].maxDays) byCompany[r.company].maxDays = risk.days;
  });
  // 금액순이 아니라 미회수 기간(경과일)이 가장 긴 순 - 오래 묵을수록 먼저 관리해야 하므로
  var top10 = Object.keys(byCompany).map(function(k) { return byCompany[k]; })
    .sort(function(a, b) { return b.maxDays - a.maxDays; })
    .slice(0, 10);

  var html = '<div class="baddebt-panel">';
  html += '<div class="baddebt-title">집중 관리 대상 <span class="baddebt-title-sub">(Top 10 최장 미회수 거래처)</span></div>';
  if (top10.length === 0) {
    html += '<div class="baddebt-empty">위험/심각 등급 미수금이 없습니다</div>';
  } else {
    html += '<table class="baddebt-table"><thead><tr><th>거래처</th><th style="text-align:right">경과일</th><th style="text-align:right">미수금</th><th style="text-align:right">담당자</th></tr></thead><tbody>';
    top10.forEach(function(c) {
      html += '<tr>';
      html += '<td class="ledger-link" style="cursor:pointer" onclick="showLedger(\'' + c.name.replace(/'/g, "\\'") + '\')">' + c.name + '</td>';
      html += '<td style="text-align:right;color:var(--회색글자)">D+' + c.maxDays + '일</td>';
      html += '<td style="text-align:right;font-weight:700;color:var(--빨강)">' + formatAmountFull(c.amount) + '</td>';
      html += '<td style="text-align:right;color:var(--회색글자)">' + (c.manager || '-') + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table>';
  }
  html += '</div>';
  return html;
}

// ── 미수 테이블 렌더링 ──
function renderTable() {
  var searchQuery = document.getElementById("search-box").value.toLowerCase();
  var expandBtn = document.getElementById("expand-btn");
  var popupBtn = document.getElementById("popup-btn");
  var colHeader = document.querySelector(".column-header");
  var dateFilterEl = document.getElementById("deposit-date-filter");
  var isAllFilter = filter.manager === "전체" && filter.paytype === "전체" && filter.risk === "전체";

  if (isAllFilter) {
    // 필터가 전부 "전체"일 때는 미수내역 대신 최근 입금내역을 보여줌
    setKpiText("table-title", "최근 입금내역");
    if (expandBtn) expandBtn.style.display = "none";
    if (popupBtn) popupBtn.style.display = "none";
    if (colHeader) colHeader.style.display = "none";
    if (dateFilterEl) {
      dateFilterEl.style.display = "flex";
      dateFilterEl.innerHTML = buildDepositDateFilterHtml();
    }
    renderDepositTable(searchQuery);
    return;
  }

  if (expandBtn) expandBtn.style.display = "";
  if (popupBtn) popupBtn.style.display = "";
  if (colHeader) colHeader.style.display = "";
  if (dateFilterEl) dateFilterEl.style.display = "none";
  setKpiText("table-title", filter.manager === "전체" ? "전체 미수내역" : filter.manager + " 담당 미수내역");

  var records = DATA.records.filter(function(r) {
    // 완납(잔액 0)인 건만 제외. 마이너스(반품/과입금 상계 등 조정) 건은 포함시켜서 거래처
    // 합계에 그대로 상계 반영되도록 한다(자세한 이유는 applyFilters의 동일 필터 주석 참고).
    if (r.misooamt === 0) return false;
    if (filter.manager !== "전체" && r.manager !== filter.manager) return false;
    if (filter.paytype !== "전체" && r.paytype !== filter.paytype) return false;
    if (filter.risk !== "전체" && calcRisk(r.saledate, r.paytype).label !== filter.risk) return false;
    if (searchQuery && r.company.toLowerCase().indexOf(searchQuery) < 0) return false;
    return true;
  });
  var container = document.getElementById("table-body");
  if (records.length === 0) {
    container.innerHTML = '<div style="padding:40px;text-align:center;color:#6B7A94">데이터 없음</div>';
    return;
  }
  var byPaytype = {};
  records.forEach(function(r) { if (!byPaytype[r.paytype]) byPaytype[r.paytype] = []; byPaytype[r.paytype].push(r); });
  var paytypes = Object.keys(byPaytype).sort(function(a, b) {
    var ia = PAYTYPE_ORDER.indexOf(a), ib = PAYTYPE_ORDER.indexOf(b);
    if (ia < 0) ia = 99; if (ib < 0) ib = 99; return ia - ib;
  });
  var html = "";
  paytypes.forEach(function(paytype, ptIdx) {
    var items = byPaytype[paytype];
    var paytypeTotal = items.reduce(function(sum, r) { return sum + r.misooamt; }, 0);
    var byCompany = {};
    items.forEach(function(r) { if (!byCompany[r.company]) byCompany[r.company] = []; byCompany[r.company].push(r); });
    var companies = Object.keys(byCompany).map(function(name) {
      var total = byCompany[name].reduce(function(sum, r) { return sum + r.misooamt; }, 0);
      return { name: name, records: byCompany[name], total: total };
    }).sort(function(a, b) { return b.total - a.total; });

    html += '<div class="paytype-group">';
    html += '<div class="paytype-row">';

    // 왼쪽 사이드바 (결제조건 / 개사·건수 / 미수금액 세로로 병합된 것처럼)
    html += '<div class="paytype-sidebar" style="border-left:4px solid ' + (PAYTYPE_COLORS[paytype] || '#ccc') + '">';
    html += '<div class="paytype-sidebar-title"><span class="paytype-dot" style="background:' + (PAYTYPE_COLORS[paytype] || '#ccc') + '"></span><span class="paytype-label">' + paytype + '</span></div>';
    html += '<div class="paytype-sidebar-count">' + companies.length + '개사 · ' + items.length + '건</div>';
    html += '<div class="paytype-sidebar-total">' + formatAmountFull(paytypeTotal) + '</div>';
    html += '</div>';

    var bodyClass = isAllExpanded ? "paytype-body" : "paytype-body collapsed";
    html += '<div class="' + bodyClass + '" id="group-' + ptIdx + '">';

    // 거래처명을 결제조건 사이드바 바로 옆 칸(rowspan)으로 넣기 위해, 그룹 전체를 표 하나로 만든다
    html += '<table class="detail-table">';
    html += '<colgroup><col class="col-company"><col class="col-date"><col class="col-sale"><col class="col-paid"><col class="col-misoo"><col class="col-risk"><col class="col-days"></colgroup>';
    html += '<thead><tr><th class="head-company">거래처</th><th class="head-date">매출일</th><th class="head-sale">매출액</th><th class="head-paid">입금액</th><th class="head-misoo">미수금</th><th class="head-risk">위험도</th><th class="head-days">경과일</th></tr></thead><tbody>';

    companies.forEach(function(company) {
      var sortedRecords = company.records.slice().sort(function(a, b) { return a.saledate - b.saledate; });

      // 같은 매출일끼리는 한 행으로 묶어서 합계로 표시 (인보이스 건수만큼 줄이 늘어나는 것 방지)
      var byDate = {};
      var dateOrder = [];
      sortedRecords.forEach(function(r) {
        if (!byDate[r.saledate]) { byDate[r.saledate] = []; dateOrder.push(r.saledate); }
        byDate[r.saledate].push(r);
      });
      var dateGroups = dateOrder.map(function(d) {
        var recs = byDate[d];
        return {
          saledate: d,
          paytype: recs[0].paytype,
          saleamt: recs.reduce(function(s, r) { return s + r.saleamt; }, 0),
          paidamt: recs.reduce(function(s, r) { return s + r.paidamt; }, 0),
          misooamt: recs.reduce(function(s, r) { return s + r.misooamt; }, 0)
        };
      });

      dateGroups.forEach(function(g, gi) {
        var risk = calcRisk(g.saledate, g.paytype);
        var daysCls = risk.level === "danger" ? "days-text warning" : risk.level === "critical" ? "days-text critical" : "days-text";
        html += '<tr class="' + (gi === 0 ? 'company-start' : '') + '">';
        if (gi === 0) {
          // 거래처 이름 클릭 → 원장 표시 (여러 매출일이 있으면 rowspan으로 세로 병합)
          html += '<td class="cell-company" rowspan="' + dateGroups.length + '" style="border-left-color:' + (PAYTYPE_COLORS[paytype] || '#ccc') + '" onclick="showLedger(\'' + company.name.replace(/'/g, "\\'") + '\')" title="클릭하면 거래처 원장이 표시됩니다">';
          html += '<span class="company-name ledger-link">' + company.name + '</span>';
          // 미수 건수는 인보이스(행) 개수가 아니라 매출일 기준(dateGroups) 건수로 표시
          html += '<span class="company-amount-line"><span class="company-total">' + formatAmountFull(company.total) + '</span><span class="company-count"> / ' + dateGroups.length + '건</span></span>';
          html += '</td>';
        }
        html += '<td class="cell-date">' + formatDate(g.saledate) + '</td>';
        html += '<td class="cell-sale">' + formatAmountFull(g.saleamt) + '</td>';
        html += '<td class="cell-paid">' + (g.paidamt > 0 ? formatAmountFull(g.paidamt) : '-') + '</td>';
        html += '<td class="cell-misoo">' + formatAmountFull(g.misooamt) + '</td>';
        html += '<td class="cell-risk"><span class="risk-dot ' + risk.level + '"></span>' + risk.label + '</td>';
        html += '<td class="cell-days"><span class="' + daysCls + '">D+' + risk.days + '일</span></td>';
        html += '</tr>';
      });
    });

    html += '</tbody></table>';
    html += '</div>'; // paytype-body 끝
    html += '</div>'; // paytype-row 끝
    html += '</div>'; // paytype-group 끝
  });
  container.innerHTML = html;
}

// ── 전체 펼치기/접기 ──
function toggleAll() {
  isAllExpanded = !isAllExpanded;
  var btn = document.getElementById("expand-btn");
  btn.textContent = isAllExpanded ? "▲ 전체 접기" : "▼ 전체 펼치기";
  document.querySelectorAll('.paytype-body').forEach(function(el) {
    if (isAllExpanded) el.classList.remove("collapsed"); else el.classList.add("collapsed");
  });
}

// ── 미수 상세내역 팝업으로 크게 보기 - 미수 건수가 많은 담당자는 페이지에 끼워 넣은
//    표만으로는 스크롤이 길어져 한눈에 안 들어온다는 요청으로 추가. #table-body에 이미
//    그려진 내용을 그대로 복사해 큰 팝업에 띄우되, 그룹 접힘 상태와 무관하게 항상 전부
//    펼쳐서 보여준다(팝업의 목적 자체가 "한눈에 다 보기"이므로). ──
// 지금 화면에 걸려있는 담당자/결제조건/위험도/검색어 필터를 그대로 적용해서 거래처별로
// 묶어 보여준다 (당월수금예정/지연미수금과 완전히 같은 모달·표 형태를 재사용 - 거래처를
// 클릭하면 openTrendDetail로 인보이스별 상세도 그대로 이어서 볼 수 있다).
function openTablePopup() {
  var backdrop = document.getElementById('trend-modal-backdrop');
  if (!backdrop) return;
  closeTrendDetail();

  var searchQuery = document.getElementById("search-box").value.toLowerCase();
  var list = DATA.records.filter(function(r) {
    if (r.misooamt === 0) return false;
    if (filter.manager !== "전체" && r.manager !== filter.manager) return false;
    if (filter.paytype !== "전체" && r.paytype !== filter.paytype) return false;
    if (filter.risk !== "전체" && calcRisk(r.saledate, r.paytype).label !== filter.risk) return false;
    if (searchQuery && r.company.toLowerCase().indexOf(searchQuery) < 0) return false;
    return true;
  });
  var modalKey = 'table-popup';
  trendModalLists[modalKey] = list;
  currentTrendModalType = modalKey;

  renderCompanyListModal(document.getElementById('table-title').textContent, list);
  backdrop.classList.add('show');
}

// ══════════════════════════════════════════
// 거래처 원장 기능
// ══════════════════════════════════════════

// 원장 상태 변수
var ledgerState = {
  company: null,
  viewMode: 'combined',   // 'split' = 매출/입금 분리, 'combined' = 날짜순 통합 (기본값)
  dateFrom: '',
  dateTo: '',
  // 일별/월별 소계 표시 여부 - 매출/입금 분리, 날짜순 통합 두 뷰에 공통으로 적용된다.
  // 날짜순 통합 뷰가 원래 월별 소계를 항상 보여주던 것과 같은 기본값을 유지.
  subtotalDaily: false,
  subtotalMonthly: true
};

// ── 거래처 클릭 → 원장 표시 ──
function showLedger(companyName) {
  ledgerState.company = companyName;
  renderLedger();
}

// ── 원장 PDF 다운로드 - 별도 라이브러리 없이 브라우저 인쇄 대화상자를 그대로 활용한다.
//    "PDF로 저장"을 고르면 사실상 PDF 내보내기가 된다. @media print 규칙이 필터/버튼
//    등 화면 전용 요소를 감추고 원장 표(.ledger-wrap)만 인쇄되게 한다. ──
function printLedger() {
  var prevTitle = document.title;
  document.title = ledgerState.company + ' 원장 ' + DATA.today;
  window.addEventListener('afterprint', function restoreTitle() {
    document.title = prevTitle;
    window.removeEventListener('afterprint', restoreTitle);
  });
  window.print();
}

// ── 원장 렌더링 (뷰 모드/기간 변경 시 재호출) ──
function renderLedger() {
  var companyName = ledgerState.company;
  if (!companyName) return;

  // 해당 거래처 전체 내역 (매출/미수금 - 인보이스 단위, 왼쪽 패널과 동일 기준)
  var allRecords = DATA.records.filter(function(r) {
    return r.company === companyName;
  });

  // 해당 거래처 입금 내역 (은행 당월+ERP 누계, 카드 - 실제 입금 건수 그대로)
  var depositRecords = (DATA.deposits || []).filter(function(d) {
    return d.company === companyName;
  });

  // 기간 필터 적용 (매출은 매출일, 입금은 입금일 기준으로 각각 필터링)
  var fromSerial = dateToSerial(ledgerState.dateFrom);
  var toSerial   = dateToSerial(ledgerState.dateTo);
  if (fromSerial > 0) allRecords = allRecords.filter(function(r) { return r.saledate >= fromSerial; });
  if (toSerial > 0)   allRecords = allRecords.filter(function(r) { return r.saledate <= toSerial; });
  if (fromSerial > 0) depositRecords = depositRecords.filter(function(d) { return d.date >= fromSerial; });
  if (toSerial > 0)   depositRecords = depositRecords.filter(function(d) { return d.date <= toSerial; });

  allRecords.sort(function(a, b) { return a.saledate - b.saledate; });
  depositRecords.sort(function(a, b) { return a.date - b.date; });

  var manager = allRecords.length > 0 ? allRecords[0].manager : '-';
  var paytype = allRecords.length > 0 ? allRecords[0].paytype : '-';

  // 합계
  var totalSale  = allRecords.reduce(function(s, r) { return s + r.saleamt; }, 0);
  var totalPaid  = depositRecords.reduce(function(s, d) { return s + d.amount; }, 0);
  var totalMisoo = allRecords.reduce(function(s, r) { return s + r.misooamt; }, 0);

  var html = '';
  html += '<div class="ledger-wrap">';

  // ── 헤더 ──
  html += '<div class="ledger-header">';
  html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">';
  html += '<div>';
  html += '<div class="ledger-company-name">' + companyName + '</div>';
  html += '<div class="ledger-sub">' + paytype + ' · 담당: ' + manager + '</div>';
  html += '</div>';
  html += '<div class="print-hide" style="display:flex;gap:6px">';
  html += '<button class="ledger-pdf-btn" onclick="printLedger()">🖨 PDF 다운로드</button>';
  html += '<button class="ledger-close" onclick="closeLedger()">✕ 닫기</button>';
  html += '</div>';
  html += '</div>';

  // 뷰 모드 탭
  html += '<div class="ledger-tabs print-hide">';
  html += '<button class="ledger-tab ' + (ledgerState.viewMode==="split" ? "active" : "") + '" data-mode="split" onclick="setLedgerView(this.dataset.mode)">📊 매출/입금 분리</button>';
  html += '<button class="ledger-tab ' + (ledgerState.viewMode==="combined" ? "active" : "") + '" data-mode="combined" onclick="setLedgerView(this.dataset.mode)">📅 날짜순 통합</button>';
  html += '</div>';

  // 기간 필터
  html += '<div class="ledger-date-filter print-hide">';
  html += '<span class="ledger-date-label">기간</span>';
  html += '<input type="text" inputmode="numeric" class="ledger-date-input" id="ld-from" value="' + ledgerState.dateFrom + '" placeholder="YYMMDD" onchange="setLedgerDate()">';
  html += '<span style="color:var(--회색글자)">~</span>';
  html += '<input type="text" inputmode="numeric" class="ledger-date-input" id="ld-to"   value="' + ledgerState.dateTo   + '" placeholder="YYMMDD" onchange="setLedgerDate()">';
  html += '<button class="ledger-date-reset" onclick="resetLedgerDate()">전체</button>';
  html += '<button class="ledger-date-reset" onclick="setLedgerDateThisMonth()">당월</button>';
  html += '<button class="ledger-date-reset" onclick="setLedgerDateLastMonth()">지난달</button>';
  html += '</div>';

  // 소계 표시 토글 - 매출/입금 분리, 날짜순 통합 두 뷰 모두에 그대로 적용됨
  html += '<div class="ledger-date-filter print-hide">';
  html += '<span class="ledger-date-label">소계 표시</span>';
  html += '<button class="ledger-date-reset' + (ledgerState.subtotalDaily ? ' active' : '') + '" onclick="toggleLedgerSubtotal(\'daily\')">일별 소계</button>';
  html += '<button class="ledger-date-reset' + (ledgerState.subtotalMonthly ? ' active' : '') + '" onclick="toggleLedgerSubtotal(\'monthly\')">월별 소계</button>';
  html += '</div>';
  html += '</div>'; // ledger-header 끝

  // ── 합계 카드 ──
  html += '<div class="ledger-summary">';
  html += '<div class="ledger-sum-item"><div class="ledger-sum-label">총 매출액</div><div class="ledger-sum-value">' + formatAmountFull(totalSale) + '</div></div>';
  html += '<div class="ledger-sum-item"><div class="ledger-sum-label">총 입금액</div><div class="ledger-sum-value" style="color:#0F7B52">' + formatAmountFull(totalPaid) + '</div></div>';
  html += '<div class="ledger-sum-item"><div class="ledger-sum-label">미수 잔액</div><div class="ledger-sum-value" style="color:#C0392B">' + formatAmountFull(totalMisoo) + '</div></div>';
  html += '</div>';

  // ── 뷰 모드별 테이블 ──
  if (ledgerState.viewMode === 'split') {
    html += renderLedgerSplit(allRecords, depositRecords);
  } else {
    html += renderLedgerCombined(allRecords, depositRecords);
  }

  html += '</div>'; // ledger-wrap 끝

  // 오른쪽 패널에 표시
  document.getElementById("chart-placeholder").style.display = "none";
  document.getElementById("chart-all").style.display = "none";
  document.getElementById("chart-manager").style.display = "none";
  var rightPanel = document.getElementById("ledger-panel");
  rightPanel.innerHTML = html;
  rightPanel.style.display = "block";
}

// ── 일별/월별 소계 삽입 공통 헬퍼. 이미 날짜순 정렬된 items를 훑으면서 날짜/월이
//    바뀔 때마다(ledgerState.subtotalDaily/subtotalMonthly가 켜져 있을 때만) 그 구간의
//    소계 행을 끼워 넣는다. rowFn(item)은 그 항목의 표 행 HTML을, subtotalFn(label, group, kind)은
//    소계 행 HTML을 반환해야 한다(kind: 'day' | 'month' - CSS로 진하기를 다르게 준다).
//    매출/입금 분리 뷰(각 표를 따로)와 날짜순 통합 뷰(매출+입금을 합친 하나의 타임라인)가
//    똑같은 로직을 공유하도록 여기 한 곳에만 둔다. ──
function buildRowsWithSubtotals(items, dateFn, rowFn, subtotalFn) {
  var out = '';
  var dayBuf = [], curDay = null, curDayLabel = '';
  var monthBuf = [], curYM = null, curYMLabel = '';

  function flushDay() {
    if (ledgerState.subtotalDaily && dayBuf.length) out += subtotalFn(curDayLabel + ' 소계', dayBuf, 'day');
    dayBuf = [];
  }
  function flushMonth() {
    if (ledgerState.subtotalMonthly && monthBuf.length) out += subtotalFn(curYMLabel + ' 소계', monthBuf, 'month');
    monthBuf = [];
  }

  items.forEach(function(item) {
    var serial = dateFn(item);
    var ym = serialToYM(serial);
    var ymKey = ym.y + '-' + ym.m;

    // 월이 바뀔 때는 그 전에 먼저 마지막 날짜의 일별 소계부터 찍고(순서상 자연스럽게),
    // 그다음 월별 소계를 찍는다.
    if (curDay !== null && serial !== curDay) flushDay();
    if (curYM !== null && ymKey !== curYM) flushMonth();

    curDay = serial; curDayLabel = formatDate(serial);
    curYM = ymKey; curYMLabel = ym.y + '년 ' + ym.m + '월';

    out += rowFn(item);
    dayBuf.push(item);
    monthBuf.push(item);
  });
  flushDay();
  flushMonth(); // 마지막 구간은 다음 경계가 없어서 루프 종료 후 별도로 찍어줌
  return out;
}

// ── 매출/입금 분리 뷰 ──
// records: 매출(인보이스) 목록 - 행 단위로 그대로 표시
// deposits: 입금 목록 - 실제 입금 건수만큼 행으로 표시 (매출 건수와 무관)
function renderLedgerSplit(records, deposits) {
  // 매출 행 (미수금(AF열) 부호로 완납/미수/조정 판정 - 왼쪽 패널과 동일한 값을 그대로 씀)
  // AF열이 마이너스인 행은 반품/과입금 상계 같은 조정 건이라 "완납"이 아니라 실제 마이너스
  // 금액을 그대로 보여줘야 한다(전에는 <=0이면 전부 "완납"으로 표시해서 조정 내역이 안 보였음).
  function saleRowHtml(r) {
    var badge, rowCls, amtHtml;
    if (r.misooamt > 0) {
      badge = '<span class="ledger-badge unpaid">미수</span>';
      rowCls = 'ledger-row unpaid';
      amtHtml = '<span style="color:#C0392B">' + formatAmountFull(r.misooamt) + '</span>';
    } else if (r.misooamt < 0) {
      badge = '<span class="ledger-badge paid">조정</span>';
      rowCls = '';
      amtHtml = '<span style="color:#0F7B52">' + formatAmountFull(r.misooamt) + '</span>';
    } else {
      badge = '<span class="ledger-badge paid">완납</span>';
      rowCls = '';
      amtHtml = '<span style="color:#0F7B52">완납</span>';
    }
    return '<tr class="' + rowCls + '">' +
      '<td>' + formatDate(r.saledate) + '</td>' +
      '<td>' + (r.origin || '-') + ' / ' + (r.product || '-') + ' ' + badge + '</td>' +
      '<td style="text-align:right">' + formatAmountFull(r.saleamt) + '</td>' +
      '<td style="text-align:right;font-weight:500">' + amtHtml + '</td>' +
      '</tr>';
  }
  function saleSubtotalHtml(label, group, kind) {
    var sale  = group.reduce(function(s, r) { return s + r.saleamt; }, 0);
    var misoo = group.reduce(function(s, r) { return s + r.misooamt; }, 0);
    return '<tr class="ledger-row subtotal ' + kind + '">' +
      '<td colspan="2">' + label + '</td>' +
      '<td style="text-align:right">' + formatAmountFull(sale) + '</td>' +
      '<td style="text-align:right">' + formatAmountFull(misoo) + '</td>' +
      '</tr>';
  }
  var saleRows = records.length === 0
    ? '<tr><td colspan="4" style="text-align:center;padding:20px;color:#6B7A94">매출 내역 없음</td></tr>'
    : buildRowsWithSubtotals(records, function(r) { return r.saledate; }, saleRowHtml, saleSubtotalHtml);

  // 입금 행 (실제 입금 건별로 1행씩)
  function depositRowHtml(d) {
    return '<tr class="ledger-row deposit">' +
      '<td>' + formatDate(d.date) + '</td>' +
      '<td>' + depositSourceLabel(d.source) + '</td>' +
      '<td style="text-align:right;color:#0F7B52;font-weight:500">' + formatAmountFull(d.amount) + '</td>' +
      '</tr>';
  }
  function depositSubtotalHtml(label, group, kind) {
    var paid = group.reduce(function(s, d) { return s + d.amount; }, 0);
    return '<tr class="ledger-row subtotal ' + kind + '">' +
      '<td colspan="2">' + label + '</td>' +
      '<td style="text-align:right;color:#0F7B52">' + formatAmountFull(paid) + '</td>' +
      '</tr>';
  }
  var paidRows = deposits.length === 0
    ? '<tr><td colspan="3" style="text-align:center;padding:20px;color:#6B7A94">입금 내역 없음</td></tr>'
    : buildRowsWithSubtotals(deposits, function(d) { return d.date; }, depositRowHtml, depositSubtotalHtml);

  var totalSale  = records.reduce(function(s,r){return s+r.saleamt;},0);
  var totalMisoo = records.reduce(function(s,r){return s+r.misooamt;},0);
  var totalPaid  = deposits.reduce(function(s,d){return s+d.amount;},0);

  var html = '<div class="ledger-split-wrap">';

  // 매출 테이블 (컬럼이 많아서 공간을 더 차지하도록)
  html += '<div class="ledger-split-panel sale-panel">';
  html += '<div class="ledger-panel-title">📦 매출 내역</div>';
  html += '<div class="ledger-table-wrap">';
  html += '<table class="ledger-table">';
  html += '<thead><tr><th>매출일</th><th>산지/품목</th><th>매출액</th><th>미수금</th></tr></thead>';
  html += '<tbody>' + saleRows + '</tbody>';
  html += '<tfoot><tr class="ledger-foot"><td colspan="2">합계</td><td style="text-align:right">' + formatAmountFull(totalSale) + '</td><td style="text-align:right;color:#C0392B">' + formatAmountFull(totalMisoo) + '</td></tr></tfoot>';
  html += '</table></div></div>';

  // 입금 테이블 (건수 기준, 컬럼이 단순해서 필요한 만큼만 차지하도록)
  html += '<div class="ledger-split-panel deposit-panel">';
  html += '<div class="ledger-panel-title">💰 입금 내역 (' + deposits.length + '건)</div>';
  html += '<div class="ledger-table-wrap">';
  html += '<table class="ledger-table">';
  html += '<thead><tr><th>입금일</th><th>출처</th><th>입금액</th></tr></thead>';
  html += '<tbody>' + paidRows + '</tbody>';
  html += '<tfoot><tr class="ledger-foot"><td colspan="2">합계</td><td style="text-align:right;color:#0F7B52">' + formatAmountFull(totalPaid) + '</td></tr></tfoot>';
  html += '</table></div></div>';

  html += '</div>'; // ledger-split-wrap 끝
  return html;
}

// ── 날짜순 통합 뷰 (매출/입금 이벤트를 하나의 타임라인으로 병합) ──
function renderLedgerCombined(records, deposits) {
  var items = [];
  records.forEach(function(r) { items.push({ type: 'sale', date: r.saledate, r: r }); });
  deposits.forEach(function(d) { items.push({ type: 'deposit', date: d.date, d: d }); });
  items.sort(function(a, b) { return a.date - b.date; });

  // AF열(미수금) 부호로 완납/미수/조정 판정 - 마이너스는 반품·과입금 상계 같은 조정 건이라
  // "완납"이 아니라 실제 마이너스 금액을 그대로 보여준다.
  function itemRowHtml(item) {
    if (item.type === 'sale') {
      var r = item.r;
      var badge, misooColor, misooText;
      if (r.misooamt > 0) {
        badge = '<span class="ledger-badge unpaid">미수</span>';
        misooColor = '#C0392B'; misooText = formatAmountFull(r.misooamt);
      } else if (r.misooamt < 0) {
        badge = '<span class="ledger-badge paid">조정</span>';
        misooColor = '#0F7B52'; misooText = formatAmountFull(r.misooamt);
      } else {
        badge = '<span class="ledger-badge paid">완납</span>';
        misooColor = '#0F7B52'; misooText = '완납';
      }
      var rowCls = r.misooamt > 0 ? 'ledger-row unpaid' : '';
      return '<tr class="' + rowCls + '">' +
        '<td>' + formatDate(r.saledate) + '</td>' +
        '<td>' + (r.origin || '-') + '</td>' +
        '<td>' + (r.product || '-') + ' ' + badge + '</td>' +
        '<td style="text-align:center">' + formatAmountFull(r.unitprice) + '</td>' +
        '<td style="text-align:center">' + (r.qty || 0).toLocaleString('ko-KR') + '</td>' +
        '<td style="text-align:right">' + formatAmountFull(r.saleamt) + '</td>' +
        '<td style="text-align:right">-</td>' +
        '<td style="text-align:right;color:' + misooColor + ';font-weight:500">' + misooText + '</td>' +
        '</tr>';
    }
    var d = item.d;
    return '<tr class="ledger-row deposit">' +
      '<td>' + formatDate(d.date) + '</td>' +
      '<td>-</td>' +
      '<td>입금 ' + depositSourceLabel(d.source) + '</td>' +
      '<td style="text-align:center">-</td>' +
      '<td style="text-align:center">-</td>' +
      '<td style="text-align:right">-</td>' +
      '<td style="text-align:right;color:#0F7B52;font-weight:500">' + formatAmountFull(d.amount) + '</td>' +
      '<td style="text-align:right">-</td>' +
      '</tr>';
  }
  function itemSubtotalHtml(label, group, kind) {
    var sale = 0, paid = 0, misoo = 0;
    group.forEach(function(item) {
      if (item.type === 'sale') { sale += item.r.saleamt; misoo += item.r.misooamt; }
      else { paid += item.d.amount; }
    });
    return '<tr class="ledger-row subtotal ' + kind + '">' +
      '<td colspan="5">' + label + '</td>' +
      '<td style="text-align:right">' + formatAmountFull(sale) + '</td>' +
      '<td style="text-align:right">' + formatAmountFull(paid) + '</td>' +
      '<td style="text-align:right">' + formatAmountFull(misoo) + '</td>' +
      '</tr>';
  }
  var rows = items.length === 0
    ? '<tr><td colspan="8" style="text-align:center;padding:20px;color:#6B7A94">내역 없음</td></tr>'
    : buildRowsWithSubtotals(items, function(item) { return item.date; }, itemRowHtml, itemSubtotalHtml);

  var totalSale  = records.reduce(function(s,r){return s+r.saleamt;},0);
  var totalPaid  = deposits.reduce(function(s,d){return s+d.amount;},0);
  var totalMisoo = records.reduce(function(s,r){return s+r.misooamt;},0);

  var html = '<div class="ledger-table-wrap">';
  html += '<table class="ledger-table">';
  html += '<thead><tr>';
  html += '<th>날짜</th><th>원산지</th><th>품목명</th>';
  html += '<th>매출단가(원/kg)</th>';
  html += '<th>총 수량(Kg)</th>';
  html += '<th>매출액</th>';
  html += '<th>입금액</th>';
  html += '<th>미수금</th>';
  html += '</tr></thead>';
  html += '<tbody>' + rows + '</tbody>';
  html += '<tfoot><tr class="ledger-foot">';
  html += '<td colspan="5">합계</td>';
  html += '<td style="text-align:right">' + formatAmountFull(totalSale) + '</td>';
  html += '<td style="text-align:right;color:#0F7B52">' + formatAmountFull(totalPaid) + '</td>';
  html += '<td style="text-align:right;color:#C0392B">' + formatAmountFull(totalMisoo) + '</td>';
  html += '</tr></tfoot>';
  html += '</table></div>';
  return html;
}

// ── 날짜 → 엑셀 시리얼 변환 ──
function dateToSerial(dateStr) {
  if (!dateStr) return 0;
  var parts = dateStr.split('-');
  if (parts.length !== 3) return 0;
  // new Date(y,m,d)는 "로컬 자정"을 만들고 나서 .valueOf()로 UTC ms를 얻기 때문에,
  // UTC+9(한국) 등 로컬 타임존이 UTC보다 앞서면 자정이 전날 UTC로 넘어가 하루가 당겨지는 버그가 있었음.
  // Date.UTC로 처음부터 UTC 기준으로 만들어서 이 문제를 없앰 (formatDate()와 동일한 기준으로 통일).
  var utcMs = Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  return Math.floor(utcMs / 86400000) + 25569;
}

// ── 뷰 모드 변경 ──
function setLedgerView(mode) {
  ledgerState.viewMode = mode;
  renderLedger();
}

// ── 소계 표시 토글 ('daily' | 'monthly') - 매출/입금 분리, 날짜순 통합 두 뷰 모두에
//    같은 상태가 그대로 적용된다. 원하는 대로 둘 다 켜거나, 하나만 켜거나, 둘 다 끌 수 있다. ──
function toggleLedgerSubtotal(kind) {
  if (kind === 'daily') ledgerState.subtotalDaily = !ledgerState.subtotalDaily;
  else if (kind === 'monthly') ledgerState.subtotalMonthly = !ledgerState.subtotalMonthly;
  renderLedger();
}

// ── 기간 설정 ── ("260719" 같은 6자리 타이핑도 parseFlexibleDateInput으로 인식)
function setLedgerDate() {
  var from = parseFlexibleDateInput(document.getElementById('ld-from').value);
  var to   = parseFlexibleDateInput(document.getElementById('ld-to').value);
  if (from) ledgerState.dateFrom = from;
  if (to)   ledgerState.dateTo   = to;
  renderLedger();
}

// ── 기간 초기화 ──
function resetLedgerDate() {
  ledgerState.dateFrom = '';
  ledgerState.dateTo   = '';
  renderLedger();
}

// ── 빠른 기간 필터: 당월 (이번 달 1일 ~ 오늘과 말일 중 더 이른 날짜) ──
// 말일로 고정하면 아직 안 지난 미래 날짜까지 조회 기간에 잡혀서 "당월"의 의미가
// 어긋난다(예: 7/20에 클릭했는데 7/31까지 조회됨). 오늘이 이번 달 안이면 오늘까지만.
function setLedgerDateThisMonth() {
  var p = DATA.today.split('-');
  var y = parseInt(p[0]), m = parseInt(p[1]);
  var monthEnd = new Date(y, m, 0); // 0일 = 이번 달 말일
  var today = new Date(y, m - 1, parseInt(p[2]));
  ledgerState.dateFrom = formatDateInput(new Date(y, m - 1, 1));
  ledgerState.dateTo   = formatDateInput(today < monthEnd ? today : monthEnd);
  renderLedger();
}

// ── 빠른 기간 필터: 지난달 (전월 1일 ~ 말일) ──
function setLedgerDateLastMonth() {
  var p = DATA.today.split('-');
  var y = parseInt(p[0]), m = parseInt(p[1]);
  ledgerState.dateFrom = formatDateInput(new Date(y, m - 2, 1));
  ledgerState.dateTo   = formatDateInput(new Date(y, m - 1, 0)); // 0일 = 지난 달 말일
  renderLedger();
}

// ── 원장 닫기 → 차트 다시 표시 ──
function closeLedger() {
  var rightPanel = document.getElementById("ledger-panel");
  if (rightPanel) {
    rightPanel.style.display = "none";
    rightPanel.innerHTML = "";
  }
  // 차트 다시 표시
  var isAll = filter.manager === "전체";
  var ph = document.getElementById("chart-placeholder");
  if (ph) ph.style.display = "flex";
  var ca = document.getElementById("chart-all");
  if (ca) ca.style.display = isAll ? "" : "none";
  var cm = document.getElementById("chart-manager");
  if (cm) cm.style.display = isAll ? "none" : "";
  // 원장이 열려있던 동안 숨겨졌던 매출·입금 추이 차트를 다시 정상적으로 그린다.
  renderTrendWidget();
}

// ── 담당자별 미수금 차트(막대/도넛) 색상 지정 오버라이드. CHART_COLORS 팔레트는 매크로 쪽에서
//    정의되는데(fn_데이터만), 이건 매크로를 재실행 안 해도 되도록 여기(JS)에 자체적으로 둔다 -
//    이 파일은 생성할 때마다 GitHub에서 즉시 새로 받아오지만, 매크로 코드는 사용자가 직접
//    엑셀 VBA에 반영해야만 바뀌기 때문에, 매크로 쪽 값에 의존하면 "JS는 최신인데 매크로는
//    구버전"인 상태에서 정의되지 않은 변수를 참조해 전체 렌더링이 멈추는 문제가 생길 수 있다.
var MANAGER_COLOR_OVERRIDE = { "송동열": "#29B6F6" };

// ── "담당자별 미수금" 리스트 표시 순서 - 미수금 액수가 아니라 직급순으로 고정.
//    이 목록에 없는 담당자가 나중에 추가되면 맨 뒤에 붙는다. ──
var MANAGER_RANK_ORDER = ["전선준", "김근우", "김금식", "송유현", "허성무", "염하린", "송동열"];

// 캔버스를 재사용하지 않고 통째로 새 <canvas>로 갈아끼운다(destroy 후 같은 캔버스에 새 차트를
// 만드는 것보다 확실하게 이전 상태를 지운다). 그리고 Chart.js의 반응형(컨테이너 크기를 JS로
// 측정해서 캔버스 해상도를 맞추는) 방식은 담당자 필터로 컨테이너가 display:none ↔ 표시를
// 반복하는 이 화면에서 타이밍이 계속 꼬여 차트가 찌그러진 크기로 굳어버리는 문제가 있었다.
// 그래서 아예 JS 측정에 의존하지 않는다 - 캔버스 해상도는 width/height 속성으로 고정값을
// 박아두고, 화면에 보이는 크기는 CSS(width:100%;height:100%, dashboard-style.css)가 항상
// 그 순간의 박스 크기에 맞춰 늘려서 그리게 한다. Chart.js 쪽 옵션도 responsive:false로 꺼서
// Chart.js가 크기를 재측정/재조정하려는 시도 자체를 하지 않도록 한다.
function freshCanvas(id, w, h) {
  var old = document.getElementById(id);
  if (!old) return null;
  var wrap = old.parentElement;
  wrap.innerHTML = '<canvas id="' + id + '" width="' + w + '" height="' + h + '"></canvas>';
  return document.getElementById(id);
}

// ── 담당자별 미수금 순위 리스트 전용 결제조건 미니 필터 상태 (좌측 전역 필터와는 별개) ──
var rankPaytype = "전체";
var lastRankManagers = null;

// ── 담당자별 미수금 리스트 (도넛 차트 대신, 직급순 고정 순서로 담당자명+미수총액을 나열) ──
function renderManagerRankList(managers) {
  var el = document.getElementById("manager-rank-list");
  if (!el) return;
  lastRankManagers = managers;

  // 상단 미니 필터에서 고른 결제조건 기준으로 담당자별 미수금을 다시 집계한다
  // (좌측 KPI 합계와 같은 규칙: misooamt===0인 완납 건만 제외, 마이너스 조정 건은 포함해 상계 반영).
  var amountByManager = {};
  DATA.records.forEach(function(r) {
    if (r.misooamt === 0) return;
    if (rankPaytype !== "전체" && r.paytype !== rankPaytype) return;
    amountByManager[r.manager] = (amountByManager[r.manager] || 0) + r.misooamt;
  });

  var withColor = managers.map(function(m, i) {
    return { name: m.name, amount: amountByManager[m.name] || 0, color: MANAGER_COLOR_OVERRIDE[m.name] || CHART_COLORS[i % CHART_COLORS.length] };
  });
  // 금액이 아니라 MANAGER_RANK_ORDER(직급순)로 고정 정렬 - 목록에 없는 담당자는 맨 뒤로
  withColor.sort(function(a, b) {
    var ai = MANAGER_RANK_ORDER.indexOf(a.name); if (ai === -1) ai = MANAGER_RANK_ORDER.length;
    var bi = MANAGER_RANK_ORDER.indexOf(b.name); if (bi === -1) bi = MANAGER_RANK_ORDER.length;
    return ai - bi;
  });

  var paytypes = ["전체", "7일이내 결제", "월말결제", "익월 10일결제", "익월말"];
  var filterHtml = '<div class="rank-filter-bar">' + paytypes.map(function(p, i) {
    return '<button class="rank-filter-btn' + (p === rankPaytype ? ' selected' : '') + '" onclick="selectRankPaytype(' + i + ')">' + p + '</button>';
  }).join('') + '</div>';

  var rowsHtml = withColor.map(function(m, i) {
    return '<div class="manager-rank-row" onclick="openManagerRankModal(\'' + m.name.replace(/'/g, "\\'") + '\')">' +
      '<span class="manager-rank-rank">' + (i + 1) + '</span>' +
      '<span class="manager-rank-dot" style="background:' + m.color + '"></span>' +
      '<span class="manager-rank-name">' + m.name + '</span>' +
      '<span class="manager-rank-amount">' + formatAmountFull(m.amount) + '</span>' +
    '</div>';
  }).join('');

  el.innerHTML = filterHtml + rowsHtml;
}

// ── 순위 리스트 결제조건 미니 필터 클릭 ──
function selectRankPaytype(idx) {
  var paytypes = ["전체", "7일이내 결제", "월말결제", "익월 10일결제", "익월말"];
  rankPaytype = paytypes[idx];
  if (lastRankManagers) renderManagerRankList(lastRankManagers);
}

// ── 차트 렌더링 ──
function renderCharts(managers, selectedManager) {
  var isAll = selectedManager === "전체";

  if (isAll) {
    if (chartBar) chartBar.destroy();
    chartBar = new Chart(freshCanvas("chart-bar", 400, 150).getContext("2d"), {
      type: 'bar',
      data: {
        labels: managers.map(function(m) { return m.name; }),
        datasets: [{ data: managers.map(function(m) { return m.amount; }), backgroundColor: managers.map(function(m, i) { return MANAGER_COLOR_OVERRIDE[m.name] || CHART_COLORS[i % CHART_COLORS.length]; }), borderRadius: 6, borderSkipped: false }]
      },
      options: { responsive: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(ctx) { return ' ' + formatAmountFull(ctx.raw); } } } }, scales: { x: { grid: { display: false } }, y: { ticks: { callback: function(v) { return formatAmount(v); } } } } }
    });
    renderManagerRankList(managers);
  }

  if (!isAll && DATA.paytypes[selectedManager]) {
    var paytypeData = DATA.paytypes[selectedManager];
    document.getElementById("chart-manager-title").textContent = selectedManager + " 결제조건별 미수금 비중";
    if (chartPaytypeDonut) chartPaytypeDonut.destroy();
    chartPaytypeDonut = new Chart(freshCanvas("chart-paytype-donut", 400, 150).getContext("2d"), {
      type: 'doughnut',
      data: { labels: paytypeData.map(function(p) { return p.name; }), datasets: [{ data: paytypeData.map(function(p) { return p.amount; }), backgroundColor: paytypeData.map(function(p) { return PAYTYPE_COLORS[p.name] || '#ccc'; }), borderWidth: 2, borderColor: '#fff' }] },
      options: { responsive: false, cutout: '60%', plugins: { legend: { position: 'right' }, tooltip: { callbacks: { label: function(ctx) { return ' ' + ctx.label + ': ' + formatAmountFull(ctx.raw); } } } } }
    });
    if (chartPaytypeBar) chartPaytypeBar.destroy();
    chartPaytypeBar = new Chart(freshCanvas("chart-paytype-bar", 400, 150).getContext("2d"), {
      type: 'bar',
      data: { labels: paytypeData.map(function(p) { return p.name; }), datasets: [{ data: paytypeData.map(function(p) { return p.amount; }), backgroundColor: paytypeData.map(function(p) { return PAYTYPE_COLORS[p.name] || '#ccc'; }), borderRadius: 6, borderSkipped: false }] },
      options: { responsive: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(ctx) { return ' ' + formatAmountFull(ctx.raw); } } } }, scales: { x: { grid: { display: false } }, y: { ticks: { callback: function(v) { return formatAmount(v); } } } } }
    });
  }
}

window.addEventListener('DOMContentLoaded', init);