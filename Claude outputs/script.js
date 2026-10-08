/* RentRewards PMS landing prototype — vanilla JS.
   Every product interface on the page is built here from the demonstration data below.
   All figures are for an EXAMPLE portfolio and reconcile with each other. */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ico = function (n) { return '<svg aria-hidden="true"><use href="#i-' + n + '"/></svg>'; };
  var kes = function (n) { return 'KES ' + Math.round(n).toLocaleString('en-KE'); };
  var num = function (n) { return Math.round(n).toLocaleString('en-KE'); };
  var kfmt = function (n) { return n >= 1e6 ? (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'K' : String(n); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  /* ------------------------------------------------------------------ data */
  var PROPS = [
    { id: 'riv', name: 'Riverside Apartments', landlord: 'Wanjiku Holdings', code: 'A', units: 12, occ: 12, exp: 324000, col: 324000, carried: 0, vacant: [], owing: [] },
    { id: 'gp',  name: 'Green Park Estate',    landlord: 'Mutiso Family Trust', code: 'B', units: 10, occ: 9, exp: 198000, col: 162000, carried: 0, vacant: [7], owing: [2, 5] },
    { id: 'wc',  name: 'Westlands Court',      landlord: 'Karanja & Sons Ltd', code: 'C', units: 8, occ: 8, exp: 272000, col: 272000, carried: 0, vacant: [], owing: [] },
    { id: 'kh',  name: 'Kilimani Heights',     landlord: 'Wanjiku Holdings', code: 'D', units: 10, occ: 8, exp: 224000, col: 194000, carried: 22000, vacant: [4, 9], owing: [6] },
    { id: 'ow',  name: 'Oakwood Residences',   landlord: 'Mutiso Family Trust', code: 'E', units: 8, occ: 7, exp: 122000, col: 98000, carried: 38000, vacant: [8], owing: [3] }
  ];
  PROPS.forEach(function (p) { p.cur = p.exp - p.col; p.arrears = p.cur + p.carried; p.rate = p.col / p.exp; });
  function agg(list) {
    var a = { units: 0, occ: 0, exp: 0, col: 0, cur: 0, carried: 0, arrears: 0 };
    list.forEach(function (p) { ['units', 'occ', 'exp', 'col', 'cur', 'carried', 'arrears'].forEach(function (k) { a[k] += p[k]; }); });
    a.rate = a.col / a.exp; return a;
  }
  var ALL = agg(PROPS);

  var PAYMENTS = [
    { d: '02 Sep 2026', t: 'James Mwangi', p: 'Riverside Apartments', u: 'A12', a: 25000, s: 'Paid', inv: 'September rent' },
    { d: '01 Sep 2026', t: 'Faith Njeri', p: 'Green Park Estate', u: 'B3', a: 18000, s: 'Paid', inv: 'September rent' },
    { d: '31 Aug 2026', t: 'David Otieno', p: 'Westlands Court', u: 'C5', a: 30000, s: 'Paid', inv: 'August rent' },
    { d: '30 Aug 2026', t: 'Grace Wanjiku', p: 'Kilimani Heights', u: 'D2', a: 22000, s: 'Paid', inv: 'August rent' },
    { d: '29 Aug 2026', t: 'Peter Karanja', p: 'Oakwood Residences', u: 'E5', a: 20000, s: 'Pending', inv: 'August rent' },
    { d: '29 Aug 2026', t: 'Esther Achieng', p: 'Riverside Apartments', u: 'A4', a: 27000, s: 'Paid', inv: 'August rent' },
    { d: '28 Aug 2026', t: 'Samuel Kiptoo', p: 'Westlands Court', u: 'C1', a: 34000, s: 'Paid', inv: 'August rent' },
    { d: '28 Aug 2026', t: 'Mercy Wambui', p: 'Green Park Estate', u: 'B4', a: 22000, s: 'Paid', inv: 'August rent' },
    { d: '27 Aug 2026', t: 'Brian Mutua', p: 'Kilimani Heights', u: 'D6', a: 15000, s: 'Partial', inv: 'August rent (KES 28,000 billed)' },
    { d: '26 Aug 2026', t: 'Lucy Chebet', p: 'Oakwood Residences', u: 'E2', a: 17500, s: 'Paid', inv: 'August rent' },
    { d: '25 Aug 2026', t: 'Kevin Omondi', p: 'Riverside Apartments', u: 'A9', a: 28000, s: 'Paid', inv: 'August rent' },
    { d: '25 Aug 2026', t: 'Ann Muthoni', p: 'Westlands Court', u: 'C3', a: 36000, s: 'Paid', inv: 'August rent' },
    { d: '24 Aug 2026', t: 'Unidentified payer (ref “RENT”)', p: '—', u: '', a: 22000, s: 'Unmatched', inv: 'Held in suspense' }
  ];

  var MONTHS = [
    ['Mar', 1092, 1004], ['Apr', 1104, 1036], ['May', 1110, 1023],
    ['Jun', 1126, 1058], ['Jul', 1132, 1042], ['Aug', 1140, 1050]
  ];

  var EXPIRIES = [
    ['30 Sep', 'A12 · Riverside Apartments', 'James Mwangi'],
    ['30 Sep', 'C3 · Westlands Court', 'Ann Muthoni'],
    ['30 Sep', 'D6 · Kilimani Heights', 'Brian Mutua'],
    ['15 Oct', 'B4 · Green Park Estate', 'Mercy Wambui'],
    ['31 Oct', 'E2 · Oakwood Residences', 'Lucy Chebet']
  ];
  var EXP_BUCKETS = [['Sep', 3], ['Oct', 2], ['Nov', 4]];

  var LEASES = [
    { t: 'James Mwangi', u: 'A12 · Riverside', s: '1 Oct 2024', e: '30 Sep 2026', r: 25000, st: 'Expiring', pct: 96 },
    { t: 'Ann Muthoni', u: 'C3 · Westlands', s: '1 Oct 2024', e: '30 Sep 2026', r: 36000, st: 'Expiring', pct: 96 },
    { t: 'Brian Mutua', u: 'D6 · Kilimani', s: '1 Oct 2025', e: '30 Sep 2026', r: 28000, st: 'Expiring', pct: 92 },
    { t: 'Mercy Wambui', u: 'B4 · Green Park', s: '15 Oct 2025', e: '15 Oct 2026', r: 22000, st: 'Expiring', pct: 88 },
    { t: 'Faith Njeri', u: 'B3 · Green Park', s: '1 Mar 2026', e: '28 Feb 2027', r: 18000, st: 'Active', pct: 50 },
    { t: 'David Otieno', u: 'C5 · Westlands', s: '1 Jan 2026', e: '31 Dec 2026', r: 30000, st: 'Active', pct: 67 },
    { t: 'Grace Wanjiku', u: 'D2 · Kilimani', s: '1 Jun 2026', e: '31 May 2027', r: 22000, st: 'Active', pct: 25 },
    { t: 'Peter Karanja', u: 'E5 · Oakwood', s: '1 Feb 2026', e: '31 Jan 2027', r: 20000, st: 'Active', pct: 58 }
  ];

  var TICKETS = [
    { id: 'TKT-0041', c: 'rep', t: 'Kitchen tap leaking', u: 'A7 · Riverside Apartments', cat: 'Plumbing', pr: 'Medium', age: '2 hours ago',
      ev: [['02 Sep 07:48', 'Reported by tenant from the portal']] },
    { id: 'TKT-0042', c: 'rep', t: 'Gate light not working', u: 'Green Park Estate', cat: 'Electrical', pr: 'Low', age: 'Yesterday',
      ev: [['01 Sep 18:20', 'Reported by caretaker']] },
    { id: 'TKT-0038', c: 'asg', t: 'No water on third floor', u: 'Westlands Court', cat: 'Water', pr: 'High', age: '2 days ago',
      ev: [['31 Aug 06:55', 'Reported by tenant from the portal'], ['31 Aug 07:10', 'Acknowledged by property manager'], ['31 Aug 07:32', 'Assigned to Joseph (caretaker)']] },
    { id: 'TKT-0035', c: 'prg', t: 'Cracked bedroom ceiling', u: 'D6 · Kilimani Heights', cat: 'Structural', pr: 'Medium', age: '5 days ago',
      ev: [['28 Aug 09:14', 'Reported by tenant from the portal'], ['28 Aug 10:02', 'Acknowledged'], ['29 Aug 08:30', 'Assigned to contractor'], ['01 Sep 11:45', 'In progress: inspection done, repair booked']] },
    { id: 'TKT-0036', c: 'prg', t: 'Intercom not ringing', u: 'E5 · Oakwood Residences', cat: 'Security', pr: 'Low', age: '4 days ago',
      ev: [['29 Aug 15:05', 'Reported by tenant from the portal'], ['30 Aug 09:00', 'Assigned to Joseph (caretaker)'], ['01 Sep 10:20', 'In progress: replacement unit ordered']] },
    { id: 'TKT-0031', c: 'res', t: 'Broken window latch', u: 'A3 · Riverside Apartments', cat: 'Structural', pr: 'Low', age: 'Closed Aug 28',
      ev: [['24 Aug 12:40', 'Reported by tenant from the portal'], ['25 Aug 09:15', 'Assigned to Joseph (caretaker)'], ['28 Aug 14:00', 'Resolved: latch replaced']] },
    { id: 'TKT-0030', c: 'res', t: 'Wi-Fi outage in common area', u: 'D1 · Kilimani Heights', cat: 'Internet', pr: 'Medium', age: 'Closed Aug 26',
      ev: [['23 Aug 20:10', 'Reported by tenant from the portal'], ['24 Aug 08:00', 'Assigned to provider'], ['26 Aug 16:30', 'Resolved: router replaced']] }
  ];
  var KCOLS = [['rep', 'Reported'], ['asg', 'Assigned'], ['prg', 'In progress'], ['res', 'Resolved']];

  /* ----------------------------------------------------------------- bits */
  function badge(status) {
    var m = {
      Paid: ['b-ok', 'check'], Pending: ['b-warn', 'clock'], Partial: ['b-warn', 'half'],
      Unmatched: ['b-bad', 'alert'], Active: ['b-ok', 'check'], Expiring: ['b-warn', 'clock'], Ended: ['b-mute', 'clock']
    }[status] || ['b-mute', 'clock'];
    return '<span class="badge ' + m[0] + '">' + ico(m[1]) + status + '</span>';
  }

  var tip = $('#tip');
  tip.style.position = 'fixed';
  function showTip(html, x, y) {
    tip.innerHTML = html; tip.classList.add('is-on');
    var w = tip.offsetWidth, h = tip.offsetHeight;
    var left = Math.min(Math.max(8, x + 14), window.innerWidth - w - 8);
    var top = Math.max(8, y - h - 12);
    tip.style.left = left + 'px'; tip.style.top = top + 'px';
  }
  function hideTip() { tip.classList.remove('is-on'); }
  function tipFor(node, html) {
    node.addEventListener('mousemove', function (e) { showTip(html, e.clientX, e.clientY); });
    node.addEventListener('mouseleave', hideTip);
    node.addEventListener('focus', function () { var r = node.getBoundingClientRect(); showTip(html, r.left + r.width / 2, r.top); });
    node.addEventListener('blur', hideTip);
  }

  /* ------------------------------------------------------------ hero panel */
  var weights = [14, 12, 10, 10, 12, 8, 6, 3, 2, 2, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 2, 2, 2, 2];
  var wsum = weights.reduce(function (a, b) { return a + b; }, 0);
  var cum = []; weights.reduce(function (acc, w, i) { acc += w; cum[i] = acc / wsum; return acc; }, 0);

  function lineChart(host, total, expected, name) {
    var W = 360, H = 300, L = 44, R = 10, T = 12, B = 26, iw = W - L - R, ih = H - T - B;
    var max = Math.max(expected * 1.08, 1);
    var x = function (d) { return L + (d - 1) / 30 * iw; };
    var y = function (v) { return T + ih - v / max * ih; };
    var pts = cum.map(function (c, i) { return [x(i + 1), y(c * total)]; });
    var line = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join('');
    var area = line + 'L' + x(31) + ' ' + y(0) + 'L' + x(1) + ' ' + y(0) + 'Z';
    var ticks = [0, .5, 1].map(function (f) {
      var v = max / 1.08 * f; return '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#e5dfd0" stroke-width="1"/><text x="' + (L - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + kfmt(v) + '</text>';
    }).join('');
    var xl = [1, 5, 10, 15, 20, 25, 31].map(function (d) { return '<text x="' + x(d) + '" y="' + (H - 6) + '" text-anchor="middle">' + d + '</text>'; }).join('');
    host.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Cumulative rent collected in August for ' + esc(name) + ': ' + kes(total) + ' of ' + kes(expected) + ' expected">' +
      ticks + xl +
      '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(expected) + '" y2="' + y(expected) + '" stroke="#86919b" stroke-dasharray="4 4"/>' +
      '<text x="' + (W - R) + '" y="' + (y(expected) - 6) + '" text-anchor="end">Expected ' + kfmt(expected) + '</text>' +
      '<line x1="' + x(5) + '" x2="' + x(5) + '" y1="' + T + '" y2="' + (T + ih) + '" stroke="#b9b3a3" stroke-dasharray="2 3"/>' +
      '<text x="' + (x(5) + 5) + '" y="' + (T + 11) + '">Due 5th</text>' +
      '<path d="' + area + '" fill="#0f7a53" fill-opacity=".12"/><path d="' + line + '" fill="none" stroke="#0f7a53" stroke-width="2.2" stroke-linejoin="round"/>' +
      '<circle id="hc-dot" r="4" fill="#0f7a53" stroke="#fff" stroke-width="2" cx="-10" cy="-10"/>' +
      '<rect id="hc-hit" x="' + L + '" y="' + T + '" width="' + iw + '" height="' + ih + '" fill="transparent" tabindex="0" aria-label="Chart area. Use left and right arrow keys to read each day."/></svg>';
    var svg = $('svg', host), hit = $('#hc-hit', host), dot = $('#hc-dot', host);
    function at(d) {
      d = Math.max(1, Math.min(31, d));
      var v = cum[d - 1] * total; dot.setAttribute('cx', x(d)); dot.setAttribute('cy', y(v));
      return '<b>' + d + ' Aug</b>' + kes(v) + ' collected<br>' + Math.round(v / expected * 100) + '% of expected';
    }
    var kb = 5;
    hit.addEventListener('mousemove', function (e) {
      var r = svg.getBoundingClientRect(); var px = (e.clientX - r.left) / r.width * W;
      var d = Math.round((px - L) / iw * 30) + 1; showTip(at(d), e.clientX, e.clientY);
    });
    hit.addEventListener('mouseleave', function () { hideTip(); dot.setAttribute('cx', -10); });
    hit.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') kb = Math.min(31, kb + 1); else if (e.key === 'ArrowLeft') kb = Math.max(1, kb - 1); else return;
      e.preventDefault(); var r = hit.getBoundingClientRect(); showTip(at(kb), r.left + (kb - 1) / 30 * r.width, r.top + 20);
    });
    hit.addEventListener('blur', function () { hideTip(); dot.setAttribute('cx', -10); });
  }

  function heroRender(id) {
    var list = id === 'all' ? PROPS : PROPS.filter(function (p) { return p.id === id; });
    var a = agg(list), name = id === 'all' ? 'all properties' : list[0].name;
    $('#hero-kpis').innerHTML = [
      ['Rent collected', kes(a.col).replace('KES ', 'KES ').replace(/(\d)(?=(,\d{3})+$)/g, '$1'), 'of ' + kes(a.exp).replace('KES ', '') + ' expected', a.col],
      ['Collection rate', Math.round(a.rate * 100) + '%', 'August 2026'],
      ['Occupancy', a.occ + ' / ' + a.units, (a.units - a.occ) + ' vacant'],
      ['Outstanding', kes(a.arrears), kes(a.carried).replace('KES ', '') + ' carried over']
    ].map(function (k, i) {
      var v = i === 0 ? 'KES ' + kfmt(a.col) : i === 3 ? 'KES ' + kfmt(a.arrears) : k[1];
      return '<div class="kpi"><div class="l">' + k[0] + '</div><div class="v">' + v + '</div><div class="s">' + k[2] + '</div></div>';
    }).join('');
    lineChart($('#hero-chart'), a.col, a.exp, name);
    var rows = PAYMENTS.filter(function (p) { return id === 'all' || p.p === list[0].name; }).slice(0, 5);
    $('#hero-tx').innerHTML = rows.map(function (p) {
      return '<li><span class="who">' + esc(p.t) + '</span><span class="amt">' + num(p.a) + '</span><span class="sub">' + esc(p.p) + ' · ' + p.d.slice(0, 6) + '</span><span class="st">' + badge(p.s) + '</span></li>';
    }).join('');
  }
  var heroSel = $('#hero-prop');
  heroSel.innerHTML = '<option value="all">All properties (5)</option>' + PROPS.map(function (p) { return '<option value="' + p.id + '">' + p.name + '</option>'; }).join('');
  heroSel.addEventListener('change', function () { heroRender(heroSel.value); });
  heroRender('all');

  /* ----------------------------------------------------------- proof strip */
  (function () {
    var items = [
      { to: 1.05, dec: 2, pre: 'KES ', suf: 'M', l: 'Rent collected', d: 'of KES 1.14M expected' },
      { to: 92, dec: 0, pre: '', suf: '%', l: 'Collection rate', d: '92.1% before rounding' },
      { to: 44, dec: 0, pre: '', suf: ' / 48', l: 'Occupied units', d: '4 vacant' },
      { to: 150, dec: 0, pre: 'KES ', suf: 'K', l: 'Outstanding', d: 'KES 90K this month + KES 60K carried over' }
    ];
    var host = $('#proof');
    host.innerHTML = items.map(function (it) {
      var final = it.pre + it.to.toFixed(it.dec) + it.suf;
      return '<div class="proof-item"><div class="v" data-to="' + it.to + '" data-dec="' + it.dec + '" data-pre="' + it.pre + '" data-suf="' + it.suf + '" aria-label="' + final + '">' + final + '</div><div class="l">' + it.l + '</div><div class="d">' + it.d + '</div></div>';
    }).join('');
    if (reduce || !('IntersectionObserver' in window)) return;
    var done = false;
    new IntersectionObserver(function (es, ob) {
      if (done || !es[0].isIntersecting) return; done = true; ob.disconnect();
      $$('.v', host).forEach(function (el) {
        var to = +el.dataset.to, dec = +el.dataset.dec, t0 = performance.now(), dur = 900;
        (function tick(t) {
          var p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
          el.textContent = el.dataset.pre + (to * e).toFixed(dec) + el.dataset.suf;
          if (p < 1) requestAnimationFrame(tick);
        })(t0);
      });
    }, { threshold: .4 }).observe(host);
  })();

  /* ------------------------------------------------- payment → settlement */
  var STEPS = [
    ['Tenant pays rent', 'James pays KES 25,000 from the portal or to the paybill with his tenant code.'],
    ['M-PESA payment received', 'The transaction is stored exactly as received before any matching is attempted.'],
    ['Tenant and invoice identified', 'The reference is matched by tenant code, lease, property and unit, or payer phone. If nothing matches, the money is parked, never guessed.'],
    ['Payment reconciled', 'The payment is allocated to the oldest invoice due first and the invoice clears.'],
    ['Receipt generated', 'A numbered receipt is issued and is downloadable by the tenant as a PDF.'],
    ['Tenant ledger updated', 'The tenant’s balance moves from owing to nothing outstanding.'],
    ['Landlord payable calculated', 'Commission is taken at the configured rate and the remainder is added to what the landlord is owed.'],
    ['Tenant rewards recorded', 'Points are calculated from the rules and recorded with the reason, held for 30 days before they can be spent.'],
    ['Accounting and compliance records updated', 'A balanced journal is posted and the payment becomes a rental income record for tax preparation.']
  ];
  var EFFECTS = [
    [1, 'Payment initiated', 'James Mwangi · Unit A12 · Riverside Apartments', 'KES 25,000', ''],
    [2, 'M-PESA confirmation stored', 'Raw transaction kept, duplicates ignored', 'Received', ''],
    [3, 'Matched to tenant and invoice', 'Account reference resolved to the active lease', 'Unit A12', 'INV · September'],
    [4, 'Invoice reconciled', 'Allocated oldest due first', 'Paid', 'Balance 25,000 → 0'],
    [5, 'Receipt issued', 'PDF available to tenant and manager', 'Issued', ''],
    [6, 'Tenant balance', 'Statement line added', 'KES 0', 'Nothing outstanding'],
    [7, 'Landlord payable', 'After commission of KES 250 (example 1%)', '+ KES 24,750', ''],
    [8, 'Reward points', '250 base + 20% for an 11-month streak', '+ 300 pts', 'Pending · 30 days'],
    [9, 'Journal posted', 'Debits equal credits: KES 25,000', 'Balanced', ''],
    [9, 'Rental income record', 'Added to the period for eRITS preparation', '+ KES 25,000', 'Simulated filing']
  ];
  var cur = -1, timer = null;
  var stepsHost = $('#steps'), fill = $('#steps-fill'), effHost = $('#effects');
  stepsHost.setAttribute('role', 'list');
  stepsHost.insertAdjacentHTML('beforeend', STEPS.map(function (s, i) {
    return '<div role="listitem"><button type="button" class="step" data-i="' + i + '" aria-label="Step ' + (i + 1) + ': ' + s[0] + '"><span class="dot">' + String(i + 1).padStart(2, '0') + '</span><span class="t"><b>' + s[0] + '</b><span>' + s[1] + '</span></span></button></div>';
  }).join(''));
  effHost.innerHTML = EFFECTS.map(function (e, i) {
    return '<div class="eff" data-s="' + e[0] + '"><div class="k">' + e[1] + '</div><div class="d">' + e[2] + '</div><div class="vv">' + e[3] + (e[4] ? '<small>' + e[4] + '</small>' : '') + '</div></div>';
  }).join('');

  function setStep(i) {
    cur = i;
    $$('.step', stepsHost).forEach(function (b, k) {
      b.classList.toggle('is-on', k === i); b.classList.toggle('is-done', k < i);
      b.setAttribute('aria-current', k === i ? 'step' : 'false');
    });
    $$('.eff', effHost).forEach(function (e) {
      var s = +e.dataset.s - 1;
      e.classList.toggle('is-in', s <= i); e.classList.toggle('is-new', s === i);
    });
    var b = $$('.step', stepsHost)[Math.max(i, 0)];
    fill.style.height = i < 0 ? '0px' : Math.max(0, b.parentElement.offsetTop + 20 - 20) + 'px';
  }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }
  function play() {
    stop(); setStep(-1);
    if (reduce) { setStep(STEPS.length - 1); return; }
    var i = -1;
    timer = setInterval(function () { i++; setStep(i); if (i >= STEPS.length - 1) stop(); }, 1100);
  }
  stepsHost.addEventListener('click', function (e) { var b = e.target.closest('.step'); if (b) { stop(); setStep(+b.dataset.i); } });
  $('#journey-replay').addEventListener('click', play);
  if ('IntersectionObserver' in window) {
    var started = false;
    new IntersectionObserver(function (es, ob) { if (es[0].isIntersecting && !started) { started = true; ob.disconnect(); play(); } }, { threshold: .35 }).observe($('.journey-grid'));
  } else { setStep(STEPS.length - 1); }
  window.addEventListener('resize', function () { if (cur >= 0) setStep(cur); });

  /* -------------------------------------------------------- product explorer */
  var TABS = [
    ['payments', 'Rent & Payments'], ['properties', 'Properties'], ['leasing', 'Leasing'],
    ['maintenance', 'Maintenance'], ['accounting', 'Accounting'], ['compliance', 'Compliance']
  ];
  var COPY = {
    payments: ['Know exactly who has paid.', 'M-PESA payments are matched to the right tenant and invoice automatically, receipts are issued, and anything that cannot be matched waits in a queue instead of landing on the wrong account.',
      ['M-PESA collection with automatic tenant matching', 'Allocation to invoices, oldest due first', 'Digital receipts for every payment', 'Arrears tracked across the portfolio', 'Landlord settlements calculated from confirmed payments'],
      'Prototype: runs end to end against simulated M-PESA payloads. Live connection needs Safaricom credentials.'],
    properties: ['Every building, every unit.', 'See each property’s landlord, occupancy and collections, then open it to see which units are paid, owing or vacant.',
      ['Landlord, property and unit in one chain', 'Occupancy worked out from leases, never typed in', 'Collections and arrears by property', 'Bulk upload of units from a spreadsheet'], ''],
    leasing: ['Know what ends, and when.', 'Every lease with its term, rent and status. Leases nearing their end are flagged so renewals can be planned well ahead.',
      ['Lease terms, rent and billing day', 'Expiring leases flagged ahead of time', 'Move-in and move-out recorded against the unit', 'Rent invoices raised from the lease'], ''],
    maintenance: ['Repairs, from report to resolved.', 'Tenants report issues from their portal and the ticket lands on the staff board with the property and unit already filled in. Every status change is kept on the thread.',
      ['Tenant reporting from the portal', 'Board by status: reported, assigned, in progress, resolved', 'Priority, category and assignee', 'A full update thread per ticket'], ''],
    accounting: ['Books that balance themselves.', 'A payment never just flips a “paid” flag. It posts balanced double-entry lines that are never edited; a correction is a reversing entry.',
      ['Balanced journals for every payment', 'Unmatched cash held in suspense so the ledger still balances', 'Commission and landlord payable posted alongside', 'A trial balance that always ties out'], 'Account names are an example chart of accounts.'],
    compliance: ['Fix the gaps before you file.', 'RentRewards flags what would hold a return back, such as a missing KRA PIN or an unmatched payment, and keeps a history of every period.',
      ['Monthly rental income periods', 'Compliance exceptions queue', 'Submission preparation', 'Audit history of changes'], 'Prototype: submissions are simulated and stamped as such. Nothing is sent to KRA.']
  };
  var xpState = { page: 0, q: '', st: 'All', pr: 'All', sel: null, prop: 'gp', lease: 'All', ticket: 'TKT-0035', acct: 'matched', ex: [false, false], prepared: false };

  function panelShell(key, ui) {
    var c = COPY[key];
    return '<div class="tabpanel"><div class="copy"><h3 class="h3">' + c[0] + '</h3><p>' + c[1] + '</p><ul>' + c[2].map(function (b) { return '<li>' + b + '</li>'; }).join('') + '</ul>' + (c[3] ? '<p class="status-note muted">' + c[3] + '</p>' : '') + '</div><div class="ui">' + ui + '</div></div>';
  }
  function uiBar(title, extra) { return '<div class="ui-bar"><div class="ui-title"><span class="mk">' + ico('mark') + '</span>' + title + '</div><div>' + (extra || '<span class="demo-tag">Demonstration data</span>') + '</div></div>'; }

  /* Rent & Payments */
  var PAGE = 5;
  function paymentsUI() {
    var rows = PAYMENTS.filter(function (p) {
      var q = xpState.q.toLowerCase();
      return (xpState.st === 'All' || p.s === xpState.st) && (xpState.pr === 'All' || p.p === xpState.pr) && (!q || (p.t + ' ' + p.p + ' ' + p.u).toLowerCase().indexOf(q) > -1);
    });
    var pages = Math.max(1, Math.ceil(rows.length / PAGE));
    xpState.page = Math.min(xpState.page, pages - 1);
    var view = rows.slice(xpState.page * PAGE, xpState.page * PAGE + PAGE);
    var sel = xpState.sel && PAYMENTS[xpState.sel.i] ? PAYMENTS[xpState.sel.i] : null;
    var detail = '';
    if (sel) {
      detail = '<div class="thread" style="margin-top:12px"><h5>Payment detail · ' + esc(sel.t) + '</h5><ul>' +
        '<li><time>Amount</time><span>' + kes(sel.a) + ' · M-PESA</span></li>' +
        '<li><time>Applied to</time><span>' + esc(sel.inv) + '</span></li>' +
        '<li><time>Status</time><span>' + (sel.s === 'Paid' ? 'Reconciled, receipt issued, tenant ledger updated.' : sel.s === 'Pending' ? 'Received and awaiting confirmation. It will reconcile once confirmed.' : sel.s === 'Partial' ? 'KES 13,000 still owing on the invoice; the tenant sees the balance and can pay the rest from the portal.' : 'The reference “RENT” matched no tenant. The cash is held in suspense and an exception is raised for an accountant to match by hand.') + '</span></li></ul></div>';
    }
    var props = ['All'].concat(PROPS.map(function (p) { return p.name; }));
    return uiBar('Payments') + '<div class="ui-body">' +
      '<div class="toolbar"><div class="grow"><label class="sr" for="px-q">Search payments</label><input id="px-q" type="search" placeholder="Search tenant, property or unit" value="' + esc(xpState.q) + '"></div>' +
      '<label class="sr" for="px-st">Status</label><select id="px-st">' + ['All', 'Paid', 'Pending', 'Partial', 'Unmatched'].map(function (s) { return '<option' + (s === xpState.st ? ' selected' : '') + ' value="' + s + '">' + (s === 'All' ? 'All statuses' : s) + '</option>'; }).join('') + '</select>' +
      '<label class="sr" for="px-pr">Property</label><select id="px-pr">' + props.map(function (s) { return '<option' + (s === xpState.pr ? ' selected' : '') + ' value="' + esc(s) + '">' + (s === 'All' ? 'All properties' : s) + '</option>'; }).join('') + '</select></div>' +
      '<div class="table-wrap"><table class="t"><caption class="sr">Recent rent payments</caption><thead><tr><th scope="col">Date</th><th scope="col">Tenant</th><th scope="col">Property</th><th scope="col" class="r">Amount</th><th scope="col">Status</th></tr></thead><tbody>' +
      (view.length ? view.map(function (p) { var i = PAYMENTS.indexOf(p); return '<tr data-row="' + i + '" tabindex="0" class="' + (xpState.sel && xpState.sel.i === i ? 'is-sel' : '') + '"><td>' + p.d + '</td><td>' + esc(p.t) + '</td><td>' + esc(p.p) + '</td><td class="r n">' + kes(p.a) + '</td><td>' + badge(p.s) + '</td></tr>'; }).join('') : '<tr><td colspan="5" class="empty">No payments match these filters.</td></tr>') +
      '</tbody></table></div>' +
      '<div class="pager"><span>' + (rows.length ? (xpState.page * PAGE + 1) + '–' + Math.min(rows.length, xpState.page * PAGE + PAGE) + ' of ' + rows.length : '0 payments') + ' · select a row for detail</span><span class="btns"><button class="ui-btn" id="px-prev"' + (xpState.page === 0 ? ' disabled' : '') + '>Previous</button><button class="ui-btn" id="px-next"' + (xpState.page >= pages - 1 ? ' disabled' : '') + '>Next</button></span></div>' + detail + '</div>';
  }
  function bindPayments(panel) {
    var redraw = function (keepFocus) { var ui = $('.ui', panel); ui.innerHTML = paymentsUI(); bindPayments(panel); if (keepFocus) { var f = $(keepFocus, panel); if (f) { f.focus(); try { var l = f.value.length; f.setSelectionRange(l, l); } catch (e) {} } } };
    var q = $('#px-q', panel); q.addEventListener('input', function () { xpState.q = q.value; xpState.page = 0; redraw('#px-q'); });
    $('#px-st', panel).addEventListener('change', function (e) { xpState.st = e.target.value; xpState.page = 0; redraw('#px-st'); });
    $('#px-pr', panel).addEventListener('change', function (e) { xpState.pr = e.target.value; xpState.page = 0; redraw('#px-pr'); });
    $('#px-prev', panel).addEventListener('click', function () { xpState.page--; redraw('#px-next'); });
    $('#px-next', panel).addEventListener('click', function () { xpState.page++; redraw('#px-prev'); });
    $$('[data-row]', panel).forEach(function (r) {
      var go = function () { xpState.sel = { i: +r.dataset.row }; redraw(); };
      r.addEventListener('click', go); r.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  }

  /* Properties */
  function propertiesUI() {
    var sel = PROPS.filter(function (p) { return p.id === xpState.prop; })[0];
    var tiles = '';
    for (var n = 1; n <= sel.units; n++) {
      var state = sel.vacant.indexOf(n) > -1 ? 'v' : sel.owing.indexOf(n) > -1 ? 'w' : 'o';
      tiles += '<div class="unit ' + state + '"><b>' + sel.code + n + '</b>' + (state === 'v' ? 'Vacant' : state === 'w' ? 'Owing' : 'Paid') + '</div>';
    }
    return uiBar('Properties') + '<div class="ui-body"><div class="table-wrap"><table class="t"><caption class="sr">Properties</caption><thead><tr><th scope="col">Property</th><th scope="col">Landlord</th><th scope="col">Occupancy</th><th scope="col" class="r">Collected</th><th scope="col" class="r">Rate</th></tr></thead><tbody>' +
      PROPS.map(function (p) { return '<tr data-prop="' + p.id + '" tabindex="0" class="' + (p.id === xpState.prop ? 'is-sel' : '') + '"><td><b style="color:var(--ink)">' + p.name + '</b></td><td>' + p.landlord + '</td><td><span class="occ"><span class="bar" aria-hidden="true"><i style="width:' + Math.round(p.occ / p.units * 100) + '%"></i></span>' + p.occ + '/' + p.units + '</span></td><td class="r n">' + kes(p.col) + '</td><td class="r n">' + Math.round(p.rate * 100) + '%</td></tr>'; }).join('') +
      '</tbody></table></div><div class="panel-title" style="margin-top:16px">' + sel.name + ' · units <span>' + sel.occ + ' occupied · ' + (sel.units - sel.occ) + ' vacant · ' + sel.owing.length + ' owing</span></div><div class="unitgrid">' + tiles + '</div>' +
      '<div class="legend"><span><i style="background:var(--ok-bg);border-color:#b8dfca"></i>Paid</span><span><i style="background:var(--warn-bg);border-color:#ecc98a"></i>Owing</span><span><i style="border-style:dashed"></i>Vacant</span></div></div>';
  }
  function bindProperties(panel) {
    $$('[data-prop]', panel).forEach(function (r) {
      var go = function () { xpState.prop = r.dataset.prop; $('.ui', panel).innerHTML = propertiesUI(); bindProperties(panel); $('[data-prop="' + xpState.prop + '"]', panel).focus(); };
      r.addEventListener('click', go); r.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  }

  /* Leasing */
  function leasingUI() {
    var rows = LEASES.filter(function (l) { return xpState.lease === 'All' || l.st === xpState.lease; });
    return uiBar('Leases') + '<div class="ui-body"><div class="toolbar"><div class="chips" role="group" aria-label="Filter leases">' + ['All', 'Active', 'Expiring'].map(function (s) { return '<button class="chip" type="button" data-lf="' + s + '" aria-pressed="' + (xpState.lease === s) + '">' + s + (s === 'Expiring' ? ' (4)' : '') + '</button>'; }).join('') + '</div></div>' +
      '<div class="table-wrap"><table class="t"><caption class="sr">Leases</caption><thead><tr><th scope="col">Tenant</th><th scope="col">Unit</th><th scope="col">Term</th><th scope="col" class="r">Rent</th><th scope="col">Status</th></tr></thead><tbody>' +
      rows.map(function (l) { return '<tr><td>' + l.t + '</td><td>' + l.u + '</td><td><div>' + l.s + ' – ' + l.e + '</div><div class="bar" style="margin-top:4px" aria-hidden="true"><i style="width:' + l.pct + '%;' + (l.st === 'Expiring' ? 'background:#c58a1b' : '') + '"></i></div></td><td class="r n">' + kes(l.r) + '</td><td>' + badge(l.st) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<p class="xs muted" style="margin-top:10px">Expiring means the lease ends within 90 days of 2 Sep 2026. Nine leases fall in that window across the portfolio; four are shown here.</p></div>';
  }
  function bindLeasing(panel) {
    $$('[data-lf]', panel).forEach(function (b) { b.addEventListener('click', function () { xpState.lease = b.dataset.lf; $('.ui', panel).innerHTML = leasingUI(); bindLeasing(panel); $('[data-lf="' + xpState.lease + '"]', panel).focus(); }); });
  }

  /* Maintenance */
  function maintenanceUI() {
    var t = TICKETS.filter(function (x) { return x.id === xpState.ticket; })[0];
    return uiBar('Maintenance board') + '<div class="ui-body"><div class="kanban">' + KCOLS.map(function (c) {
      var items = TICKETS.filter(function (x) { return x.c === c[0]; });
      return '<div class="kcol"><h4>' + c[1] + '<span>' + items.length + '</span></h4>' + items.map(function (x) {
        return '<button type="button" class="kcard" data-t="' + x.id + '" aria-pressed="' + (x.id === xpState.ticket) + '"><span class="id">' + x.id + ' · ' + x.cat + '</span><b>' + x.t + '</b><span class="m">' + x.u + '<br>' + x.pr + ' priority · ' + x.age + '</span></button>';
      }).join('') + '</div>';
    }).join('') + '</div>' +
      '<div class="thread"><h5>' + t.id + ' · ' + t.t + '</h5><ul>' + t.ev.map(function (e) { return '<li><time>' + e[0] + '</time><span>' + e[1] + '</span></li>'; }).join('') + '</ul></div></div>';
  }
  function bindMaintenance(panel) {
    $$('[data-t]', panel).forEach(function (b) { b.addEventListener('click', function () { xpState.ticket = b.dataset.t; $('.ui', panel).innerHTML = maintenanceUI(); bindMaintenance(panel); $('[data-t="' + xpState.ticket + '"]', panel).focus(); }); });
  }

  /* Accounting */
  function journal(title, tag, lines) {
    var dr = 0, cr = 0;
    var body = lines.map(function (l) { if (l[0] === 'Dr') dr += l[2]; else cr += l[2]; return '<tr class="' + (l[0] === 'Cr' ? 'cr' : '') + '"><td>' + l[0] + ' · ' + l[1] + '</td><td class="n">' + (l[0] === 'Dr' ? num(l[2]) : '') + '</td><td class="n">' + (l[0] === 'Cr' ? num(l[2]) : '') + '</td></tr>'; }).join('');
    return '<div class="journal"><header><span>' + title + '</span><span class="badge ' + (dr === cr ? 'b-ok' : 'b-bad') + '">' + ico('check') + (dr === cr ? 'Balanced' : 'Unbalanced') + '</span></header><table><thead class="sr"><tr><th>Account</th><th>Debit</th><th>Credit</th></tr></thead><tbody>' + body + '</tbody><tfoot><tr><td>' + tag + '</td><td class="n">' + num(dr) + '</td><td class="n">' + num(cr) + '</td></tr></tfoot></table></div>';
  }
  function accountingUI() {
    var k = xpState.acct, html = '';
    if (k === 'matched') {
      html = journal('Rent received · James Mwangi · A12', 'Totals (KES)', [['Dr', 'Cash: M-PESA collection', 25000], ['Cr', 'Tenant receivable: rent', 25000]]) +
        journal('Commission and landlord payable', 'Totals (KES)', [['Dr', 'Landlord rent clearing', 25000], ['Cr', 'Landlord payable: Wanjiku Holdings', 24750], ['Cr', 'Commission income', 250]]);
    } else if (k === 'unmatched') {
      html = journal('Unmatched receipt · reference “RENT”', 'Totals (KES)', [['Dr', 'Cash: M-PESA collection', 22000], ['Cr', 'Suspense: unmatched receipts', 22000]]) +
        '<p class="small muted" style="margin-bottom:8px">The money is not guessed onto a tenant. An exception is raised and the payment waits in the unmatched queue.</p>';
    } else {
      html = journal('Accountant matches it to Brian Mutua · D6', 'Totals (KES)', [['Dr', 'Suspense: unmatched receipts', 22000], ['Cr', 'Tenant receivable: rent', 22000]]) +
        '<p class="small muted" style="margin-bottom:8px">Reconciling by hand clears the suspense balance, and the payment then follows the normal path: receipt, ledger, landlord payable.</p>';
    }
    return uiBar('Ledger', '<span class="demo-tag">Example accounts</span>') + '<div class="ui-body"><div class="toolbar"><div class="seg" role="group" aria-label="Choose a scenario">' +
      [['matched', 'Matched payment'], ['unmatched', 'Unmatched payment'], ['resolved', 'Resolved by hand']].map(function (s) { return '<button type="button" data-a="' + s[0] + '" aria-pressed="' + (xpState.acct === s[0]) + '">' + s[1] + '</button>'; }).join('') + '</div></div>' + html + '</div>';
  }
  function bindAccounting(panel) {
    $$('[data-a]', panel).forEach(function (b) { b.addEventListener('click', function () { xpState.acct = b.dataset.a; $('.ui', panel).innerHTML = accountingUI(); bindAccounting(panel); $('[data-a="' + xpState.acct + '"]', panel).focus(); }); });
  }

  /* Compliance (explorer: periods + exceptions) */
  function complianceUI() {
    return uiBar('eRITS · periods and exceptions') + '<div class="ui-body"><div class="banner">' + ico('alert') + '<span><b>Prototype.</b> Submissions are simulated and stamped as such. Nothing is sent to KRA.</span></div>' +
      '<div class="table-wrap"><table class="t"><caption class="sr">Monthly periods</caption><thead><tr><th scope="col">Period</th><th scope="col" class="r">Rental income</th><th scope="col">Status</th></tr></thead><tbody>' +
      '<tr><td>August 2026</td><td class="r n">' + kes(1050000) + '</td><td><span class="badge b-warn">' + ico('alert') + 'Draft · 2 exceptions</span></td></tr>' +
      '<tr><td>July 2026</td><td class="r n">' + kes(1042000) + '</td><td><span class="badge b-ok">' + ico('check') + 'Prepared</span></td></tr>' +
      '<tr><td>June 2026</td><td class="r n">' + kes(1058000) + '</td><td><span class="badge b-info">' + ico('check') + 'Simulated submission</span></td></tr></tbody></table></div>' +
      '<div class="panel-title" style="margin-top:16px">Exceptions to clear <span>August 2026</span></div><ul class="list-rows">' +
      '<li><div><b style="color:var(--ink)">KRA PIN missing</b><div class="sub">Karanja &amp; Sons Ltd · Westlands Court</div></div><span class="badge b-bad">' + ico('alert') + 'Blocks return</span></li>' +
      '<li><div><b style="color:var(--ink)">Unmatched payment</b><div class="sub">KES 22,000 · 24 Aug · held in suspense</div></div><span class="badge b-warn">' + ico('clock') + 'Needs matching</span></li></ul>' +
      '<div class="panel-title" style="margin-top:16px">Audit history <span>latest first</span></div><ul class="list-rows"><li><span>July 2026 period prepared</span><span class="sub">3 Aug · accounts</span></li><li><span>Landlord tax profile updated</span><span class="sub">29 Jul · manager</span></li></ul></div>';
  }

  var RENDER = {
    payments: [paymentsUI, bindPayments], properties: [propertiesUI, bindProperties], leasing: [leasingUI, bindLeasing],
    maintenance: [maintenanceUI, bindMaintenance], accounting: [accountingUI, bindAccounting], compliance: [complianceUI, function () {}]
  };
  var tabsEl = $('#tabs'), panelEl = $('#tabpanel'), activeTab = 'payments';
  tabsEl.innerHTML = TABS.map(function (t) { return '<button role="tab" class="tab" id="tab-' + t[0] + '" data-tab="' + t[0] + '" aria-selected="false" aria-controls="tabpanel" tabindex="-1">' + t[1] + '</button>'; }).join('');
  function selectTab(key, focus) {
    activeTab = key;
    $$('.tab', tabsEl).forEach(function (b) { var on = b.dataset.tab === key; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
    panelEl.setAttribute('aria-labelledby', 'tab-' + key);
    panelEl.innerHTML = panelShell(key, RENDER[key][0]());
    RENDER[key][1](panelEl);
    var on = $('.tab[aria-selected="true"]', tabsEl);
    if (on && tabsEl.scrollWidth > tabsEl.clientWidth) tabsEl.scrollTo({ left: on.offsetLeft - 20, behavior: reduce ? 'auto' : 'smooth' });
  }
  tabsEl.addEventListener('click', function (e) { var b = e.target.closest('.tab'); if (b) selectTab(b.dataset.tab); });
  tabsEl.addEventListener('keydown', function (e) {
    var keys = TABS.map(function (t) { return t[0]; }), i = keys.indexOf(activeTab);
    if (e.key === 'ArrowRight') i = (i + 1) % keys.length; else if (e.key === 'ArrowLeft') i = (i - 1 + keys.length) % keys.length;
    else if (e.key === 'Home') i = 0; else if (e.key === 'End') i = keys.length - 1; else return;
    e.preventDefault(); selectTab(keys[i], true);
  });
  selectTab('payments');

  /* --------------------------------------------------- portfolio intelligence */
  (function () {
    var maint = 38500, commission = Math.round(ALL.col * 0.01), payable = ALL.col - commission - maint;
    var tiles = [
      ['Expected rent', 'KES ' + kfmt(ALL.exp), 'August 2026'], ['Collected rent', 'KES ' + kfmt(ALL.col), 'KES 1,050,000'],
      ['Collection rate', (ALL.rate * 100).toFixed(1) + '%', 'of expected'], ['Occupancy', (ALL.occ / ALL.units * 100).toFixed(1) + '%', ALL.occ + ' of ' + ALL.units + ' units'],
      ['Arrears', 'KES ' + kfmt(ALL.arrears), 'KES 90K this month, 60K carried'], ['Maintenance costs', 'KES 38.5K', '4 tickets closed in August'],
      ['Landlord payable', 'KES ' + (payable / 1e6).toFixed(2) + 'M', 'after 1% commission and costs'], ['Lease expiries', '9', 'in the next 90 days']
    ];
    $('#tiles').innerHTML = tiles.map(function (t) { return '<div class="tile"><div class="l">' + t[0] + '</div><div class="v">' + t[1] + '</div><div class="s">' + t[2] + '</div></div>'; }).join('');

    /* monthly grouped bars */
    var W = 560, H = 230, L = 40, R = 8, T = 10, B = 26, iw = W - L - R, ih = H - T - B, max = 1200;
    var y = function (v) { return T + ih - v / max * ih; }, g = iw / MONTHS.length, bw = Math.min(26, g / 3);
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Expected versus collected rent by month, March to August 2026">';
    [0, 400, 800, 1200].forEach(function (v) { s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#1b3144"/><text x="' + (L - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + '</text>'; });
    MONTHS.forEach(function (m, i) {
      var cx = L + g * i + g / 2, rate = (m[2] / m[1] * 100).toFixed(1);
      s += '<g class="mb" tabindex="0" data-i="' + i + '" role="img" aria-label="' + m[0] + ': expected ' + m[1] + 'K, collected ' + m[2] + 'K, ' + rate + ' percent"><rect x="' + (cx - g / 2) + '" y="' + T + '" width="' + g + '" height="' + ih + '" fill="transparent"/>' +
        '<rect x="' + (cx - bw - 2) + '" y="' + y(m[1]) + '" width="' + bw + '" height="' + (y(0) - y(m[1])) + '" rx="2" fill="#3a566c"/>' +
        '<rect x="' + (cx + 2) + '" y="' + y(m[2]) + '" width="' + bw + '" height="' + (y(0) - y(m[2])) + '" rx="2" fill="#4cc38a"/></g><text x="' + cx + '" y="' + (H - 7) + '" text-anchor="middle">' + m[0] + '</text>';
    });
    $('#ch-monthly').innerHTML = s + '</svg>';
    $$('#ch-monthly .mb').forEach(function (n) { var m = MONTHS[+n.dataset.i]; tipFor(n, '<b>' + m[0] + ' 2026</b>Expected KES ' + num(m[1] * 1000) + '<br>Collected KES ' + num(m[2] * 1000) + '<br>' + (m[2] / m[1] * 100).toFixed(1) + '% collected'); });

    /* occupancy + arrears */
    $('#ch-occ').innerHTML = PROPS.map(function (p) { return '<div class="hbar"><span class="nm">' + p.name + '</span><span class="trk" role="img" aria-label="' + p.name + ' ' + p.occ + ' of ' + p.units + ' occupied"><i style="width:' + (p.occ / p.units * 100) + '%;background:#4cc38a"></i></span><span class="vl">' + p.occ + '/' + p.units + '</span></div>'; }).join('');
    var amax = 70000;
    $('#ch-arrears').innerHTML = PROPS.slice().sort(function (a, b) { return b.arrears - a.arrears; }).map(function (p) {
      return '<div class="hbar"><span class="nm">' + p.name + '</span><span class="trk" role="img" aria-label="' + p.name + ' arrears ' + num(p.arrears) + ' shillings: ' + num(p.cur) + ' this month, ' + num(p.carried) + ' carried over"><i style="width:' + (p.cur / amax * 100) + '%;background:#e0a23a"></i><i style="width:' + (p.carried / amax * 100) + '%;background:#c8553d"></i></span><span class="vl">' + (p.arrears ? Math.round(p.arrears / 1000) + 'K' : '–') + '</span></div>';
    }).join('');

    /* expiries */
    var EW = 520, EH = 120, eb = 44, ex = '<svg viewBox="0 0 ' + EW + ' ' + EH + '" role="img" aria-label="Lease expiries: September 3, October 2, November 4">';
    var gap = (EW - 40) / EXP_BUCKETS.length;
    EXP_BUCKETS.forEach(function (b, i) {
      var h = b[1] / 5 * 70, cx = 20 + gap * i + gap / 2;
      ex += '<g class="eb" tabindex="0" data-i="' + i + '"><rect x="' + (cx - eb / 2) + '" y="' + (86 - h) + '" width="' + eb + '" height="' + h + '" rx="3" fill="#4cc38a" fill-opacity=".85"/><text x="' + cx + '" y="' + (80 - h) + '" text-anchor="middle" style="fill:#fff;font-weight:600">' + b[1] + '</text><text x="' + cx + '" y="108" text-anchor="middle">' + b[0] + '</text></g>';
    });
    $('#ch-exp').innerHTML = ex + '</svg>';
    $$('#ch-exp .eb').forEach(function (n) { var b = EXP_BUCKETS[+n.dataset.i]; tipFor(n, '<b>' + b[0] + ' 2026</b>' + b[1] + ' leases end'); });
    $('#expiry-list').innerHTML = EXPIRIES.map(function (e) { return '<li><time>' + e[0] + '</time><span>' + e[1] + '</span><span class="sub">' + e[2] + '</span></li>'; }).join('') + '<li><time>+4</time><span class="sub">more in October and November</span><span></span></li>';
  })();

  /* ------------------------------------------------------------- lifecycle */
  var STAGES = [
    ['Move In', 'The tenancy starts cleanly.', ['The tenant and lease are recorded against the unit and the move-in is completed.', 'The unit becomes occupied automatically, because occupancy follows the lease.', 'The tenant is invited to the portal with a one-time link.'], 'Property manager, then tenant',
      '<div class="ui"><div class="ui-body"><ul class="list-rows"><li><span>Lease created</span><span class="badge b-ok">' + ico('check') + 'Done</span></li><li><span>Move-in completed</span><span class="badge b-ok">' + ico('check') + 'Done</span></li><li><span>Portal invitation sent</span><span class="badge b-warn">' + ico('clock') + 'Pending</span></li></ul></div></div>'],
    ['Rent Due', 'Rent is billed without chasing.', ['Rent invoices are raised from the lease and any shared charges.', 'The tenant sees what is due, when, and the account number that matches their payment to their tenancy.', 'Overdue amounts roll into arrears across the portfolio.'], 'Property manager and tenant',
      '<div class="ui"><div class="ui-body"><div class="panel-title">Invoice · October rent <span>due 5 Oct</span></div><ul class="list-rows"><li><span>Monthly rent</span><b class="num">KES 25,000</b></li><li><span>Pay with account number</span><b>TNT-…</b></li></ul></div></div>'],
    ['Payment', 'Money arrives and finds its owner.', ['M-PESA payments are matched to the tenant and invoice automatically.', 'Allocation is oldest due first, so arrears clear before current rent.', 'Anything unmatched waits in a queue for an accountant, never guessed onto an account.'], 'Everyone sees the same ledger',
      '<div class="ui"><div class="ui-body"><ul class="list-rows"><li><span>Reference “A12”</span><span class="badge b-ok">' + ico('check') + 'Matched to James Mwangi</span></li><li><span>Reference “RENT”</span><span class="badge b-bad">' + ico('alert') + 'Unmatched, held</span></li></ul></div></div>'],
    ['Receipt', 'Proof of payment, instantly.', ['A numbered receipt is issued for every confirmed payment.', 'Tenants download receipts, statements and their rental record as PDFs.', 'The tenant ledger updates in the same step.'], 'Tenant and property manager',
      '<div class="ui"><div class="ui-body"><div class="panel-title">Receipt <span>PDF</span></div><ul class="list-rows"><li><span>Amount received</span><b class="num">KES 25,000</b></li><li><span>Applied to</span><span>September rent</span></li><li><span>Balance after</span><b class="num">KES 0</b></li></ul></div></div>'],
    ['Rewards', 'Paying on time is recognised.', ['One point for every KES 100 of rent, at the full rate when paid on time.', 'A streak of on-time months adds a bonus, and lateness reduces the award.', 'Points are held 30 days before they can be spent, and every award shows its reason. Redemption is coming soon.'], 'Tenant',
      '<div class="ui"><div class="ui-body"><div class="panel-title">September rent <span>pending 30 days</span></div><ul class="list-rows"><li><span>250 base, paid on time</span><b class="num">× 1.00</b></li><li><span>11-month streak</span><b class="num">+ 20%</b></li><li><span>Points awarded</span><b class="num">300</b></li></ul></div></div>'],
    ['Maintenance', 'Repairs are reported and followed.', ['The tenant reports an issue from the portal; the property and unit come from their lease.', 'It appears on the staff board and moves through assigned, in progress and resolved.', 'Every update is kept on the ticket thread, visible to the tenant.'], 'Tenant, caretaker, manager',
      '<div class="ui"><div class="ui-body"><ul class="list-rows"><li><span>Reported · kitchen tap</span><span class="badge b-warn">' + ico('clock') + 'Reported</span></li><li><span>Assigned to caretaker</span><span class="badge b-info">' + ico('check') + 'Assigned</span></li><li><span>Tap replaced</span><span class="badge b-ok">' + ico('check') + 'Resolved</span></li></ul></div></div>'],
    ['Renewal', 'Expiries are seen coming.', ['Leases nearing their end are flagged as expiring.', 'Upcoming expiries are listed on the dashboard by month, so renewals can be planned early.', 'The tenant’s payment record is there to inform the conversation.'], 'Property manager and landlord',
      '<div class="ui"><div class="ui-body"><ul class="list-rows"><li><span>A12 · James Mwangi</span><span class="badge b-warn">' + ico('clock') + 'Expires 30 Sep</span></li><li><span>B4 · Mercy Wambui</span><span class="badge b-warn">' + ico('clock') + 'Expires 15 Oct</span></li></ul></div></div>'],
    ['Move Out', 'The tenancy closes cleanly.', ['The move-out is recorded against the lease.', 'The final balance is visible before the unit is released.', 'The unit returns to available, and the tenant keeps their statements and rental record.'], 'Property manager and tenant',
      '<div class="ui"><div class="ui-body"><ul class="list-rows"><li><span>Move-out recorded</span><span class="badge b-ok">' + ico('check') + 'Done</span></li><li><span>Final balance</span><b class="num">KES 0</b></li><li><span>Unit A12</span><span class="badge b-mute">' + ico('clock') + 'Available</span></li></ul></div></div>']
  ];
  var stagesEl = $('#stages'), stagePanel = $('#stage-panel'), stage = 0;
  stagesEl.innerHTML = STAGES.map(function (s, i) { return '<button class="stage" role="tab" id="stg-' + i + '" data-i="' + i + '" aria-selected="false" aria-controls="stage-panel" tabindex="-1"><span class="d">' + (i + 1) + '</span><span class="n">' + s[0] + '</span></button>'; }).join('');
  function setStage(i, focus) {
    stage = i;
    $$('.stage', stagesEl).forEach(function (b, k) { var on = k === i; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; b.classList.toggle('is-on', on); b.classList.toggle('is-past', k < i); if (on && focus) b.focus(); });
    var s = STAGES[i];
    stagePanel.setAttribute('aria-labelledby', 'stg-' + i);
    stagePanel.innerHTML = '<div class="stage-panel"><div><p class="eyebrow">Stage ' + (i + 1) + ' of 8</p><h3 class="h3" style="margin:12px 0 0">' + s[0] + '</h3><p class="lead" style="margin-top:8px;font-size:1.125rem">' + s[1] + '</p></div><div><ul class="acts">' + s[2].map(function (a) { return '<li>' + a + '</li>'; }).join('') + '</ul><p class="who"><b>Who sees it:</b> ' + s[3] + '</p><div style="margin-top:20px;max-width:420px">' + s[4] + '</div></div></div>';
  }
  stagesEl.addEventListener('click', function (e) { var b = e.target.closest('.stage'); if (b) setStage(+b.dataset.i); });
  stagesEl.addEventListener('keydown', function (e) {
    var n = STAGES.length, i = stage;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') i = (i + 1) % n; else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') i = (i - 1 + n) % n; else if (e.key === 'Home') i = 0; else if (e.key === 'End') i = n - 1; else return;
    e.preventDefault(); setStage(i, true);
  });
  setStage(0);

  /* ------------------------------------------------------- tenant phone UI */
  var FACTORS = [['Paid on time', 30.3, 45, '14 of 23 months by the due date, 3 more within 5 days'], ['How late, when late', 18.2, 20, '2.7 days past due on average'], ['Nothing outstanding', 20, 20, 'Nothing owing'], ['Unbroken run', 9.2, 10, '11 months in a row without a late payment'], ['Length of tenancy', 5, 5, '24 months on record']];
  var phoneTab = 'home';
  function ring(score) {
    var r = 32, c = 2 * Math.PI * r;
    return '<svg class="ring" viewBox="0 0 80 80" role="img" aria-label="Rental Profile Score ' + score + ' out of 100"><circle cx="40" cy="40" r="' + r + '" fill="none" stroke="#ece7da" stroke-width="8"/><circle cx="40" cy="40" r="' + r + '" fill="none" stroke="#0f7a53" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + (c * score / 100).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 40 40)"/><text x="40" y="45" text-anchor="middle" font-size="20" font-weight="700" fill="#0e212f">' + score + '</text></svg>';
  }
  function phoneBody() {
    if (phoneTab === 'profile') {
      return '<div class="p-card"><div class="lbl">Rental Profile Score</div><div class="score">' + ring(83) + '<div><b>Good</b><span>83 out of 100</span></div></div><div class="stats3"><div><b>11</b><span>on-time payments in a row</span></div><div><b>None</b><span>current arrears</span></div><div><b>24 mo</b><span>verified rental history</span></div></div></div>' +
        '<div class="p-card"><div class="lbl">How the score is built</div>' + FACTORS.map(function (f) { return '<div class="factor"><div class="r">' + f[0] + '<span>' + f[1] + ' / ' + f[2] + '</span></div><div class="bar" aria-hidden="true"><i style="width:' + (f[1] / f[2] * 100) + '%"></i></div><small>' + f[3] + '</small></div>'; }).join('') + '</div>';
    }
    if (phoneTab === 'rewards') {
      return '<div class="p-card"><div class="lbl">Reward points</div><div class="pts"><b>1,019</b><span class="muted">719 available · 300 pending</span></div></div>' +
        '<div class="p-card"><div class="lbl">Recent awards</div><ul class="ledger-rows"><li><span>September rent</span><b>+300</b><small>250 base, 11-month streak +20%. Pending until 2 Oct</small></li><li><span>August rent</span><b>+300</b><small>250 base, 10-month streak +20%</small></li><li><span>July rent</span><b>+300</b><small>250 base, 9-month streak +20%</small></li></ul></div>' +
        '<div class="banner" style="margin:0">' + ico('clock') + '<span>Redemption is coming soon. Your points are safe and keep building.</span></div>';
    }
    return '<div class="p-card"><div class="lbl">September rent</div><div class="pts"><b>KES 0 due</b>' + badge('Paid') + '</div><div class="muted" style="margin-top:4px">Paid 2 Sep · next rent due 5 Oct</div></div>' +
      '<div class="p-card"><div class="lbl">Rental Profile</div><div class="score" style="margin-top:6px">' + ring(83).replace('class="ring"', 'class="ring" style="width:56px;height:56px"') + '<div><b>Good · 83 / 100</b><span>11 on-time payments in a row</span></div></div></div>' +
      '<div class="p-card"><div class="lbl">Reward points</div><div class="pts"><b>1,019</b><span class="muted">300 pending</span></div></div>' +
      '<div class="actions6">' + [['pay', 'Pay Rent'], ['doc', 'View Receipt'], ['list', 'Statements'], ['star', 'Rewards'], ['wrench', 'Maintenance'], ['key', 'Lease']].map(function (a) { return '<button type="button" data-go="' + a[1] + '">' + ico(a[0]) + a[1] + '</button>'; }).join('') + '</div>';
  }
  function phoneRender() {
    $('#phone').innerHTML = '<div class="p-status"><span>9:41</span><span>RentRewards</span></div><div class="p-head"><div><b>James Mwangi</b><small>A12 · Riverside Apartments</small></div><span class="avatar" aria-hidden="true">JM</span></div><div class="p-body">' + phoneBody() + '</div><div class="p-nav" role="group" aria-label="Tenant portal sections">' + [['home', 'Home'], ['profile', 'Rental Profile'], ['rewards', 'Rewards']].map(function (t) { return '<button type="button" data-p="' + t[0] + '" aria-pressed="' + (phoneTab === t[0]) + '">' + t[1] + '</button>'; }).join('') + '</div>';
    $$('[data-p]', $('#phone')).forEach(function (b) { b.addEventListener('click', function () { phoneTab = b.dataset.p; phoneRender(); $('[data-p="' + phoneTab + '"]', $('#phone')).focus(); }); });
    $$('[data-go]', $('#phone')).forEach(function (b) {
      b.addEventListener('click', function () {
        var g = b.dataset.go; if (g === 'Rewards') phoneTab = 'rewards'; else if (g === 'Statements' || g === 'Lease') { toast('“' + g + '” opens in the full tenant portal.'); return; } else { toast('“' + g + '” opens in the full tenant portal.'); return; }
        phoneRender();
      });
    });
  }
  phoneRender();

  /* --------------------------------------------------- three experiences */
  function tree() {
    var months = [
      ['August', 'due 5 Aug · KES 25,000', 'On time', 'b-ok', 'check', [['2 Aug', 'KES 25,000', '3 days early']]],
      ['July', 'due 5 Jul · KES 25,000', 'Just late', 'b-warn', 'clock', [['7 Jul', 'KES 15,000', '2 days late'], ['8 Jul', 'KES 10,000', '3 days late · cleared']]],
      ['June', 'due 5 Jun · KES 25,000', 'On time', 'b-ok', 'check', [['4 Jun', 'KES 25,000', '1 day early']]]
    ];
    return '<div class="tree" id="tree"><ul><li><div class="node"><b>James Mwangi</b><span class="m">A12 · Riverside Apartments</span></div><ul><li><div class="node"><b>Lease</b><span class="m">1 Oct 2024 – 30 Sep 2026 · KES 25,000 a month</span></div><ul><li><button type="button" class="node" aria-expanded="true" data-tr="y"><svg class="caret" aria-hidden="true"><use href="#i-caret"/></svg><b>2026</b></button><ul data-tp="y">' +
      months.map(function (m, i) { return '<li><button type="button" class="node" aria-expanded="' + (i === 1) + '" data-tr="m' + i + '"><svg class="caret" aria-hidden="true"><use href="#i-caret"/></svg><b>' + m[0] + '</b><span class="m">' + m[1] + '</span><span class="badge ' + m[3] + '">' + ico(m[4]) + m[2] + '</span></button><ul data-tp="m' + i + '"' + (i === 1 ? '' : ' hidden') + '>' + m[5].map(function (p) { return '<li><div class="node"><b>Payment</b><span class="m">' + p[0] + ' · ' + p[1] + ' · ' + p[2] + '</span></div></li>'; }).join('') + '</ul></li>'; }).join('') +
      '</ul></li></ul></li></ul></li></ul></div>';
  }
  var THREE = [
    ['Property managers', 'Run the portfolio.', ['Properties', 'Units', 'Tenants', 'Collections', 'Leases', 'Maintenance', 'Reporting'], 'Explore Property Management', 'properties',
      '<div class="ui">' + uiBar('Collections queue') + '<div class="ui-body"><div class="kpis" style="grid-template-columns:repeat(2,1fr)"><div class="kpi"><div class="l">Outstanding</div><div class="v">KES 150K</div><div class="s">across 3 properties</div></div><div class="kpi"><div class="l">Unmatched</div><div class="v">1</div><div class="s">KES 22,000 in suspense</div></div></div><ul class="list-rows"><li><div><b style="color:var(--ink)">Peter Karanja · E5</b><div class="sub">Oakwood Residences · 5 days overdue</div></div><span class="num"><b>KES 20,000</b></span></li><li><div><b style="color:var(--ink)">Brian Mutua · D6</b><div class="sub">Kilimani Heights · part-paid</div></div><span class="num"><b>KES 13,000</b></span></li><li><div><b style="color:var(--ink)">B2 · Green Park Estate</b><div class="sub">2 units owing this month</div></div><span class="num"><b>KES 36,000</b></span></li></ul></div></div>'],
    ['Landlords', 'See the performance.', ['Income', 'Occupancy', 'Collections', 'Expenses', 'Statements', 'Settlements'], 'Explore Landlord Experience', 'intelligence',
      '<div class="ui">' + uiBar('Wanjiku Holdings · August') + '<div class="ui-body"><ul class="list-rows"><li><span>Rent collected</span><b class="num">KES 518,000</b></li><li><span>Commission (example 1%)</span><b class="num">− KES 5,180</b></li><li><span>Maintenance costs</span><b class="num">− KES 21,500</b></li><li><span><b style="color:var(--ink)">Payable to landlord</b></span><b class="num" style="color:var(--green-ink)">KES 491,320</b></li></ul><div class="panel-title" style="margin-top:16px">Tenant payment history <span class="pill-plan">Planned</span></div>' + tree() + '</div></div>'],
    ['Tenants', 'Manage your home.', ['Rent payments', 'Receipts', 'Statements', 'Rewards', 'Rental Profile', 'Maintenance', 'Lease information'], 'Explore Tenant Experience', 'tenant',
      '<div class="ui">' + uiBar('Statement · James Mwangi') + '<div class="ui-body"><div class="table-wrap"><table class="t" style="min-width:420px"><caption class="sr">Tenant statement</caption><thead><tr><th scope="col">Date</th><th scope="col">Description</th><th scope="col" class="r">Charge</th><th scope="col" class="r">Paid</th><th scope="col" class="r">Balance</th></tr></thead><tbody><tr><td>1 Sep</td><td>September rent</td><td class="r n">25,000</td><td class="r n"></td><td class="r n">25,000</td></tr><tr><td>2 Sep</td><td>M-PESA payment</td><td class="r n"></td><td class="r n">25,000</td><td class="r n">0</td></tr><tr><td>1 Aug</td><td>August rent</td><td class="r n">25,000</td><td class="r n"></td><td class="r n">25,000</td></tr><tr><td>2 Aug</td><td>M-PESA payment</td><td class="r n"></td><td class="r n">25,000</td><td class="r n">0</td></tr></tbody></table></div><p class="xs muted" style="margin-top:10px">Statements and each receipt download as PDF; statements also as CSV.</p></div></div>']
  ];
  $('#three').innerHTML = THREE.map(function (t) {
    return '<div class="exp rv"><div class="exp-copy"><p class="role">' + t[0] + '</p><h3 class="h3">' + t[1] + '</h3><p class="caps">' + t[2].map(function (c) { return '<b>' + c + '</b>'; }).join(' <span aria-hidden="true">/</span> ') + '</p><a class="link" href="#' + (t[4] === 'properties' ? 'explorer' : t[4]) + '" data-tab="' + (t[4] === 'properties' ? 'properties' : '') + '">' + t[3] + ' <span aria-hidden="true">→</span></a></div><div>' + t[5] + '</div></div>';
  }).join('');
  $('#tree') && $('#tree').addEventListener('click', function (e) {
    var b = e.target.closest('[data-tr]'); if (!b) return;
    var open = b.getAttribute('aria-expanded') === 'true'; b.setAttribute('aria-expanded', !open);
    var p = $('[data-tp="' + b.dataset.tr + '"]', $('#tree')); if (p) p.hidden = open;
  });

  /* ------------------------------------------------------------ Kenya rails */
  var RAILS = [
    ['M-PESA', 'Rent payments', 'Payments are matched to tenants and invoices by account reference, unit or phone. Runs end to end on simulated Safaricom payloads; live credentials are pending.', 'Prototype', 's-proto'],
    ['Banks', 'Settlements and reconciliation', 'Landlord payout destinations (M-PESA or bank) are recorded today. Bank statement ingestion is planned.', 'Planned', 's-plan'],
    ['KRA eRITS', 'Rental income tax workflows', 'Records, periods, exceptions and submission preparation work. Filings are simulated and stamped; live filing needs authorised KRA access.', 'Prototype', 's-proto'],
    ['SMS', 'Notifications', 'Notification records are created now. The SMS gateway connection point is ready.', 'Integration ready', 's-ready'],
    ['WhatsApp', 'Tenant communication', 'Not built yet.', 'Planned', 's-plan'],
    ['Email', 'Receipts and statements', 'Receipts and statements download as PDF. Sending by email uses the same connection point as SMS.', 'Integration ready', 's-ready']
  ];
  $('#rails').innerHTML = RAILS.map(function (r) { return '<div class="rail" style="border-bottom-color:#25394b"><div class="nm" style="color:#fff">' + r[0] + '</div><div class="use" style="color:#e9eef2">' + r[1] + '</div><div class="nt" style="color:#9fb0bd">' + r[2] + '</div><div class="st"><span class="status ' + r[4] + '">' + r[3] + '</span></div></div>'; }).join('');
  $('#status-legend').innerHTML = [['Live', 's-live', 'Running in production with real credentials. Nothing is at this status yet.'], ['Prototype', 's-proto', 'Works end to end against simulated providers.'], ['Integration ready', 's-ready', 'The connection point exists; credentials and approval are still needed.'], ['Planned', 's-plan', 'On the roadmap, not yet built.']].map(function (l) { return '<div><dt><span class="status ' + l[1] + '">' + l[0] + '</span></dt><dd style="color:#9fb0bd">' + l[2] + '</dd></div>'; }).join('');

  /* ------------------------------------------------ compliance return panel */
  function compRender() {
    var done = xpState.ex[0] && xpState.ex[1];
    var left = 2 - xpState.ex.filter(Boolean).length;
    var status = xpState.prepared ? '<span class="badge b-info">' + ico('check') + 'Prepared · simulated</span>' : done ? '<span class="badge b-ok">' + ico('check') + 'Ready to prepare</span>' : '<span class="badge b-warn">' + ico('alert') + 'Draft · ' + left + ' exception' + (left === 1 ? '' : 's') + '</span>';
    var exRow = function (i, title, sub, action) {
      return '<li><div><b style="color:var(--ink)">' + title + '</b><div class="sub">' + sub + '</div></div>' + (xpState.ex[i] ? '<span class="badge b-ok">' + ico('check') + 'Cleared</span>' : '<button class="ui-btn" type="button" data-ex="' + i + '">' + action + '</button>') + '</li>';
    };
    $('#comp-ui').innerHTML = uiBar('Rental income return · August 2026', '<span class="demo-tag">Demonstration data</span>') + '<div class="ui-body"><div class="banner">' + ico('alert') + '<span><b>Prototype.</b> Preparing a return here is simulated. Nothing is sent to KRA.</span></div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><b style="color:var(--ink)">Period status</b>' + status + '</div>' +
      '<div class="ret-row"><span>Properties included</span><b>5</b></div><div class="ret-row"><span>Landlord tax profiles</span><b>3</b></div><div class="ret-row"><span>Rental income recorded</span><b>' + kes(1050000) + '</b></div><div class="ret-row"><span>Held in suspense, not yet income</span><b>' + kes(22000) + '</b></div><div class="ret-row"><span>Tax rules applied</span><b style="font-weight:550">Sample set, confirm rates with KRA</b></div>' +
      '<div class="panel-title" style="margin-top:16px">Exceptions <span>clear these first</span></div><ul class="list-rows">' + exRow(0, 'KRA PIN missing', 'Karanja &amp; Sons Ltd · Westlands Court', 'Add PIN') + exRow(1, 'Unmatched payment', 'KES 22,000 · 24 Aug', 'Match payment') + '</ul>' +
      '<div style="margin-top:14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button class="ui-btn" type="button" id="comp-prep" ' + (done && !xpState.prepared ? '' : 'disabled') + ' style="' + (done && !xpState.prepared ? 'background:var(--ink);color:#fff;border-color:var(--ink)' : '') + '">' + (xpState.prepared ? 'Prepared' : 'Prepare return') + '</button><button class="ui-btn" type="button" id="comp-reset">Reset demo</button>' + (xpState.prepared ? '<span class="xs muted">Recorded in the audit history as a simulated preparation.</span>' : '') + '</div></div>';
    $$('[data-ex]', $('#comp-ui')).forEach(function (b) { b.addEventListener('click', function () { xpState.ex[+b.dataset.ex] = true; compRender(); var n = $('#comp-prep'); if (n && !n.disabled) n.focus(); }); });
    var pr = $('#comp-prep'); if (pr) pr.addEventListener('click', function () { xpState.prepared = true; compRender(); });
    $('#comp-reset').addEventListener('click', function () { xpState.ex = [false, false]; xpState.prepared = false; compRender(); });
  }
  compRender();

  /* ------------------------------------------- testimonial component (empty) */
  window.RentRewards = window.RentRewards || {};
  window.RentRewards.mountTestimonials = function (host, items) {
    var tpl = $('#testimonial-template'), shown = 0;
    host.innerHTML = '';
    (items || []).forEach(function (t) {
      if (!t || t.verified !== true || !t.quote || !t.name || !t.organisation) return; // never render unverified claims
      var n = tpl.content.cloneNode(true);
      n.querySelector('blockquote').textContent = t.quote;
      n.querySelector('[data-name]').textContent = t.name;
      n.querySelector('[data-role]').textContent = t.role || '';
      n.querySelector('[data-org]').textContent = t.organisation;
      host.appendChild(n); shown++;
    });
    host.hidden = shown === 0;
  };

  /* ----------------------------------------------------------- chrome / nav */
  var header = $('.site-header');
  var onScroll = function () { header.classList.toggle('is-stuck', window.scrollY > 8); };
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

  var menuBtn = $('.menu-btn'), menu = $('#mobile-menu');
  function setMenu(open) { menuBtn.setAttribute('aria-expanded', open); menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu'); menu.classList.toggle('is-open', open); }
  menuBtn.addEventListener('click', function () { setMenu(menuBtn.getAttribute('aria-expanded') !== 'true'); });
  menu.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });
  window.matchMedia('(min-width: 1024px)').addEventListener('change', function (m) { if (m.matches) setMenu(false); });

  /* explorer deep links (footer + experience CTAs) */
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[data-tab]'); if (!a || !a.dataset.tab) return;
    selectTab(a.dataset.tab);
  });

  /* toast */
  var toastEl = document.createElement('div');
  toastEl.setAttribute('role', 'status'); toastEl.setAttribute('aria-live', 'polite');
  toastEl.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%) translateY(20px);background:#0e212f;color:#fff;padding:12px 18px;border-radius:8px;font-size:.9375rem;opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;z-index:90;max-width:calc(100vw - 32px);text-align:center';
  document.body.appendChild(toastEl);
  var toastT;
  function toast(msg) {
    toastEl.textContent = msg; toastEl.style.opacity = 1; toastEl.style.transform = 'translateX(-50%)';
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.style.opacity = 0; toastEl.style.transform = 'translateX(-50%) translateY(20px)'; }, 3200);
  }
  $$('[data-signin]').forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); setMenu(false); toast('Sign In opens the RentRewards app. It is not part of this landing prototype.'); }); });
  $$('[data-legal]').forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); toast(a.dataset.legal + ' page: to be published before launch.'); }); });

  /* demo dialog → WhatsApp */
  var dlg = $('#demo-dlg'), form = $('#demo-form'), lastFocus;
  $$('[data-demo]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault(); setMenu(false); lastFocus = document.activeElement;
      if (typeof dlg.showModal === 'function') { dlg.showModal(); $('#d-name').focus(); } else { window.location.hash = 'contact'; }
    });
  });
  $('#demo-cancel').addEventListener('click', function () { dlg.close(); });
  dlg.addEventListener('close', function () { if (lastFocus) lastFocus.focus(); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var n = $('#d-name').value.trim(), p = $('#d-phone').value.trim(), ok = true;
    $('#e-name').hidden = !!n; $('#e-phone').hidden = p.replace(/\D/g, '').length >= 9;
    if (!n || p.replace(/\D/g, '').length < 9) ok = false;
    if (!ok) { (n ? $('#d-phone') : $('#d-name')).focus(); return; }
    var msg = 'Hello RentRewards, I would like a demo. Name: ' + n + '. Phone: ' + p + '. Units managed: ' + $('#d-size').value + '.';
    window.open('https://wa.me/254713207247?text=' + encodeURIComponent(msg), '_blank', 'noopener');
    dlg.close(); form.reset();
  });

  /* scroll reveals */
  var rv = $$('.rv');
  if (reduce || !('IntersectionObserver' in window)) { rv.forEach(function (n) { n.classList.add('is-in'); }); }
  else {
    var io = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } }); }, { rootMargin: '0px 0px -8% 0px', threshold: .08 });
    rv.forEach(function (n) { io.observe(n); });
  }
})();
