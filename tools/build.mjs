#!/usr/bin/env node
// 학급 사진 폴더를 읽어 전시용 파일을 만든다.
//   node tools/build.mjs            새 사진 등록 → 변환용 입력 만들기 → 그림 WebP·암호화한 원본 만들기
//   node tools/build.mjs --rekey    비밀번호를 바꾼 뒤 원본 전체를 새 비밀번호로 다시 암호화
//   node tools/build.mjs --no-encrypt   원본 암호화를 건너뜀(비밀번호를 아직 정하지 않았을 때)
//   node tools/build.mjs --standin      개발용 임시 이미지도 만듦(_work/standin)
// 비밀번호는 macOS 키체인(tools/set-password.sh로 저장)에서 읽는다. 시험할 때만 GEUMIL_PASSWORD 환경 변수를 쓴다.
import { execFileSync } from 'node:child_process';
import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(ROOT, 'tools/config.json'), 'utf8'));
const DATA = join(ROOT, 'data/gallery.json');
const SOURCE = resolve(ROOT, config.source);
const WORK = join(ROOT, '_work');
const DIRS = {
  input: join(WORK, 'input'),
  art: join(WORK, 'art'),
  tmp: join(WORK, 'tmp'),
  standin: join(WORK, 'standin'),
  webArt: join(ROOT, 'img/art'),
  webPhoto: join(ROOT, 'img/photo'),
};
const SRGB = '/System/Library/ColorSync/Profiles/sRGB Profile.icc';
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.heic', '.heif']);
const ITERATIONS = 600000;
const CHECK_TEXT = 'geumil-3-memories';

const args = new Set(process.argv.slice(2));
const REKEY = args.has('--rekey');
const NO_ENCRYPT = args.has('--no-encrypt');
// 개발용: 그림이 나오기 전 화면을 잡을 때 쓰는 임시 이미지(_work/standin, 주소 끝에 ?standin)
const STANDIN = args.has('--standin');

const nfc = (s) => s.normalize('NFC');
const run = (cmd, argv) => execFileSync(cmd, argv, { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
const newer = (a, b) => existsSync(a) && (!existsSync(b) || statSync(a).mtimeMs > statSync(b).mtimeMs);

for (const dir of Object.values(DIRS)) mkdirSync(dir, { recursive: true });

const data = JSON.parse(readFileSync(DATA, 'utf8'));
const skip = new Set(config.skip.map(nfc));

// ---------- 촬영 일시 ----------
function takenAt(file) {
  try {
    const out = run('magick', ['identify', '-format', '%[EXIF:DateTimeOriginal]|%[EXIF:OffsetTimeOriginal]', `${file}[0]`]);
    const [stamp, offset] = out.split('|');
    const m = stamp && stamp.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
    if (m) {
      const local = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
      if (!offset || offset === '+09:00') return local;
      return toSeoul(new Date(`${local}${offset}`));
    }
  } catch { /* 아래에서 다른 방법으로 */ }
  const raw = run('mdls', ['-raw', '-name', 'kMDItemContentCreationDate', file]);
  const date = raw && raw !== '(null)' ? new Date(raw.replace(' ', 'T').replace(' +0000', 'Z')) : statSync(file).mtime;
  return toSeoul(date);
}

function toSeoul(date) {
  const shifted = new Date(date.getTime() + 9 * 3600 * 1000);
  return shifted.toISOString().slice(0, 19);
}

// ---------- 새 사진 등록 ----------
function titleFromName(name) {
  const base = nfc(name).replace(/\.[^.]+$/, '').replace(/\s+/g, ' ').trim();
  return /^IMG_\d+/i.test(base) || /^\d+$/.test(base) ? '' : base;
}

function registerNewPhotos() {
  if (!existsSync(SOURCE)) {
    console.log(`사진 폴더가 없습니다: ${SOURCE}`);
    return [];
  }
  const known = new Set(data.photos.map((p) => nfc(p.source)));
  const added = [];
  for (const name of readdirSync(SOURCE)) {
    const n = nfc(name);
    if (name.startsWith('.') || !IMAGE_EXT.has(extname(n).toLowerCase())) continue;
    if (known.has(n) || skip.has(n)) continue;
    const taken = takenAt(join(SOURCE, name));
    const title = titleFromName(n);
    const photo = { id: '', source: n, taken, title: title || '새 사진', event: '', alt: title ? `${title} 장면을 그린 그림` : '친구들과 함께한 날을 그린 그림' };
    data.photos.push(photo);
    added.push(photo);
  }
  data.photos.sort((a, b) => a.taken.localeCompare(b.taken));
  // 새로 들어온 사진만 아이디를 붙인다(이미 있는 아이디는 바꾸지 않는다).
  const used = new Set(data.photos.filter((p) => p.id).map((p) => p.id));
  for (const p of added) {
    const day = p.taken.slice(0, 10);
    let n = 1;
    while (used.has(`${day}-${n}`)) n += 1;
    p.id = `${day}-${n}`;
    used.add(p.id);
  }
  return added;
}

// ---------- 이미지 만들기 ----------
function sourcePath(photo) {
  const want = nfc(photo.source);
  const hit = readdirSync(SOURCE).find((name) => nfc(name) === want);
  if (!hit) throw new Error(`원본을 찾지 못했습니다: ${photo.source}`);
  const file = join(SOURCE, hit);
  const ext = extname(want).toLowerCase();
  if (ext === '.heic' || ext === '.heif') {
    const jpg = join(DIRS.tmp, `${photo.id}.jpg`);
    if (!existsSync(jpg)) run('sips', ['-s', 'format', 'jpeg', file, '--out', jpg]);
    return jpg;
  }
  return file;
}

function size(file) {
  const [w, h] = run('magick', ['identify', '-format', '%w %h', `${file}[0]`]).split(' ').map(Number);
  return [w, h];
}

// 변환 모델에 넣을 크기: 약 133만 화소, 가로세로 16의 배수
function modelSize(w, h) {
  const area = 1536 * 864;
  const scale = Math.sqrt(area / (w * h));
  const round16 = (v) => Math.max(16, Math.round((v * scale) / 16) * 16);
  return [round16(w), round16(h)];
}

function makeModelInput(photo) {
  const out = join(DIRS.input, `${photo.id}.png`);
  if (existsSync(out)) return out;
  const src = sourcePath(photo);
  const tmp = join(DIRS.tmp, `${photo.id}-oriented.png`);
  run('magick', [src, '-auto-orient', '-profile', SRGB, '-strip', tmp]);
  const [w, h] = size(tmp);
  const [tw, th] = modelSize(w, h);
  run('magick', [tmp, '-resize', `${tw}x${th}^`, '-gravity', 'center', '-extent', `${tw}x${th}`, out]);
  rmSync(tmp);
  return out;
}

function makeWebp(png, dir, id) {
  const full = join(dir, `${id}.webp`);
  const small = join(dir, `${id}-s.webp`);
  if (newer(png, full)) run('cwebp', ['-quiet', '-q', String(config.art.quality + 2), '-metadata', 'none', png, '-o', full]);
  if (newer(png, small)) run('cwebp', ['-quiet', '-q', String(config.art.quality), '-metadata', 'none', '-resize', String(config.art.small), '0', png, '-o', small]);
  return small;
}

// 그림이 있으면 WebP를 만들고 ready로 표시한다. 그림이 없어도 크기는 변환 입력과 같으므로 미리 적어 둔다.
function makeArt(photo, input) {
  const png = join(DIRS.art, `${photo.id}.png`);
  photo.ready = existsSync(png);
  const small = photo.ready ? makeWebp(png, DIRS.webArt, photo.id) : null;
  if (STANDIN) makeWebp(input, DIRS.standin, photo.id);
  photo.art = size(photo.ready ? join(DIRS.webArt, `${photo.id}.webp`) : input);
  photo.tone = '#' + run('magick', [small || input, '-resize', '1x1!', '-format', '%[hex:p{0,0}]', 'info:']).slice(0, 6).toLowerCase();
  return photo.ready;
}

// ---------- 원본 암호화 ----------
function readPassword() {
  if (process.env.GEUMIL_PASSWORD) return process.env.GEUMIL_PASSWORD;
  try {
    return run('security', ['find-generic-password', '-s', config.keychain.service, '-a', config.keychain.account, '-w']);
  } catch {
    return null;
  }
}

function encrypt(key, plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, body, cipher.getAuthTag()]);
}

function decrypt(key, blob) {
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(blob.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(blob.subarray(12, blob.length - 16)), decipher.final()]);
}

// 시험용 비밀번호(GEUMIL_PASSWORD)로 잠근 원본은 키체인 비밀번호로 처음 만들 때 저절로 모두 다시 잠근다.
const TEST_PASSWORD = Boolean(process.env.GEUMIL_PASSWORD);
let rewriteAll = REKEY;

function prepareKey(password) {
  const pw = Buffer.from(password.normalize('NFC').trim(), 'utf8');
  if (!data.lock || REKEY || (data.lock.test && !TEST_PASSWORD)) {
    const salt = randomBytes(16);
    const key = pbkdf2Sync(pw, salt, ITERATIONS, 32, 'sha256');
    data.lock = { kdf: 'PBKDF2-SHA256', iter: ITERATIONS, salt: salt.toString('base64'), check: encrypt(key, Buffer.from(CHECK_TEXT)).toString('base64') };
    if (TEST_PASSWORD) data.lock.test = true;
    rewriteAll = true;
    return key;
  }
  const key = pbkdf2Sync(pw, Buffer.from(data.lock.salt, 'base64'), data.lock.iter, 32, 'sha256');
  try {
    decrypt(key, Buffer.from(data.lock.check, 'base64'));
  } catch {
    throw new Error('키체인 비밀번호가 이미 암호화된 원본의 비밀번호와 다릅니다. 비밀번호를 바꿨다면 --rekey로 다시 실행하세요.');
  }
  return key;
}

function makeOriginal(photo, key) {
  const out = join(DIRS.webPhoto, `${photo.id}.bin`);
  if (existsSync(out) && !rewriteAll && photo.photo) return;
  const src = sourcePath(photo);
  const jpg = join(DIRS.tmp, `${photo.id}-original.jpg`);
  const long = config.original.long;
  run('magick', [src, '-auto-orient', '-profile', SRGB, '-resize', `${long}x${long}>`, '-strip', '-sampling-factor', '4:2:0', '-interlace', 'JPEG', '-quality', String(config.original.quality), jpg]);
  photo.photo = size(jpg);
  writeFileSync(out, encrypt(key, readFileSync(jpg)));
  rmSync(jpg);
}

// ---------- 실행 ----------
const added = registerNewPhotos();
if (added.length) console.log(`새 사진 ${added.length}장 등록: ${added.map((p) => p.source).join(', ')}`);

let key = null;
if (!NO_ENCRYPT) {
  const password = readPassword();
  if (password) key = prepareKey(password);
  else console.log('비밀번호가 없어 원본 암호화를 건너뜁니다. tools/set-password.sh로 먼저 저장하세요.');
}

const waiting = [];
for (const photo of data.photos) {
  const input = makeModelInput(photo);
  if (!makeArt(photo, input)) waiting.push(photo.id);
  if (key) makeOriginal(photo, key);
}

// 링크 미리보기 그림(카카오톡 등): 대표 그림을 1200×630으로 자른다.
const featuredArt = join(DIRS.art, `${config.featured}.png`);
const og = join(ROOT, 'img/og.jpg');
if (newer(featuredArt, og)) run('magick', [featuredArt, '-resize', '1200x630^', '-gravity', 'center', '-extent', '1200x630', '-strip', '-quality', '82', og]);

// 지운 사진의 파일은 함께 지운다.
const ids = new Set(data.photos.map((p) => p.id));
for (const dir of [DIRS.webArt, DIRS.webPhoto]) {
  for (const name of readdirSync(dir)) {
    const id = name.replace(/(-s)?\.(webp|bin)$/, '');
    if (!ids.has(id)) rmSync(join(dir, name));
  }
}

writeFileSync(DATA, JSON.stringify(data, null, 2) + '\n');
console.log(`전시 사진 ${data.photos.length}장 · 그림 준비 ${data.photos.length - waiting.length}장 · 원본 암호화 ${key ? '완료' : '건너뜀'}`);
if (waiting.length) console.log(`그림 변환을 기다리는 사진 ${waiting.length}장: zsh tools/convert.sh 로 변환하세요.`);
