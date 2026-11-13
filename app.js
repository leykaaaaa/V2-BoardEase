'use strict';

/* ---------- Helpers ---------- */
const KEY = 'oppa_yopa_v1', SESSION = 'oppa_yopa_session';
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = n => String(n).padStart(2, '0');
const peso = n => { n = Number(n || 0); const whole = Math.abs(n - Math.round(n)) < 0.005; return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }); };
const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => toISO(new Date());
const curYM = () => todayStr().slice(0, 7);
const addMonths = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const ymLabel = ym => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' }); };
const fmtDate = s => { if (!s) return '—'; const d = new Date(s.length === 10 ? s + 'T00:00:00' : s); return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); };
const fmtShort = s => { const d = new Date(s); return d.toLocaleDateString('en-US', d.getFullYear() === new Date().getFullYear() ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' }); };
const hash = str => { let h = 5381; const s = 'be$' + str; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return 'h' + (h >>> 0).toString(36); };
const randPass = () => { const c = 'abcdefghjkmnpqrstuvwxyz23456789'; let p = ''; for (let i = 0; i < 8; i++) p += c[Math.floor(Math.random() * c.length)]; return p; };
const slug = n => n.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '').slice(0, 20);
const METHOD = { cash: 'Cash', gcash: 'GCash', bank: 'Bank transfer' };
const STATUS_LABEL = { paid: 'Paid', partial: 'Partial', overdue: 'Overdue', unpaid: 'Unpaid', upcoming: 'Upcoming', pending: 'Pending confirmation', confirmed: 'Confirmed', rejected: 'Rejected', open: 'Open', in_progress: 'In progress', resolved: 'Resolved', important: 'Important', new: 'New' };
const badge = (st, label) => `<span class="badge ${st}"><i></i>${esc(label || STATUS_LABEL[st] || st)}</span>`;

/* ---------- Data layer ---------- */
function seed() {
  const start = addMonths(curYM(), -2) + '-01';
  const r1 = { id: uid(), name: 'Room 1', capacity: 2, rate: 2500 };
  const r2 = { id: uid(), name: 'Room 2', capacity: 3, rate: 1800 };
  const owner = { id: uid(), username: 'owner', pass: hash('owner123'), role: 'owner', name: 'Boarding House Owner' };
  const tu = { id: uid(), username: 'juan', pass: hash('tenant123'), role: 'tenant', name: 'Juan Dela Cruz' };
  const t = { id: uid(), userId: tu.id, name: 'Juan Dela Cruz', contact: '0917 000 0000', roomId: r1.id, rent: 2500, deposit: 2500, start, months: 12, dueDay: 5 };
  const now = new Date().toISOString();
  const pay = (month, amount, method, ref, status) => ({ id: uid(), tenantId: t.id, month, amount, method, ref, note: '', status, date: now, by: method === 'cash' ? 'owner' : 'tenant' });
  return {
    users: [owner, tu],
    rooms: [r1, r2],
    tenants: [t],
    payments: [
      pay(addMonths(curYM(), -2), 2500, 'cash', '', 'confirmed'),
      pay(addMonths(curYM(), -1), 1000, 'gcash', '09171234567', 'confirmed')
    ],
    complaints: [],
    announcements: [{ id: uid(), title: 'Welcome to Oppa Yopa', message: 'Notices from your owner will show up here.', priority: 'normal', roomId: null, date: now }],
    settings: { boardName: 'Oppa Yopa Dorm', gcashName: '', gcashNumber: '', bankName: '', bankAcct: '', bankHolder: '', instructions: '' }
  };
}
function load() {
  try { const r = JSON.parse(localStorage.getItem(KEY)); if (r && r.users) { r.announcements = r.announcements || []; return r; } } catch (e) { /* ignore */ }
  const d = seed(); localStorage.setItem(KEY, JSON.stringify(d)); return d;
}
function save() { localStorage.setItem(KEY, JSON.stringify(db)); }

let db, me = null;
const ui = { page: 'dashboard', tq: '', tf: 'all', pq: '', pf: 'all', cf: 'all', payMonth: '' };

/* ---------- Business logic ---------- */
const monthsOf = t => Array.from({ length: t.months }, (_, i) => addMonths(t.start.slice(0, 7), i));
const roomOf = id => db.rooms.find(r => r.id === id);
const roomName = id => (roomOf(id) || { name: '—' }).name;
const tenantOf = id => db.tenants.find(t => t.id === id);
const myTenant = () => db.tenants.find(t => t.userId === me.id);
const leaseEnd = t => { const d = new Date(t.start + 'T00:00:00'); d.setMonth(d.getMonth() + Number(t.months)); d.setDate(d.getDate() - 1); return toISO(d); };

/* Lease length in real days (start and end dates both count) */
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const dayDiff = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 864e5);
function leaseDays(t) {
  const end = leaseEnd(t), today = todayStr(), total = dayDiff(t.start, end) + 1;
  if (today < t.start) return { state: 'upcoming', total, elapsed: 0, left: total, startsIn: dayDiff(today, t.start), endedAgo: 0 };
  if (today > end) return { state: 'ended', total, elapsed: total, left: 0, startsIn: 0, endedAgo: dayDiff(end, today) };
  const elapsed = dayDiff(t.start, today) + 1;
  return { state: 'active', total, elapsed, left: total - elapsed, startsIn: 0, endedAgo: 0 };
}
function leaseShort(t) {
  const L = leaseDays(t);
  return L.state === 'active' ? `${plural(L.left, 'day')} left` : L.state === 'upcoming' ? `Starts in ${plural(L.startsIn, 'day')}` : 'Lease ended';
}
function leaseDetail(t) {
  const L = leaseDays(t), pct = Math.round(L.elapsed / L.total * 100);
  const line = L.state === 'active' ? `Day ${L.elapsed} of ${L.total} · ${plural(L.left, 'day')} left`
    : L.state === 'upcoming' ? `Starts in ${plural(L.startsIn, 'day')}` : `Ended ${plural(L.endedAgo, 'day')} ago`;
  return `${plural(L.total, 'day')} (${plural(+t.months, 'month')})<div class="prog" aria-hidden="true"><i style="width:${pct}%"></i></div><div class="muted small">${line}</div>`;
}

/* Online payment methods the owner has set up */
function channels() {
  const s = db.settings, c = [];
  if ((s.gcashNumber || '').trim()) c.push('gcash');
  if ((s.bankAcct || '').trim()) c.push('bank');
  return c;
}

function monthInfo(t, ym) {
  const rent = +t.rent;
  const mine = db.payments.filter(p => p.tenantId === t.id && p.month === ym);
  const paid = mine.filter(p => p.status === 'confirmed').reduce((a, p) => a + p.amount, 0);
  const pending = mine.filter(p => p.status === 'pending').reduce((a, p) => a + p.amount, 0);
  const balance = Math.max(+(rent - paid).toFixed(2), 0);
  const due = `${ym}-${pad(Math.min(+t.dueDay, 28))}`;
  let status;
  if (balance <= 0) status = 'paid';
  else if (todayStr() > due) status = 'overdue';
  else if (paid > 0) status = 'partial';
  else if (ym > curYM()) status = 'upcoming';
  else status = 'unpaid';
  const methods = [...new Set(mine.filter(p => p.status === 'confirmed').map(p => p.method))];
  return { ym, rent, paid, pending, balance, due, status, methods, partial: paid > 0 && balance > 0 };
}
function tenantStatus(t) {
  const now = curYM();
  const infos = monthsOf(t).filter(m => m <= now).map(m => monthInfo(t, m));
  const has = s => infos.some(i => i.status === s);
  const status = !infos.length ? 'upcoming' : has('overdue') ? 'overdue' : has('partial') ? 'partial' : has('unpaid') ? 'unpaid' : 'paid';
  return { status, balance: infos.reduce((a, i) => a + i.balance, 0), partial: infos.some(i => i.partial), infos };
}
const infoBadge = i => badge(i.status, i.status === 'overdue' && i.partial ? 'Overdue (partial)' : null);
const statusBadge = s => badge(s.status, s.status === 'overdue' && s.partial ? 'Overdue (partial)' : null);
const availFor = (t, ym) => { const i = monthInfo(t, ym); return +(i.balance - i.pending).toFixed(2); };
function monthOptions(t, sel) {
  const html = monthsOf(t).map(ym => { const a = availFor(t, ym); return a > 0 ? `<option value="${ym}" ${ym === sel ? 'selected' : ''}>${ymLabel(ym)} — ${peso(a)} payable</option>` : ''; }).join('');
  return html || '<option value="">No months left to pay</option>';
}

/* ---------- UI utilities ---------- */
function toast(msg, err) {
  const el = document.createElement('div'); el.className = 'toast' + (err ? ' err' : ''); el.textContent = msg;
  $('#toast').appendChild(el); setTimeout(() => el.remove(), 3200);
}
function openDlg(title, body, wide) {
  const d = $('#dlg'); d.className = wide ? 'wide' : '';
  d.innerHTML = `<div class="dlg-head"><h3>${esc(title)}</h3><button class="x" data-close aria-label="Close">×</button></div><div class="dlg-body">${body}</div>`;
  labelTables(d);
  if (!d.open) d.showModal();
}
const closeDlg = () => { const d = $('#dlg'); if (d.open) d.close(); };

/* Adds column labels to table cells so the CSS can turn rows into cards on small screens */
function labelTables(root) {
  if (!root || !root.querySelectorAll) return;
  root.querySelectorAll('table').forEach(tb => {
    const heads = [...tb.querySelectorAll('thead th')].map(h => h.textContent.trim());
    tb.classList.add('resp');
    tb.querySelectorAll('tbody tr').forEach(tr => [...tr.children].forEach((td, i) => {
      if (td.dataset.label !== undefined || td.classList.contains('nolabel')) return;
      if (heads[i]) { td.dataset.label = heads[i]; td.innerHTML = '<div class="cv">' + td.innerHTML + '</div>'; }
      else td.classList.add('nolabel');
    }));
  });
}
function empty(msg) { return `<div class="empty">${esc(msg)}</div>`; }

/* ---------- Auth ---------- */
function login(f) {
  const u = db.users.find(x => x.username === f.username.trim().toLowerCase());
  if (!u || u.pass !== hash(f.password)) return toast('Wrong username or password.', true);
  const prev = u.lastLogin || null;
  me = u; localStorage.setItem(SESSION, u.id); ui.page = u.role === 'owner' ? 'dashboard' : 'lease'; render();
  showWelcome(prev);
  u.lastLogin = new Date().toISOString(); save();
}
function logout() { me = null; localStorage.removeItem(SESSION); render(); }

function loginView() {
  const sample = ['paid', 'paid', 'paid', 'paid', 'partial', 'paid', 'paid', 'overdue', 'paid', 'paid', 'unpaid', 'upcoming'];
  return `<div class="login">
    <section class="login-art"><div class="brand">${LOGO}<div><b>Oppa Yopa</b></div></div>
      <div><h1>Know if your 'Oppa' has been paid or not.</h1>
      <p>Rent, leases and tenant reports for your boarding house, in one place.</p>
      <span class="strip big" aria-hidden="true">${sample.map(k => `<i class="m ${k}"></i>`).join('')}</span></div>
      <small>Records are saved in this browser.</small></section>
    <form class="login-form" data-form="login">
      <h2>Sign in</h2>
      <p class="muted">Tenants: use the login your owner gave you.</p>
      <div class="field"><label for="lu">Username</label><input id="lu" name="username" autocomplete="username" required autofocus></div>
      <div class="field"><label for="lp">Password</label><input id="lp" name="password" type="password" autocomplete="current-password" required></div>
      <button class="btn primary block">Sign in</button>
      <details class="demo"><summary>Demo accounts</summary><p>Owner: <code>owner</code> / <code>owner123</code><br>Tenant: <code>juan</code> / <code>tenant123</code></p></details>
    </form></div>`;
}

/* ---------- Shell ---------- */
/* ---------- Icons, logo and the month strip ---------- */
const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="8" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="15" width="7" height="6" rx="1.5"/>',
  tenants: '<i class="fa-solid fa-users" aria-hidden="true"></i>',
  rooms: '<i class="fa-solid fa-house" aria-hidden="true"></i>',
  payments: '<i class="fa-solid fa-wallet" aria-hidden="true"></i>',
  complaints: '<i class="fa-solid fa-message" aria-hidden="true"></i>',
  announce: '<i class="fa-solid fa-bullhorn" aria-hidden="true"></i>',
  settings: '<i class="fa-solid fa-sliders" aria-hidden="true"></i>',
  lease: '<i class="fa-solid fa-file-lines" aria-hidden="true"></i>',
  pay: '<i class="fa-solid fa-money-bill" aria-hidden="true"></i>',
  history: '<i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i>',
  account: '<i class="fa-solid fa-circle-user" aria-hidden="true"></i>',
  logout: '<i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i>'
};
ICONS.notices = ICONS.announce; ICONS.reports = ICONS.complaints;
const ico = n => { const icon = ICONS[n] || ''; return icon.startsWith('<i ') ? icon : `<svg class="ico" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg>`; };
const LOGO = '<svg class="logo" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="currentColor"/><rect x="7" y="9" width="5" height="14" rx="1.5" fill="#4ade80"/><rect x="13.5" y="9" width="5" height="14" rx="1.5" fill="#fbbf24"/><rect x="20" y="9" width="5" height="14" rx="1.5" fill="#f87171"/></svg>';
const initials = n => n.split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();

/* One bar per month so a tenant's payment history reads at a glance */
function stripHTML(t, max = 12) {
  const now = curYM();
  const infos = monthsOf(t).filter(m => m <= now).map(m => monthInfo(t, m)).slice(-max);
  if (!infos.length) return '<span class="muted small">Not started</span>';
  const desc = i => `${ymLabel(i.ym)}: ${STATUS_LABEL[i.status]}${i.balance > 0 ? ', ' + peso(i.balance) + ' left' : ''}`;
  return `<span class="strip" role="img" aria-label="${esc(infos.map(desc).join('. '))}">${infos.map(i => `<i class="m ${i.status}" title="${esc(desc(i))}"></i>`).join('')}</span>`;
}
const legendHTML = () => `<div class="legend-row">${[['paid', 'Paid'], ['partial', 'Partial'], ['unpaid', 'Unpaid'], ['overdue', 'Overdue']].map(([k, l]) => `<span class="lg"><i class="m ${k}"></i>${l}</span>`).join('')}</div>`;

/* Month tiles for a whole lease; tenants can select a tile to pay that month */
function calendarHTML(t, pay) {
  const now = curYM();
  return `<div class="cal">${monthsOf(t).map(m => {
    const i = monthInfo(t, m), [y, mo] = m.split('-').map(Number);
    const mon = new Date(y, mo - 1, 1).toLocaleString('en-US', { month: 'short' });
    const sub = i.status === 'paid' ? 'Paid' : i.status === 'upcoming' ? peso(i.rent) : `${peso(i.balance)} left`;
    const label = `${ymLabel(m)}: ${STATUS_LABEL[i.status]}${i.balance > 0 ? ', ' + peso(i.balance) + ' left' : ''}`;
    const inner = `<span class="mn">${mon}</span><span class="my">${y}</span><span class="ms">${sub}</span>`;
    const cls = `mo ${i.status}${m === now ? ' now' : ''}`;
    return pay && availFor(t, m) > 0
      ? `<button class="${cls}" data-action="payNow" data-ym="${m}" title="${esc(label)}. Select to pay.">${inner}</button>`
      : `<div class="${cls}" title="${esc(label)}">${inner}</div>`;
  }).join('')}</div>`;
}

const OWNER_NAV = [['dashboard', 'Dashboard'], ['tenants', 'Tenants'], ['rooms', 'Rooms'], ['payments', 'Payments'], ['complaints', 'Reports'], ['announce', 'Announcements'], ['settings', 'Settings']];
const TENANT_NAV = [['lease', 'My lease'], ['notices', 'Announcements'], ['pay', 'Pay rent'], ['history', 'My payments'], ['reports', 'Send a report'], ['account', 'Account']];


function navCount(id) {
  if (id === 'payments') return db.payments.filter(p => p.status === 'pending').length;
  if (id === 'complaints') return db.complaints.filter(c => c.status === 'open').length;
  if (id === 'notices') return unreadAnn().length;
  return 0;
}
function render() {
  const app = $('#app');
  if (!me) { app.innerHTML = loginView(); return; }
  const nav = me.role === 'owner' ? OWNER_NAV : TENANT_NAV;
  if (!nav.some(n => n[0] === ui.page)) ui.page = nav[0][0];
  const pages = { dashboard: pgDashboard, tenants: pgTenants, rooms: pgRooms, payments: pgPayments, complaints: pgComplaints, announce: pgAnnounce, notices: pgNotices, settings: pgSettings, lease: pgLease, pay: pgPay, history: pgHistory, reports: pgReports, account: pgAccount };
  const content = pages[ui.page](); // built first so unread badges are current
  app.innerHTML = `<div class="shell"><aside class="side">
    <div class="brand">${LOGO}<div><b>Oppa Yopa</b><small>${esc(db.settings.boardName || '')}</small></div></div>
    <nav class="nav" aria-label="Main">${nav.map(([id, lb]) => { const c = navCount(id); return `<button class="nav-btn ${ui.page === id ? 'active' : ''}" data-action="nav" data-id="${id}"${ui.page === id ? ' aria-current="page"' : ''}>${ico(id)}<span class="lbl">${lb}</span>${c ? `<span class="count">${c}</span>` : ''}</button>`; }).join('')}</nav>
    <div class="spacer"></div>
    <div class="who"><span class="av">${esc(initials(me.name))}</span><div><b>${esc(me.name)}</b><small>${me.role === 'owner' ? 'Owner' : 'Tenant'}</small></div></div>
    <button class="nav-btn logout" data-action="logout">${ico('logout')}<span class="lbl">Log out</span></button>
  </aside><main id="main">${content}</main></div>`;
}

/* =====================================================================
   OWNER PAGES
   ===================================================================== */
function pgDashboard() {
  const ym = curYM();
  let expected = 0, collected = 0, outstanding = 0, overdue = 0;
  db.tenants.forEach(t => {
    if (monthsOf(t).includes(ym)) { const i = monthInfo(t, ym); expected += i.rent; collected += Math.min(i.paid, i.rent); }
    const s = tenantStatus(t); outstanding += s.balance; if (s.status === 'overdue') overdue++;
  });
  const pct = expected ? Math.min(100, Math.round(collected / expected * 100)) : 0;
  const pend = db.payments.filter(p => p.status === 'pending').sort((a, b) => a.date.localeCompare(b.date));
  const open = db.complaints.filter(c => c.status === 'open').sort((a, b) => a.date.localeCompare(b.date));
  const payItems = pend.slice(0, 5).map(p => {
    const t = tenantOf(p.tenantId);
    return `<li class="row-item"><div><b>${esc(t ? t.name : 'A tenant')}</b> paid ${peso(p.amount)} for ${ymLabel(p.month)}<div class="muted small">${METHOD[p.method]}${p.ref ? ' · ref ' + esc(p.ref) : ''}</div></div><div class="actions"><button class="btn sm ok" data-action="confirmPay" data-id="${p.id}">Confirm received</button><button class="btn sm" data-action="rejectPay" data-id="${p.id}">Reject</button></div></li>`;
  }).join('') + (pend.length > 5 ? `<li class="row-item"><span class="muted">${pend.length - 5} more payments waiting</span><button class="btn sm" data-action="goto" data-id="payments">See all</button></li>` : '');
  const repItems = open.slice(0, 3).map(c => {
    const t = tenantOf(c.tenantId);
    return `<li class="row-item"><div><b>${esc(t ? t.name : 'A tenant')}</b> reported “${esc(c.subject)}”<div class="muted small">${esc(c.category)}</div></div><button class="btn sm" data-action="goto" data-id="complaints">Read</button></li>`;
  }).join('') + (open.length > 3 ? `<li class="row-item"><span class="muted">${open.length - 3} more reports</span><button class="btn sm" data-action="goto" data-id="complaints">See all</button></li>` : '');
  const waiting = payItems || repItems ? `<section class="panel"><h3>Waiting for you</h3><ul class="rows">${payItems}${repItems}</ul></section>` : '';
  const rows = db.tenants.map(t => {
    const s = tenantStatus(t), i = monthsOf(t).includes(ym) ? monthInfo(t, ym) : null;
    return `<tr><td><b>${esc(t.name)}</b><div class="muted small">${esc(roomName(t.roomId))}</div></td>
      <td>${stripHTML(t)}</td><td class="num">${i ? `${peso(i.paid)} of ${peso(i.rent)}` : '—'}</td>
      <td class="num">${s.balance > 0 ? peso(s.balance) : '—'}</td><td>${statusBadge(s)}</td>
      <td>${s.balance > 0 ? `<button class="btn sm" data-action="recordPay" data-id="${t.id}">Record payment</button>` : ''}</td></tr>`;
  }).join('');
  return `<div class="page-head"><div><h2>Dashboard</h2><p>${ymLabel(ym)}</p></div></div>
  <section class="summary"><div class="sum-main"><div class="k">Collected in ${new Date().toLocaleString('en-US', { month: 'long' })}</div><div class="big">${peso(collected)}</div>
    <div class="meter" role="img" aria-label="${pct}% collected"><i style="width:${pct}%"></i></div><div class="sub">${pct}% of ${peso(expected)} expected</div></div>
    <dl class="sum-facts"><div><dt>Outstanding</dt><dd>${peso(outstanding)}</dd></div><div><dt>Overdue</dt><dd class="${overdue ? 'neg' : ''}">${plural(overdue, 'tenant')}</dd></div><div><dt>Tenants</dt><dd>${db.tenants.length}</dd></div></dl></section>
  ${waiting}
  <section class="panel flush"><div class="panel-head"><h3>Who has paid</h3>${legendHTML()}</div>
  <div class="table-wrap">${rows ? `<table><thead><tr><th>Tenant</th><th>Rent by month</th><th class="num">This month</th><th class="num">Balance</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : empty('No tenants yet. Go to Tenants to add one.')}</div></section>`;
}

/* --- Tenants --- */
function pgTenants() {
  return `<div class="page-head"><div><h2>Tenants</h2><p>Add tenants, assign rooms and create their login accounts.</p></div>
    <button class="btn primary" data-action="addTenant">+ Add tenant</button></div>
  <div class="card"><div class="toolbar">
    <input data-live="tq" value="${esc(ui.tq)}" placeholder="Search name or room…" aria-label="Search tenants">
    <select data-live="tf" aria-label="Filter status">${['all', 'paid', 'partial', 'overdue', 'unpaid'].map(v => `<option value="${v}" ${ui.tf === v ? 'selected' : ''}>${v === 'all' ? 'All statuses' : STATUS_LABEL[v]}</option>`).join('')}</select>
  </div><div class="table-wrap" id="rows">${tenantRows()}</div></div>`;
}
function tenantRows() {
  const q = ui.tq.toLowerCase();
  const list = db.tenants.filter(t => {
    const s = tenantStatus(t);
    const okQ = !q || t.name.toLowerCase().includes(q) || roomName(t.roomId).toLowerCase().includes(q);
    const okF = ui.tf === 'all' || (ui.tf === 'partial' ? s.partial : s.status === ui.tf);
    return okQ && okF;
  });
  if (!list.length) return empty('No tenants match.');
  return `<table><thead><tr><th>Tenant</th><th>Room</th><th class="num">Rent</th><th>Lease</th><th class="num">Balance</th><th>Status</th><th></th></tr></thead><tbody>${list.map(t => {
    const s = tenantStatus(t); const u = db.users.find(x => x.id === t.userId);
    return `<tr class="click" data-action="viewTenant" data-id="${t.id}"><td><b>${esc(t.name)}</b><div class="muted small">@${esc(u ? u.username : '?')} · ${esc(t.contact)}</div></td><td>${esc(roomName(t.roomId))}</td>
      <td class="num">${peso(t.rent)}</td><td>Until ${fmtDate(leaseEnd(t))}<div class="muted small">${leaseShort(t)}</div></td>
      <td class="num">${s.balance > 0 ? peso(s.balance) : '—'}</td><td>${statusBadge(s)}</td>
      <td><button class="btn sm" data-action="viewTenant" data-id="${t.id}">Open</button></td></tr>`;
  }).join('')}</tbody></table>`;
}
function tenantForm(t) {
  const edit = !!t;
  const roomOpts = db.rooms.map(r => `<option value="${r.id}" data-rate="${r.rate}" ${t && t.roomId === r.id ? 'selected' : ''}>${esc(r.name)} (${db.tenants.filter(x => x.roomId === r.id).length}/${r.capacity})</option>`).join('');
  if (!db.rooms.length) return '<p>Please add a room first (Rooms page).</p>';
  const first = db.rooms[0];
  return `<form data-form="${edit ? 'editTenant' : 'addTenant'}"><input type="hidden" name="id" value="${edit ? t.id : ''}">
    <div class="grid2"><div class="field"><label>Full name</label><input name="name" id="tf-name" required value="${edit ? esc(t.name) : ''}"></div>
    <div class="field"><label>Contact number</label><input name="contact" required value="${edit ? esc(t.contact) : ''}"></div></div>
    <div class="grid2"><div class="field"><label>Room</label><select name="roomId" id="tf-room">${roomOpts}</select></div>
    <div class="field"><label>Monthly rent (₱)</label><input name="rent" id="tf-rent" type="number" min="1" step="0.01" required value="${edit ? t.rent : first.rate}"></div></div>
    <div class="grid2"><div class="field"><label>Deposit (₱)</label><input name="deposit" type="number" min="0" step="0.01" value="${edit ? t.deposit : 0}"></div>
    <div class="field"><label>Rent due day (1–28)</label><input name="dueDay" type="number" min="1" max="28" required value="${edit ? t.dueDay : 5}"></div></div>
    <div class="grid2"><div class="field"><label>Lease start date</label><input name="start" type="date" required value="${edit ? t.start : todayStr().slice(0, 8) + '01'}"></div>
    <div class="field"><label>Lease length (months)</label><input name="months" type="number" min="1" max="60" required value="${edit ? t.months : 12}"></div></div>
    ${edit ? '' : `<div class="note">The tenant will use these to log in. You can give them the details after saving.</div>
    <div class="grid2"><div class="field"><label>Username</label><input name="username" id="tf-user" required autocomplete="off"></div>
    <div class="field"><label>Temporary password</label><input name="password" value="${randPass()}" required minlength="6" autocomplete="off"></div></div>`}
    <button class="btn primary block">${edit ? 'Save changes' : 'Create tenant & account'}</button></form>`;
}
function credDialog(name, username, password) {
  openDlg('Tenant account ready', `<p>Give these login details to <b>${esc(name)}</b>. They can change the password after logging in.</p>
    <div class="cred">Username: <b>${esc(username)}</b><br>Password: <b>${esc(password)}</b></div>
    <button class="btn block" data-action="copy" data-text="${esc('Oppa Yopa login\nUsername: ' + username + '\nPassword: ' + password)}">Copy to clipboard</button>`);
}
function ledgerHTML(t) {
  const pays = db.payments.filter(p => p.tenantId === t.id).sort((a, b) => b.date.localeCompare(a.date));
  return `<div class="actions" style="margin-bottom:18px"><button class="btn primary sm" data-action="recordPay" data-id="${t.id}">Record payment</button><button class="btn sm" data-action="editTenant" data-id="${t.id}">Edit details</button><button class="btn sm" data-action="resetPw" data-id="${t.id}">Reset password</button><button class="btn sm danger" data-action="delTenant" data-id="${t.id}">Delete tenant</button></div>
  <dl class="kv"><dt>Room</dt><dd>${esc(roomName(t.roomId))}</dd><dt>Rent</dt><dd>${peso(t.rent)} / month, due every ${t.dueDay}th</dd><dt>Lease</dt><dd>${fmtDate(t.start)} – ${fmtDate(leaseEnd(t))}</dd><dt>Duration</dt><dd>${leaseDetail(t)}</dd><dt>Deposit</dt><dd>${peso(t.deposit)}</dd><dt>Contact</dt><dd>${esc(t.contact)}</dd></dl>
  <h3 class="sub">Lease calendar</h3>${calendarHTML(t, false)}${legendHTML()}
  <h3 class="sub">Payment history</h3><div class="table-wrap">${paymentTable(pays, false, false)}</div>`;
}

/* --- Rooms --- */
function pgRooms() {
  return `<div class="page-head"><div><h2>Rooms</h2><p>Set up rooms, capacity and standard rates.</p></div></div>
  <div class="two"><div class="card"><h3>Add a room</h3><form data-form="addRoom">
    <div class="field"><label>Room name</label><input name="name" required placeholder="e.g. Room 3"></div>
    <div class="grid2"><div class="field"><label>Capacity (beds)</label><input name="capacity" type="number" min="1" required value="2"></div>
    <div class="field"><label>Rate / person (₱)</label><input name="rate" type="number" min="0" step="0.01" required></div></div>
    <button class="btn primary">Add room</button></form></div>
  <div class="card"><h3>Your rooms</h3>${db.rooms.length ? `<div class="table-wrap"><table><thead><tr><th>Room</th><th>Occupancy</th><th class="num">Rate</th><th></th></tr></thead><tbody>${db.rooms.map(r => {
    const occ = db.tenants.filter(t => t.roomId === r.id);
    return `<tr><td><b>${esc(r.name)}</b></td><td><span class="beds" role="img" aria-label="${occ.length} of ${r.capacity} beds taken">${Array.from({ length: r.capacity }, (_, k) => `<i class="${k < occ.length ? 'on' : ''}"></i>`).join('')}</span> <span class="small">${occ.length}/${r.capacity}</span><div class="muted small">${occ.map(t => esc(t.name)).join(', ') || 'Vacant'}</div></td><td class="num">${peso(r.rate)}</td><td><button class="btn sm danger" data-action="delRoom" data-id="${r.id}">Delete</button></td></tr>`;
  }).join('')}</tbody></table></div>` : empty('No rooms yet.')}</div></div>`;
}

/* --- Payments (owner) --- */
function paymentTable(list, owner, showTenant = true, showStatus = true) {
  if (!list.length) return empty('No payments found.');
  return `<table><thead><tr><th>Date</th>${showTenant ? '<th>Tenant</th>' : ''}<th>For month</th><th class="num">Amount</th><th>Method</th><th>Reference</th>${showStatus ? '<th>Status</th>' : ''}${owner ? '<th></th>' : ''}</tr></thead><tbody>${list.map(p => {
    const t = tenantOf(p.tenantId);
    let act = '';
    if (owner) {
      if (p.status === 'pending') act = `<button class="btn sm ok" data-action="confirmPay" data-id="${p.id}">Confirm received</button><button class="btn sm danger" data-action="rejectPay" data-id="${p.id}">Reject</button>`;
      else if (p.status === 'confirmed') act = `<button class="btn sm danger" data-action="voidPay" data-id="${p.id}">Void</button>`;
    }
    return `<tr><td class="small nw">${fmtShort(p.date)}</td>${showTenant ? `<td class="nw">${esc(t ? t.name : 'Deleted')}</td>` : ''}<td class="nw">${ymLabel(p.month)}</td><td class="num">${peso(p.amount)}</td>
      <td class="nw">${METHOD[p.method]}${p.method === 'cash' ? '<div class="muted small">by owner</div>' : ''}</td><td class="small"><span class="nw">${esc(p.ref) || '—'}</span>${p.note ? `<div class="muted">${esc(p.note)}</div>` : ''}</td>${showStatus ? `<td>${badge(p.status)}</td>` : ''}${owner ? `<td><div class="actions">${act}</div></td>` : ''}</tr>`;
  }).join('')}</tbody></table>`;
}
function pgPayments() {
  const pend = db.payments.filter(p => p.status === 'pending').sort((a, b) => a.date.localeCompare(b.date));
  return `<div class="page-head"><div><h2>Payments</h2><p>Confirm GCash/bank payments, and record cash payments.</p></div><button class="btn primary" data-action="recordPay" data-id="">+ Record payment</button></div>
  <div class="card"><h3>Awaiting confirmation (${pend.length})</h3><p class="muted small" style="margin-top:-6px">Check your GCash or bank app for the reference number before confirming.</p><div class="table-wrap">${pend.length ? paymentTable(pend, true, true, false) : empty('Nothing to confirm right now.')}</div></div>
  <div class="card"><h3>Payment history</h3><div class="toolbar">
    <input data-live="pq" value="${esc(ui.pq)}" placeholder="Search tenant or reference…" aria-label="Search payments">
    <select data-live="pf" aria-label="Filter payments">${['all', 'confirmed', 'pending', 'rejected', 'cash', 'gcash', 'bank'].map(v => `<option value="${v}" ${ui.pf === v ? 'selected' : ''}>${v === 'all' ? 'All' : (STATUS_LABEL[v] || METHOD[v])}</option>`).join('')}</select>
  </div><div class="table-wrap" id="rows">${paymentRows()}</div></div>`;
}
function paymentRows() {
  const q = ui.pq.toLowerCase();
  const list = db.payments.filter(p => {
    const t = tenantOf(p.tenantId);
    const okQ = !q || (t && t.name.toLowerCase().includes(q)) || (p.ref || '').toLowerCase().includes(q);
    const okF = ui.pf === 'all' || p.status === ui.pf || p.method === ui.pf;
    return okQ && okF;
  }).sort((a, b) => b.date.localeCompare(a.date));
  return paymentTable(list, true);
}
function payForm(tenantId, isOwner) {
  const tenants = isOwner ? db.tenants : [myTenant()];
  if (!tenants.length || !tenants[0]) return '<p>No tenants available.</p>';
  const t = tenantOf(tenantId) || tenants[0];
  const sel = isOwner ? '' : ui.payMonth;
  const tenantField = isOwner
    ? `<div class="field"><label>Tenant</label><select id="pf-t" name="tenantId">${db.tenants.map(x => `<option value="${x.id}" ${x.id === t.id ? 'selected' : ''}>${esc(x.name)} – ${esc(roomName(x.roomId))}</option>`).join('')}</select></div>`
    : `<input type="hidden" id="pf-t" name="tenantId" value="${t.id}">`;
  const methods = isOwner ? ['cash', 'gcash', 'bank'] : channels();
  if (!methods.length) return '<p class="muted">Online payment is not available yet.</p>';
  return `<form data-form="${isOwner ? 'ownerPay' : 'tenantPay'}">${tenantField}
    <div class="field"><label>Pay for month</label><select id="pf-m" name="month" required>${monthOptions(t, sel)}</select></div>
    <div class="field"><label>Payment method</label><div class="method-pick">${methods.map((m, i) => `<label><input type="radio" name="method" value="${m}" ${i === 0 ? 'checked' : ''}>${METHOD[m]}</label>`).join('')}</div></div>
    <div class="grid2"><div class="field"><label>Amount (₱)</label><input id="pf-a" name="amount" type="number" min="1" step="0.01" required></div>
    <div class="field"><label>Reference no. ${isOwner ? '(optional for cash)' : ''}</label><input name="ref" placeholder="e.g. GCash ref #"></div></div>
    <div class="field"><label>Note (optional)</label><input name="note" maxlength="120"></div>
    <button class="btn primary block">${isOwner ? 'Save payment' : 'Submit payment for confirmation'}</button></form>`;
}
function syncAmount() {
  const tid = $('#pf-t'), m = $('#pf-m'), a = $('#pf-a'); if (!tid || !m || !a) return;
  const t = tenantOf(tid.value); if (!t || !m.value) { a.value = ''; return; }
  const av = availFor(t, m.value); a.value = av > 0 ? av : ''; a.max = av;
}

/* --- Complaints (owner) --- */
function pgComplaints() {
  const list = db.complaints.filter(c => ui.cf === 'all' || c.status === ui.cf).sort((a, b) => b.date.localeCompare(a.date));
  return `<div class="page-head"><div><h2>Tenant reports</h2><p>Complaints and concerns sent by your tenants.</p></div></div>
  <div class="card"><div class="toolbar"><select data-live="cf" aria-label="Filter reports">${['all', 'open', 'in_progress', 'resolved'].map(v => `<option value="${v}" ${ui.cf === v ? 'selected' : ''}>${v === 'all' ? 'All reports' : STATUS_LABEL[v]}</option>`).join('')}</select></div>
  <div id="rows">${complaintCards(list, true)}</div></div>`;
}
function complaintCards(list, owner) {
  if (!list.length) return empty('No reports.');
  return list.map(c => {
    const t = tenantOf(c.tenantId);
    return `<div class="cmp"><div class="cmp-head"><div><b>${esc(c.subject)}</b> <span class="muted small">· ${esc(c.category)}</span></div>${badge(c.status)}</div>
      <div class="muted small">${owner ? esc(t ? t.name : 'Deleted tenant') + ' · ' + esc(t ? roomName(t.roomId) : '') + ' · ' : ''}${fmtDate(c.date)}</div>
      <p style="margin:8px 0">${esc(c.message).replace(/\n/g, '<br>')}</p>
      ${c.reply ? `<div class="reply"><b>Owner reply:</b> ${esc(c.reply)}</div>` : ''}
      ${owner ? `<div style="margin-top:10px"><button class="btn sm" data-action="respond" data-id="${c.id}">Update / reply</button></div>` : ''}</div>`;
  }).join('');
}

/* --- Settings --- */
function pgSettings() {
  const s = db.settings;
  return `<div class="page-head"><div><h2>Settings</h2><p>Payment details shown to tenants when they pay.</p></div></div>
  <div class="two"><div class="card"><h3>House & payment details</h3><form data-form="settings">
    <div class="field"><label>Boarding house name</label><input name="boardName" value="${esc(s.boardName)}" required></div>
    <div class="grid2"><div class="field"><label>GCash account name</label><input name="gcashName" value="${esc(s.gcashName)}"></div>
    <div class="field"><label>GCash number</label><input name="gcashNumber" value="${esc(s.gcashNumber)}"></div></div>
    <div class="grid2"><div class="field"><label>Bank name</label><input name="bankName" value="${esc(s.bankName)}"></div>
    <div class="field"><label>Account number</label><input name="bankAcct" value="${esc(s.bankAcct)}"></div></div>
    <div class="field"><label>Account holder</label><input name="bankHolder" value="${esc(s.bankHolder)}"></div>
    <div class="field"><label>Extra instructions</label><textarea name="instructions" style="min-height:70px">${esc(s.instructions)}</textarea></div>
    <button class="btn primary">Save settings</button></form></div>
  <div>${pwCard()}<div class="card"><h3>Data</h3><p class="muted small">Everything is stored in this browser only.</p><div class="actions"><button class="btn" data-action="backup">Download backup (JSON)</button><button class="btn danger" data-action="resetAll">Reset all data</button></div></div></div></div>`;
}
function pwCard() {
  return `<div class="card"><h3>Change password</h3><form data-form="changePw">
    <div class="field"><label>Current password</label><input type="password" name="old" required></div>
    <div class="field"><label>New password (min 6 characters)</label><input type="password" name="pw" minlength="6" required></div>
    <button class="btn primary">Update password</button></form></div>`;
}

/* =====================================================================
   TENANT PAGES
   ===================================================================== */
function noLease() { return `<div class="card">${empty('Your tenant record was not found. Please contact your owner.')}</div>`; }
function pgLease() {
  const t = myTenant(); if (!t) return noLease();
  const s = tenantStatus(t); const infos = monthsOf(t).map(m => monthInfo(t, m));
  const next = infos.find(i => i.balance > 0);
  return `<div class="page-head"><div><h2>My lease</h2><p>${esc(t.name)} · ${esc(roomName(t.roomId))}</p></div><button class="btn primary" data-action="payNow" data-ym="">Pay rent</button></div>
  ${s.status === 'overdue' ? `<div class="alert red">You have an overdue balance of ${peso(s.balance)}. Please pay as soon as possible.</div>` : s.balance > 0 ? `<div class="alert amber">Outstanding balance: ${peso(s.balance)}.</div>` : ''}
  <section class="summary"><div class="sum-main"><div class="k">Balance now</div><div class="big ${s.status === 'overdue' ? 'neg' : ''}">${peso(s.balance)}</div><div class="sub">${next ? 'Next due ' + fmtDate(next.due) : 'You are all paid up'}</div></div>
    <dl class="sum-facts"><div><dt>Monthly rent</dt><dd>${peso(t.rent)}</dd></div><div><dt>Lease</dt><dd>${leaseShort(t)}</dd></div><div><dt>Deposit</dt><dd>${peso(t.deposit)}</dd></div></dl></section>
  <section class="panel"><h3>Lease calendar</h3>${calendarHTML(t, true)}${legendHTML()}<p class="muted small" style="margin:12px 0 0">Select a month to pay it.</p></section>
  <section class="panel"><h3>Lease details</h3><dl class="facts"><div><dt>Room</dt><dd>${esc(roomName(t.roomId))}</dd></div><div><dt>Lease period</dt><dd>${fmtDate(t.start)} – ${fmtDate(leaseEnd(t))}</dd></div><div><dt>Rent due</dt><dd>Every ${t.dueDay}th of the month</dd></div><div><dt>Contact on file</dt><dd>${esc(t.contact)}</dd></div><div class="wide"><dt>Duration</dt><dd>${leaseDetail(t)}</dd></div></dl></section>
  <section class="panel flush"><details class="sched" ${window.innerWidth > 900 ? 'open' : ''}><summary><h3>Monthly rent schedule</h3></summary><div class="table-wrap"><table><thead><tr><th>Month</th><th>Due date</th><th class="num">Rent</th><th class="num">Paid</th><th class="num">Balance</th><th>Status</th><th></th></tr></thead><tbody>
  ${infos.map(i => `<tr><td>${ymLabel(i.ym)}</td><td>${fmtDate(i.due)}</td><td class="num">${peso(i.rent)}</td><td class="num">${peso(i.paid)}${i.methods.length ? `<div class="muted small">via ${i.methods.map(m => METHOD[m].toLowerCase()).join(', ')}</div>` : ''}</td><td class="num">${peso(i.balance)}</td>
  <td>${infoBadge(i)}${i.pending > 0 ? `<div class="muted small">${peso(i.pending)} awaiting confirmation</div>` : ''}</td>
  <td>${availFor(t, i.ym) > 0 ? `<button class="btn sm" data-action="payNow" data-ym="${i.ym}">Pay</button>` : ''}</td></tr>`).join('')}</tbody></table></div></details></section>`;
}
function pgPay() {
  const t = myTenant(); if (!t) return noLease(); const s = db.settings;
  const ch = channels(), hasDetails = ch.length > 0;
  const method = (title, who, num) => `<div class="method-card"><div><div class="muted small">${esc(title)}</div><div class="num-big">${esc(num)}</div><div class="small">${esc(who)}</div></div><button class="btn sm" data-action="copy" data-text="${esc(num)}">Copy number</button></div>`;
  return `<div class="page-head"><div><h2>Pay rent</h2><p>Send your payment by GCash or bank, then submit the reference number.</p></div></div>
  <div class="two"><section class="panel"><h3>Send your payment</h3>
    ${ch.includes('gcash') ? method('GCash', s.gcashName, s.gcashNumber) : ''}
    ${ch.includes('bank') ? method(s.bankName || 'Bank', s.bankHolder, s.bankAcct) : ''}
    ${hasDetails ? '' : '<div class="alert amber">Online payment is not available yet. Your owner has not set up a GCash number or bank account. You can pay in cash, or ask your owner to add their payment details.</div>'}
    ${s.instructions ? `<div class="note">${esc(s.instructions)}</div>` : ''}
    <div class="note"><b>Paying in cash?</b> Hand it to your owner. They will record it and it will appear in your payments as paid via cash.</div></section>
  <section class="panel"><h3>Submit for confirmation</h3>${hasDetails ? payForm(t.id, false) : '<p class="muted">You can submit a GCash or bank payment here once your owner adds their payment details.</p>'}</section></div>`;
}
function pgHistory() {
  const t = myTenant(); if (!t) return noLease();
  const list = db.payments.filter(p => p.tenantId === t.id).sort((a, b) => b.date.localeCompare(a.date));
  return `<div class="page-head"><div><h2>My Payments</h2><p>Your complete payment record.</p></div></div><div class="card"><div class="table-wrap">${paymentTable(list, false, false)}</div></div>`;
}
function pgReports() {
  const t = myTenant(); if (!t) return noLease();
  const list = db.complaints.filter(c => c.tenantId === t.id).sort((a, b) => b.date.localeCompare(a.date));
  return `<div class="page-head"><div><h2>Send a Report</h2><p>Tell your owner about a problem or concern.</p></div></div>
  <div class="two"><div class="card"><h3>New report</h3><form data-form="complaint">
    <div class="field"><label>Category</label><select name="category">${['Maintenance', 'Utilities', 'Noise', 'Safety', 'Billing', 'Other'].map(c => `<option>${c}</option>`).join('')}</select></div>
    <div class="field"><label>Subject</label><input name="subject" maxlength="80" required></div>
    <div class="field"><label>Message</label><textarea name="message" required></textarea></div>
    <button class="btn primary">Send to owner</button></form></div>
  <div class="card"><h3>My reports</h3>${complaintCards(list, false)}</div></div>`;
}
function pgAccount() {
  return `<div class="page-head"><div><h2>Account</h2><p>Signed in as <b>@${esc(me.username)}</b></p></div></div><div style="max-width:440px">${pwCard()}</div>`;
}

/* =====================================================================
   FORM HANDLERS
   ===================================================================== */
/* =====================================================================
   ANNOUNCEMENTS AND SIGN-IN PANEL
   ===================================================================== */
const annFor = t => db.announcements.filter(a => !a.roomId || a.roomId === t.roomId).sort((a, b) => b.date.localeCompare(a.date));
const annTargets = a => db.tenants.filter(t => !a.roomId || t.roomId === a.roomId);
const annAudience = a => a.roomId ? `${roomName(a.roomId)} only` : 'All tenants';
function unreadAnn() {
  const t = me && myTenant(); if (!t) return [];
  const seen = me.seenAnn || [];
  return annFor(t).filter(a => !seen.includes(a.id));
}
const annBody = s => esc(s).replace(/\n/g, '<br>');

function pgAnnounce() {
  const list = [...db.announcements].sort((a, b) => b.date.localeCompare(a.date));
  const roomOpts = db.rooms.map(r => `<option value="${r.id}">${esc(r.name)} only</option>`).join('');
  return `<div class="page-head"><div><h2>Announcements</h2><p>Post a notice your tenants will see when they sign in.</p></div></div>
  <div class="two"><div class="card"><h3>New announcement</h3><form data-form="announce">
    <div class="grid2"><div class="field"><label for="an-to">Send to</label><select id="an-to" name="audience"><option value="all">All tenants</option>${roomOpts}</select></div>
    <div class="field"><label for="an-pr">Priority</label><select id="an-pr" name="priority"><option value="normal">Normal</option><option value="important">Important</option></select></div></div>
    <div class="field"><label for="an-t">Title</label><input id="an-t" name="title" maxlength="80" required placeholder="e.g. Water interruption on Friday"></div>
    <div class="field"><label for="an-m">Message</label><textarea id="an-m" name="message" required></textarea></div>
    <button class="btn primary">Post announcement</button></form></div>
  <div class="card"><h3>Posted (${list.length})</h3>${list.length ? list.map(a => {
    const tg = annTargets(a);
    const seen = tg.filter(t => { const u = db.users.find(x => x.id === t.userId); return u && (u.seenAnn || []).includes(a.id); }).length;
    return `<div class="cmp"><div class="cmp-head"><b>${esc(a.title)}</b>${a.priority === 'important' ? badge('important') : ''}</div>
      <div class="muted small">To: ${esc(annAudience(a))} · ${fmtDate(a.date)} · Seen by ${seen} of ${tg.length}</div>
      <p style="margin:8px 0">${annBody(a.message)}</p>
      <button class="btn sm danger" data-action="delAnn" data-id="${a.id}">Delete</button></div>`;
  }).join('') : empty('Nothing posted yet.')}</div></div>`;
}

function pgNotices() {
  const t = myTenant(); if (!t) return noLease();
  const fresh = unreadAnn().map(a => a.id);
  const list = annFor(t);
  // opening this page counts as reading; the "New" tags below still show for this visit
  if (fresh.length) { me.seenAnn = [...new Set([...(me.seenAnn || []), ...fresh])]; save(); }
  return `<div class="page-head"><div><h2>Announcements</h2><p>Notices from your owner.</p></div></div>
  <div class="card">${list.length ? list.map(a => `<div class="cmp"><div class="cmp-head"><b>${esc(a.title)}</b><span>${fresh.includes(a.id) ? badge('new') + ' ' : ''}${a.priority === 'important' ? badge('important') : ''}</span></div>
    <div class="muted small">${fmtDate(a.date)}</div><p style="margin:8px 0 0">${annBody(a.message)}</p></div>`).join('') : empty('No announcements yet.')}</div>`;
}

/* Panel shown once after signing in: what needs attention (owner) or what changed (tenant) */
function listItems(arr, fn, max = 5) {
  const out = arr.slice(0, max).map(fn);
  if (arr.length > max) out.push(`<li class="muted">and ${arr.length - max} more</li>`);
  return out;
}
function showWelcome(prev) {
  const isNew = iso => !prev || (iso && iso > prev);
  const tag = iso => isNew(iso) ? ' <span class="badge new">New</span>' : '';
  const sec = (title, items, page, label) => items.length
    ? `<div class="wl-sec"><h4>${title}</h4><ul class="wl-list">${items.join('')}</ul><button class="btn sm" data-action="goto" data-id="${page}">${label}</button></div>` : '';
  let title, body = '';
  if (me.role === 'owner') {
    title = 'While you were away';
    const pend = db.payments.filter(p => p.status === 'pending').sort((a, b) => b.date.localeCompare(a.date));
    const open = db.complaints.filter(c => c.status === 'open').sort((a, b) => b.date.localeCompare(a.date));
    const over = db.tenants.filter(t => tenantStatus(t).status === 'overdue');
    body = sec(`${plural(pend.length, 'payment')} waiting for your confirmation`, listItems(pend, p => {
      const t = tenantOf(p.tenantId);
      return `<li><b>${esc(t ? t.name : 'A tenant')}</b> paid ${peso(p.amount)} for ${ymLabel(p.month)} via ${METHOD[p.method]}${p.ref ? ' (ref ' + esc(p.ref) + ')' : ''}.${tag(p.date)}</li>`;
    }), 'payments', 'Review payments')
      + sec(`${plural(open.length, 'new report')} from tenants`, listItems(open, c => {
        const t = tenantOf(c.tenantId);
        return `<li><b>${esc(t ? t.name : 'A tenant')}</b>: ${esc(c.subject)}.${tag(c.date)}</li>`;
      }), 'complaints', 'Read reports')
      + sec(`${plural(over.length, 'tenant')} with overdue rent`, listItems(over, t => `<li><b>${esc(t.name)}</b> owes ${peso(tenantStatus(t).balance)}.</li>`), 'tenants', 'View tenants');
  } else {
    const t = myTenant(); if (!t) return;
    title = `Welcome back, ${me.name.split(' ')[0]}`;
    const anns = unreadAnn();
    const pays = db.payments.filter(p => p.tenantId === t.id && p.resolvedAt && isNew(p.resolvedAt));
    const reps = db.complaints.filter(c => c.tenantId === t.id && c.updatedAt && isNew(c.updatedAt));
    body = sec(`${plural(anns.length, 'new announcement')}`, listItems(anns, a => `<li><b>${esc(a.title)}</b>${a.priority === 'important' ? ' ' + badge('important') : ''}<div class="muted small">${fmtDate(a.date)}</div></li>`), 'notices', 'Read announcements')
      + sec('Payment updates', listItems(pays, p => `<li>Your ${peso(p.amount)} payment for ${ymLabel(p.month)} was ${p.status === 'confirmed' ? 'confirmed' : 'rejected' + (p.note ? ': ' + esc(p.note) : '')}.</li>`), 'history', 'View payments')
      + sec('Report updates', listItems(reps, c => `<li>Your owner updated “${esc(c.subject)}” to <b>${STATUS_LABEL[c.status]}</b>.</li>`), 'reports', 'View reports');
  }
  if (!body) return;
  openDlg(title, body + '<div class="actions"><button class="btn primary" data-close>Got it</button></div>');
}

const forms = {
  login,
  addTenant(f) {
    const username = f.username.trim().toLowerCase();
    if (db.users.some(u => u.username === username)) return toast('That username is already taken.', true);
    const occ = db.tenants.filter(t => t.roomId === f.roomId).length;
    if (occ >= roomOf(f.roomId).capacity && !confirm('This room is already full. Add anyway?')) return;
    const u = { id: uid(), username, pass: hash(f.password), role: 'tenant', name: f.name.trim() };
    db.users.push(u);
    db.tenants.push({ id: uid(), userId: u.id, name: f.name.trim(), contact: f.contact.trim(), roomId: f.roomId, rent: +f.rent, deposit: +f.deposit || 0, start: f.start, months: +f.months, dueDay: +f.dueDay });
    save(); render(); credDialog(u.name, username, f.password); toast('Tenant added.');
  },
  editTenant(f) {
    const t = tenantOf(f.id); Object.assign(t, { name: f.name.trim(), contact: f.contact.trim(), roomId: f.roomId, rent: +f.rent, deposit: +f.deposit || 0, start: f.start, months: +f.months, dueDay: +f.dueDay });
    const u = db.users.find(x => x.id === t.userId); if (u) u.name = t.name;
    save(); closeDlg(); render(); toast('Tenant updated.');
  },
  ownerPay(f) { submitPayment(f, true); },
  tenantPay(f) { submitPayment(f, false); },
  addRoom(f) { db.rooms.push({ id: uid(), name: f.name.trim(), capacity: +f.capacity, rate: +f.rate }); save(); render(); toast('Room added.'); },
  announce(f, form) {
    db.announcements.push({ id: uid(), title: f.title.trim(), message: f.message.trim(), priority: f.priority, roomId: f.audience === 'all' ? null : f.audience, date: new Date().toISOString() });
    save(); render(); toast('Announcement posted.');
  },
  complaint(f) {
    db.complaints.push({ id: uid(), tenantId: myTenant().id, category: f.category, subject: f.subject.trim(), message: f.message.trim(), status: 'open', reply: '', date: new Date().toISOString() });
    save(); render(); toast('Report sent to your owner.');
  },
  respond(f) { const c = db.complaints.find(x => x.id === f.id); c.status = f.status; c.reply = f.reply.trim(); c.updatedAt = new Date().toISOString(); save(); closeDlg(); render(); toast('Report updated.'); },
  settings(f) { Object.assign(db.settings, f); save(); render(); toast('Settings saved.'); },
  changePw(f, form) {
    if (me.pass !== hash(f.old)) return toast('Current password is wrong.', true);
    me.pass = hash(f.pw); save(); form.reset(); toast('Password updated.');
  }
};
function submitPayment(f, isOwner) {
  const t = tenantOf(f.tenantId); const amount = +f.amount;
  if (!t || !f.month) return toast('Choose a month to pay.', true);
  const av = availFor(t, f.month);
  if (!(amount > 0) || amount > av + 0.001) return toast(`Amount must be between ₱1 and ${peso(av)}.`, true);
  if (!isOwner && !channels().includes(f.method)) return toast('Your owner has not set up that payment method yet.', true);
  if (f.method !== 'cash' && !f.ref.trim()) return toast('Please enter the reference number.', true);
  db.payments.push({ id: uid(), tenantId: t.id, month: f.month, amount, method: f.method, ref: f.ref.trim(), note: f.note.trim(), status: isOwner ? 'confirmed' : 'pending', date: new Date().toISOString(), by: isOwner ? 'owner' : 'tenant' });
  save(); closeDlg(); ui.payMonth = '';
  if (!isOwner) ui.page = 'history';
  render(); toast(isOwner ? 'Payment recorded.' : 'Submitted! Your owner will confirm it.');
}

/* =====================================================================
   EVENT HANDLING (delegated)
   ===================================================================== */
const actions = {
  nav: d => { ui.page = d.id; render(); },
  goto: d => { closeDlg(); ui.page = d.id; render(); },
  delAnn: d => {
    if (!confirm('Delete this announcement? Tenants will no longer see it.')) return;
    db.announcements = db.announcements.filter(a => a.id !== d.id); save(); render(); toast('Announcement deleted.');
  },
  logout,
  copy: d => { (navigator.clipboard ? navigator.clipboard.writeText(d.text) : Promise.reject()).then(() => toast('Copied.'), () => toast('Copy failed – select the text manually.', true)); },
  addTenant: () => openDlg('Add tenant', tenantForm(null)),
  editTenant: d => openDlg('Edit tenant', tenantForm(tenantOf(d.id))),
  viewTenant: d => { const t = tenantOf(d.id); openDlg(t.name + ' – ledger', ledgerHTML(t), true); },
  delTenant: d => {
    const t = tenantOf(d.id);
    if (!confirm(`Delete ${t.name}, their login, payments and reports? This cannot be undone.`)) return;
    db.users = db.users.filter(u => u.id !== t.userId); db.payments = db.payments.filter(p => p.tenantId !== t.id);
    db.complaints = db.complaints.filter(c => c.tenantId !== t.id); db.tenants = db.tenants.filter(x => x.id !== t.id);
    save(); closeDlg(); render(); toast('Tenant deleted.');
  },
  resetPw: d => {
    const t = tenantOf(d.id); const u = db.users.find(x => x.id === t.userId); if (!u) return;
    if (!confirm(`Reset the password for ${t.name}? Their current password will stop working right away.`)) return;
    const p = randPass(); u.pass = hash(p); save(); credDialog(t.name, u.username, p);
  },
  delRoom: d => {
    if (db.tenants.some(t => t.roomId === d.id)) return toast('Move or remove the tenants in this room first.', true);
    if (!confirm('Delete this room?')) return; db.rooms = db.rooms.filter(r => r.id !== d.id); save(); render();
  },
  recordPay: d => {
    if (!db.tenants.length) return toast('Add a tenant first.', true);
    openDlg('Record payment', payForm(d.id || db.tenants[0].id, true)); syncAmount();
  },
  confirmPay: d => {
    const p = db.payments.find(x => x.id === d.id); const t = tenantOf(p.tenantId); const i = monthInfo(t, p.month);
    if (i.paid + p.amount > i.rent + 0.001) return toast('This would exceed the rent for that month. Reject or void another payment first.', true);
    p.status = 'confirmed'; p.confirmedAt = p.resolvedAt = new Date().toISOString(); save(); render(); toast('Payment confirmed.');
  },
  rejectPay: d => {
    const why = prompt('Reason for rejecting (the tenant will see this):', 'Payment not received'); if (why === null) return;
    const p = db.payments.find(x => x.id === d.id); p.status = 'rejected'; p.note = why; p.resolvedAt = new Date().toISOString(); save(); render(); toast('Payment rejected.');
  },
  voidPay: d => {
    if (!confirm('Void this confirmed payment? The balance will increase again.')) return;
    const p = db.payments.find(x => x.id === d.id); p.status = 'rejected'; p.note = 'Voided by owner'; p.resolvedAt = new Date().toISOString(); save(); render(); toast('Payment voided.');
  },
  respond: d => {
    const c = db.complaints.find(x => x.id === d.id);
    openDlg('Respond to report', `<p><b>${esc(c.subject)}</b></p><p class="muted">${esc(c.message)}</p><form data-form="respond"><input type="hidden" name="id" value="${c.id}">
      <div class="field"><label>Status</label><select name="status">${['open', 'in_progress', 'resolved'].map(s => `<option value="${s}" ${c.status === s ? 'selected' : ''}>${STATUS_LABEL[s]}</option>`).join('')}</select></div>
      <div class="field"><label>Reply to tenant</label><textarea name="reply">${esc(c.reply)}</textarea></div><button class="btn primary block">Save</button></form>`);
  },
  payNow: d => { ui.payMonth = d.ym || ''; ui.page = 'pay'; render(); },
  backup: () => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }));
    a.download = `oppa-yopa-backup-${todayStr()}.json`; a.click(); URL.revokeObjectURL(a.href);
  },
  resetAll: () => {
    if (!confirm('Erase ALL data and restore the demo data?')) return;
    localStorage.removeItem(KEY); localStorage.removeItem(SESSION); db = load(); me = null; render();
  }
};

document.addEventListener('click', e => {
  if (e.target.closest('[data-close]')) return closeDlg();
  if (e.target.id === 'dlg') return closeDlg();
  const el = e.target.closest('[data-action]'); if (!el) return;
  const fn = actions[el.dataset.action]; if (fn) fn(el.dataset);
});
document.addEventListener('submit', e => {
  const name = e.target.dataset.form; if (!name) return;
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  if (forms[name]) forms[name](f, e.target);
});
/* live search / filters re-render just the list so typing keeps focus */
document.addEventListener('input', e => {
  const k = e.target.dataset && e.target.dataset.live;
  if (k) { ui[k] = e.target.value; refreshRows(); return; }
  if (e.target.id === 'tf-name') { const u = $('#tf-user'); if (u && !u.dataset.dirty) u.value = slug(e.target.value); }
  if (e.target.id === 'tf-user') e.target.dataset.dirty = '1';
});
document.addEventListener('change', e => {
  const k = e.target.dataset && e.target.dataset.live;
  if (k) { ui[k] = e.target.value; refreshRows(); return; }
  if (e.target.id === 'tf-room') { const o = e.target.selectedOptions[0]; if (o) $('#tf-rent').value = o.dataset.rate; }
  if (e.target.id === 'pf-t') { const t = tenantOf(e.target.value); $('#pf-m').innerHTML = monthOptions(t); syncAmount(); }
  if (e.target.id === 'pf-m') syncAmount();
});
function refreshRows() {
  refreshRowsRaw();
  labelTables($('#rows'));
}
function refreshRowsRaw() {
  const box = $('#rows'); if (!box) return;
  if (ui.page === 'tenants') box.innerHTML = tenantRows();
  else if (ui.page === 'payments') box.innerHTML = paymentRows();
  else if (ui.page === 'complaints') box.innerHTML = complaintCards(db.complaints.filter(c => ui.cf === 'all' || c.status === ui.cf).sort((a, b) => b.date.localeCompare(a.date)), true);
}
/* the Pay Rent page needs its amount filled once rendered */
const _render = render;
render = function () {
  _render();
  if (me) labelTables($('#app'));
  if (me && me.role === 'tenant' && ui.page === 'pay') syncAmount();
};

/* ---------- Start ---------- */
db = load();
me = db.users.find(u => u.id === localStorage.getItem(SESSION)) || null;
if (me) ui.page = me.role === 'owner' ? 'dashboard' : 'lease';
render();
