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
  listReplacements() { return this.fetch("/api/replacements"); },
  // Admin
  adminCreateUser(d) { return this.fetch("/api/admin/users", { method: "POST", body: JSON.stringify(d) }); },
  adminUpdateUser(id, d) { return this.fetch(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(d) }); },
  adminResetPwd(id) { return this.fetch(`/api/admin/users/${id}/reset-password`, { method: "POST" }); },
  adminDeleteUser(id) { return this.fetch(`/api/admin/users/${id}`, { method: "DELETE" }); },
  // Schedule edits
  saveEdit(d) { return this.fetch("/api/schedule/edits", { method: "POST", body: JSON.stringify(d) }); },
  revertEdit(dept, day, lkey, cls) { return this.fetch(`/api/schedule/edits/${encodeURIComponent(dept)}/${encodeURIComponent(day)}/${encodeURIComponent(lkey)}/${encodeURIComponent(cls)}`, { method: "DELETE" }); },
  // Absences
  absences() { return this.fetch("/api/absences"); },
  createAbsence(d) { return this.fetch("/api/absences", { method: "POST", body: JSON.stringify(d) }); },
  deleteAbsence(id) { return this.fetch(`/api/absences/${id}`, { method: "DELETE" }); },
  // Academic support
  acsupList() { return this.fetch("/api/academic-support"); },
  acsupCreate(d) { return this.fetch("/api/academic-support", { method: "POST", body: JSON.stringify(d) }); },
  acsupDelete(id) { return this.fetch(`/api/academic-support/${id}`, { method: "DELETE" }); },
  acsupInvite(id, payload) { return this.fetch(`/api/academic-support/${id}/invite`, { method: "POST", body: JSON.stringify(payload) }); },
  // Schedule history
  schedHistory(dept) { return this.fetch("/api/schedule/history" + (dept ? `?dept=${encodeURIComponent(dept)}` : "")); },
  // Excel import (multipart)
  importExcel(file, dept, preview) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("dept", dept);
    fd.append("preview", preview ? "true" : "false");
    return fetch("/api/schedule/import", {
      method: "POST",
      headers: { Authorization: "Bearer " + this.token },
      body: fd
    }).then(async r => {
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "import_failed");
      return d;
    });
  },
};

// ============= GLOBAL STATE =============
let DATA = null;        // schedule per dept
let ACCOUNTS = [];      // [{id, email, name, role, dept, depts, subjects}]
let ALL_TEACHERS = {};  // teacher name -> stats
let CONFLICTS = [];
let CURRENT_USER = null;
let NOTIFICATIONS = [];
const DEPTS = ["Империал","Пушкина","Чкалова","Кирова"];
const DAYS = ["Понедельник","Вторник","Среда","Четверг","Пятница"];

let state = {
  section: "today",
  dept: "Империал",
  day: "Понедельник",
  view: "grid",
  classFilter: "all",
  historyFilters: { dept: "all", teacher: "", from: "", to: "" },
  myView: "today",
  myDay: "Понедельник",
  acsupFilter: { dept: "all" },
};
let ABSENCES = [];
let ACSUP = [];

let pendingLoginEmail = null;
let EDIT_MODE = false;
let _editingCell = null;

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
  await loadReplacements();
  // Load absences (for substitution algorithm awareness)
  try { const r = await API.absences(); ABSENCES = r.absences; } catch(e) { ABSENCES = []; }
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
    const tCls = d === "Пушкина" ? "t-pushkina" : d === "Чкалова" ? "t-chkalova" : d === "Кирова" ? "t-kirova" : "t-imperial";
    const cls = "dept-tab " + tCls + (d === state.dept ? " active" : "");
    const meta = DATA[d];
    if (!meta) return "";
    const clsLabel = meta.classes.length === 0 ? "пусто" : `${meta.classes.length} классов`;
    return `<button class="${cls}" onclick="setDept('${d}')">${d} <span style="opacity:0.7;font-weight:400;font-size:12px">· ${clsLabel}</span></button>`;
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
    const tEsc = escapeHtml(t).replace(/'/g, "\\'");
    const teacherEl = t ? `<div class="cell-teacher ${EDIT_MODE ? '' : 'click-link'}" ${!EDIT_MODE ? `onclick="event.stopPropagation(); openTeacherCard('${tEsc}')"` : ''} style="${conflict ? 'color:#E6007E;font-weight:600' : ''}">${escapeHtml(t)}${conflict ? ' ⚠' : ''}</div>` : "";
    return `<div class="cell-group"><div class="cell-subject ${sCls}">${escapeHtml(subj)}${r ? `<span class="cell-room">${escapeHtml(r)}</span>` : ""}</div>${teacherEl}</div>`;
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
    for (const cls of classes) html += `<th class="cls-h click-link" onclick="openClassCard('${escapeHtml(state.dept)}','${cls}')">${cls} класс</th>`;
    html += `</tr></thead><tbody>`;
    for (const lkey of keys) {
      const ld = sched[lkey];
      html += `<tr><td class="lesson-no">${ld.lesson_no}</td><td class="lesson-time">${escapeHtml(ld.time)}</td>`;
      for (const cls of classes) {
        const info = ld.classes[cls];
        const items = info ? (info.groups ? info.groups : [info]) : [];
        const hasConflictTeacher = items.some(it => it.teacher && conflictTeachers.has(it.teacher));
        const wasEdited = info && info._edited;
        const cellClasses = [];
        if (hasConflictTeacher) cellClasses.push("has-conflict");
        if (wasEdited) cellClasses.push("cell-edited");
        const canEditHere = EDIT_MODE && canEditDept(state.dept);
        const clickAttr = EDIT_MODE ? `onclick="openCellEditor('${escapeHtml(state.dept)}','${escapeHtml(state.day)}','${escapeHtml(lkey)}','${cls}', ${ld.lesson_no}, '${escapeHtml(ld.time)}')"` : '';
        const dragAttrs = canEditHere
          ? `draggable="true" data-cell="${escapeHtml(state.dept)}|${escapeHtml(state.day)}|${escapeHtml(lkey)}|${cls}|${ld.lesson_no}|${escapeHtml(ld.time)}" ondragstart="onCellDragStart(event)" ondragover="onCellDragOver(event)" ondragleave="onCellDragLeave(event)" ondrop="onCellDrop(event)" ondragend="onCellDragEnd(event)"`
          : '';
        const handle = canEditHere && info ? '<span class="drag-handle">⋮⋮</span>' : '';
        html += `<td class="${cellClasses.join(' ')}" ${clickAttr} ${dragAttrs}>${handle}${renderCellContent(info, conflictTeachers)}</td>`;
      }
      html += `</tr>`;
    }
    html += `</tbody></table>`;
    return html;
  }
  let content = "";
  if (EDIT_MODE) {
    if (!canEditDept(state.dept)) {
      const myDepts = getMyAllowedDepts();
      const target = myDepts[0] || "";
      content += `<div class="edit-mode-banner" style="background:#FFE5E5;color:#B91C1C;">👁 Это чужое отделение — только просмотр. Ваши отделения: <b>${myDepts.join(", ")}</b>. ${target ? `<button class="link-btn" onclick="setDept('${target}')" style="margin-left:auto;font-size:12px;color:#B91C1C;text-decoration:underline;">Перейти к «${target}» →</button>` : ''}</div>`;
    } else {
      content += `<div class="edit-mode-banner">✎ Режим редактирования. Кликните на любую ячейку чтобы поменять урок. <button class="link-btn" onclick="toggleEditMode()" style="margin-left:auto;font-size:12px;">Выйти из режима</button></div>`;
    }
  }
  content += `<div class="grid-wrap">`;
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
    <div style="display:flex; gap: 8px; margin-bottom: 8px; flex-wrap: wrap;">
      <div style="flex:1;"></div>
      <button class="btn secondary" onclick="printCredentialCards()">🖨 Карточки для раздачи</button>
      <button class="btn secondary" onclick="exportTeachersCSV()">⤓ Экспорт списка (CSV)</button>
      <button class="btn secondary" onclick="copyAllEmails()" id="copyAllBtn">Копировать все логины</button>
    </div>
    <div class="teacher-list">
      <div class="teacher-list-header">
        <div></div><div>Учитель / предметы</div><div>Логин для входа</div>
        <div class="col-num">Империал</div><div class="col-num">Пушкина</div><div class="col-num">Чкалова</div><div class="col-num">Кирова</div><div class="col-num">Всего</div>
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
    const acc = ACCOUNTS.find(a => a.name === t);
    const email = acc ? acc.email : "—";
    const isHead = CURRENT_USER && CURRENT_USER.role === "head";
    const emailCell = `<div class="teacher-email-cell">
      <div class="teacher-email click-link" onclick="event.stopPropagation(); openTeacherCard('${escapeHtml(t).replace(/'/g,"\\'")}')">${escapeHtml(email)}</div>
      <div class="teacher-email-actions">
        <button class="email-mini-btn" onclick='event.stopPropagation(); copyEmail("${escapeHtml(email)}", this)'>📋 Скопировать</button>
        ${isHead && acc ? `<button class="email-mini-btn" onclick='event.stopPropagation(); quickResetPwd(${acc.id}, "${escapeHtml(t).replace(/'/g,"\\'")}")'>↺ Сбросить пароль</button>` : ''}
      </div>
    </div>`;
    html += `<div class="teacher-card">
      <div class="teacher-avatar ${avCls}">${escapeHtml(initials)}</div>
      <div>
        <div class="teacher-name click-link" onclick="openTeacherCard('${escapeHtml(t).replace(/'/g,"\\'")}')">${escapeHtml(t)}${isCross ? '<span class="badge">кросс</span>' : ''}</div>
        <div class="subj-chips">${subjChips || '<span style="color:var(--text-muted);font-size:12px;">—</span>'}</div>
      </div>
      ${emailCell}
      ${hCell("Империал","imp")}${hCell("Пушкина","push")}${hCell("Чкалова","chk")}${hCell("Кирова","kir")}
      <div class="hour-total">${info.total}<span class="h-mini">всего</span></div>
    </div>`;
  }
  if (names.length === 0) {
    html += `<div style="padding:32px;text-align:center;color:var(--text-muted);">Учителя не найдены</div>`;
  } else {
    html += `<div class="teacher-card" style="background:#F9FAFB;font-weight:700;border-top:2px solid var(--border);">
      <div></div>
      <div style="font-weight:700;color:var(--text-muted);text-transform:uppercase;font-size:12px;letter-spacing:0.05em;">Итого по ${names.length} учит.</div>
      <div></div>
      <div class="hour-cell imp">${deptTotals["Империал"]}<span class="h-mini">ч/нед</span></div>
      <div class="hour-cell push">${deptTotals["Пушкина"]}<span class="h-mini">ч/нед</span></div>
      <div class="hour-cell chk">${deptTotals["Чкалова"]}<span class="h-mini">ч/нед</span></div>
      <div class="hour-cell kir">${deptTotals["Кирова"]||0}<span class="h-mini">ч/нед</span></div>
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
function getUserTitle(u) {
  if (u.title) return u.title;
  // Fallback: derive from role
  if (u.role === "head") return "Руководитель отделения";
  return "Учитель";
}

function renderUserChip() {
  const u = CURRENT_USER;
  if (!u) return;
  const av = document.getElementById("userAvatar");
  av.className = "user-avatar " + avatarColor(u.name);
  av.textContent = getInitials(u.name);
  document.getElementById("userName").textContent = u.name;
  const dpts = (u.depts && u.depts.length > 0) ? u.depts.join(", ") : (u.dept || "");
  document.getElementById("userRole").textContent = `${getUserTitle(u)}${dpts ? " · " + dpts : ""}`;
}
function renderUserMenu() {
  const u = CURRENT_USER;
  if (!u) return;
  const hasLessons = ALL_TEACHERS[u.name] && ALL_TEACHERS[u.name].total > 0;
  const dpts = (u.depts && u.depts.length > 0) ? u.depts.join(", ") : (u.dept || "");
  const roleLabel = `${getUserTitle(u)}${dpts ? " · " + dpts : ""}`;
  document.getElementById("userMenuList").innerHTML = `
    <div class="user-menu-section">Текущий пользователь</div>
    <div class="user-menu-item active">
      <span class="um-av ${avatarColor(u.name)}">${getInitials(u.name)}</span>
      <div class="um-meta"><span class="um-name">${escapeHtml(u.name)}</span><span class="um-role">${escapeHtml(roleLabel)}</span><span class="um-role">${escapeHtml(u.email)}</span></div>
    </div>
    ${hasLessons ? `<div style="padding:4px 14px 8px;"><button onclick="quickSickToday()" class="btn" style="width:100%;background:var(--ip-magenta);">🤒 Я не выхожу сегодня</button></div>` : ''}
    ${hasLessons ? `<div style="padding:4px 14px 8px;"><button onclick="openMyCard()" class="link-btn" style="font-size:12px;">👤 Моя карточка</button></div>` : ''}
    <div style="padding:4px 14px 8px;border-top:1px solid var(--border);"><button onclick="logout()" class="link-btn" style="font-size:12px;color:var(--ip-magenta);">⏏ Выйти</button></div>
  `;
}

function openMyCard() {
  document.getElementById("userMenu").classList.remove("show");
  openTeacherCard(CURRENT_USER.name);
}

function quickSickToday() {
  document.getElementById("userMenu").classList.remove("show");
  // today's weekday
  const wd = new Date().getDay(); // 0=Sun
  const map = {1:"Понедельник",2:"Вторник",3:"Среда",4:"Четверг",5:"Пятница"};
  const today = map[wd] || "Понедельник";
  showReplacement();
  // pre-fill teacher + day
  setTimeout(() => {
    const sel = document.getElementById("repTeacher");
    sel.value = CURRENT_USER.name;
    const daySel = document.getElementById("repDay");
    daySel.value = today;
    onRepTeacherChange();
  }, 50);
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
function isUserAbsentToday(name) {
  // Check ABSENCES for matching user_name with today within date range
  const today = new Date().toISOString().slice(0,10);
  const acct = ACCOUNTS.find(a => a.name === name);
  if (!acct) return false;
  return ABSENCES.some(a => a.user_id === acct.id && a.start_date <= today && a.end_date >= today);
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
    const onLeave = isUserAbsentToday(tName);
    candidates.push({ name: tName, depts: Object.keys(tInfo.hoursByDept), totalHours: tInfo.total, matchExact: match.exact, matchedSubject: match.subj, busy: isBusy, onLeave, sameDept: tInfo.hoursByDept[lessonInfo.dept] ? true : false });
  }
  candidates.sort((a, b) => {
    if (a.onLeave !== b.onLeave) return a.onLeave ? 1 : -1;
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
  const map = {
    schedule: "sectionSchedule",
    teachers: "sectionTeachers",
    today: "sectionToday",
    history: "sectionHistory",
    admin: "sectionAdmin",
    my: "sectionMy",
    acsup: "sectionAcsup",
    absences: "sectionAbsences",
    schedhist: "sectionSchedhist",
  };
  for (const k in map) {
    const el = document.getElementById(map[k]);
    if (el) el.style.display = (s === k) ? "" : "none";
  }
  document.getElementById("mainContent").style.display = s === "schedule" ? "" : "none";
  if (s === "teachers") renderAllTeachers();
  if (s === "today") renderToday();
  if (s === "history") renderHistory();
  if (s === "admin") renderAdmin();
  if (s === "my") renderMy();
  if (s === "acsup") renderAcsup();
  if (s === "absences") renderAbsences();
  if (s === "schedhist") renderSchedHistory();
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
  // Show admin tab and edit button for heads
  if (CURRENT_USER && CURRENT_USER.role === "head") {
    document.getElementById("adminTab").style.display = "";
    document.getElementById("editModeBtn").style.display = "";
    const sht = document.getElementById("schedHistTab");
    if (sht) sht.style.display = "";
  } else {
    document.getElementById("adminTab").style.display = "none";
    document.getElementById("editModeBtn").style.display = "none";
    const sht = document.getElementById("schedHistTab");
    if (sht) sht.style.display = "none";
  }
  // Show "Моё расписание" if user has any teaching hours (teachers + heads who also teach)
  const myTab = document.getElementById("myTab");
  const hasLessons = CURRENT_USER && ALL_TEACHERS[CURRENT_USER.name] && ALL_TEACHERS[CURRENT_USER.name].total > 0;
  myTab.style.display = hasLessons ? "" : "none";
  setSection("today"); // default
  renderUserChip();
  renderBell();
}

// Login enter-key shortcuts
document.getElementById("loginPassword").addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });
document.getElementById("loginEmail").addEventListener("keydown", (e) => { if (e.key === "Enter") document.getElementById("loginPassword").focus(); });
document.getElementById("newPwd2").addEventListener("keydown", (e) => { if (e.key === "Enter") doChangePassword(); });

// ============= TODAY VIEW =============
function todayDayName() {
  const wd = new Date().getDay();
  return ({1:"Понедельник",2:"Вторник",3:"Среда",4:"Четверг",5:"Пятница"})[wd] || "Понедельник";
}

function parseTimeRange(t) {
  // "9.00-9.40" or "09:00 - 09:40"
  if (!t) return null;
  const m = String(t).match(/(\d{1,2})[.:](\d{2})\s*[-—–]\s*(\d{1,2})[.:](\d{2})/);
  if (!m) return null;
  return { sh: +m[1], sm: +m[2], eh: +m[3], em: +m[4] };
}

function lessonTimeStatus(timeStr) {
  const r = parseTimeRange(timeStr);
  if (!r) return "future";
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const start = r.sh * 60 + r.sm;
  const end = r.eh * 60 + r.em;
  if (cur < start) return "future";
  if (cur >= start && cur <= end) return "now";
  return "past";
}

function findUserLessonsToday(userName, day) {
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
          if (it.teacher && it.teacher.trim() === userName) {
            result.push({ dept, time: ld.time, lesson_no: ld.lesson_no, cls, subject: it.subject, room: it.room || info.room });
          }
        }
      }
    }
  }
  result.sort((a, b) => {
    const ta = parseTimeRange(a.time), tb = parseTimeRange(b.time);
    if (!ta || !tb) return 0;
    return (ta.sh*60+ta.sm) - (tb.sh*60+tb.sm);
  });
  return result;
}

function renderToday() {
  const root = document.getElementById("sectionToday");
  const u = CURRENT_USER;
  const today = todayDayName();
  const dateStr = new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });

  let html = `<div class="today-greeting">
    <h2>Привет, ${escapeHtml((u.name || '').split(' ')[1] || u.name)}!</h2>
    <div class="day-of-week">Сегодня ${escapeHtml(dateStr)}</div>
  </div>`;

  if (u.role === "teacher") {
    const lessons = findUserLessonsToday(u.name, today);
    if (lessons.length === 0) {
      html += `<div class="today-list"><div class="history-empty">Сегодня у вас нет уроков 🎉</div></div>`;
    } else {
      html += `<div style="font-size:13px;color:var(--text-muted);margin:6px 4px;">У вас сегодня <b>${lessons.length}</b> уроков</div>`;
      html += `<div class="today-list">`;
      for (const L of lessons) {
        const status = lessonTimeStatus(L.time);
        const tags = [];
        if (status === "now") tags.push(`<span class="today-tag tag-now">сейчас</span>`);
        html += `<div class="today-card ${status}">
          <div class="today-time">${escapeHtml(L.time)}<small>урок ${L.lesson_no}</small></div>
          <div class="today-main">
            <div class="today-subj">${escapeHtml(L.subject || '—')}</div>
            <div class="today-meta">${escapeHtml(L.dept)} · <a class="click-link" onclick="openClassCard('${L.dept}','${L.cls}')">${L.cls} класс</a>${L.room ? ' · каб ' + escapeHtml(L.room) : ''}</div>
          </div>
          <div class="today-tags">${tags.join("")}</div>
        </div>`;
      }
      html += `</div>`;
    }
  } else {
    // Head — quick stats: how many lessons today across school, replacements today
    let countToday = 0;
    for (const dept of DEPTS) {
      if (!DATA[dept]) continue;
      const sched = DATA[dept].schedule[today] || {};
      for (const lkey in sched) for (const cls in sched[lkey].classes) countToday++;
    }
    html += `<div class="stats-row">
      <div class="stat-card cyan"><div class="label">Уроков сегодня</div><div class="value">${countToday}</div></div>
      <div class="stat-card magenta"><div class="label">Замен в системе</div><div class="value">${ALL_REPLACEMENTS.length}</div></div>
      <div class="stat-card"><div class="label">Конфликтов</div><div class="value">${CONFLICTS.length}</div></div>
    </div>`;
    // Recent replacements
    const recent = ALL_REPLACEMENTS.slice(0, 5);
    if (recent.length) {
      html += `<div style="font-size:13px;font-weight:600;margin:14px 4px 8px;">Последние замены</div><div class="history-list">`;
      for (const r of recent) {
        html += `<div class="history-item">
          <div class="history-date">${new Date(r.created_at).toLocaleDateString("ru-RU")}</div>
          <div><b>${escapeHtml(r.day)}</b> · урок ${r.lesson_no}</div>
          <div>${escapeHtml(r.dept)} ${escapeHtml(r.cls || '')} кл · ${escapeHtml(r.subject || '')}</div>
          <div><span class="click-link" onclick="openTeacherCard('${escapeHtml(r.absent_name)}')">${escapeHtml(r.absent_name)}</span> <span class="history-arrow">→</span> <span class="click-link" onclick="openTeacherCard('${escapeHtml(r.replacement_name)}')">${escapeHtml(r.replacement_name)}</span></div>
          <div></div>
        </div>`;
      }
      html += `</div>`;
    }
  }
  root.innerHTML = html;
}

// ============= REPLACEMENTS HISTORY =============
let ALL_REPLACEMENTS = [];
async function loadReplacements() {
  try {
    const r = await API.listReplacements();
    ALL_REPLACEMENTS = r.replacements;
  } catch(e) { ALL_REPLACEMENTS = []; }
}

function renderHistory() {
  const root = document.getElementById("sectionHistory");
  const f = state.historyFilters;
  let items = ALL_REPLACEMENTS.slice();
  if (f.dept !== "all") items = items.filter(r => r.dept === f.dept);
  if (f.teacher) {
    const q = f.teacher.toLowerCase();
    items = items.filter(r => (r.absent_name || '').toLowerCase().includes(q) || (r.replacement_name || '').toLowerCase().includes(q));
  }
  if (f.from) items = items.filter(r => new Date(r.created_at) >= new Date(f.from));
  if (f.to)   items = items.filter(r => new Date(r.created_at) <= new Date(f.to + "T23:59:59"));

  let html = `<div class="history-filters">
    <input type="text" placeholder="🔍 Учитель" value="${escapeHtml(f.teacher)}" oninput="state.historyFilters.teacher=this.value; renderHistory();" style="flex:1;min-width:160px;">
    <select onchange="state.historyFilters.dept=this.value; renderHistory();">
      <option value="all">Все отделения</option>
      ${DEPTS.map(d => `<option value="${d}" ${f.dept===d?'selected':''}>${d}</option>`).join("")}
    </select>
    <input type="date" value="${f.from}" onchange="state.historyFilters.from=this.value; renderHistory();" title="С даты">
    <input type="date" value="${f.to}" onchange="state.historyFilters.to=this.value; renderHistory();" title="По дату">
    <button class="btn secondary" onclick="state.historyFilters={dept:'all',teacher:'',from:'',to:''}; renderHistory();">Сброс</button>
    <button class="btn" onclick="loadReplacements().then(renderHistory)">⟳ Обновить</button>
  </div>`;

  if (items.length === 0) {
    html += `<div class="history-list"><div class="history-empty">Замен пока нет</div></div>`;
  } else {
    html += `<div class="history-list">
      <div class="history-item" style="background:#F9FAFB;font-weight:600;color:var(--text-muted);text-transform:uppercase;font-size:10px;letter-spacing:0.05em;">
        <div>Создана</div><div>День / урок</div><div>Где</div><div>Кого заменили</div><div></div>
      </div>`;
    for (const r of items) {
      html += `<div class="history-item">
        <div class="history-date">${new Date(r.created_at).toLocaleString("ru-RU")}</div>
        <div><b>${escapeHtml(r.day)}</b> · урок ${r.lesson_no}<br><span style="color:var(--text-muted);font-size:11px;">${escapeHtml(r.time || '')}</span></div>
        <div>${escapeHtml(r.dept)} · <span class="click-link" onclick="openClassCard('${escapeHtml(r.dept)}','${escapeHtml(r.cls)}')">${escapeHtml(r.cls || '')} кл</span> · ${escapeHtml(r.subject || '')}${r.room ? '<br><span style="color:var(--text-muted);">каб ' + escapeHtml(r.room) + '</span>' : ''}</div>
        <div><span class="click-link" onclick="openTeacherCard('${escapeHtml(r.absent_name)}')">${escapeHtml(r.absent_name || '')}</span> <span class="history-arrow">→</span> <span class="click-link" onclick="openTeacherCard('${escapeHtml(r.replacement_name)}')">${escapeHtml(r.replacement_name || '')}</span></div>
        <div></div>
      </div>`;
    }
    html += `</div>`;
  }
  root.innerHTML = html;
}

// ============= ADMIN PANEL =============
function renderAdmin() {
  const root = document.getElementById("sectionAdmin");
  if (CURRENT_USER.role !== "head") { root.innerHTML = `<div class="history-empty">Раздел доступен только завучам</div>`; return; }

  const myDepts = getMyAllowedDepts();
  let html = `<div style="display:flex;gap:8px;margin-bottom:12px;align-items:center;flex-wrap:wrap;">
    <h3 style="margin:0;">Сотрудники школы</h3>
    <div style="color:var(--text-muted);font-size:12px;">${ACCOUNTS.length} аккаунтов</div>
    <div style="flex:1;"></div>
    <label class="btn secondary" style="cursor:pointer;margin:0;">
      ⤴ Импорт расписания (Excel)
      <input type="file" accept=".xlsx,.xls" onchange="importExcelFile(this)" style="display:none;">
    </label>
    <select id="importDept" style="padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:white;">
      ${myDepts.map(d => `<option value="${d}">${d}</option>`).join("")}
    </select>
    <button class="btn" onclick="openAdminUserNew()">+ Добавить сотрудника</button>
  </div>
  <div class="admin-list">
    <div class="admin-row header-row">
      <div></div><div>ФИО</div><div>Логин</div><div>Должность</div><div>Отделения</div><div></div>
    </div>`;
  const sorted = ACCOUNTS.slice().sort((a,b) => (a.role===b.role?0:a.role==="head"?-1:1) || a.name.localeCompare(b.name, "ru"));
  for (const a of sorted) {
    const titleDisplay = a.title || (a.role === "head" ? "Руководитель отделения" : "Учитель");
    html += `<div class="admin-row">
      <div class="um-av ${avatarColor(a.name)}">${getInitials(a.name)}</div>
      <div><b>${escapeHtml(a.name)}</b></div>
      <div style="font-family:ui-monospace,monospace;color:var(--ip-blue);font-size:11px;">${escapeHtml(a.email)}</div>
      <div>${escapeHtml(titleDisplay)}</div>
      <div>${(a.depts || []).join(", ") || (a.dept || '')}</div>
      <div><button class="edit-btn" onclick='openAdminUserEdit(${a.id})'>✎</button></div>
    </div>`;
  }
  html += `</div>`;
  root.innerHTML = html;
}

function openAdminUserNew() {
  document.getElementById("adminUserTitle").textContent = "Новый сотрудник";
  document.getElementById("auName").value = "";
  document.getElementById("auEmail").value = "";
  document.getElementById("auRole").value = "teacher";
  document.getElementById("auTitle").value = "Учитель";
  document.getElementById("auDepts").value = "";
  document.getElementById("auSubjects").value = "";
  document.getElementById("auError").textContent = "";
  document.getElementById("auResetBtn").style.display = "none";
  document.getElementById("auDelBtn").style.display = "none";
  window._editingUserId = null;
  document.getElementById("adminUserModal").classList.add("show");
}
function openAdminUserEdit(id) {
  const a = ACCOUNTS.find(x => x.id === id);
  if (!a) return;
  document.getElementById("adminUserTitle").textContent = "Редактирование сотрудника";
  document.getElementById("auName").value = a.name;
  document.getElementById("auEmail").value = a.email;
  document.getElementById("auRole").value = a.role;
  document.getElementById("auTitle").value = a.title || (a.role === "head" ? "Руководитель отделения" : "Учитель");
  document.getElementById("auDepts").value = (a.depts || []).join(", ");
  document.getElementById("auSubjects").value = (a.subjects || []).join(", ");
  document.getElementById("auError").textContent = "";
  document.getElementById("auResetBtn").style.display = "";
  document.getElementById("auDelBtn").style.display = "";
  window._editingUserId = id;
  document.getElementById("adminUserModal").classList.add("show");
}
async function saveUser() {
  const err = document.getElementById("auError");
  err.textContent = "";
  const data = {
    name: document.getElementById("auName").value.trim(),
    email: document.getElementById("auEmail").value.trim().toLowerCase(),
    role: document.getElementById("auRole").value,
    title: document.getElementById("auTitle").value.trim() || null,
    depts: document.getElementById("auDepts").value.split(",").map(s=>s.trim()).filter(Boolean),
    subjects: document.getElementById("auSubjects").value.split(",").map(s=>s.trim()).filter(Boolean),
    dept: (document.getElementById("auDepts").value.split(",")[0] || "").trim() || null,
  };
  if (!data.name || !data.email) { err.textContent = "Заполните имя и email"; return; }
  try {
    if (window._editingUserId) await API.adminUpdateUser(window._editingUserId, data);
    else await API.adminCreateUser(data);
    document.getElementById("adminUserModal").classList.remove("show");
    await reloadAccounts();
    renderAdmin();
  } catch (e) {
    err.textContent = e.message === "email_exists" ? "Такой email уже существует" : "Ошибка: " + e.message;
  }
}
async function resetUserPassword() {
  if (!window._editingUserId) return;
  if (!confirm("Сбросить пароль на «12345»? Пользователь будет вынужден поменять его при следующем входе.")) return;
  await API.adminResetPwd(window._editingUserId);
  alert("Пароль сброшен на 12345.");
}
async function deleteUser() {
  if (!window._editingUserId) return;
  if (!confirm("Удалить аккаунт? Это действие нельзя отменить.")) return;
  try {
    await API.adminDeleteUser(window._editingUserId);
    document.getElementById("adminUserModal").classList.remove("show");
    await reloadAccounts();
    renderAdmin();
  } catch(e) { alert("Ошибка: " + e.message); }
}
async function reloadAccounts() {
  const r = await API.accounts();
  ACCOUNTS = r.accounts;
}

async function importExcelFile(input) {
  const file = input.files[0];
  if (!file) return;
  const dept = document.getElementById("importDept").value;
  if (!confirm(`Импортировать расписание из «${file.name}» в отделение «${dept}»?\n\nСуществующие изменения для этого отделения будут перезаписаны.`)) {
    input.value = "";
    return;
  }
  try {
    // Preview first
    const preview = await API.importExcel(file, dept, true);
    if (preview.total === 0) {
      alert("Не удалось распознать уроки в файле. Проверьте формат: должны быть колонки «1 класс», «2 класс» и т.д., строки с днями недели.");
      input.value = "";
      return;
    }
    if (!confirm(`Распознано ${preview.total} уроков. Сохранить в базу?`)) {
      input.value = "";
      return;
    }
    const r = await API.importExcel(file, dept, false);
    alert(`Импортировано ${r.saved} уроков.`);
    input.value = "";
    await reloadSchedule();
    render();
  } catch (e) {
    alert("Ошибка импорта: " + e.message);
    input.value = "";
  }
}

// ============= TEACHER CARD =============
function teacherWeekSchedule(teacherName) {
  // Returns: { day: [ {dept, time, lesson_no, cls, subject, room} ] }
  const out = {};
  for (const day of DAYS) out[day] = [];
  for (const dept of DEPTS) {
    if (!DATA[dept]) continue;
    const sched = DATA[dept].schedule;
    for (const day of DAYS) {
      if (!sched[day]) continue;
      for (const lkey in sched[day]) {
        const ld = sched[day][lkey];
        for (const cls in ld.classes) {
          const info = ld.classes[cls];
          const items = info.groups ? info.groups : [info];
          for (const it of items) {
            if (it.teacher && it.teacher.trim() === teacherName) {
              out[day].push({ dept, time: ld.time, lesson_no: ld.lesson_no, cls, subject: it.subject, room: it.room || info.room });
            }
          }
        }
      }
    }
    for (const day of DAYS) {
      out[day].sort((a,b) => {
        const ta = parseTimeRange(a.time), tb = parseTimeRange(b.time);
        return (ta?ta.sh*60+ta.sm:0) - (tb?tb.sh*60+tb.sm:0);
      });
    }
  }
  return out;
}

function openTeacherCard(name) {
  const info = ALL_TEACHERS[name];
  if (!info) return;
  const week = teacherWeekSchedule(name);
  const totalH = info.total;
  const overloadCls = totalH > 36 ? "overload-high" : totalH > 30 ? "overload-mid" : "";
  const acc = ACCOUNTS.find(a => a.name === name);
  const subjEntries = Object.entries(info.subjectHours).sort((a,b) => b[1]-a[1]);

  let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
    <div style="display:flex;align-items:center;gap:12px;">
      <span class="teacher-avatar ${avatarColor(name)}" style="width:48px;height:48px;font-size:16px;">${getInitials(name)}</span>
      <div>
        <h3 style="margin:0;">${escapeHtml(name)}</h3>
        <div style="color:var(--text-muted);font-size:12px;">${acc ? escapeHtml(acc.email) : '—'} · ${(info.hoursByDept ? Object.keys(info.hoursByDept).join(", ") : '')}</div>
      </div>
    </div>
    <div class="no-print" style="display:flex;gap:8px;">
      <button class="btn secondary" onclick="printCard()">🖨 Печать / PDF</button>
      <button class="link-btn" onclick="document.getElementById('teacherCardModal').classList.remove('show')" style="font-size:14px;">✕</button>
    </div>
  </div>`;

  html += `<div class="stats-row" style="margin-bottom:14px;">
    <div class="stat-card" style="background:${totalH>36?'#FFE0E0':totalH>30?'#FFF7CC':'#E6F7FE'};"><div class="label">Часов в неделю</div><div class="value" style="color:${totalH>36?'#B91C1C':totalH>30?'#856404':'var(--ip-blue)'};">${totalH}${totalH>36?' ⚠ много':totalH>30?' ⚠':''}</div></div>
    <div class="stat-card"><div class="label">Предметов</div><div class="value">${subjEntries.length}</div></div>
    <div class="stat-card"><div class="label">Отделений</div><div class="value">${Object.keys(info.hoursByDept).length}</div></div>
  </div>`;

  html += `<div style="margin-bottom:12px;"><div style="font-size:11px;text-transform:uppercase;color:var(--text-muted);font-weight:600;letter-spacing:0.05em;margin-bottom:6px;">Предметы и часы</div>
    <div class="subj-chips">${subjEntries.map(([s,h]) => `<span class="subj-chip"><span class="subj-chip-name">${escapeHtml(s)}</span><span class="subj-chip-hours">${h}ч</span></span>`).join("")}</div>
  </div>`;

  html += `<div style="margin-bottom:8px;"><div style="font-size:11px;text-transform:uppercase;color:var(--text-muted);font-weight:600;letter-spacing:0.05em;margin-bottom:6px;">Расписание на неделю</div>`;
  for (const day of DAYS) {
    const lessons = week[day];
    if (lessons.length === 0) {
      html += `<div style="padding:6px 0;border-bottom:1px solid var(--border);"><b>${day}</b> <span style="color:var(--text-muted);font-size:11px;">— нет уроков</span></div>`;
      continue;
    }
    html += `<div style="padding:8px 0;border-bottom:1px solid var(--border);">
      <div style="font-weight:600;margin-bottom:4px;">${day}</div>`;
    for (const L of lessons) {
      html += `<div style="display:flex;gap:10px;align-items:center;font-size:12px;padding:3px 0;">
        <span style="min-width:90px;color:var(--ip-blue);font-weight:500;">${escapeHtml(L.time)}</span>
        <span style="font-weight:600;">${escapeHtml(L.subject || '—')}</span>
        <span style="color:var(--text-muted);">${escapeHtml(L.dept)} · ${escapeHtml(L.cls)} кл${L.room ? ' · каб ' + escapeHtml(L.room) : ''}</span>
      </div>`;
    }
    html += `</div>`;
  }
  html += `</div>`;

  document.getElementById("teacherCardBody").innerHTML = html;
  document.getElementById("teacherCardModal").classList.add("show");
  document.getElementById("teacherCardModal").dataset.printable = "true";
}

// ============= CLASS CARD =============
function openClassCard(dept, cls) {
  if (!DATA[dept]) return;
  const sched = DATA[dept].schedule;
  let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
    <div>
      <h3 style="margin:0;">${escapeHtml(cls)} класс</h3>
      <div style="color:var(--text-muted);font-size:12px;">Отделение: ${escapeHtml(dept)}</div>
    </div>
    <div class="no-print" style="display:flex;gap:8px;">
      <button class="btn secondary" onclick="printCard()">🖨 Печать / PDF</button>
      <button class="link-btn" onclick="document.getElementById('classCardModal').classList.remove('show')" style="font-size:14px;">✕</button>
    </div>
  </div>`;

  // Collect all unique time slots
  const slots = []; // {time, lesson_no, day -> info}
  for (const day of DAYS) {
    if (!sched[day]) continue;
    for (const lkey in sched[day]) {
      const ld = sched[day][lkey];
      // Skip right-side lessons if class is 5-9 (and vice versa)
      const isRight = !!ld.right_side;
      const isHigh = ["10","11"].includes(cls);
      if (isHigh !== isRight) continue;
      const info = ld.classes[cls];
      if (!info) continue;
      let slot = slots.find(s => s.lesson_no === ld.lesson_no && s.time === ld.time);
      if (!slot) {
        slot = { lesson_no: ld.lesson_no, time: ld.time, byDay: {} };
        slots.push(slot);
      }
      slot.byDay[day] = info;
    }
  }
  slots.sort((a,b) => {
    const ta = parseTimeRange(a.time), tb = parseTimeRange(b.time);
    if (ta && tb) return (ta.sh*60+ta.sm) - (tb.sh*60+tb.sm);
    return a.lesson_no - b.lesson_no;
  });

  html += `<table class="schedule"><thead><tr><th>№</th><th>Время</th>`;
  for (const day of DAYS) html += `<th class="cls-h">${day}</th>`;
  html += `</tr></thead><tbody>`;
  for (const slot of slots) {
    html += `<tr><td class="lesson-no">${slot.lesson_no}</td><td class="lesson-time">${escapeHtml(slot.time)}</td>`;
    for (const day of DAYS) {
      const info = slot.byDay[day];
      if (!info) { html += `<td></td>`; continue; }
      const items = info.groups ? info.groups : [info];
      const cells = items.map(it => `<div class="cell-group">
        <div class="cell-subject ${subjectClass(it.subject || '')}">${escapeHtml(it.subject || '—')}${(it.room || info.room) ? `<span class="cell-room">${escapeHtml(it.room || info.room)}</span>` : ''}</div>
        ${it.teacher ? `<div class="cell-teacher click-link" onclick="document.getElementById('classCardModal').classList.remove('show'); openTeacherCard('${escapeHtml(it.teacher).replace(/'/g, "\\'")}')">${escapeHtml(it.teacher)}</div>` : ''}
      </div>`).join("");
      html += `<td>${cells}</td>`;
    }
    html += `</tr>`;
  }
  html += `</tbody></table>`;

  document.getElementById("classCardBody").innerHTML = html;
  document.getElementById("classCardModal").classList.add("show");
  document.getElementById("classCardModal").dataset.printable = "true";
}

function printCard() {
  // Mark the open modal as printable
  for (const m of document.querySelectorAll(".modal-bg.show")) m.classList.add("print-active");
  window.print();
  setTimeout(() => {
    for (const m of document.querySelectorAll(".modal-bg")) m.classList.remove("print-active");
  }, 500);
}

function printSchedule() {
  // Print the current schedule view (day or full week) for current dept
  // If viewing day, switch to a temporary "all" classes mode for printing the whole dept
  // Inject a print header with dept + period info
  const dept = state.dept;
  const period = state.view === "week" ? "Расписание на неделю" : `Расписание · ${state.day}`;
  const clsFilter = state.classFilter === "all" ? "" : ` · ${state.classFilter} класс`;
  const headerHtml = `<div class="print-header" style="text-align:center; margin-bottom: 14px; padding: 10px 0; border-bottom: 2px solid var(--ip-blue);">
    <div style="font-size: 20px; font-weight: 700; color: var(--ip-blue);">Интеллект-плюс · ${escapeHtml(dept)}</div>
    <div style="font-size: 13px; color: var(--text); margin-top: 2px;">${escapeHtml(period)}${escapeHtml(clsFilter)}</div>
    <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">Распечатано: ${new Date().toLocaleString("ru-RU")}</div>
  </div>`;
  const main = document.getElementById("mainContent");
  // Insert header at top
  const existing = main.querySelector(".print-header");
  if (existing) existing.remove();
  const hdr = document.createElement("div");
  hdr.innerHTML = headerHtml;
  main.insertBefore(hdr.firstChild, main.firstChild);
  document.body.classList.add("print-grid");
  window.print();
  setTimeout(() => {
    document.body.classList.remove("print-grid");
    const h = main.querySelector(".print-header");
    if (h) h.remove();
  }, 500);
}

// ============= EDIT MODE =============
function getMyAllowedDepts() {
  if (!CURRENT_USER || CURRENT_USER.role !== "head") return [];
  if (CURRENT_USER.depts && CURRENT_USER.depts.length > 0) return CURRENT_USER.depts;
  if (CURRENT_USER.dept) return [CURRENT_USER.dept];
  return [];
}
function canEditDept(dept) {
  const allowed = getMyAllowedDepts();
  return allowed.includes(dept);
}
// Backwards compat — returns first allowed dept
function getMyAllowedDept() {
  const d = getMyAllowedDepts();
  return d.length > 0 ? d[0] : null;
}
function isDirector() {
  const d = getMyAllowedDepts();
  return d.length >= 4;
}

function toggleEditMode() {
  // For non-head, no-op
  if (!CURRENT_USER || CURRENT_USER.role !== "head") return;
  EDIT_MODE = !EDIT_MODE;
  document.body.classList.toggle("edit-mode", EDIT_MODE);
  document.getElementById("editModeBtn").classList.toggle("active", EDIT_MODE);
  document.getElementById("editModeBtn").innerHTML = EDIT_MODE ? "✕ Завершить редактирование" : "✎ Редактировать";
  render();
}

function openCellEditor(dept, day, lkey, cls, lessonNo, time) {
  if (!canEditDept(dept)) {
    const my = getMyAllowedDepts();
    alert(`Отделение «${dept}» — только просмотр. Вы можете редактировать: ${my.join(", ") || "—"}.`);
    return;
  }

  _editingCell = { dept, day, lkey, cls, lessonNo, time };
  // Pre-fill from current data
  const lesson = DATA[dept].schedule[day] && DATA[dept].schedule[day][lkey];
  const info = lesson && lesson.classes[cls];

  document.getElementById("cellEditTitle").textContent = `${dept} · ${cls} класс`;
  document.getElementById("cellEditContext").innerHTML =
    `<b>${day}</b> · Урок ${lessonNo} · ${escapeHtml(time)}` +
    (info && info._edited ? ' <span style="color:var(--ip-blue);">✎ изменено</span>' : '');

  let subj = "", teacher = "", room = "";
  if (info && !info.groups) {
    subj = info.subject || "";
    teacher = info.teacher || "";
    room = info.room || "";
  } else if (info && info.groups) {
    // For groups, just show first one — full group editing is more complex
    const g = info.groups[0] || {};
    subj = g.subject || "";
    teacher = g.teacher || "";
    room = g.room || info.room || "";
  }
  document.getElementById("ceSubject").value = subj;
  document.getElementById("ceRoom").value = room;
  document.getElementById("ceError").textContent = "";
  document.getElementById("ceWarning").style.display = "none";
  document.getElementById("ceSuggestions").innerHTML = "";
  _suggestionsCache = [];
  document.getElementById("ceRevertBtn").style.display = (info && info._edited) ? "" : "none";

  // Populate subjects datalist
  const allSubj = new Set();
  for (const tn in ALL_TEACHERS) for (const s in ALL_TEACHERS[tn].subjectHours) allSubj.add(s);
  document.getElementById("subjectsList").innerHTML = [...allSubj].sort().map(s => `<option value="${escapeHtml(s)}">`).join("");

  // Populate teacher dropdown with conflict markers
  populateTeacherDropdown(teacher, day, time);

  document.getElementById("cellEditModal").classList.add("show");
}

function populateTeacherDropdown(selected, day, time) {
  const sel = document.getElementById("ceTeacher");
  const sortedNames = Object.keys(ALL_TEACHERS).sort((a,b) => a.localeCompare(b, "ru"));
  let html = `<option value="">— не выбран —</option>`;
  for (const n of sortedNames) {
    const busy = isTeacherBusyAt(n, day, time);
    const label = `${n} (${ALL_TEACHERS[n].total} ч)${busy ? " ⚠ занят" : ""}`;
    html += `<option value="${escapeHtml(n)}" ${n === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  }
  sel.innerHTML = html;
}

function autoSuggestCell() {
  if (!_editingCell) return;
  const subjEl = document.getElementById("ceSubject");
  const teacherEl = document.getElementById("ceTeacher");
  const roomEl = document.getElementById("ceRoom");
  const subj = subjEl.value.trim();
  const teacher = teacherEl.value.trim();
  const wrap = document.getElementById("ceSuggestions");

  // Strategy:
  // - subj filled, teacher empty → suggest teachers who teach subj
  // - teacher filled, subj empty → suggest subjects that teacher teaches
  // - both filled → suggest alternative teachers for the same subj (e.g. when current is busy)
  // - both empty → look at what teachers usually teach this class at this time (history); fallback: free teachers in dept

  const suggestions = [];

  function teacherSubjectMatch(teacherName, targetSubj) {
    if (!targetSubj) return null;
    const subjects = Object.keys(ALL_TEACHERS[teacherName].subjectHours || {});
    const tl = targetSubj.toLowerCase();
    for (const s of subjects) {
      const sl = s.toLowerCase();
      if (sl === tl) return { subj: s, exact: true };
      const w1 = tl.split(/\s+/);
      const w2 = sl.split(/\s+/);
      for (const w of w1) {
        if (w.length < 4) continue;
        if (w2.some(x => x.includes(w) || w.includes(x))) return { subj: s, exact: false };
      }
    }
    return null;
  }

  if (subj && !teacher) {
    // List teachers who can teach this subject, prefer free + same dept + lower load
    for (const tn in ALL_TEACHERS) {
      const match = teacherSubjectMatch(tn, subj);
      if (!match) continue;
      const busy = isTeacherBusyAt(tn, _editingCell.day, _editingCell.time);
      const info = ALL_TEACHERS[tn];
      const sameDept = !!info.hoursByDept[_editingCell.dept];
      suggestions.push({
        kind: "teacher",
        teacher: tn,
        subject: match.subj,
        matchExact: match.exact,
        busy, sameDept,
        load: info.total,
        room: bestRoomForTeacherSubject(tn, match.subj, _editingCell.dept),
      });
    }
    suggestions.sort((a, b) => {
      if (a.busy !== b.busy) return a.busy ? 1 : -1;
      if (a.sameDept !== b.sameDept) return a.sameDept ? -1 : 1;
      if (a.matchExact !== b.matchExact) return a.matchExact ? -1 : 1;
      return a.load - b.load;
    });
  } else if (teacher && !subj) {
    // List subjects this teacher teaches, ordered by total hours
    const info = ALL_TEACHERS[teacher];
    if (info) {
      const sorted = Object.entries(info.subjectHours).sort((a,b) => b[1]-a[1]);
      for (const [s, h] of sorted) {
        suggestions.push({
          kind: "subject",
          teacher: teacher,
          subject: s,
          hours: h,
          busy: isTeacherBusyAt(teacher, _editingCell.day, _editingCell.time),
          room: bestRoomForTeacherSubject(teacher, s, _editingCell.dept),
        });
      }
    }
  } else if (subj && teacher) {
    // Suggest alternative teachers for same subject (in case current is busy/overloaded)
    for (const tn in ALL_TEACHERS) {
      if (tn === teacher) continue;
      const match = teacherSubjectMatch(tn, subj);
      if (!match) continue;
      const busy = isTeacherBusyAt(tn, _editingCell.day, _editingCell.time);
      const info = ALL_TEACHERS[tn];
      const sameDept = !!info.hoursByDept[_editingCell.dept];
      suggestions.push({
        kind: "teacher",
        teacher: tn,
        subject: match.subj,
        matchExact: match.exact,
        busy, sameDept, load: info.total,
        room: bestRoomForTeacherSubject(tn, match.subj, _editingCell.dept),
      });
    }
    suggestions.sort((a, b) => {
      if (a.busy !== b.busy) return a.busy ? 1 : -1;
      if (a.sameDept !== b.sameDept) return a.sameDept ? -1 : 1;
      if (a.matchExact !== b.matchExact) return a.matchExact ? -1 : 1;
      return a.load - b.load;
    });
  } else {
    // Both empty — suggest free teachers in same dept with light load
    for (const tn in ALL_TEACHERS) {
      const info = ALL_TEACHERS[tn];
      if (!info.hoursByDept[_editingCell.dept]) continue;
      if (isTeacherBusyAt(tn, _editingCell.day, _editingCell.time)) continue;
      const topSubj = Object.entries(info.subjectHours).sort((a,b) => b[1]-a[1])[0];
      suggestions.push({
        kind: "teacher",
        teacher: tn,
        subject: topSubj ? topSubj[0] : "",
        load: info.total,
        busy: false,
        sameDept: true,
        matchExact: true,
        room: bestRoomForTeacherSubject(tn, topSubj ? topSubj[0] : "", _editingCell.dept),
      });
    }
    suggestions.sort((a, b) => a.load - b.load);
  }

  const top = suggestions.slice(0, 6);
  if (top.length === 0) {
    wrap.innerHTML = `<div class="suggestions-title">Подбор</div><div class="suggest-empty">Подходящих вариантов не найдено. Заполните вручную.</div>`;
    return;
  }

  let html = `<div class="suggestions-title">Рекомендации (топ ${top.length})</div>`;
  top.forEach((s, i) => {
    const subjLabel = s.subject ? escapeHtml(s.subject) : "—";
    const teacherLabel = s.teacher ? escapeHtml(s.teacher) : "—";
    const tInfo = ALL_TEACHERS[s.teacher];
    const meta = [];
    if (tInfo) meta.push(`${tInfo.total} ч/нед`);
    if (s.sameDept) meta.push("своё отделение");
    if (s.matchExact === false) meta.push("похожий предмет");
    if (s.hours) meta.push(`${s.hours}ч этого предмета`);
    const onclick = `applySuggestion(${i})`;
    html += `<div class="suggest-item" onclick="${onclick}">
      <div class="s-rank">${i+1}</div>
      <div class="s-main">
        <div class="s-name">${teacherLabel} · ${subjLabel}</div>
        <div class="s-meta">${meta.join(" · ")}${s.room ? ` · обычно каб. ${escapeHtml(s.room)}` : ""}</div>
      </div>
      <div class="s-status ${s.busy ? 'busy' : ''}">${s.busy ? "занят" : "свободен"}</div>
    </div>`;
  });
  wrap.innerHTML = html;
  _suggestionsCache = top;
}

let _suggestionsCache = [];
function applySuggestion(i) {
  const s = _suggestionsCache[i];
  if (!s) return;
  if (s.subject) document.getElementById("ceSubject").value = s.subject;
  if (s.teacher) {
    const sel = document.getElementById("ceTeacher");
    // Find option matching teacher
    for (const opt of sel.options) {
      if (opt.value === s.teacher) { sel.value = s.teacher; break; }
    }
  }
  if (s.room && !document.getElementById("ceRoom").value.trim()) {
    document.getElementById("ceRoom").value = s.room;
  }
  // Re-run suggestions for "now both filled" view
  autoSuggestCell();
}

// Find a typical room this teacher uses for this subject in this dept
function bestRoomForTeacherSubject(teacherName, subject, dept) {
  if (!teacherName || !subject) return "";
  const counts = {};
  if (!DATA[dept]) return "";
  const sched = DATA[dept].schedule;
  for (const day in sched) {
    for (const lkey in sched[day]) {
      const ld = sched[day][lkey];
      for (const cls in ld.classes) {
        const info = ld.classes[cls];
        const items = info.groups ? info.groups : [info];
        for (const it of items) {
          if (!it.teacher || !it.subject) continue;
          if (it.teacher.trim() !== teacherName) continue;
          if (it.subject.trim().toLowerCase() !== subject.toLowerCase()) continue;
          const r = it.room || info.room;
          if (r) counts[r] = (counts[r] || 0) + 1;
        }
      }
    }
  }
  let best = "", bestN = 0;
  for (const r in counts) if (counts[r] > bestN) { best = r; bestN = counts[r]; }
  return best;
}

async function saveCellEdit() {
  if (!_editingCell) return;
  const subject = document.getElementById("ceSubject").value.trim();
  const teacher = document.getElementById("ceTeacher").value;
  const room = document.getElementById("ceRoom").value.trim();
  const errEl = document.getElementById("ceError");
  errEl.textContent = "";

  if (!subject && !teacher) {
    errEl.textContent = "Заполните хотя бы предмет или учителя, или нажмите «Очистить ячейку»";
    return;
  }

  // Warn if teacher is busy
  if (teacher && isTeacherBusyAt(teacher, _editingCell.day, _editingCell.time)) {
    if (!confirm(`Внимание: ${teacher} уже занят в это время. Всё равно сохранить?`)) return;
  }

  try {
    await API.saveEdit({
      dept: _editingCell.dept,
      day: _editingCell.day,
      lesson_key: _editingCell.lkey,
      cls: _editingCell.cls,
      lesson_no: _editingCell.lessonNo,
      time: _editingCell.time,
      subject, teacher, room,
      cleared: false,
    });
    document.getElementById("cellEditModal").classList.remove("show");
    await reloadSchedule();
    render();
  } catch (e) {
    errEl.textContent = "Ошибка: " + e.message;
  }
}

async function clearCell() {
  if (!_editingCell) return;
  if (!confirm("Очистить эту ячейку — урок не будет проводиться?")) return;
  try {
    await API.saveEdit({
      dept: _editingCell.dept,
      day: _editingCell.day,
      lesson_key: _editingCell.lkey,
      cls: _editingCell.cls,
      lesson_no: _editingCell.lessonNo,
      time: _editingCell.time,
      cleared: true,
    });
    document.getElementById("cellEditModal").classList.remove("show");
    await reloadSchedule();
    render();
  } catch (e) {
    document.getElementById("ceError").textContent = "Ошибка: " + e.message;
  }
}

async function revertCell() {
  if (!_editingCell) return;
  if (!confirm("Откатить эту ячейку к исходному расписанию?")) return;
  try {
    await API.revertEdit(_editingCell.dept, _editingCell.day, _editingCell.lkey, _editingCell.cls);
    document.getElementById("cellEditModal").classList.remove("show");
    await reloadSchedule();
    render();
  } catch (e) {
    document.getElementById("ceError").textContent = "Ошибка: " + e.message;
  }
}

async function reloadSchedule() {
  const r = await API.schedule();
  DATA = r;
  ALL_TEACHERS = buildAllTeachersData();
  CONFLICTS = findConflicts();
  renderStats();
  renderConflictPanel();
}

// ============= DRAG AND DROP =============
let _dragSrc = null;

function parseCellKey(s) {
  // dept|day|lkey|cls|lesson_no|time
  const parts = s.split("|");
  return { dept: parts[0], day: parts[1], lkey: parts[2], cls: parts[3], lesson_no: parseInt(parts[4]), time: parts[5] };
}

function getCellInfo(dept, day, lkey, cls) {
  const lesson = DATA[dept] && DATA[dept].schedule[day] && DATA[dept].schedule[day][lkey];
  if (!lesson) return null;
  return lesson.classes[cls] || null;
}

function onCellDragStart(e) {
  const td = e.currentTarget;
  const key = td.dataset.cell;
  if (!key) return;
  const src = parseCellKey(key);
  // Only allow drag if cell has content (don't drag empty cells)
  const info = getCellInfo(src.dept, src.day, src.lkey, src.cls);
  if (!info) { e.preventDefault(); return; }
  _dragSrc = { ...src, info };
  td.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
  // Set some data for browsers that require it
  try { e.dataTransfer.setData("text/plain", key); } catch(err) {}
}

function onCellDragOver(e) {
  if (!_dragSrc) return;
  e.preventDefault();
  const td = e.currentTarget;
  const tgt = parseCellKey(td.dataset.cell);
  // Don't highlight self
  if (tgt.dept === _dragSrc.dept && tgt.day === _dragSrc.day && tgt.lkey === _dragSrc.lkey && tgt.cls === _dragSrc.cls) return;
  // Different dept = not allowed
  if (tgt.dept !== _dragSrc.dept) { e.dataTransfer.dropEffect = "none"; return; }
  e.dataTransfer.dropEffect = "move";
  const tgtInfo = getCellInfo(tgt.dept, tgt.day, tgt.lkey, tgt.cls);
  td.classList.remove("drop-target", "drop-target-swap");
  td.classList.add(tgtInfo ? "drop-target-swap" : "drop-target");
}

function onCellDragLeave(e) {
  e.currentTarget.classList.remove("drop-target", "drop-target-swap");
}

function onCellDragEnd(e) {
  // Clean up all drag visuals
  for (const el of document.querySelectorAll(".dragging, .drop-target, .drop-target-swap")) {
    el.classList.remove("dragging", "drop-target", "drop-target-swap");
  }
  _dragSrc = null;
}

function infoToEditPayload(info) {
  // Convert cell info to API edit payload fields (subject/teacher/room or groups)
  if (!info) return { subject: null, teacher: null, room: null, groups: null, cleared: false };
  if (info.groups) return { groups: info.groups, subject: null, teacher: null, room: info.room || null, cleared: false };
  return { subject: info.subject || null, teacher: info.teacher || null, room: info.room || null, groups: null, cleared: false };
}

async function onCellDrop(e) {
  e.preventDefault();
  if (!_dragSrc) return;
  const td = e.currentTarget;
  const tgt = parseCellKey(td.dataset.cell);
  td.classList.remove("drop-target", "drop-target-swap");

  // Self-drop = no-op
  if (tgt.dept === _dragSrc.dept && tgt.day === _dragSrc.day && tgt.lkey === _dragSrc.lkey && tgt.cls === _dragSrc.cls) {
    return;
  }
  // Cross-dept not allowed
  if (tgt.dept !== _dragSrc.dept) {
    alert("Перетаскивать можно только внутри одного отделения.");
    return;
  }
  // Check permissions
  if (!canEditDept(tgt.dept)) {
    alert(`Отделение «${tgt.dept}» — только просмотр. Ваши отделения: ${getMyAllowedDepts().join(", ")}.`);
    return;
  }

  const srcInfo = _dragSrc.info;
  const tgtInfo = getCellInfo(tgt.dept, tgt.day, tgt.lkey, tgt.cls);

  // Warn about teacher conflicts at new location
  function firstTeacher(info) {
    if (!info) return null;
    if (info.groups && info.groups[0]) return info.groups[0].teacher || null;
    return info.teacher || null;
  }
  const movedTeacher = firstTeacher(srcInfo);
  if (movedTeacher && isTeacherBusyAt(movedTeacher, tgt.day, tgt.time)) {
    // is busy elsewhere — but not at the source we're moving from (we'll be moving them away there)
    // Check: at the destination time, is the teacher in OTHER cells (not src)?
    let conflict = false;
    for (const dept of DEPTS) {
      if (!DATA[dept]) continue;
      const sched = DATA[dept].schedule;
      if (!sched[tgt.day]) continue;
      for (const lkey in sched[tgt.day]) {
        const ld = sched[tgt.day][lkey];
        if (ld.time !== tgt.time) continue;
        for (const cls in ld.classes) {
          const info = ld.classes[cls];
          const items = info.groups ? info.groups : [info];
          for (const it of items) {
            if (it.teacher && it.teacher.trim() === movedTeacher) {
              // Same as source? skip
              if (dept === _dragSrc.dept && tgt.day === _dragSrc.day && lkey === _dragSrc.lkey && cls === _dragSrc.cls) continue;
              // Same as target? this is the cell we're replacing, swap will handle
              if (dept === tgt.dept && lkey === tgt.lkey && cls === tgt.cls) continue;
              conflict = true;
            }
          }
        }
      }
    }
    if (conflict && !confirm(`Учитель ${movedTeacher} уже занят в это время. Всё равно переместить?`)) {
      onCellDragEnd();
      return;
    }
  }

  try {
    // Move A → B
    const moveFromSrc = {
      dept: _dragSrc.dept, day: _dragSrc.day,
      lesson_key: _dragSrc.lkey, cls: _dragSrc.cls,
      lesson_no: _dragSrc.lesson_no, time: _dragSrc.time,
    };
    const moveToTgt = {
      dept: tgt.dept, day: tgt.day,
      lesson_key: tgt.lkey, cls: tgt.cls,
      lesson_no: tgt.lesson_no, time: tgt.time,
    };

    if (!tgtInfo) {
      // Simple move: src → tgt, src becomes cleared
      await API.saveEdit({ ...moveToTgt, ...infoToEditPayload(srcInfo) });
      await API.saveEdit({ ...moveFromSrc, cleared: true });
    } else {
      // Swap: src ← tgtInfo, tgt ← srcInfo
      await API.saveEdit({ ...moveFromSrc, ...infoToEditPayload(tgtInfo) });
      await API.saveEdit({ ...moveToTgt, ...infoToEditPayload(srcInfo) });
    }
    await reloadSchedule();
    render();
  } catch (err) {
    alert("Не удалось переместить: " + err.message);
  } finally {
    onCellDragEnd();
  }
}

// ============= MY SCHEDULE =============
function setMyView(v) {
  state.myView = v;
  renderMy();
}
function setMyDay(d) {
  state.myDay = d;
  renderMy();
}

function teacherLessonsForDay(teacherName, day) {
  // Returns ordered list of lessons for given day
  const result = findUserLessonsToday(teacherName, day);
  return result;
}

function renderMy() {
  const root = document.getElementById("sectionMy");
  const u = CURRENT_USER;
  if (!u) return;

  const hasLessons = ALL_TEACHERS[u.name] && ALL_TEACHERS[u.name].total > 0;
  if (!hasLessons) {
    root.innerHTML = `<div class="history-empty">У вас нет преподаваемых уроков в расписании.</div>`;
    return;
  }

  const view = state.myView;
  const today = todayDayName();
  if (view === "today" && state.myDay !== today) state.myDay = today;

  // Stats
  const week = teacherWeekSchedule(u.name);
  let weekHours = 0;
  for (const d of DAYS) weekHours += week[d].length;

  let html = `<div class="today-greeting">
    <h2>Моё расписание</h2>
    <div class="day-of-week">${escapeHtml(u.name)} · ${weekHours} часов в неделю</div>
  </div>`;

  // View switch
  html += `<div class="toolbar" style="margin-bottom:10px;">
    <div class="view-switch">
      <button class="${view==='today'?'active':''}" onclick="setMyView('today')">Сегодня</button>
      <button class="${view==='day'?'active':''}" onclick="setMyView('day')">День</button>
      <button class="${view==='week'?'active':''}" onclick="setMyView('week')">Неделя</button>
    </div>`;
  if (view === "day") {
    html += `<div style="display:flex; align-items:center; gap: 6px; margin-left: 12px;">
      <span style="font-size:12px;color:var(--text-muted);">Выберите день:</span>
      ${DAYS.map(d => `<button class="day-tab ${state.myDay===d?'active':''}" onclick="setMyDay('${d}')">${d}</button>`).join("")}
    </div>`;
  }
  html += `<div style="flex:1;"></div><button class="btn secondary" onclick="printMy()">🖨 Печать</button></div>`;

  if (view === "today" || view === "day") {
    const day = view === "today" ? today : state.myDay;
    const lessons = teacherLessonsForDay(u.name, day);
    if (lessons.length === 0) {
      html += `<div class="today-list"><div class="history-empty">${day === today ? "Сегодня" : day} у вас нет уроков 🎉</div></div>`;
    } else {
      html += `<div style="font-size:13px;color:var(--text-muted);margin:6px 4px;"><b>${day}</b> · ${lessons.length} уроков</div>`;
      html += `<div class="today-list">`;
      for (const L of lessons) {
        const status = (view === "today") ? lessonTimeStatus(L.time) : "future";
        const tags = (status === "now") ? `<span class="today-tag tag-now">сейчас</span>` : "";
        html += `<div class="today-card ${status}">
          <div class="today-time">${escapeHtml(L.time)}<small>урок ${L.lesson_no}</small></div>
          <div class="today-main">
            <div class="today-subj">${escapeHtml(L.subject || '—')}</div>
            <div class="today-meta">${escapeHtml(L.dept)} · <a class="click-link" onclick="openClassCard('${L.dept}','${L.cls}')">${L.cls} класс</a>${L.room ? ' · каб ' + escapeHtml(L.room) : ''}</div>
          </div>
          <div class="today-tags">${tags}</div>
        </div>`;
      }
      html += `</div>`;
    }
  } else if (view === "week") {
    // Weekly grid: rows = lesson_no/time, columns = days
    // Build time slots across all days
    const slots = [];
    for (const day of DAYS) {
      for (const L of week[day]) {
        let slot = slots.find(s => s.time === L.time);
        if (!slot) { slot = { time: L.time, byDay: {} }; slots.push(slot); }
        slot.byDay[day] = L;
      }
    }
    slots.sort((a,b) => {
      const ta = parseTimeRange(a.time), tb = parseTimeRange(b.time);
      return (ta?ta.sh*60+ta.sm:0) - (tb?tb.sh*60+tb.sm:0);
    });

    if (slots.length === 0) {
      html += `<div class="today-list"><div class="history-empty">На этой неделе у вас нет уроков 🎉</div></div>`;
    } else {
      html += `<div class="grid-wrap"><table class="schedule"><thead><tr><th>Время</th>`;
      for (const day of DAYS) html += `<th class="cls-h">${day}</th>`;
      html += `</tr></thead><tbody>`;
      for (const slot of slots) {
        html += `<tr><td class="lesson-time">${escapeHtml(slot.time)}</td>`;
        for (const day of DAYS) {
          const L = slot.byDay[day];
          if (!L) { html += `<td></td>`; continue; }
          html += `<td>
            <div class="cell-subject ${subjectClass(L.subject || '')}">${escapeHtml(L.subject || '—')}${L.room ? `<span class="cell-room">${escapeHtml(L.room)}</span>` : ''}</div>
            <div class="cell-teacher" style="font-size:10px;">${escapeHtml(L.dept)} · <span class="click-link" onclick="openClassCard('${L.dept}','${L.cls}')">${L.cls} кл</span></div>
          </td>`;
        }
        html += `</tr>`;
      }
      html += `</tbody></table></div>`;
    }
  }
  root.innerHTML = html;
}

function printMy() {
  // Inject header and print "My" section
  const u = CURRENT_USER;
  const period = state.myView === "today" ? `Сегодня · ${todayDayName()}`
              : state.myView === "day" ? state.myDay
              : "Вся неделя";
  const headerHtml = `<div class="print-header" style="text-align:center; margin-bottom: 14px; padding: 10px 0; border-bottom: 2px solid var(--ip-blue);">
    <div style="font-size: 20px; font-weight: 700; color: var(--ip-blue);">Интеллект-плюс</div>
    <div style="font-size: 14px; color: var(--text); margin-top: 4px;">Расписание · ${escapeHtml(u.name)}</div>
    <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">${escapeHtml(period)}</div>
    <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">${new Date().toLocaleString("ru-RU")}</div>
  </div>`;
  const root = document.getElementById("sectionMy");
  const existing = root.querySelector(".print-header");
  if (existing) existing.remove();
  const hdr = document.createElement("div");
  hdr.innerHTML = headerHtml;
  root.insertBefore(hdr.firstChild, root.firstChild);
  document.body.classList.add("print-my");
  window.print();
  setTimeout(() => {
    document.body.classList.remove("print-my");
    const h = root.querySelector(".print-header");
    if (h) h.remove();
  }, 500);
}

// ============= EMAIL UTILS =============
function copyEmail(email, btn) {
  if (!email || email === "—") return;
  navigator.clipboard.writeText(email).then(() => {
    const orig = btn.innerHTML;
    btn.innerHTML = "✓ Скопировано";
    btn.classList.add("copied");
    setTimeout(() => {
      btn.innerHTML = orig;
      btn.classList.remove("copied");
    }, 1500);
  }).catch(() => alert("Email: " + email));
}

function copyAllEmails() {
  const lines = [];
  for (const a of ACCOUNTS) {
    if (a.role !== "teacher") continue;
    lines.push(`${a.name}: ${a.email}`);
  }
  const txt = lines.join("\n");
  navigator.clipboard.writeText(txt).then(() => {
    const b = document.getElementById("copyAllBtn");
    const orig = b.textContent;
    b.textContent = `✓ Скопировано (${lines.length})`;
    setTimeout(() => { b.textContent = orig; }, 2000);
  }).catch(() => alert(txt));
}

function exportTeachersCSV() {
  // Header
  let csv = "ФИО,Логин,Роль,Отделения,Предметы,Часов в неделю\n";
  // Rows: teachers from ALL_TEACHERS + heads from ACCOUNTS
  for (const a of ACCOUNTS) {
    const tInfo = ALL_TEACHERS[a.name];
    const hours = tInfo ? tInfo.total : 0;
    const subjs = (a.subjects || (tInfo ? Object.keys(tInfo.subjectHours) : [])).join("; ");
    const depts = (a.depts || (a.dept ? [a.dept] : [])).join("; ");
    const role = a.role === "head" ? "Завуч" : "Учитель";
    const row = [a.name, a.email, role, depts, subjs, hours].map(v => {
      v = String(v == null ? "" : v);
      if (v.includes(",") || v.includes('"') || v.includes("\n")) return '"' + v.replace(/"/g, '""') + '"';
      return v;
    }).join(",");
    csv += row + "\n";
  }
  // UTF-8 BOM for Excel
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `intellekt-plus-teachers-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function printCredentialCards() {
  const url = window.location.origin;
  const logoSvg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <rect x="2"  y="2"  width="30" height="30" fill="#00B0E0"/>
    <rect x="35" y="2"  width="30" height="30" fill="#E6007E"/>
    <rect x="68" y="2"  width="30" height="30" fill="#76BC21"/>
    <rect x="2"  y="35" width="30" height="30" fill="#E6007E"/>
    <rect x="35" y="35" width="30" height="63" fill="#00B0E0"/>
    <rect x="68" y="35" width="30" height="30" fill="#FFD600"/>
    <rect x="2"  y="68" width="30" height="30" fill="#FFD600"/>
    <rect x="68" y="68" width="30" height="30" fill="#76BC21"/>
  </svg>`;

  // Open a new window with printable cards
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) { alert("Браузер заблокировал открытие окна. Разрешите всплывающие окна для этого сайта."); return; }
  const sorted = ACCOUNTS.slice().sort((a, b) => (a.role === b.role ? 0 : a.role === "head" ? -1 : 1) || a.name.localeCompare(b.name, "ru"));
  let cards = "";
  for (const a of sorted) {
    const titleLine = a.title ? `<div class="cred-row" style="color:var(--text-muted);font-size:11px;">${escapeHtml(a.title)}${a.dept ? " · " + escapeHtml(a.dept) : ""}</div>` : "";
    cards += `<div class="cred-card">
      <div class="cred-mini-logo">${logoSvg}<span>Интеллект-плюс · Расписание</span></div>
      <div class="cred-name">${a.name}</div>
      ${titleLine}
      <div class="cred-row"><span class="cred-label">Ссылка:</span> <span class="cred-value">${url}</span></div>
      <div class="cred-row"><span class="cred-label">Логин:</span> <span class="cred-value">${a.email}</span></div>
      <div class="cred-row"><span class="cred-label">Первичный пароль:</span> <span class="cred-value">12345</span></div>
      <div class="cred-note">Зайдите по ссылке, введите логин и пароль <b>12345</b>. Система попросит придумать новый пароль (минимум 6 символов).</div>
    </div>`;
  }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Карточки доступа — Интеллект-плюс</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 12px; background: white; color: #1A1F2E; }
      h2 { font-size: 18px; margin: 8px 12px 4px; color: #0067B3; }
      .note { font-size: 12px; color: #6B7280; margin: 0 12px 14px; }
      .cred-cards-wrap { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; padding: 0 10px; }
      .cred-card { border: 2px dashed #999; border-radius: 10px; padding: 14px 16px; page-break-inside: avoid; }
      .cred-mini-logo { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
      .cred-mini-logo svg { width: 24px; height: 24px; }
      .cred-mini-logo span { font-size: 12px; font-weight: 600; color: #0067B3; }
      .cred-name { font-size: 15px; font-weight: 700; margin-bottom: 8px; }
      .cred-row { font-size: 12px; margin-bottom: 4px; }
      .cred-label { color: #6B7280; margin-right: 4px; }
      .cred-value { font-family: ui-monospace, SF Mono, Menlo, monospace; font-weight: 600; background: #F1F2F4; padding: 1px 6px; border-radius: 3px; }
      .cred-note { margin-top: 8px; font-size: 10px; color: #6B7280; font-style: italic; line-height: 1.3; }
      .toolbar { position: sticky; top: 0; background: white; padding: 10px 12px; border-bottom: 1px solid #E5E7EB; z-index: 10; display: flex; gap: 8px; }
      .toolbar button { background: #00B0E0; color: white; border: 0; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; }
      @media print { .toolbar { display: none; } @page { size: portrait; margin: 8mm; } }
    </style>
    </head><body>
    <div class="toolbar">
      <button onclick="window.print()">🖨 Печать</button>
      <button onclick="window.close()" style="background:#6B7280;">Закрыть</button>
      <div style="flex:1;color:#6B7280;font-size:12px;line-height:32px;padding-left:10px;">${sorted.length} карточек · разрежьте по пунктиру и раздайте сотрудникам</div>
    </div>
    <h2>Карточки доступа на платформу</h2>
    <div class="note">Передайте каждому сотруднику его карточку. После первого входа пароль будет изменён на личный.</div>
    <div class="cred-cards-wrap">${cards}</div>
    </body></html>`);
  w.document.close();
}

async function quickResetPwd(userId, name) {
  if (!confirm(`Сбросить пароль аккаунта «${name}» на «12345»?\n\nПри следующем входе пользователь будет вынужден придумать новый пароль.`)) return;
  try {
    await API.adminResetPwd(userId);
    alert(`Пароль ${name} сброшен на 12345.`);
  } catch (e) {
    alert("Ошибка: " + e.message);
  }
}

// ============= ABSENCES =============
async function renderAbsences() {
  const root = document.getElementById("sectionAbsences");
  const u = CURRENT_USER;
  const isHead = u.role === "head";

  // Load data
  let absences = [];
  try { const r = await API.absences(); absences = r.absences; ABSENCES = absences; } catch(e) {}

  let html = `<div class="today-greeting"><h2>Отсутствия</h2>
    <div class="day-of-week">${isHead ? "Все сотрудники школы. Можно добавлять и отменять." : "Ваши отпуска, больничные и отгулы."}</div>
  </div>`;
  html += `<div style="display:flex;gap:8px;margin-bottom:12px;">
    <div style="flex:1;"></div>
    <button class="btn" onclick="openAbsenceModal()">+ Добавить отсутствие</button>
  </div>`;

  if (absences.length === 0) {
    html += `<div class="history-empty">Отсутствий пока нет.</div>`;
  } else {
    html += `<div class="history-list">
      <div class="history-item" style="background:#F9FAFB;font-weight:600;color:var(--text-muted);text-transform:uppercase;font-size:10px;letter-spacing:0.05em;">
        <div>Период</div><div>Сотрудник</div><div>Тип</div><div>Комментарий</div><div></div>
      </div>`;
    const KINDS = { vacation: "🏖 Отпуск", sick: "🤒 Больничный", personal: "📌 За свой счёт", other: "Прочее" };
    for (const a of absences) {
      const isOwn = a.user_id === u.id;
      const canDelete = isHead || isOwn;
      const period = a.start_date === a.end_date
        ? new Date(a.start_date).toLocaleDateString("ru-RU")
        : `${new Date(a.start_date).toLocaleDateString("ru-RU")} — ${new Date(a.end_date).toLocaleDateString("ru-RU")}`;
      html += `<div class="history-item">
        <div><b>${period}</b></div>
        <div>${escapeHtml(a.user_name || u.name)}${a.user_dept ? `<div style="color:var(--text-muted);font-size:11px;">${escapeHtml(a.user_dept)}</div>` : ""}</div>
        <div>${KINDS[a.kind] || a.kind}</div>
        <div style="color:var(--text-muted);font-size:11px;">${escapeHtml(a.note || "")}</div>
        <div>${canDelete ? `<button class="email-mini-btn" onclick="deleteAbsence(${a.id})" style="color:var(--ip-magenta);">Удалить</button>` : ""}</div>
      </div>`;
    }
    html += `</div>`;
  }
  root.innerHTML = html;
}

function openAbsenceModal() {
  document.getElementById("absenceModal").classList.add("show");
  // Populate users dropdown for head
  const sel = document.getElementById("absUser");
  if (CURRENT_USER.role === "head") {
    sel.parentElement.style.display = "";
    sel.innerHTML = ACCOUNTS.map(a => `<option value="${a.id}" ${a.id === CURRENT_USER.id ? "selected" : ""}>${escapeHtml(a.name)} · ${(a.depts || [a.dept || '']).join(", ")}</option>`).join("");
  } else {
    sel.parentElement.style.display = "none";
  }
  document.getElementById("absStart").value = "";
  document.getElementById("absEnd").value = "";
  document.getElementById("absKind").value = "vacation";
  document.getElementById("absNote").value = "";
  document.getElementById("absErr").textContent = "";
}

async function saveAbsence() {
  const err = document.getElementById("absErr");
  err.textContent = "";
  const user_id = (CURRENT_USER.role === "head") ? parseInt(document.getElementById("absUser").value) : CURRENT_USER.id;
  const start_date = document.getElementById("absStart").value;
  const end_date = document.getElementById("absEnd").value || start_date;
  const kind = document.getElementById("absKind").value;
  const note = document.getElementById("absNote").value.trim();
  if (!start_date) { err.textContent = "Выберите дату начала"; return; }
  if (new Date(end_date) < new Date(start_date)) { err.textContent = "Дата окончания раньше начала"; return; }
  try {
    await API.createAbsence({ user_id, start_date, end_date, kind, note });
    document.getElementById("absenceModal").classList.remove("show");
    renderAbsences();
  } catch (e) {
    err.textContent = "Ошибка: " + e.message;
  }
}

async function deleteAbsence(id) {
  if (!confirm("Удалить отсутствие?")) return;
  await API.deleteAbsence(id);
  renderAbsences();
}

// ============= ACADEMIC SUPPORT =============
async function renderAcsup() {
  const root = document.getElementById("sectionAcsup");
  const u = CURRENT_USER;
  const isHead = u.role === "head";

  let sessions = [];
  try { const r = await API.acsupList(); sessions = r.sessions; ACSUP = sessions; } catch(e) {}

  let html = `<div class="today-greeting"><h2>Академические поддержки</h2>
    <div class="day-of-week">${isHead ? "Все доп. уроки в ваших отделениях" : "Ваши дополнительные занятия. Создайте новое и пригласите учеников через куратора."}</div>
  </div>`;
  html += `<div style="display:flex;gap:8px;margin-bottom:12px;">
    <div style="flex:1;"></div>
    <button class="btn" onclick="openAcsupModal()">+ Добавить занятие</button>
  </div>`;

  if (sessions.length === 0) {
    html += `<div class="history-empty">Пока нет ни одного занятия академ. поддержки.</div>`;
  } else {
    html += `<div class="history-list">
      <div class="history-item" style="background:#F9FAFB;font-weight:600;color:var(--text-muted);text-transform:uppercase;font-size:10px;letter-spacing:0.05em;">
        <div>Дата / время</div><div>Учитель</div><div>Предмет / класс</div><div>Кабинет / заметка</div><div>Действия</div>
      </div>`;
    for (const s of sessions) {
      const dt = new Date(s.date).toLocaleDateString("ru-RU");
      const time = s.start_time ? `${s.start_time}${s.end_time ? "–" + s.end_time : ""}` : "—";
      const isMine = s.teacher_id === u.id;
      html += `<div class="history-item">
        <div><b>${dt}</b><br><span style="color:var(--text-muted);font-size:11px;">${time}</span></div>
        <div>${escapeHtml(s.teacher_name || "")}<br><span style="color:var(--text-muted);font-size:11px;">${escapeHtml(s.dept)}</span></div>
        <div><b>${escapeHtml(s.subject || "—")}</b>${s.cls ? "<br><span style='color:var(--text-muted);font-size:11px;'>" + escapeHtml(s.cls) + " кл.</span>" : ""}</div>
        <div>${s.room ? "каб " + escapeHtml(s.room) : ""}${s.note ? "<br><span style='color:var(--text-muted);font-size:11px;'>" + escapeHtml(s.note) + "</span>" : ""}</div>
        <div style="display:flex;flex-direction:column;gap:4px;">
          ${isMine || isHead ? `<button class="email-mini-btn" onclick="openInviteModal(${s.id}, '${escapeHtml(s.dept).replace(/'/g, "\\'")}')">📨 Пригласить</button>` : ""}
          ${isMine || isHead ? `<button class="email-mini-btn" onclick="deleteAcsup(${s.id})" style="color:var(--ip-magenta);">Удалить</button>` : ""}
        </div>
      </div>`;
    }
    html += `</div>`;
  }
  root.innerHTML = html;
}

function openAcsupModal() {
  document.getElementById("acsupModal").classList.add("show");
  const u = CURRENT_USER;
  // Default dept — first allowed dept for heads, or main dept for teachers
  const depts = (u.depts && u.depts.length > 0) ? u.depts : [u.dept];
  const sel = document.getElementById("asDept");
  sel.innerHTML = depts.map(d => `<option value="${d}">${d}</option>`).join("");
  // Default date — today
  const today = new Date();
  document.getElementById("asDate").value = today.toISOString().slice(0,10);
  document.getElementById("asStart").value = "";
  document.getElementById("asEnd").value = "";
  document.getElementById("asSubject").value = "";
  document.getElementById("asCls").value = "";
  document.getElementById("asRoom").value = "";
  document.getElementById("asNote").value = "";
  document.getElementById("asErr").textContent = "";
}

async function saveAcsup() {
  const err = document.getElementById("asErr");
  err.textContent = "";
  const payload = {
    dept: document.getElementById("asDept").value,
    date: document.getElementById("asDate").value,
    start_time: document.getElementById("asStart").value,
    end_time: document.getElementById("asEnd").value,
    subject: document.getElementById("asSubject").value.trim(),
    cls: document.getElementById("asCls").value.trim(),
    room: document.getElementById("asRoom").value.trim(),
    note: document.getElementById("asNote").value.trim(),
  };
  if (!payload.date) { err.textContent = "Укажите дату"; return; }
  if (!payload.dept) { err.textContent = "Выберите отделение"; return; }
  try {
    await API.acsupCreate(payload);
    document.getElementById("acsupModal").classList.remove("show");
    renderAcsup();
  } catch (e) {
    err.textContent = "Ошибка: " + e.message;
  }
}

async function deleteAcsup(id) {
  if (!confirm("Удалить занятие академ. поддержки?")) return;
  await API.acsupDelete(id);
  renderAcsup();
}

function openInviteModal(sessionId, dept) {
  document.getElementById("inviteModal").classList.add("show");
  document.getElementById("inviteSessionId").value = sessionId;
  // Populate curator list — all teachers in same dept
  const candidates = ACCOUNTS.filter(a => a.role === "teacher" && ((a.depts && a.depts.includes(dept)) || a.dept === dept))
                            .sort((a,b) => a.name.localeCompare(b.name, "ru"));
  const list = document.getElementById("inviteCurators");
  list.innerHTML = candidates.map(a =>
    `<label class="notify-row"><input type="checkbox" data-uid="${a.id}"><span><b>${escapeHtml(a.name)}</b></span></label>`
  ).join("");
  document.getElementById("inviteStudent").value = "";
  document.getElementById("inviteErr").textContent = "";
}

async function sendInvite() {
  const sessionId = parseInt(document.getElementById("inviteSessionId").value);
  const curatorIds = [];
  for (const cb of document.querySelectorAll("#inviteCurators input[type=checkbox]")) {
    if (cb.checked) curatorIds.push(parseInt(cb.dataset.uid));
  }
  if (curatorIds.length === 0) {
    document.getElementById("inviteErr").textContent = "Выберите хотя бы одного куратора";
    return;
  }
  try {
    const r = await API.acsupInvite(sessionId, {
      curator_ids: curatorIds,
      student_info: document.getElementById("inviteStudent").value.trim(),
    });
    document.getElementById("inviteModal").classList.remove("show");
    alert(`Отправлено ${r.sent} уведомлений.`);
    await refreshNotifications();
  } catch (e) {
    document.getElementById("inviteErr").textContent = "Ошибка: " + e.message;
  }
}

// ============= SCHEDULE HISTORY =============
async function renderSchedHistory() {
  const root = document.getElementById("sectionSchedhist");
  let history = [];
  try { const r = await API.schedHistory(); history = r.history; } catch(e) {}

  let html = `<div class="today-greeting"><h2>История изменений расписания</h2>
    <div class="day-of-week">${history.length} событий · кто, когда и что менял</div>
  </div>`;
  if (history.length === 0) {
    html += `<div class="history-empty">Изменений пока нет.</div>`;
  } else {
    html += `<div class="history-list">
      <div class="history-item" style="background:#F9FAFB;font-weight:600;color:var(--text-muted);text-transform:uppercase;font-size:10px;letter-spacing:0.05em;">
        <div>Когда</div><div>Где</div><div>Действие</div><div>Изменение</div><div>Кто</div>
      </div>`;
    const ACTIONS = { create: "Создал", update: "Изменил", revert: "Откатил", delete: "Удалил", move: "Переместил" };
    for (const h of history) {
      const a = h.after_data || {};
      const b = h.before_data || {};
      const summary = h.action === "revert"
        ? `Откат: ${escapeHtml(b.subject || '')} ${escapeHtml(b.teacher || '')}`
        : `${escapeHtml(b.subject || '?')} ${escapeHtml(b.teacher || '')} → ${escapeHtml(a.subject || '')} ${escapeHtml(a.teacher || '')}`;
      html += `<div class="history-item">
        <div style="font-size:11px;">${new Date(h.edited_at).toLocaleString("ru-RU")}</div>
        <div>${escapeHtml(h.dept)}<br><span style="color:var(--text-muted);font-size:11px;">${h.day} · ${escapeHtml(h.cls)} кл</span></div>
        <div><b>${ACTIONS[h.action] || h.action}</b></div>
        <div style="font-size:11px;">${summary}</div>
        <div>${escapeHtml(h.edited_by_name || '—')}</div>
      </div>`;
    }
    html += `</div>`;
  }
  root.innerHTML = html;
}

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
