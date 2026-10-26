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
  updateMe(data) { return this.fetch("/api/me", { method: "PATCH", body: JSON.stringify(data) }); },
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
  adminArchiveUser(id) { return this.fetch(`/api/admin/users/${id}/archive`, { method: "POST" }); },
  adminRestoreUser(id) { return this.fetch(`/api/admin/users/${id}/restore`, { method: "POST" }); },
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
  // Full schedule import (replaces base schedule for dept)
  importFullSchedule(file, dept, preview) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("dept", dept);
    fd.append("preview", preview ? "true" : "false");
    return fetch("/api/schedule/import-full", {
      method: "POST",
      headers: { Authorization: "Bearer " + this.token },
      body: fd
    }).then(async r => {
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.details || d.error || "import_failed");
      return d;
    });
  },
  getScheduleOverrides() { return this.fetch("/api/schedule/overrides"); },
  deleteScheduleOverride(dept) { return this.fetch(`/api/schedule/overrides/${encodeURIComponent(dept)}`, { method: "DELETE" }); },
  // Push notifications
  pushVapidKey() { return this.fetch("/api/push/vapid-public-key"); },
  pushSubscribe(sub) { return this.fetch("/api/push/subscribe", { method: "POST", body: JSON.stringify(sub) }); },
  pushUnsubscribe(endpoint) { return this.fetch("/api/push/subscribe", { method: "DELETE", body: JSON.stringify({ endpoint }) }); },
  // Replacement response
  respondToReplacement(id, status) { return this.fetch(`/api/replacements/${id}/respond`, { method: "PATCH", body: JSON.stringify({ status }) }); },
  // Absence requests (teacher self-report)
  absenceRequests() { return this.fetch("/api/absence-requests"); },
  createAbsenceRequest(d) { return this.fetch("/api/absence-requests", { method: "POST", body: JSON.stringify(d) }); },
  reviewAbsenceRequest(id, status) { return this.fetch(`/api/absence-requests/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }); },
  suggestReplacements(teacher_id, date) { return this.fetch(`/api/absence-requests/suggest-replacements?teacher_id=${teacher_id}&date=${date}`); },
  // Chat
  chatRooms() { return this.fetch("/api/chat/rooms"); },
  chatCreatePrivate(other_user_id) { return this.fetch("/api/chat/rooms/private", { method: "POST", body: JSON.stringify({ other_user_id }) }); },
  chatMessages(room_id, before) { return this.fetch(`/api/chat/rooms/${room_id}/messages${before ? "?before=" + encodeURIComponent(before) : ""}`); },
  chatSend(room_id, body) { return this.fetch(`/api/chat/rooms/${room_id}/messages`, { method: "POST", body: JSON.stringify({ body }) }); },
  chatUnread() { return this.fetch("/api/chat/unread"); },
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
  stage: null,          // 'elementary'|'middle'|'senior'|null (null = all stages)
  teacherFilter: null,  // highlight teacher in schedule
  historyFilters: { dept: "all", teacher: "", from: "", to: "" },
  myView: "today",
  myDay: "Понедельник",
  acsupFilter: { dept: "all" },
};

// Which stages exist per department
const DEPT_STAGES = {
  "Империал": ["elementary", "middle", "senior"],
  "Пушкина":  ["elementary"],
  "Кирова":   ["elementary", "middle", "senior"],
  "Чкалова":  ["middle", "senior"],
};
const STAGE_LABELS = { elementary: "Начальная (1–4)", middle: "Средняя (5–9)", senior: "Старшая (10–11)" };
const STAGE_GRADES = { elementary: [1,2,3,4], middle: [5,6,7,8,9], senior: [10,11] };

function getClassGrade(cls) {
  const m = String(cls).match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}
function getClassStage(cls) {
  const g = getClassGrade(cls);
  if (g === null) return null;
  if (g <= 4) return "elementary";
  if (g <= 9) return "middle";
  return "senior";
}
function deptHasMultipleStages(dept) {
  return (DEPT_STAGES[dept] || []).length > 1;
}
let ABSENCES = [];
let ACSUP = [];
let ABSENCE_REQUESTS = [];
let CHAT_ROOMS = [];
let CHAT_ACTIVE_ROOM = null;
let CHAT_MESSAGES = [];
let CHAT_POLL_INTERVAL = null;
let CHAT_UNREAD = 0;

let pendingLoginEmail = null;
let EDIT_MODE = false;
let _editingCell = null;

// ============= UTILS =============
function escapeHtml(s) {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[ch]);
}
function pluralLesson(n) {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "уроков";
  if (mod10 === 1) return "урок";
  if (mod10 >= 2 && mod10 <= 4) return "урока";
  return "уроков";
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
  _updateThemeBtn();
  _patchCellColors();
  // Start real-time SSE after app loads (defined later in file)
  if (typeof startSSE === "function") startSSE();
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
    const isFiltered = state.teacherFilter && t === state.teacherFilter;
    // Click on teacher name: if already filtered, open card; otherwise set filter
    let teacherOnClick;
    if (EDIT_MODE) teacherOnClick = '';
    else if (state.teacherFilter === t) teacherOnClick = `onclick="event.stopPropagation(); openTeacherCard('${tEsc}')"`;
    else teacherOnClick = `onclick="event.stopPropagation(); setTeacherFilter('${tEsc}')"`;
    const teacherEl = t ? `<div class="cell-teacher ${EDIT_MODE ? '' : 'click-link'}" ${teacherOnClick} style="${conflict ? 'color:#E6007E;font-weight:600' : ''}${isFiltered ? ';background:rgba(99,102,241,.18);border-radius:3px;padding:0 3px;' : ''}">${escapeHtml(t)}${conflict ? ' ⚠' : ''}</div>` : "";
    return `<div class="cell-group"><div class="cell-subject ${sCls}">${escapeHtml(subj)}${r ? `<span class="cell-room">${escapeHtml(r)}</span>` : ""}</div>${teacherEl}</div>`;
  }).join("");
}
function setTeacherFilter(name) {
  state.teacherFilter = name;
  render();
}
function clearTeacherFilter() {
  state.teacherFilter = null;
  render();
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
  if (state.stage) {
    leftClasses = leftClasses.filter(c => getClassStage(c) === state.stage);
    rightClasses = rightClasses.filter(c => getClassStage(c) === state.stage);
  }
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
        const isOptimistic = info && info._optimistic;
        const hasFilteredTeacher = state.teacherFilter && items.some(it => it.teacher === state.teacherFilter);
        const isDimmed = state.teacherFilter && !hasFilteredTeacher;
        const cellClasses = [];
        if (hasConflictTeacher) cellClasses.push("has-conflict");
        if (wasEdited) cellClasses.push("cell-edited");
        if (isOptimistic) cellClasses.push("_optimistic-cell");
        const canEditHere = EDIT_MODE && canEditDept(state.dept);
        const clickAttr = EDIT_MODE ? `onclick="openCellEditor('${escapeHtml(state.dept)}','${escapeHtml(state.day)}','${escapeHtml(lkey)}','${cls}', ${ld.lesson_no}, '${escapeHtml(ld.time)}')"` : '';
        const dragAttrs = canEditHere
          ? `draggable="true" data-cell="${escapeHtml(state.dept)}|${escapeHtml(state.day)}|${escapeHtml(lkey)}|${cls}|${ld.lesson_no}|${escapeHtml(ld.time)}" ondragstart="onCellDragStart(event)" ondragover="onCellDragOver(event)" ondragleave="onCellDragLeave(event)" ondrop="onCellDrop(event)" ondragend="onCellDragEnd(event)"`
          : '';
        const handle = canEditHere && info ? '<span class="drag-handle">⋮⋮</span>' : '';
        html += `<td class="${cellClasses.join(' ')}" ${clickAttr} ${dragAttrs} style="${isDimmed ? 'opacity:.25;' : ''}">${handle}${renderCellContent(info, conflictTeachers)}</td>`;
      }
      html += `</tr>`;
    }
    html += `</tbody></table>`;
    return html;
  }
  let content = "";
  if (state.teacherFilter) {
    const tf = state.teacherFilter;
    const week = teacherWeekSchedule(tf);
    let totalLessons = DAYS.reduce((s,d) => s + week[d].length, 0);
    content += `<div class="edit-mode-banner" style="background:rgba(99,102,241,.12);border-color:var(--ip-blue);">
      🔍 Фильтр: <b>${escapeHtml(tf)}</b> · ${totalLessons} уроков в неделю
      <button class="link-btn" onclick="openTeacherCard('${escapeHtml(tf).replace(/'/g,"\\'")}')">👤 Карточка</button>
      <button class="link-btn" onclick="clearTeacherFilter()" style="margin-left:auto;color:var(--ip-magenta);">✕ Снять фильтр</button>
    </div>`;
  }
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
  if (EDIT_MODE) setTimeout(_initTouchDrag, 50);
}
function renderWeek() {
  const dept = DATA[state.dept];
  if (!dept) return;
  const isChkalova = state.dept === "Чкалова";
  const conflictTeachers = new Set();
  for (const c of CONFLICTS) conflictTeachers.add(c.teacher);
  let leftClasses = isChkalova ? ["5","6","7","8","9"] : dept.classes.slice();
  let rightClasses = isChkalova ? ["10","11"] : [];
  if (state.stage) {
    leftClasses = leftClasses.filter(c => getClassStage(c) === state.stage);
    rightClasses = rightClasses.filter(c => getClassStage(c) === state.stage);
  }
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
    const isHead = CURRENT_USER && CURRENT_USER.role === "head" || CURRENT_USER.role === "director";
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
  if (u.role === "director") return "Директор";
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
  const _umSchedName = u.schedule_name || u.name;
  const hasLessons = ALL_TEACHERS[_umSchedName] && ALL_TEACHERS[_umSchedName].total > 0;
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
    <div style="padding:4px 14px 8px;border-top:1px solid var(--border);">
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">Как вас называть?</div>
      <div style="display:flex;gap:6px;align-items:center;">
        <input id="firstNameInput" type="text" placeholder="Введите имя…" value="${escapeHtml(u.first_name || '')}"
          style="flex:1;padding:5px 8px;font-size:12px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);">
        <button onclick="saveFirstName()" class="btn" style="padding:5px 10px;font-size:12px;">Сохранить</button>
      </div>
    </div>
    ${u.role === 'head' || u.role === 'director' ? `<div style="padding:4px 14px 8px;border-top:1px solid var(--border);">
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">Моё ФИО в расписании</div>
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;">Укажите точно так, как в расписании — чтобы видеть свои уроки</div>
      <div style="display:flex;gap:6px;align-items:center;">
        <input id="scheduleNameInput" type="text" placeholder="Например: Иванова И.И." value="${escapeHtml(u.schedule_name || '')}"
          style="flex:1;padding:5px 8px;font-size:12px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);">
        <button onclick="saveScheduleName()" class="btn" style="padding:5px 10px;font-size:12px;">Сохранить</button>
      </div>
    </div>` : ''}
    <div style="padding:4px 14px 8px;border-top:1px solid var(--border);">
      <button id="pushToggleBtn" onclick="togglePushNotifications()" class="link-btn" style="font-size:12px;display:none;">🔔 Включить уведомления</button>
    </div>
    <div style="padding:4px 14px 8px;border-top:1px solid var(--border);"><button onclick="logout()" class="link-btn" style="font-size:12px;color:var(--ip-magenta);">⏏ Выйти</button></div>
  `;
}

function openMyCard() {
  document.getElementById("userMenu").classList.remove("show");
  openTeacherCard(CURRENT_USER.name);
}

async function saveFirstName() {
  const input = document.getElementById("firstNameInput");
  if (!input) return;
  const val = input.value.trim();
  const btn = input.nextElementSibling;
  btn.disabled = true;
  try {
    const r = await API.updateMe({ first_name: val });
    if (r?.user) {
      CURRENT_USER.first_name = r.user.first_name;
      btn.textContent = "✓";
      setTimeout(() => { btn.textContent = "Сохранить"; btn.disabled = false; }, 1500);
    }
  } catch(e) {
    btn.disabled = false;
    alert("Ошибка сохранения");
  }
}

async function saveScheduleName() {
  const input = document.getElementById("scheduleNameInput");
  if (!input) return;
  const val = input.value.trim();
  const btn = input.nextElementSibling;
  btn.disabled = true;
  try {
    const r = await API.updateMe({ schedule_name: val });
    if (r?.user) {
      CURRENT_USER.schedule_name = r.user.schedule_name;
      btn.textContent = "✓";
      // Refresh today and my schedule sections
      renderToday();
      const _sn = CURRENT_USER.schedule_name || CURRENT_USER.name;
      const myTab = document.getElementById("myTab");
      if (myTab) myTab.style.display = (ALL_TEACHERS[_sn] && ALL_TEACHERS[_sn].total > 0) ? "" : "none";
      setTimeout(() => { btn.textContent = "Сохранить"; btn.disabled = false; }, 1500);
    }
  } catch(e) {
    btn.disabled = false;
    alert("Ошибка сохранения");
  }
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
  if (m.classList.contains("show")) { renderUserMenu(); renderPushBtn(); }
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
  list.innerHTML = NOTIFICATIONS.map(n => {
    // Parse replacement id from metadata if present
    const replacementId = n.replacement_id || null;
    const respStatus = n.response_status || null; // 'pending'/'confirmed'/'declined'
    const isReplacementNotif = replacementId && CURRENT_USER && CURRENT_USER.role !== "head" && CURRENT_USER.role !== "director";
    let actionBtns = "";
    if (isReplacementNotif && respStatus === "pending") {
      actionBtns = `<div style="display:flex;gap:8px;margin-top:8px;" onclick="event.stopPropagation()">
        <button class="btn" style="padding:4px 12px;font-size:12px;background:var(--ip-green,#10b981);" onclick="respondReplacement(${replacementId},'confirmed',this)">✓ Принять</button>
        <button class="btn" style="padding:4px 12px;font-size:12px;background:var(--ip-magenta);" onclick="respondReplacement(${replacementId},'declined',this)">✗ Отклонить</button>
      </div>`;
    } else if (isReplacementNotif && respStatus) {
      const lbl = respStatus === "confirmed" ? "✓ Принято" : "✗ Отклонено";
      const clr = respStatus === "confirmed" ? "var(--ip-green,#10b981)" : "var(--ip-magenta)";
      actionBtns = `<div style="margin-top:6px;font-size:12px;color:${clr};">${lbl}</div>`;
    }
    return `<div class="inbox-item ${n.is_read ? '' : 'unread'}" onclick="markRead(${n.id})">
      <div><b>${escapeHtml(n.title)}</b></div>
      <div style="margin-top:3px;">${escapeHtml(n.body)}</div>
      ${actionBtns}
      <div class="when">${fmtWhen(n.created_at)}</div>
    </div>`;
  }).join("");
}

async function respondReplacement(id, status, btn) {
  btn.disabled = true;
  try {
    await API.respondToReplacement(id, status);
    showToast(status === "confirmed" ? "Замена подтверждена ✓" : "Замена отклонена");
    await refreshNotifications();
  } catch (e) {
    btn.disabled = false;
    alert("Ошибка: " + e.message);
  }
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
  const rc = document.getElementById("repComment"); if (rc) rc.value = "";
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
function toggleRepMultiDay() {
  const on = document.getElementById("repMultiDay")?.checked;
  const wrap = document.getElementById("repMultiDayWrap");
  if (wrap) wrap.style.display = on ? "" : "none";
  if (on) {
    // Pre-check the currently selected day
    const cur = document.getElementById("repDay").value;
    for (const cb of document.querySelectorAll(".repDayCheck")) cb.checked = cb.value === cur;
  }
}
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
  if (!t) { alert("Выберите учителя"); return; }
  const tAcct = findAccountByName(t);
  if (!tAcct) { alert("Аккаунт отсутствующего учителя не найден"); return; }

  // Determine days (single or multi)
  const multiDay = document.getElementById("repMultiDay")?.checked;
  let days = [_repState.day];
  if (multiDay) {
    days = [...document.querySelectorAll(".repDayCheck:checked")].map(cb => cb.value);
    if (days.length === 0) { alert("Выберите хотя бы один день"); return; }
  }

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
  const comment = (document.getElementById("repComment")?.value || "").trim() || undefined;
  try {
    let totalCreated = 0;
    for (const day of days) {
      const res = await API.createReplacements({ day, items, absent_user_id: tAcct.id, notify_user_ids: notifyIds, comment });
      totalCreated += res.created_count || 0;
    }
    closeModal();
    await refreshNotifications();
    showToast(`Создано замен: ${totalCreated} на ${days.length} ${days.length === 1 ? "день" : "дней"}`);
  } catch (e) {
    alert("Ошибка: " + e.message);
  }
}

// ============= SECTION + VIEW =============
function setSection(s) {
  state.section = s;
  for (const b of document.querySelectorAll(".section-btn")) b.classList.toggle("active", b.dataset.section === s);
  // If nav is collapsed and active tab might be on hidden row, auto-expand
  _ensureActiveTabVisible();
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
    generator: "sectionGenerator",
    chat: "sectionChat",
    absreq: "sectionAbsReq",
    stats: "sectionStats",
    availability: "sectionAvailability",
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
  if (s === "generator") renderGenerator();
  if (s === "chat") renderChat();
  if (s === "absreq") renderAbsReq();
  if (s === "stats") renderStats_section();
  if (s === "availability") renderAvailability();
}
function navigate(s) { setSection(s); }
function populateClassFilter() {
  const sel = document.getElementById("classFilter");
  const dept = DATA[state.dept];
  if (!dept) return;
  let classes = dept.classes.slice();
  if (state.stage) classes = classes.filter(c => getClassStage(c) === state.stage);
  sel.innerHTML = [`<option value="all">Все классы</option>`].concat(classes.map(c => `<option value="${c}" ${state.classFilter === c ? 'selected' : ''}>${c} класс</option>`)).join("");
  if (state.classFilter !== "all" && !classes.includes(state.classFilter)) sel.value = "all";
  else sel.value = state.classFilter;
}
function setClassFilter(v) { state.classFilter = v; render(); }

function renderStageTabs() {
  const el = document.getElementById("stageTabs");
  if (!el) return;
  const dept = state.dept;
  const stages = DEPT_STAGES[dept] || [];
  if (stages.length <= 1) { el.style.display = "none"; return; }
  el.style.display = "flex";
  el.innerHTML = [
    `<button class="stage-tab ${state.stage === null ? 'active' : ''}" onclick="setStage(null)">Все ступени</button>`,
    ...stages.map(s => `<button class="stage-tab ${state.stage === s ? 'active' : ''}" onclick="setStage('${s}')">${STAGE_LABELS[s]}</button>`)
  ].join("");
}

function setStage(s) {
  state.stage = s;
  state.classFilter = "all";
  populateClassFilter();
  renderStageTabs();
  render();
}

function setDept(d) {
  state.dept = d;
  // If head has a fixed stage for this dept, apply it; else keep current unless it doesn't fit
  if (state.classFilter !== "all" && !DATA[d].classes.includes(state.classFilter)) state.classFilter = "all";
  // Reset stage when switching dept (unless head auto-stage is handled on login)
  if (!deptHasMultipleStages(d)) state.stage = null;
  populateClassFilter();
  renderDeptTabs();
  renderStageTabs();
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
  if (CURRENT_USER && CURRENT_USER.role === "head" || CURRENT_USER.role === "director") {
    document.getElementById("adminTab").style.display = "";
    document.getElementById("editModeBtn").style.display = "";
    const sht = document.getElementById("schedHistTab");
    if (sht) sht.style.display = "";
    const genTab = document.getElementById("generatorTab");
    if (genTab) genTab.style.display = "";
    const impBtn = document.getElementById("importFullBtn");
    if (impBtn) impBtn.style.display = "";
    // Show import banner if there are overrides
    updateImportBanner();
    const statsTab = document.getElementById("statsTab");
    if (statsTab) statsTab.style.display = "";
  } else {
    document.getElementById("adminTab").style.display = "none";
    document.getElementById("editModeBtn").style.display = "none";
    const sht = document.getElementById("schedHistTab");
    if (sht) sht.style.display = "none";
    const genTab = document.getElementById("generatorTab");
    if (genTab) genTab.style.display = "none";
    const impBtn = document.getElementById("importFullBtn");
    if (impBtn) impBtn.style.display = "none";
  }
  // Show "Моё расписание" if user has any teaching hours (teachers + heads who also teach)
  const myTab = document.getElementById("myTab");
  const _schedName = CURRENT_USER && (CURRENT_USER.schedule_name || CURRENT_USER.name);
  const hasLessons = CURRENT_USER && ALL_TEACHERS[_schedName] && ALL_TEACHERS[_schedName].total > 0;
  myTab.style.display = hasLessons ? "" : "none";
  // Chat tab — always visible
  const chatTab = document.getElementById("chatTab");
  if (chatTab) chatTab.style.display = "";
  // Absence requests — teachers see it as "Мой больничный", heads see all
  const absReqTab = document.getElementById("absReqTab");
  if (absReqTab) absReqTab.style.display = "";

  // Hide head-only tabs from teachers
  if (CURRENT_USER && CURRENT_USER.role === "teacher") {
    const absTab = document.getElementById("absencesTab");
    if (absTab) absTab.style.display = "none";
    const histTab2 = document.getElementById("historyTab");
    if (histTab2) histTab2.style.display = "none";
    // Hide teacher count badge and "Учителя" tab — not meaningful for teachers
    const tCount = document.getElementById("teachersCount");
    if (tCount) tCount.style.display = "none";
    const teachersTab = document.getElementById("teachersTab");
    if (teachersTab) teachersTab.style.display = "none";
    // Hide "Когда я свободна" — teachers don't need to manage this themselves
    const availTab = document.getElementById("availabilityTab");
    if (availTab) availTab.style.display = "none";
  }

  // Also hide availability tab for heads — it's teacher-specific
  if (CURRENT_USER && CURRENT_USER.role === "head" || CURRENT_USER.role === "director") {
    const availTabHead = document.getElementById("availabilityTab");
    if (availTabHead) availTabHead.style.display = "none";
    // Show tab customizer button for heads (many tabs)
    const tcBtn = document.getElementById("tabCustomizeBtn");
    if (tcBtn) tcBtn.style.display = "";
  }

  // Apply saved tab visibility preferences
  applyTabVisibilityPrefs();
  // Init collapsible nav (after tabs are shown/hidden by role)
  initNavToggle();

  // Auto-apply stage for heads who manage a specific stage
  if (CURRENT_USER && CURRENT_USER.stage && CURRENT_USER.role === "head") {
    state.stage = CURRENT_USER.stage;
    // Set dept to head's dept
    if (CURRENT_USER.dept && DATA[CURRENT_USER.dept]) state.dept = CURRENT_USER.dept;
  }
  renderStageTabs();
  populateClassFilter();

  setSection("today"); // default
  renderUserChip();
  renderBell();
  // Start polling unread chat count
  startChatUnreadPoll();
  // Register service worker + push
  initPWA();
}

// ============= TAB CUSTOMIZER =============
// Tabs that heads can toggle (section id → label)
const HEAD_CUSTOMIZABLE_TABS = {
  schedule:    "📅 Расписание",
  teachers:    "👤 Учителя",
  acsup:       "📚 Академическая поддержка",
  absences:    "🏖 Отсутствия",
  history:     "🔄 История замен",
  schedhist:   "📋 Версии расписания",
  generator:   "🤖 Генератор замен",
  admin:       "⚙️ Сотрудники",
  absreq:      "🤒 Больничный",
  chat:        "💬 Чат",
  stats:       "📊 Статистика",
};

function getHiddenTabs() {
  try { return JSON.parse(localStorage.getItem("ip_hidden_tabs") || "[]"); } catch(e) { return []; }
}
function saveHiddenTabs(arr) {
  try { localStorage.setItem("ip_hidden_tabs", JSON.stringify(arr)); } catch(e) {}
}

function applyTabVisibilityPrefs() {
  if (!CURRENT_USER || CURRENT_USER.role !== "head" && CURRENT_USER.role !== "director") return;
  const hidden = getHiddenTabs();
  for (const sect of Object.keys(HEAD_CUSTOMIZABLE_TABS)) {
    const el = document.querySelector(`.section-btn[data-section="${sect}"]`);
    if (!el) continue;
    // Only hide if the tab is currently shown (don't override role-based hiding)
    if (hidden.includes(sect) && el.style.display !== "none") {
      el.style.display = "none";
      el.dataset.hiddenByPref = "1";
    } else if (!hidden.includes(sect) && el.dataset.hiddenByPref === "1") {
      el.style.display = "";
      delete el.dataset.hiddenByPref;
    }
  }
}

function openTabCustomizer() {
  if (!CURRENT_USER || CURRENT_USER.role !== "head" && CURRENT_USER.role !== "director") return;
  const hidden = getHiddenTabs();
  let html = "";
  for (const [sect, label] of Object.entries(HEAD_CUSTOMIZABLE_TABS)) {
    const checked = !hidden.includes(sect);
    html += `<label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:4px 0;">
      <input type="checkbox" ${checked ? "checked" : ""} onchange="toggleTabPref('${sect}',this.checked)"
        style="width:16px;height:16px;cursor:pointer;">
      <span style="font-size:13px;">${label}</span>
    </label>`;
  }
  document.getElementById("tabCustomizerList").innerHTML = html;
  document.getElementById("tabCustomizerModal").classList.add("show");
}

function toggleTabPref(sect, show) {
  const hidden = getHiddenTabs();
  if (show) {
    const idx = hidden.indexOf(sect);
    if (idx !== -1) hidden.splice(idx, 1);
  } else {
    if (!hidden.includes(sect)) hidden.push(sect);
    // If currently on that section, go to today
    if (state.section === sect) setSection("today");
  }
  saveHiddenTabs(hidden);
  applyTabVisibilityPrefs();
  _updateNavToggleBtn();
}

function resetTabVisibility() {
  saveHiddenTabs([]);
  applyTabVisibilityPrefs();
  // Re-check all checkboxes
  document.querySelectorAll("#tabCustomizerList input[type=checkbox]").forEach(cb => cb.checked = true);
}

// ============= NAV EXPAND/COLLAPSE =============
function _isNavRole() {
  return CURRENT_USER && (CURRENT_USER.role === "head" || CURRENT_USER.role === "director");
}

function initNavToggle() {
  const btn = document.getElementById("navToggleBtn");
  const nav = document.querySelector(".section-nav");
  if (!btn || !nav) return;
  // Show toggle for head/director; also for teachers on small screens (many tabs)
  const isMobile = window.innerWidth <= 768;
  const visibleBtns = Array.from(nav.querySelectorAll(".section-btn:not(#navToggleBtn)")).filter(b => b.style.display !== "none");
  if (!_isNavRole() && !isMobile && visibleBtns.length <= 5) {
    btn.style.display = "none"; nav.classList.remove("nav-collapsed"); return;
  }
  btn.style.display = "";
  const expanded = (() => { try { return localStorage.getItem("ip_nav_expanded") === "1"; } catch(e) { return false; } })();
  if (expanded) { nav.classList.remove("nav-collapsed"); } else { nav.classList.add("nav-collapsed"); }
  _updateNavToggleBtn();
}

function _updateNavToggleBtn() {
  const btn = document.getElementById("navToggleBtn");
  const nav = document.querySelector(".section-nav");
  if (!btn || !nav) return;
  const collapsed = nav.classList.contains("nav-collapsed");
  if (collapsed) {
    // Count visible tabs that are currently overflowing (not in first row)
    // Simple: count visible .section-btn elements excluding the toggle itself
    const allBtns = Array.from(nav.querySelectorAll(".section-btn:not(#navToggleBtn)")).filter(b => b.style.display !== "none");
    // With 52px row height and ~6px gap, approx fit check: just show count of visible tabs > first row
    btn.textContent = `Ещё ▾`;
  } else {
    btn.textContent = `Свернуть ▲`;
  }
}

function _ensureActiveTabVisible() {
  const nav = document.querySelector(".section-nav");
  if (!nav || !nav.classList.contains("nav-collapsed")) return;
  const activeBtn = nav.querySelector(".section-btn.active");
  if (!activeBtn) return;
  // Check if active button is clipped by collapsed height
  const navRect = nav.getBoundingClientRect();
  const btnRect = activeBtn.getBoundingClientRect();
  // If button's bottom exceeds nav visible area, expand
  if (btnRect.bottom > navRect.top + 56) {
    nav.classList.remove("nav-collapsed");
    try { localStorage.setItem("ip_nav_expanded", "1"); } catch(e) {}
    _updateNavToggleBtn();
  }
}

function toggleNavExpand() {
  const nav = document.querySelector(".section-nav");
  if (!nav) return;
  const nowCollapsed = nav.classList.contains("nav-collapsed");
  if (nowCollapsed) {
    nav.classList.remove("nav-collapsed");
    try { localStorage.setItem("ip_nav_expanded", "1"); } catch(e) {}
  } else {
    nav.classList.add("nav-collapsed");
    try { localStorage.setItem("ip_nav_expanded", "0"); } catch(e) {}
  }
  _updateNavToggleBtn();
  // If active tab is now hidden (collapsed), scroll nav so it's visible
  const activeBtn = nav.querySelector(".section-btn.active");
  if (activeBtn) activeBtn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
}

// ============= PWA + PUSH =============
let _swReg = null;

async function initPWA() {
  if (!("serviceWorker" in navigator)) return;
  try {
    _swReg = await navigator.serviceWorker.register("/sw.js");
  } catch (e) { console.warn("SW registration failed:", e); }
  // Restore push button state
  renderPushBtn();
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function togglePushNotifications() {
  if (!_swReg) { alert("Service Worker не зарегистрирован. Обновите страницу."); return; }
  const existing = await _swReg.pushManager.getSubscription();
  if (existing) {
    // Unsubscribe
    await existing.unsubscribe();
    await API.pushUnsubscribe(existing.endpoint).catch(() => {});
    renderPushBtn();
    showToast("Уведомления отключены");
    return;
  }
  // Subscribe
  try {
    const { publicKey } = await API.pushVapidKey();
    const sub = await _swReg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });
    const json = sub.toJSON();
    await API.pushSubscribe({ endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth });
    renderPushBtn();
    showToast("Уведомления включены 🔔");
  } catch (e) {
    console.warn("Push subscribe error:", e);
    alert("Не удалось подписаться на уведомления: " + e.message);
  }
}

async function renderPushBtn() {
  const btn = document.getElementById("pushToggleBtn");
  if (!btn) return;
  if (!("PushManager" in window) || !_swReg) {
    btn.style.display = "none"; return;
  }
  const sub = await _swReg.pushManager.getSubscription().catch(() => null);
  btn.innerHTML = sub ? "🔕 Уведомления вкл" : "🔔 Включить уведомления";
  btn.classList.toggle("active", !!sub);
  btn.style.display = "";
}

function showToast(msg) {
  let t = document.getElementById("ipToast");
  if (!t) {
    t = document.createElement("div");
    t.id = "ipToast";
    t.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1e293b;color:#fff;padding:10px 20px;border-radius:8px;font-size:14px;z-index:9999;transition:opacity .4s;";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = "1";
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.style.opacity = "0"; }, 3000);
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

  const _greetHour = new Date().getHours();
  const _greetWord = _greetHour < 12 ? "Доброе утро" : _greetHour < 17 ? "Добрый день" : "Добрый вечер";
  // Use first_name if set; for heads without first_name, skip surname (it's just a role name)
  const _isAdminRole = u.role === 'head' || u.role === 'director';
  const _rawFirst = u.first_name || (!_isAdminRole ? (u.name || '').split(' ')[0] : null) || u.name;
  const _firstName = escapeHtml(_rawFirst);
  let html = `<div class="today-greeting" style="display:block;width:100%;box-sizing:border-box;">
    <h2>${_greetWord}, ${_firstName}!</h2>
    <div class="day-of-week">Сегодня ${escapeHtml(dateStr)}</div>
  </div>`;

  const _mySchedName = u.schedule_name || u.name;
  if (u.role === "teacher" || (u.role === "head" || u.role === "director" && ALL_TEACHERS[_mySchedName])) {
    const lessons = findUserLessonsToday(_mySchedName, today);
    if (lessons.length === 0) {
      html += `<div class="today-list"><div class="history-empty">Сегодня у вас нет уроков 🎉</div></div>`;
    } else {
      html += `<div style="font-size:13px;color:var(--text-muted);margin:6px 4px;">У вас сегодня <b>${lessons.length}</b> ${pluralLesson(lessons.length)}</div>`;
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

    // My replacements today
    const myReplacementsToday = ALL_REPLACEMENTS.filter(r =>
      r.replacement_name === u.name && r.day === today
    );
    if (myReplacementsToday.length > 0) {
      html += `<div style="font-size:13px;font-weight:600;margin:16px 4px 8px;">🔄 Ваши замены сегодня</div>`;
      html += `<div class="today-list">`;
      for (const r of myReplacementsToday) {
        html += `<div class="today-card future" style="border-left:3px solid #f59e0b;">
          <div class="today-time"><small>урок ${r.lesson_no}</small></div>
          <div class="today-main">
            <div class="today-subj">${escapeHtml(r.subject || '—')}</div>
            <div class="today-meta">${escapeHtml(r.dept)} · ${escapeHtml(r.cls || '')} класс · вместо <span class="click-link" onclick="openTeacherCard('${escapeHtml(r.absent_name)}')">${escapeHtml(r.absent_name)}</span></div>
          </div>
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
    const _repsToday = ALL_REPLACEMENTS.filter(r => r.day === today).length;
    // Count absent today without a replacement
    const _absentToday = ABSENCES.filter(a => a.start_date <= today && a.end_date >= today);
    const _absentNoCover = _absentToday.filter(a => !ALL_REPLACEMENTS.some(r => r.day === today && r.absent_name === a.user_name));
    html += `<div class="stats-row" style="display:flex;width:100%;box-sizing:border-box;">
      <div class="stat-card cyan"><div class="label">📚 Уроков сегодня</div><div class="value">${countToday}</div></div>
      <div class="stat-card magenta"><div class="label">🔄 Замен сегодня</div><div class="value">${_repsToday}</div></div>
      <div class="stat-card ${CONFLICTS.length > 0 ? 'red' : ''}"><div class="label">⚠️ Конфликтов</div><div class="value">${CONFLICTS.length}</div></div>
    </div>`;

    // Absent teachers today
    if (_absentToday.length > 0) {
      const _uncovered = _absentNoCover.length;
      html += `<div style="display:flex;align-items:center;gap:10px;margin:18px 4px 8px;">
        <div style="font-size:13px;font-weight:600;">🏖 Отсутствуют сегодня</div>
        ${_uncovered > 0 ? `<span style="background:var(--ip-magenta);color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;">${_uncovered} без замены</span>` : `<span style="background:#10b981;color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;">все закрыты ✓</span>`}
        <button class="btn btn-secondary" style="margin-left:auto;font-size:11px;padding:4px 10px;" onclick="navigate('generator')">+ Назначить замену</button>
      </div>`;
      html += `<div class="today-list">`;
      const KINDS = { vacation: "Отпуск", sick: "Больничный", personal: "За свой счёт", other: "Прочее" };
      for (const a of _absentToday) {
        const hasRep = ALL_REPLACEMENTS.some(r => r.day === today && r.absent_name === a.user_name);
        const repCount = ALL_REPLACEMENTS.filter(r => r.day === today && r.absent_name === a.user_name).length;
        html += `<div class="today-card" style="border-left:3px solid ${hasRep ? '#10b981' : 'var(--ip-magenta)'};">
          <div class="today-time" style="min-width:80px;">
            <span style="font-size:11px;font-weight:600;color:${hasRep ? '#10b981' : 'var(--ip-magenta)'};">${hasRep ? `✓ ${repCount} зам.` : '⚠ нет замены'}</span>
          </div>
          <div class="today-main">
            <div class="today-subj"><span class="click-link" onclick="openTeacherCard('${escapeHtml(a.user_name)}')">${escapeHtml(a.user_name)}</span></div>
            <div class="today-meta">${a.user_dept ? escapeHtml(a.user_dept) + ' · ' : ''}${KINDS[a.kind] || a.kind}${a.note ? ' · ' + escapeHtml(a.note) : ''}</div>
          </div>
          ${!hasRep ? `<div><button class="btn" style="font-size:11px;padding:4px 10px;" onclick="navigate('generator')">Назначить</button></div>` : ''}
        </div>`;
      }
      html += `</div>`;
    } else {
      html += `<div style="background:var(--card-bg);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-top:16px;display:flex;align-items:center;gap:10px;">
        <span style="font-size:18px;">🎉</span>
        <div><div style="font-weight:600;font-size:13px;">Все на месте!</div><div style="font-size:12px;color:var(--text-muted);">Сегодня никто не отсутствует</div></div>
      </div>`;
    }

    // Recent replacements — only last 14 days
    const _cutoff14 = new Date(); _cutoff14.setDate(_cutoff14.getDate() - 14);
    const recent = ALL_REPLACEMENTS.filter(r => new Date(r.created_at) >= _cutoff14).slice(0, 8);
    if (recent.length) {
      html += `<div style="font-size:13px;font-weight:600;margin:20px 4px 8px;">🔄 Последние замены</div><div class="history-list">`;
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
        <div>${r.comment ? `<span style="color:var(--text-muted);font-size:11px;">💬 ${escapeHtml(r.comment)}</span>` : ''}</div>
      </div>`;
    }
    html += `</div>`;
  }
  root.innerHTML = html;
}

// ============= ADMIN PANEL =============
let _adminShowArchived = false;
function renderAdmin() {
  const root = document.getElementById("sectionAdmin");
  if (CURRENT_USER.role !== "head" && CURRENT_USER.role !== "director") { root.innerHTML = `<div class="history-empty">Раздел доступен только завучам</div>`; return; }

  const myDepts = getMyAllowedDepts();
  const active = ACCOUNTS.filter(a => a.is_active !== false && a.is_active !== "false" && a.is_active !== 0);
  const archived = ACCOUNTS.filter(a => a.is_active === false || a.is_active === "false" || a.is_active === 0);
  const shown = _adminShowArchived ? archived : active;

  let html = `<div style="display:flex;gap:8px;margin-bottom:12px;align-items:center;flex-wrap:wrap;">
    <h3 style="margin:0;">Сотрудники школы</h3>
    <div class="view-switch" style="margin-left:8px;">
      <button class="${!_adminShowArchived?'active':''}" onclick="_adminShowArchived=false;renderAdmin()">Активные (${active.length})</button>
      <button class="${_adminShowArchived?'active':''}" onclick="_adminShowArchived=true;renderAdmin()">Уволенные (${archived.length})</button>
    </div>
    <div style="flex:1;"></div>
    <label class="btn secondary" style="cursor:pointer;margin:0;">
      ⤴ Импорт расписания (Excel)
      <input type="file" accept=".xlsx,.xls" onchange="importExcelFile(this)" style="display:none;">
    </label>
    <select id="importDept" style="padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:white;">
      ${myDepts.map(d => `<option value="${d}">${d}</option>`).join("")}
    </select>
    <button class="btn" onclick="openAdminUserNew()">+ Новый сотрудник</button>
  </div>`;

  if (shown.length === 0) {
    html += `<div class="history-empty">${_adminShowArchived ? "Нет уволенных сотрудников" : "Нет активных сотрудников"}</div>`;
  } else {
    html += `<div class="admin-list">
    <div class="admin-row header-row">
      <div></div><div>ФИО</div><div>Логин</div><div>Должность</div><div>Отделения</div><div></div>
    </div>`;
    const sorted = shown.slice().sort((a,b) => (a.role===b.role?0:a.role==="head"?-1:1) || a.name.localeCompare(b.name, "ru"));
    for (const a of sorted) {
      const titleDisplay = a.title || (a.role === "director" ? "Директор" : a.role === "head" ? "Руководитель отделения" : "Учитель");
      const isArchived = a.is_active === false;
      html += `<div class="admin-row" style="${isArchived ? 'opacity:.6;' : ''}">
        <div class="um-av ${avatarColor(a.name)}" style="${isArchived ? 'filter:grayscale(1);' : ''}">${getInitials(a.name)}</div>
        <div><b>${escapeHtml(a.name)}</b>${isArchived ? `<span style="color:var(--ip-magenta);font-size:10px;margin-left:6px;">уволен</span>` : ''}</div>
        <div style="font-family:ui-monospace,monospace;color:var(--ip-blue);font-size:11px;">${escapeHtml(a.email)}</div>
        <div>${escapeHtml(titleDisplay)}</div>
        <div>${(a.depts || []).join(", ") || (a.dept || '')}</div>
        <div style="display:flex;gap:6px;align-items:center;">
          ${isArchived
            ? `<button class="btn secondary" style="padding:3px 10px;font-size:11px;" onclick="restoreUser(${a.id})">↩ Восстановить</button>`
            : `<button class="btn secondary" style="padding:3px 10px;font-size:11px;color:var(--ip-magenta);" onclick="archiveUser(${a.id},'${escapeHtml(a.name)}')">✗ Уволить</button>`
          }
          <button class="edit-btn" onclick='openAdminUserEdit(${a.id})'>✎</button>
        </div>
      </div>`;
    }
    html += `</div>`;
  }
  root.innerHTML = html;
}

async function archiveUser(id, name) {
  if (!confirm(`Уволить «${name}»?\n\nАккаунт будет деактивирован. История замен сохранится. Восстановить можно в любой момент.`)) return;
  try {
    await API.adminArchiveUser(id);
    await reloadAccounts();
    renderAdmin();
    showToast(`${name} переведён в уволенные`);
  } catch (e) { alert("Ошибка: " + e.message); }
}
async function restoreUser(id) {
  try {
    await API.adminRestoreUser(id);
    await reloadAccounts();
    _adminShowArchived = false;
    renderAdmin();
    showToast("Сотрудник восстановлен");
  } catch (e) { alert("Ошибка: " + e.message); }
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
  document.getElementById("auTitle").value = a.title || (a.role === "director" ? "Директор" : a.role === "head" ? "Руководитель отделения" : "Учитель");
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
  if (!confirm("Удалить аккаунт?\n\nЕсли у сотрудника есть история замен — аккаунт будет деактивирован (не удалён). Иначе — удалён полностью.")) return;
  try {
    const r = await API.adminDeleteUser(window._editingUserId);
    document.getElementById("adminUserModal").classList.remove("show");
    await reloadAccounts();
    if (r.archived) {
      showToast("Аккаунт деактивирован (есть история)");
      _adminShowArchived = true;
    }
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

// ============= FULL SCHEDULE IMPORT =============
let _importFullFile = null;
let _importFullPreviewData = null;

async function openImportFullModal() {
  _importFullFile = null;
  _importFullPreviewData = null;
  document.getElementById("importFullFile").value = "";
  document.getElementById("importFullFileLabel").textContent = "Выбрать файл (.xlsx)";
  document.getElementById("importFullPreview").style.display = "none";
  document.getElementById("importFullError").textContent = "";
  document.getElementById("importFullSubmit").disabled = true;

  // Populate dept select
  const myDepts = getMyAllowedDepts();
  const sel = document.getElementById("importFullDept");
  sel.innerHTML = myDepts.map(d => `<option value="${d}">${d}</option>`).join("");
  // Pre-select current dept if available
  if (myDepts.includes(state.dept)) sel.value = state.dept;

  // Load and show current override status
  const statusEl = document.getElementById("importFullCurrentStatus");
  try {
    const ovr = await API.getScheduleOverrides();
    if (ovr.overrides && ovr.overrides.length > 0) {
      const lines = ovr.overrides.map(o => {
        const d = new Date(o.imported_at);
        const ds = d.toLocaleDateString("ru-RU", {day:"2-digit",month:"2-digit",year:"2-digit"});
        const by = o.imported_by_name ? ` · загрузил(а) ${o.imported_by_name}` : "";
        return `<b>${o.dept}</b>: загружено ${ds}${by} <button class="link-btn" style="margin-left:6px;font-size:11px;color:#B91C1C;" onclick="resetScheduleOverride('${o.dept}')">Сбросить</button>`;
      });
      statusEl.innerHTML = `<b style="font-size:11px;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.05em;">Загруженные расписания</b><br>${lines.join("<br>")}`;
      statusEl.style.display = "";
    } else {
      statusEl.style.display = "none";
    }
  } catch(e) { statusEl.style.display = "none"; }

  document.getElementById("importFullModal").classList.add("show");
}

async function onImportFullFileChange(input) {
  const file = input.files[0];
  if (!file) return;
  _importFullFile = file;
  _importFullPreviewData = null;
  document.getElementById("importFullFileLabel").textContent = file.name;
  document.getElementById("importFullError").textContent = "";
  document.getElementById("importFullPreview").style.display = "none";
  document.getElementById("importFullSubmit").disabled = true;

  const dept = document.getElementById("importFullDept").value;
  try {
    const prev = await API.importFullSchedule(file, dept, true);
    _importFullPreviewData = prev;
    const preview = document.getElementById("importFullPreview");
    preview.innerHTML = `✅ Распознано: <b>${prev.total} уроков</b>, ${prev.classes.length} классов (${prev.classes.join(", ")}), ${prev.days} дней недели`;
    preview.style.display = "";
    document.getElementById("importFullSubmit").disabled = false;
  } catch(e) {
    document.getElementById("importFullError").textContent = "Ошибка предпросмотра: " + e.message;
    document.getElementById("importFullPreview").style.display = "none";
  }
}

async function doImportFull() {
  if (!_importFullFile) return;
  const dept = document.getElementById("importFullDept").value;
  document.getElementById("importFullSubmit").disabled = true;
  document.getElementById("importFullError").textContent = "";
  try {
    const r = await API.importFullSchedule(_importFullFile, dept, false);
    document.getElementById("importFullModal").classList.remove("show");
    // Refresh data
    await reloadSchedule();
    setDept(dept);
    // Show status banner
    showImportBanner(dept, r.total);
  } catch(e) {
    document.getElementById("importFullError").textContent = "Ошибка: " + e.message;
    document.getElementById("importFullSubmit").disabled = false;
  }
}

async function resetScheduleOverride(dept) {
  if (!confirm(`Сбросить загруженное расписание для «${dept}»? Система вернётся к исходным данным.`)) return;
  try {
    await API.deleteScheduleOverride(dept);
    await reloadSchedule();
    render();
    await openImportFullModal(); // refresh modal
    updateImportBanner();
  } catch(e) { alert("Ошибка: " + e.message); }
}

function showImportBanner(dept, total) {
  const el = document.getElementById("importStatusBanner");
  if (!el) return;
  el.innerHTML = `✅ Расписание «${escapeHtml(dept)}» загружено (${total} уроков) &nbsp;·&nbsp; <button class="link-btn" style="font-size:11px;" onclick="resetScheduleOverride('${escapeHtml(dept)}')">Сбросить</button>`;
  el.style.display = "flex";
}

async function updateImportBanner() {
  const el = document.getElementById("importStatusBanner");
  if (!el) return;
  try {
    const ovr = await API.getScheduleOverrides();
    const myDepts = getMyAllowedDepts();
    const mine = (ovr.overrides || []).filter(o => myDepts.includes(o.dept));
    if (mine.length > 0) {
      const parts = mine.map(o => `«${o.dept}»`).join(", ");
      el.innerHTML = `📋 Загружено расписание: ${parts} &nbsp;·&nbsp; <button class="link-btn" style="font-size:11px;" onclick="openImportFullModal()">Управление</button>`;
      el.style.display = "flex";
    } else {
      el.style.display = "none";
    }
  } catch(e) { el.style.display = "none"; }
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

  // Find colleagues who teach same subjects
  const mySubjects = new Set(subjEntries.map(([s]) => s));
  const colleagues = {};
  for (const [tname, tinfo] of Object.entries(ALL_TEACHERS)) {
    if (tname === name) continue;
    for (const subj of Object.keys(tinfo.subjectHours || {})) {
      if (mySubjects.has(subj)) {
        if (!colleagues[subj]) colleagues[subj] = [];
        colleagues[subj].push(tname);
      }
    }
  }

  html += `<div style="margin-bottom:12px;"><div style="font-size:11px;text-transform:uppercase;color:var(--text-muted);font-weight:600;letter-spacing:0.05em;margin-bottom:6px;">Предметы и часы</div>
    <div class="subj-chips">${subjEntries.map(([s,h]) => {
      const colleagueList = colleagues[s] || [];
      const ctip = colleagueList.length > 0 ? ` title="Также ведут: ${colleagueList.join(', ')}"` : '';
      return `<span class="subj-chip"${ctip}><span class="subj-chip-name">${escapeHtml(s)}</span><span class="subj-chip-hours">${h}ч</span>${colleagueList.length > 0 ? `<span style="font-size:10px;color:var(--text-muted);margin-left:3px;">+${colleagueList.length}</span>` : ''}</span>`;
    }).join("")}</div>
  </div>`;

  // Colleagues section
  if (Object.keys(colleagues).length > 0) {
    const allColleagues = [...new Set(Object.values(colleagues).flat())];
    html += `<div style="margin-bottom:14px;"><div style="font-size:11px;text-transform:uppercase;color:var(--text-muted);font-weight:600;letter-spacing:0.05em;margin-bottom:6px;">Коллеги по предметам</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">`;
    for (const cname of allColleagues) {
      const sharedSubjs = Object.entries(colleagues).filter(([,cs]) => cs.includes(cname)).map(([s]) => s).join(', ');
      html += `<span class="subj-chip click-link" onclick="document.getElementById('teacherCardModal').classList.remove('show'); openTeacherCard('${escapeHtml(cname).replace(/'/g,"\\'")}');" title="${escapeHtml(sharedSubjs)}">
        <span class="teacher-avatar ${avatarColor(cname)}" style="width:20px;height:20px;font-size:9px;display:inline-flex;align-items:center;justify-content:center;">${getInitials(cname)}</span>
        <span class="subj-chip-name" style="margin-left:4px;">${escapeHtml(cname)}</span>
      </span>`;
    }
    html += `</div></div>`;
  }

  // Build lookup: lesson_no → time string (from LESSON_TIMES)
  const ltMap = {};
  if (typeof LESSON_TIMES !== 'undefined') {
    for (const lt of LESSON_TIMES) ltMap[lt.no] = lt.time;
  }

  html += `<div style="margin-bottom:8px;"><div style="font-size:11px;text-transform:uppercase;color:var(--text-muted);font-weight:600;letter-spacing:0.05em;margin-bottom:6px;">Расписание на неделю</div>`;
  for (const day of DAYS) {
    const lessons = week[day];
    if (lessons.length === 0) {
      html += `<div style="padding:6px 0;border-bottom:1px solid var(--border);"><b>${day}</b> <span style="color:var(--text-muted);font-size:11px;">— нет уроков</span></div>`;
      continue;
    }

    // Compute free windows (gaps between first and last lesson)
    let freeWindowsHtml = '';
    if (state.user && state.user.role === 'head' || state.user.role === 'director') {
      const nos = lessons.map(l => l.lesson_no).filter(n => n != null && !isNaN(n));
      if (nos.length >= 2) {
        const minNo = Math.min(...nos);
        const maxNo = Math.max(...nos);
        const busyNos = new Set(nos);
        const gaps = [];
        for (let n = minNo + 1; n < maxNo; n++) {
          if (!busyNos.has(n)) {
            const t = ltMap[n] || `урок ${n}`;
            gaps.push(`<span style="background:rgba(234,179,8,.15);color:#92400e;border-radius:4px;padding:1px 6px;font-size:11px;">🪟 ${escapeHtml(t)}</span>`);
          }
        }
        if (gaps.length > 0) {
          freeWindowsHtml = `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:5px;">${gaps.join('')}</div>`;
        }
      }
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
    if (freeWindowsHtml) {
      html += `<div style="margin-top:3px;font-size:11px;color:var(--text-muted);">Окна: ${freeWindowsHtml}</div>`;
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
  if (!CURRENT_USER || CURRENT_USER.role !== "head" && CURRENT_USER.role !== "director") return [];
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
  if (!CURRENT_USER || CURRENT_USER.role !== "head" && CURRENT_USER.role !== "director") return;
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

// ============= TOUCH DRAG & DROP (mobile support) =============
let _touchDragSrc = null;
let _touchGhost = null;
let _touchLastTarget = null;

function _initTouchDrag() {
  // Attach touch listeners to all draggable cells after grid render
  document.querySelectorAll('td[draggable="true"][data-cell]').forEach(td => {
    td.addEventListener("touchstart", _onTouchDragStart, { passive: false });
  });
}

function _createGhost(td) {
  const ghost = td.cloneNode(true);
  ghost.style.cssText = `position:fixed;z-index:9999;opacity:.85;pointer-events:none;
    width:${td.offsetWidth}px;border:2px solid var(--ip-cyan);border-radius:6px;
    background:white;box-shadow:0 8px 24px rgba(0,0,0,.25);font-size:10px;padding:4px;`;
  document.body.appendChild(ghost);
  return ghost;
}

function _cellFromPoint(x, y) {
  const el = document.elementFromPoint(x, y);
  return el ? el.closest('td[data-cell]') : null;
}

function _onTouchDragStart(e) {
  if (!EDIT_MODE) return;
  const td = e.currentTarget;
  const key = td.dataset.cell;
  if (!key) return;
  const src = parseCellKey(key);
  const info = getCellInfo(src.dept, src.day, src.lkey, src.cls);
  if (!info) return;

  e.preventDefault();
  _touchDragSrc = { ...src, info, td };
  td.classList.add("dragging");
  _touchGhost = _createGhost(td);

  const touch = e.touches[0];
  _moveGhost(touch.clientX, touch.clientY);

  td.addEventListener("touchmove", _onTouchDragMove, { passive: false });
  td.addEventListener("touchend",  _onTouchDragEnd, { passive: false });
  td.addEventListener("touchcancel", _onTouchDragEnd, { passive: false });
}

function _moveGhost(x, y) {
  if (!_touchGhost) return;
  _touchGhost.style.left = (x - _touchGhost.offsetWidth / 2) + "px";
  _touchGhost.style.top  = (y - _touchGhost.offsetHeight / 2) + "px";
}

function _onTouchDragMove(e) {
  e.preventDefault();
  const touch = e.touches[0];
  _moveGhost(touch.clientX, touch.clientY);

  // Highlight target cell
  if (_touchGhost) _touchGhost.style.display = "none";
  const over = _cellFromPoint(touch.clientX, touch.clientY);
  if (_touchGhost) _touchGhost.style.display = "";

  if (_touchLastTarget && _touchLastTarget !== over) {
    _touchLastTarget.classList.remove("drop-target", "drop-target-swap");
  }
  if (over && over !== _touchDragSrc.td) {
    const tgt = parseCellKey(over.dataset.cell);
    if (tgt.dept === _touchDragSrc.dept) {
      const tgtInfo = getCellInfo(tgt.dept, tgt.day, tgt.lkey, tgt.cls);
      over.classList.add(tgtInfo ? "drop-target-swap" : "drop-target");
      _touchLastTarget = over;
    }
  }
}

function _onTouchDragEnd(e) {
  const touch = (e.changedTouches || e.touches)[0];

  // Clean ghost
  if (_touchGhost) { _touchGhost.remove(); _touchGhost = null; }
  if (_touchLastTarget) { _touchLastTarget.classList.remove("drop-target", "drop-target-swap"); _touchLastTarget = null; }
  if (_touchDragSrc) _touchDragSrc.td.classList.remove("dragging");

  if (!_touchDragSrc || !touch) { _touchDragSrc = null; return; }

  // Find drop target
  if (_touchGhost) _touchGhost.style.display = "none";
  const over = _cellFromPoint(touch.clientX, touch.clientY);

  const srcTd = _touchDragSrc.td;
  if (over && over.dataset.cell && over !== srcTd) {
    // Simulate drop by re-using mouse drop logic
    _dragSrc = _touchDragSrc;
    const fakeEvent = {
      preventDefault: () => {},
      currentTarget: over
    };
    onCellDrop(fakeEvent);
    _dragSrc = null;
  }
  _touchDragSrc = null;
  srcTd.removeEventListener("touchmove", _onTouchDragMove);
  srcTd.removeEventListener("touchend", _onTouchDragEnd);
  srcTd.removeEventListener("touchcancel", _onTouchDragEnd);
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

  const _schedName = u.schedule_name || u.name;
  const hasLessons = ALL_TEACHERS[_schedName] && ALL_TEACHERS[_schedName].total > 0;
  if (!hasLessons) {
    if (u.role === 'head' || u.role === 'director') {
      root.innerHTML = `<div class="history-empty">Чтобы видеть своё расписание, укажите ФИО в кабинете (иконка профиля → «Моё ФИО в расписании»).</div>`;
    } else {
      root.innerHTML = `<div class="history-empty">У вас нет преподаваемых уроков в расписании.</div>`;
    }
    return;
  }

  const view = state.myView;
  const today = todayDayName();
  if (view === "today" && state.myDay !== today) state.myDay = today;

  // Build full week schedule (aggregated across ALL depts)
  const week = teacherWeekSchedule(_schedName);

  // Detect conflicts: same time slot used in 2+ depts on the same day
  const conflicts = {}; // { day: { time: [dept1, dept2...] } }
  for (const day of DAYS) {
    const byTime = {};
    for (const L of week[day]) {
      if (!byTime[L.time]) byTime[L.time] = [];
      byTime[L.time].push(L.dept);
    }
    for (const [time, depts] of Object.entries(byTime)) {
      if (depts.length > 1) {
        if (!conflicts[day]) conflicts[day] = {};
        conflicts[day][time] = depts;
      }
    }
  }
  const totalConflicts = Object.values(conflicts).reduce((s, dc) => s + Object.keys(dc).length, 0);

  let weekHours = 0;
  for (const d of DAYS) weekHours += week[d].length;

  // Dept badges for multi-campus
  const myDepts = u.depts && u.depts.length > 1 ? u.depts : (u.dept ? [u.dept] : []);
  const multiCampus = myDepts.length > 1;
  const deptBadges = myDepts.map(d => `<span style="background:var(--card-bg,#1e293b);border:1px solid var(--border);padding:2px 8px;border-radius:12px;font-size:11px;">${escapeHtml(d)}</span>`).join(" ");

  let html = `<div class="today-greeting">
    <h2>Моё расписание</h2>
    <div class="day-of-week">${escapeHtml(u.name)} · ${weekHours} часов в неделю${multiCampus ? ` · <span title="Работает в нескольких корпусах">🏢 ${myDepts.length} корпуса</span>` : ""}</div>
    ${multiCampus ? `<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">${deptBadges}</div>` : ""}
  </div>`;

  // Conflict banner
  if (totalConflicts > 0) {
    const conflictDetails = Object.entries(conflicts).flatMap(([day, byTime]) =>
      Object.entries(byTime).map(([time, depts]) => `${day} ${time} (${depts.join(" / ")})`)).join("; ");
    html += `<div style="background:#7f1d1d22;border:1px solid #f87171;border-radius:8px;padding:10px 14px;margin-bottom:12px;color:#f87171;">
      <b>⚠ Конфликты расписания: ${totalConflicts}</b>
      <div style="font-size:12px;margin-top:4px;">${escapeHtml(conflictDetails)}</div>
    </div>`;
  }

  // View switch
  const myRepCount = ALL_REPLACEMENTS.filter(r => r.replacement_name === u.name).length;
  html += `<div class="toolbar" style="margin-bottom:10px;">
    <div class="view-switch">
      <button class="${view==='today'?'active':''}" onclick="setMyView('today')">Сегодня</button>
      <button class="${view==='day'?'active':''}" onclick="setMyView('day')">День</button>
      <button class="${view==='week'?'active':''}" onclick="setMyView('week')">Неделя</button>
      <button class="${view==='myrep'?'active':''}" onclick="setMyView('myrep')">🔄 Мои замены${myRepCount > 0 ? ` <span style="background:var(--accent);color:#fff;border-radius:9px;padding:0 6px;font-size:11px;">${myRepCount}</span>` : ''}</button>
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
    const lessons = week[day] || [];
    if (lessons.length === 0) {
      html += `<div class="today-list"><div class="history-empty">${day === today ? "Сегодня" : day} у вас нет уроков 🎉</div></div>`;
    } else {
      html += `<div style="font-size:13px;color:var(--text-muted);margin:6px 4px;"><b>${day}</b> · ${lessons.length} ${pluralLesson(lessons.length)}</div>`;
      html += `<div class="today-list">`;
      for (const L of lessons) {
        const status = (view === "today") ? lessonTimeStatus(L.time) : "future";
        const isConflict = conflicts[day] && conflicts[day][L.time];
        const tags = [
          (status === "now") ? `<span class="today-tag tag-now">сейчас</span>` : "",
          isConflict ? `<span class="today-tag" style="background:#7f1d1d;color:#fca5a5;" title="Конфликт: ${escapeHtml(isConflict.join(' / '))}">⚠ конфликт</span>` : ""
        ].join("");
        html += `<div class="today-card ${status}${isConflict ? ' conflict-card' : ''}">
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
    const slots = [];
    for (const day of DAYS) {
      for (const L of week[day]) {
        let slot = slots.find(s => s.time === L.time);
        if (!slot) { slot = { time: L.time, byDay: {} }; slots.push(slot); }
        if (!slot.byDay[day]) slot.byDay[day] = [];
        slot.byDay[day].push(L);
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
      for (const day of DAYS) {
        const hasConflict = conflicts[day] && Object.values(conflicts[day]).length > 0;
        html += `<th class="cls-h">${day}${hasConflict ? ' ⚠' : ''}</th>`;
      }
      html += `</tr></thead><tbody>`;
      for (const slot of slots) {
        html += `<tr><td class="lesson-time">${escapeHtml(slot.time)}</td>`;
        for (const day of DAYS) {
          const cells = slot.byDay[day];
          if (!cells || cells.length === 0) { html += `<td></td>`; continue; }
          const isConflict = conflicts[day] && conflicts[day][slot.time];
          const bg = isConflict ? "background:rgba(127,29,29,.25);border:1px solid #f87171;" : "";
          html += `<td style="${bg}">`;
          for (const L of cells) {
            html += `<div class="cell-subject ${subjectClass(L.subject || '')}" style="margin-bottom:${cells.length>1?'4px':'0'}">
              ${escapeHtml(L.subject || '—')}${L.room ? `<span class="cell-room click-link" title="Открыть расписание кабинета" onclick="openRoomCard('${escapeHtml(L.room)}')">${escapeHtml(L.room)}</span>` : ''}
            </div>
            <div class="cell-teacher" style="font-size:10px;">${escapeHtml(L.dept)} · <span class="click-link" onclick="openClassCard('${L.dept}','${L.cls}')">${L.cls} кл</span></div>`;
          }
          if (isConflict) html += `<div style="font-size:10px;color:#f87171;margin-top:2px;">⚠ конфликт</div>`;
          html += `</td>`;
        }
        html += `</tr>`;
      }
      html += `</tbody></table></div>`;
    }
  } else if (view === "myrep") {
    const myReps = ALL_REPLACEMENTS.filter(r => r.replacement_name === u.name);
    if (myReps.length === 0) {
      html += `<div class="today-list"><div class="history-empty">У вас ещё нет замен 🎉</div></div>`;
    } else {
      html += `<div style="font-size:13px;color:var(--text-muted);margin:6px 4px 10px;">Всего замен: <b>${myReps.length}</b></div>`;
      html += `<div class="history-list">`;
      for (const r of myReps) {
        html += `<div class="history-item">
          <div class="history-date">${new Date(r.created_at).toLocaleDateString("ru-RU")}</div>
          <div><b>${escapeHtml(r.day)}</b> · урок ${r.lesson_no}</div>
          <div>${escapeHtml(r.dept)} ${escapeHtml(r.cls || '')} кл · ${escapeHtml(r.subject || '')}</div>
          <div>Вместо: <span class="click-link" onclick="openTeacherCard('${escapeHtml(r.absent_name)}')">${escapeHtml(r.absent_name)}</span></div>
        </div>`;
      }
      html += `</div>`;
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

// ============= ROOM CARD =============
function openRoomCard(room) {
  if (!room) return;
  // Collect all lessons in this room across all depts/days
  const entries = [];
  for (const dept of DEPTS) {
    if (!DATA[dept]) continue;
    for (const day of DAYS) {
      const sched = DATA[dept].schedule[day] || {};
      for (const [lkey, ld] of Object.entries(sched)) {
        for (const [cls, info] of Object.entries(ld.classes || {})) {
          if ((info.room || '') === room) {
            entries.push({ dept, day, cls, lkey, lesson_no: ld.lesson_no, time: ld.time, subject: info.subject, teacher: info.teacher });
          }
          // check groups
          for (const [grp, gi] of Object.entries(info.groups || {})) {
            if ((gi.room || '') === room) {
              entries.push({ dept, day, cls, grp, lkey, lesson_no: ld.lesson_no, time: ld.time, subject: gi.subject, teacher: gi.teacher });
            }
          }
        }
      }
    }
  }
  // Group by day
  let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
    <h3 style="margin:0;">📍 Кабинет ${escapeHtml(room)}</h3>
    <button class="link-btn" onclick="document.getElementById('teacherCardModal').classList.remove('show')" style="font-size:14px;">✕</button>
  </div>`;
  if (entries.length === 0) {
    html += `<div class="history-empty">В этом кабинете нет уроков в расписании.</div>`;
  } else {
    for (const day of DAYS) {
      const dayEntries = entries.filter(e => e.day === day);
      if (!dayEntries.length) continue;
      dayEntries.sort((a,b) => (a.lesson_no||0) - (b.lesson_no||0));
      html += `<div style="padding:8px 0;border-bottom:1px solid var(--border);"><div style="font-weight:600;margin-bottom:4px;">${day}</div>`;
      for (const e of dayEntries) {
        html += `<div style="display:flex;gap:10px;align-items:center;font-size:12px;padding:3px 0;">
          <span style="min-width:90px;color:var(--ip-blue);font-weight:500;">${escapeHtml(e.time||'')}</span>
          <span style="font-weight:600;">${escapeHtml(e.subject||'—')}</span>
          <span style="color:var(--text-muted);">${escapeHtml(e.dept)} · ${escapeHtml(e.cls)} кл${e.grp ? ' · гр. ' + escapeHtml(e.grp) : ''}</span>
          ${e.teacher ? `<span class="click-link" onclick="document.getElementById('teacherCardModal').classList.remove('show'); openTeacherCard('${escapeHtml(e.teacher).replace(/'/g,"\\'")}')">👤 ${escapeHtml(e.teacher)}</span>` : ''}
        </div>`;
      }
      html += `</div>`;
    }
  }
  document.getElementById("teacherCardBody").innerHTML = html;
  document.getElementById("teacherCardModal").classList.add("show");
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
    const role = a.role === "director" ? "Директор" : a.role === "head" ? "Завуч" : "Учитель";
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
  const isHead = u.role === "head" || u.role === "director";

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
  if (CURRENT_USER.role === "head" || CURRENT_USER.role === "director") {
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
  const user_id = (CURRENT_USER.role === "head" || CURRENT_USER.role === "director") ? parseInt(document.getElementById("absUser").value) : CURRENT_USER.id;
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
  const isHead = u.role === "head" || u.role === "director";

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

// ============= GENERATOR API CLIENT =============
Object.assign(API, {
  // Кабинеты
  roomsList(dept)       { return this.fetch("/api/rooms" + (dept ? `?dept=${encodeURIComponent(dept)}` : "")); },
  roomCreate(d)         { return this.fetch("/api/rooms", { method:"POST", body:JSON.stringify(d) }); },
  roomDelete(id)        { return this.fetch(`/api/rooms/${id}`, { method:"DELETE" }); },
  // Доступность
  availGet(teacher_id, dept) {
    const p = new URLSearchParams();
    if (teacher_id) p.set("teacher_id", teacher_id);
    if (dept) p.set("dept", dept);
    return this.fetch("/api/availability?" + p.toString());
  },
  availSave(d)          { return this.fetch("/api/availability", { method:"POST", body:JSON.stringify(d) }); },
  // Учебный план
  currList(dept, cls) {
    const p = new URLSearchParams();
    if (dept) p.set("dept", dept);
    if (cls) p.set("cls", cls);
    return this.fetch("/api/curriculum?" + p.toString());
  },
  currCreate(d)         { return this.fetch("/api/curriculum", { method:"POST", body:JSON.stringify(d) }); },
  currDelete(id)        { return this.fetch(`/api/curriculum/${id}`, { method:"DELETE" }); },
  currImport(file, dept, preview) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("dept", dept);
    if (preview) fd.append("preview", "true");
    return fetch("/api/curriculum/import", {
      method:"POST", headers:{ Authorization:"Bearer " + this.token }, body:fd
    }).then(async r => { const d = await r.json().catch(()=>({})); if(!r.ok) throw new Error(d.error||"err"); return d; });
  },
  // Профильные группы
  pgList(dept, cls) {
    const p = new URLSearchParams();
    if (dept) p.set("dept", dept);
    if (cls) p.set("cls", cls);
    return this.fetch("/api/profile-groups?" + p.toString());
  },
  pgCreate(d)           { return this.fetch("/api/profile-groups", { method:"POST", body:JSON.stringify(d) }); },
  pgUpdate(id, d)       { return this.fetch(`/api/profile-groups/${id}`, { method:"PATCH", body:JSON.stringify(d) }); },
  pgDelete(id)          { return this.fetch(`/api/profile-groups/${id}`, { method:"DELETE" }); },
  // Версии расписаний
  svList(dept)          { return this.fetch("/api/schedule-versions" + (dept ? `?dept=${encodeURIComponent(dept)}` : "")); },
  svCreate(d)           { return this.fetch("/api/schedule-versions", { method:"POST", body:JSON.stringify(d) }); },
  svPatch(id, d)        { return this.fetch(`/api/schedule-versions/${id}`, { method:"PATCH", body:JSON.stringify(d) }); },
  // Слоты
  slotsList(vid)        { return this.fetch(`/api/schedule-slots/${vid}`); },
  slotsCreate(vid, arr) { return this.fetch(`/api/schedule-slots/${vid}`, { method:"POST", body:JSON.stringify(arr) }); },
  slotsClear(vid)       { return this.fetch(`/api/schedule-slots/${vid}/all`, { method:"DELETE" }); },
  // Генерация
  generate(d)           { return this.fetch("/api/generate", { method:"POST", body:JSON.stringify(d) }); },
});

// ============= GENERATOR STATE =============
let GEN = {
  dept: "Империал",
  tab: "availability",    // availability | curriculum | groups | rooms | versions
  availability: [],       // raw rows from API
  curriculum: [],
  groups: [],
  rooms: [],
  versions: [],
  currentVersion: null,   // {id, name, ...}
  slots: [],
  // editing
  availTeacherId: null,
  availSlots: {},         // "day|no" -> boolean
};

const LESSON_TIMES = [
  {no:0, label:"Орг. момент / ЗОЖ", time:"8:10–8:30"},
  {no:1, label:"1 урок",  time:"8:30–9:50"},
  {no:2, label:"2 урок",  time:"10:00–11:20"},
  {no:3, label:"3 урок",  time:"11:30–12:50"},
  {no:4, label:"4 урок",  time:"13:00–14:20"},
  {no:5, label:"5 урок",  time:"14:30–15:50"},
  {no:6, label:"6 урок",  time:"16:00–17:20"},
  {no:7, label:"7 урок",  time:"17:30–18:50"},
  {no:8, label:"8 урок",  time:"19:00–20:20"},
  {no:9, label:"9 урок",  time:"20:30–21:50"},
];

const SUBJ_TYPE_LABELS = {
  main:"Основной", oge:"ОГЭ", ege:"ЕГЭ", elective:"Элективный",
  support:"Академподдержка", selfprep:"Самоподготовка", extracurr:"Доп. образование"
};

// ============= GENERATOR UI RENDER =============

async function renderGenerator() {
  const root = document.getElementById("sectionGenerator");
  root.innerHTML = `
    <div class="today-greeting">
      <h2>🤖 Генератор расписания</h2>
      <div class="day-of-week">Настройка данных и автоматическое составление расписания</div>
    </div>
    <div class="toolbar" style="gap:4px;margin-bottom:0;">
      <select id="genDeptFilter" onchange="onGenDeptChange(this.value)" style="padding:7px 12px;border:1px solid var(--border);border-radius:6px;font-size:13px;">
        <option value="Империал">🏛 Империал</option>
        <option value="Пушкина">📚 Пушкина</option>
        <option value="Чкалова">✈️ Чкалова</option>
        <option value="Кирова">🌿 Кирова</option>
      </select>
      <div class="gen-tabs" style="display:flex;gap:4px;flex:1;flex-wrap:wrap;">
        ${["availability","curriculum","groups","rooms","versions"].map(t => `
          <button class="gen-tab-btn ${GEN.tab===t?'active':''}" onclick="setGenTab('${t}')" data-tab="${t}">${{
            availability:"📅 Доступность учителей",
            curriculum:"📋 Учебный план",
            groups:"👥 Профильные группы",
            rooms:"🚪 Кабинеты",
            versions:"📦 Версии расписания"
          }[t]}</button>
        `).join("")}
      </div>
      <button class="btn" onclick="openGenerateModal()">🤖 Сгенерировать</button>
    </div>
    <div id="genTabContent" style="padding:16px;"></div>
  `;
  document.getElementById("genDeptFilter").value = GEN.dept;
  await loadGenTabContent();
}

async function onGenDeptChange(dept) {
  GEN.dept = dept;
  await loadGenTabContent();
}

async function setGenTab(tab) {
  GEN.tab = tab;
  document.querySelectorAll(".gen-tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  await loadGenTabContent();
}

async function loadGenTabContent() {
  const root = document.getElementById("genTabContent");
  if (!root) return;
  root.innerHTML = `<div style="color:var(--text-muted);font-size:13px;">Загрузка…</div>`;
  try {
    if (GEN.tab === "availability")  await renderAvailabilityTab(root);
    else if (GEN.tab === "curriculum") await renderCurriculumTab(root);
    else if (GEN.tab === "groups")   await renderGroupsTab(root);
    else if (GEN.tab === "rooms")    await renderRoomsTab(root);
    else if (GEN.tab === "versions") await renderVersionsTab(root);
  } catch(e) {
    root.innerHTML = `<div style="color:#ef4444;padding:12px;">Ошибка загрузки: ${escapeHtml(e.message)}</div>`;
  }
}

// --- Доступность учителей ---
async function renderAvailabilityTab(root) {
  const r = await API.availGet(null, GEN.dept);
  GEN.availability = r.availability;

  // Сгруппировать по учителю
  const byTeacher = {};
  for (const a of GEN.availability) {
    if (!byTeacher[a.teacher_id]) byTeacher[a.teacher_id] = { name: a.teacher_name, slots: [] };
    byTeacher[a.teacher_id].slots.push(a);
  }

  // Все учителя этого отделения
  const teachers = ACCOUNTS.filter(a => a.role === "teacher" && (
    (a.depts || []).includes(GEN.dept) || a.dept === GEN.dept
  )).sort((a,b) => a.name.localeCompare(b.name,"ru"));

  // Также добавить руководителей, которые преподают
  const headTeachers = ACCOUNTS.filter(a => a.role === "head" && (a.depts||[]).includes(GEN.dept) && (a.subjects||[]).length > 0);
  const allTeachers = [...teachers, ...headTeachers].sort((a,b) => a.name.localeCompare(b.name,"ru"));

  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <div>
        <b>Доступность учителей · ${escapeHtml(GEN.dept)}</b>
        <span style="color:var(--text-muted);font-size:12px;margin-left:8px;">${allTeachers.length} учителей</span>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn secondary" onclick="openAvailImport()">📤 Загрузить Excel</button>
        <button class="btn" onclick="openAvailModal(null)">+ Заполнить</button>
      </div>
    </div>
    <div style="overflow-x:auto;">
    <table class="gen-table">
      <thead><tr>
        <th>Учитель</th>
        ${DAYS.map(d=>`<th colspan="2" style="text-align:center;">${d}</th>`).join("")}
        <th></th>
      </tr>
      <tr>
        <th></th>
        ${DAYS.map(()=>`<th style="font-size:10px;color:var(--text-muted);">Доступен</th><th style="font-size:10px;color:var(--text-muted);">Недост.</th>`).join("")}
        <th></th>
      </tr>
      </thead>
      <tbody>
  `;
  for (const t of allTeachers) {
    const tData = byTeacher[t.id];
    const avail = tData ? tData.slots.filter(s => s.available) : [];
    const unavail = tData ? tData.slots.filter(s => !s.available) : [];
    const rowClass = !tData ? "gen-row-empty" : "";
    html += `<tr class="${rowClass}">
      <td><b>${escapeHtml(t.name)}</b><br><span style="font-size:11px;color:var(--text-muted);">${(t.subjects||[]).slice(0,2).join(", ")}</span></td>
      ${DAYS.map(d => {
        const dayAvail = avail.filter(s => s.day_of_week === d).map(s=>s.lesson_no).sort().join(",");
        const dayUn   = unavail.filter(s => s.day_of_week === d).map(s=>s.lesson_no).sort().join(",");
        return `<td style="font-size:11px;color:#16A34A;">${dayAvail || "—"}</td><td style="font-size:11px;color:#DC2626;">${dayUn || "—"}</td>`;
      }).join("")}
      <td><button class="link-btn" onclick="openAvailModal(${t.id})">✎</button></td>
    </tr>`;
  }
  html += `</tbody></table></div>`;
  root.innerHTML = html;
}

function openAvailModal(teacherId) {
  GEN.availTeacherId = teacherId;
  const modal = document.getElementById("availModal");
  const teacher = teacherId ? ACCOUNTS.find(a => a.id === teacherId) : null;
  document.getElementById("availModalTitle").textContent = teacher
    ? `Доступность: ${teacher.name}` : "Моя доступность";

  // Build slot map from existing data
  const existing = GEN.availability.filter(a => !teacherId || a.teacher_id === teacherId);
  GEN.availSlots = {};
  for (const a of existing) {
    GEN.availSlots[a.day_of_week + "|" + a.lesson_no] = a.available;
  }
  // Default: all available if no data
  if (existing.length === 0) {
    for (const day of DAYS) for (const l of LESSON_TIMES) {
      GEN.availSlots[day + "|" + l.no] = true;
    }
  }

  // Render grid
  let html = `<table class="gen-table avail-grid">
    <thead><tr><th>Урок / Время</th>${DAYS.map(d=>`<th>${d}</th>`).join("")}</tr></thead>
    <tbody>`;
  for (const l of LESSON_TIMES) {
    html += `<tr><td style="font-size:11px;"><b>${l.no === 0 ? "0 (орг.)" : l.no}</b><br><span style="color:var(--text-muted);">${l.time}</span></td>`;
    for (const day of DAYS) {
      const key = day + "|" + l.no;
      const checked = GEN.availSlots[key] !== false;
      html += `<td style="text-align:center;">
        <input type="checkbox" class="avail-cb" data-key="${key}" ${checked?"checked":""} onchange="GEN.availSlots[this.dataset.key]=this.checked">
      </td>`;
    }
    html += `</tr>`;
  }
  html += `</tbody></table>`;
  document.getElementById("availGrid").innerHTML = html;
  document.getElementById("availErr").textContent = "";
  modal.classList.add("show");
}

function closeAvailModal() {
  document.getElementById("availModal").classList.remove("show");
}

async function saveAvailability() {
  const dept = document.getElementById("availDept").value || null;
  const teacherId = GEN.availTeacherId;
  const slots = [];
  for (const [key, avail] of Object.entries(GEN.availSlots)) {
    const [day, no] = key.split("|");
    slots.push({ day_of_week: day, lesson_no: parseInt(no), available: avail });
  }
  try {
    await API.availSave({ teacher_id: teacherId, dept, slots });
    closeAvailModal();
    await loadGenTabContent();
  } catch(e) {
    document.getElementById("availErr").textContent = "Ошибка: " + e.message;
  }
}

function openAvailImport() {
  alert("Загрузка доступности из Excel:\n\nФормат: Учитель | Понедельник_1 | Понедельник_2 | … | Пятница_9\nДа/Нет или 1/0 в ячейках.\n\nФункция будет добавлена в следующей версии.");
}

// --- Учебный план ---
async function renderCurriculumTab(root) {
  const r = await API.currList(GEN.dept);
  GEN.curriculum = r.curriculum;

  const byClass = {};
  for (const c of GEN.curriculum) {
    if (!byClass[c.cls]) byClass[c.cls] = [];
    byClass[c.cls].push(c);
  }
  const classes = Object.keys(byClass).sort((a,b) => {
    const na = parseInt(a), nb = parseInt(b);
    return na !== nb ? na - nb : a.localeCompare(b,"ru");
  });

  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <div><b>Учебный план · ${escapeHtml(GEN.dept)}</b>
        <span style="color:var(--text-muted);font-size:12px;margin-left:8px;">${GEN.curriculum.length} строк</span>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn secondary" onclick="openCurrImport()">📤 Загрузить Excel</button>
        <button class="btn" onclick="openCurrAdd()">+ Добавить</button>
      </div>
    </div>
  `;

  if (classes.length === 0) {
    html += `<div style="padding:32px;text-align:center;color:var(--text-muted);">
      Учебный план не загружен.<br>
      <button class="btn" style="margin-top:12px;" onclick="openCurrImport()">📤 Загрузить из Excel</button>
    </div>`;
  } else {
    for (const cls of classes) {
      const items = byClass[cls];
      const totalHours = items.reduce((s,i) => s + parseFloat(i.hours_week||0), 0);
      html += `<details style="margin-bottom:8px;" open>
        <summary style="cursor:pointer;padding:8px 12px;background:#F9FAFB;border-radius:6px;font-weight:600;user-select:none;">
          Класс ${escapeHtml(cls)} · ${items.length} предметов · ${totalHours} ч/нед
        </summary>
        <table class="gen-table" style="margin-top:4px;">
          <thead><tr><th>Предмет</th><th>Ч/нед</th><th>Тип</th><th>Учитель</th><th></th></tr></thead>
          <tbody>`;
      for (const it of items) {
        html += `<tr>
          <td><b>${escapeHtml(it.subject)}</b></td>
          <td>${it.hours_week}</td>
          <td><span class="badge-type type-${it.subject_type}">${SUBJ_TYPE_LABELS[it.subject_type]||it.subject_type}</span></td>
          <td style="font-size:12px;">${escapeHtml(it.teacher_name||"—")}</td>
          <td><button class="link-btn" style="color:#DC2626;" onclick="deleteCurrItem(${it.id})">✕</button></td>
        </tr>`;
      }
      html += `</tbody></table></details>`;
    }
  }
  root.innerHTML = html;
}

function openCurrImport() {
  document.getElementById("currImportModal").classList.add("show");
  document.getElementById("currImportDept").value = GEN.dept;
  document.getElementById("currImportFile").value = "";
  document.getElementById("currImportPreview").innerHTML = "";
  document.getElementById("currImportConfirmBtn").disabled = true;
  document.getElementById("currImportErr").textContent = "";
}

async function previewCurrImport() {
  const file = document.getElementById("currImportFile").files[0];
  const dept = document.getElementById("currImportDept").value;
  if (!file) { document.getElementById("currImportErr").textContent = "Выберите файл"; return; }
  try {
    const r = await API.currImport(file, dept, true);
    let html = `<div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;">Найдено ${r.total} строк. Первые 50:</div>
      <table class="gen-table" style="font-size:11px;">
      <thead><tr><th>Класс</th><th>Предмет</th><th>Ч/нед</th><th>Тип</th></tr></thead><tbody>`;
    for (const p of r.preview) {
      html += `<tr><td>${escapeHtml(p.cls)}</td><td>${escapeHtml(p.subject)}</td><td>${p.hours_week}</td><td>${escapeHtml(p.subject_type)}</td></tr>`;
    }
    html += `</tbody></table>`;
    document.getElementById("currImportPreview").innerHTML = html;
    document.getElementById("currImportConfirmBtn").disabled = false;
    document.getElementById("currImportErr").textContent = "";
  } catch(e) {
    document.getElementById("currImportErr").textContent = "Ошибка: " + e.message;
  }
}

async function confirmCurrImport() {
  const file = document.getElementById("currImportFile").files[0];
  const dept = document.getElementById("currImportDept").value;
  try {
    const r = await API.currImport(file, dept, false);
    document.getElementById("currImportModal").classList.remove("show");
    GEN.dept = dept;
    await loadGenTabContent();
    alert(`✅ Загружено ${r.saved} строк учебного плана.`);
  } catch(e) {
    document.getElementById("currImportErr").textContent = "Ошибка: " + e.message;
  }
}

function openCurrAdd() {
  const cls = prompt("Класс (например: 5, 7а, 10ф):");
  if (!cls) return;
  const subject = prompt("Предмет:");
  if (!subject) return;
  const hours = parseFloat(prompt("Часов в неделю:"));
  if (isNaN(hours)) return;
  API.currCreate({ dept: GEN.dept, cls: cls.trim(), subject: subject.trim(), hours_week: hours })
    .then(() => loadGenTabContent())
    .catch(e => alert("Ошибка: " + e.message));
}

async function deleteCurrItem(id) {
  if (!confirm("Удалить эту строку учебного плана?")) return;
  await API.currDelete(id);
  await loadGenTabContent();
}

// --- Профильные группы ---
async function renderGroupsTab(root) {
  const r = await API.pgList(GEN.dept);
  GEN.groups = r.groups;

  const byClass = {};
  for (const g of GEN.groups) {
    if (!byClass[g.cls]) byClass[g.cls] = [];
    byClass[g.cls].push(g);
  }
  const classes = Object.keys(byClass).sort((a,b) => parseInt(b)-parseInt(a));

  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <div><b>Профильные группы · ${escapeHtml(GEN.dept)}</b>
        <span style="color:var(--text-muted);font-size:12px;margin-left:8px;">ОГЭ/ЕГЭ и профильные предметы 9–11 кл</span>
      </div>
      <button class="btn" onclick="openPGModal()">+ Добавить группу</button>
    </div>
  `;

  if (GEN.groups.length === 0) {
    html += `<div style="padding:32px;text-align:center;color:var(--text-muted);">
      Профильных групп нет.<br>
      <button class="btn" style="margin-top:12px;" onclick="openPGModal()">+ Добавить</button>
    </div>`;
  } else {
    for (const cls of classes) {
      html += `<details style="margin-bottom:8px;" open>
        <summary style="cursor:pointer;padding:8px 12px;background:#F9FAFB;border-radius:6px;font-weight:600;user-select:none;">
          Класс ${escapeHtml(cls)} · ${byClass[cls].length} групп
        </summary>
        <table class="gen-table" style="margin-top:4px;">
          <thead><tr><th>Группа</th><th>Код</th><th>Предмет</th><th>Тип</th><th>Учитель</th><th></th></tr></thead>
          <tbody>`;
      for (const g of byClass[cls]) {
        html += `<tr>
          <td><b>${escapeHtml(g.group_name)}</b></td>
          <td><code style="background:#EEF2FF;padding:2px 6px;border-radius:4px;">${escapeHtml(g.group_code)}</code></td>
          <td>${escapeHtml(g.subject||"—")}</td>
          <td><span class="badge-type type-${g.exam_type||'main'}">${g.exam_type ? g.exam_type.toUpperCase() : "—"}</span></td>
          <td style="font-size:12px;">${escapeHtml(g.teacher_name||"—")}</td>
          <td>
            <button class="link-btn" onclick="openPGModal(${g.id})">✎</button>
            <button class="link-btn" style="color:#DC2626;margin-left:6px;" onclick="deletePG(${g.id})">✕</button>
          </td>
        </tr>`;
      }
      html += `</tbody></table></details>`;
    }
  }
  root.innerHTML = html;
}

function openPGModal(id) {
  const modal = document.getElementById("pgModal");
  const g = id ? GEN.groups.find(x => x.id === id) : null;
  document.getElementById("pgModalTitle").textContent = g ? "Редактировать группу" : "Новая профильная группа";
  document.getElementById("pgId").value = id || "";
  document.getElementById("pgDept").value = g ? g.dept : GEN.dept;
  document.getElementById("pgCls").value = g ? g.cls : "";
  document.getElementById("pgName").value = g ? g.group_name : "";
  document.getElementById("pgCode").value = g ? g.group_code : "";
  document.getElementById("pgSubject").value = g ? (g.subject||"") : "";
  document.getElementById("pgExam").value = g ? (g.exam_type||"") : "";
  document.getElementById("pgErr").textContent = "";
  // Fill teacher select
  const sel = document.getElementById("pgTeacher");
  const teachers = ACCOUNTS.filter(a => a.role === "teacher" || (a.role === "head" && (a.subjects||[]).length > 0))
    .sort((a,b) => a.name.localeCompare(b.name,"ru"));
  sel.innerHTML = `<option value="">— выберите —</option>` +
    teachers.map(t => `<option value="${t.id}" ${g && g.teacher_id === t.id ? "selected" : ""}>${escapeHtml(t.name)}</option>`).join("");
  modal.classList.add("show");
}

async function savePG() {
  const id = document.getElementById("pgId").value;
  const d = {
    dept: document.getElementById("pgDept").value,
    cls: document.getElementById("pgCls").value.trim(),
    group_name: document.getElementById("pgName").value.trim(),
    group_code: document.getElementById("pgCode").value.trim(),
    subject: document.getElementById("pgSubject").value.trim() || null,
    exam_type: document.getElementById("pgExam").value || null,
    teacher_id: document.getElementById("pgTeacher").value || null,
  };
  if (!d.cls || !d.group_name || !d.group_code) {
    document.getElementById("pgErr").textContent = "Заполните класс, название и код группы";
    return;
  }
  try {
    if (id) await API.pgUpdate(id, d); else await API.pgCreate(d);
    document.getElementById("pgModal").classList.remove("show");
    await loadGenTabContent();
  } catch(e) { document.getElementById("pgErr").textContent = "Ошибка: " + e.message; }
}

async function deletePG(id) {
  if (!confirm("Удалить группу?")) return;
  await API.pgDelete(id);
  await loadGenTabContent();
}

// --- Кабинеты ---
async function renderRoomsTab(root) {
  const r = await API.roomsList(GEN.dept);
  GEN.rooms = r.rooms;

  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <div><b>Кабинеты · ${escapeHtml(GEN.dept)}</b>
        <span style="color:var(--text-muted);font-size:12px;margin-left:8px;">${GEN.rooms.length} кабинетов</span>
      </div>
      <button class="btn" onclick="openRoomModal()">+ Добавить</button>
    </div>
    <table class="gen-table">
      <thead><tr><th>Кабинет</th><th>Вместимость</th><th>Примечание</th><th></th></tr></thead>
      <tbody>`;
  if (GEN.rooms.length === 0) {
    html += `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px;">Кабинеты не добавлены</td></tr>`;
  }
  for (const rm of GEN.rooms) {
    html += `<tr>
      <td><b>${escapeHtml(rm.name)}</b></td>
      <td>${rm.capacity}</td>
      <td style="font-size:12px;color:var(--text-muted);">${escapeHtml(rm.notes||"")}</td>
      <td><button class="link-btn" style="color:#DC2626;" onclick="deleteRoom(${rm.id})">✕</button></td>
    </tr>`;
  }
  html += `</tbody></table>`;
  root.innerHTML = html;
}

function openRoomModal() {
  document.getElementById("roomModal").classList.add("show");
  document.getElementById("roomDept").value = GEN.dept;
  document.getElementById("roomName").value = "";
  document.getElementById("roomCap").value = 30;
  document.getElementById("roomNote").value = "";
  document.getElementById("roomErr").textContent = "";
}

async function saveRoom() {
  const d = {
    dept: document.getElementById("roomDept").value,
    name: document.getElementById("roomName").value.trim(),
    capacity: parseInt(document.getElementById("roomCap").value) || 30,
    notes: document.getElementById("roomNote").value.trim() || null,
  };
  if (!d.name) { document.getElementById("roomErr").textContent = "Введите название"; return; }
  try {
    await API.roomCreate(d);
    document.getElementById("roomModal").classList.remove("show");
    await loadGenTabContent();
  } catch(e) { document.getElementById("roomErr").textContent = "Ошибка: " + e.message; }
}

async function deleteRoom(id) {
  if (!confirm("Удалить кабинет?")) return;
  await API.roomDelete(id);
  await loadGenTabContent();
}

// --- Версии расписаний ---
async function renderVersionsTab(root) {
  const r = await API.svList(GEN.dept);
  GEN.versions = r.versions;

  const STATUS_LABELS = { draft:"Черновик", active:"Активное", archived:"Архив" };
  const STATUS_COLORS = { draft:"#F59E0B", active:"#16A34A", archived:"#6B7280" };

  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <div><b>Версии расписания · ${escapeHtml(GEN.dept)}</b></div>
      <button class="btn" onclick="openGenerateModal()">🤖 Сгенерировать новое</button>
    </div>
  `;

  if (GEN.versions.length === 0) {
    html += `<div style="padding:32px;text-align:center;color:var(--text-muted);">
      Версий расписания нет. Нажмите «Сгенерировать новое» для старта.
    </div>`;
  } else {
    html += `<div style="display:flex;flex-direction:column;gap:10px;">`;
    for (const v of GEN.versions) {
      const isActive = v.status === "active";
      html += `<div class="gen-version-card ${isActive ? 'active' : ''}">
        <div style="flex:1;">
          <div style="display:flex;align-items:center;gap:8px;">
            <b>${escapeHtml(v.name)}</b>
            <span class="badge-type" style="background:${STATUS_COLORS[v.status]}22;color:${STATUS_COLORS[v.status]};border:1px solid ${STATUS_COLORS[v.status]}44;">
              ${STATUS_LABELS[v.status]||v.status}
            </span>
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">
            ${v.week_start ? "Неделя с " + v.week_start : ""} · создал ${escapeHtml(v.created_by_name||"—")} · ${new Date(v.created_at).toLocaleString("ru-RU")}
          </div>
          ${v.notes ? `<div style="font-size:11px;color:var(--text-muted);">${escapeHtml(v.notes)}</div>` : ""}
        </div>
        <div style="display:flex;gap:6px;align-items:flex-start;">
          <button class="btn secondary" onclick="viewVersion(${v.id})">👁 Просмотр</button>
          ${!isActive ? `<button class="btn" onclick="activateVersion(${v.id})">✅ Активировать</button>` : `<span style="color:#16A34A;font-size:12px;font-weight:600;">✓ Активное</span>`}
        </div>
      </div>`;
    }
    html += `</div>`;
  }
  root.innerHTML = html;
}

async function activateVersion(id) {
  if (!confirm("Активировать эту версию расписания? Текущая активная будет архивирована.")) return;
  // Archive current active
  const current = GEN.versions.find(v => v.status === "active");
  if (current) await API.svPatch(current.id, { status: "archived" });
  await API.svPatch(id, { status: "active" });
  await loadGenTabContent();
}

async function viewVersion(id) {
  const r = await API.slotsList(id);
  GEN.slots = r.slots;
  const version = GEN.versions.find(v => v.id === id);

  // Show version schedule in a full-screen overlay
  const DAYS_SHORT = ["Пн","Вт","Ср","Чт","Пт"];
  const classes = [...new Set(GEN.slots.map(s => s.cls))].sort((a,b) => {
    const na = parseInt(a), nb = parseInt(b);
    return na !== nb ? na - nb : a.localeCompare(b,"ru");
  });

  const root = document.getElementById("genTabContent");
  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <div>
        <button class="link-btn" onclick="setGenTab('versions')" style="font-size:13px;">← Назад к версиям</button>
        <h3 style="margin:8px 0 0 0;">${escapeHtml(version?.name||"Расписание")}</h3>
      </div>
      <button class="btn secondary" onclick="exportVersionXlsx(${id})">📥 Скачать Excel</button>
    </div>
    <div style="overflow-x:auto;">
    <table class="gen-table sched-view">
      <thead><tr><th>Урок</th><th>Время</th>
        ${DAYS.map(d => `<th>${d}</th>`).join("")}
      </tr></thead>
      <tbody>
  `;

  // Build slot index: cls -> day -> lesson_no -> slot
  const idx = {};
  for (const s of GEN.slots) {
    if (!idx[s.cls]) idx[s.cls] = {};
    if (!idx[s.cls][s.day_of_week]) idx[s.cls][s.day_of_week] = {};
    idx[s.cls][s.day_of_week][s.lesson_no] = s;
  }

  // Class selector
  const [viewCls, setViewCls] = (() => {
    let cur = classes[0] || "";
    return [() => cur, (c) => { cur = c; }];
  })();

  html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <div>
        <button class="link-btn" onclick="setGenTab('versions')" style="font-size:13px;">← Назад к версиям</button>
        <h3 style="margin:8px 0 0 0;">${escapeHtml(version?.name||"Расписание")}</h3>
      </div>
      <div style="display:flex;gap:8px;">
        <select id="versionClsFilter" onchange="renderVersionTable(${id}, this.value)" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;">
          ${classes.map(c => `<option value="${c}">Класс ${escapeHtml(c)}</option>`).join("")}
        </select>
        <button class="btn secondary" onclick="exportVersionXlsx(${id})">📥 Excel</button>
      </div>
    </div>
    <div id="versionTableContainer"></div>
  `;
  root.innerHTML = html;
  renderVersionTable(id, classes[0]);
}

function renderVersionTable(versionId, cls) {
  const slots = GEN.slots.filter(s => s.cls === cls);
  const byDay = {};
  for (const s of slots) {
    if (!byDay[s.day_of_week]) byDay[s.day_of_week] = {};
    byDay[s.day_of_week][s.lesson_no] = s;
  }
  const usedLessons = [...new Set(slots.map(s=>s.lesson_no))].sort((a,b)=>a-b);

  let html = `<table class="gen-table sched-view"><thead><tr>
    <th>Урок</th><th>Время</th>${DAYS.map(d=>`<th>${d}</th>`).join("")}
  </tr></thead><tbody>`;

  for (const l of LESSON_TIMES) {
    const hasAny = DAYS.some(d => byDay[d]?.[l.no]);
    if (!hasAny && l.no > 7) continue;
    html += `<tr><td>${l.no === 0 ? "0" : l.no}</td><td style="font-size:11px;white-space:nowrap;">${l.time}</td>`;
    for (const day of DAYS) {
      const s = byDay[day]?.[l.no];
      if (!s) { html += `<td></td>`; continue; }
      const badge = s.slot_type !== "main" ? `<span class="badge-type type-${s.slot_type}" style="font-size:9px;">${s.slot_type}</span>` : "";
      html += `<td style="background:${s.slot_type==='support'?'#F0FFF4':s.slot_type==='walk'?'#EFF6FF':s.slot_type==='selfprep'?'#FFF7ED':''}">
        <div style="font-size:12px;font-weight:600;">${escapeHtml(s.subject)}</div>
        <div style="font-size:10px;color:var(--text-muted);">${escapeHtml(s.teacher_name||"")}</div>
        ${badge}
      </td>`;
    }
    html += `</tr>`;
  }
  html += `</tbody></table>`;
  document.getElementById("versionTableContainer").innerHTML = html;
}

// --- Generate Modal ---
function openGenerateModal() {
  const today = new Date();
  // Find next Monday
  const day = today.getDay();
  const diff = day === 0 ? 1 : (day === 6 ? 2 : (8 - day) % 7 || 7);
  const monday = new Date(today);
  monday.setDate(today.getDate() + (day <= 1 ? (1 - day) : diff));
  const mondayStr = monday.toISOString().slice(0,10);

  document.getElementById("genDept").value = GEN.dept;
  document.getElementById("genName").value = `Расписание ${mondayStr} · ${GEN.dept}`;
  document.getElementById("genWeekStart").value = mondayStr;
  document.getElementById("genErr").textContent = "";
  document.getElementById("genLog").style.display = "none";
  document.getElementById("genLog").textContent = "";
  document.getElementById("genBtn").disabled = false;
  document.getElementById("generateModal").classList.add("show");
}

async function runGenerate() {
  const dept = document.getElementById("genDept").value;
  const name = document.getElementById("genName").value.trim();
  const weekStart = document.getElementById("genWeekStart").value;
  if (!name) { document.getElementById("genErr").textContent = "Введите название"; return; }

  const log = document.getElementById("genLog");
  log.style.display = "block";
  log.textContent = "▶ Запуск генератора…\n";
  document.getElementById("genBtn").disabled = true;
  document.getElementById("genErr").textContent = "";

  const addLog = (msg) => { log.textContent += msg + "\n"; log.scrollTop = 99999; };

  try {
    addLog(`📋 Загружаю данные для ${dept}…`);
    const [currRes, pgRes, avRes, rmRes] = await Promise.all([
      API.currList(dept), API.pgList(dept), API.availGet(null, dept), API.roomsList(dept)
    ]);

    addLog(`✅ Учебный план: ${currRes.curriculum.length} строк`);
    addLog(`✅ Профгруппы: ${pgRes.groups.length} групп`);
    addLog(`✅ Доступность: ${avRes.availability.length} записей`);
    addLog(`✅ Кабинеты: ${rmRes.rooms.length}`);

    if (currRes.curriculum.length === 0) {
      throw new Error("Учебный план не загружен. Загрузите его во вкладке «Учебный план».");
    }

    addLog(`\n🧠 Запускаю алгоритм генерации (CSP)…`);

    const result = scheduleCSP({
      dept,
      curriculum: currRes.curriculum,
      profileGroups: pgRes.groups,
      availability: avRes.availability,
      rooms: rmRes.rooms,
      accounts: ACCOUNTS,
      onLog: addLog,
    });

    addLog(`\n✅ Сгенерировано ${result.slots.length} слотов`);
    addLog(`📝 Создаю версию расписания…`);

    // Create version
    const vRes = await API.svCreate({ dept, name, week_start: weekStart || null });
    const versionId = vRes.version.id;

    // Save slots in batches of 100
    addLog(`💾 Сохраняю слоты (${result.slots.length})…`);
    for (let i = 0; i < result.slots.length; i += 100) {
      const batch = result.slots.slice(i, i+100).map(s => ({ ...s, dept }));
      await API.slotsCreate(versionId, batch);
    }

    addLog(`\n🎉 Готово! Версия "${name}" создана.`);
    document.getElementById("genBtn").textContent = "✅ Готово";

    // Reload versions tab
    GEN.dept = dept;
    GEN.tab = "versions";
    setTimeout(async () => {
      document.getElementById("generateModal").classList.remove("show");
      if (document.getElementById("genTabContent")) await renderGenerator();
    }, 1500);

  } catch(e) {
    addLog(`\n❌ Ошибка: ${e.message}`);
    document.getElementById("genErr").textContent = e.message;
    document.getElementById("genBtn").disabled = false;
  }
}

async function exportVersionXlsx(versionId) {
  alert("Экспорт в Excel будет реализован в следующем обновлении.\n\nВы можете распечатать расписание через Ctrl+P или сохранить как PDF.");
}

// ============= CSP SCHEDULE ENGINE =============
// Реализация 32-правильного алгоритма составления расписания

function scheduleCSP({ dept, curriculum, profileGroups, availability, rooms, accounts, onLog }) {
  const log = onLog || (() => {});

  // --- Время уроков ---
  const SLOT_TIMES = {
    0: {start:"8:10", end:"8:30"},
    1: {start:"8:30", end:"9:50"},
    2: {start:"10:00", end:"11:20"},
    3: {start:"11:30", end:"12:50"},
    4: {start:"13:00", end:"14:20"},
    5: {start:"14:30", end:"15:50"},
    6: {start:"16:00", end:"17:20"},
    7: {start:"17:30", end:"18:50"},
    8: {start:"19:00", end:"20:20"},
    9: {start:"20:30", end:"21:50"},
  };

  // --- Правило 32: Классный час каждый понедельник 0-й урок для 1-9 кл ---
  const ORAL_SUBJECTS = ["история","биология","обществознание","география","литература","музыка"];
  const CORE_SUBJECTS = ["русский","математика","алгебра","геометрия","английский","физика","химия"];
  const LIGHT_DAY = "Пятница"; // нет предметов 1 раз/нед

  // --- Строим индексы ---
  const teacherById = {};
  for (const a of accounts) teacherById[a.id] = a;

  // Доступность: teacher_id -> day -> Set<lesson_no> (недоступен)
  const unavailable = {};
  for (const a of availability) {
    if (a.available) continue; // только блокировки
    if (!unavailable[a.teacher_id]) unavailable[a.teacher_id] = {};
    if (!unavailable[a.teacher_id][a.day_of_week]) unavailable[a.teacher_id][a.day_of_week] = new Set();
    unavailable[a.teacher_id][a.day_of_week].add(a.lesson_no);
  }

  // Группируем учебный план по классу
  const byClass = {};
  for (const c of curriculum) {
    if (!byClass[c.cls]) byClass[c.cls] = [];
    byClass[c.cls].push({ ...c });
  }

  // Сортируем классы: 11 → 10 → 9 → 8 → 7 → ... → 1 (правило 6)
  const classes = Object.keys(byClass).sort((a,b) => {
    const na = parseInt(b), nb = parseInt(a);
    return na - nb;
  });
  log(`📚 Классов: ${classes.join(", ")}`);

  // Результирующие слоты
  const slots = [];

  // Занятость учителей: teacher_id -> day -> Set<lesson_no>
  const teacherBusy = {};
  const isTeacherBusy = (tid, day, no) => teacherBusy[tid]?.[day]?.has(no);
  const isTeacherUnavail = (tid, day, no) =>
    unavailable[tid]?.[day]?.has(no);
  const markTeacherBusy = (tid, day, no) => {
    if (!teacherBusy[tid]) teacherBusy[tid] = {};
    if (!teacherBusy[tid][day]) teacherBusy[tid][day] = new Set();
    teacherBusy[tid][day].add(no);
  };

  // Счётчик занятых классов по дню/уроку (для правила 10: макс 10 уроков в день)
  const clsDayCount = {}; // cls -> day -> count
  const clsDayLessons = {}; // cls -> day -> [lesson_no] (для правила 15: не два устных подряд)
  const getClsDay = (cls, day) => clsDayCount[cls]?.[day] || 0;
  const markClsDay = (cls, day, no) => {
    if (!clsDayCount[cls]) clsDayCount[cls] = {};
    clsDayCount[cls][day] = (clsDayCount[cls][day] || 0) + 1;
    if (!clsDayLessons[cls]) clsDayLessons[cls] = {};
    if (!clsDayLessons[cls][day]) clsDayLessons[cls][day] = [];
    clsDayLessons[cls][day].push(no);
  };

  // Занятость классов: cls -> day -> Set<lesson_no>
  const clsBusy = {};
  const isClsBusy = (cls, day, no) => clsBusy[cls]?.[day]?.has(no);
  const markClsBusy = (cls, day, no) => {
    if (!clsBusy[cls]) clsBusy[cls] = {};
    if (!clsBusy[cls][day]) clsBusy[cls][day] = new Set();
    clsBusy[cls][day].add(no);
    markClsDay(cls, day, no);
  };

  // Разместить слот
  const placeSlot = (cls, day, no, item, slotType) => {
    const t = SLOT_TIMES[no] || {start:"",end:""};
    slots.push({
      day_of_week: day,
      lesson_no: no,
      time_start: t.start,
      time_end: t.end,
      cls,
      subject: item.subject,
      teacher_id: item.teacher_id || null,
      slot_type: slotType || item.subject_type || "main",
      is_double: false,
    });
    if (item.teacher_id) markTeacherBusy(item.teacher_id, day, no);
    markClsBusy(cls, day, no);
  };

  // --- ПРАВИЛО 32: Классный час пн 0-урок для 1-9 кл ---
  // --- ПРАВИЛО 29: «Учись учиться» 6-8 уроки ---
  // --- ПРАВИЛО 12: Самоподготовка 3х/нед ---
  // --- ПРАВИЛО 11: Академподдержка 2ч/нед ---
  // --- ПРАВИЛО 30: Доп. образование 9-10 урок ---

  // Спецслоты добавляем в конце, пока обрабатываем основное расписание

  // === ОСНОВНОЙ ЦИКЛ ПО КЛАССАМ ===
  for (const cls of classes) {
    const items = byClass[cls];
    const grade = parseInt(cls);
    const isElementary = grade <= 4; // правило 20: началка
    const isHigh = grade >= 10;       // 10-11
    const isNine = grade === 9;       // правило 8

    log(`  Класс ${cls} (${items.length} предметов)…`);

    // Сортируем предметы по приоритету (правило 9: приоритет дефицитным)
    // Основные → ОГЭ/ЕГЭ → остальные
    const sorted = [...items].sort((a, b) => {
      const prio = (x) => x.subject_type === "main" ? 0 : x.subject_type === "oge" || x.subject_type === "ege" ? 1 : 2;
      return prio(a) - prio(b);
    });

    // Счётчик оставшихся часов
    const remaining = {};
    for (const it of sorted) remaining[it.subject] = parseFloat(it.hours_week || 1);

    // --- Правило 32: Классный час Пн 0-й урок для кл 1-9 ---
    if (grade >= 1 && grade <= 9) {
      const klassHour = items.find(i => i.subject.toLowerCase().includes("классн") || i.subject_type === "start");
      if (klassHour && !isClsBusy(cls, "Понедельник", 0) && !isTeacherUnavail(klassHour.teacher_id, "Понедельник", 0)) {
        placeSlot(cls, "Понедельник", 0, klassHour, "start");
        remaining[klassHour.subject] = Math.max(0, (remaining[klassHour.subject]||1) - 1);
      }
    }

    // Для каждого предмета распределяем по неделе
    for (const it of sorted) {
      if (remaining[it.subject] <= 0) continue;
      if (it.subject_type === "selfprep" || it.subject_type === "support" || it.subject_type === "extracurr") continue;

      let hoursLeft = remaining[it.subject];
      const isOral = ORAL_SUBJECTS.some(o => it.subject.toLowerCase().includes(o));
      const isCore = CORE_SUBJECTS.some(o => it.subject.toLowerCase().includes(o));

      // Пятница — не ставить предмет 1 раз/нед (правило 32)
      // Ядро — до 14:00 (уроки 1-4) (правило 14)
      const preferredLessons = isCore ? [1,2,3,4] : [1,2,3,4,5,6];
      const allowFriday = hoursLeft > 1 || !isOral;

      let placed = 0;
      for (const day of DAYS) {
        if (hoursLeft <= 0) break;
        if (day === LIGHT_DAY && !allowFriday) continue;

        // Правило 15: не ставить два устных в один день
        const dayItems = (clsDayLessons[cls]?.[day] || []).map(no => {
          const placed = slots.find(s => s.cls===cls && s.day_of_week===day && s.lesson_no===no);
          return placed?.subject?.toLowerCase() || "";
        });
        if (isOral && dayItems.some(s => ORAL_SUBJECTS.some(o => s.includes(o)))) continue;

        if (getClsDay(cls, day) >= (grade <= 4 ? 6 : 10)) continue; // правило 10

        // Ищем свободный урок
        for (const no of preferredLessons) {
          if (hoursLeft <= 0) break;
          if (isClsBusy(cls, day, no)) continue;
          if (it.teacher_id && isTeacherBusy(it.teacher_id, day, no)) continue;
          if (it.teacher_id && isTeacherUnavail(it.teacher_id, day, no)) continue;
          placeSlot(cls, day, no, it, it.subject_type || "main");
          hoursLeft--;
          placed++;
          break;
        }
        // Если не нашли в предпочтительных, пробуем любой
        if (placed < Math.ceil(parseFloat(it.hours_week)/DAYS.length)) {
          for (let no = 1; no <= 9; no++) {
            if (hoursLeft <= 0) break;
            if (preferredLessons.includes(no)) continue;
            if (isClsBusy(cls, day, no)) continue;
            if (it.teacher_id && isTeacherBusy(it.teacher_id, day, no)) continue;
            if (it.teacher_id && isTeacherUnavail(it.teacher_id, day, no)) continue;
            if (isCore && no > 4) continue; // правило 14
            placeSlot(cls, day, no, it, it.subject_type || "main");
            hoursLeft--;
            break;
          }
        }
      }
      remaining[it.subject] = hoursLeft;
    }

    // --- Правило 12: Самоподготовка 3x/нед (ур.7-8) ---
    const selfprep = items.find(i => i.subject_type === "selfprep");
    if (selfprep) {
      let spCount = 0;
      for (const day of DAYS) {
        if (spCount >= 3) break;
        for (const no of [7,8]) {
          if (!isClsBusy(cls, day, no)) {
            placeSlot(cls, day, no, selfprep, "selfprep");
            spCount++;
            break;
          }
        }
      }
    }

    // --- Правило 11: Академподдержка 2ч/нед на каждый предмет поддержки ---
    const supports = items.filter(i => i.subject_type === "support");
    for (const sup of supports) {
      let supCount = 0;
      for (const day of DAYS) {
        if (supCount >= 2) break;
        for (const no of [6,7,8]) {
          if (!isClsBusy(cls, day, no) && (!sup.teacher_id || !isTeacherBusy(sup.teacher_id, day, no))) {
            placeSlot(cls, day, no, sup, "support");
            supCount++;
            break;
          }
        }
      }
    }

    // --- Правило 22: Прогулки (ур.6-7) ---
    if (grade >= 1 && grade <= 4) {
      const walkItem = { subject: "Прогулка", teacher_id: null, subject_type: "walk" };
      for (const day of DAYS) {
        for (const no of [6,7]) {
          if (!isClsBusy(cls, day, no)) {
            placeSlot(cls, day, no, walkItem, "walk");
            break;
          }
        }
      }
    }
  }

  log(`\n📊 Итого слотов: ${slots.length}`);

  // Проверка конфликтов учителей
  const teacherConflicts = [];
  const tCheck = {}; // teacher_id -> "day|no" -> cls
  for (const s of slots) {
    if (!s.teacher_id) continue;
    const k = s.day_of_week + "|" + s.lesson_no;
    if (tCheck[s.teacher_id]?.[k]) {
      teacherConflicts.push(`${teacherById[s.teacher_id]?.name||s.teacher_id}: ${s.day_of_week} ур.${s.lesson_no} — ${tCheck[s.teacher_id][k]} и ${s.cls}`);
    }
    if (!tCheck[s.teacher_id]) tCheck[s.teacher_id] = {};
    tCheck[s.teacher_id][k] = s.cls;
  }
  if (teacherConflicts.length > 0) {
    log(`⚠️ Конфликты учителей (${teacherConflicts.length}):`);
    for (const c of teacherConflicts.slice(0, 10)) log(`  · ${c}`);
    if (teacherConflicts.length > 10) log(`  … и ещё ${teacherConflicts.length - 10}`);
  } else {
    log(`✅ Конфликтов учителей нет`);
  }

  return { slots, conflicts: teacherConflicts };
}

// ============= SECTION SWITCH (add generator) =============
const _origSetSection = typeof setSection !== "undefined" ? setSection : null;

// ============= GENERATOR SECTION INIT =============
// Patch setSection to handle 'generator'
const __origInitUI = typeof initUI !== "undefined" ? initUI : null;

// ============================================================
// ABSENCE REQUESTS (teacher self-report sick / personal day)
// ============================================================

async function renderAbsReq() {
  const el = document.getElementById("sectionAbsReq");
  if (!el) return;
  el.innerHTML = `<div style="padding:16px"><div class="spinner"></div> Загрузка...</div>`;
  try {
    const r = await API.absenceRequests();
    ABSENCE_REQUESTS = r.requests || [];
  } catch (e) {
    el.innerHTML = `<div style="padding:16px;color:var(--err)">Ошибка: ${escapeHtml(e.message)}</div>`;
    return;
  }
  const isHead = CURRENT_USER && CURRENT_USER.role === "head" || CURRENT_USER.role === "director";
  const kindLabel = { sick: "🤒 Больничный", personal: "📋 Личные обстоятельства", other: "📝 Другое" };
  const statusLabel = { pending: "⏳ На рассмотрении", confirmed: "✅ Подтверждено", declined: "❌ Отклонено" };

  let html = `<div class="section-header"><h2>${isHead ? "📋 Заявки на отсутствие" : "🤒 Мои заявки на отсутствие"}</h2></div>`;

  const todayStr = new Date().toISOString().slice(0, 10);

  // Form for teacher to submit their own absence
  if (!isHead) {
    html += `
    <div class="card" style="margin:16px;padding:16px;max-width:480px">
      <h3 style="margin:0 0 12px">Сообщить об отсутствии</h3>
      <div style="display:flex;flex-direction:column;gap:10px">
        <label>Дата начала <input type="date" id="absReqStart" class="input" value="${todayStr}" required></label>
        <label>Дата окончания <input type="date" id="absReqEnd" class="input" value="${todayStr}" required></label>
        <label>Причина
          <select id="absReqKind" class="input">
            <option value="sick">🤒 Больничный</option>
            <option value="personal">📋 Личные обстоятельства</option>
            <option value="other">📝 Другое</option>
          </select>
        </label>
        <label>Комментарий <input type="text" id="absReqNote" class="input" placeholder="Необязательно..."></label>
        <button class="btn" onclick="submitAbsenceRequest()">Отправить заявку</button>
        <div id="absReqMsg" style="display:none;font-size:13px"></div>
      </div>
    </div>`;
  }

  // Form for heads to register absence for any teacher
  if (isHead) {
    const myDepts = CURRENT_USER.role === "director"
      ? Object.keys(ALL_TEACHERS).length > 0 ? null : null  // all
      : (CURRENT_USER.depts && CURRENT_USER.depts.length > 0 ? CURRENT_USER.depts : [CURRENT_USER.dept]);

    // Build teacher list from ACCOUNTS (head role excluded)
    const teacherAccounts = ACCOUNTS.filter(a =>
      a.role === "teacher" && a.is_active !== false &&
      (CURRENT_USER.role === "director" || !myDepts || myDepts.includes(a.dept))
    ).sort((a, b) => (a.name || "").localeCompare(b.name || "", "ru"));

    const teacherOptions = teacherAccounts.map(t =>
      `<option value="${t.id}">${escapeHtml(t.name)}${t.dept ? ' · ' + escapeHtml(t.dept) : ''}</option>`
    ).join("");

    html += `
    <div class="card" style="margin:16px;padding:16px;max-width:560px">
      <h3 style="margin:0 0 4px">➕ Зарегистрировать отсутствие учителя</h3>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">Завуч может внести больничный напрямую — заявка сразу подтверждена.</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <label>Учитель
          <select id="absReqTeacher" class="input">
            <option value="">— выберите учителя —</option>
            ${teacherOptions}
          </select>
        </label>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <label style="flex:1;min-width:140px">Дата начала <input type="date" id="absReqStart" class="input" value="${todayStr}" required></label>
          <label style="flex:1;min-width:140px">Дата окончания <input type="date" id="absReqEnd" class="input" value="${todayStr}" required></label>
        </div>
        <label>Причина
          <select id="absReqKind" class="input">
            <option value="sick">🤒 Больничный</option>
            <option value="vacation">🏖 Отпуск</option>
            <option value="personal">📋 Личные обстоятельства</option>
            <option value="other">📝 Другое</option>
          </select>
        </label>
        <label>Комментарий <input type="text" id="absReqNote" class="input" placeholder="Необязательно..."></label>
        <button class="btn" onclick="submitAbsenceRequestForTeacher()">Зарегистрировать</button>
        <div id="absReqMsg" style="display:none;font-size:13px"></div>
      </div>
    </div>`;
  }

  // List of requests
  if (!ABSENCE_REQUESTS.length) {
    html += `<div style="padding:16px;color:var(--sub)">Заявок пока нет.</div>`;
  } else {
    html += `<div style="padding:16px;display:flex;flex-direction:column;gap:12px;max-width:640px">`;
    for (const req of ABSENCE_REQUESTS) {
      const isPending = req.status === "pending";
      const dateRange = req.start_date === req.end_date ? req.start_date : `${req.start_date} — ${req.end_date}`;
      html += `
      <div class="card" style="padding:14px;border-left:3px solid ${isPending ? "var(--accent)" : req.status === "confirmed" ? "#22c55e" : "var(--err)"}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
          <div>
            ${isHead ? `<strong>${escapeHtml(req.teacher_name)}</strong> · ` : ""}
            ${kindLabel[req.kind] || req.kind} · ${escapeHtml(dateRange)}
          </div>
          <div style="font-size:12px;color:var(--sub)">${statusLabel[req.status] || req.status}</div>
        </div>
        ${req.note ? `<div style="font-size:13px;color:var(--sub);margin-top:4px">${escapeHtml(req.note)}</div>` : ""}
        ${req.reviewer_name ? `<div style="font-size:12px;color:var(--sub);margin-top:4px">Рассмотрел: ${escapeHtml(req.reviewer_name)}</div>` : ""}
        ${isHead && isPending ? `
          <div style="display:flex;gap:8px;margin-top:10px">
            <button class="btn btn-small" style="background:#22c55e;color:#fff" onclick="reviewAbsRequest(${req.id},'confirmed')">✅ Подтвердить</button>
            <button class="btn btn-small" style="background:var(--err);color:#fff" onclick="reviewAbsRequest(${req.id},'declined')">❌ Отклонить</button>
            <button class="btn btn-small" onclick="showReplacementSuggestions(${req.teacher_id},'${req.start_date}')">🔄 Предложить замену</button>
          </div>` : ""}
      </div>`;
    }
    html += `</div>`;
  }

  el.innerHTML = html;
}

async function submitAbsenceRequest() {
  const start_date = document.getElementById("absReqStart")?.value;
  const end_date = document.getElementById("absReqEnd")?.value;
  const kind = document.getElementById("absReqKind")?.value;
  const note = document.getElementById("absReqNote")?.value;
  const msg = document.getElementById("absReqMsg");
  if (!start_date || !end_date) { if (msg) { msg.style.display = ""; msg.style.color = "var(--err)"; msg.textContent = "Укажите даты."; } return; }
  if (msg) { msg.style.display = ""; msg.style.color = "var(--accent)"; msg.textContent = "Отправляю..."; }
  try {
    await API.createAbsenceRequest({ start_date, end_date, kind, note });
    if (msg) { msg.style.color = "#22c55e"; msg.textContent = "✅ Заявка отправлена! Завуч получит уведомление."; }
    setTimeout(() => renderAbsReq(), 1500);
  } catch (e) {
    if (msg) { msg.style.color = "var(--err)"; msg.textContent = "Ошибка: " + e.message; }
  }
}

async function submitAbsenceRequestForTeacher() {
  const teacher_id = parseInt(document.getElementById("absReqTeacher")?.value);
  const start_date = document.getElementById("absReqStart")?.value;
  const end_date = document.getElementById("absReqEnd")?.value;
  const kind = document.getElementById("absReqKind")?.value;
  const note = document.getElementById("absReqNote")?.value;
  const msg = document.getElementById("absReqMsg");
  if (!teacher_id) { if (msg) { msg.style.display = ""; msg.style.color = "var(--err)"; msg.textContent = "Выберите учителя."; } return; }
  if (!start_date || !end_date) { if (msg) { msg.style.display = ""; msg.style.color = "var(--err)"; msg.textContent = "Укажите даты."; } return; }
  if (msg) { msg.style.display = ""; msg.style.color = "var(--accent)"; msg.textContent = "Сохраняю..."; }
  try {
    await API.createAbsenceRequest({ start_date, end_date, kind, note, teacher_id });
    if (msg) { msg.style.color = "#22c55e"; msg.textContent = "✅ Отсутствие зарегистрировано. Учитель получит уведомление."; }
    setTimeout(() => renderAbsReq(), 1500);
  } catch (e) {
    if (msg) { msg.style.color = "var(--err)"; msg.textContent = "Ошибка: " + e.message; }
  }
}

async function reviewAbsRequest(id, status) {
  try {
    await API.reviewAbsenceRequest(id, status);
    renderAbsReq();
  } catch (e) {
    alert("Ошибка: " + e.message);
  }
}

async function showReplacementSuggestions(teacher_id, date) {
  const modal = document.getElementById("replaceSuggestModal");
  if (!modal) {
    // Build modal if not exists
    const m = document.createElement("div");
    m.id = "replaceSuggestModal";
    m.className = "modal-overlay";
    m.innerHTML = `
      <div class="modal" style="max-width:480px">
        <button class="modal-close" onclick="document.getElementById('replaceSuggestModal').style.display='none'">✕</button>
        <h3 style="margin:0 0 14px">🔄 Доступные замены</h3>
        <div id="replaceSuggestList"><div class="spinner"></div></div>
      </div>`;
    document.body.appendChild(m);
  }
  const m2 = document.getElementById("replaceSuggestModal");
  m2.style.display = "flex";
  const listEl = document.getElementById("replaceSuggestList");
  listEl.innerHTML = `<div class="spinner"></div> Ищу доступных учителей...`;
  try {
    const r = await API.suggestReplacements(teacher_id, date);
    const avail = r.available || [];
    if (!avail.length) {
      listEl.innerHTML = `<div style="color:var(--sub)">Нет доступных учителей на эту дату.</div>`;
      return;
    }
    let html = `<div style="font-size:13px;color:var(--sub);margin-bottom:10px">Учителя, которые НЕ отсутствуют ${date}:</div>`;
    for (const t of avail) {
      const overlap = t.subject_overlap && t.subject_overlap.length > 0
        ? `<span style="background:#dcfce7;color:#166534;border-radius:4px;padding:1px 6px;font-size:11px;margin-left:6px">совпадает: ${t.subject_overlap.slice(0,3).join(", ")}</span>`
        : "";
      html += `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
          <div class="avatar ${avatarColor(t.name)} av-sm">${getInitials(t.name)}</div>
          <div style="flex:1"><strong>${escapeHtml(t.name)}</strong>${overlap}<div style="font-size:12px;color:var(--sub)">${escapeHtml(t.dept || "")}</div></div>
        </div>`;
    }
    listEl.innerHTML = html;
  } catch (e) {
    listEl.innerHTML = `<div style="color:var(--err)">Ошибка: ${escapeHtml(e.message)}</div>`;
  }
}

// ============================================================
// INTERNAL CHAT
// ============================================================

async function renderChat() {
  const el = document.getElementById("sectionChat");
  if (!el) return;
  el.innerHTML = `<div style="display:flex;height:calc(100vh - 64px);overflow:hidden">
    <div id="chatSidebar" style="width:260px;min-width:200px;border-right:1px solid var(--border);overflow-y:auto;flex-shrink:0"></div>
    <div id="chatMain" style="flex:1;display:flex;flex-direction:column;min-width:0"></div>
  </div>`;
  await loadChatRooms();
  if (CHAT_ROOMS.length > 0 && !CHAT_ACTIVE_ROOM) {
    await openChatRoom(CHAT_ROOMS[0].id);
  } else if (CHAT_ACTIVE_ROOM) {
    await openChatRoom(CHAT_ACTIVE_ROOM);
  } else {
    document.getElementById("chatMain").innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--sub)">Выберите чат слева</div>`;
  }
}

async function loadChatRooms() {
  try {
    const r = await API.chatRooms();
    CHAT_ROOMS = r.rooms || [];
  } catch (e) {
    CHAT_ROOMS = [];
  }
  renderChatSidebar();
}

function renderChatSidebar() {
  const el = document.getElementById("chatSidebar");
  if (!el) return;
  const canDM = ACCOUNTS.length > 1;
  let html = `<div style="padding:12px 14px;font-weight:600;font-size:14px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
    💬 Чат
    ${canDM ? `<button class="btn btn-small" onclick="openNewDmModal()" title="Новый личный чат">✉ Написать</button>` : ""}
  </div>`;
  for (const room of CHAT_ROOMS) {
    const isActive = room.id === CHAT_ACTIVE_ROOM;
    const name = room.kind === "dept" ? `📚 ${room.dept || room.name}` : `👤 ${(room.other_names || []).join(", ") || "Личный чат"}`;
    const unread = parseInt(room.unread_count) || 0;
    const preview = room.last_message ? escapeHtml(String(room.last_message).slice(0, 40)) : "Нет сообщений";
    html += `
    <div onclick="openChatRoom(${room.id})" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);background:${isActive ? "var(--hover)" : "transparent"};transition:background 0.15s">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <strong style="font-size:13px">${name}</strong>
        ${unread > 0 ? `<span style="background:var(--accent);color:#fff;border-radius:10px;padding:1px 7px;font-size:11px">${unread}</span>` : ""}
      </div>
      <div style="font-size:12px;color:var(--sub);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${preview}</div>
    </div>`;
  }
  if (!CHAT_ROOMS.length) {
    html += `<div style="padding:14px;font-size:13px;color:var(--sub)">Нет доступных чатов</div>`;
  }
  el.innerHTML = html;
}

async function openChatRoom(room_id) {
  CHAT_ACTIVE_ROOM = room_id;
  renderChatSidebar();
  const mainEl = document.getElementById("chatMain");
  if (!mainEl) return;
  mainEl.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%"><div class="spinner"></div></div>`;
  try {
    const r = await API.chatMessages(room_id);
    CHAT_MESSAGES = r.messages || [];
    renderChatMain(room_id);
  } catch (e) {
    mainEl.innerHTML = `<div style="padding:16px;color:var(--err)">Ошибка: ${escapeHtml(e.message)}</div>`;
  }
  // Reset unread for this room in sidebar
  const room = CHAT_ROOMS.find(r => r.id === room_id);
  if (room) room.unread_count = 0;
  renderChatSidebar();
}

function renderChatMain(room_id) {
  const mainEl = document.getElementById("chatMain");
  if (!mainEl) return;
  const room = CHAT_ROOMS.find(r => r.id === room_id);
  const roomName = room ? (room.kind === "dept" ? `📚 ${room.dept || room.name}` : `👤 ${(room.other_names || []).join(", ")}`) : "Чат";
  mainEl.innerHTML = `
    <div style="padding:12px 16px;border-bottom:1px solid var(--border);font-weight:600;font-size:15px">${roomName}</div>
    <div id="chatMessages" style="flex:1;overflow-y:auto;padding:12px 16px;display:flex;flex-direction:column;gap:8px"></div>
    <div style="padding:10px 12px;border-top:1px solid var(--border);display:flex;gap:8px">
      <input id="chatInput" class="input" placeholder="Написать сообщение..." style="flex:1" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendChatMessage();}">
      <button class="btn btn-primary" onclick="sendChatMessage()">Отправить</button>
    </div>`;
  renderChatMessages();
  // Scroll to bottom
  setTimeout(() => {
    const msgs = document.getElementById("chatMessages");
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  }, 50);
}

function renderChatMessages() {
  const el = document.getElementById("chatMessages");
  if (!el) return;
  if (!CHAT_MESSAGES.length) {
    el.innerHTML = `<div style="text-align:center;color:var(--sub);font-size:13px;padding:20px">Сообщений пока нет. Напишите первым!</div>`;
    return;
  }
  let html = "";
  let lastDate = null;
  for (const msg of CHAT_MESSAGES) {
    const isMine = msg.sender_id === CURRENT_USER?.id;
    const d = new Date(msg.sent_at);
    const dateStr = d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
    if (dateStr !== lastDate) {
      html += `<div style="text-align:center;font-size:11px;color:var(--sub);padding:4px 0">${dateStr}</div>`;
      lastDate = dateStr;
    }
    const timeStr = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    html += `
    <div style="display:flex;flex-direction:column;align-items:${isMine ? "flex-end" : "flex-start"}">
      ${!isMine ? `<div style="font-size:11px;color:var(--sub);margin-bottom:2px;padding-left:4px">${escapeHtml(msg.sender_name)}</div>` : ""}
      <div style="max-width:70%;background:${isMine ? "var(--accent)" : "var(--card)"};color:${isMine ? "#fff" : "var(--fg)"};border-radius:12px;padding:8px 12px;font-size:14px;word-break:break-word;border:1px solid var(--border)">
        ${escapeHtml(msg.body)}
        <div style="font-size:10px;color:${isMine ? "rgba(255,255,255,0.7)" : "var(--sub)"};text-align:right;margin-top:2px">${timeStr}</div>
      </div>
    </div>`;
  }
  el.innerHTML = html;
}

async function sendChatMessage() {
  const input = document.getElementById("chatInput");
  if (!input || !CHAT_ACTIVE_ROOM) return;
  const body = input.value.trim();
  if (!body) return;
  input.value = "";
  input.disabled = true;
  try {
    const r = await API.chatSend(CHAT_ACTIVE_ROOM, body);
    CHAT_MESSAGES.push(r.message);
    renderChatMessages();
    // Scroll to bottom
    const msgs = document.getElementById("chatMessages");
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  } catch (e) {
    input.value = body; // restore on error
    alert("Ошибка отправки: " + e.message);
  } finally {
    input.disabled = false;
    input.focus();
  }
}

// Poll for new messages every 15 seconds when chat is visible
async function pollChatMessages() {
  if (state.section !== "chat" || !CHAT_ACTIVE_ROOM) return;
  try {
    const r = await API.chatMessages(CHAT_ACTIVE_ROOM);
    const newMsgs = r.messages || [];
    if (newMsgs.length !== CHAT_MESSAGES.length || (newMsgs.length && newMsgs[newMsgs.length-1].id !== CHAT_MESSAGES[CHAT_MESSAGES.length-1]?.id)) {
      CHAT_MESSAGES = newMsgs;
      renderChatMessages();
      const msgs = document.getElementById("chatMessages");
      if (msgs) msgs.scrollTop = msgs.scrollHeight;
    }
  } catch (e) { /* ignore poll errors */ }
}

function startChatUnreadPoll() {
  if (CHAT_POLL_INTERVAL) clearInterval(CHAT_POLL_INTERVAL);
  CHAT_POLL_INTERVAL = setInterval(async () => {
    if (state.section === "chat") {
      await pollChatMessages();
      await loadChatRooms();
    }
    // Always update unread badge
    try {
      const r = await API.chatUnread();
      const prev = CHAT_UNREAD;
      CHAT_UNREAD = r.unread || 0;
      if (prev !== CHAT_UNREAD) updateChatBadge();
    } catch (e) { /* ignore */ }
  }, 15000);
}

function updateChatBadge() {
  const badge = document.getElementById("chatUnreadBadge");
  if (!badge) return;
  if (CHAT_UNREAD > 0) {
    badge.textContent = CHAT_UNREAD > 99 ? "99+" : CHAT_UNREAD;
    badge.style.display = "";
  } else {
    badge.style.display = "none";
  }
}

async function openNewDmModal() {
  // Show modal to pick a user to DM
  const others = ACCOUNTS.filter(a => a.id !== CURRENT_USER?.id);
  let html = `<div class="modal-overlay" id="dmPickModal" style="display:flex">
    <div class="modal" style="max-width:380px">
      <button class="modal-close" onclick="document.getElementById('dmPickModal').remove()">✕</button>
      <h3 style="margin:0 0 14px">💬 Написать сообщение</h3>
      <div style="display:flex;flex-direction:column;gap:6px">`;
  for (const u of others) {
    html += `
      <div onclick="startDmWith(${u.id})" style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;cursor:pointer;border:1px solid var(--border)" onmouseover="this.style.background='var(--hover)'" onmouseout="this.style.background='transparent'">
        <div class="avatar ${avatarColor(u.name)} av-sm">${getInitials(u.name)}</div>
        <div><strong style="font-size:13px">${escapeHtml(u.name)}</strong><div style="font-size:11px;color:var(--sub)">${escapeHtml(u.title || u.role)}</div></div>
      </div>`;
  }
  html += `</div></div></div>`;
  const existing = document.getElementById("dmPickModal");
  if (existing) existing.remove();
  document.body.insertAdjacentHTML("beforeend", html);
}

async function startDmWith(userId) {
  const modal = document.getElementById("dmPickModal");
  if (modal) modal.remove();
  try {
    const r = await API.chatCreatePrivate(userId);
    // Reload rooms then open this room
    await loadChatRooms();
    setSection("chat");
    await openChatRoom(r.room_id);
  } catch (e) {
    alert("Ошибка: " + e.message);
  }
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

// ============================================================
// 9. DARK / LIGHT THEME
// ============================================================
(function() {
  const saved = (() => { try { return localStorage.getItem("ip_theme"); } catch(e){return null;} })();
  if (saved === "dark") document.documentElement.setAttribute("data-theme", "dark");
})();

function toggleTheme() {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const next = isDark ? "light" : "dark";
  if (next === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  try { localStorage.setItem("ip_theme", next); } catch(e){}
  _updateThemeBtn();
}

function _updateThemeBtn() {
  const btn = document.getElementById("themeToggleBtn");
  if (!btn) return;
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  btn.textContent = isDark ? "☀️" : "🌙";
  btn.title = isDark ? "Светлая тема" : "Тёмная тема";
}

// Call on page load after DOM ready
document.addEventListener("DOMContentLoaded", _updateThemeBtn);
setTimeout(_updateThemeBtn, 100);

// ============================================================
// 10. SCHEDULE SEARCH
// ============================================================
let _searchTimer = null;

function scheduleSearchInput(val) {
  clearTimeout(_searchTimer);
  if (!val.trim()) { closeSearch(); return; }
  _searchTimer = setTimeout(() => runScheduleSearch(val.trim()), 220);
}

function closeSearch() {
  const panel = document.getElementById("searchResultsPanel");
  if (panel) panel.classList.remove("show");
  const inp = document.getElementById("scheduleSearch");
  if (inp) inp.value = "";
}

function runScheduleSearch(query) {
  const panel = document.getElementById("searchResultsPanel");
  const list  = document.getElementById("searchResultsList");
  const cnt   = document.getElementById("searchResultsCount");
  if (!panel || !list) return;

  const q = query.toLowerCase();
  const results = [];

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
            const subj    = (it.subject || "").toLowerCase();
            const teacher = (it.teacher || "").toLowerCase();
            const room    = (it.room || info.room || "").toLowerCase();
            const clsLow  = cls.toLowerCase();
            const deptLow = dept.toLowerCase();
            if (subj.includes(q) || teacher.includes(q) || room.includes(q) || clsLow.includes(q) || deptLow.includes(q)) {
              results.push({ dept, day, time: ld.time, lesson_no: ld.lesson_no, cls, subject: it.subject || "", teacher: it.teacher || "", room: it.room || info.room || "" });
              if (results.length >= 80) break;
            }
          }
          if (results.length >= 80) break;
        }
        if (results.length >= 80) break;
      }
      if (results.length >= 80) break;
    }
    if (results.length >= 80) break;
  }

  if (results.length === 0) {
    list.innerHTML = `<div class="srp-empty">Ничего не найдено по запросу «${escapeHtml(query)}»</div>`;
  } else {
    function hl(s) {
      if (!s) return "—";
      const idx = s.toLowerCase().indexOf(q);
      if (idx < 0) return escapeHtml(s);
      return escapeHtml(s.slice(0, idx)) + `<mark class="search-hl">${escapeHtml(s.slice(idx, idx+q.length))}</mark>` + escapeHtml(s.slice(idx+q.length));
    }
    list.innerHTML = results.map(r => `
      <div class="srp-item" onclick="searchGoTo(${JSON.stringify(r.dept)},${JSON.stringify(r.day)})">
        <div class="srp-main">${hl(r.subject)} · ${hl(r.cls)} кл</div>
        <div class="srp-sub">${hl(r.dept)} · ${r.day} · ${escapeHtml(r.time||'')} · учитель: ${hl(r.teacher)}${r.room ? ' · каб ' + hl(r.room) : ''}</div>
      </div>`).join("");
  }
  cnt.textContent = results.length >= 80 ? "Показаны первые 80 результатов" : `Найдено: ${results.length}`;
  panel.classList.add("show");

  // Close on outside click
  setTimeout(() => {
    const handler = (e) => {
      if (!panel.contains(e.target) && e.target.id !== "scheduleSearch") {
        panel.classList.remove("show");
        document.removeEventListener("click", handler);
      }
    };
    document.addEventListener("click", handler);
  }, 10);
}

function searchGoTo(dept, day) {
  closeSearch();
  // Switch to schedule section and navigate to that dept+day
  setSection("schedule");
  setDept(dept);
  const dayBtns = document.querySelectorAll(".day-tab");
  dayBtns.forEach(b => { if (b.dataset.day === day) b.click(); });
}

// ============================================================
// 11. SUBJECT COLOR CODING
// ============================================================
const SUBJECT_COLORS = {
  // Математика
  "математика":        "#3B82F6",
  "алгебра":           "#3B82F6",
  "геометрия":         "#6366F1",
  "информатика":       "#8B5CF6",
  // Русский / Литература
  "русский язык":      "#EF4444",
  "русский":           "#EF4444",
  "литература":        "#F97316",
  // Иностранные
  "английский язык":   "#10B981",
  "английский":        "#10B981",
  "немецкий язык":     "#059669",
  "французский язык":  "#34D399",
  // Естественные
  "физика":            "#F59E0B",
  "химия":             "#EAB308",
  "биология":          "#84CC16",
  "география":         "#22C55E",
  "экология":          "#16A34A",
  // Общественные
  "история":           "#EC4899",
  "обществознание":    "#DB2777",
  "право":             "#BE185D",
  // Физкультура / ОБЖ
  "физическая культура": "#14B8A6",
  "физкультура":         "#14B8A6",
  "обж":                 "#0EA5E9",
  // Искусство
  "музыка":            "#A855F7",
  "изо":               "#D946EF",
  "мхк":               "#C026D3",
  // Прочее
  "технология":        "#78716C",
  "труд":              "#78716C",
  "классный час":      "#94A3B8",
};

function getSubjectColor(subject) {
  if (!subject) return null;
  const key = subject.toLowerCase().trim();
  if (SUBJECT_COLORS[key]) return SUBJECT_COLORS[key];
  // Partial match
  for (const [k, v] of Object.entries(SUBJECT_COLORS)) {
    if (key.includes(k) || k.includes(key.split(" ")[0])) return v;
  }
  return null;
}

function subjectDot(subject) {
  const color = getSubjectColor(subject);
  if (!color) return "";
  return `<span class="subj-color-dot" style="background:${color};"></span>`;
}

// Patch renderCellContent to include color dot — override after definition
const _origRenderCellContent = typeof renderCellContent !== "undefined" ? renderCellContent : null;
// We'll apply it in a post-boot hook
function _patchCellColors() {
  // Cells are rendered via renderCellContent — patch it
  if (typeof renderCellContent === "function") {
    const orig = renderCellContent;
    window.renderCellContent = function(dept, day, lkey, cls) {
      const html = orig(dept, day, lkey, cls);
      // Inject color dot after first cell-subject span
      return html.replace(/<span class="cell-subject">(.*?)<\/span>/,
        (m, subj) => {
          const plain = subj.replace(/<[^>]+>/g,'');
          const dot = subjectDot(plain);
          return `<span class="cell-subject">${dot}${subj}</span>`;
        });
    };
  }
}

// ============================================================
// 12. EXPORT SCHEDULE TO PDF
// ============================================================
function exportSchedulePDF() {
  const dept = state.dept;
  const dayLabel = state.day;
  const view = state.view;

  // Build a self-contained print window
  const win = window.open("", "_blank", "width=1100,height=800");
  if (!win) { alert("Разрешите всплывающие окна для экспорта PDF"); return; }

  const days = view === "week" ? DAYS : [dayLabel];
  if (!DATA[dept]) { win.close(); return; }
  const sched = DATA[dept].schedule;
  const times = [];
  // Collect unique lesson keys in order
  for (const day of days) {
    if (!sched[day]) continue;
    for (const lkey in sched[day]) {
      const ld = sched[day][lkey];
      if (!times.find(t => t.lkey === lkey)) {
        times.push({ lkey, time: ld.time, lesson_no: ld.lesson_no });
      }
    }
  }
  times.sort((a,b) => (a.lesson_no||0)-(b.lesson_no||0));

  // Collect classes
  const classes = new Set();
  for (const day of days) {
    if (!sched[day]) continue;
    for (const lkey in sched[day]) {
      for (const cls in sched[day][lkey].classes) classes.add(cls);
    }
  }
  const sortedCls = [...classes].sort((a,b) => parseInt(a)-parseInt(b)||a.localeCompare(b,"ru"));

  function cellHtml(day, lkey, cls) {
    const ld = sched[day] && sched[day][lkey];
    if (!ld) return '';
    const info = ld.classes[cls];
    if (!info) return '';
    const items = info.groups ? info.groups : [info];
    return items.map(it => {
      const color = getSubjectColor(it.subject || "");
      const dot = color ? `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${color};margin-right:3px;vertical-align:middle;"></span>` : '';
      return `<div style="font-size:10px;line-height:1.4;">
        <div style="font-weight:600;">${dot}${escapeHtml(it.subject||'')}</div>
        <div style="color:#555;font-size:9px;">${escapeHtml(it.teacher||'')}${it.room||info.room ? ' · ' + escapeHtml(it.room||info.room) : ''}</div>
      </div>`;
    }).join('<hr style="border:none;border-top:1px solid #eee;margin:2px 0;">');
  }

  let tableHtml = '';
  if (view === "week") {
    // Rows = time slots, columns = days, rows repeated per class group is complex
    // Simpler: one table per class
    for (const cls of sortedCls) {
      tableHtml += `<h3 style="margin:16px 0 6px;font-size:13px;">${escapeHtml(cls)} класс</h3>
      <table style="width:100%;border-collapse:collapse;font-size:10px;margin-bottom:12px;">
        <thead><tr style="background:#f3f4f6;">
          <th style="border:1px solid #ddd;padding:4px 6px;width:80px;">Урок</th>
          ${DAYS.map(d => `<th style="border:1px solid #ddd;padding:4px 6px;">${escapeHtml(d)}</th>`).join('')}
        </tr></thead>
        <tbody>
        ${times.map(t => `<tr>
          <td style="border:1px solid #ddd;padding:4px 6px;color:#666;font-size:9px;white-space:nowrap;">${t.lesson_no||''} · ${escapeHtml(t.time||'')}</td>
          ${DAYS.map(d => `<td style="border:1px solid #ddd;padding:4px 6px;vertical-align:top;">${cellHtml(d,t.lkey,cls)}</td>`).join('')}
        </tr>`).join('')}
        </tbody>
      </table>`;
    }
  } else {
    // Day view: rows = time, cols = classes
    tableHtml = `<table style="width:100%;border-collapse:collapse;font-size:10px;">
      <thead><tr style="background:#f3f4f6;">
        <th style="border:1px solid #ddd;padding:4px 6px;width:80px;">Время</th>
        ${sortedCls.map(c => `<th style="border:1px solid #ddd;padding:4px 6px;">${escapeHtml(c)}</th>`).join('')}
      </tr></thead>
      <tbody>
      ${times.map(t => `<tr>
        <td style="border:1px solid #ddd;padding:4px 6px;color:#666;font-size:9px;white-space:nowrap;background:#fafafa;">${escapeHtml(t.time||'')}</td>
        ${sortedCls.map(cls => `<td style="border:1px solid #ddd;padding:4px 6px;vertical-align:top;">${cellHtml(dayLabel,t.lkey,cls)}</td>`).join('')}
      </tr>`).join('')}
      </tbody>
    </table>`;
  }

  const title = `Расписание · ${escapeHtml(dept)} · ${view === 'week' ? 'Вся неделя' : escapeHtml(dayLabel)}`;
  win.document.write(`<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; color: #111; }
  h1 { font-size: 16px; margin-bottom: 4px; }
  .sub { font-size: 11px; color: #666; margin-bottom: 16px; }
  @media print {
    @page { size: A4 landscape; margin: 10mm; }
    button { display: none; }
  }
</style>
</head><body>
  <h1>${title}</h1>
  <div class="sub">Сформировано: ${new Date().toLocaleDateString('ru-RU', {day:'2-digit',month:'long',year:'numeric'})}</div>
  <button onclick="window.print()" style="margin-bottom:14px;padding:6px 14px;cursor:pointer;background:#4f46e5;color:#fff;border:none;border-radius:6px;font-size:12px;">🖨 Печать / Сохранить PDF</button>
  ${tableHtml}
</body></html>`);
  win.document.close();
}

// ============================================================
// STATISTICS SECTION
// ============================================================

async function renderStats_section() {
  const root = document.getElementById("sectionStats");
  if (!root) return;

  // All departments available school-wide
  const allDeptOpts = DEPTS.map(d => `<option value="${d}">${d}</option>`).join("");

  root.innerHTML = `
    <div class="today-greeting">
      <h2>📊 Аналитика</h2>
      <div class="day-of-week">Статистика по всей школе</div>
    </div>

    <div id="statsSummaryTiles"></div>

    <div style="display:flex;gap:10px;flex-wrap:wrap;margin:18px 0 14px;align-items:flex-end;">
      <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:500;">Отделение
        <select id="statsDepFilter" onchange="loadStatsData()" style="padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:var(--card-bg,var(--card));color:var(--text);font-size:13px;min-width:140px;">
          <option value="">Все отделения</option>${allDeptOpts}
        </select>
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:500;">С даты
        <input type="date" id="statsFrom" style="padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:var(--card-bg,var(--card));color:var(--text);font-size:13px;">
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:500;">По дату
        <input type="date" id="statsTo" style="padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:var(--card-bg,var(--card));color:var(--text);font-size:13px;">
      </label>
      <button class="btn" onclick="loadStatsData()">Применить</button>
      <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-secondary" onclick="downloadWorkloadXlsx()">📥 Нагрузка</button>
        <button class="btn btn-secondary" onclick="downloadReplacementsXlsx()">📥 Замены</button>
        <button class="btn btn-secondary" onclick="loadRoomConflicts()">🏫 Кабинеты</button>
      </div>
    </div>

    <div id="statsContent">
      <div id="statsDeptCards"></div>
      <div id="statsWorkload" style="margin-top:20px;"></div>
      <div id="statsReplacements" style="margin-top:24px;"></div>
      <div id="statsRoomConflicts" style="margin-top:24px;"></div>
    </div>`;

  renderStatsSummaryTiles();
  loadStatsData();
}

function renderStatsSummaryTiles() {
  const root = document.getElementById("statsSummaryTiles");
  if (!root) return;
  // Compute from local schedule data (fast, no API)
  const uniqueTeachers = new Set();
  let totalLessons = 0;
  const deptLessons = {};
  const deptTeachers = {};
  for (const dept of DEPTS) {
    if (!DATA[dept]) continue;
    const sched = DATA[dept].schedule;
    const tset = new Set();
    let deptCount = 0;
    for (const day in sched) {
      for (const lkey in sched[day]) {
        for (const cls in sched[day][lkey].classes) {
          const info = sched[day][lkey].classes[cls];
          const items = info.groups ? info.groups : [info];
          for (const it of items) {
            if (it.teacher) { uniqueTeachers.add(it.teacher); tset.add(it.teacher); }
          }
          deptCount++;
        }
      }
    }
    deptLessons[dept] = deptCount;
    deptTeachers[dept] = tset.size;
    totalLessons += deptCount;
  }
  const totalReplacements = ALL_REPLACEMENTS.length;
  const openConflicts = CONFLICTS.length;

  root.innerHTML = `<div class="stats-row" style="margin-top:16px;">
    <div class="stat-card cyan"><div class="label">👩‍🏫 Учителей в школе</div><div class="value">${uniqueTeachers.size}</div></div>
    <div class="stat-card magenta"><div class="label">📚 Уроков в неделю</div><div class="value">${totalLessons}</div></div>
    <div class="stat-card"><div class="label">🔄 Замен всего</div><div class="value">${totalReplacements}</div></div>
    <div class="stat-card ${openConflicts > 0 ? 'red' : ''}"><div class="label">⚠️ Конфликтов</div><div class="value">${openConflicts}</div></div>
  </div>
  <div id="statsDeptMiniCards" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;">
    ${DEPTS.map(d => {
      if (!DATA[d]) return '';
      const lessons = deptLessons[d] || 0;
      const teachers = deptTeachers[d] || 0;
      return `<div style="flex:1;min-width:130px;background:var(--card-bg,var(--card));border:1px solid var(--border);border-radius:12px;padding:12px 14px;cursor:pointer;" onclick="document.getElementById('statsDepFilter').value='${escapeHtml(d)}';loadStatsData()">
        <div style="font-weight:700;font-size:13px;margin-bottom:6px;">${escapeHtml(d)}</div>
        <div style="font-size:12px;color:var(--text-muted);">${teachers} учителей</div>
        <div style="font-size:12px;color:var(--text-muted);">${lessons} уроков/нед</div>
      </div>`;
    }).join("")}
  </div>`;
}

async function loadStatsData() {
  const dept = document.getElementById("statsDepFilter")?.value || "";
  const from = document.getElementById("statsFrom")?.value || "";
  const to = document.getElementById("statsTo")?.value || "";
  const qs = new URLSearchParams();
  if (dept) qs.set("dept", dept);
  if (from) qs.set("from_date", from);
  if (to) qs.set("to_date", to);

  // Load workload + replacements in parallel
  const [wl, repl] = await Promise.all([
    apiFetch(`/api/stats/workload?${qs.toString()}`),
    apiFetch(`/api/stats/replacements?${qs.toString()}&group_by=teacher`),
  ]);

  renderWorkloadTable(wl?.workload || []);
  renderReplacementsTable(repl?.rows || []);
}

function renderWorkloadTable(workload) {
  const root = document.getElementById("statsWorkload");
  if (!root) return;
  if (!workload.length) { root.innerHTML = `<p style="color:#888;font-size:13px;">Данных о нагрузке нет</p>`; return; }

  const sorted = workload.slice().sort((a, b) => b.lessons_per_week - a.lessons_per_week);
  const maxLessons = sorted[0]?.lessons_per_week || 1;
  const shown = sorted.slice(0, 60);

  const rows = shown.map((t, i) => {
    const barPct = Math.round((t.lessons_per_week / maxLessons) * 100);
    const loadColor = t.lessons_per_week >= maxLessons * 0.8 ? '#ef4444'
      : t.lessons_per_week >= maxLessons * 0.5 ? 'var(--ip-blue)'
      : '#94a3b8';
    return `<tr style="${i % 2 === 0 ? '' : 'background:var(--surface2,rgba(0,0,0,.02));'}">
      <td style="padding:8px 10px;font-weight:500;">${escapeHtml(t.name)}</td>
      <td style="padding:8px 10px;min-width:120px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden;">
            <div style="width:${barPct}%;height:100%;background:${loadColor};border-radius:3px;transition:width .3s;"></div>
          </div>
          <span style="font-weight:700;font-size:13px;color:${loadColor};min-width:24px;text-align:right;">${t.lessons_per_week}</span>
        </div>
      </td>
      <td style="padding:8px 10px;font-size:12px;color:var(--text-muted);">${t.subjects.slice(0,3).join(", ")}${t.subjects.length > 3 ? "…" : ""}</td>
      <td style="padding:8px 10px;font-size:12px;color:var(--text-muted);">${t.classes.slice(0,5).join(", ")}${t.classes.length > 5 ? "…" : ""}</td>
      <td style="padding:8px 10px;font-size:12px;color:var(--text-muted);">${t.depts.join(", ")}</td>
    </tr>`;
  }).join("");

  root.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
      <h3 style="font-size:1rem;margin:0;">📋 Нагрузка учителей</h3>
      <span style="font-size:12px;color:var(--text-muted);background:var(--surface2,#f3f4f6);padding:2px 8px;border-radius:10px;">${workload.length} учителей · сортировка по убыванию</span>
    </div>
    <div style="border:1px solid var(--border);border-radius:12px;overflow:hidden;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:var(--surface2,#f3f4f6);">
            <th style="padding:8px 10px;text-align:left;border-bottom:1px solid var(--border);">Учитель</th>
            <th style="padding:8px 10px;text-align:left;border-bottom:1px solid var(--border);min-width:160px;">Нагрузка (ур/нед)</th>
            <th style="padding:8px 10px;text-align:left;border-bottom:1px solid var(--border);">Предметы</th>
            <th style="padding:8px 10px;text-align:left;border-bottom:1px solid var(--border);">Классы</th>
            <th style="padding:8px 10px;text-align:left;border-bottom:1px solid var(--border);">Отделения</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${workload.length > 60 ? `<p style="font-size:12px;color:#888;margin-top:6px;">Показано 60 из ${workload.length}. Скачайте Excel для полного списка.</p>` : ""}`;
}

function renderReplacementsTable(rows) {
  const root = document.getElementById("statsReplacements");
  if (!root) return;
  if (!rows.length) { root.innerHTML = `<p style="color:#888;font-size:13px;">Замен за выбранный период нет</p>`; return; }

  const sorted = rows.slice().sort((a, b) => (b.absent_count + b.replacement_count) - (a.absent_count + a.replacement_count));
  const maxAbsent = Math.max(...sorted.map(r => r.absent_count), 1);
  const maxRep = Math.max(...sorted.map(r => r.replacement_count), 1);

  const tableRows = sorted.slice(0, 50).map((r, i) => {
    const absPct = Math.round((r.absent_count / maxAbsent) * 100);
    const repPct = Math.round((r.replacement_count / maxRep) * 100);
    return `<tr style="${i % 2 === 0 ? '' : 'background:var(--surface2,rgba(0,0,0,.02));'}">
      <td style="padding:8px 10px;font-weight:500;">${escapeHtml(r.teacher_name)}</td>
      <td style="padding:8px 10px;min-width:120px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden;">
            <div style="width:${absPct}%;height:100%;background:#ef4444;border-radius:3px;"></div>
          </div>
          <span style="font-weight:700;color:#ef4444;min-width:20px;text-align:right;font-size:13px;">${r.absent_count}</span>
        </div>
      </td>
      <td style="padding:8px 10px;min-width:120px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden;">
            <div style="width:${repPct}%;height:100%;background:#10b981;border-radius:3px;"></div>
          </div>
          <span style="font-weight:700;color:#10b981;min-width:20px;text-align:right;font-size:13px;">${r.replacement_count}</span>
        </div>
      </td>
    </tr>`;
  }).join("");

  root.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
      <h3 style="font-size:1rem;margin:0;">🔄 Замены по учителям</h3>
      <span style="font-size:12px;color:var(--text-muted);background:var(--surface2,#f3f4f6);padding:2px 8px;border-radius:10px;">сортировка по активности</span>
    </div>
    <div style="border:1px solid var(--border);border-radius:12px;overflow:hidden;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:var(--surface2,#f3f4f6);">
            <th style="padding:8px 10px;text-align:left;border-bottom:1px solid var(--border);">Учитель</th>
            <th style="padding:8px 10px;text-align:left;border-bottom:1px solid var(--border);">Отсутствовал 🔴</th>
            <th style="padding:8px 10px;text-align:left;border-bottom:1px solid var(--border);">Заменял 🟢</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>`;
}

async function loadRoomConflicts() {
  const dept = document.getElementById("statsDepFilter")?.value || "";
  const qs = new URLSearchParams();
  if (dept) qs.set("dept", dept);
  const root = document.getElementById("statsRoomConflicts");
  if (!root) return;
  root.innerHTML = `<p style="color:#888;font-size:13px;">Проверяю конфликты кабинетов…</p>`;

  const data = await apiFetch(`/api/schedule/room-conflicts?${qs.toString()}`);
  if (!data) { root.innerHTML = `<p style="color:#ef4444;">Ошибка загрузки</p>`; return; }

  if (!data.conflicts.length) {
    root.innerHTML = `<div style="padding:12px;background:rgba(34,197,94,.1);border-radius:8px;color:#166534;font-size:13px;">✅ Конфликтов кабинетов не обнаружено</div>`;
    return;
  }

  const rows = data.conflicts.map(c => {
    const slotList = c.slots.map(s => `${s.dept} ${s.cls} кл — ${escapeHtml(s.subject||"—")} (${escapeHtml(s.teacher||"—")})`).join("<br>");
    return `<tr>
      <td style="padding:8px 10px;">${escapeHtml(c.day)}</td>
      <td style="padding:8px 10px;text-align:center;">Урок ${c.lesson_no}</td>
      <td style="padding:8px 10px;font-weight:600;">Каб. ${escapeHtml(c.room)}</td>
      <td style="padding:8px 10px;font-size:12px;color:#666;">${slotList}</td>
    </tr>`;
  }).join("");

  root.innerHTML = `
    <h3 style="font-size:1rem;margin:0 0 10px;color:#ef4444;">🏫 Конфликты кабинетов (${data.total})</h3>
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:rgba(239,68,68,.08);">
            <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #fca5a5;">День</th>
            <th style="padding:8px 10px;text-align:center;border-bottom:2px solid #fca5a5;">Урок</th>
            <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #fca5a5;">Кабинет</th>
            <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #fca5a5;">Пересечения</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function downloadWorkloadXlsx() {
  const dept = document.getElementById("statsDepFilter")?.value || "";
  const qs = new URLSearchParams();
  if (dept) qs.set("dept", dept);
  const token = localStorage.getItem("ip_token") || "";
  // Use fetch + blob download
  fetch(`/api/stats/workload/xlsx?${qs.toString()}`, { headers: { Authorization: "Bearer " + token } })
    .then(r => r.blob())
    .then(blob => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `workload-${new Date().toISOString().slice(0,10)}.xlsx`;
      a.click();
    });
}

function downloadReplacementsXlsx() {
  const dept = document.getElementById("statsDepFilter")?.value || "";
  const from = document.getElementById("statsFrom")?.value || "";
  const to = document.getElementById("statsTo")?.value || "";
  const qs = new URLSearchParams();
  if (dept) qs.set("dept", dept);
  if (from) qs.set("from_date", from);
  if (to) qs.set("to_date", to);
  const token = localStorage.getItem("ip_token") || "";
  fetch(`/api/stats/replacements/xlsx?${qs.toString()}`, { headers: { Authorization: "Bearer " + token } })
    .then(r => r.blob())
    .then(blob => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `replacements-${new Date().toISOString().slice(0,10)}.xlsx`;
      a.click();
    });
}

// ============================================================
// TEACHER AVAILABILITY UI
// ============================================================

const AVAIL_DAYS = ["Понедельник","Вторник","Среда","Четверг","Пятница"];
const AVAIL_LESSONS = [
  {no:1, time:"8:10–8:55"}, {no:2, time:"9:05–9:50"}, {no:3, time:"10:05–10:50"},
  {no:4, time:"11:00–11:45"}, {no:5, time:"12:10–12:55"}, {no:6, time:"13:05–13:50"},
  {no:7, time:"14:00–14:45"}, {no:8, time:"15:00–15:45"}, {no:9, time:"16:00–16:45"},
];

let _availData = {}; // key "day|no" -> {available, note}
let _availTeacherId = null;
let _availDept = null;

async function renderAvailability() {
  const root = document.getElementById("sectionAvailability");
  if (!root) return;

  const isHead = CURRENT_USER && CURRENT_USER.role === "head" || CURRENT_USER.role === "director";
  const teachersList = isHead ? Object.keys(ALL_TEACHERS || {}) : null;

  // Default: own availability
  _availTeacherId = CURRENT_USER.id;
  _availDept = CURRENT_USER.dept || (CURRENT_USER.depts && CURRENT_USER.depts[0]) || null;

  let teacherSelector = "";
  if (isHead && teachersList && teachersList.length > 0) {
    const opts = teachersList.sort().map(n => `<option value="${n}">${n}</option>`).join("");
    teacherSelector = `
      <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;">Учитель
        <select id="availTeacherSel" onchange="loadAvailForTeacher(this.value)" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--text);font-size:13px;">
          ${opts}
        </select>
      </label>`;
  }

  root.innerHTML = `
    <div style="padding:16px;">
      <h2 style="margin:0 0 4px;font-size:1.2rem;">🗓 Когда я свободна для замены</h2>
      <p style="margin:0 0 16px;color:#888;font-size:13px;">Отметьте уроки, на которые вы <strong>готовы выйти</strong> вместо коллеги. 🟢 — могу, 🔴 — не могу.</p>

      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;align-items:flex-end;">
        ${teacherSelector}
        <button class="btn" onclick="saveAvailability()">💾 Сохранить</button>
      </div>

      <div id="availGrid" style="overflow-x:auto;"></div>
      <p id="availSaveMsg" style="display:none;color:#22c55e;font-size:13px;margin-top:8px;">✅ Сохранено!</p>
    </div>`;

  await loadAvailData(_availTeacherId, _availDept);
  renderAvailGrid();
}

async function loadAvailForTeacher(name) {
  // Find teacher id by name
  const u = Object.values(ALL_TEACHERS || {}).find ? null : null;
  // Use accounts list
  const accounts = await apiFetch("/api/accounts");
  const teacher = (accounts?.accounts || []).find(a => a.name === name);
  if (teacher) {
    _availTeacherId = teacher.id;
    _availDept = teacher.dept || (teacher.depts && teacher.depts[0]) || null;
    await loadAvailData(_availTeacherId, _availDept);
    renderAvailGrid();
  }
}

async function loadAvailData(teacherId, dept) {
  const qs = new URLSearchParams({ teacher_id: teacherId });
  if (dept) qs.set("dept", dept);
  const data = await apiFetch(`/api/availability?${qs.toString()}`);
  _availData = {};
  for (const slot of (data?.availability || [])) {
    _availData[`${slot.day_of_week}|${slot.lesson_no}`] = { available: slot.available, note: slot.note || "" };
  }
}

function renderAvailGrid() {
  const grid = document.getElementById("availGrid");
  if (!grid) return;

  let html = `<table style="border-collapse:collapse;font-size:13px;min-width:500px;">
    <thead>
      <tr>
        <th style="padding:8px 10px;border:1px solid var(--border);background:var(--surface2,#f3f4f6);white-space:nowrap;">Урок / Время</th>
        ${AVAIL_DAYS.map(d => `<th style="padding:8px 10px;border:1px solid var(--border);background:var(--surface2,#f3f4f6);">${d}</th>`).join("")}
      </tr>
    </thead>
    <tbody>`;

  for (const lesson of AVAIL_LESSONS) {
    html += `<tr>
      <td style="padding:6px 10px;border:1px solid var(--border);white-space:nowrap;font-size:12px;color:#666;background:var(--surface2,#f3f4f6);">
        <strong>${lesson.no}</strong> <span style="font-size:11px;">${lesson.time}</span>
      </td>`;
    for (const day of AVAIL_DAYS) {
      const key = `${day}|${lesson.no}`;
      const slot = _availData[key];
      // Default: available = true (not marked unavailable)
      const isUnavailable = slot && slot.available === false;
      const bg = isUnavailable ? "rgba(239,68,68,.12)" : "rgba(34,197,94,.08)";
      const icon = isUnavailable ? "🔴" : "🟢";
      html += `<td style="padding:4px;border:1px solid var(--border);text-align:center;cursor:pointer;background:${bg};"
               onclick="toggleAvailSlot('${day}',${lesson.no})" id="avail-${day.replace(/\s/g,'_')}-${lesson.no}">
               <span style="font-size:18px;">${icon}</span></td>`;
    }
    html += `</tr>`;
  }
  html += `</tbody></table>`;
  grid.innerHTML = html;
}

function toggleAvailSlot(day, lessonNo) {
  const key = `${day}|${lessonNo}`;
  const cur = _availData[key];
  // Toggle: if currently available (or unset) -> mark unavailable; if unavailable -> mark available
  const wasUnavailable = cur && cur.available === false;
  _availData[key] = { available: wasUnavailable, note: cur?.note || "" };

  // Update cell visually
  const cell = document.getElementById(`avail-${day.replace(/\s/g,'_')}-${lessonNo}`);
  if (cell) {
    const nowUnavailable = !wasUnavailable;
    cell.style.background = nowUnavailable ? "rgba(239,68,68,.12)" : "rgba(34,197,94,.08)";
    cell.innerHTML = `<span style="font-size:18px;">${nowUnavailable ? "🔴" : "🟢"}</span>`;
  }
}

async function saveAvailability() {
  const slots = [];
  for (const day of AVAIL_DAYS) {
    for (const lesson of AVAIL_LESSONS) {
      const key = `${day}|${lesson.no}`;
      const slot = _availData[key];
      slots.push({
        day_of_week: day,
        lesson_no: lesson.no,
        available: slot ? (slot.available !== false) : true,
        note: slot?.note || null,
      });
    }
  }

  const body = { teacher_id: _availTeacherId, dept: _availDept, slots };
  const r = await apiFetch("/api/availability", { method: "POST", body: JSON.stringify(body) });
  const msg = document.getElementById("availSaveMsg");
  if (msg) {
    msg.style.display = "";
    setTimeout(() => { msg.style.display = "none"; }, 2500);
  }
}

// ============================================================
// UNDO HISTORY
// ============================================================

const UNDO_STACK = []; // each entry: array of {dept,day,lkey,cls, before, after}
const UNDO_MAX = 20;

// Push snapshot of cells before & after an operation
function _pushUndo(steps) {
  // steps: [{dept,day,lkey,cls, before, after}]
  UNDO_STACK.push(steps);
  if (UNDO_STACK.length > UNDO_MAX) UNDO_STACK.shift();
  _updateUndoBtn();
}

function _updateUndoBtn() {
  const btn = document.getElementById("undoBtn");
  if (!btn) return;
  btn.style.display = EDIT_MODE && UNDO_STACK.length > 0 ? "" : "none";
  btn.title = UNDO_STACK.length > 0
    ? `Отменить последнее действие (${UNDO_STACK.length} в истории) · Ctrl+Z`
    : "Нет действий для отмены";
}

async function undoLastEdit() {
  if (!UNDO_STACK.length) return;
  const steps = UNDO_STACK.pop();
  _updateUndoBtn();
  try {
    for (const step of [...steps].reverse()) {
      if (!step.before) {
        // Was a new edit → revert (delete)
        await API.revertEdit(step.dept, step.day, step.lkey, step.cls);
      } else if (step.before.cleared) {
        await API.saveEdit({
          dept: step.dept, day: step.day, lesson_key: step.lkey, cls: step.cls,
          lesson_no: step.before.lesson_no, time: step.before.time, cleared: true,
        });
      } else {
        await API.saveEdit({
          dept: step.dept, day: step.day, lesson_key: step.lkey, cls: step.cls,
          lesson_no: step.before.lesson_no, time: step.before.time,
          subject: step.before.subject, teacher: step.before.teacher,
          room: step.before.room, groups: step.before.groups, cleared: false,
        });
      }
    }
    await reloadSchedule();
    render();
  } catch (e) {
    alert("Ошибка при отмене: " + e.message);
  }
}

// Wrap API.saveEdit to intercept and record undo snapshots
const _origSaveEdit = API.saveEdit.bind(API);
API.saveEdit = async function(d) {
  // Capture before state for undo (only in edit mode)
  if (EDIT_MODE) {
    const before = getCellInfo(d.dept, d.day, d.lesson_key, d.cls);
    const result = await _origSaveEdit(d);
    // after = the payload we just saved
    const after = { ...d };
    if (!API._pendingUndoBatch) {
      _pushUndo([{ dept: d.dept, day: d.day, lkey: d.lesson_key, cls: d.cls, before, after }]);
    } else {
      API._pendingUndoBatch.push({ dept: d.dept, day: d.day, lkey: d.lesson_key, cls: d.cls, before, after });
    }
    return result;
  }
  return _origSaveEdit(d);
};

// Batch multiple saveEdits as one undo entry (for drag-drop)
API._startUndoBatch = function() { API._pendingUndoBatch = []; };
API._commitUndoBatch = function() {
  if (API._pendingUndoBatch && API._pendingUndoBatch.length) {
    _pushUndo(API._pendingUndoBatch);
  }
  API._pendingUndoBatch = null;
};

// Patch toggleEditMode to update undo btn visibility
const _origToggleEdit = toggleEditMode;
window.toggleEditMode = function() {
  _origToggleEdit();
  _updateUndoBtn();
  const cpBtn = document.getElementById("copyModeBtn");
  if (cpBtn) cpBtn.style.display = EDIT_MODE ? "" : "none";
  if (!EDIT_MODE) _setCopyMode(false);
};

// Patch onCellDrop to use batch undo
const _origOnCellDrop = onCellDrop;
window.onCellDrop = async function(e) {
  API._startUndoBatch();
  try { await _origOnCellDrop(e); }
  finally { API._commitUndoBatch(); }
};

// ============================================================
// COPY MODE
// ============================================================

let _copyMode = false;
let _copySourceInfo = null; // {dept, day, lkey, cls, info}

function toggleCopyMode() {
  _setCopyMode(!_copyMode);
}

function _setCopyMode(on) {
  _copyMode = on;
  _copySourceInfo = null;
  const btn = document.getElementById("copyModeBtn");
  if (btn) {
    btn.classList.toggle("active", on);
    btn.innerHTML = on ? "✕ Выйти из копирования" : "⧉ Копировать";
    btn.title = on ? "Нажмите на урок для копирования, потом на место назначения" : "Режим копирования ячеек";
  }
  document.body.classList.toggle("copy-mode", on);
  // Show hint
  const hint = document.getElementById("copyModeHint");
  if (hint) hint.style.display = on ? "" : "none";
}

// Called from cell click in copy mode (we hook into renderGrid)
function onCopyCellClick(dept, day, lkey, cls, lessonNo, time) {
  const info = getCellInfo(dept, day, lkey, cls);
  if (!info) return; // can't copy empty cell
  _copySourceInfo = { dept, day, lkey, cls, lessonNo, time, info };
  openCopyPicker();
}

function openCopyPicker() {
  if (!_copySourceInfo) return;
  const src = _copySourceInfo;
  document.getElementById("copyPickerSrc").textContent =
    `Копируем: ${src.dept} · ${src.cls} кл · ${src.day} · Урок ${src.lessonNo}`;

  // Fill day options (all days)
  const daysSel = document.getElementById("cpDay");
  daysSel.innerHTML = DAYS.map(d => `<option value="${d}" ${d === src.day ? "selected" : ""}>${d}</option>`).join("");

  // Fill class options for the same dept
  const clsData = DATA[src.dept];
  const clsList = clsData ? clsData.classes : [];
  document.getElementById("cpCls").innerHTML = clsList.map(c => `<option value="${c}" ${c === src.cls ? "selected" : ""}>${c} класс</option>`).join("");

  document.getElementById("cpError").textContent = "";
  document.getElementById("copyPickerBg").classList.add("show");
}

function closeCopyPicker() {
  document.getElementById("copyPickerBg").classList.remove("show");
}

async function confirmCopy() {
  if (!_copySourceInfo) return;
  const src = _copySourceInfo;
  const tgtDay = document.getElementById("cpDay").value;
  const tgtCls = document.getElementById("cpCls").value;
  const errEl = document.getElementById("cpError");
  errEl.textContent = "";

  if (tgtDay === src.day && tgtCls === src.cls) {
    errEl.textContent = "Источник и цель совпадают — выберите другой день или класс.";
    return;
  }

  // Find lkey for the target day/lesson_no
  const deptData = DATA[src.dept];
  let tgtLkey = src.lkey, tgtLessonNo = src.lessonNo, tgtTime = src.time;
  // Try to find a matching slot in the target day
  if (deptData && deptData.schedule && deptData.schedule[tgtDay]) {
    const daySlots = deptData.schedule[tgtDay];
    // Find slot with same lesson_no
    for (const [lk, ld] of Object.entries(daySlots)) {
      if (ld.lesson_no === src.lessonNo) { tgtLkey = lk; tgtTime = ld.time; break; }
    }
  }

  try {
    API._startUndoBatch();
    await API.saveEdit({
      dept: src.dept, day: tgtDay, lesson_key: tgtLkey, cls: tgtCls,
      lesson_no: tgtLessonNo, time: tgtTime,
      ...infoToEditPayload(src.info),
    });
    API._commitUndoBatch();
    closeCopyPicker();
    await reloadSchedule();
    render();
  } catch (e) {
    API._pendingUndoBatch = null;
    errEl.textContent = "Ошибка: " + e.message;
  }
}

// ============================================================
// KEYBOARD SHORTCUTS
// ============================================================

document.addEventListener("keydown", function(e) {
  // Esc — close top-most open modal
  if (e.key === "Escape") {
    // Close QR
    if (document.getElementById("qrModalBg")?.classList.contains("show")) { closeQrModal(); return; }
    // Close copy picker
    if (document.getElementById("copyPickerBg")?.classList.contains("show")) { closeCopyPicker(); return; }
    // Close copy mode
    if (_copyMode) { _setCopyMode(false); return; }
    // Close cell editor
    const cellModal = document.getElementById("cellEditModal");
    if (cellModal?.classList.contains("show")) { cellModal.classList.remove("show"); return; }
    // Close generic modal
    const bg = document.getElementById("modalBg");
    if (bg?.classList.contains("show")) { closeModal(); return; }
  }

  // Don't intercept if user is typing in an input/textarea
  if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT")) return;

  // Ctrl+Z — undo
  if ((e.ctrlKey || e.metaKey) && e.key === "z") {
    e.preventDefault();
    if (EDIT_MODE && UNDO_STACK.length) undoLastEdit();
    return;
  }

  // Arrow keys — navigate days (only when on schedule section)
  if (state.section === "schedule" && !EDIT_MODE) {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      const idx = DAYS.indexOf(state.day);
      if (e.key === "ArrowRight" && idx < DAYS.length - 1) { setDay(DAYS[idx + 1]); e.preventDefault(); }
      if (e.key === "ArrowLeft"  && idx > 0)               { setDay(DAYS[idx - 1]); e.preventDefault(); }
      return;
    }
  }

  // E — toggle edit mode (head only, on schedule section)
  if (e.key === "e" && state.section === "schedule" && (CURRENT_USER?.role === "head" || CURRENT_USER?.role === "director") && !e.ctrlKey && !e.metaKey) {
    toggleEditMode();
    return;
  }
});

// ============================================================
// QR CODE MODAL
// ============================================================

let _qrInstance = null;

function openQrModal() {
  const dept = state.dept || (DEPTS && DEPTS[0]) || "";
  const day  = state.day  || "";
  const url  = `${location.origin}/?dept=${encodeURIComponent(dept)}&day=${encodeURIComponent(day)}`;

  document.getElementById("qrModalDesc").textContent = `${dept} · ${day}`;
  document.getElementById("qrLink").textContent = url;

  const canvas = document.getElementById("qrCanvas");
  canvas.innerHTML = "";
  try {
    _qrInstance = new QRCode(canvas, {
      text: url,
      width: 220, height: 220,
      colorDark: "#1e1b4b",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M,
    });
  } catch (e) {
    canvas.innerHTML = `<p style="color:#ef4444;font-size:12px;">Не удалось создать QR-код</p>`;
  }

  document.getElementById("qrModalBg").classList.add("show");
}

function closeQrModal() {
  document.getElementById("qrModalBg").classList.remove("show");
  _qrInstance = null;
}

function copyQrLink() {
  const link = document.getElementById("qrLink").textContent;
  navigator.clipboard.writeText(link).then(() => {
    const btn = event.target;
    btn.textContent = "✅ Скопировано!";
    setTimeout(() => { btn.textContent = "📋 Скопировать ссылку"; }, 1800);
  }).catch(() => { alert("Скопируйте вручную:\n" + link); });
}

// ============================================================
// COPY MODE CELL HOOK — patch renderGrid to add copy onclick
// ============================================================
const _origRenderGrid = renderGrid;
window.renderGrid = function() {
  _origRenderGrid();
  if (!EDIT_MODE || !_copyMode) return;
  // Re-attach copy click handlers
  document.querySelectorAll('td[data-cell]').forEach(td => {
    td.style.cursor = "copy";
    td.addEventListener("click", function(e) {
      if (!_copyMode) return;
      e.stopPropagation();
      const src = parseCellKey(td.dataset.cell);
      onCopyCellClick(src.dept, src.day, src.lkey, src.cls, src.lesson_no, src.time);
    }, { once: false });
  });
};

// Add copy mode hint to toolbar
(function addCopyHint() {
  const toolbar = document.querySelector(".toolbar");
  if (!toolbar) return;
  const hint = document.createElement("span");
  hint.id = "copyModeHint";
  hint.style.cssText = "display:none;font-size:12px;color:var(--ip-blue);font-weight:600;margin-left:8px;";
  hint.textContent = "⧉ Нажмите на урок для копирования";
  toolbar.appendChild(hint);
})();

// ============================================================
// OPTIMISTIC UPDATES
// ============================================================

// Apply an edit payload to DATA immediately (before server confirmation).
// Returns a snapshot for rollback.
function _optimisticApply(d) {
  const dept = DATA[d.dept];
  if (!dept) return null;
  const lesson = dept.schedule[d.day] && dept.schedule[d.day][d.lesson_key];
  if (!lesson) return null;

  // Snapshot before state
  const snapshot = JSON.parse(JSON.stringify(lesson.classes[d.cls] || null));

  // Apply the change
  if (d.cleared) {
    delete lesson.classes[d.cls];
  } else {
    lesson.classes[d.cls] = {
      subject:   d.subject   || null,
      teacher:   d.teacher   || null,
      room:      d.room      || null,
      groups:    d.groups    || null,
      lesson_no: d.lesson_no || null,
      time:      d.time      || null,
      _edited:   true,
      _optimistic: true,  // flag: server not yet confirmed
    };
  }
  return snapshot;
}

function _optimisticRollback(d, snapshot) {
  const dept = DATA[d.dept];
  if (!dept) return;
  const lesson = dept.schedule[d.day] && dept.schedule[d.day][d.lesson_key];
  if (!lesson) return;
  if (snapshot === null) {
    delete lesson.classes[d.cls];
  } else {
    lesson.classes[d.cls] = snapshot;
  }
}

function _optimisticConfirm(d) {
  // Remove the _optimistic flag once server confirms
  const dept = DATA[d.dept];
  if (!dept) return;
  const lesson = dept.schedule[d.day] && dept.schedule[d.day][d.lesson_key];
  if (!lesson || !lesson.classes[d.cls]) return;
  delete lesson.classes[d.cls]._optimistic;
}

// Patch API.saveEdit (on top of the undo wrapper already in place)
// to apply optimistic update immediately then confirm/rollback.
const _saveEditWithUndo = API.saveEdit.bind(API);  // already has undo wrapper
API.saveEdit = async function(d) {
  const snapshot = _optimisticApply(d);
  // Re-render immediately with the optimistic data
  if (state.section === "schedule") render();

  try {
    const result = await _saveEditWithUndo(d);
    _optimisticConfirm(d);
    return result;
  } catch (e) {
    // Rollback on error
    if (snapshot !== undefined) _optimisticRollback(d, snapshot);
    if (state.section === "schedule") render();
    throw e;
  }
};

// ============================================================
// REAL-TIME UPDATES (SSE)
// ============================================================

let _sseSource = null;
let _sseConnected = false;

function startSSE() {
  if (_sseSource) return;  // already connected
  _sseSource = new EventSource("/api/events");

  _sseSource.onopen = () => {
    _sseConnected = true;
    _updateLiveBadge(true);
  };

  _sseSource.onerror = () => {
    _sseConnected = false;
    _updateLiveBadge(false);
    // Browser will auto-reconnect after error; we reset on next open
  };

  _sseSource.addEventListener("schedule_edit", (e) => {
    const { edit } = JSON.parse(e.data);
    // Ignore changes we made ourselves (already applied optimistically)
    if (!DATA || !DATA[edit.dept]) return;
    _applySSEEdit(edit);
  });

  _sseSource.addEventListener("schedule_revert", (e) => {
    const ev = JSON.parse(e.data);
    if (!DATA || !DATA[ev.dept]) return;
    _applySSERevert(ev);
  });
}

function _applySSEEdit(edit) {
  const dept = DATA[edit.dept];
  if (!dept) return;
  const lesson = dept.schedule[edit.day] && dept.schedule[edit.day][edit.lesson_key];
  if (!lesson) return;

  // If the local cell has _optimistic flag, it's our own pending change — skip
  const current = lesson.classes[edit.cls];
  if (current && current._optimistic) return;

  if (edit.cleared) {
    delete lesson.classes[edit.cls];
  } else {
    lesson.classes[edit.cls] = {
      subject:   edit.subject,
      teacher:   edit.teacher,
      room:      edit.room,
      groups:    edit.groups,
      lesson_no: edit.lesson_no,
      time:      edit.time,
      _edited:   true,
    };
  }
  // Rebuild derived caches
  CONFLICTS = findConflicts();
  ALL_TEACHERS = buildAllTeachersData();
  if (state.section === "schedule") render();
  _showLiveToast(`Расписание обновлено: ${edit.dept} · ${edit.day}`);
}

function _applySSERevert(ev) {
  const dept = DATA[ev.dept];
  if (!dept) return;
  const lesson = dept.schedule[ev.day] && dept.schedule[ev.day][ev.lesson_key];
  if (!lesson) return;
  const current = lesson.classes[ev.cls];
  if (current && current._optimistic) return;

  // Remove the edit override — revert to static
  delete lesson.classes[ev.cls];

  // Restore from static schedule (in-memory)
  // The static schedule is embedded in DATA[dept]._static (we need to store it).
  // Since we don't store the original, we do a lightweight re-fetch.
  API.schedule().then(fresh => {
    const freshLesson = fresh[ev.dept]?.schedule?.[ev.day]?.[ev.lesson_key];
    if (freshLesson && freshLesson.classes[ev.cls]) {
      lesson.classes[ev.cls] = freshLesson.classes[ev.cls];
    }
    CONFLICTS = findConflicts();
    ALL_TEACHERS = buildAllTeachersData();
    if (state.section === "schedule") render();
    _showLiveToast(`Ячейка восстановлена: ${ev.dept} · ${ev.day}`);
  }).catch(() => {});
}

function _updateLiveBadge(connected) {
  const badge = document.getElementById("liveBadge");
  if (!badge) return;
  badge.title = connected ? "Обновления в реальном времени" : "Нет подключения к обновлениям";
  badge.style.background = connected ? "#22c55e" : "#ef4444";
}

function _showLiveToast(msg) {
  let toast = document.getElementById("liveToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "liveToast";
    toast.style.cssText = `position:fixed;bottom:72px;right:16px;z-index:9999;
      background:var(--ip-blue);color:#fff;border-radius:8px;padding:8px 14px;
      font-size:13px;font-weight:500;box-shadow:0 4px 16px rgba(0,0,0,.25);
      transition:opacity .3s;pointer-events:none;`;
    document.body.appendChild(toast);
  }
  toast.textContent = "🔄 " + msg;
  toast.style.opacity = "1";
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toast.style.opacity = "0"; }, 3000);
}

// startSSE() is called from enterApp() after login.
