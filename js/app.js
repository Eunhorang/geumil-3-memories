// 2026년 금일초 3학년의 추억 — 전시 화면
// data/gallery.json을 읽어 달별 전시·일정표·한 장으로 넘겨 보기·크게 보기를 그린다.
// 원본 사진은 AES-GCM으로 잠겨 있고, 비밀번호에서 만든 열쇠(PBKDF2)로 이 브라우저 안에서만 푼다.
(() => {
  const STANDIN = new URLSearchParams(location.search).has('standin');
  const ART_BASE = STANDIN ? '_work/standin/' : 'img/art/';
  const KEY_STORE = 'g3m-key';
  const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const $ = (sel, root = document) => root.querySelector(sel);
  const el = (tag, props = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'style') node.style.cssText = v;
      else if (k.startsWith('data-') || k.startsWith('aria-') || k === 'role') node.setAttribute(k, v);
      else node[k] = v;
    }
    node.append(...children.filter(Boolean));
    return node;
  };

  const artSmall = (p) => `${ART_BASE}${p.id}-s.webp`;
  const artFull = (p) => `${ART_BASE}${p.id}.webp`;
  const parts = (p) => {
    const [y, m, d] = p.taken.slice(0, 10).split('-').map(Number);
    return { y, m, d, day: DAYS[new Date(y, m - 1, d).getDay()] };
  };
  const longDate = (p) => { const t = parts(p); return `${t.m}월 ${t.d}일 ${t.day}요일`; };
  const shortDate = (p) => { const t = parts(p); return `${t.m}월 ${t.d}일`; };
  const isoDate = (p) => p.taken.slice(0, 10);
  // decode()는 화면에 그려지지 않는 그림에서 끝나지 않을 때가 있어 load와 시간 제한을 함께 쓴다.
  const whenReady = (img) => new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    if (img.decode) img.decode().then(finish, finish);
    if (img.complete && img.naturalWidth) setTimeout(finish, 60);
    img.addEventListener('load', () => setTimeout(finish, 60), { once: true });
    img.addEventListener('error', finish, { once: true });
    setTimeout(finish, 1500);
  });

  let photos = [];
  let lock = null;

  // ---------- 화면 그리기 ----------
  function renderMonths(groups) {
    const list = $('#month-list');
    const jump = $('.month-jump');
    const foot = $('.foot-menu');
    let order = 0;
    for (const [month, items] of groups) {
      const id = `m${month}`;
      const pin = el('div', { class: 'month-pin' },
        el('h3', { class: 'month-name', id: `${id}-title`, text: `${month}월`, 'data-reveal': '' }),
        data.months?.[month] ? el('p', { class: 'month-note', text: data.months[month], 'data-reveal': '', style: '--d:80ms' }) : null,
        el('p', { class: 'month-count', text: `그림 ${items.length}장`, 'data-reveal': '', style: '--d:140ms' }),
      );
      const scenes = el('ol', { class: 'scenes' });
      // 달의 첫 그림이 가로로 길면 두 칸을 다 쓰고, 나머지는 두 칸에 엇갈려 건다.
      const ratioOf = (p) => p.art[0] / p.art[1];
      const firstWide = ratioOf(items[0]) >= 1.2;
      items.forEach((p, i) => {
        const ratio = ratioOf(p);
        const wide = i === 0 && (firstWide || (items.length === 1 && ratio >= 0.9));
        const classes = ['scene'];
        if (wide) classes.push('is-wide');
        if (ratio < 0.9) classes.push('is-tall');
        const pos = firstWide ? i - 1 : i;
        if (!wide && pos % 2 === 1) classes.push('is-lower');
        const img = el('img', { src: artSmall(p), alt: p.alt, width: p.art[0], height: p.art[1], loading: order < 3 ? 'eager' : 'lazy', decoding: 'async' });
        if (wide) img.src = artFull(p);
        const open = el('button', { class: 'scene-open', type: 'button', 'aria-label': `${p.title} 크게 보기`, style: `--tone:${p.tone || 'var(--sky-deep)'}` }, img);
        open.addEventListener('click', () => viewer.open(photos.indexOf(p), open));
        const caption = el('figcaption', {},
          el('p', { class: 'scene-title', text: p.title }),
          el('p', { class: 'scene-meta' }, el('time', { dateTime: isoDate(p), text: longDate(p) }), p.event ? ` · ${p.event}` : ''),
        );
        const figure = el('figure', { class: 'scene-figure' }, open, caption);
        scenes.append(el('li', { class: classes.join(' '), 'data-reveal': '', style: `--d:${(i % 2) * 90}ms` }, figure));
        order += 1;
      });
      list.append(el('section', { class: 'month', id, 'aria-labelledby': `${id}-title` }, pin, scenes));
      jump.append(el('a', { href: `#${id}`, text: `${month}월` }));
      foot.append(el('a', { href: `#${id}`, text: `${month}월` }));
    }
    list.setAttribute('aria-busy', 'false');
  }

  function renderIndex(groups) {
    const table = $('#index-table');
    for (const [month, items] of groups) {
      const rows = el('ol', { class: 'index-rows' });
      items.forEach((p, i) => {
        const row = el('button', { class: 'index-row', type: 'button' },
          el('span', { class: 'c-title', text: p.title }),
          el('span', { class: 'c-event', text: p.event }),
          el('time', { class: 'c-date', dateTime: isoDate(p), text: `${shortDate(p)} ${parts(p).day}` }),
        );
        row.addEventListener('click', () => viewer.open(photos.indexOf(p), row));
        rows.append(el('li', { 'data-reveal': '', style: `--d:${Math.min(i, 6) * 60}ms` }, row));
      });
      table.append(el('div', { class: 'index-group' }, el('h3', { class: 'index-month', text: `${month}월` }), rows));
    }
  }

  // ---------- 한 장으로 넘겨 보기 ----------
  const reel = {
    index: 0, front: 0, token: 0, timer: null, touched: false,
    init(groups) {
      this.frame = $('.reel-frame');
      this.range = $('#reel-range');
      this.date = $('.reel-date');
      this.name = $('.reel-name');
      const first = $('.reel-img', this.frame);
      const second = el('img', { class: 'reel-img', alt: '', 'aria-hidden': 'true', width: first.width, height: first.height });
      this.frame.append(second);
      this.imgs = [first, second];
      this.range.max = String(photos.length - 1);
      const ticks = $('.reel-months');
      const last = Math.max(1, photos.length - 1);
      for (const [month, items] of groups) {
        const a = photos.indexOf(items[0]);
        const b = photos.indexOf(items[items.length - 1]);
        const at = a === 0 ? 0 : ((a + b) / 2 / last) * 100;
        ticks.append(el('li', { style: `left:${at}%` }, String(month), el('span', { class: 'tick-unit', text: '월' })));
      }
      this.range.addEventListener('input', () => { this.stop(true); this.show(Number(this.range.value)); });
      this.range.addEventListener('pointerdown', () => this.stop(true));
      this.frame.addEventListener('click', () => { this.stop(true); viewer.open(this.index, this.frame); });
      this.show(0, true);
      if (!reduceMotion) {
        const io = new IntersectionObserver(([entry]) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) this.play(); else this.pause();
        }, { threshold: [0, 0.5, 1] });
        io.observe(this.frame);
        document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); });
      }
    },
    show(i, instant = false) {
      const p = photos[i];
      if (!p) return;
      this.index = i;
      this.range.value = String(i);
      this.range.setAttribute('aria-valuetext', `${longDate(p)} ${p.title}`);
      this.date.textContent = shortDate(p);
      this.date.dateTime = isoDate(p);
      this.name.textContent = p.title;
      this.frame.setAttribute('aria-label', `${p.title} 크게 보기`);
      const token = ++this.token;
      const back = this.imgs[1 - this.front];
      const front = this.imgs[this.front];
      if (instant) {
        front.src = artSmall(p); front.alt = p.alt;
        return;
      }
      back.src = artSmall(p);
      back.alt = p.alt;
      whenReady(back).then(() => {
        if (token !== this.token) return;
        back.classList.add('is-on'); back.removeAttribute('aria-hidden');
        front.classList.remove('is-on'); front.setAttribute('aria-hidden', 'true');
        this.front = 1 - this.front;
      });
      const next = photos[i + 1];
      if (next) new Image().src = artSmall(next);
    },
    play() {
      if (this.touched || this.timer) return;
      this.timer = setInterval(() => this.show((this.index + 1) % photos.length), 2600);
    },
    pause() { clearInterval(this.timer); this.timer = null; },
    stop(byUser) { if (byUser) this.touched = true; this.pause(); },
  };

  // ---------- 원본 열쇠 ----------
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const vault = {
    key: null,
    async restore() {
      if (this.key || !lock) return this.key;
      for (const store of [sessionStorage, localStorage]) {
        try {
          const saved = JSON.parse(store.getItem(KEY_STORE) || 'null');
          if (!saved || saved.salt !== lock.salt) continue;
          const key = await crypto.subtle.importKey('raw', b64(saved.raw), 'AES-GCM', true, ['decrypt']);
          await this.check(key);
          this.key = key;
          return key;
        } catch { try { store.removeItem(KEY_STORE); } catch { /* 저장소를 못 쓰는 브라우저 */ } }
      }
      return null;
    },
    async check(key) {
      const blob = b64(lock.check);
      await crypto.subtle.decrypt({ name: 'AES-GCM', iv: blob.slice(0, 12) }, key, blob.slice(12));
    },
    async enter(password, remember) {
      const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password.normalize('NFC').trim()), 'PBKDF2', false, ['deriveKey']);
      const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(lock.salt), iterations: lock.iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, true, ['decrypt']);
      await this.check(key);
      this.key = key;
      const saved = JSON.stringify({ salt: lock.salt, raw: toB64(await crypto.subtle.exportKey('raw', key)) });
      try {
        sessionStorage.setItem(KEY_STORE, saved);
        if (remember) localStorage.setItem(KEY_STORE, saved);
      } catch { /* 사생활 보호 창 등: 이번 화면에서만 기억 */ }
    },
    cache: new Map(),
    async original(p) {
      if (this.cache.has(p.id)) return this.cache.get(p.id);
      const res = await fetch(`img/photo/${p.id}.bin`);
      if (!res.ok) throw new Error(`원본을 불러오지 못했습니다 (${res.status})`);
      const blob = new Uint8Array(await res.arrayBuffer());
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: blob.slice(0, 12) }, this.key, blob.slice(12));
      const url = URL.createObjectURL(new Blob([plain], { type: 'image/jpeg' }));
      this.cache.set(p.id, url);
      if (this.cache.size > 6) {
        const [oldest] = this.cache.keys();
        URL.revokeObjectURL(this.cache.get(oldest));
        this.cache.delete(oldest);
      }
      return url;
    },
  };

  // ---------- 크게 보기 ----------
  const viewer = {
    index: 0, mode: 'art', trigger: null, token: 0,
    init() {
      this.dialog = $('#viewer');
      this.stage = $('.viewer-stage', this.dialog);
      this.status = $('.viewer-status', this.dialog);
      this.art = el('img', { class: 'viewer-img viewer-art', alt: '' });
      this.photo = el('img', { class: 'viewer-img viewer-photo is-out', alt: '' });
      this.stage.prepend(this.art, this.photo);
      this.title = $('.viewer-title', this.dialog);
      this.meta = $('.viewer-meta', this.dialog);
      this.toggle = $('.viewer-toggle', this.dialog);
      this.save = $('.viewer-save', this.dialog);
      this.form = $('.keyform', this.dialog);
      this.error = $('.keyform-error', this.form);

      $('.viewer-close', this.dialog).addEventListener('click', () => this.close());
      $('.viewer-prev', this.dialog).addEventListener('click', () => this.step(-1));
      $('.viewer-next', this.dialog).addEventListener('click', () => this.step(1));
      this.toggle.addEventListener('click', () => (this.mode === 'photo' ? this.showArt() : this.showPhoto()));
      $('.keyform-cancel', this.form).addEventListener('click', () => this.hideForm());
      this.form.addEventListener('submit', (e) => this.submit(e));
      this.dialog.addEventListener('cancel', (e) => {
        e.preventDefault();
        if (!this.form.hidden) this.hideForm(); else this.close();
      });
      this.dialog.addEventListener('close', () => { this.hideForm(); if (this.trigger) this.trigger.focus({ preventScroll: true }); });
      this.dialog.addEventListener('keydown', (e) => {
        if (e.target.closest('input')) return;
        if (e.key === 'ArrowLeft') { e.preventDefault(); this.step(-1); }
        if (e.key === 'ArrowRight') { e.preventDefault(); this.step(1); }
      });
      let start = null;
      this.stage.addEventListener('pointerdown', (e) => { start = { x: e.clientX, y: e.clientY }; });
      this.stage.addEventListener('pointerup', (e) => {
        if (!start || (window.visualViewport && visualViewport.scale > 1.05)) return;
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        start = null;
        if (Math.abs(dx) > 50 && Math.abs(dy) < 80) this.step(dx < 0 ? 1 : -1);
      });
      window.addEventListener('popstate', () => { if (this.dialog.open) this.dialog.close(); });
    },
    open(i, trigger) {
      this.trigger = trigger;
      if (!this.dialog.open) {
        this.dialog.showModal();
        history.pushState({ viewer: true }, '');
      }
      this.show(i);
      $('.viewer-close', this.dialog).focus({ preventScroll: true });
    },
    close() {
      if (history.state && history.state.viewer) history.back();
      else this.dialog.close();
    },
    step(d) { this.show((this.index + d + photos.length) % photos.length); },
    show(i) {
      const p = photos[i];
      this.index = i;
      this.art.src = artFull(p);
      this.art.alt = p.alt;
      this.art.width = p.art[0];
      this.art.height = p.art[1];
      this.title.textContent = p.title;
      this.meta.textContent = [longDate(p), p.event].filter(Boolean).join(' · ');
      const near = photos[(i + 1) % photos.length];
      new Image().src = artFull(near);
      // 완성 그림으로 받은 것은 원본 사진이 없어 단추를 숨긴다(원본 보기 중이었다면 다음 사진에서 이어 간다).
      const hasPhoto = Boolean(p.photo);
      this.toggle.hidden = !hasPhoto;
      if (this.mode === 'photo' && vault.key && hasPhoto) this.showPhoto();
      else this.showArt(!hasPhoto);
    },
    showArt(keepMode = false) {
      if (!keepMode) this.mode = 'art';
      this.token += 1;
      this.art.classList.remove('is-out');
      this.photo.classList.add('is-out');
      this.photo.hidden = true;
      this.toggle.textContent = '원본 사진';
      this.toggle.setAttribute('aria-pressed', 'false');
      this.save.hidden = true;
      this.setStatus('');
    },
    async showPhoto() {
      if (!lock) { this.setStatus('원본 사진이 아직 준비되지 않았어요'); return; }
      if (!(await vault.restore())) { this.showForm(); return; }
      const p = photos[this.index];
      const token = ++this.token;
      this.mode = 'photo';
      this.toggle.textContent = '그림 보기';
      this.toggle.setAttribute('aria-pressed', 'true');
      this.setStatus('원본 사진을 여는 중이에요');
      try {
        const url = await vault.original(p);
        if (token !== this.token) return;
        const ready = new Image();
        ready.src = url;
        await whenReady(ready);
        if (token !== this.token) return;
        this.photo.src = url;
        this.photo.alt = `원본 사진: ${p.alt}`;
        if (p.photo) { this.photo.width = p.photo[0]; this.photo.height = p.photo[1]; }
        this.photo.hidden = false;
        setTimeout(() => { this.photo.classList.remove('is-out'); this.art.classList.add('is-out'); }, 30);
        this.save.href = url;
        this.save.download = `2026 금일초 3학년 ${isoDate(p)} ${p.title}.jpg`;
        this.save.hidden = false;
        this.setStatus('');
      } catch (err) {
        console.error(err);
        if (token === this.token) { this.showArt(); this.setStatus('원본 사진을 열지 못했어요. 잠시 뒤 다시 눌러 주세요.'); }
      }
    },
    showForm() {
      this.form.hidden = false;
      this.error.textContent = '';
      this.form.password.value = '';
      this.form.password.focus();
    },
    hideForm() { this.form.hidden = true; },
    async submit(e) {
      e.preventDefault();
      const button = $('button[type="submit"]', this.form);
      button.disabled = true;
      this.error.textContent = '';
      try {
        await vault.enter(this.form.password.value, this.form.remember.checked);
        this.hideForm();
        this.toggle.focus();
        this.showPhoto();
      } catch {
        this.error.textContent = '비밀번호가 맞지 않아요. 다시 넣어 주세요.';
        this.form.password.select();
      } finally {
        button.disabled = false;
      }
    },
    setStatus(text) { this.status.textContent = text; this.status.hidden = !text; },
  };

  // ---------- 주소 복사·공유 ----------
  function initShare() {
    const toast = $('#share-toast');
    const say = (text) => { toast.textContent = text; };
    const copy = async (text) => {
      try { await navigator.clipboard.writeText(text); }
      catch {
        const area = el('textarea', { value: text, style: 'position:fixed;opacity:0' });
        document.body.append(area); area.select(); document.execCommand('copy'); area.remove();
      }
      say('주소를 복사했어요. 알림장이나 단체 대화방에 붙여 넣어 보세요.');
    };
    document.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => copy(b.dataset.copy)));
    const shareButton = $('[data-share]');
    shareButton.addEventListener('click', async () => {
      const url = 'https://eunhorang.github.io/geumil-3-memories/';
      if (navigator.share) {
        try { await navigator.share({ title: document.title, text: '우리 반의 3월부터 11월까지를 그림으로 만나요', url }); } catch { /* 닫음 */ }
      } else copy(url);
    });
  }

  // ---------- 나타나기 ----------
  function initReveal() {
    const items = document.querySelectorAll('[data-reveal]');
    if (!('IntersectionObserver' in window) || reduceMotion) { items.forEach((n) => n.classList.add('is-in')); return; }
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add('is-in'); io.unobserve(entry.target); }
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
    items.forEach((n) => io.observe(n));
  }

  // ---------- 시작 ----------
  let data = null;
  viewer.init();
  initShare();
  if (STANDIN) document.querySelectorAll('img[data-art]').forEach((img) => { img.src = img.src.replace('img/art/', ART_BASE); });
  $('.foot-picture').classList.add('drift');

  fetch('data/gallery.json', { cache: 'no-cache' })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((json) => {
      data = json;
      // 시험용 비밀번호로 잠근 자료가 실수로 올라가면 원본 보기를 막는다.
      lock = json.lock && !(json.lock.test && location.hostname.endsWith('github.io')) ? json.lock : null;
      photos = json.photos.filter((p) => STANDIN || p.ready).sort((a, b) => a.taken.localeCompare(b.taken));
      document.querySelectorAll('[data-count]').forEach((n) => { n.textContent = String(photos.length); });
      const groups = new Map();
      for (const p of photos) {
        const m = parts(p).m;
        if (!groups.has(m)) groups.set(m, []);
        groups.get(m).push(p);
      }
      renderMonths(groups);
      renderIndex(groups);
      reel.init(groups);
      initReveal();
      if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
    })
    .catch((err) => {
      console.error(err);
      $('#month-list').replaceChildren(el('p', { class: 'months-intro', text: '전시를 불러오지 못했어요. 잠시 뒤 새로 고침해 주세요.' }));
    });
})();
