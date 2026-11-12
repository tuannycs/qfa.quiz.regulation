/* QFA Regulation Practice — single-page quiz app (vanilla JS, no dependencies).
 * All question text is rendered with textContent (never innerHTML).
 */
(function () {
  'use strict';

  // ------------------------------------------------------------------ constants
  var MASTERY_TARGET = 2;        // correct answers in a row (in review mode) to clear a mistake
  var PASS_MARK = 0.6;           // mock exam pass threshold
  var LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
  var LS_MIRROR = 'qfa-progress-mirror';
  var LS_UNSYNCED = 'qfa-progress-unsynced';
  var LS_THEME = 'qfa-theme';
  var LS_PREFS = 'qfa-prefs';
  var MAX_SESSIONS_KEPT = 200;

  var appEl = document.getElementById('app');
  var announcer = document.getElementById('announcer');
  var announcerAssertive = document.getElementById('announcer-assertive');
  var saveStatusEl = document.getElementById('save-status');

  var state = {
    topics: [],               // [{id,name,description,count}]
    questions: [],
    byId: new Map(),
    topicById: new Map(),
    P: null,                  // progress object (see emptyProgress)
    session: null,
    timer: null,
    screen: 'loading',
    lastResults: null
  };

  // ------------------------------------------------------------------ DOM helpers
  function h(tag, props) {
    var el = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'value') el.value = v;
        else if (k === 'checked') el.checked = !!v;
        else if (k === 'disabled') el.disabled = !!v;
        else if (k === 'hidden') el.hidden = !!v;
        else el.setAttribute(k, v === true ? '' : String(v));
      });
    }
    appendKids(el, Array.prototype.slice.call(arguments, 2));
    return el;
  }
  function appendKids(el, kids) {
    kids.forEach(function (k) {
      if (k === null || k === undefined || k === false) return;
      if (Array.isArray(k)) { appendKids(el, k); return; }
      el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
    });
    return el;
  }

  var ICON_PATHS = {
    check: 'M5 12.5l4.5 4.5L19 7.5',
    cross: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
    star: 'M12 3.6l2.55 5.3 5.8.75-4.25 4.02 1.07 5.75L12 16.6l-5.17 2.82 1.07-5.75L3.65 9.65l5.8-.75z',
    sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4',
    moon: 'M20 14.2A8.2 8.2 0 0 1 9.8 4 8.2 8.2 0 1 0 20 14.2z',
    clock: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 7.5V12l3 2',
    arrow: 'M5 12h14M13 6l6 6-6 6',
    back: 'M19 12H5M11 6l-6 6 6 6',
    alert: 'M12 4l9 16H3zM12 10v4.5M12 17.2v.1',
    refresh: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4.2h-4.2',
    layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
    target: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
    timer: 'M12 6.5a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM12 10v3.5M9.5 2.5h5',
    list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
    trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
    download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
    upload: 'M12 20V9M7 14l5-5 5 5M5 4h14'
  };
  function icon(name, filled) {
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    var p = document.createElementNS(NS, 'path');
    p.setAttribute('d', ICON_PATHS[name] || '');
    p.setAttribute('fill', filled ? 'currentColor' : 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', name === 'check' || name === 'cross' ? '2.6' : '2');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(p);
    return svg;
  }

  function announce(msg, assertive) {
    var el = assertive ? announcerAssertive : announcer;
    el.textContent = '';
    setTimeout(function () { el.textContent = msg; }, 30);
  }

  function setScreen(name, nodes, title) {
    state.screen = name;
    appEl.replaceChildren.apply(appEl, [].concat(nodes));
    document.title = (title ? title + ' · ' : '') + 'QFA Regulation Practice';
    window.scrollTo(0, 0);
    var heading = appEl.querySelector('h1');
    if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
    updateNavBadge();
  }

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }

  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function num(v) { v = Number(v); return isFinite(v) && v > 0 ? Math.floor(v) : 0; }
  function pct(a, b) { return b > 0 ? Math.round((a / b) * 100) : 0; }
  function nowIso() { return new Date().toISOString(); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // Options like "All of the above" or "A and B" only make sense in the authored order.
  var ORDER_DEPENDENT = [
    /\b(all|none|both|neither|either)\s+of\s+(the\s+)?(above|these|preceding|previous|following)\b/i,
    /\b(answers?|options?)\s+[A-F]\b/,
    /\b[A-F]\s*(,|and|&|or)\s*[A-F]\b/,
    /\b[A-F]\s+only\b/
  ];
  function optionsMustKeepOrder(q) {
    return q.options.some(function (o) {
      return ORDER_DEPENDENT.some(function (re) { return re.test(o); });
    });
  }

  // ------------------------------------------------------------------ theme
  function effectiveTheme() {
    var t = document.documentElement.getAttribute('data-theme');
    if (t === 'light' || t === 'dark') return t;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function renderThemeToggle() {
    var btn = document.getElementById('theme-toggle');
    var cur = effectiveTheme();
    btn.replaceChildren(icon(cur === 'dark' ? 'sun' : 'moon'));
    var label = cur === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
    btn.setAttribute('aria-label', label);
    btn.title = label;
  }
  document.getElementById('theme-toggle').addEventListener('click', function () {
    var next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    lsSet(LS_THEME, next);
    renderThemeToggle();
  });
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', renderThemeToggle);
  }
  renderThemeToggle();

  // ------------------------------------------------------------------ progress model
  /* progress.json shape:
   * { version: 1, updatedAt: ISO|null,
   *   questions: { [qid]: { seen, correct, lastAnswered: ISO, lastResult: "correct"|"wrong" } },
   *   review:    { [qid]: { topic, wrongCount, wrongIndex: original option index|null, wrongText,
   *                         streak (0..MASTERY_TARGET-1), flagged: bool, addedAt, lastWrongAt } },
   *   sessions:  [ { at, mode, topics:[ids], total, answered, correct, durationSec, passed? } ],
   *   settings:  { mockQuestions, mockMinutes } }
   */
  function emptyProgress() {
    return { version: 1, updatedAt: null, questions: {}, review: {}, sessions: [], settings: { mockQuestions: 50, mockMinutes: 60 } };
  }
  function normalizeProgress(p) {
    var out = emptyProgress();
    if (!isObj(p)) return out;
    out.updatedAt = typeof p.updatedAt === 'string' ? p.updatedAt : null;
    if (isObj(p.questions)) {
      Object.keys(p.questions).forEach(function (id) {
        var s = p.questions[id];
        if (!isObj(s)) return;
        out.questions[id] = {
          seen: num(s.seen), correct: Math.min(num(s.correct), num(s.seen)),
          lastAnswered: typeof s.lastAnswered === 'string' ? s.lastAnswered : null,
          lastResult: s.lastResult === 'correct' || s.lastResult === 'wrong' ? s.lastResult : null
        };
      });
    }
    if (isObj(p.review)) {
      Object.keys(p.review).forEach(function (id) {
        var r = p.review[id];
        if (!isObj(r)) return;
        out.review[id] = {
          topic: typeof r.topic === 'string' ? r.topic : '',
          wrongCount: num(r.wrongCount),
          wrongIndex: typeof r.wrongIndex === 'number' ? r.wrongIndex : null,
          wrongText: typeof r.wrongText === 'string' ? r.wrongText : '',
          streak: Math.min(num(r.streak), MASTERY_TARGET - 1),
          flagged: !!r.flagged,
          addedAt: typeof r.addedAt === 'string' ? r.addedAt : nowIso(),
          lastWrongAt: typeof r.lastWrongAt === 'string' ? r.lastWrongAt : null
        };
        if (out.review[id].wrongCount === 0 && !out.review[id].flagged) delete out.review[id];
      });
    }
    if (Array.isArray(p.sessions)) out.sessions = p.sessions.filter(isObj).slice(-MAX_SESSIONS_KEPT);
    if (isObj(p.settings)) {
      var mqn = num(p.settings.mockQuestions), mmin = num(p.settings.mockMinutes);
      if (mqn) out.settings.mockQuestions = mqn;
      if (mmin) out.settings.mockMinutes = mmin;
    }
    return out;
  }

  /** Records one answer. Returns what happened to the review list for feedback. */
  function recordAnswer(q, chosenOrig, correct, mode) {
    var P = state.P, t = nowIso();
    var s = P.questions[q.id] || (P.questions[q.id] = { seen: 0, correct: 0, lastAnswered: null, lastResult: null });
    s.seen += 1;
    if (correct) s.correct += 1;
    s.lastAnswered = t;
    s.lastResult = correct ? 'correct' : 'wrong';

    var r = P.review[q.id];
    if (!correct) {
      var wasIn = !!r;
      if (!r) r = P.review[q.id] = { topic: q.topic, wrongCount: 0, wrongIndex: null, wrongText: '', streak: 0, flagged: false, addedAt: t, lastWrongAt: null };
      r.topic = q.topic;
      r.wrongCount += 1;
      r.wrongIndex = chosenOrig;
      r.wrongText = q.options[chosenOrig];
      r.lastWrongAt = t;
      var hadStreak = r.streak > 0;
      r.streak = 0;                                  // any wrong answer resets mastery
      return { kind: wasIn ? (hadStreak ? 'reset' : 'again') : 'added', wrongCount: r.wrongCount };
    }
    if (r && mode === 'review') {
      r.streak += 1;
      if (r.streak >= MASTERY_TARGET) {
        delete P.review[q.id];
        return { kind: 'mastered' };
      }
      return { kind: 'progress', streak: r.streak };
    }
    if (r) return { kind: 'still', streak: r.streak };   // correct outside review mode: no mastery credit
    return { kind: 'none' };
  }

  function toggleFlag(qid) {
    var q = state.byId.get(qid);
    var r = state.P.review[qid];
    var flagged;
    if (r && r.flagged) {
      r.flagged = false;
      if (r.wrongCount === 0) delete state.P.review[qid];
      flagged = false;
    } else if (r) {
      r.flagged = true; flagged = true;
    } else {
      state.P.review[qid] = { topic: q ? q.topic : '', wrongCount: 0, wrongIndex: null, wrongText: '', streak: 0, flagged: true, addedAt: nowIso(), lastWrongAt: null };
      flagged = true;
    }
    save();
    announce(flagged ? 'Flagged for review' : 'Flag removed');
    return flagged;
  }
  function isFlagged(qid) { var r = state.P.review[qid]; return !!(r && r.flagged); }

  function activeReviewIds(topicIds) {
    return Object.keys(state.P.review).filter(function (id) {
      var q = state.byId.get(id);
      return q && (!topicIds || topicIds.indexOf(q.topic) !== -1);
    });
  }

  // ------------------------------------------------------------------ persistence
  var saveSeq = 0;
  var saveChain = Promise.resolve();
  var serverReachable = true;

  function setSaveStatus(kind) {
    saveStatusEl.className = 'save-status' + (kind === 'offline' ? ' is-error' : '');
    saveStatusEl.replaceChildren();
    if (kind === 'saving') saveStatusEl.append(h('span', { class: 'save-text', text: 'Saving…' }));
    else if (kind === 'saved') saveStatusEl.append(icon('check'), h('span', { class: 'save-text', text: 'Saved' }));
    else if (kind === 'offline') {
      saveStatusEl.append(icon('alert'), h('span', { class: 'save-text', text: 'Server offline — saved in this browser only' }));
      saveStatusEl.title = 'Progress could not be saved to the server (run start.cmd). It is kept in this browser and will be sent next time an answer is saved.';
    }
    if (kind !== 'offline') saveStatusEl.removeAttribute('title');
  }

  function save() {
    var P = state.P;
    P.updatedAt = nowIso();
    var body = JSON.stringify(P);
    var seq = ++saveSeq;
    lsSet(LS_MIRROR, body);
    lsSet(LS_UNSYNCED, '1');
    setSaveStatus('saving');
    saveChain = saveChain.then(function () {
      if (seq !== saveSeq) return;   // a newer save is queued; it carries this data too
      return fetch('/api/progress', { method: 'PUT', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: body, cache: 'no-store' })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          serverReachable = true;
          if (seq === saveSeq) { lsSet(LS_UNSYNCED, '0'); setSaveStatus('saved'); }
        });
    }).catch(function () {
      serverReachable = false;
      setSaveStatus('offline');
    });
    return saveChain;
  }

  function readMirror() {
    var raw = lsGet(LS_MIRROR);
    if (!raw) return null;
    try { return { progress: JSON.parse(raw), unsynced: lsGet(LS_UNSYNCED) === '1' }; } catch (e) { return null; }
  }

  function getPrefs() { try { return JSON.parse(lsGet(LS_PREFS) || '{}') || {}; } catch (e) { return {}; } }
  function setPrefs(p) { lsSet(LS_PREFS, JSON.stringify(Object.assign(getPrefs(), p))); }

  // ------------------------------------------------------------------ boot
  function renderLoading() {
    setScreen('loading', h('div', { class: 'state-panel', role: 'status' }, h('div', { class: 'spinner', 'aria-hidden': 'true' }), h('p', { text: 'Loading questions…' })), 'Loading');
  }
  function renderServerError(err) {
    setScreen('error', h('div', { class: 'state-panel' },
      h('h1', null, 'Server not reachable'),
      h('p', null, 'The quiz needs its local server. Double-click ', h('code', { text: 'start.cmd' }), ' in the quiz folder, then try again.'),
      h('p', { class: 'small', text: err ? 'Details: ' + err.message : '' }),
      h('button', { type: 'button', class: 'btn btn-primary', onclick: boot }, icon('refresh'), 'Try again')
    ), 'Server not reachable');
  }

  function setBank(bank) {
    state.topics = Array.isArray(bank.topics) ? bank.topics : [];
    state.questions = Array.isArray(bank.questions) ? bank.questions : [];
    state.byId = new Map();
    state.topicById = new Map();
    state.topics.forEach(function (t) { state.topicById.set(t.id, t); });
    state.questions.forEach(function (q) { state.byId.set(q.id, q); });
  }
  function topicName(id) { var t = state.topicById.get(id); return t ? t.name : id; }
  function questionsOf(topicIds) {
    return state.questions.filter(function (q) { return topicIds.indexOf(q.topic) !== -1; });
  }

  function boot() {
    renderLoading();
    fetch('/api/questions', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (bank) {
        setBank(bank);
        return fetch('/api/progress', { cache: 'no-store' })
          .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
          .then(function (p) { return { p: p, server: true }; }, function () { return { p: null, server: false }; });
      })
      .then(function (res) {
        var mirror = readMirror();
        var P = res.p, pushLocal = false;
        if (!res.server) {
          P = mirror ? mirror.progress : null;
          serverReachable = false;
          setSaveStatus('offline');
        } else if (mirror && mirror.unsynced && isObj(mirror.progress) &&
                   String(mirror.progress.updatedAt || '') > String((P && P.updatedAt) || '')) {
          // answers saved while the server was down are newer than the server copy
          P = mirror.progress; pushLocal = true;
        }
        state.P = normalizeProgress(P);
        if (res.server) {
          if (pushLocal) save();
          else { lsSet(LS_MIRROR, JSON.stringify(state.P)); lsSet(LS_UNSYNCED, '0'); }
        }
        renderHome();
      })
      .catch(function (err) { renderServerError(err); });
  }

  // ------------------------------------------------------------------ header
  function updateNavBadge() {
    var badge = document.getElementById('nav-mistakes-count');
    var n = state.P ? activeReviewIds().length : 0;
    badge.hidden = n === 0;
    badge.textContent = String(n);
    document.getElementById('nav-mistakes').setAttribute('aria-label', 'Mistakes' + (n ? ', ' + n + ' to review' : ''));
  }
  /** Leaving via the header: practice/review answers are already saved, so just log the
   *  session and go; a running mock exam asks first (submit / discard / stay). */
  function guardLeaveSession(then) {
    var s = state.session;
    if (!s) { then(); return; }
    if (s.mode !== 'mock') { finishSession(false, false, true); then(); return; }
    quitSession().then(function (left) { if (left && state.screen !== 'results') then(); });
  }
  document.getElementById('brand-home').addEventListener('click', function () {
    if (!state.P) { boot(); return; }
    guardLeaveSession(renderHome);
  });
  document.getElementById('nav-mistakes').addEventListener('click', function () {
    if (!state.P) return;
    guardLeaveSession(function () { renderMistakes(''); });
  });

  // ------------------------------------------------------------------ dialog
  var dialogEl = document.getElementById('dialog');
  /** opts: {title, body: string|Node[], buttons:[{label, value, variant}]} → Promise<value|null> */
  function ask(opts) {
    return new Promise(function (resolve) {
      document.getElementById('dialog-title').textContent = opts.title;
      var body = document.getElementById('dialog-body');
      body.replaceChildren();
      [].concat(opts.body || []).forEach(function (b) { body.append(typeof b === 'string' ? h('p', { text: b }) : b); });
      var btns = document.getElementById('dialog-buttons');
      btns.replaceChildren();
      opts.buttons.forEach(function (b, i) {
        var el = h('button', { type: 'submit', value: String(i), class: 'btn ' + (b.variant || '') }, b.label);
        btns.append(el);
      });
      var done = function () {
        dialogEl.removeEventListener('close', done);
        var v = dialogEl.returnValue;
        resolve(v !== '' && opts.buttons[+v] ? opts.buttons[+v].value : null);
      };
      dialogEl.returnValue = '';
      dialogEl.addEventListener('close', done);
      if (typeof dialogEl.showModal === 'function') {
        dialogEl.showModal();
        var focusIdx = opts.focus !== undefined ? opts.focus : 0;
        var target = btns.children[focusIdx];
        if (target) target.focus();
      } else {
        // very old browsers: fall back to confirm()
        dialogEl.removeEventListener('close', done);
        resolve(window.confirm(opts.title) ? opts.buttons[opts.buttons.length - 1].value : null);
      }
    });
  }

  // ------------------------------------------------------------------ home
  function topicStats(tid) {
    var qs = questionsOf([tid]);
    var answered = 0, latestCorrect = 0;
    qs.forEach(function (q) {
      var s = state.P.questions[q.id];
      if (s && s.seen > 0) { answered++; if (s.lastResult === 'correct') latestCorrect++; }
    });
    return { count: qs.length, answered: answered, latestCorrect: latestCorrect, review: activeReviewIds([tid]).length };
  }

  function renderHome() {
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
    state.session = null;
    var P = state.P;
    var nodes = [];

    if (!serverReachable) {
      nodes.push(h('div', { class: 'notice', role: 'status' }, icon('alert'),
        h('div', null, h('strong', { text: 'Server not reachable. ' }),
          'Progress is being kept in this browser only. Run start.cmd and reload to sync it.')));
    }

    if (!state.questions.length) {
      nodes.push(h('div', { class: 'state-panel' },
        h('h1', null, 'No questions yet'),
        h('p', null, 'Add question bank files to ', h('code', { text: 'data/questions/' }), ' and reload this page.'),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: boot }, icon('refresh'), 'Reload questions')));
      setScreen('home', nodes, 'Home');
      return;
    }

    var total = state.questions.length;
    var answered = 0, latestCorrect = 0;
    state.questions.forEach(function (q) {
      var s = P.questions[q.id];
      if (s && s.seen > 0) { answered++; if (s.lastResult === 'correct') latestCorrect++; }
    });
    var reviewCount = activeReviewIds().length;
    var lastMock = null;
    for (var i = P.sessions.length - 1; i >= 0; i--) { if (P.sessions[i].mode === 'mock') { lastMock = P.sessions[i]; break; } }

    nodes.push(h('div', { class: 'hero' },
      h('div', null,
        h('h1', null, 'QFA Regulation practice'),
        h('p', { class: 'muted', style: 'margin:0', text: plural(total, 'question') + ' across ' + plural(state.topics.length, 'topic') + '.' }))));

    nodes.push(h('div', { class: 'stats' },
      stat(answered + ' / ' + total, 'questions answered'),
      stat(answered ? pct(latestCorrect, answered) + '%' : '—', 'correct on latest attempt'),
      stat(String(reviewCount), 'in your review list'),
      stat(lastMock ? pct(lastMock.correct, lastMock.total) + '%' : '—', lastMock ? 'last mock exam' : 'no mock exam yet')));

    nodes.push(h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn btn-primary action', onclick: function () { renderSetup('practice', null); } },
        h('span', { class: 'action-title' }, icon('layers'), 'Mixed quiz'),
        h('span', { class: 'action-desc', text: 'Practise across the topics you choose, with instant feedback.' })),
      h('button', { type: 'button', class: 'btn action', disabled: reviewCount === 0, onclick: function () { renderSetup('review', null); } },
        h('span', { class: 'action-title' }, icon('target'), 'Review mistakes',
          reviewCount ? h('span', { class: 'badge', 'aria-label': reviewCount + ' to review', text: String(reviewCount) }) : null),
        h('span', { class: 'action-desc', text: reviewCount ? 'Clear a question by getting it right ' + MASTERY_TARGET + ' times in a row.' : 'Nothing to review — wrong answers will appear here.' })),
      h('button', { type: 'button', class: 'btn action', onclick: function () { renderSetup('mock', null); } },
        h('span', { class: 'action-title' }, icon('timer'), 'Mock exam'),
        h('span', { class: 'action-desc', text: 'Timed, no feedback until the end. Set to ' + P.settings.mockQuestions + ' questions / ' + P.settings.mockMinutes + ' min.' }))));

    nodes.push(h('div', { class: 'btn-row actions-secondary' },
      h('button', { type: 'button', class: 'btn btn-sm', onclick: function () { renderMistakes(''); } }, icon('list'), 'Browse mistakes & flags')));

    var grid = h('div', { class: 'topic-grid' });
    state.topics.forEach(function (t) {
      var st = topicStats(t.id);
      grid.append(h('article', { class: 'card topic-card', 'aria-labelledby': 'tc-' + t.id },
        h('h3', { id: 'tc-' + t.id, text: t.name }),
        t.description ? h('p', { class: 'desc', text: t.description }) : h('p', { class: 'desc' }),
        h('div', { class: 'meter', role: 'img', 'aria-label': st.answered + ' of ' + st.count + ' questions answered' },
          h('span', { style: 'width:' + pct(st.answered, st.count) + '%' })),
        h('div', { class: 'topic-meta' },
          h('span', null, h('strong', { text: st.answered + '/' + st.count }), ' answered'),
          h('span', null, h('strong', { text: st.answered ? pct(st.latestCorrect, st.answered) + '%' : '—' }), ' correct'),
          st.review ? h('span', { class: 'chip chip-warn', text: st.review + ' to review' }) : null),
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn btn-primary btn-sm', 'aria-label': 'Practise ' + t.name, onclick: function () { renderSetup('practice', [t.id]); } }, 'Practise'),
          st.review ? h('button', { type: 'button', class: 'btn btn-sm', 'aria-label': 'Review mistakes in ' + t.name, onclick: function () { renderSetup('review', [t.id]); } }, 'Review ' + st.review) : null)));
    });
    nodes.push(h('section', { class: 'section', 'aria-labelledby': 'topics-h' },
      h('div', { class: 'section-head' }, h('h2', { id: 'topics-h', text: 'Topics' })), grid));

    nodes.push(h('section', { class: 'section', 'aria-labelledby': 'data-h' },
      h('div', { class: 'section-head' }, h('h2', { id: 'data-h', text: 'Your progress data' })),
      h('p', { class: 'muted small', text: 'Saved automatically to data/progress.json after every answer (and mirrored in this browser).' }),
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn btn-sm', onclick: exportProgress }, icon('download'), 'Export progress'),
        h('button', { type: 'button', class: 'btn btn-sm', onclick: function () { document.getElementById('import-file').click(); } }, icon('upload'), 'Import progress'),
        h('button', { type: 'button', class: 'btn btn-sm btn-danger', onclick: resetProgress }, icon('trash'), 'Reset progress'))));

    setScreen('home', nodes, 'Home');
  }
  function stat(value, label) {
    return h('div', { class: 'stat' }, h('div', { class: 'stat-value', text: value }), h('div', { class: 'stat-label', text: label }));
  }

  // ------------------------------------------------------------------ export / import / reset
  function exportProgress() {
    var blob = new Blob([JSON.stringify(state.P, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = h('a', { href: url, download: 'qfa-progress-' + new Date().toISOString().slice(0, 10) + '.json' });
    document.body.append(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    announce('Progress exported');
  }
  document.getElementById('import-file').addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var parsed;
      try { parsed = JSON.parse(String(reader.result).replace(/^﻿/, '')); } catch (err) { parsed = null; }
      if (!isObj(parsed) || (!isObj(parsed.questions) && !isObj(parsed.review))) {
        ask({ title: 'Import failed', body: 'That file is not a progress export from this app.', buttons: [{ label: 'OK', value: true, variant: 'btn-primary' }] });
        return;
      }
      var incoming = normalizeProgress(parsed);
      var n = Object.keys(incoming.questions).length, m = Object.keys(incoming.review).length;
      ask({
        title: 'Replace your progress?',
        body: ['The file contains answers for ' + plural(n, 'question') + ' and ' + plural(m, 'review item') + '.', 'Your current progress will be replaced. Consider exporting it first.'],
        buttons: [{ label: 'Cancel', value: false }, { label: 'Replace progress', value: true, variant: 'btn-danger-solid' }]
      }).then(function (ok) {
        if (!ok) return;
        state.P = incoming;
        save();
        renderHome();
        announce('Progress imported');
      });
    };
    reader.readAsText(file);
  });
  function resetProgress() {
    ask({
      title: 'Reset all progress?',
      body: ['This deletes every answer, your review list and your session history. It cannot be undone.', 'Tip: export your progress first if you might want it back.'],
      buttons: [{ label: 'Cancel', value: false }, { label: 'Reset everything', value: true, variant: 'btn-danger-solid' }]
    }).then(function (ok) {
      if (!ok) return;
      var settings = state.P.settings;
      state.P = emptyProgress();
      state.P.settings = settings;
      save();
      renderHome();
      announce('Progress reset');
    });
  }

  // ------------------------------------------------------------------ setup
  function renderSetup(mode, preselect) {
    var prefs = getPrefs();
    var P = state.P;
    var titles = { practice: preselect && preselect.length === 1 ? 'Practise: ' + topicName(preselect[0]) : 'Mixed quiz', review: 'Review mistakes', mock: 'Mock exam' };
    var nodes = [];
    nodes.push(h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: renderHome }, icon('back'), 'Home'));
    nodes.push(h('h1', { text: titles[mode] }));

    if (mode === 'mock') { renderMockSetup(nodes); return; }

    var topics = mode === 'review'
      ? state.topics.filter(function (t) { return activeReviewIds([t.id]).length > 0; })
      : state.topics.filter(function (t) { return t.count > 0; });

    if (mode === 'review') {
      nodes.push(h('p', { class: 'muted', text: 'Questions you got wrong or flagged. Each one leaves the list after ' + MASTERY_TARGET + ' correct answers in a row here; a wrong answer resets it.' }));
      if (!topics.length) {
        nodes.push(h('div', { class: 'card empty' }, icon('check'), h('p', { text: 'Your review list is empty. Nice work.' }),
          h('button', { type: 'button', class: 'btn btn-primary', onclick: renderHome }, 'Back to home')));
        setScreen('setup', h('div', { class: 'narrow setup' }, nodes), titles[mode]);
        return;
      }
    } else {
      nodes.push(h('p', { class: 'muted', text: 'Immediate feedback after each answer. Question and option order are shuffled each time.' }));
    }

    var selected = new Set(preselect && preselect.length ? preselect : topics.map(function (t) { return t.id; }));
    var form = h('form', { class: 'setup-form', novalidate: true });
    var avail = h('p', { class: 'availability', role: 'status', 'aria-live': 'polite' });

    var checks = topics.map(function (t) {
      var count = mode === 'review' ? activeReviewIds([t.id]).length : t.count;
      var cb = h('input', { type: 'checkbox', name: 'topic', value: t.id, checked: selected.has(t.id) });
      cb.addEventListener('change', update);
      return h('label', { class: 'check' }, cb, h('span', null, t.name, ' ', h('span', { class: 'count', text: '(' + count + (mode === 'review' ? ' to review' : '') + ')' })));
    });
    var setAll = function (v) { form.querySelectorAll('input[name=topic]').forEach(function (c) { c.checked = v; }); update(); };
    form.append(h('fieldset', null, h('legend', { text: 'Topics' }),
      topics.length > 1 ? h('div', null,
        h('button', { type: 'button', class: 'link-btn', onclick: function () { setAll(true); } }, 'Select all'), ' · ',
        h('button', { type: 'button', class: 'link-btn', onclick: function () { setAll(false); } }, 'Clear')) : null,
      h('div', { class: 'check-list' }, checks)));

    var countPref = prefs.count === '10' || prefs.count === '20' || prefs.count === 'all' ? prefs.count : (mode === 'review' ? 'all' : '10');
    var seg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Number of questions' });
    ['10', '20', 'all'].forEach(function (v) {
      var r = h('input', { type: 'radio', name: 'count', value: v, checked: v === countPref });
      r.addEventListener('change', update);
      seg.append(h('label', null, r, h('span', { text: v === 'all' ? 'All' : v })));
    });
    form.append(h('fieldset', null, h('legend', { text: 'Number of questions' }), seg));

    var unseenCb = null;
    if (mode === 'practice') {
      unseenCb = h('input', { type: 'checkbox', name: 'unseen', checked: !!prefs.unseen });
      unseenCb.addEventListener('change', update);
      form.append(h('fieldset', null, h('legend', { text: 'Options' }),
        h('label', { class: 'check' }, unseenCb, h('span', { text: 'Only questions I haven’t answered yet' }))));
    }

    var startBtn = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Start', icon('arrow'));
    form.append(avail, h('div', { class: 'btn-row' }, startBtn));

    function currentPool() {
      var tids = Array.prototype.map.call(form.querySelectorAll('input[name=topic]:checked'), function (c) { return c.value; });
      var ids;
      if (mode === 'review') ids = activeReviewIds(tids);
      else {
        ids = questionsOf(tids).map(function (q) { return q.id; });
        if (unseenCb && unseenCb.checked) ids = ids.filter(function (id) { var s = P.questions[id]; return !s || !s.seen; });
      }
      return { tids: tids, ids: ids };
    }
    function chosenCount() { var r = form.querySelector('input[name=count]:checked'); return r ? r.value : '10'; }
    function update() {
      var pool = currentPool();
      var c = chosenCount();
      var n = c === 'all' ? pool.ids.length : Math.min(+c, pool.ids.length);
      if (!pool.tids.length) avail.textContent = 'Select at least one topic.';
      else if (!pool.ids.length) avail.textContent = unseenCb && unseenCb.checked ? 'No unseen questions left in these topics — untick “only unseen” to practise again.' : 'No questions available.';
      else avail.textContent = plural(n, 'question') + ' in this session (' + pool.ids.length + ' available).';
      startBtn.disabled = n === 0;
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var pool = currentPool();
      var c = chosenCount();
      if (!pool.ids.length) return;
      setPrefs({ count: c, unseen: unseenCb ? unseenCb.checked : prefs.unseen });
      var ids = shuffle(pool.ids);
      if (c !== 'all') ids = ids.slice(0, +c);
      startSession(mode, ids, { title: titles[mode], topics: pool.tids });
    });
    nodes.push(form);
    setScreen('setup', h('div', { class: 'narrow setup' }, nodes), titles[mode]);
    update();
  }

  /** Proportional (largest remainder) allocation of n questions across topics. */
  function mockAllocation(n) {
    var topics = state.topics.filter(function (t) { return t.count > 0; });
    var total = topics.reduce(function (a, t) { return a + t.count; }, 0);
    n = Math.min(n, total);
    var alloc = topics.map(function (t) {
      var exact = n * t.count / total;
      return { id: t.id, name: t.name, count: t.count, n: Math.floor(exact), rem: exact - Math.floor(exact) };
    });
    var left = n - alloc.reduce(function (a, x) { return a + x.n; }, 0);
    alloc.slice().sort(function (a, b) { return b.rem - a.rem; }).forEach(function (x) {
      if (left > 0 && x.n < x.count) { x.n++; left--; }
    });
    return alloc;
  }

  function renderMockSetup(nodes) {
    var P = state.P;
    var total = state.questions.length;
    nodes.push(h('p', { class: 'muted', text: 'A timed exam with no feedback until you finish. Questions are sampled from every topic in proportion to its size. Pass mark: ' + Math.round(PASS_MARK * 100) + '%.' }));
    var form = h('form', { novalidate: true });
    var qIn = h('input', { type: 'number', id: 'mock-q', min: '5', max: String(total), step: '1', value: String(Math.min(P.settings.mockQuestions, total)), inputmode: 'numeric' });
    var mIn = h('input', { type: 'number', id: 'mock-m', min: '1', max: '300', step: '1', value: String(P.settings.mockMinutes), inputmode: 'numeric' });
    var list = h('ul', { class: 'breakdown' });
    var note = h('p', { class: 'availability', role: 'status', 'aria-live': 'polite' });
    var startBtn = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Start mock exam', icon('arrow'));
    form.append(h('fieldset', null, h('legend', { text: 'Exam settings' }),
      h('div', { class: 'field-row' },
        h('div', { class: 'field' }, h('label', { for: 'mock-q', text: 'Questions (max ' + total + ')' }), qIn),
        h('div', { class: 'field' }, h('label', { for: 'mock-m', text: 'Time limit (minutes)' }), mIn))),
      h('fieldset', null, h('legend', { text: 'Questions per topic' }), list),
      note,
      h('div', { class: 'btn-row' }, startBtn,
        h('button', { type: 'button', class: 'btn', onclick: function () { qIn.value = '50'; mIn.value = '60'; update(); } }, 'Use defaults (50 / 60 min)')));
    function values() {
      var n = Math.max(1, Math.min(total, Math.floor(+qIn.value || 0)));
      var m = Math.max(1, Math.min(300, Math.floor(+mIn.value || 0)));
      return { n: n, m: m, valid: +qIn.value >= 1 && +mIn.value >= 1 };
    }
    function update() {
      var v = values();
      list.replaceChildren();
      mockAllocation(v.n).forEach(function (a) {
        list.append(h('li', null, h('span', { text: a.name }), h('strong', { text: String(a.n) })));
      });
      note.textContent = v.valid ? plural(v.n, 'question') + ' in ' + plural(v.m, 'minute') + ' (about ' + (Math.round((v.m * 60) / v.n * 10) / 10) + ' seconds per question).' : 'Enter a number of questions and a time limit.';
      startBtn.disabled = !v.valid || total === 0;
    }
    qIn.addEventListener('input', update);
    mIn.addEventListener('input', update);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = values();
      if (!v.valid) return;
      P.settings.mockQuestions = v.n;
      P.settings.mockMinutes = v.m;
      save();
      var ids = [];
      mockAllocation(v.n).forEach(function (a) {
        ids = ids.concat(shuffle(questionsOf([a.id]).map(function (q) { return q.id; })).slice(0, a.n));
      });
      startSession('mock', ids, { title: 'Mock exam', minutes: v.m, topics: state.topics.map(function (t) { return t.id; }) });
    });
    nodes.push(form);
    setScreen('setup', h('div', { class: 'narrow setup' }, nodes), 'Mock exam');
    update();
  }

  // ------------------------------------------------------------------ sessions
  function makeItem(q) {
    var idx = q.options.map(function (_, i) { return i; });
    return {
      id: q.id,
      order: optionsMustKeepOrder(q) ? idx : shuffle(idx),   // order[displayPos] = original option index
      chosen: null,                                          // original option index picked
      correct: null,
      outcome: null
    };
  }

  function startSession(mode, ids, opts) {
    var items = shuffle(ids).filter(function (id) { return state.byId.has(id); })
      .map(function (id) { return makeItem(state.byId.get(id)); });
    if (!items.length) { renderHome(); return; }
    state.session = {
      mode: mode, title: opts.title, topics: opts.topics || [], items: items, index: 0,
      startedAt: Date.now(), minutes: opts.minutes || 0,
      endsAt: mode === 'mock' ? Date.now() + opts.minutes * 60000 : 0, warned: {}
    };
    if (mode === 'mock') {
      startTimer();
      renderMockQuestion();
    } else {
      renderPracticeQuestion();
    }
  }

  function quitSession() {
    var s = state.session;
    if (!s) return Promise.resolve(true);
    if (s.mode !== 'mock') {
      finishSession(false);
      return Promise.resolve(true);
    }
    var answered = s.items.filter(function (it) { return it.chosen !== null; }).length;
    return ask({
      title: 'Leave the mock exam?',
      body: ['You have answered ' + answered + ' of ' + s.items.length + ' questions.', 'Submit now to get your score (unanswered questions count as wrong), or discard this attempt.'],
      buttons: [{ label: 'Keep going', value: 'stay' }, { label: 'Discard attempt', value: 'discard', variant: 'btn-danger' }, { label: 'Submit now', value: 'submit', variant: 'btn-primary' }],
      focus: 0
    }).then(function (v) {
      if (v === 'submit') { finishSession(false); return true; }
      if (v === 'discard') { stopTimer(); state.session = null; renderHome(); return true; }
      return false;
    });
  }

  function starButton(qid) {
    var btn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm star-btn' });
    function paint() {
      var on = isFlagged(qid);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.replaceChildren(icon('star', on), on ? 'Flagged' : 'Flag');
      btn.title = on ? 'Flagged for review — click to remove the flag' : 'Flag this question for your review list';
    }
    btn.addEventListener('click', function () { toggleFlag(qid); paint(); updateNavBadge(); if (state.session && state.session.mode === 'mock') refreshPalette(); });
    paint();
    return btn;
  }

  // ---------- practice / review question
  function renderPracticeQuestion() {
    var s = state.session, it = s.items[s.index], q = state.byId.get(it.id);
    var n = s.items.length;
    var opts = h('div', { class: 'options with-status', role: 'group', 'aria-label': 'Answer options' });
    it.order.forEach(function (orig, pos) {
      opts.append(h('button', { type: 'button', class: 'option', 'data-pos': String(pos), onclick: function () { answerPractice(pos); } },
        h('span', { class: 'opt-letter', 'aria-hidden': 'true', text: LETTERS[pos] }),
        h('span', { class: 'opt-text' }, h('span', { class: 'sr-only', text: 'Option ' + LETTERS[pos] + ': ' }), q.options[orig]),
        h('span', { class: 'opt-status' })));
    });
    var feedback = h('div', { class: 'feedback', id: 'feedback', 'aria-live': 'polite' });
    var r = state.P.review[q.id];
    var meta = h('div', { class: 'q-meta' },
      h('span', { class: 'chip', text: topicName(q.topic) }),
      q.subtopic ? h('span', { class: 'chip', text: q.subtopic }) : null,
      h('span', { class: 'chip', text: q.difficulty }),
      s.mode === 'review' && r ? h('span', { class: 'chip chip-warn', text: 'Mastery ' + r.streak + '/' + MASTERY_TARGET }) : null);

    var node = h('div', { class: 'narrow quiz' },
      h('div', { class: 'quiz-top' },
        h('span', { class: 'count', text: 'Question ' + (s.index + 1) + ' of ' + n }),
        h('span', { class: 'muted small', text: s.mode === 'review' ? 'Review' : 'Practice' }),
        h('span', { class: 'spacer' }),
        starButton(q.id),
        h('button', { type: 'button', class: 'btn btn-sm', onclick: function () { quitSession(); } }, 'End session')),
      h('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Session progress', 'aria-valuemin': '0', 'aria-valuemax': String(n), 'aria-valuenow': String(s.index) },
        h('span', { style: 'width:' + pct(s.index, n) + '%' })),
      meta,
      h('h1', { class: 'q-text', text: q.question }),
      opts,
      feedback,
      h('p', { class: 'kbd-hint' }, 'Keys: ', h('kbd', { text: '1' }), '–', h('kbd', { text: String(it.order.length) }), ' or ', h('kbd', { text: 'A' }), '–', h('kbd', { text: LETTERS[it.order.length - 1] }), ' to answer, ', h('kbd', { text: 'Enter' }), ' / ', h('kbd', { text: '→' }), ' for next.'));
    setScreen('quiz', node, 'Question ' + (s.index + 1));
  }

  function answerPractice(pos) {
    var s = state.session;
    if (!s || s.mode === 'mock') return;
    var it = s.items[s.index];
    if (it.chosen !== null || pos < 0 || pos >= it.order.length) return;
    var q = state.byId.get(it.id);
    it.chosen = it.order[pos];
    it.correct = it.chosen === q.answer;
    it.outcome = recordAnswer(q, it.chosen, it.correct, s.mode);
    save();
    updateNavBadge();

    var correctPos = it.order.indexOf(q.answer);
    var buttons = appEl.querySelectorAll('.option');
    buttons.forEach(function (b, i) {
      b.disabled = true;
      var status = b.querySelector('.opt-status');
      if (i === correctPos) {
        b.classList.add('is-correct');
        status.replaceChildren(icon('check'), h('span', { class: 'status-text', text: i === pos ? 'Your answer' : 'Correct answer' }));
      } else if (i === pos) {
        b.classList.add('is-wrong');
        status.replaceChildren(icon('cross'), h('span', { class: 'status-text', text: 'Your answer' }));
      } else {
        b.classList.add('is-dim');
      }
    });

    var fb = document.getElementById('feedback');
    var isLast = s.index === s.items.length - 1;
    var nextBtn = h('button', { type: 'button', class: 'btn btn-primary', id: 'next-btn', onclick: nextPractice }, isLast ? 'See results' : 'Next question', icon('arrow'));
    var parts = [];
    if (it.correct) parts.push(h('p', { class: 'verdict ok' }, icon('check'), 'Correct'));
    else parts.push(h('p', { class: 'verdict bad' }, icon('cross'), 'Incorrect'),
      h('p', null, 'The correct answer is ', h('strong', { text: LETTERS[correctPos] + ': ' + q.options[q.answer] }), '.'));
    parts.push(outcomeNode(it.outcome, s.mode));
    if (q.explanation) parts.push(h('div', { class: 'explain' }, h('p', { text: q.explanation })));
    if (q.reference) parts.push(h('p', { class: 'ref', text: 'Reference: ' + q.reference }));
    parts.push(h('div', { class: 'next-row' }, nextBtn));
    fb.replaceChildren.apply(fb, parts.filter(Boolean));
    nextBtn.focus({ preventScroll: true });
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    fb.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }

  function pips(n) {
    var wrap = h('span', { class: 'pips', 'aria-hidden': 'true' });
    for (var i = 0; i < MASTERY_TARGET; i++) wrap.append(h('span', { class: 'pip' + (i < n ? ' on' : '') }));
    return wrap;
  }
  function outcomeNode(o, mode) {
    if (!o) return null;
    switch (o.kind) {
      case 'mastered': return h('p', { class: 'mastery' }, pips(MASTERY_TARGET), 'Mastered — removed from your review list.');
      case 'progress': return h('p', { class: 'mastery' }, pips(o.streak), 'Mastery ' + o.streak + '/' + MASTERY_TARGET + ' — get it right once more in review to clear it.');
      case 'added': return h('p', { class: 'mastery' }, 'Added to your review list.');
      case 'reset': return h('p', { class: 'mastery' }, pips(0), 'Mastery reset to 0/' + MASTERY_TARGET + ' (wrong ' + o.wrongCount + '×).');
      case 'again': return h('p', { class: 'mastery' }, mode === 'review' ? pips(0) : null, 'Still in your review list (wrong ' + o.wrongCount + '×).');
      case 'still': return mode === 'review' ? null : h('p', { class: 'mastery muted' }, 'This one is in your review list — clear it from “Review mistakes”.');
      default: return null;
    }
  }

  function nextPractice() {
    var s = state.session;
    if (!s) return;
    if (s.items[s.index].chosen === null) return;
    if (s.index >= s.items.length - 1) { finishSession(true); return; }
    s.index++;
    renderPracticeQuestion();
  }

  // ---------- mock question
  function startTimer() {
    stopTimer();
    state.timer = setInterval(tick, 1000);
  }
  function stopTimer() { if (state.timer) { clearInterval(state.timer); state.timer = null; } }
  function fmtTime(ms) {
    var sec = Math.max(0, Math.ceil(ms / 1000));
    var m = Math.floor(sec / 60), s2 = sec % 60;
    return m + ':' + (s2 < 10 ? '0' : '') + s2;
  }
  function tick() {
    var s = state.session;
    if (!s || s.mode !== 'mock') { stopTimer(); return; }
    var left = s.endsAt - Date.now();
    var el = document.getElementById('mock-timer-text');
    if (el) el.textContent = fmtTime(left);
    var wrap = document.getElementById('mock-timer');
    if (wrap) wrap.classList.toggle('warn', left <= 5 * 60000);
    [[5, '5 minutes remaining'], [1, '1 minute remaining']].forEach(function (w) {
      if (left <= w[0] * 60000 && !s.warned[w[0]] && s.minutes > w[0]) { s.warned[w[0]] = true; announce(w[1], true); }
    });
    if (left <= 0) {
      stopTimer();
      finishSession(true, true);
    }
  }

  function renderMockQuestion() {
    var s = state.session, it = s.items[s.index], q = state.byId.get(it.id);
    var n = s.items.length;
    var opts = h('div', { class: 'options', role: 'group', 'aria-label': 'Answer options' });
    it.order.forEach(function (orig, pos) {
      opts.append(h('button', { type: 'button', class: 'option' + (it.chosen === orig ? ' is-selected' : ''), 'aria-pressed': it.chosen === orig ? 'true' : 'false', onclick: function () { selectMock(pos); } },
        h('span', { class: 'opt-letter', 'aria-hidden': 'true', text: LETTERS[pos] }),
        h('span', { class: 'opt-text' }, h('span', { class: 'sr-only', text: 'Option ' + LETTERS[pos] + ': ' }), q.options[orig]),
        h('span', { class: 'opt-status' }, it.chosen === orig ? icon('check') : null)));
    });
    var answeredCount = s.items.filter(function (x) { return x.chosen !== null; }).length;
    var isLast = s.index === n - 1;
    var node = h('div', { class: 'narrow quiz' },
      h('div', { class: 'quiz-top' },
        h('span', { class: 'timer', id: 'mock-timer', role: 'timer', 'aria-label': 'Time remaining' }, icon('clock'), h('span', { id: 'mock-timer-text', text: fmtTime(s.endsAt - Date.now()) })),
        h('span', { class: 'count', text: 'Question ' + (s.index + 1) + ' of ' + n }),
        h('span', { class: 'spacer' }),
        starButton(q.id),
        h('button', { type: 'button', class: 'btn btn-sm', onclick: function () { quitSession(); } }, 'Leave')),
      h('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Questions answered', 'aria-valuemin': '0', 'aria-valuemax': String(n), 'aria-valuenow': String(answeredCount), id: 'mock-progress' },
        h('span', { style: 'width:' + pct(answeredCount, n) + '%' })),
      h('div', { class: 'q-meta' }, h('span', { class: 'chip', text: topicName(q.topic) })),
      h('h1', { class: 'q-text', text: q.question }),
      opts,
      h('div', { class: 'mock-nav' },
        h('button', { type: 'button', class: 'btn', disabled: s.index === 0, onclick: function () { gotoMock(s.index - 1); } }, icon('back'), 'Previous'),
        isLast
          ? h('button', { type: 'button', class: 'btn btn-primary', onclick: confirmFinishMock }, 'Finish exam')
          : h('button', { type: 'button', class: 'btn btn-primary', onclick: function () { gotoMock(s.index + 1); } }, 'Next', icon('arrow'))),
      h('section', { class: 'section card', 'aria-labelledby': 'pal-h' },
        h('div', { class: 'section-head' },
          h('h2', { id: 'pal-h', text: 'All questions' }),
          h('span', { class: 'muted small', id: 'mock-answered', text: answeredCount + ' of ' + n + ' answered' })),
        h('div', { class: 'palette', id: 'palette' }),
        h('div', { class: 'palette-legend' }, h('span', { text: 'Shaded = answered' }), h('span', { text: '★ = flagged' }), h('span', { text: 'Outlined = current' })),
        h('div', { class: 'btn-row', style: 'margin-top:12px' }, h('button', { type: 'button', class: 'btn', onclick: confirmFinishMock }, 'Finish exam'))),
      h('p', { class: 'kbd-hint' }, 'Keys: ', h('kbd', { text: '1' }), '–', h('kbd', { text: String(it.order.length) }), ' or ', h('kbd', { text: 'A' }), '–', h('kbd', { text: LETTERS[it.order.length - 1] }), ' to choose, ', h('kbd', { text: '←' }), ' / ', h('kbd', { text: '→' }), ' to move. You can change answers until you finish.'));
    setScreen('mock', node, 'Mock exam');
    refreshPalette();
  }

  function refreshPalette() {
    var s = state.session;
    var pal = document.getElementById('palette');
    if (!s || !pal) return;
    pal.replaceChildren();
    s.items.forEach(function (x, i) {
      var answered = x.chosen !== null, flagged = isFlagged(x.id);
      pal.append(h('button', {
        type: 'button',
        class: (answered ? 'answered' : '') + (i === s.index ? ' current' : ''),
        'aria-label': 'Question ' + (i + 1) + (answered ? ', answered' : ', not answered') + (flagged ? ', flagged' : ''),
        'aria-current': i === s.index ? 'step' : null,
        onclick: function () { gotoMock(i); }
      }, String(i + 1), flagged ? h('span', { class: 'flag-dot', 'aria-hidden': 'true', text: '★' }) : null));
    });
  }

  function selectMock(pos) {
    var s = state.session;
    if (!s || s.mode !== 'mock') return;
    var it = s.items[s.index];
    if (pos < 0 || pos >= it.order.length) return;
    it.chosen = it.order[pos];
    appEl.querySelectorAll('.option').forEach(function (b, i) {
      var on = i === pos;
      b.classList.toggle('is-selected', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.querySelector('.opt-status').replaceChildren(on ? icon('check') : '');
    });
    var answeredCount = s.items.filter(function (x) { return x.chosen !== null; }).length;
    var prog = document.getElementById('mock-progress');
    if (prog) { prog.setAttribute('aria-valuenow', String(answeredCount)); prog.firstChild.style.width = pct(answeredCount, s.items.length) + '%'; }
    var ac = document.getElementById('mock-answered');
    if (ac) ac.textContent = answeredCount + ' of ' + s.items.length + ' answered';
    refreshPalette();
    announce('Selected ' + LETTERS[pos]);
  }

  function gotoMock(i) {
    var s = state.session;
    if (!s || i < 0 || i >= s.items.length) return;
    s.index = i;
    renderMockQuestion();
  }

  function confirmFinishMock() {
    var s = state.session;
    var unanswered = s.items.filter(function (x) { return x.chosen === null; }).length;
    if (!unanswered) {
      ask({ title: 'Finish the exam?', body: 'You have answered every question. You won’t be able to change answers after this.', buttons: [{ label: 'Keep checking', value: false }, { label: 'Finish exam', value: true, variant: 'btn-primary' }], focus: 1 })
        .then(function (ok) { if (ok && state.session === s) finishSession(true); });
      return;
    }
    ask({ title: 'Finish with ' + plural(unanswered, 'unanswered question') + '?', body: 'Unanswered questions count as wrong.', buttons: [{ label: 'Keep going', value: false }, { label: 'Finish exam', value: true, variant: 'btn-primary' }] })
      .then(function (ok) { if (ok && state.session === s) finishSession(true); });
  }

  // ---------- finishing / results
  function finishSession(completed, timeUp, silent) {
    var s = state.session;
    if (!s) return;
    stopTimer();
    if (dialogEl.open) dialogEl.close();
    state.session = null;

    if (s.mode === 'mock') {
      s.items.forEach(function (it) {
        if (it.chosen === null) return;
        var q = state.byId.get(it.id);
        it.correct = it.chosen === q.answer;
        it.outcome = recordAnswer(q, it.chosen, it.correct, 'mock');
      });
    }
    var counted = s.mode === 'mock' ? s.items : s.items.filter(function (it) { return it.chosen !== null; });
    if (!counted.length) { if (!silent) renderHome(); return; }

    var correct = counted.filter(function (it) { return it.correct === true; }).length;
    var byTopic = new Map();
    counted.forEach(function (it) {
      var q = state.byId.get(it.id);
      var t = byTopic.get(q.topic) || { id: q.topic, total: 0, correct: 0 };
      t.total++; if (it.correct === true) t.correct++;
      byTopic.set(q.topic, t);
    });
    var topicRows = [];
    state.topics.forEach(function (t) { if (byTopic.has(t.id)) topicRows.push(byTopic.get(t.id)); });

    var res = {
      mode: s.mode, title: s.title, completed: completed, timeUp: !!timeUp,
      items: counted, total: counted.length,
      answered: counted.filter(function (it) { return it.chosen !== null; }).length,
      correct: correct, topics: topicRows,
      durationSec: Math.round((Date.now() - s.startedAt) / 1000),
      sessionLength: s.items.length,
      mastered: counted.filter(function (it) { return it.outcome && it.outcome.kind === 'mastered'; }).length
    };
    var entry = { at: nowIso(), mode: s.mode, topics: s.topics, total: res.total, answered: res.answered, correct: res.correct, durationSec: res.durationSec };
    if (s.mode === 'mock') entry.passed = res.total > 0 && correct / res.total >= PASS_MARK;
    state.P.sessions.push(entry);
    if (state.P.sessions.length > MAX_SESSIONS_KEPT) state.P.sessions = state.P.sessions.slice(-MAX_SESSIONS_KEPT);
    save();
    state.lastResults = res;
    if (!silent) renderResults(res);
  }

  function fmtDuration(sec) {
    var m = Math.floor(sec / 60), s2 = sec % 60;
    return m ? m + ' min ' + s2 + ' s' : s2 + ' s';
  }

  function answerBlock(q, it) {
    var correctText = q.options[q.answer];
    var blocks = [];
    if (it.chosen === null) blocks.push(h('div', { class: 'ans none' }, h('span', { class: 'label', text: 'Your answer:' }), h('span', { text: 'Not answered' })));
    else if (it.chosen !== q.answer) blocks.push(h('div', { class: 'ans bad' }, icon('cross'), h('span', { class: 'label', text: 'Your answer:' }), h('span', { text: q.options[it.chosen] })));
    blocks.push(h('div', { class: 'ans ok' }, icon('check'), h('span', { class: 'label', text: 'Correct answer:' }), h('span', { text: correctText })));
    return blocks;
  }

  function renderResults(res) {
    var isMock = res.mode === 'mock';
    var p = pct(res.correct, res.total);
    var passed = res.total > 0 && res.correct / res.total >= PASS_MARK;
    var wrong = res.items.filter(function (it) { return it.correct !== true; });
    var nodes = [];
    var heading = isMock ? 'Mock exam results' : (res.completed ? 'Session complete' : 'Session ended');
    nodes.push(h('h1', { text: heading }));
    if (res.timeUp) nodes.push(h('div', { class: 'notice', role: 'status' }, icon('clock'), h('div', { text: 'Time is up — your exam was submitted automatically.' })));
    if (!isMock && !res.completed) nodes.push(h('p', { class: 'muted', text: 'You answered ' + res.answered + ' of ' + res.sessionLength + ' questions. Every answer was saved.' }));

    nodes.push(h('div', { class: 'card score-card' },
      h('div', null, h('div', { class: 'score-big', text: res.correct + ' / ' + res.total }), h('div', { class: 'score-pct', text: p + '% correct' })),
      isMock ? h('div', { class: 'pass ' + (passed ? 'ok' : 'bad') }, icon(passed ? 'check' : 'cross'), passed ? 'Pass' : 'Below pass mark', h('span', { class: 'small', style: 'font-weight:600', text: ' (' + Math.round(PASS_MARK * 100) + '% needed)' })) : null,
      h('div', { class: 'muted small' },
        h('div', { text: 'Time: ' + fmtDuration(res.durationSec) }),
        isMock && res.answered < res.total ? h('div', { text: plural(res.total - res.answered, 'question') + ' not answered' }) : null,
        res.mode === 'review' ? h('div', { text: plural(res.mastered, 'question') + ' mastered and cleared' }) : null)));

    nodes.push(h('div', { class: 'btn-row', style: 'margin-top:16px' },
      h('button', { type: 'button', class: 'btn btn-primary', disabled: !wrong.length, onclick: function () { retryWrong(res, wrong); } }, icon('refresh'), wrong.length ? 'Retry wrong ones now (' + wrong.length + ')' : 'No wrong answers'),
      h('button', { type: 'button', class: 'btn', onclick: renderHome }, 'Back to home')));

    var tbody = h('tbody');
    res.topics.forEach(function (t) {
      tbody.append(h('tr', null, h('td', { text: topicName(t.id) }), h('td', { class: 'num', text: t.correct + ' / ' + t.total }), h('td', { class: 'num', text: pct(t.correct, t.total) + '%' })));
    });
    nodes.push(h('section', { class: 'section', 'aria-labelledby': 'bt-h' },
      h('h2', { id: 'bt-h', text: 'By topic' }),
      h('div', { class: 'card table-wrap' }, h('table', { class: 'breakdown-table' },
        h('thead', null, h('tr', null, h('th', { scope: 'col', text: 'Topic' }), h('th', { scope: 'col', class: 'num', text: 'Score' }), h('th', { scope: 'col', class: 'num', text: '%' }))),
        tbody))));

    var list = h('div', { class: 'qa-list' });
    wrong.forEach(function (it) {
      var q = state.byId.get(it.id);
      list.append(h('article', { class: 'card qa' },
        h('div', { class: 'qa-head' }, h('span', { class: 'chip', text: topicName(q.topic) }), h('span', { class: 'spacer' }), starButton(q.id)),
        h('p', { class: 'q-text', text: q.question }),
        answerBlock(q, it),
        q.explanation ? h('div', { class: 'explain' }, h('p', { text: q.explanation })) : null,
        q.reference ? h('p', { class: 'ref', text: 'Reference: ' + q.reference }) : null));
    });
    nodes.push(h('section', { class: 'section', 'aria-labelledby': 'wr-h' },
      h('h2', { id: 'wr-h', text: wrong.length ? (isMock ? 'Questions to review (' + wrong.length + ')' : 'Wrong answers (' + wrong.length + ')') : 'No wrong answers' }),
      wrong.length ? list : h('div', { class: 'card empty' }, icon('check'), h('p', { text: 'Every answer correct. Well done.' }))));

    setScreen('results', h('div', { class: 'narrow' }, nodes), heading);
    announce(heading + ': ' + res.correct + ' out of ' + res.total + ' correct' + (isMock ? (passed ? ', pass' : ', below the pass mark') : ''));
  }

  function retryWrong(res, wrong) {
    var ids = wrong.map(function (it) { return it.id; });
    var mode = 'practice';
    if (res.mode === 'review') {
      var still = ids.filter(function (id) { return state.P.review[id]; });
      if (still.length === ids.length) mode = 'review';
    }
    startSession(mode, ids, { title: 'Retry wrong answers', topics: res.topics.map(function (t) { return t.id; }) });
  }

  // ------------------------------------------------------------------ mistakes browser
  function renderMistakes(filterTopic) {
    var P = state.P;
    var ids = Object.keys(P.review);
    var entries = ids.map(function (id) { return { id: id, r: P.review[id], q: state.byId.get(id) }; })
      .filter(function (e) { return !filterTopic || (e.q ? e.q.topic : e.r.topic) === filterTopic; })
      .sort(function (a, b) { return String(b.r.lastWrongAt || b.r.addedAt).localeCompare(String(a.r.lastWrongAt || a.r.addedAt)); });

    var nodes = [];
    nodes.push(h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: renderHome }, icon('back'), 'Home'));
    nodes.push(h('h1', { text: 'Mistakes & flagged questions' }));
    nodes.push(h('p', { class: 'muted', text: 'Every wrong answer lands here. A question is cleared after ' + MASTERY_TARGET + ' correct answers in a row in “Review mistakes”.' }));

    var topicsWithItems = state.topics.filter(function (t) { return ids.some(function (id) { var q = state.byId.get(id); return q && q.topic === t.id; }); });
    var sel = h('select', { id: 'mf-topic' });
    sel.append(h('option', { value: '', text: 'All topics (' + ids.length + ')' }));
    topicsWithItems.forEach(function (t) { sel.append(h('option', { value: t.id, text: t.name + ' (' + activeReviewIds([t.id]).length + ')' })); });
    sel.value = filterTopic || '';
    sel.addEventListener('change', function () { renderMistakes(sel.value); });
    var reviewable = entries.filter(function (e) { return e.q; }).map(function (e) { return e.id; });
    nodes.push(h('div', { class: 'toolbar' },
      h('div', { class: 'field' }, h('label', { for: 'mf-topic', text: 'Topic' }), sel),
      h('button', { type: 'button', class: 'btn btn-primary', disabled: !reviewable.length, onclick: function () {
        startSession('review', reviewable, { title: 'Review mistakes', topics: filterTopic ? [filterTopic] : topicsWithItems.map(function (t) { return t.id; }) });
      } }, icon('target'), 'Review these (' + reviewable.length + ')')));

    if (!entries.length) {
      nodes.push(h('div', { class: 'card empty' }, icon('check'), h('p', { text: ids.length ? 'Nothing for this topic.' : 'No mistakes recorded yet. Wrong answers and flagged questions will appear here.' })));
    } else {
      var list = h('div', { class: 'qa-list' });
      entries.forEach(function (e) {
        var r = e.r, q = e.q;
        var head = h('div', { class: 'qa-head' },
          h('span', { class: 'chip', text: q ? topicName(q.topic) : (r.topic || 'Unknown topic') }),
          r.wrongCount ? h('span', { class: 'chip chip-warn', text: 'Wrong ' + r.wrongCount + '×' }) : null,
          h('span', { class: 'mastery small', style: 'margin:0' }, pips(r.streak), 'Mastery ' + r.streak + '/' + MASTERY_TARGET),
          h('span', { class: 'spacer' }),
          q ? starButton(e.id) : null,
          h('button', { type: 'button', class: 'btn btn-sm btn-danger', 'aria-label': 'Remove from review list', onclick: function () {
            ask({ title: 'Remove from review list?', body: 'This clears the question’s mistake history and flag. Your answer statistics are kept.', buttons: [{ label: 'Cancel', value: false }, { label: 'Remove', value: true, variant: 'btn-danger-solid' }] })
              .then(function (ok) {
                if (!ok) return;
                delete state.P.review[e.id];
                save();
                renderMistakes(filterTopic && activeReviewIds([filterTopic]).length ? filterTopic : '');
                announce('Removed from review list');
              });
          } }, icon('trash'), 'Remove'));
        if (!q) {
          list.append(h('article', { class: 'card qa' }, head, h('p', { class: 'muted', text: 'This question (' + e.id + ') is no longer in the question bank.' })));
          return;
        }
        var blocks = [];
        if (r.wrongCount && r.wrongIndex !== null) {
          var wrongText = q.options[r.wrongIndex] !== undefined ? q.options[r.wrongIndex] : r.wrongText;
          blocks.push(h('div', { class: 'ans bad' }, icon('cross'), h('span', { class: 'label', text: 'You answered:' }), h('span', { text: wrongText })));
        } else if (r.flagged) {
          blocks.push(h('div', { class: 'ans none' }, icon('star', true), h('span', { text: 'Flagged by you' })));
        }
        blocks.push(h('div', { class: 'ans ok' }, icon('check'), h('span', { class: 'label', text: 'Correct answer:' }), h('span', { text: q.options[q.answer] })));
        list.append(h('article', { class: 'card qa' }, head,
          h('p', { class: 'q-text', text: q.question }),
          blocks,
          q.explanation || q.reference ? h('details', null, h('summary', { text: 'Explanation' }),
            q.explanation ? h('div', { class: 'explain' }, h('p', { text: q.explanation })) : null,
            q.reference ? h('p', { class: 'ref', text: 'Reference: ' + q.reference }) : null) : null));
      });
      nodes.push(list);
    }
    setScreen('mistakes', h('div', { class: 'narrow' }, nodes), 'Mistakes');
  }

  // ------------------------------------------------------------------ keyboard
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.altKey || e.metaKey || e.defaultPrevented) return;
    if (dialogEl.open) return;
    var t = e.target;
    var tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || (t && t.isContentEditable)) return;
    var s = state.session;
    if (!s) return;

    var key = e.key;
    var pos = -1;
    if (/^[1-6]$/.test(key)) pos = +key - 1;
    else if (/^[a-fA-F]$/.test(key)) pos = key.toUpperCase().charCodeAt(0) - 65;

    if (state.screen === 'quiz') {
      var it = s.items[s.index];
      if (pos >= 0 && pos < it.order.length && it.chosen === null) { e.preventDefault(); answerPractice(pos); return; }
      if (it.chosen !== null) {
        // Enter on a focused button keeps its native behaviour (e.g. the Next button itself, the flag star)
        var onButton = tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY';
        if (key === 'ArrowRight' || (key === 'Enter' && !onButton)) { e.preventDefault(); nextPractice(); }
      }
    } else if (state.screen === 'mock') {
      if (pos >= 0 && pos < s.items[s.index].order.length) { e.preventDefault(); selectMock(pos); return; }
      var onBtn = tag === 'BUTTON' || tag === 'A';
      if (key === 'ArrowRight' || (key === 'Enter' && !onBtn)) {
        e.preventDefault();
        if (s.index < s.items.length - 1) gotoMock(s.index + 1);
      } else if (key === 'ArrowLeft') {
        e.preventDefault();
        if (s.index > 0) gotoMock(s.index - 1);
      }
    }
  });

  window.addEventListener('beforeunload', function (e) {
    if (state.session && state.session.mode === 'mock') { e.preventDefault(); e.returnValue = ''; }
  });

  boot();
})();
