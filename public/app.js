// ============= API CLIENT =============
const API = {
  token: localStorage.getItem("ip_token") || null,
  setToken(t) { this.token = t; if (t) localStorage.setItem("ip_token", t); else localStorage.removeItem("ip_token"); },
  async fetch(url, opts = {}) {
    const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
    if (this.token) headers.Authorization = "Bearer " + this.token;
    const res = await fetch(url, { ...opts, headers });
    if (res.status === 401) {
      this.setToken(null);
      showLogin();
      throw new Error("unauthorized");
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "request_failed");
    }
    return res.json();
  },
  login(email, password) {
    return fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    }).then(async r => {
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "login_failed");
      return data;
    });
  },
  changePassword(newPassword) { return this.fetch("/api/auth/change-password", { method: "POST", body: JSON.stringify({ newPassword }) }); },
  me() { return this.fetch("/api/me"); },
  accounts() { return this.fetch("/api/accounts"); },
  schedule() { return this.fetch("/api/schedule"); },
  createReplacements(payload) { return this.fetch("/api/replacements", { method: "POST", body: JSON.stringify(payload) }); },
  notifications() { return this.fetch("/api/notifications"); },
  readNotif(id) { return this.fetch(`/api/notifications/${id}/read`, { method: "POST" }); },
  readAllNotif() { return this.fetch("/api/notifications/read-all", { method: "POST" }); },
};

// ============= GLOBAL STATE =============
let DATA = null;        // schedule per dept
let ACCOUNTS = [];      // [{id, email, name, role, dept, depts, subjects}]
let ALL_TEACHERS = {};  // teacher name -> stats
let CONFLICTS = [];
let CURRENT_USER = null;
let NOTIFICATIONS = [];
const DEPTS = ["Империал","Пушкина","Чкалова"];
const DAYS = ["Понедельник","Вторник","Среда","Четверг","Пятница"];

let state = {
  section: "schedule",
  dept: "Империал",
  day: "Понедельник",
  view: "grid",
  classFilter: "all",
};

let pendingLoginEmail = null;

// ============= UTILS =============
function escapeHtml(s) {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[ch]);
}
function getInitials(name) {
  const parts = (name || "").trim().split(/\s+/);
  return ((parts[0] || "")[0] || "?").toUpperCase();
}
function avatarColor(name) {
  const colors = ["av-cyan","av-green","av-magenta","av-yellow","av-blue"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
}
function deptCssClass(d) { return d === "Пушкина" ? "dept-push" : d === "Чкалова" ? "dept-chk" : "dept-imp"; }
function subjectClass(subj) {
  if (!subj) return "";
  const s = subj.toLowerCase();
  if (s.includes("матем") || s.includes("алгебр") || s.includes("геометр")) return "subj-mat";
  if (s.includes("русск") || s.includes("литерат") || s.includes("чтени") || s.includes("письм") || s.includes("грамот")) return "subj-rus";
  if (s.includes("англ") || s.includes("информ")) return "subj-eng";
  if (s.includes("биолог") || s.includes("истор") || s.includes("географ") || s.includes("обществ") || s.includes("окруж") || s.includes("естество")) return "subj-bio";
  if (s.includes("физик") || s.includes("хими")) return "subj-fiz";
  if (s.includes("изо") || s.includes("музык") || s.includes("творч") || s.includes("художн") || s.includes("театр") || s.includes("вокал") || s.includes("хореограф")) return "subj-art";
  if (s.includes("физкульт") || s.includes("физическ")) return "subj-sport";
  if (s.includes("прогул")) return "subj-walk";
  return "";
}
function fmtWhen(d) {
  d = new Date(d);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return "только что";
  if (diff < 3600) return Math.floor(diff/60) + " мин назад";
  if (diff < 86400) return Math.floor(diff/3600) + " ч назад";
  return d.toLocaleString("ru-RU");
}

// ============= AUTH UI =============
function showLogin() {
  document.getElementById("appRoot").style.display = "none";
  document.getElementById("loginOverlay").classList.remove("hidden");
  document.getElementById("loginStep1").style.display = "";
  document.getElementById("loginStep2").style.display = "none";
}
async function doLogin() {
  const email = (document.getElementById("loginEmail").value || "").trim();
  const pwd = document.getElementById("loginPassword").value || "";
  const err = document.getElementById("loginError");
  err.textContent = "";
  if (!email || !pwd) { err.textContent = "Введите email и пароль"; return; }
  try {
    const data = await API.login(email, pwd);
    if (data.mustChange) {
      pendingLoginEmail = email;
      API.setToken(data.token); // temporary, only for change-password call
      document.getElementById("loginStep1").style.display = "none";
      document.getElementById("loginStep2").style.display = "";
      return;
    }
    API.setToken(data.token);
    CURRENT_USER = data.user;
    await enterApp();
  } catch (e) {
    if (e.message === "no_user") err.textContent = "Такого email нет в системе";
    else if (e.message === "wrong_password") err.textContent = "Неверный пароль";
    else err.textContent = "Ошибка входа: " + e.message;
  }
}
async function doChangePassword() {
  const p1 = document.getElementById("newPwd1").value;
  const p2 = document.getElementById("newPwd2").value;
  const err = document.getElementById("pwdError");
  err.textContent = "";
  if (!p1 || p1.length < 6) { err.textContent = "Минимум 6 символов"; return; }
  if (p1 !== p2) { err.textContent = "Пароли не совпадают"; return; }
  if (p1 === "12345") { err.textContent = "Нельзя использовать первичный пароль"; return; }
  try {
    await API.changePassword(p1);
    // re-login with new password to get fresh token
    const data = await API.login(pendingLoginEmail, p1);
    API.setToken(data.token);
    CURRENT_USER = data.user;
    await enterApp();
  } catch (e) {
    err.textContent = "Ошибка: " + e.message;
  }
}
function logout() {
  API.setToken(null);
  CURRENT_USER = null;
  document.getElementById("appRoot").style.display = "none";
  document.getElementById("loginOverlay").classList.remove("hidden");
  document.getElementById("loginEmail").value = "";
  document.getElementById("loginPassword").value = "";
  document.getElementById("loginStep1").style.display = "";
  document.getElementById("loginStep2").style.display = "none";
}
async function showEmailList() {
  // No auth required — fetch open list
  let accounts = ACCOUNTS;
  if (!accounts.length) {
    try {
      const r = await fetch("/api/accounts-public");
      if (r.ok) accounts = (await r.json()).accounts;
    } catch(e) {}
  }
  const modal = document.getElementById("emailListModal");
  const body = document.getElementById("emailListBody");
  const heads = accounts.filter(a => a.role === "head");
  const teachers = accounts.filter(a => a.role === "teacher").sort((a,b) => a.name.localeCompare(b.name, "ru"));
  let html = "";
  html += `<div style="font-size:11px;color:var(--text-muted);margin-top:8px;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Руководители</div>`;
  for (const a of heads) {
    html += `<div class="email-row" onclick="document.getElementById('loginEmail').value='${a.email}'; document.getElementById('emailListModal').classList.remove('show'); document.getElementById('loginPassword').focus();">
      <span class="name">${escapeHtml(a.name)} · ${escapeHtml(a.dept || '')}</span>
      <span class="email">${escapeHtml(a.email)}</span>
    </div>`;
  }
  if (!heads.length && !teachers.length) {
    html = `<div style="padding:14px;color:var(--text-muted);font-size:12px;">Чтобы увидеть список email-ов, войдите как любой пользователь. На первом запуске список не доступен из соображений приватности.</div>`;
  } else {
    html += `<div style="font-size:11px;color:var(--text-muted);margin-top:14px;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Учителя (${teachers.length})</div>`;
    for (const a of teachers) {
      html += `<div class="email-row" onclick="document.getElementById('loginEmail').value='${a.email}'; document.getElementById('emailListModal').classList.remove('show'); document.getElementById('loginPassword').focus();">
        <span class="name">${escapeHtml(a.name)} · ${(a.depts || []).join(", ")}</span>
        <span class="email">${escapeHtml(a.email)}</span>
      </div>`;
    }
  }
  body.innerHTML = html;
  modal.classList.add("show");
}

// ============= ENTER APP =============
async function enterApp() {
  document.getElementById("loginOverlay").classList.add("hidden");
  document.getElementById("appRoot").style.display = "";
  await loadInitialData();
  initUI();
  startNotificationPolling();
}

async function loadInitialData() {
  const [schedRes, accRes] = await Promise.all([API.schedule(), API.accounts()]);
  DATA = schedRes;
  ACCOUNTS = accRes.accounts;
  ALL_TEACHERS = buildAllTeachersData();
  CONFLICTS = findConflicts();
}

// ============= DATA AGGREGATION =============
function buildAllTeachersData() {
  const out = {};
  const norm = s => (s || "").replace(/\s+/g, " ").trim();
  for (const dept of DEPTS) {
    if (!DATA[dept]) continue;
    const sched = DATA[dept].schedule;
    for (const day in sched) {
      for (const lkey in sched[day]) {
        const ld = sched[day][lkey];
        for (const cls in ld.classes) {
          const info = ld.classes[cls];
          const items = info.groups ? info.groups : [info];
          for (const it of items) {
            if (!it.teacher) continue;
            const t = it.teacher.trim();
            if (!t) continue;
            if (!out[t]) out[t] = { hoursByDept: {}, subjectHours: {}, subjectByDept: {}, classes: new Set(), total: 0 };
            const rec = out[t];
            rec.hoursByDept[dept] = (rec.hoursByDept[dept] || 0) + 1;
            rec.total++;
            const subj = norm(it.subject) || "(без названия)";
            rec.subjectHours[subj] = (rec.subjectHours[subj] || 0) + 1;
            if (!rec.subjectByDept[dept]) rec.subjectByDept[dept] = {};
            rec.subjectByDept[dept][subj] = (rec.subjectByDept[dept][subj] || 0) + 1;
            rec.classes.add(`${dept}/${cls}`);
          }
        }
      }
    }
  }
  return out;
}

function findConflicts() {
  const conflicts = [];
  for (const teacher in ALL_TEACHERS) {
    const slots = [];
    for (const dept of DEPTS) {
      if (!DATA[dept]) continue;
      const sched = DATA[dept].schedule;
      for (const day in sched) {
        for (const lkey in sched[day]) {
          const ld = sched[day][lkey];
          for (const cls in ld.classes) {
            const info = ld.classes[cls];
            const items = info.groups ? info.groups : [info];
            for (const it of items) {
              if (it.teacher && it.teacher.trim() === teacher) {
                slots.push({ dept, day, time: ld.time, lesson_no: ld.lesson_no, cls });
              }
            }
          }
        }
      }
    }
    const byTime = {};
    for (const s of slots) {
      const k = s.day + "|" + s.time;
      if (!byTime[k]) byTime[k] = [];
      byTime[k].push(s);
    }
    for (const k in byTime) {
      const depts = new Set(byTime[k].map(a => a.dept));
      if (depts.size > 1) conflicts.push({ teacher, slots: byTime[k] });
    }
  }
  return conflicts;
}

// ============= RENDER =============
function renderDeptTabs() {
  const root = document.getElementById("deptTabs");
  root.innerHTML = DEPTS.map(d => {
    const cls = "dept-tab " + (d === "Пушкина" ? "t-pushkina" : d === "Чкалова" ? "t-chkalova" : "t-imperial") + (d === state.dept ? " active" : "");
    const meta = DATA[d];
    if (!meta) return "";
    return `<button class="${cls}" onclick="setDept('${d}')">${d} <span style="opacity:0.7;font-weight:400;font-size:12px">· ${meta.classes.length} классов</span></button>`;
  }).join("");
}
function renderDayTabs() {
  const root = document.getElementById("dayTabs");
  root.innerHTML = DAYS.map(d => `<button class="day-tab ${d === state.day ? 'active' : ''}" onclick="setDay('${d}')">${d}</button>`).join("");
}
function renderStats() {
  const root = document.getElementById("statsRow");
  const dept = DATA[state.dept];
  if (!dept) return;
  const sched = dept.schedule;
  const teachers = new Set();
  for (const day in sched) {
    for (const lkey in sched[day]) {
      const ld = sched[day][lkey];
      for (const cls in ld.classes) {
        const info = ld.classes[cls];
        const items = info.groups ? info.groups : [info];
        for (const it of items) { if (it.teacher) teachers.add(it.teacher); }
      }
    }
  }
  root.innerHTML = `
    <div class="stat-card cyan"><div class="label">Классов</div><div class="value">${dept.classes.length}</div></div>
    <div class="stat-card magenta"><div class="label">Учителей</div><div class="value">${teachers.size}</div></div>
    <div class="stat-card"><div class="label">Конфликтов</div><div class="value">${CONFLICTS.length}</div></div>
  `;
}
function renderConflictPanel() {
  const root = document.getElementById("conflictPanel");
  if (CONFLICTS.length === 0) { root.innerHTML = ""; return; }
  const items = CONFLICTS.slice(0, 5).map(c =>
    `<div class="conflict-item">⚠ <b>${escapeHtml(c.teacher)}</b> — ${c.slots[0].day} ${escapeHtml(c.slots[0].time)}: ${c.slots.map(s => `${s.dept} (${s.cls} кл.)`).join(", ")}</div>`
  ).join("");
  root.innerHTML = `<div class="conflict-panel"><h3>⚠ Конфликты учителей между отделениями (${CONFLICTS.length})</h3>${items}${CONFLICTS.length > 5 ? `<div class="conflict-item">… и ещё ${CONFLICTS.length - 5}</div>` : ""}</div>`;
}
function renderCellContent(info, conflictTeachers) {
  if (!info) return '';
  const items = info.groups ? info.groups : [info];
  return items.map(it => {
    const subj = it.subject || "—";
    const t = it.teacher || "";
    const r = it.room || info.room || "";
    const sCls = subjectClass(subj);
    const conflict = t && conflictTeachers.has(t);
    return `<div class="cell-group"><div class="cell-subject ${sCls}">${escapeHtml(subj)}${r ? `<span class="cell-room">${escapeHtml(r)}</span>` : ""}</div>${t ? `<div class="cell-teacher" style="${conflict ? 'color:#E6007E;font-weight:600' : ''}">${escapeHtml(t)}${conflict ? ' ⚠' : ''}</div>` : ""}</div>`;
  }).join("");
}
function renderGrid() {
  const dept = DATA[state.dept];
  if (!dept) return;
  const sched = dept.schedule[state.day] || {};
  const lkeys = Object.keys(sched).sort((a, b) => {
    const ma = a.match(/^([LR]?)(\d+)/);
    const mb = b.match(/^([LR]?)(\d+)/);
    const sa = ma[1] === 'R' ? 1 : 0;
    const sb = mb[1] === 'R' ? 1 : 0;
    if (sa !== sb) return sa - sb;
    return parseInt(ma[2]) - parseInt(mb[2]);
  });
  const conflictTeachers = new Set();
  for (const c of CONFLICTS) { if (c.slots[0].day === state.day) conflictTeachers.add(c.teacher); }
  const isChkalova = state.dept === "Чкалова";
  let leftClasses = isChkalova ? ["5","6","7","8","9"] : dept.classes.slice();
  let rightClasses = isChkalova ? ["10","11"] : [];
  if (state.classFilter !== "all") {
    leftClasses = leftClasses.filter(c => c === state.classFilter);
    rightClasses = rightClasses.filter(c => c === state.classFilter);
  }
  const leftKeys = lkeys.filter(k => !sched[k].right_side);
  const rightKeys = lkeys.filter(k => sched[k].right_side);
  function buildTable(keys, classes, label) {
    if (keys.length === 0 || classes.length === 0) return "";
    let html = "";
    if (label) html += `<div style="padding: 10px 14px; background: #F9FAFB; border-bottom: 1px solid var(--border); font-weight: 600; color: var(--text-muted); font-size: 12px; text-transform: uppercase; letter-spacing:0.05em;">${label}</div>`;
    html += `<table class="schedule"><thead><tr><th>№</th><th>Время</th>`;
    for (const cls of classes) html += `<th class="cls-h">${cls} класс</th>`;
    html += `</tr></thead><tbody>`;
    for (const lkey of keys) {
      const ld = sched[lkey];
      html += `<tr><td class="lesson-no">${ld.lesson_no}</td><td class="lesson-time">${escapeHtml(ld.time)}</td>`;
      for (const cls of classes) {
        const info = ld.classes[cls];
        const items = info ? (info.groups ? info.groups : [info]) : [];
        const hasConflictTeacher = items.some(it => it.teacher && conflictTeachers.has(it.teacher));
        html += `<td class="${hasConflictTeacher ? 'has-conflict' : ''}">${renderCellContent(info, conflictTeachers)}</td>`;
      }
      html += `</tr>`;
    }
    html += `</tbody></table>`;
    return html;
  }
  let content = `<div class="grid-wrap">`;
  if (isChkalova) {
    content += buildTable(leftKeys, leftClasses, "Среднее звено (5–9 классы)");
    content += buildTable(rightKeys, rightClasses, "Старшее звено (10–11 классы) · Предуниверсариум");
  } else {
    content += buildTable(leftKeys, leftClasses, null);
  }
  content += `</div>`;
  document.getElementById("mainContent").innerHTML = content;
}
function renderWeek() {
  const dept = DATA[state.dept];
  if (!dept) return;
  const isChkalova = state.dept === "Чкалова";
  const conflictTeachers = new Set();
  for (const c of CONFLICTS) conflictTeachers.add(c.teacher);
  let leftClasses = isChkalova ? ["5","6","7","8","9"] : dept.classes.slice();
  let rightClasses = isChkalova ? ["10","11"] : [];
  if (state.classFilter !== "all") {
    leftClasses = leftClasses.filter(c => c === state.classFilter);
    rightClasses = rightClasses.filter(c => c === state.classFilter);
  }
  function dayBlock(day, classes, sideFilter) {
    const sched = dept.schedule[day] || {};
    const lkeys = Object.keys(sched).sort((a, b) => {
      const ma = a.match(/^([LR]?)(\d+)/);
      const mb = b.match(/^([LR]?)(\d+)/);
      const sa = ma[1] === 'R' ? 1 : 0;
      const sb = mb[1] === 'R' ? 1 : 0;
      if (sa !== sb) return sa - sb;
      return parseInt(ma[2]) - parseInt(mb[2]);
    }).filter(k => sideFilter === 'left' ? !sched[k].right_side : sched[k].right_side);
    if (lkeys.length === 0 || classes.length === 0) return "";
    let html = `<div style="padding: 8px 14px; background: var(--ip-blue); color: white; font-weight: 600; font-size: 13px;">${day}</div>`;
    html += `<table class="schedule"><thead><tr><th>№</th><th>Время</th>`;
    for (const cls of classes) html += `<th class="cls-h">${cls} класс</th>`;
    html += `</tr></thead><tbody>`;
    for (const lkey of lkeys) {
      const ld = sched[lkey];
      html += `<tr><td class="lesson-no">${ld.lesson_no}</td><td class="lesson-time">${escapeHtml(ld.time)}</td>`;
      for (const cls of classes) {
        const info = ld.classes[cls];
        const items = info ? (info.groups ? info.groups : [info]) : [];
        const hasConflictTeacher = items.some(it => it.teacher && conflictTeachers.has(it.teacher));
        html += `<td class="${hasConflictTeacher ? 'has-conflict' : ''}">${renderCellContent(info, conflictTeachers)}</td>`;
      }
      html += `</tr>`;
    }
    html += `</tbody></table>`;
    return html;
  }
  let content = `<div class="grid-wrap">`;
  if (isChkalova && leftClasses.length > 0) {
    content += `<div style="padding: 10px 14px; background: #F9FAFB; border-bottom: 1px solid var(--border); font-weight: 600; color: var(--text-muted); font-size: 12px; text-transform: uppercase; letter-spacing:0.05em;">Среднее звено (5–9 классы) — вся неделя</div>`;
    for (const day of DAYS) content += dayBlock(day, leftClasses, 'left');
  }
  if (isChkalova && rightClasses.length > 0) {
    content += `<div style="padding: 10px 14px; background: #F9FAFB; border-bottom: 1px solid var(--border); font-weight: 600; color: var(--text-muted); font-size: 12px; text-transform: uppercase; letter-spacing:0.05em;">Старшее звено (10–11 классы) — вся неделя</div>`;
    for (const day of DAYS) content += dayBlock(day, rightClasses, 'right');
  }
  if (!isChkalova) {
    for (const day of DAYS) content += dayBlock(day, leftClasses, 'left');
  }
  content += `</div>`;
  document.getElementById("mainContent").innerHTML = content;
}

function renderAllTeachers() {
  const search = (document.getElementById("teacherSearch")?.value || "").toLowerCase().trim();
  const sortMode = document.getElementById("teacherSort")?.value || "hours_desc";
  let names = Object.keys(ALL_TEACHERS);
  if (search) {
    names = names.filter(n => {
      if (n.toLowerCase().includes(search)) return true;
      const subjs = Object.keys(ALL_TEACHERS[n].subjectHours).join(" ").toLowerCase();
      return subjs.includes(search);
    });
  }
  names.sort((a, b) => {
    const A = ALL_TEACHERS[a], B = ALL_TEACHERS[b];
    if (sortMode === "hours_desc") return B.total - A.total;
    if (sortMode === "hours_asc")  return A.total - B.total;
    if (sortMode === "name") return a.localeCompare(b, "ru");
    if (sortMode === "cross") {
      const ca = Object.keys(A.hoursByDept).length;
      const cb = Object.keys(B.hoursByDept).length;
      if (ca !== cb) return cb - ca;
      return B.total - A.total;
    }
    return 0;
  });
  const totalTeachers = Object.keys(ALL_TEACHERS).length;
  const crossCount = Object.values(ALL_TEACHERS).filter(t => Object.keys(t.hoursByDept).length > 1).length;
  const deptTotals = {}; for (const d of DEPTS) deptTotals[d] = 0;
  let visibleHours = 0;
  for (const n of names) {
    const tinfo = ALL_TEACHERS[n];
    for (const d of DEPTS) deptTotals[d] += (tinfo.hoursByDept[d] || 0);
    visibleHours += tinfo.total;
  }
  let html = `
    <div class="teacher-summary-row">
      <div class="teacher-summary-card"><div class="label">Учителей всего</div><div class="value" style="color:var(--ip-blue)">${totalTeachers}</div></div>
      <div class="teacher-summary-card"><div class="label">Кросс-отделение</div><div class="value" style="color:var(--ip-magenta)">${crossCount}</div></div>
      <div class="teacher-summary-card"><div class="label">Конфликтов</div><div class="value" style="color:var(--ip-yellow)">${CONFLICTS.length}</div></div>
    </div>
    <div class="teacher-list">
      <div class="teacher-list-header">
        <div></div><div>Учитель / предметы</div>
        <div class="col-num">Империал</div><div class="col-num">Пушкина</div><div class="col-num">Чкалова</div><div class="col-num">Всего</div>
      </div>`;
  for (const t of names) {
    const info = ALL_TEACHERS[t];
    const depts = Object.keys(info.hoursByDept);
    const isCross = depts.length > 1;
    const initials = getInitials(t);
    const avCls = avatarColor(t);
    const subjEntries = Object.entries(info.subjectHours).sort((a, b) => b[1] - a[1]);
    const subjChips = subjEntries.map(([s, h]) => `<span class="subj-chip"><span class="subj-chip-name">${escapeHtml(s)}</span><span class="subj-chip-hours">${h}ч</span></span>`).join("");
    function hCell(dept, cssCls) {
      const h = info.hoursByDept[dept] || 0;
      if (h === 0) return `<div class="hour-cell zero">—</div>`;
      const sd = info.subjectByDept[dept] || {};
      const subjsHere = Object.entries(sd).sort((a,b)=>b[1]-a[1]);
      let breakdown = "";
      if (subjsHere.length > 1) {
        breakdown = `<div class="hour-cell-breakdown">${subjsHere.map(([s,c]) => `<span>${escapeHtml(s.length > 14 ? s.slice(0,14)+"…" : s)} <b>${c}</b></span>`).join("")}</div>`;
      }
      return `<div class="hour-cell ${cssCls}">${h}<span class="h-mini">ч/нед</span>${breakdown}</div>`;
    }
    html += `<div class="teacher-card">
      <div class="teacher-avatar ${avCls}">${escapeHtml(initials)}</div>
      <div>
        <div class="teacher-name">${escapeHtml(t)}${isCross ? '<span class="badge">кросс</span>' : ''}</div>
        <div class="subj-chips">${subjChips || '<span style="color:var(--text-muted);font-size:12px;">—</span>'}</div>
      </div>
      ${hCell("Империал","imp")}${hCell("Пушкина","push")}${hCell("Чкалова","chk")}
      <div class="hour-total">${info.total}<span class="h-mini">всего</span></div>
    </div>`;
  }
  if (names.length === 0) {
    html += `<div style="padding:32px;text-align:center;color:var(--text-muted);">Учителя не найдены</div>`;
  } else {
    html += `<div class="teacher-card" style="background:#F9FAFB;font-weight:700;border-top:2px solid var(--border);">
      <div></div>
      <div style="font-weight:700;color:var(--text-muted);text-transform:uppercase;font-size:12px;letter-spacing:0.05em;">Итого по ${names.length} учит.</div>
      <div class="hour-cell imp">${deptTotals["Империал"]}<span class="h-mini">ч/нед</span></div>
      <div class="hour-cell push">${deptTotals["Пушкина"]}<span class="h-mini">ч/нед</span></div>
      <div class="hour-cell chk">${deptTotals["Чкалова"]}<span class="h-mini">ч/нед</span></div>
      <div class="hour-total" style="background:linear-gradient(135deg,var(--ip-blue),#0086D6);color:white;border-color:var(--ip-blue);">${visibleHours}<span class="h-mini" style="color:rgba(255,255,255,0.85)">всего</span></div>
    </div>`;
  }
  html += `</div>`;
  document.getElementById("sectionTeachers").querySelector(".all-teachers-content")?.remove();
  const wrap = document.createElement("div");
  wrap.className = "all-teachers-content";
  wrap.innerHTML = html;
  document.getElementById("sectionTeachers").appendChild(wrap);
}

// ============= USER UI =============
function renderUserChip() {
  const u = CURRENT_USER;
  if (!u) return;
  const av = document.getElementById("userAvatar");
  av.className = "user-avatar " + avatarColor(u.name);
  av.textContent = getInitials(u.name);
  document.getElementById("userName").textContent = u.name;
  document.getElementById("userRole").textContent = u.role === "head" ? `Завуч · ${u.dept}` : `Учитель · ${(u.depts || []).join(", ")}`;
}
function renderUserMenu() {
  const u = CURRENT_USER;
  if (!u) return;
  document.getElementById("userMenuList").innerHTML = `
    <div class="user-menu-section">Текущий пользователь</div>
    <div class="user-menu-item active">
      <span class="um-av ${avatarColor(u.name)}">${getInitials(u.name)}</span>
      <div class="um-meta"><span class="um-name">${escapeHtml(u.name)}</span><span class="um-role">${escapeHtml(u.email)}</span></div>
    </div>
    <div style="padding:4px 14px 8px;"><button onclick="logout()" class="link-btn" style="font-size:12px;color:var(--ip-magenta);">⏏ Выйти</button></div>
  `;
}
function toggleUserMenu() {
  const m = document.getElementById("userMenu");
  m.classList.toggle("show");
  document.getElementById("inbox").classList.remove("show");
  if (m.classList.contains("show")) renderUserMenu();
}

// ============= NOTIFICATIONS =============
async function refreshNotifications() {
  try {
    const r = await API.notifications();
    NOTIFICATIONS = r.notifications;
    renderBell();
    if (document.getElementById("inbox").classList.contains("show")) renderInbox();
  } catch (e) {}
}
function startNotificationPolling() {
  refreshNotifications();
  setInterval(refreshNotifications, 30000);
}
function unreadCount() { return NOTIFICATIONS.filter(n => !n.is_read).length; }
function renderBell() {
  const cnt = unreadCount();
  const b = document.getElementById("bellBadge");
  b.textContent = cnt;
  b.classList.toggle("zero", cnt === 0);
}
function renderInbox() {
  const list = document.getElementById("inboxList");
  if (NOTIFICATIONS.length === 0) { list.innerHTML = `<div class="inbox-empty">Нет уведомлений</div>`; return; }
  list.innerHTML = NOTIFICATIONS.map(n => `
    <div class="inbox-item ${n.is_read ? '' : 'unread'}" onclick="markRead(${n.id})">
      <div><b>${escapeHtml(n.title)}</b></div>
      <div style="margin-top:3px;">${escapeHtml(n.body)}</div>
      <div class="when">${fmtWhen(n.created_at)}</div>
    </div>`).join("");
}
async function markRead(id) {
  await API.readNotif(id);
  await refreshNotifications();
}
async function markAllRead() {
  await API.readAllNotif();
  await refreshNotifications();
}
function toggleInbox() {
  const ib = document.getElementById("inbox");
  ib.classList.toggle("show");
  document.getElementById("userMenu").classList.remove("show");
  if (ib.classList.contains("show")) renderInbox();
}

document.addEventListener("click", (e) => {
  if (!e.target.closest(".bell-wrap")) document.getElementById("inbox")?.classList.remove("show");
  if (!e.target.closest(".user-wrap")) document.getElementById("userMenu")?.classList.remove("show");
});

// ============= REPLACEMENT FLOW =============
let _repState = { teacher: "", day: "", lessons: [], selections: {} };

function showReplacement() {
  document.getElementById("modalBg").classList.add("show");
  populateRepTeacherList();
  document.getElementById("repDay").innerHTML = DAYS.map(d => `<option ${d===state.day?'selected':''}>${d}</option>`).join("");
  document.getElementById("repTeacher").value = "";
  document.getElementById("repLessons").innerHTML = "";
  document.getElementById("repNotify").innerHTML = "";
}
function closeModal() { document.getElementById("modalBg").classList.remove("show"); }
function populateRepTeacherList() {
  const sel = document.getElementById("repTeacher");
  const sorted = Object.keys(ALL_TEACHERS).sort((a,b) => a.localeCompare(b, "ru"));
  sel.innerHTML = `<option value="">— выберите учителя —</option>` + sorted.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)} (${ALL_TEACHERS[t].total} ч)</option>`).join("");
}
function teacherLessonsOnDay(teacherName, day) {
  const result = [];
  for (const dept of DEPTS) {
    if (!DATA[dept]) continue;
    const sched = DATA[dept].schedule;
    if (!sched[day]) continue;
    for (const lkey in sched[day]) {
      const ld = sched[day][lkey];
      for (const cls in ld.classes) {
        const info = ld.classes[cls];
        const items = info.groups ? info.groups : [info];
        for (const it of items) {
          if (it.teacher && it.teacher.trim() === teacherName) {
            result.push({ dept, lessonKey: lkey, lesson_no: ld.lesson_no, time: ld.time, cls, subject: it.subject, room: it.room || info.room });
          }
        }
      }
    }
  }
  const seen = new Set();
  return result.filter(r => { const k = `${r.dept}|${r.lessonKey}|${r.cls}|${r.subject}`; if (seen.has(k)) return false; seen.add(k); return true; });
}
function isTeacherBusyAt(teacherName, day, time) {
  for (const dept of DEPTS) {
    if (!DATA[dept]) continue;
    const sched = DATA[dept].schedule;
    if (!sched[day]) continue;
    for (const lkey in sched[day]) {
      const ld = sched[day][lkey];
      if (ld.time !== time) continue;
      for (const cls in ld.classes) {
        const info = ld.classes[cls];
        const items = info.groups ? info.groups : [info];
        for (const it of items) { if (it.teacher && it.teacher.trim() === teacherName) return true; }
      }
    }
  }
  return false;
}
function findReplacementCandidates(absentTeacher, lessonInfo) {
  const targetSubj = (lessonInfo.subject || "").toLowerCase();
  function subjectMatch(teacherSubjects) {
    if (!targetSubj) return false;
    for (const s of teacherSubjects) {
      const sl = s.toLowerCase();
      if (sl === targetSubj) return { exact: true, subj: s };
      const words1 = targetSubj.split(/\s+/);
      const words2 = sl.split(/\s+/);
      for (const w of words1) {
        if (w.length < 4) continue;
        if (words2.some(w2 => w2.includes(w) || w.includes(w2))) return { exact: false, subj: s };
      }
    }
    return null;
  }
  const candidates = [];
  for (const tName in ALL_TEACHERS) {
    if (tName === absentTeacher) continue;
    const tInfo = ALL_TEACHERS[tName];
    const subjects = Object.keys(tInfo.subjectHours);
    const match = subjectMatch(subjects);
    if (!match) continue;
    const isBusy = isTeacherBusyAt(tName, lessonInfo.day, lessonInfo.time);
    candidates.push({ name: tName, depts: Object.keys(tInfo.hoursByDept), totalHours: tInfo.total, matchExact: match.exact, matchedSubject: match.subj, busy: isBusy, sameDept: tInfo.hoursByDept[lessonInfo.dept] ? true : false });
  }
  candidates.sort((a, b) => {
    if (a.busy !== b.busy) return a.busy ? 1 : -1;
    if (a.sameDept !== b.sameDept) return a.sameDept ? -1 : 1;
    if (a.matchExact !== b.matchExact) return a.matchExact ? -1 : 1;
    return a.totalHours - b.totalHours;
  });
  return candidates.slice(0, 8);
}
function onRepTeacherChange() { _repState.teacher = document.getElementById("repTeacher").value; refreshRepLessons(); }
function onRepDayChange() { _repState.day = document.getElementById("repDay").value; refreshRepLessons(); }
function refreshRepLessons() {
  const t = document.getElementById("repTeacher").value;
  const day = document.getElementById("repDay").value;
  _repState.teacher = t; _repState.day = day; _repState.lessons = []; _repState.selections = {};
  const wrap = document.getElementById("repLessons");
  if (!t) { wrap.innerHTML = `<div style="padding:10px;color:var(--text-muted);font-size:12px;">Выберите учителя.</div>`; return; }
  const lessons = teacherLessonsOnDay(t, day);
  if (lessons.length === 0) { wrap.innerHTML = `<div style="padding:10px;color:var(--text-muted);font-size:12px;">У этого учителя нет уроков в выбранный день.</div>`; refreshRepNotify(); return; }
  let html = `<div style="font-size:11px; color:var(--text-muted); margin-bottom:6px;">Найдено уроков: ${lessons.length}. Подберите замену:</div>`;
  lessons.forEach((L, idx) => {
    const cands = findReplacementCandidates(t, { dept: L.dept, day, time: L.time, subject: L.subject, cls: L.cls });
    const lessonId = `L${idx}`;
    _repState.lessons.push({ id: lessonId, info: L, candidates: cands });
    html += `<div class="rep-lesson"><div class="rep-lesson-head">
      <div class="l-num">${L.lesson_no}</div>
      <div><b>${escapeHtml(L.subject || '—')}</b> · ${escapeHtml(L.dept)} · ${L.cls} кл${L.room ? ' · каб ' + escapeHtml(L.room) : ''}</div>
      <div class="l-meta">${escapeHtml(L.time)}</div>
    </div><div class="rep-cands">`;
    if (cands.length === 0) {
      html += `<div class="rep-no-cands">Нет подходящих учителей по предмету «${escapeHtml(L.subject || '')}». Можно отменить урок.</div>`;
    } else {
      cands.forEach((c, ci) => {
        const inputId = `${lessonId}_c${ci}`;
        const subjBadge = c.matchExact ? '' : ` <span style="color:var(--text-muted);font-size:10px;">(ведёт «${escapeHtml(c.matchedSubject)}»)</span>`;
        html += `<label class="rep-cand" for="${inputId}">
          <input type="radio" name="${lessonId}" id="${inputId}" value="${ci}" onchange="onCandSelect('${lessonId}', ${ci})" ${c.busy ? 'disabled' : ''}>
          <span class="rep-cand-name">${escapeHtml(c.name)}${subjBadge}</span>
          <span class="rep-cand-meta">${c.depts.join(", ")} · ${c.totalHours} ч/нед</span>
          <span class="rep-cand-load ${c.busy ? 'busy' : ''}">${c.busy ? 'занят' : 'свободен'}</span>
        </label>`;
      });
    }
    html += `</div></div>`;
  });
  wrap.innerHTML = html;
  refreshRepNotify();
}
function onCandSelect(lessonId, candIdx) {
  _repState.selections[lessonId] = candIdx;
  for (const el of document.querySelectorAll(`.rep-cand`)) el.classList.remove("selected");
  for (const lid in _repState.selections) {
    const ci = _repState.selections[lid];
    const el = document.getElementById(`${lid}_c${ci}`);
    if (el) el.closest(".rep-cand").classList.add("selected");
  }
  refreshRepNotify();
}
function findAccountByName(name) { return ACCOUNTS.find(a => a.name === name); }
function refreshRepNotify() {
  const wrap = document.getElementById("repNotify");
  const t = _repState.teacher;
  if (!t) { wrap.innerHTML = `<span style="color:var(--text-muted);font-size:11px;">Сначала выберите учителя.</span>`; return; }
  const tAcct = findAccountByName(t);
  const tDepts = tAcct ? (tAcct.depts || []) : [];
  const notifyList = [];
  if (tAcct) notifyList.push({ id: tAcct.id, name: t, role: "Отсутствующий", checked: true });
  const repTeachers = new Set();
  for (const L of _repState.lessons) {
    const ci = _repState.selections[L.id];
    if (ci != null && L.candidates[ci]) repTeachers.add(L.candidates[ci].name);
  }
  for (const rn of repTeachers) {
    const a = findAccountByName(rn);
    if (a) notifyList.push({ id: a.id, name: rn, role: "Заменяющий", checked: true });
  }
  const involvedDepts = new Set(tDepts);
  for (const L of _repState.lessons) involvedDepts.add(L.info.dept);
  for (const d of involvedDepts) {
    const head = ACCOUNTS.find(a => a.role === "head" && a.dept === d);
    if (head) notifyList.push({ id: head.id, name: head.name, role: `Завуч ${d}`, checked: true });
  }
  wrap.innerHTML = notifyList.map(n => `<label class="notify-row"><input type="checkbox" data-uid="${n.id}" ${n.checked ? 'checked' : ''}><span><b>${escapeHtml(n.name)}</b> <span style="color:var(--text-muted);">— ${escapeHtml(n.role)}</span></span></label>`).join("");
}
async function confirmReplacements() {
  const t = _repState.teacher;
  const day = _repState.day;
  if (!t) { alert("Выберите учителя"); return; }
  const tAcct = findAccountByName(t);
  if (!tAcct) { alert("Аккаунт отсутствующего учителя не найден"); return; }
  const items = [];
  for (const L of _repState.lessons) {
    const ci = _repState.selections[L.id];
    if (ci == null) continue;
    const cand = L.candidates[ci];
    if (!cand) continue;
    const replAcct = findAccountByName(cand.name);
    if (!replAcct) continue;
    items.push({
      dept: L.info.dept, cls: L.info.cls, lesson_no: L.info.lesson_no,
      lesson_key: L.info.lessonKey, time: L.info.time, subject: L.info.subject, room: L.info.room,
      replacement_user_id: replAcct.id
    });
  }
  if (items.length === 0) { alert("Не выбрана ни одна замена"); return; }
  const notifyIds = [];
  for (const cb of document.querySelectorAll("#repNotify input[type=checkbox]")) {
    if (cb.checked) notifyIds.push(parseInt(cb.dataset.uid));
  }
  try {
    const res = await API.createReplacements({ day, items, absent_user_id: tAcct.id, notify_user_ids: notifyIds });
    closeModal();
    await refreshNotifications();
    alert(`Создано замен: ${res.created_count}. Уведомления отправлены.`);
  } catch (e) {
    alert("Ошибка: " + e.message);
  }
}

// ============= SECTION + VIEW =============
function setSection(s) {
  state.section = s;
  for (const b of document.querySelectorAll(".section-btn")) b.classList.toggle("active", b.dataset.section === s);
  document.getElementById("sectionSchedule").style.display = s === "schedule" ? "" : "none";
  document.getElementById("sectionTeachers").style.display = s === "teachers" ? "" : "none";
  document.getElementById("mainContent").style.display = s === "schedule" ? "" : "none";
  if (s === "teachers") renderAllTeachers();
}
function populateClassFilter() {
  const sel = document.getElementById("classFilter");
  const dept = DATA[state.dept];
  if (!dept) return;
  sel.innerHTML = [`<option value="all">Все классы</option>`].concat(dept.classes.map(c => `<option value="${c}" ${state.classFilter === c ? 'selected' : ''}>${c} класс</option>`)).join("");
  sel.value = state.classFilter;
}
function setClassFilter(v) { state.classFilter = v; render(); }
function setDept(d) {
  state.dept = d;
  if (state.classFilter !== "all" && !DATA[d].classes.includes(state.classFilter)) state.classFilter = "all";
  populateClassFilter();
  renderDeptTabs();
  renderStats();
  render();
}
function setDay(d) {
  state.day = d;
  renderDayTabs();
  if (state.view === 'grid') renderGrid();
}
function switchView(v) {
  state.view = v;
  for (const b of document.querySelectorAll(".view-switch button")) b.classList.toggle("active", b.dataset.view === v);
  const dt = document.getElementById("dayTabs");
  if (dt) dt.style.display = (v === 'grid') ? 'flex' : 'none';
  render();
}
function render() {
  if (state.section !== 'schedule') return;
  if (state.view === 'grid') renderGrid();
  else if (state.view === 'week') renderWeek();
}

// ============= INIT =============
function initUI() {
  document.getElementById("teachersCount").textContent = Object.keys(ALL_TEACHERS).length;
  populateClassFilter();
  renderDeptTabs();
  renderDayTabs();
  renderStats();
  renderConflictPanel();
  render();
  renderUserChip();
  renderBell();
}

// Login enter-key shortcuts
document.getElementById("loginPassword").addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });
document.getElementById("loginEmail").addEventListener("keydown", (e) => { if (e.key === "Enter") document.getElementById("loginPassword").focus(); });
document.getElementById("newPwd2").addEventListener("keydown", (e) => { if (e.key === "Enter") doChangePassword(); });

// On load: if we have a token, try /me. Else show login.
async function boot() {
  if (API.token) {
    try {
      const r = await API.me();
      CURRENT_USER = r.user;
      await enterApp();
      return;
    } catch (e) {
      API.setToken(null);
    }
  }
  showLogin();
}
boot();
