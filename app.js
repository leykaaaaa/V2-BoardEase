'use strict';
/* =====================================================================
   BoardEase – Boarding House / Dorm Rent Tracker
   Plain HTML + CSS + JavaScript. All data lives in localStorage.
   NOTE: This is a front-end-only demo. Passwords are lightly hashed in
   the browser, which is NOT real security. A real deployment needs a
   server and database.
   ===================================================================== */

/* ---------- Helpers ---------- */
const KEY = 'boardease_v1', SESSION = 'boardease_session';
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = n => String(n).padStart(2, '0');
const peso = n => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => toISO(new Date());
const curYM = () => todayStr().slice(0, 7);
const addMonths = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const ymLabel = ym => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' }); };
const fmtDate = s => { if (!s) return '—'; const d = new Date(s.length === 10 ? s + 'T00:00:00' : s); return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); };
const hash = str => { let h = 5381; const s = 'be$' + str; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return 'h' + (h >>> 0).toString(36); };
const randPass = () => { const c = 'abcdefghjkmnpqrstuvwxyz23456789'; let p = ''; for (let i = 0; i < 8; i++) p += c[Math.floor(Math.random() * c.length)]; return p; };
const slug = n => n.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '').slice(0, 20);
const METHOD = { cash: 'Cash', gcash: 'GCash', bank: 'Bank transfer' };
const STATUS_LABEL = { paid: 'Paid', partial: 'Partial', overdue: 'Overdue', unpaid: 'Unpaid', upcoming: 'Upcoming', pending: 'Pending confirmation', confirmed: 'Confirmed', rejected: 'Rejected', open: 'Open', in_progress: 'In progress', resolved: 'Resolved' };
const badge = (st, label) => `<span class="badge ${st}">${esc(label || STATUS_LABEL[st] || st)}</span>`;

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
    settings: { boardName: 'BoardEase Dorm', gcashName: '', gcashNumber: '', bankName: '', bankAcct: '', bankHolder: '', instructions: '' }
  };
}
function load() {
  try { const r = JSON.parse(localStorage.getItem(KEY)); if (r && r.users) return r; } catch (e) { /* ignore */ }
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
  if (!d.open) d.showModal();
}
const closeDlg = () => { const d = $('#dlg'); if (d.open) d.close(); };
function empty(msg) { return `<div class="empty">${esc(msg)}</div>`; }

/* ---------- Auth ---------- */
function login(f) {
  const u = db.users.find(x => x.username === f.username.trim().toLowerCase());
  if (!u || u.pass !== hash(f.password)) return toast('Wrong username or password.', true);
  me = u; localStorage.setItem(SESSION, u.id); ui.page = u.role === 'owner' ? 'dashboard' : 'lease'; render();
}
function logout() { me = null; localStorage.removeItem(SESSION); render(); }

function loginView() {
  return `<div class="login-wrap"><form class="login-card" data-form="login">
    <div class="brand"><span class="logo">🏠</span>BoardEase</div>
    <p class="sub">Sign in to manage or pay your boarding house rent.</p>
    <div class="field"><label for="lu">Username</label><input id="lu" name="username" autocomplete="username" required autofocus></div>
    <div class="field"><label for="lp">Password</label><input id="lp" name="password" type="password" autocomplete="current-password" required></div>
    <button class="btn primary block">Sign in</button>
    <div class="hint"><b>Demo accounts</b><br>Owner: <code>owner</code> / <code>owner123</code><br>Tenant: <code>juan</code> / <code>tenant123</code><br>Tenant accounts are created by the owner.</div>
  </form></div>`;
}

/* ---------- Shell ---------- */
const OWNER_NAV = [['dashboard', '📊', 'Dashboard'], ['tenants', '👥', 'Tenants'], ['rooms', '🛏️', 'Rooms'], ['payments', '💳', 'Payments'], ['complaints', '📣', 'Reports'], ['settings', '⚙️', 'Settings']];
const TENANT_NAV = [['lease', '📄', 'My Lease'], ['pay', '💸', 'Pay Rent'], ['history', '🧾', 'My Payments'], ['reports', '📣', 'Send a Report'], ['account', '🔑', 'Account']];

function navCount(id) {
  if (id === 'payments') return db.payments.filter(p => p.status === 'pending').length;
  if (id === 'complaints') return db.complaints.filter(c => c.status === 'open').length;
  return 0;
}
function render() {
  const app = $('#app');
  if (!me) { app.innerHTML = loginView(); return; }
  const nav = me.role === 'owner' ? OWNER_NAV : TENANT_NAV;
  if (!nav.some(n => n[0] === ui.page)) ui.page = nav[0][0];
  const pages = { dashboard: pgDashboard, tenants: pgTenants, rooms: pgRooms, payments: pgPayments, complaints: pgComplaints, settings: pgSettings, lease: pgLease, pay: pgPay, history: pgHistory, reports: pgReports, account: pgAccount };
  app.innerHTML = `<div class="shell"><aside class="side">
    <div class="brand"><span class="logo">🏠</span>${esc(db.settings.boardName || 'BoardEase')}</div>
    ${nav.map(([id, ic, lb]) => { const c = me.role === 'owner' ? navCount(id) : 0; return `<button class="nav-btn ${ui.page === id ? 'active' : ''}" data-action="nav" data-id="${id}"><span>${ic}</span>${lb}${c ? `<span class="count">${c}</span>` : ''}</button>`; }).join('')}
    <div class="spacer"></div>
    <div class="who"><b>${esc(me.name)}</b><span>${me.role}</span></div>
    <button class="nav-btn" data-action="logout"><span>🚪</span>Log out</button>
  </aside><main>${pages[ui.page]()}</main></div>`;
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
  const pending = db.payments.filter(p => p.status === 'pending').length;
  const rows = db.tenants.map(t => {
    const s = tenantStatus(t); const i = monthsOf(t).includes(ym) ? monthInfo(t, ym) : null;
    return `<tr><td><b>${esc(t.name)}</b></td><td>${esc(roomName(t.roomId))}</td>
      <td class="num">${i ? peso(i.rent) : '—'}</td><td class="num">${i ? peso(i.paid) : '—'}</td>
      <td class="num">${peso(s.balance)}</td><td>${statusBadge(s)}</td>
      <td><button class="btn sm primary" data-action="recordPay" data-id="${t.id}">Record payment</button></td></tr>`;
  }).join('');
  return `<div class="page-head"><div><h2>Dashboard</h2><p>${ymLabel(ym)} overview · ${esc(fmtDate(todayStr()))}</p></div></div>
  <div class="cards">
    <div class="stat"><small>Tenants</small><strong>${db.tenants.length}</strong></div>
    <div class="stat"><small>Collected this month</small><strong>${peso(collected)}</strong><small>of ${peso(expected)} expected</small></div>
    <div class="stat"><small>Total outstanding</small><strong>${peso(outstanding)}</strong></div>
    <div class="stat"><small>Overdue accounts</small><strong style="color:var(--red)">${overdue}</strong></div>
    <div class="stat click" data-action="nav" data-id="payments"><small>Awaiting your confirmation</small><strong style="color:var(--amber)">${pending}</strong></div>
  </div>
  <div class="card"><h3>Who has paid? (${ymLabel(ym)})</h3><div class="table-wrap">${rows ? `<table><thead><tr><th>Tenant</th><th>Room</th><th class="num">Rent</th><th class="num">Paid</th><th class="num">Balance owed</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : empty('No tenants yet. Go to Tenants to add one.')}</div></div>`;
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
  return `<table><thead><tr><th>Tenant</th><th>Room</th><th class="num">Rent / mo</th><th>Due day</th><th>Lease</th><th class="num">Balance</th><th>Status</th><th></th></tr></thead><tbody>${list.map(t => {
    const s = tenantStatus(t); const u = db.users.find(x => x.id === t.userId);
    return `<tr><td><b>${esc(t.name)}</b><div class="muted small">${esc(t.contact)} · @${esc(u ? u.username : '?')}</div></td><td>${esc(roomName(t.roomId))}</td>
      <td class="num">${peso(t.rent)}</td><td>${t.dueDay}</td><td class="small">${fmtDate(t.start)}<br>to ${fmtDate(leaseEnd(t))}</td>
      <td class="num">${peso(s.balance)}</td><td>${statusBadge(s)}</td>
      <td><div class="actions"><button class="btn sm" data-action="viewTenant" data-id="${t.id}">Ledger</button><button class="btn sm" data-action="recordPay" data-id="${t.id}">Pay</button><button class="btn sm" data-action="editTenant" data-id="${t.id}">Edit</button><button class="btn sm" data-action="resetPw" data-id="${t.id}">Reset pw</button><button class="btn sm danger" data-action="delTenant" data-id="${t.id}">Delete</button></div></td></tr>`;
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
    <button class="btn block" data-action="copy" data-text="${esc('BoardEase login\nUsername: ' + username + '\nPassword: ' + password)}">Copy to clipboard</button>`);
}
function ledgerHTML(t) {
  const infos = monthsOf(t).map(m => monthInfo(t, m));
  const pays = db.payments.filter(p => p.tenantId === t.id).sort((a, b) => b.date.localeCompare(a.date));
  return `<dl class="kv"><dt>Room</dt><dd>${esc(roomName(t.roomId))}</dd><dt>Rent</dt><dd>${peso(t.rent)} / month, due every ${t.dueDay}th</dd><dt>Lease</dt><dd>${fmtDate(t.start)} – ${fmtDate(leaseEnd(t))}</dd><dt>Deposit</dt><dd>${peso(t.deposit)}</dd><dt>Contact</dt><dd>${esc(t.contact)}</dd></dl>
  <h3 style="margin:18px 0 8px">Monthly schedule</h3><div class="table-wrap"><table><thead><tr><th>Month</th><th class="num">Rent</th><th class="num">Paid</th><th class="num">Balance</th><th>Status</th></tr></thead><tbody>
  ${infos.map(i => `<tr><td>${ymLabel(i.ym)}</td><td class="num">${peso(i.rent)}</td><td class="num">${peso(i.paid)}</td><td class="num">${peso(i.balance)}</td><td>${infoBadge(i)}</td></tr>`).join('')}</tbody></table></div>
  <h3 style="margin:18px 0 8px">Payment history</h3>${paymentTable(pays, false, false)}`;
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
    return `<tr><td><b>${esc(r.name)}</b></td><td>${occ.length}/${r.capacity}<div class="muted small">${occ.map(t => esc(t.name)).join(', ') || 'Vacant'}</div></td><td class="num">${peso(r.rate)}</td><td><button class="btn sm danger" data-action="delRoom" data-id="${r.id}">Delete</button></td></tr>`;
  }).join('')}</tbody></table></div>` : empty('No rooms yet.')}</div></div>`;
}

/* --- Payments (owner) --- */
function paymentTable(list, owner, showTenant = true) {
  if (!list.length) return empty('No payments found.');
  return `<table><thead><tr><th>Date</th>${showTenant ? '<th>Tenant</th>' : ''}<th>For month</th><th class="num">Amount</th><th>Method</th><th>Reference</th><th>Status</th>${owner ? '<th></th>' : ''}</tr></thead><tbody>${list.map(p => {
    const t = tenantOf(p.tenantId);
    let act = '';
    if (owner) {
      if (p.status === 'pending') act = `<button class="btn sm ok" data-action="confirmPay" data-id="${p.id}">Confirm received</button><button class="btn sm danger" data-action="rejectPay" data-id="${p.id}">Reject</button>`;
      else if (p.status === 'confirmed') act = `<button class="btn sm danger" data-action="voidPay" data-id="${p.id}">Void</button>`;
    }
return `<tr><td class="small">${fmtDate(p.date)}</td>${showTenant ? `<td>${esc(t ? t.name : 'Deleted')}</td>` : ''}<td>${ymLabel(p.month)}</td><td class="num">${peso(p.amount)}</td>
      <td>${METHOD[p.method]}${p.method === 'cash' ? '<div class="muted small">recorded by owner</div>' : ''}</td><td class="small">${esc(p.ref) || '—'}${p.note ? `<div class="muted">${esc(p.note)}</div>` : ''}</td><td>${badge(p.status)}</td>${owner ? `<td><div class="actions">${act}</div></td>` : ''}</tr>`;
  }).join('')}</tbody></table>`;
}
function pgPayments() {
  const pend = db.payments.filter(p => p.status === 'pending').sort((a, b) => a.date.localeCompare(b.date));
  return `<div class="page-head"><div><h2>Payments</h2><p>Confirm GCash/bank payments, and record cash payments.</p></div><button class="btn primary" data-action="recordPay" data-id="">+ Record payment</button></div>
    <div class="card"><h3>Awaiting confirmation (${pend.length})</h3><p class="muted small" style="margin-top:-6px">Check your GCash or bank app for the reference number before confirming.</p><div class="table-wrap">${pend.length ? paymentTable(pend, true) : empty('Nothing to confirm right now.')}</div></div>
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
  const methods = isOwner ? ['cash', 'gcash', 'bank'] : ['gcash', 'bank'];
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
  return `<div class="page-head"><div><h2>My Lease</h2><p>Hello, ${esc(t.name)}</p></div><button class="btn primary" data-action="payNow" data-ym="">Pay rent</button></div>
  ${s.status === 'overdue' ? `<div class="alert red">You have an overdue balance of ${peso(s.balance)}. Please pay as soon as possible.</div>` : s.balance > 0 ? `<div class="alert amber">Outstanding balance: ${peso(s.balance)}.</div>` : ''}
  <div class="cards"><div class="stat"><small>Balance now</small><strong>${peso(s.balance)}</strong></div>
    <div class="stat"><small>Monthly rent</small><strong>${peso(t.rent)}</strong></div>
    <div class="stat"><small>Next payment due</small><strong>${next ? fmtDate(next.due) : 'All paid'}</strong></div></div>
  <div class="two"><div class="card"><h3>Lease details</h3><dl class="kv"><dt>Room</dt><dd>${esc(roomName(t.roomId))}</dd><dt>Lease period</dt><dd>${fmtDate(t.start)} – ${fmtDate(leaseEnd(t))} (${t.months} mo)</dd><dt>Rent due</dt><dd>Every ${t.dueDay}th of the month</dd><dt>Deposit</dt><dd>${peso(t.deposit)}</dd><dt>Contact on file</dt><dd>${esc(t.contact)}</dd></dl></div></div>
  <div class="card"><h3>Monthly rent schedule</h3><div class="table-wrap"><table><thead><tr><th>Month</th><th>Due date</th><th class="num">Rent</th><th class="num">Paid</th><th class="num">Balance</th><th>Status</th><th></th></tr></thead><tbody>
  ${infos.map(i => `<tr><td>${ymLabel(i.ym)}</td><td>${fmtDate(i.due)}</td><td class="num">${peso(i.rent)}</td><td class="num">${peso(i.paid)}${i.methods.length ? `<div class="muted small">via ${i.methods.map(m => METHOD[m].toLowerCase()).join(', ')}</div>` : ''}</td><td class="num">${peso(i.balance)}</td>
  <td>${infoBadge(i)}${i.pending > 0 ? `<div class="muted small">${peso(i.pending)} awaiting confirmation</div>` : ''}</td>
  <td>${availFor(t, i.ym) > 0 ? `<button class="btn sm" data-action="payNow" data-ym="${i.ym}">Pay</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>`;
}
function pgPay() {
  const t = myTenant(); if (!t) return noLease(); const s = db.settings;
  const hasDetails = s.gcashNumber || s.bankAcct;
  return `<div class="page-head"><div><h2>Pay Rent</h2><p>Pay through GCash or bank, then submit the reference number.</p></div></div>
  <div class="two"><div class="card"><h3>1. Send your payment</h3>
    ${s.gcashNumber ? `<div class="cmp"><b>GCash</b><br>${esc(s.gcashName)}<br><b>${esc(s.gcashNumber)}</b></div>` : ''}
    ${s.bankAcct ? `<div class="cmp"><b>${esc(s.bankName || 'Bank')}</b><br>${esc(s.bankHolder)}<br><b>${esc(s.bankAcct)}</b></div>` : ''}
    ${hasDetails ? '' : '<div class="note">Your owner has not added GCash/bank details yet. Please ask them.</div>'}
    ${s.instructions ? `<div class="note">${esc(s.instructions)}</div>` : ''}
    <div class="note"><b>Paying in cash?</b> Hand it to your owner. They will record it and it will appear in your payments as “paid via cash”.</div></div>
  <div class="card"><h3>2. Submit for confirmation</h3>${payForm(t.id, false)}</div></div>`;
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
  complaint(f) {
    db.complaints.push({ id: uid(), tenantId: myTenant().id, category: f.category, subject: f.subject.trim(), message: f.message.trim(), status: 'open', reply: '', date: new Date().toISOString() });
    save(); render(); toast('Report sent to your owner.');
  },
  respond(f) { const c = db.complaints.find(x => x.id === f.id); c.status = f.status; c.reply = f.reply.trim(); save(); closeDlg(); render(); toast('Report updated.'); },
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
    save(); render(); toast('Tenant deleted.');
  },
  resetPw: d => {
    const t = tenantOf(d.id); const u = db.users.find(x => x.id === t.userId); if (!u) return;
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
    p.status = 'confirmed'; p.confirmedAt = new Date().toISOString(); save(); render(); toast('Payment confirmed.');
  },
  rejectPay: d => {
    const why = prompt('Reason for rejecting (the tenant will see this):', 'Payment not received'); if (why === null) return;
    const p = db.payments.find(x => x.id === d.id); p.status = 'rejected'; p.note = why; save(); render(); toast('Payment rejected.');
  },
  voidPay: d => {
    if (!confirm('Void this confirmed payment? The balance will increase again.')) return;
    const p = db.payments.find(x => x.id === d.id); p.status = 'rejected'; p.note = 'Voided by owner'; save(); render(); toast('Payment voided.');
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
    a.download = `boardease-backup-${todayStr()}.json`; a.click(); URL.revokeObjectURL(a.href);
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
  const box = $('#rows'); if (!box) return;
  if (ui.page === 'tenants') box.innerHTML = tenantRows();
  else if (ui.page === 'payments') box.innerHTML = paymentRows();
  else if (ui.page === 'complaints') box.innerHTML = complaintCards(db.complaints.filter(c => ui.cf === 'all' || c.status === ui.cf).sort((a, b) => b.date.localeCompare(a.date)), true);
}
/* the Pay Rent page needs its amount filled once rendered */
const _render = render;
render = function () { _render(); if (me && me.role === 'tenant' && ui.page === 'pay') syncAmount(); };
 
/* ---------- Start ---------- */
db = load();
me = db.users.find(u => u.id === localStorage.getItem(SESSION)) || null;
if (me) ui.page = me.role === 'owner' ? 'dashboard' : 'lease';
render();
                                                                                                                                                                                                                                  
