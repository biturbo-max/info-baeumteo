(function () {
  'use strict';
  const U = window.UNITS, MS = window.MATERIAL_STEPS || {}, UK = [1, 2, 3, 4, 5], CLASSES = [4, 5, 6, 7];
  const CONFIG = window.APP_CONFIG || { API_URL: '' };
  const hasGas = !!(window.google && google.script && google.script.run);
  const isServer = hasGas || !!CONFIG.API_URL;
  const S = { role: null, user: null, token: '', view: 'home', u: 1, data: null, T: null, cls: 4, tu: 1, sel: null, detail: null, quiz: null, mi: 0, chat: [], busy: false, loginRole: 'student' };
  const ID_RE = /^20[4-7](0[1-9]|[12][0-9]|30)$/;
  const FORBIDDEN = [['대회 참여·수상', /대회|수상|공모전|경시|입상/], ['K-MOOC·MOOC', /MOOC|KOCW|케이무크/i], ['방과후학교', /방과\s*후/], ['연구보고서(소논문)', /소논문|연구\s*보고서/], ['공인어학시험', /토익|토플|TOEIC|TOEFL|텝스/i]];

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = q => document.querySelector(q);
  const fmt = t => { if (!t) return '-'; const d = new Date(+t), p = n => String(n).padStart(2, '0'); return p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); };
  const lessons = u => U[u].groups.flatMap((g, gi) => g.lessons.map((l, li) => ({ key: u + '-' + gi + '-' + li, title: l[0], pages: l[1], group: g.name })));
  const taskList = u => U[u].activities.map((a, i) => ({ key: u + '-a' + i, title: a[1], kind: a[0] })).concat([{ key: u + '-p', title: U[u].project[0], kind: '프로젝트', pages: U[u].project[1] }]);
  const classIds = c => Array.from({ length: 30 }, (_, i) => '20' + c + String(i + 1).padStart(2, '0'));
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
  const barHtml = (p, tone) => `<div class="bar ${tone ? 'tone-' + tone : ''}" role="img" aria-label="${p}%"><i style="width:${p}%"></i></div>`;
  const kpi = (l, v, s) => `<div class="card kpi"><span class="l">${esc(l)}</span><span class="v">${esc(v)}</span><span class="s">${esc(s)}</span></div>`;
  function toast(m) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 2200); }
  function device() { const u = navigator.userAgent; return /iPad|Tablet/i.test(u) ? '태블릿' : /Mobi|Android|iPhone/i.test(u) ? '휴대전화' : 'PC'; }

  /* ---------- 저장소: 서버 또는 이 브라우저 ---------- */
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장 불가 환경 */ } }
  };
  const Local = {
    rec: id => store.get('ib-' + id) || { logins: [], progress: {}, quiz: {}, tasks: {}, materialProgress: {} },
    handle(r) {
      if (r.action === 'login') {
        if (!ID_RE.test(r.id)) return { ok: false, error: '등록되지 않은 학번입니다.' };
        const d = Local.rec(r.id); d.logins.unshift({ ts: Date.now(), name: r.name, device: r.device }); d.logins = d.logins.slice(0, 20); store.set('ib-' + r.id, d);
        return { ok: true, token: r.id, user: { id: r.id, name: r.name || r.id } };
      }
      if (r.action === 'teacherLogin') return { ok: false, error: '교사 메뉴는 앱스크립트 서버를 연결해야 사용할 수 있어요.' };
      const id = r.token, d = Local.rec(id); if (!ID_RE.test(id)) return { ok: false, error: '다시 로그인해 주세요.', auth: true };
      d.materialProgress = d.materialProgress || {};
      if (r.action === 'bootstrap') return { ok: true, progress: d.progress, quiz: d.quiz, tasks: d.tasks, materialProgress: d.materialProgress, logins: d.logins, materials: {}, aiEnabled: false };
      if (r.action === 'setLesson') { if (r.done) d.progress[r.lesson] = 1; else delete d.progress[r.lesson]; }
      else if (r.action === 'setMaterialStep') { if (r.done) d.materialProgress[r.step] = 1; else delete d.materialProgress[r.step]; }
      else if (r.action === 'saveQuiz') d.quiz[r.unit] = { score: r.score, total: r.total, perQ: r.perQ, essay: r.essay, ts: Date.now() };
      else if (r.action === 'saveTask') d.tasks[r.key] = { status: r.status, text: r.text, ts: Date.now() };
      else if (r.action === 'chat') return { ok: true, fallback: true };
      store.set('ib-' + id, d); return { ok: true };
    }
  };
  function call(action, payload) {
    const body = Object.assign({ action, token: S.token }, payload || {});
    let p;
    if (hasGas) p = new Promise((res, rej) => google.script.run.withSuccessHandler(t => res(JSON.parse(t))).withFailureHandler(rej).api(JSON.stringify(body)));
    else if (CONFIG.API_URL) p = fetch(CONFIG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) }).then(r => r.json());
    else p = Promise.resolve(Local.handle(JSON.parse(JSON.stringify(body))));
    return p.then(r => {
      if (r.ok) return r;
      if (r.auth) { logout(); }
      throw new Error(r.error || '처리하지 못했어요.');
    });
  }
  function fail(e) { toast((e && e.message) || '연결이 잠시 끊겼어요. 다시 시도해 주세요.'); }

  /* ---------- 로그인 ---------- */
  function loginView() {
    const st = S.loginRole === 'student';
    return `<div class="login"><section class="login-intro">
      <div class="brand"><div class="mark">구암고등학교</div><div><b>정보 배움터</b><small>고등학교 「정보」 2022 개정 교육과정</small></div></div>
      <h1>자료, 평가, AI 도우미를 한곳에서 이어서 배워요</h1>
      ${UK.map(u => `<div class="row tone-${U[u].tone}"><span class="chip">${U[u].no}</span><span>${esc(U[u].name)}</span></div>`).join('')}
    </section><section class="login-area"><form class="login-card" id="loginForm" autocomplete="off">
      <h1 style="font-size:26px">로그인</h1>
      <div class="seg" role="group" aria-label="사용자 구분"><button type="button" data-a="loginRole" data-r="student" class="${st ? 'on' : ''}">학생</button><button type="button" data-a="loginRole" data-r="teacher" class="${st ? '' : 'on'}">교사</button></div>
      ${st ? `<div class="field"><label for="sid">학번 (5자리)</label><input id="sid" inputmode="numeric" maxlength="5" placeholder="예: 20401" required></div>
      <div class="field"><label for="sname">이름 (자유롭게 입력)</label><input id="sname" maxlength="20" placeholder="이름을 입력해 주세요"></div>`
        : `<div class="field"><label for="pin">교사 비밀번호</label><input id="pin" type="password" required></div>`}
      <div class="error" id="loginError" role="alert"></div>
      <button class="btn primary wide" id="loginBtn">로그인</button>
      <div class="note">${st ? '2학년 4~7반, 1~30번 학번으로 들어올 수 있어요. 로그인 시각과 학습 기록은 수업과 상담을 위해 담당 선생님이 볼 수 있어요.' : '교사 메뉴는 앱스크립트 서버에서 비밀번호를 확인해요.'}${isServer ? '' : '<br>지금은 서버 미연결 상태라 기록이 이 브라우저에만 저장돼요.'}</div>
    </form></section></div>`;
  }
  async function doLogin() {
    const err = $('#loginError'), btn = $('#loginBtn'); err.textContent = '';
    try {
      btn.disabled = true; let r;
      if (S.loginRole === 'student') {
        const id = $('#sid').value.trim(), name = $('#sname').value.trim();
        if (!ID_RE.test(id)) { err.textContent = '학번을 확인해 주세요. 20401~20430, 20501~20530, 20601~20630, 20701~20730만 들어올 수 있어요.'; return; }
        r = await call('login', { id, name, device: device() });
        S.role = 'student'; S.view = 'home';
      } else {
        r = await call('teacherLogin', { pin: $('#pin').value });
        S.role = 'teacher'; S.view = 'monitor';
      }
      S.token = r.token; S.user = r.user || { id: '교사', name: '정보 담당 교사' };
      try { sessionStorage.setItem('ib-session', JSON.stringify({ token: S.token, role: S.role, user: S.user })); } catch (e) { /* 무시 */ }
      await loadAll(); render();
    } catch (e) { S.role = null; err.textContent = (e && e.message) || '연결이 잠시 끊겼어요.'; } finally { btn.disabled = false; }
  }
  async function loadAll() {
    if (S.role === 'student') {
      S.data = await call('bootstrap'); S.data.materialProgress = S.data.materialProgress || {};
      if (!S.chat.length) S.chat = [['ai', '안녕하세요! 궁금한 개념을 물어보세요. 수행과제의 답을 대신 쓰지는 않지만 힌트는 드릴게요.']];
    } else {
      const t = await call('teacherData');
      const progress = {}; (t.progress || []).forEach(p => { (progress[p[0]] = progress[p[0]] || {})[p[1]] = 1; });
      t.progress = progress;
      const materialProgress = {}; (t.materialProgress || []).forEach(p => { (materialProgress[p[0]] = materialProgress[p[0]] || {})[p[1]] = 1; });
      t.materialProgress = materialProgress;
      S.T = t;
      if (!S.sel) S.sel = classIds(S.cls)[0];
    }
  }
  function logout() { S.role = null; S.token = ''; S.user = null; S.data = null; S.T = null; S.detail = null; S.quiz = null; S.chat = []; try { sessionStorage.removeItem('ib-session'); } catch (e) { /* 무시 */ } render(); }

  /* ---------- 틀 ---------- */
  const NAV = { student: [['home', '홈'], ['unit', '단원 학습'], ['quiz', '형성평가'], ['tasks', '수행과제'], ['record', '내 학습 기록']], teacher: [['monitor', '수행과제 현황'], ['counsel', '학생 상담'], ['setuk', '세특 작성'], ['materials', '교육과정·자료'], ['quizAdmin', '형성평가 관리']] };
  function shell() {
    const st = S.role === 'student';
    return `<div class="app ${st ? '' : 'no-chat'}"><aside class="side">
      <div class="brand"><div class="mark">구암고등학교</div><div><b>정보 배움터</b><small>${st ? '2022 개정 교육과정' : '교사용'}</small></div></div>
      <div class="side-label">${st ? '학습' : '교사 메뉴'}</div><nav class="nav" id="nav" aria-label="메뉴"></nav>
      <div class="account"><div><b style="font-weight:500">${esc(S.user.name)}</b><br><small>${st ? '학번 ' + esc(S.user.id) : '2학년 정보'}</small></div><button data-a="logout">로그아웃</button></div>
    </aside><main class="main" id="main"></main>${st ? chatShell() : ''}</div>${st ? '<button class="fab" data-a="chatOpen">AI 도우미</button>' : ''}`;
  }
  function chatShell() {
    return `<aside class="chat" id="chat" aria-label="AI 학습 도우미"><div class="chat-head"><div class="spark" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" style="color:var(--accent)" d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4L12 2z"/></svg></div><div><b>AI 학습 도우미</b><br><span class="small dim" id="aiStatus"></span></div><button class="x" data-a="chatClose" aria-label="닫기">×</button></div>
      <div class="ctx" id="ctx"></div><div class="thread" id="thread" aria-live="polite"></div>
      <div class="composer"><div class="row"><button class="chip neutral" data-a="sug">쉽게 설명해 줘</button><button class="chip neutral" data-a="sug">예시 더 보여 줘</button><button class="chip neutral" data-a="sug">확인 문제 내 줘</button></div>
      <form class="inbox" id="chatForm"><textarea id="chatInput" rows="1" maxlength="500" aria-label="질문 입력" placeholder="궁금한 내용을 입력하세요"></textarea><button class="send" id="sendBtn" aria-label="보내기">↑</button></form>
      <div class="small dim" style="text-align:center">AI는 틀릴 수 있어요. 질문은 수업 지도를 위해 선생님이 볼 수 있어요.</div></div></aside>`;
  }
  function render() {
    const root = $('#app');
    if (!S.role) { root.innerHTML = loginView(); return; }
    if (!$('.app')) { root.innerHTML = shell(); if (S.role === 'student') drawChat(); }
    $('#nav').innerHTML = NAV[S.role].map(n => `<button data-a="go" data-v="${n[0]}" class="${S.view === n[0] ? 'on' : ''}" ${S.view === n[0] ? 'aria-current="page"' : ''}>${n[1]}</button>`).join('');
    const main = $('#main'); main.innerHTML = (V[S.view] || V.home)();
    if (S.role === 'student') {
      const u = U[S.u], c = $('#ctx'); c.className = 'ctx tone-' + u.tone; c.innerHTML = `<b>현재 맥락</b>${u.no} ${esc(u.name)}`;
      $('#aiStatus').textContent = S.data.aiEnabled ? '이 단원의 내용을 바탕으로 답해요' : '개념 사전 모드';
      if (S.view === 'material') { const ms = msList(S.u); const st = ms[Math.min(S.mi || 0, ms.length - 1)]; if (st && st.type === 'video' && st.youtubeId) mountYouTube(S.u, st); }
    }
  }
  const unitTabs = (cur, act) => `<div class="row" role="group" aria-label="단원 선택">${UK.map(u => `<button class="chip ${u === cur ? 'tone-' + U[u].tone : 'neutral'}" data-a="${act}" data-u="${u}" ${u === cur ? 'aria-pressed="true"' : ''}>${U[u].no} ${esc(U[u].name)}</button>`).join('')}</div>`;
  const classTabs = () => `<div class="row" role="group" aria-label="반 선택">${CLASSES.map(c => `<button class="btn ${c === S.cls ? 'primary' : ''}" data-a="cls" data-c="${c}">2학년 ${c}반</button>`).join('')}<button class="btn ghost" data-a="refresh">새로고침</button></div>`;

  /* ---------- 학생 화면 ---------- */
  const doneCount = u => lessons(u).filter(l => S.data.progress[l.key]).length;
  const msList = u => MS[u] || [];
  const msKey = (u, k) => u + '-ms-' + k;
  const msDone = (u, k) => !!(S.data.materialProgress || {})[msKey(u, k)];
  const msDoneCount = u => msList(u).filter(s => msDone(u, s.key)).length;
  const msFrame = src => `<div class="ms-frame"><iframe src="${src}" allow="autoplay" allowfullscreen></iframe></div>`;

  /* ---------- 학습 자료 영상(유튜브 IFrame API) ---------- */
  let ytPlayer = null;
  function loadYouTubeAPI() {
    if (window.YT && window.YT.Player) return Promise.resolve();
    if (loadYouTubeAPI._p) return loadYouTubeAPI._p;
    loadYouTubeAPI._p = new Promise(resolve => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(); };
      const tag = document.createElement('script'); tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    });
    return loadYouTubeAPI._p;
  }
  async function mountYouTube(unit, step) {
    try {
      await loadYouTubeAPI();
      const el = document.getElementById('yt-' + step.key); if (!el) return;
      if (ytPlayer) { try { ytPlayer.destroy(); } catch (e) { /* 무시 */ } ytPlayer = null; }
      ytPlayer = new YT.Player(el, {
        videoId: step.youtubeId, width: '100%', height: '100%', playerVars: { rel: 0 },
        events: { onStateChange: ev => { if (ev.data === YT.PlayerState.ENDED) A.msToggle({ k: step.key }); } }
      });
    } catch (e) { /* 영상 API를 불러오지 못해도 수동 완료 버튼은 그대로 쓸 수 있다 */ }
  }
  const V = {};
  V.home = () => {
    const all = UK.flatMap(lessons), d = all.filter(l => S.data.progress[l.key]).length;
    const qs = UK.map(u => S.data.quiz[u]).filter(Boolean), avg = qs.length ? Math.round(qs.reduce((a, q) => a + pct(q.score, q.total), 0) / qs.length) : null;
    const tasks = UK.flatMap(taskList), sub = tasks.filter(t => (S.data.tasks[t.key] || {}).status === 'done').length;
    const next = all.find(l => !S.data.progress[l.key]), nu = next ? +next.key[0] : null;
    const last = S.data.logins[1];
    const todo = [];
    UK.forEach(u => { if (!S.data.quiz[u] && doneCount(u) && todo.length < 3) todo.push(['형성평가', U[u].no + ' ' + U[u].name + ' 6문항', 'openQuiz', u, '시작']); });
    UK.forEach(u => taskList(u).forEach(t => { if ((S.data.tasks[t.key] || {}).status === 'draft' && todo.length < 3) todo.push(['수행과제', t.title, 'openTasks', u, '이어서']); }));
    return `<div class="head"><div><h1>오늘도 이어서 배워 볼까요?</h1><p class="dim">${esc(S.user.name)}님 · 지난 접속 ${last ? fmt(last.ts) : '처음이에요'}</p></div></div>
    ${next ? `<div class="card continue tone-${U[nu].tone}"><div><span class="chip">${U[nu].no} ${esc(U[nu].name)} · 이어서 학습</span><h2 style="margin-top:6px">${esc(next.title)}</h2><p class="dim">교과서 ${esc(next.pages)}쪽</p></div><button class="btn primary" data-a="openUnit" data-u="${nu}">이어서 학습</button></div>` : '<div class="card"><h2>모든 소단원을 마쳤어요!</h2></div>'}
    <div class="grid g3">${kpi('내 진도', pct(d, all.length) + '%', `소단원 ${d} / ${all.length} 완료`)}${kpi('형성평가 평균', avg == null ? '-' : avg + '점', qs.length + '개 단원 응시')}${kpi('수행과제', `${sub} / ${tasks.length}`, '제출 완료')}</div>
    <h2 style="font-size:17px">단원별 학습</h2>
    <div class="grid g3">${UK.map(u => { const n = lessons(u).length, c = doneCount(u), p = pct(c, n); return `<button class="card unit tone-${U[u].tone}" data-a="openUnit" data-u="${u}"><div class="row between"><span class="chip">${U[u].no}</span><span class="small dim">${c === n ? '완료' : c ? '진행 중' : '시작 전'}</span></div><h3>${esc(U[u].name)}</h3><span class="small dim">${U[u].groups.map(g => esc(g.name.replace(/^\d+\.\s*/, ''))).join(' · ')}</span>${barHtml(p, U[u].tone)}<span class="small dim">소단원 ${c} / ${n}</span></button>`; }).join('')}</div>
    ${todo.length ? `<div class="card"><h2>오늘 할 일</h2>${todo.map(t => `<button class="item" data-a="${t[2]}" data-u="${t[3]}"><span class="tag">${t[0]}</span><span class="t"><b>${esc(t[1])}</b></span><span class="act">${t[4]}</span></button>`).join('')}</div>` : ''}`;
  };
  V.unit = () => {
    const u = U[S.u], ls = lessons(S.u), c = doneCount(S.u), pj = S.data.tasks[S.u + '-p'] || {};
    const q = S.data.quiz[S.u];
    return `${unitTabs(S.u, 'openUnit')}<div class="head"><div><h1>${u.no}. ${esc(u.name)}</h1><p class="dim">${esc(u.desc)}</p></div></div>
    <div class="card"><div class="card-head"><h2>소단원 학습 순서</h2><span class="small dim">${c} / ${ls.length} 완료</span></div>
      ${u.groups.map((g, gi) => `<div class="small dim" style="font-weight:500">${esc(g.name)}</div>${ls.filter(l => l.key.startsWith(S.u + '-' + gi + '-')).map(l => { const d = S.data.progress[l.key]; return `<div class="item"><span class="tag">${d ? '완료' : '학습 전'}</span><span class="t"><b>${esc(l.title)}</b><small>교과서 ${esc(l.pages)}쪽</small></span><button class="act" data-a="toggle" data-k="${l.key}">${d ? '완료 취소' : '학습 완료'}</button></div>`; }).join('')}`).join('')}</div>
    <div class="grid g2"><div class="card"><div class="card-head"><h2>형성평가</h2><span class="small dim">6문항</span></div><p class="dim small">${q ? `지난 점수 ${q.score} / ${q.total}` : '풀고 나면 바로 풀이를 볼 수 있어요.'}</p><button class="btn primary wide" data-a="openQuiz" data-u="${S.u}">${q ? '다시 풀기' : '평가 시작'}</button></div>
      <div class="card tone-${u.tone}"><div class="card-head"><h2>수행과제</h2><span class="small dim">${pj.status === 'done' ? '제출 완료' : pj.status === 'draft' ? '작성 중' : '시작 전'}</span></div><h3>${esc(u.project[0])}</h3><p class="small dim">창의·융합 프로젝트 · 교과서 ${esc(u.project[1])}쪽</p><div class="note">${esc(u.aiRule)}</div><button class="btn" data-a="openTasks" data-u="${S.u}">과제 열기</button></div></div>
    ${msList(S.u).length ? (() => { const ms = msList(S.u), msc = msDoneCount(S.u); return `<div class="card tone-${u.tone}"><div class="card-head"><h2>학습 자료</h2><span class="small dim">${msc} / ${ms.length} 완료</span></div>${barHtml(pct(msc, ms.length), u.tone)}<p class="dim small">PPT와 영상을 순서대로 보면서 학습해요. 진행 상황은 선생님도 확인할 수 있어요.</p><button class="btn primary wide" data-a="openMaterial" data-u="${S.u}">${msc ? '이어서 학습' : '학습 시작'}</button></div>`; })()
      : `<div class="card"><div class="card-head"><h2>학습 자료</h2></div>${u.materials.map((m, i) => { const url = S.data.materials[S.u + '-m' + i]; return `<div class="item"><span class="tag">${esc(m[0])}</span><span class="t"><b>${esc(m[1])}</b><small>${esc(m[2])}</small></span>${url ? `<a class="act" href="${esc(url)}" target="_blank" rel="noopener">열기</a>` : '<span class="act" style="color:var(--text-2)">링크 준비 중</span>'}</div>`; }).join('')}</div>`}
    <div class="card tone-${u.tone}"><h2>2022 개정 교육과정 성취기준</h2>${u.standards.map(s => `<div class="std"><span class="mono">${s[0]}</span><span>${esc(s[1])}</span></div>`).join('')}</div>`;
  };
  V.material = () => {
    const u = U[S.u], ms = msList(S.u);
    if (!ms.length) return V.unit();
    const i = Math.min(S.mi || 0, ms.length - 1), st = ms[i], done = msDone(S.u, st.key), msc = msDoneCount(S.u);
    const noVideo = st.type === 'video' && !st.youtubeId && !st.driveId;
    const body = st.type === 'video'
      ? (st.youtubeId ? `<div class="ms-frame"><div id="yt-${st.key}"></div></div><p class="dim small">영상을 끝까지 보면 자동으로 완료돼요.</p>`
        : st.driveId ? msFrame(`https://drive.google.com/file/d/${st.driveId}/preview`)
        : '<div class="note">선생님이 영상을 연결하면 여기에 나타나요.</div>')
      : msFrame(`https://drive.google.com/file/d/${st.driveId}/preview`);
    return `<div class="head"><div><h1>${esc(st.title)}</h1><p class="dim">${u.no} ${esc(u.name)} · ${esc(st.sub || '')}</p></div><button class="btn" data-a="openUnit" data-u="${S.u}">← 단원으로</button></div>
    <div><div class="row between small dim"><span>자료 학습 진행</span><span class="mono">${msc} / ${ms.length}</span></div>${barHtml(pct(msc, ms.length), u.tone)}</div>
    <div class="row" role="group" aria-label="자료 선택">${ms.map((s, k) => `<button class="chip ${k === i ? 'tone-' + u.tone : 'neutral'}" data-a="msGo" data-i="${k}">${msDone(S.u, s.key) ? '✓ ' : ''}${k + 1}. ${esc(s.title.length > 12 ? s.title.slice(0, 11) + '…' : s.title)}</button>`).join('')}</div>
    <div class="card">${body}<div class="row between">
      <button class="btn" data-a="msGo" data-i="${Math.max(0, i - 1)}" ${i === 0 ? 'disabled' : ''}>이전 자료</button>
      <button class="btn ${done ? '' : 'primary'}" data-a="msToggle" data-k="${st.key}" ${noVideo ? 'disabled' : ''}>${done ? '완료 취소' : '학습 완료로 표시'}</button>
      <button class="btn" data-a="msGo" data-i="${Math.min(ms.length - 1, i + 1)}" ${i === ms.length - 1 ? 'disabled' : ''}>다음 자료</button>
    </div></div>`;
  };
  V.quiz = () => {
    const u = U[S.u], q = S.quiz;
    if (!q || q.u !== S.u) { const last = S.data.quiz[S.u]; return `${unitTabs(S.u, 'pickQuiz')}<div class="head"><div><h1>형성평가 · ${esc(u.name)}</h1><p class="dim">객관식 5문항, 서술형 1문항이에요.</p></div></div><div class="card"><p>${last ? `지난 점수 <b class="mono">${last.score} / ${last.total}</b> · ${fmt(last.ts)}` : '아직 응시하지 않았어요.'}</p><button class="btn primary" data-a="openQuiz" data-u="${S.u}">${last ? '다시 풀기' : '평가 시작'}</button></div>`; }
    if (q.done) return `<div class="head"><div><h1>결과 · ${esc(u.name)}</h1></div></div><div class="grid g2">${kpi('객관식 점수', `${q.score} / ${q.total}`, '서술형은 선생님이 확인해요')}${kpi('정답률', pct(q.score, q.total) + '%', '')}</div>
      <div class="card">${u.questions.map((x, i) => `<div class="item"><span class="tag">${i + 1}</span><span class="t"><b>${esc(x.u)}</b></span><span class="chip ${x.o ? (q.picks[i] === x.a ? 'good' : 'danger') : 'neutral'}">${x.o ? (q.picks[i] === x.a ? '정답' : '오답') : '서술형'}</span></div>`).join('')}<div class="row"><button class="btn primary" data-a="openQuiz" data-u="${S.u}">다시 풀기</button><button class="btn" data-a="openUnit" data-u="${S.u}">단원으로</button></div></div>`;
    const x = u.questions[q.i], picked = q.picks[q.i], answered = picked != null;
    return `<div class="row tone-${u.tone}"><span class="chip">${u.no} ${esc(u.name)}</span><span class="chip neutral">${x.c}</span></div><div class="head"><div><h1>형성평가</h1><p class="dim">${esc(x.u)}</p></div></div>
    <div><div class="row between small dim"><span>진행</span><span class="mono">${q.i + 1} / 6</span></div>${barHtml(pct(q.i + 1, 6))}</div>
    <div class="card"><span class="small" style="color:var(--accent);font-weight:500">문제 ${q.i + 1}</span><h2>${esc(x.q)}</h2>${x.code ? `<pre class="code">${esc(x.code)}</pre>` : ''}
    ${x.o ? x.o.map((o, k) => `<button class="opt ${answered && k === x.a ? 'correct' : answered && k === picked ? 'wrong' : ''}" data-a="pick" data-k="${k}" ${answered ? 'disabled' : ''}><span class="n">${k + 1}</span><span>${esc(o)}</span></button>`).join('') : answered ? `<div class="fb neutral"><b>내 답안</b><br>${esc(q.essay).replace(/\n/g, '<br>')}</div>` : `<div class="field"><label for="essay">답안</label><textarea id="essay" maxlength="1000"></textarea></div><button class="btn" data-a="essayDone">답안 제출</button>`}
    ${answered ? (x.o ? `<div class="fb ${picked === x.a ? '' : 'no'}"><b>${picked === x.a ? '정답이에요' : '다시 확인해 봐요 · 정답 ' + (x.a + 1) + '번'}</b><br>${esc(x.e)}</div>` : `<div class="fb"><b>예시 답안</b>${x.codeAns ? `<pre class="code">${esc(x.ans)}</pre>` : '<br>' + esc(x.ans)}<br><span class="small dim">${esc(x.e)}</span></div>`) + `<div class="row" style="justify-content:flex-end"><button class="btn primary" data-a="qnext">${q.i < 5 ? '다음 문제' : '결과 보기'}</button></div>` : ''}</div>`;
  };
  V.tasks = () => {
    const u = U[S.u];
    return `${unitTabs(S.u, 'pickTasks')}<div class="head"><div><h1>수행과제 · ${esc(u.name)}</h1><p class="dim">내용이나 결과물 링크를 적고 제출하세요.</p></div></div><div class="note">${esc(u.aiRule)}</div>
    ${taskList(S.u).map(t => { const d = S.data.tasks[t.key] || {}; return `<div class="card tone-${u.tone}"><div class="card-head"><div class="row"><span class="chip">${esc(t.kind)}</span><h3>${esc(t.title)}</h3></div><span class="small dim" id="st-${t.key}">${d.status === 'done' ? '제출 완료 · ' + fmt(d.ts) : d.status === 'draft' ? '작성 중' : '시작 전'}</span></div><div class="field"><label for="tx-${t.key}">내용 또는 링크</label><textarea id="tx-${t.key}" maxlength="3000">${esc(d.text || '')}</textarea></div><div class="row" style="justify-content:flex-end"><button class="btn" data-a="task" data-k="${t.key}" data-s="draft">임시 저장</button><button class="btn primary" data-a="task" data-k="${t.key}" data-s="done">제출</button></div></div>`; }).join('')}`;
  };
  V.record = () => `<div class="head"><div><h1>내 학습 기록</h1><p class="dim">${esc(S.user.name)} · 학번 ${esc(S.user.id)}</p></div></div>
    <div class="grid g2"><div class="card"><h2>단원별 진도</h2>${UK.map(u => { const p = pct(doneCount(u), lessons(u).length); return `<div><div class="row between small"><span>${U[u].no} ${esc(U[u].name)}</span><span class="mono dim">${p}%</span></div>${barHtml(p, U[u].tone)}</div>`; }).join('')}</div>
    <div class="card"><h2>형성평가</h2>${UK.map(u => { const q = S.data.quiz[u]; return `<div class="item"><span class="tag">${U[u].no}</span><span class="t"><b>${esc(U[u].name)}</b>${q ? `<small>${fmt(q.ts)}</small>` : ''}</span><span class="mono">${q ? q.score + ' / ' + q.total : '-'}</span></div>`; }).join('')}</div></div>
    ${UK.some(u => msList(u).length) ? `<div class="card"><h2>학습 자료 진행</h2>${UK.filter(u => msList(u).length).map(u => { const ms = msList(u), n = msDoneCount(u); return `<div><div class="row between small"><span>${U[u].no} ${esc(U[u].name)}</span><span class="mono dim">${n} / ${ms.length}</span></div>${barHtml(pct(n, ms.length), U[u].tone)}</div>`; }).join('')}</div>` : ''}
    <div class="card"><h2>로그인 기록</h2>${S.data.logins.slice(0, 10).map(l => `<div class="log"><span class="mono">${fmt(l.ts)}</span><span>${esc(l.device)}</span><span>${esc(l.name || '-')}</span></div>`).join('')}</div>`;

  /* ---------- 교사 화면 ---------- */
  const cellOf = (id, key) => ((S.T.tasks[id] || {})[key] || {}).status;
  const studentLabel = id => { const s = S.T.students[id]; return id.slice(3) + ' ' + (s && s.name ? s.name : ''); };
  V.monitor = () => {
    const ids = classIds(S.cls), ts = taskList(S.tu), T = S.T, u = U[S.tu];
    let done = 0; const cells = (ts.length + 1) * ids.length;
    ids.forEach(id => { if ((T.quiz[id] || {})[S.tu]) done++; ts.forEach(t => { if (cellOf(id, t.key) === 'done') done++; }); });
    const quizzes = ids.map(id => (T.quiz[id] || {})[S.tu]).filter(Boolean), avg = quizzes.length ? Math.round(quizzes.reduce((a, q) => a + pct(q.score, q.total), 0) / quizzes.length) : null;
    const week = Date.now() - 7 * 864e5, inactive = ids.filter(id => !(T.students[id] && T.students[id].last > week));
    const seen = ids.filter(id => T.students[id]).length;
    return `<div class="head"><div><h1>수행과제 현황</h1><p class="dim">2학년 ${S.cls}반 · ${u.no} ${esc(u.name)}</p></div></div>${classTabs()}${unitTabs(S.tu, 'tu')}
    <div class="grid g4">${kpi('제출 완료율', pct(done, cells) + '%', `${done} / ${cells}건 (형성평가 포함)`)}${kpi('접속한 학생', `${seen} / 30`, '한 번이라도 로그인')}${kpi('형성평가 평균', avg == null ? '-' : avg + '%', `응시 ${quizzes.length}명`)}${kpi('7일 이상 미접속', inactive.length + '명', '미접속 학생 포함')}</div>
    <div class="card"><div class="card-head"><h2>학생별 과제 진행</h2><span class="small dim">학생을 누르면 상담 화면으로 이동해요</span></div><div class="table-wrap"><table><thead><tr><th scope="col">학생</th><th scope="col">형성평가</th>${ts.map(t => `<th scope="col">${esc(t.title.length > 14 ? t.title.slice(0, 13) + '…' : t.title)}</th>`).join('')}<th scope="col">진도</th><th scope="col">최근 접속</th></tr></thead><tbody>
    ${ids.map(id => { const q = (T.quiz[id] || {})[S.tu], ld = lessons(S.tu).filter(l => (T.progress[id] || {})[l.key]).length, st = T.students[id]; return `<tr><td><button class="linkish" data-a="goStudent" data-id="${id}">${esc(studentLabel(id))}</button></td><td><span class="cell ${q ? 'done' : ''}">${q ? q.score + '/' + q.total : '미응시'}</span></td>${ts.map(t => { const c = cellOf(id, t.key); return `<td><span class="cell ${c || ''}">${c === 'done' ? '제출' : c === 'draft' ? '작성 중' : '-'}</span></td>`; }).join('')}<td class="mono small">${ld}/${lessons(S.tu).length}</td><td class="mono small">${st ? fmt(st.last) : '-'}</td></tr>`; }).join('')}
    </tbody></table></div></div>`;
  };
  V.counsel = () => {
    const ids = classIds(S.cls), id = S.sel, T = S.T, st = T.students[id], d = S.detail && S.detail.id === id ? S.detail : null;
    if (!d) { loadDetail(id); }
    const all = UK.flatMap(lessons), n = all.filter(l => (T.progress[id] || {})[l.key]).length, q = T.quiz[id] || {};
    const scored = UK.filter(u => q[u]);
    return `<div class="head"><div><h1>${esc(id)} ${esc(st && st.name || '')}</h1><p class="dim">상담 전 학습 현황 점검</p></div></div>${classTabs()}
    <div class="row"><label class="small dim" for="sel">학생</label><select id="sel" data-c="sel" style="width:200px">${ids.map(x => `<option value="${x}" ${x === id ? 'selected' : ''}>${esc(studentLabel(x))}</option>`).join('')}</select></div>
    <div class="grid g4">${kpi('최근 로그인', st ? fmt(st.last) : '-', st ? '총 ' + st.count + '회 접속' : '접속 기록 없음')}${kpi('전체 진도', pct(n, all.length) + '%', `소단원 ${n} / ${all.length}`)}${kpi('형성평가 평균', scored.length ? Math.round(scored.reduce((a, u) => a + pct(q[u].score, q[u].total), 0) / scored.length) + '%' : '-', scored.length + '개 단원 응시')}${kpi('수행과제 제출', UK.flatMap(taskList).filter(t => cellOf(id, t.key) === 'done').length + '건', '')}</div>
    <div class="grid g2"><div class="card"><h2>단원별 진도</h2>${UK.map(u => { const p = pct(lessons(u).filter(l => (T.progress[id] || {})[l.key]).length, lessons(u).length); return `<div><div class="row between small"><span>${U[u].no} ${esc(U[u].name)}</span><span class="mono dim">${p}%</span></div>${barHtml(p, U[u].tone)}</div>`; }).join('')}</div>
    <div class="card"><h2>단원별 형성평가 정답률</h2><div class="columns">${UK.map(u => { const p = q[u] ? pct(q[u].score, q[u].total) : null; return `<div><span class="mono small">${p == null ? '-' : p}</span><i style="height:${p == null ? 0 : p}%"></i><span class="small dim">${U[u].no}</span></div>`; }).join('')}</div></div></div>
    ${UK.some(u => msList(u).length) ? `<div class="card"><h2>학습 자료 진행률</h2>${UK.filter(u => msList(u).length).map(u => { const ms = msList(u), n = ms.filter(s => (T.materialProgress[id] || {})[msKey(u, s.key)]).length; return `<div><div class="row between small"><span>${U[u].no} ${esc(U[u].name)}</span><span class="mono dim">${n} / ${ms.length}</span></div>${barHtml(pct(n, ms.length), U[u].tone)}</div>`; }).join('')}</div>` : ''}
    ${d ? `<div class="grid g2"><div class="card"><h2>로그인 기록</h2>${d.logins.length ? d.logins.slice(0, 8).map(l => `<div class="log"><span class="mono">${fmt(l.ts)}</span><span>${esc(l.device)}</span><span>${esc(l.name || '-')}</span></div>`).join('') : '<p class="dim">기록이 없어요.</p>'}</div>
    <div class="card"><h2>AI에게 한 질문</h2>${d.ai.length ? d.ai.slice(0, 8).map(a => `<div class="log"><span class="mono">${fmt(a.ts)}</span><span>${a.unit ? U[a.unit].no : ''}</span><span>${esc(a.q)}</span></div>`).join('') : '<p class="dim">기록이 없어요.</p>'}</div></div>
    <div class="card"><h2>수행과제 기록</h2>${Object.keys(d.tasks).length ? Object.keys(d.tasks).map(k => { const t = UK.flatMap(taskList).find(x => x.key === k); return `<div class="item"><span class="tag">${d.tasks[k].status === 'done' ? '제출' : '작성 중'}</span><span class="t"><b>${esc(t ? t.title : k)}</b><small style="white-space:pre-wrap">${esc(d.tasks[k].text)}</small></span></div>`; }).join('') : '<p class="dim">기록이 없어요.</p>'}</div>
    <div class="card"><div class="card-head"><h2>상담 기록</h2><span class="small dim">담당 교사만 열람</span></div>${d.counsel.map(c => `<div class="item"><span class="t"><small>${fmt(c.ts)}</small><b style="white-space:pre-wrap;font-weight:400">${esc(c.memo)}</b></span></div>`).join('')}<div class="field"><label for="memo">오늘 상담 내용</label><textarea id="memo" maxlength="2000"></textarea></div><div class="row" style="justify-content:flex-end"><button class="btn primary" data-a="saveMemo">기록 저장</button></div></div>` : '<p class="dim">상세 기록을 불러오는 중…</p>'}`;
  };
  async function loadDetail(id) { if (S.loading === id) return; S.loading = id; try { const r = await call('studentDetail', { id }); S.detail = Object.assign(r, { id }); S.draft = null; if (S.sel === id && (S.view === 'counsel' || S.view === 'setuk')) render(); } catch (e) { fail(e); } finally { S.loading = null; } }
  function setukChecks(txt) {
    const hit = FORBIDDEN.filter(f => f[1].test(txt)).map(f => f[0]);
    return `<div class="check"><span>500자 이내</span><span class="chip ${txt.length <= 500 ? 'good' : 'danger'}">${txt.length <= 500 ? '확인' : '초과'}</span></div>${FORBIDDEN.map(f => `<div class="check"><span>${f[0]} 없음</span><span class="chip ${hit.includes(f[0]) ? 'danger' : 'good'}">${hit.includes(f[0]) ? '삭제 필요' : '확인'}</span></div>`).join('')}<div class="check"><span>성취기준·성취수준 근거</span><span class="chip warn">교사 확인</span></div><div class="check"><span>활동의 단순 나열 없음</span><span class="chip warn">교사 확인</span></div><div class="check"><span>교사 관찰 사실과 대조</span><span class="chip warn">교사 확인</span></div>`;
  }
  V.setuk = () => {
    const ids = classIds(S.cls), id = S.sel, d = S.detail && S.detail.id === id ? S.detail : null, statusOf = x => S.T.setuk[x];
    if (!d) loadDetail(id);
    const text = S.draft != null ? S.draft : (d && d.setuk.text) || '', q = S.T.quiz[id] || {};
    return `<div class="head"><div><h1>세부능력 및 특기사항 작성</h1><p class="dim">정보 · 2학년 ${S.cls}반 · 2026 학교생활기록부 기재요령 기준</p></div></div>${classTabs()}
    <div class="split3"><div class="card" style="gap:2px"><h2>학생 목록</h2>${ids.map(x => { const s = statusOf(x); return `<button class="list-btn ${x === id ? 'on' : ''}" data-a="goStudentSetuk" data-id="${x}"><span>${esc(studentLabel(x))}</span><span class="chip ${s === 'done' ? 'good' : s === 'draft' ? 'warn' : 'neutral'}">${s === 'done' ? '검토 완료' : s === 'draft' ? '초안' : '작성 전'}</span></button>`; }).join('')}</div>
    <div class="card"><h2>${esc(id)} ${esc((S.T.students[id] || {}).name || '')} · 정보</h2><textarea id="setukText" style="min-height:240px" aria-label="세부능력 및 특기사항">${esc(text)}</textarea><div><div class="row between small dim"><span>입력 글자 수</span><span class="mono" id="setukCount">${text.length} / 500자</span></div></div>
    <div class="row between"><span class="small dim">NEIS 입력은 교사가 직접 해요</span><div class="row"><button class="btn" data-a="aiDraft" ${S.T.aiEnabled ? '' : 'disabled title="AI 키 설정 필요"'}>AI 초안 만들기</button><button class="btn" data-a="saveSetuk" data-s="draft">임시 저장</button><button class="btn primary" data-a="saveSetuk" data-s="done">검토 완료</button></div></div></div>
    <div class="grid"><div class="card"><h2>근거 기록</h2>${d ? UK.filter(u => q[u]).map(u => `<div class="item"><span class="tag">형성</span><span class="t"><b>${U[u].no} ${esc(U[u].name)}</b><small>${q[u].score} / ${q[u].total}</small></span></div>`).join('') + Object.keys(d.tasks).filter(k => d.tasks[k].status === 'done').map(k => { const t = UK.flatMap(taskList).find(x => x.key === k); return `<div class="item"><span class="tag">수행</span><span class="t"><b>${esc(t ? t.title : k)}</b><small>${fmt(d.tasks[k].ts)}</small></span></div>`; }).join('') || '<p class="dim small">제출 기록이 아직 없어요.</p>' : '<p class="dim small">불러오는 중…</p>'}</div><div class="card" id="checks"><h2>기재 점검</h2><div id="checkBody" class="grid" style="gap:8px">${setukChecks(text)}</div></div></div></div>`;
  };
  V.materials = () => `<div class="head"><div><h1>교육과정·자료</h1><p class="dim">구글 드라이브 등의 공유 링크를 넣으면 학생 화면에 나타나요. 교사 전용 자료는 학생에게 보이지 않아요.</p></div></div>${unitTabs(S.tu, 'tu')}
    ${[['학생 자료', U[S.tu].materials, ''], ['교사 전용 자료', U[S.tu].teacherMaterials, 't']].map(g => `<div class="card"><h2>${g[0]}</h2>${g[1].map((m, i) => { const key = g[2] + S.tu + '-m' + i; return `<div class="item"><span class="tag">${esc(m[0])}</span><span class="t"><b>${esc(m[1])}</b><input id="url-${key}" aria-label="${esc(m[1])} 링크" placeholder="https://" value="${esc(S.T.materials[key] || '')}" style="margin-top:4px"></span><button class="btn" data-a="saveUrl" data-k="${key}">저장</button></div>`; }).join('')}</div>`).join('')}
    <div class="card tone-${U[S.tu].tone}"><h2>성취기준</h2>${U[S.tu].standards.map(s => `<div class="std"><span class="mono">${s[0]}</span><span>${esc(s[1])}</span></div>`).join('')}</div>`;
  V.quizAdmin = () => {
    const u = U[S.tu], ids = classIds(S.cls), qs = ids.map(id => (S.T.quiz[id] || {})[S.tu]).filter(Boolean);
    const rate = i => { const v = qs.filter(q => q.perQ && q.perQ[i] != null); return v.length ? pct(v.filter(q => q.perQ[i]).length, v.length) : null; };
    const essays = ids.map(id => [id, ((S.T.quiz[id] || {})[S.tu] || {}).essay]).filter(x => x[1]);
    return `<div class="head"><div><h1>형성평가 관리 · ${esc(u.name)}</h1><p class="dim">문항은 성취기준에 맞춰 새로 쓴 예시입니다. 평가에 쓰기 전에 검토해 주세요.</p></div></div>${classTabs()}${unitTabs(S.tu, 'tu')}
    <div class="grid g2">${u.questions.map((x, i) => { const r = rate(i); return `<div class="card tone-${u.tone}"><div class="row"><h3>문항 ${i + 1}</h3><span class="chip neutral">${x.o ? '객관식' : '서술형'}</span><span class="chip">${esc(x.u)}</span></div><span class="mono small dim">${x.c}</span><b style="font-weight:500">${esc(x.q)}</b>${x.code ? `<pre class="code">${esc(x.code)}</pre>` : ''}${x.o ? x.o.map((o, k) => `<div class="opt ${k === x.a ? 'correct' : ''}"><span class="n">${k + 1}</span><span>${esc(o)}</span></div>`).join('') : `<div class="fb"><b>예시 답안</b>${x.codeAns ? `<pre class="code">${esc(x.ans)}</pre>` : '<br>' + esc(x.ans)}</div>`}<div class="note">${esc(x.e)}</div>${x.o ? `<div><div class="row between small dim"><span>정답률 (2학년 ${S.cls}반)</span><span class="mono">${r == null ? '응시 전' : r + '%'}</span></div>${barHtml(r || 0, u.tone)}</div>` : ''}</div>`; }).join('')}</div>
    <div class="card"><h2>서술형 답안</h2>${essays.length ? essays.map(e => `<div class="item"><span class="tag">${e[0].slice(3)}</span><span class="t" style="white-space:pre-wrap">${esc(e[1])}</span></div>`).join('') : '<p class="dim">제출된 답안이 없어요.</p>'}</div>`;
  };

  /* ---------- 채팅 ---------- */
  function drawChat() { const t = $('#thread'); if (!t) return; t.innerHTML = ''; S.chat.forEach(m => addBubble(m[0], m[1])); }
  function addBubble(role, text) { const t = $('#thread'), d = document.createElement('div'); d.className = 'msg ' + role; d.textContent = text; t.appendChild(d); t.scrollTop = t.scrollHeight; return d; }
  function glossaryAnswer(q) {
    const low = q.toLowerCase(), hits = window.GLOSSARY.filter(g => g[0].some(k => low.includes(k.toLowerCase()))).slice(0, 2);
    return hits.length ? hits.map(h => h[1]).join('\n\n') : '이 질문은 아직 답하기 어려워요. 단원의 개념 이름을 넣어 다시 물어봐 주세요. (예: 이진 탐색, 지도학습)';
  }
  async function sendChat(text) {
    text = text.trim(); if (!text || S.busy) return;
    S.busy = true; $('#sendBtn').disabled = true; $('#chatInput').value = '';
    S.chat.push(['user', text]); addBubble('user', text);
    const b = addBubble('ai', '생각하는 중…');
    try {
      const msgs = S.chat.filter(m => m[1]).slice(-8).map(m => ({ role: m[0] === 'user' ? 'user' : 'assistant', content: m[1] }));
      while (msgs.length && msgs[0].role !== 'user') msgs.shift();
      const r = await call('chat', { unit: S.u, messages: msgs });
      const ans = r.fallback ? glossaryAnswer(text) : r.text;
      b.textContent = ans; S.chat.push(['ai', ans]);
    } catch (e) { b.textContent = (e && e.message) || '연결이 잠시 끊겼어요. 다시 보내 주세요.'; }
    finally { S.busy = false; $('#sendBtn').disabled = false; $('#thread').scrollTop = 1e9; }
  }

  /* ---------- 동작 ---------- */
  const A = {
    loginRole(d) { S.loginRole = d.r; render(); },
    logout,
    go(d) { S.view = d.v; if (d.v === 'quiz') S.quiz = S.quiz && !S.quiz.done ? S.quiz : null; render(); $('#main').scrollTop = 0; },
    openUnit(d) { S.u = +d.u; S.view = 'unit'; render(); $('#main').scrollTop = 0; },
    openQuiz(d) { S.u = +d.u; S.view = 'quiz'; S.quiz = { u: S.u, i: 0, picks: Array(6).fill(null), essay: '' }; render(); $('#main').scrollTop = 0; },
    pickQuiz(d) { S.u = +d.u; S.quiz = null; render(); },
    openTasks(d) { S.u = +d.u; S.view = 'tasks'; render(); $('#main').scrollTop = 0; },
    pickTasks(d) { S.u = +d.u; render(); },
    async toggle(d) { const on = !S.data.progress[d.k]; try { await call('setLesson', { lesson: d.k, done: on }); if (on) S.data.progress[d.k] = 1; else delete S.data.progress[d.k]; render(); } catch (e) { fail(e); } },
    openMaterial(d) { S.u = +d.u; const ms = msList(S.u), next = ms.findIndex(s => !msDone(S.u, s.key)); S.mi = next === -1 ? 0 : next; S.view = 'material'; render(); $('#main').scrollTop = 0; },
    msGo(d) { S.mi = +d.i; render(); $('#main').scrollTop = 0; },
    async msToggle(d) {
      const key = msKey(S.u, d.k), on = !S.data.materialProgress[key];
      try { await call('setMaterialStep', { step: key, done: on }); if (on) S.data.materialProgress[key] = 1; else delete S.data.materialProgress[key]; render(); } catch (e) { fail(e); }
    },
    pick(d) { const q = S.quiz; if (q.picks[q.i] != null) return; q.picks[q.i] = +d.k; render(); },
    essayDone() { const v = $('#essay').value.trim(); if (!v) { toast('답안을 입력해 주세요.'); return; } S.quiz.essay = v; S.quiz.picks[S.quiz.i] = 'e'; render(); },
    async qnext() {
      const q = S.quiz; if (q.i < 5) { q.i++; render(); $('#main').scrollTop = 0; return; }
      const qs = U[q.u].questions, perQ = qs.map((x, i) => x.o ? (q.picks[i] === x.a ? 1 : 0) : null), score = perQ.reduce((a, b) => a + (b || 0), 0), total = qs.filter(x => x.o).length;
      try { await call('saveQuiz', { unit: q.u, score, total, perQ, essay: q.essay }); S.data.quiz[q.u] = { score, total, perQ, ts: Date.now() }; q.score = score; q.total = total; q.done = true; render(); } catch (e) { fail(e); }
    },
    async task(d, el) { const text = document.getElementById('tx-' + d.k).value.trim(); if (d.s === 'done' && !text) { toast('내용을 입력해 주세요.'); return; } el.disabled = true; try { await call('saveTask', { key: d.k, status: d.s, text }); S.data.tasks[d.k] = { status: d.s, text, ts: Date.now() }; document.getElementById('st-' + d.k).textContent = d.s === 'done' ? '제출 완료 · ' + fmt(Date.now()) : '작성 중'; toast(d.s === 'done' ? '제출했어요.' : '저장했어요.'); } catch (e) { fail(e); } finally { el.disabled = false; } },
    chatOpen() { $('#chat').classList.add('open'); },
    chatClose() { $('#chat').classList.remove('open'); },
    sug(d, el) { sendChat(el.textContent); },
    cls(d) { S.cls = +d.c; S.sel = classIds(S.cls)[0]; S.detail = null; S.draft = null; render(); },
    tu(d) { S.tu = +d.u; render(); },
    async refresh() { try { await loadAll(); S.detail = null; render(); toast('새로 불러왔어요.'); } catch (e) { fail(e); } },
    goStudent(d) { S.sel = d.id; S.detail = null; S.view = 'counsel'; render(); $('#main').scrollTop = 0; },
    goStudentSetuk(d) { S.sel = d.id; S.detail = null; S.draft = null; render(); },
    async saveMemo(d, el) { const memo = $('#memo').value.trim(); if (!memo) return; el.disabled = true; try { await call('saveCounsel', { id: S.sel, memo }); S.detail.counsel.unshift({ ts: Date.now(), memo }); render(); toast('저장했어요.'); } catch (e) { fail(e); el.disabled = false; } },
    async saveSetuk(d) { const text = $('#setukText').value; try { await call('saveSetuk', { id: S.sel, text, status: d.s }); S.T.setuk[S.sel] = d.s; S.detail.setuk = { text, status: d.s }; S.draft = null; render(); toast('저장했어요.'); } catch (e) { fail(e); } },
    async aiDraft(d, el) {
      const id = S.sel, q = S.T.quiz[id] || {}, det = S.detail; if (!det) return;
      const ev = UK.filter(u => q[u]).map(u => `형성평가 ${U[u].name}: ${q[u].score}/${q[u].total}`).concat(Object.keys(det.tasks).filter(k => det.tasks[k].status === 'done').map(k => { const t = UK.flatMap(taskList).find(x => x.key === k); return `수행과제 ${t ? t.title : k}: ${det.tasks[k].text}`; }));
      if (!ev.length) { toast('근거 기록이 없어 초안을 만들 수 없어요.'); return; }
      el.disabled = true; el.textContent = '작성 중…';
      try { const r = await call('aiDraft', { evidence: ev.join('\n'), standards: UK.flatMap(u => U[u].standards.map(s => s.join(' '))).join('\n') }); S.draft = r.text; render(); toast('AI 초안입니다. 관찰 사실과 대조해 고쳐 주세요.'); } catch (e) { fail(e); el.disabled = false; el.textContent = 'AI 초안 만들기'; }
    },
    async saveUrl(d) { const url = document.getElementById('url-' + d.k).value.trim(); if (url && !/^https:\/\//i.test(url)) { toast('https:// 로 시작하는 링크를 넣어 주세요.'); return; } try { await call('saveMaterial', { key: d.k, url }); S.T.materials[d.k] = url; toast('저장했어요.'); } catch (e) { fail(e); } }
  };
  document.addEventListener('click', e => { const el = e.target.closest('[data-a]'); if (el && A[el.dataset.a]) A[el.dataset.a](el.dataset, el, e); });
  document.addEventListener('submit', e => { e.preventDefault(); if (e.target.id === 'loginForm') doLogin(); if (e.target.id === 'chatForm') sendChat($('#chatInput').value); });
  document.addEventListener('keydown', e => { if (e.target.id === 'chatInput' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendChat(e.target.value); } });
  document.addEventListener('change', e => { if (e.target.id === 'sel') { S.sel = e.target.value; S.detail = null; render(); } });
  document.addEventListener('input', e => { if (e.target.id === 'setukText') { const v = e.target.value; S.draft = v; $('#setukCount').textContent = v.length + ' / 500자'; $('#checkBody').innerHTML = setukChecks(v); } });

  (async function start() {
    let saved = null; try { saved = JSON.parse(sessionStorage.getItem('ib-session')); } catch (e) { /* 무시 */ }
    if (saved && saved.token) { Object.assign(S, saved); S.view = S.role === 'teacher' ? 'monitor' : 'home'; try { await loadAll(); } catch (e) { S.role = null; S.token = ''; } }
    render();
  })();
})();
