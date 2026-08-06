/*
  미수금 현황 대시보드 - JavaScript
  ConnectBean 생두사업팀

  함수 목록:
  - init()                   : 페이지 초기화
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
  - renderCharts()           : 차트 렌더
  - showLedger(companyName)  : 거래처 클릭 시 오른쪽 원장 표시
  - closeLedger()            : 원장 닫기
  - formatAmount(n)          : 숫자 포맷 (억/만원)
  - formatAmountFull(n)      : 숫자 포맷 (전체 원 단위)
  - formatDate(serial)       : 엑셀 날짜 시리얼 → YYYY-MM-DD
  - calcRisk(serial, paytype): 위험도 계산
  - renderFundIssues()       : 자금 특이사항(과입금/선입금) 렌더 - 필터와 무관하게 항상 표시
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

// ── 자금 특이사항 카드를 왼쪽 "OO 담당 미수내역" 헤더와 같은 높이에서 시작하도록 보정 ──
// (왼쪽은 필터바+KPI카드, 오른쪽은 차트로 구성이 달라서 자연 높이가 다르므로 실측 후 맞춤)
function alignFundIssueCard() {
  var target = document.querySelector('.table-container');
  var card = document.getElementById('fund-issue-card');
  if (!target || !card) return;
  card.style.marginTop = '0px';
  var diff = target.getBoundingClientRect().top - card.getBoundingClientRect().top;
  card.style.marginTop = (diff > 0 ? diff : 0) + 'px';
}

// ── 숫자 포맷 함수 ──
function formatAmount(n) {
  if (!n || n === 0) return "0원";
  if (n >= 100000000) return (n / 100000000).toFixed(1) + "억원";
  if (n >= 10000) return Math.round(n / 10000).toLocaleString("ko-KR") + "만원";
  return n.toLocaleString("ko-KR") + "원";
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
  var html = '<div class="fund-issue-header">';
  html += '<span class="fund-issue-date">입금일</span>';
  html += '<span class="fund-issue-type">구분</span>';
  html += '<span class="fund-issue-company">거래처</span>';
  html += '<span class="fund-issue-amount">금액</span>';
  html += '</div>';
  items.forEach(function(it) {
    var rowCls = it.type === '과입금' ? 'fund-issue-row overpay' : 'fund-issue-row';
    html += '<div class="' + rowCls + '">';
    html += '<span class="fund-issue-date">' + (it.date > 0 ? formatDate(it.date) : '-') + '</span>';
    html += '<span class="fund-issue-type">' + (it.type || '-') + '</span>';
    html += '<span class="fund-issue-company">' + (it.company || '-') + '</span>';
    html += '<span class="fund-issue-amount">' + formatAmountFull(it.amount) + '</span>';
    html += '</div>';
    if (it.note) html += '<div class="fund-issue-note">' + it.note + '</div>';
  });
  el.innerHTML = html;
}

// ── 초기화 ──
function init() {
  document.getElementById("date-badge").textContent = "기준일: " + DATA.today;
  document.getElementById("count-badge").textContent = "총 " + DATA.companies.length + "개 거래처";
  setDefaultDepositDateRange();
  renderManagerFilter();
  renderPaytypeFilter();
  renderRiskFilter();
  applyFilters();
  renderFundIssues();
  var btn = document.getElementById("expand-btn");
  if (btn && isAllExpanded) btn.textContent = "▲ 전체 접기";
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
  var filteredCompanies = DATA.companies.filter(function(c) {
    if (filter.manager !== "전체" && c.manager !== filter.manager) return false;
    if (filter.paytype !== "전체" && c.paytype !== filter.paytype) return false;
    return true;
  });
  var displayCompanies;
  if (filter.risk !== "전체") {
    var riskRecords = DATA.records.filter(function(r) {
      if (filter.manager !== "전체" && r.manager !== filter.manager) return false;
      if (filter.paytype !== "전체" && r.paytype !== filter.paytype) return false;
      if (r.misooamt <= 0) return false;
      return calcRisk(r.saledate, r.paytype).label === filter.risk;
    });
    var companyMap = {};
    riskRecords.forEach(function(r) { if (!companyMap[r.company]) companyMap[r.company] = 0; companyMap[r.company] += r.misooamt; });
    displayCompanies = Object.keys(companyMap).map(function(n) { return { name: n, amount: companyMap[n] }; }).sort(function(a, b) { return b.amount - a.amount; });
  } else {
    displayCompanies = filteredCompanies;
  }
  var total = displayCompanies.reduce(function(sum, c) { return sum + c.amount; }, 0);
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
  alignFundIssueCard();
  renderTrendWidget();
}

// ── 이번달/지난달(offset=0/1) 1일~말일의 엑셀 시리얼 날짜 범위 ──
function monthRangeSerial(monthsAgo) {
  var p = DATA.today.split('-');
  var y = parseInt(p[0]), m = parseInt(p[1]);
  var start = new Date(y, m - 1 - monthsAgo, 1);
  var end   = new Date(y, m - monthsAgo, 0);
  return { from: dateToSerial(formatDateInput(start)), to: dateToSerial(formatDateInput(end)) };
}

// ── 오른쪽 패널 대기화면: 이번달 vs 지난달 매출·입금 증감 요약 위젯 (좌측 필터에 반응) ──
// 매출은 DATA.records(매출일·담당자·결제조건·위험도 모두 보유)를 그대로 필터링하고,
// 입금은 DATA.deposits에 담당자/결제조건이 없어서 거래처명으로 DATA.companies와 대조해서 필터링한다.
// (위험도는 개별 미수 인보이스의 성격이라 입금 건에는 적용하지 않음)
function renderTrendWidget() {
  var el = document.getElementById('chart-placeholder');
  if (!el) return;

  var companyInfo = {};
  (DATA.companies || []).forEach(function(c) { companyInfo[c.name] = c; });

  var thisM = monthRangeSerial(0);
  var lastM = monthRangeSerial(1);

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
      var info = companyInfo[d.company];
      if (filter.manager !== "전체" && (!info || info.manager !== filter.manager)) return sum;
      if (filter.paytype !== "전체" && (!info || info.paytype !== filter.paytype)) return sum;
      if (d.date < fromS || d.date > toS) return sum;
      return sum + d.amount;
    }, 0);
  }

  var saleThis = sumSales(thisM.from, thisM.to);
  var saleLast = sumSales(lastM.from, lastM.to);
  var depThis  = sumDeposits(thisM.from, thisM.to);
  var depLast  = sumDeposits(lastM.from, lastM.to);

  // 미수 총액(매출－입금)도 매출/입금과 똑같이 "이번달 값 vs 지난달 값"으로 비교
  var netThis = saleThis - depThis;
  var netLast = saleLast - depLast;

  el.innerHTML =
    '<div class="trend-widget">' +
      '<div class="trend-widget-title">이번달 vs 지난달 매출·입금 현황</div>' +
      '<div class="trend-widget-sub">현재 필터 기준' + (filter.risk !== "전체" ? ' (위험도는 매출에만 적용됨)' : '') + '</div>' +
      trendRow('매출 총액', saleThis, saleLast) +
      trendRow('입금 총액', depThis, depLast) +
      trendRow('미수 총액(매출－입금)', netThis, netLast, true) +
      '<div class="trend-period">이번달 ' + formatDate(thisM.from) + '~' + formatDate(thisM.to) +
        ' · 지난달 ' + formatDate(lastM.from) + '~' + formatDate(lastM.to) + '</div>' +
    '</div>';
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
      '<span class="trend-value">' + formatAmountFull(cur) + '</span>' +
      '<span class="trend-diff ' + cls + '">' + arrow + ' ' + formatAmountFull(Math.abs(diff)) + pctText + '</span>' +
    '</div>' +
  '</div>';
}

// ── 담당자/결제조건/위험도가 전부 "전체"일 때 표시할 "최근 입금내역" 상태 ──
var depositView = { dateFrom: '', dateTo: '' };

function formatDateInput(d) {
  var y = d.getFullYear();
  var m = ('0' + (d.getMonth() + 1)).slice(-2);
  var day = ('0' + d.getDate()).slice(-2);
  return y + '-' + m + '-' + day;
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
  depositView.dateFrom = document.getElementById("deposit-date-from").value;
  depositView.dateTo   = document.getElementById("deposit-date-to").value;
  renderTable();
}

function resetDepositDate() {
  setDefaultDepositDateRange();
  renderTable();
}

function buildDepositDateFilterHtml() {
  return '<span class="ledger-date-label">기간</span>' +
    '<input type="date" class="ledger-date-input" id="deposit-date-from" value="' + depositView.dateFrom + '" onchange="setDepositDate()">' +
    '<span style="color:var(--회색글자)">~</span>' +
    '<input type="date" class="ledger-date-input" id="deposit-date-to" value="' + depositView.dateTo + '" onchange="setDepositDate()">' +
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
    rows += '<td>' + depositSourceLabel(d.source) + '</td>';
    rows += '<td style="text-align:right;font-weight:600;color:#0F7B52">' + formatAmountFull(d.amount) + '</td>';
    rows += '</tr>';
  });

  var total = deposits.reduce(function(s, d) { return s + d.amount; }, 0);

  var html = '<div class="ledger-table-wrap" style="margin:0 18px 18px">';
  html += '<table class="ledger-table">';
  html += '<thead><tr><th>입금일</th><th>거래처</th><th>출처</th><th style="text-align:right">입금액</th></tr></thead>';
  html += '<tbody>' + rows + '</tbody>';
  html += '<tfoot><tr class="ledger-foot"><td colspan="3">합계 (' + deposits.length + '건)</td><td style="text-align:right;color:#0F7B52">' + formatAmountFull(total) + '</td></tr></tfoot>';
  html += '</table></div>';
  container.innerHTML = html;
}

// ── 미수 테이블 렌더링 ──
function renderTable() {
  var searchQuery = document.getElementById("search-box").value.toLowerCase();
  var expandBtn = document.getElementById("expand-btn");
  var colHeader = document.querySelector(".column-header");
  var dateFilterEl = document.getElementById("deposit-date-filter");
  var isAllFilter = filter.manager === "전체" && filter.paytype === "전체" && filter.risk === "전체";

  if (isAllFilter) {
    // 필터가 전부 "전체"일 때는 미수내역 대신 최근 입금내역을 보여줌
    setKpiText("table-title", "최근 입금내역");
    if (expandBtn) expandBtn.style.display = "none";
    if (colHeader) colHeader.style.display = "none";
    if (dateFilterEl) {
      dateFilterEl.style.display = "flex";
      dateFilterEl.innerHTML = buildDepositDateFilterHtml();
    }
    renderDepositTable(searchQuery);
    return;
  }

  if (expandBtn) expandBtn.style.display = "";
  if (colHeader) colHeader.style.display = "";
  if (dateFilterEl) dateFilterEl.style.display = "none";
  setKpiText("table-title", filter.manager === "전체" ? "전체 미수내역" : filter.manager + " 담당 미수내역");

  var records = DATA.records.filter(function(r) {
    if (r.misooamt <= 0) return false;
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

// ══════════════════════════════════════════
// 거래처 원장 기능
// ══════════════════════════════════════════

// 원장 상태 변수
var ledgerState = {
  company: null,
  viewMode: 'combined',   // 'split' = 매출/입금 분리, 'combined' = 날짜순 통합 (기본값)
  dateFrom: '',
  dateTo: ''
};

// ── 거래처 클릭 → 원장 표시 ──
function showLedger(companyName) {
  ledgerState.company = companyName;
  renderLedger();
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
  html += '<button class="ledger-close" onclick="closeLedger()">✕ 닫기</button>';
  html += '</div>';

  // 뷰 모드 탭
  html += '<div class="ledger-tabs">';
  html += '<button class="ledger-tab ' + (ledgerState.viewMode==="split" ? "active" : "") + '" data-mode="split" onclick="setLedgerView(this.dataset.mode)">📊 매출/입금 분리</button>';
  html += '<button class="ledger-tab ' + (ledgerState.viewMode==="combined" ? "active" : "") + '" data-mode="combined" onclick="setLedgerView(this.dataset.mode)">📅 날짜순 통합</button>';
  html += '</div>';

  // 기간 필터
  html += '<div class="ledger-date-filter">';
  html += '<span class="ledger-date-label">기간</span>';
  html += '<input type="date" class="ledger-date-input" id="ld-from" value="' + ledgerState.dateFrom + '" onchange="setLedgerDate()">';
  html += '<span style="color:var(--회색글자)">~</span>';
  html += '<input type="date" class="ledger-date-input" id="ld-to"   value="' + ledgerState.dateTo   + '" onchange="setLedgerDate()">';
  html += '<button class="ledger-date-reset" onclick="resetLedgerDate()">전체</button>';
  html += '<button class="ledger-date-reset" onclick="setLedgerDateThisMonth()">당월</button>';
  html += '<button class="ledger-date-reset" onclick="setLedgerDateLastMonth()">지난달</button>';
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

// ── 매출/입금 분리 뷰 ──
// records: 매출(인보이스) 목록 - 행 단위로 그대로 표시
// deposits: 입금 목록 - 실제 입금 건수만큼 행으로 표시 (매출 건수와 무관)
function renderLedgerSplit(records, deposits) {
  // 매출 행 (미수금 유무로만 완납/미수 판정 - AF열 기준, 왼쪽 패널과 동일)
  var saleRows = '';
  records.forEach(function(r) {
    var isPaid = r.misooamt <= 0;
    var rowCls = isPaid ? '' : 'ledger-row unpaid';
    var badge  = isPaid ? '<span class="ledger-badge paid">완납</span>' : '<span class="ledger-badge unpaid">미수</span>';
    saleRows += '<tr class="' + rowCls + '">';
    saleRows += '<td>' + formatDate(r.saledate) + '</td>';
    saleRows += '<td>' + (r.origin || '-') + ' / ' + (r.product || '-') + ' ' + badge + '</td>';
    saleRows += '<td style="text-align:right">' + formatAmountFull(r.saleamt) + '</td>';
    saleRows += '<td style="text-align:right;color:#C0392B;font-weight:500">' + (r.misooamt > 0 ? formatAmountFull(r.misooamt) : '<span style="color:#0F7B52">완납</span>') + '</td>';
    saleRows += '</tr>';
  });

  // 입금 행 (실제 입금 건별로 1행씩)
  var paidRows = '';
  if (deposits.length === 0) {
    paidRows = '<tr><td colspan="3" style="text-align:center;padding:20px;color:#6B7A94">입금 내역 없음</td></tr>';
  } else {
    deposits.forEach(function(d) {
      paidRows += '<tr class="ledger-row deposit">';
      paidRows += '<td>' + formatDate(d.date) + '</td>';
      paidRows += '<td>' + depositSourceLabel(d.source) + '</td>';
      paidRows += '<td style="text-align:right;color:#0F7B52;font-weight:500">' + formatAmountFull(d.amount) + '</td>';
      paidRows += '</tr>';
    });
  }

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

  var rows = '';
  items.forEach(function(item) {
    if (item.type === 'sale') {
      var r = item.r;
      var isPaid = r.misooamt <= 0;
      var rowCls = isPaid ? '' : 'ledger-row unpaid';
      var badge  = isPaid ? '<span class="ledger-badge paid">완납</span>' : '<span class="ledger-badge unpaid">미수</span>';
      rows += '<tr class="' + rowCls + '">';
      rows += '<td>' + formatDate(r.saledate) + '</td>';
      rows += '<td>' + (r.origin || '-') + '</td>';
      rows += '<td>' + (r.product || '-') + ' ' + badge + '</td>';
      rows += '<td style="text-align:center">' + formatAmountFull(r.unitprice) + '</td>';
      rows += '<td style="text-align:center">' + (r.qty || 0).toLocaleString('ko-KR') + '</td>';
      rows += '<td style="text-align:right">' + formatAmountFull(r.saleamt) + '</td>';
      rows += '<td style="text-align:right">-</td>';
      rows += '<td style="text-align:right;color:' + (r.misooamt > 0 ? '#C0392B' : '#0F7B52') + ';font-weight:500">' + (r.misooamt > 0 ? formatAmountFull(r.misooamt) : '완납') + '</td>';
      rows += '</tr>';
    } else {
      var d = item.d;
      rows += '<tr class="ledger-row deposit">';
      rows += '<td>' + formatDate(d.date) + '</td>';
      rows += '<td>-</td>';
      rows += '<td>입금 ' + depositSourceLabel(d.source) + '</td>';
      rows += '<td style="text-align:center">-</td>';
      rows += '<td style="text-align:center">-</td>';
      rows += '<td style="text-align:right">-</td>';
      rows += '<td style="text-align:right;color:#0F7B52;font-weight:500">' + formatAmountFull(d.amount) + '</td>';
      rows += '<td style="text-align:right">-</td>';
      rows += '</tr>';
    }
  });

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

// ── 기간 설정 ──
function setLedgerDate() {
  ledgerState.dateFrom = document.getElementById('ld-from').value;
  ledgerState.dateTo   = document.getElementById('ld-to').value;
  renderLedger();
}

// ── 기간 초기화 ──
function resetLedgerDate() {
  ledgerState.dateFrom = '';
  ledgerState.dateTo   = '';
  renderLedger();
}

// ── 빠른 기간 필터: 당월 (이번 달 1일 ~ 말일) ──
function setLedgerDateThisMonth() {
  var p = DATA.today.split('-');
  var y = parseInt(p[0]), m = parseInt(p[1]);
  ledgerState.dateFrom = formatDateInput(new Date(y, m - 1, 1));
  ledgerState.dateTo   = formatDateInput(new Date(y, m, 0)); // 0일 = 이번 달 말일
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
  alignFundIssueCard();
}

// ── 차트 렌더링 ──
function renderCharts(managers, selectedManager) {
  if (chartBar) chartBar.destroy();
  chartBar = new Chart(document.getElementById("chart-bar").getContext("2d"), {
    type: 'bar',
    data: {
      labels: managers.map(function(m) { return m.name; }),
      datasets: [{ data: managers.map(function(m) { return m.amount; }), backgroundColor: managers.map(function(_, i) { return CHART_COLORS[i % CHART_COLORS.length]; }), borderRadius: 6, borderSkipped: false }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(ctx) { return ' ' + formatAmountFull(ctx.raw); } } } }, scales: { x: { grid: { display: false } }, y: { ticks: { callback: function(v) { return formatAmount(v); } } } } }
  });
  if (chartDonut) chartDonut.destroy();
  chartDonut = new Chart(document.getElementById("chart-donut").getContext("2d"), {
    type: 'doughnut',
    data: {
      labels: managers.map(function(m) { return m.name; }),
      datasets: [{ data: managers.map(function(m) { return m.amount; }), backgroundColor: managers.map(function(_, i) { return CHART_COLORS[i % CHART_COLORS.length]; }), borderWidth: 2, borderColor: '#fff' }]
    },
    options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'right' }, tooltip: { callbacks: { label: function(ctx) { return ' ' + ctx.label + ': ' + formatAmountFull(ctx.raw); } } } } }
  });
  if (selectedManager !== "전체" && DATA.paytypes[selectedManager]) {
    var paytypeData = DATA.paytypes[selectedManager];
    document.getElementById("chart-manager-title").textContent = selectedManager + " 결제조건별 미수금 비중";
    if (chartPaytypeDonut) chartPaytypeDonut.destroy();
    chartPaytypeDonut = new Chart(document.getElementById("chart-paytype-donut").getContext("2d"), {
      type: 'doughnut',
      data: { labels: paytypeData.map(function(p) { return p.name; }), datasets: [{ data: paytypeData.map(function(p) { return p.amount; }), backgroundColor: paytypeData.map(function(p) { return PAYTYPE_COLORS[p.name] || '#ccc'; }), borderWidth: 2, borderColor: '#fff' }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'right' }, tooltip: { callbacks: { label: function(ctx) { return ' ' + ctx.label + ': ' + formatAmountFull(ctx.raw); } } } } }
    });
    if (chartPaytypeBar) chartPaytypeBar.destroy();
    chartPaytypeBar = new Chart(document.getElementById("chart-paytype-bar").getContext("2d"), {
      type: 'bar',
      data: { labels: paytypeData.map(function(p) { return p.name; }), datasets: [{ data: paytypeData.map(function(p) { return p.amount; }), backgroundColor: paytypeData.map(function(p) { return PAYTYPE_COLORS[p.name] || '#ccc'; }), borderRadius: 6, borderSkipped: false }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(ctx) { return ' ' + formatAmountFull(ctx.raw); } } } }, scales: { x: { grid: { display: false } }, y: { ticks: { callback: function(v) { return formatAmount(v); } } } } }
    });
  }
}

window.addEventListener('DOMContentLoaded', init);
window.addEventListener('resize', alignFundIssueCard);