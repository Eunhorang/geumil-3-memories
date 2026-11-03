#!/usr/bin/env node
// 학급 사진을 MLX-Serve의 FLUX.2 klein으로 청량한 애니메이션 그림으로 바꾼다(사진은 이 맥 밖으로 나가지 않는다).
//   node tools/convert.mjs                  그림이 없는 사진만 변환
//   node tools/convert.mjs --only <아이디…>  지정한 사진만 변환
//   node tools/convert.mjs --only <아이디> --seed 7   마음에 안 드는 장면을 다른 씨앗으로 다시 그림(씨앗은 config.json seeds에 남는다)
//   node tools/convert.mjs --force           이미 있는 그림도 다시 변환
// 입력은 build.mjs가 만든 _work/input/<아이디>.png, 결과는 _work/art/<아이디>.png 이다.
// MLX-Serve 서버가 꺼져 있으면 127.0.0.1에서만 열리게 잠깐 켜고, 끝나면 다시 끈다.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = join(ROOT, 'tools/config.json');
const config = JSON.parse(readFileSync(CONFIG, 'utf8'));
const model = config.model;
const BASE = `http://127.0.0.1:${model.port}`;

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const only = argv.includes('--only') ? argv.slice(argv.indexOf('--only') + 1).filter((a) => !a.startsWith('--') && !/^\d+$/.test(a)) : null;
const seedArg = argv.includes('--seed') ? Number(argv[argv.indexOf('--seed') + 1]) : null;
const force = flag('--force') || seedArg !== null;

const photos = JSON.parse(readFileSync(join(ROOT, 'data/gallery.json'), 'utf8')).photos;
const prompt = readFileSync(join(ROOT, 'tools/prompt.txt'), 'utf8').trim();
// 혼자 나온 사진은 관계 묘사가 없는 한 사람용 프롬프트를 쓴다(관계 묘사 때문에 친구를 새로 그려 넣는 일이 있었다).
const soloPrompt = readFileSync(join(ROOT, 'tools/prompt-solo.txt'), 'utf8').trim();
const outDir = join(ROOT, '_work/art');
mkdirSync(outDir, { recursive: true });

const jobs = photos.filter((p) => {
  if (only && !only.includes(p.id)) return false;
  if (!existsSync(join(ROOT, '_work/input', `${p.id}.png`))) { console.log(`입력이 없어 건너뜀: ${p.id} (node tools/build.mjs 먼저)`); return false; }
  return force || !existsSync(join(outDir, `${p.id}.png`));
});
if (!jobs.length) { console.log('변환할 사진이 없습니다.'); process.exit(0); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function alive() {
  try { const r = await fetch(`${BASE}/v1/models`, { signal: AbortSignal.timeout(2000) }); return r.ok ? r.json() : null; } catch { return null; }
}

let server = null;
let models = await alive();
if (!models) {
  const bin = [join(homedir(), '.local/bin/mlx-serve'), '/Applications/MLX-Serve.app/Contents/MacOS/mlx-serve'].find(existsSync);
  if (!bin) { console.log('MLX-Serve가 없습니다. MLX-Serve 앱을 설치하세요.'); process.exit(1); }
  console.log('MLX-Serve 서버를 이 맥 안에서만 열리게 켭니다.');
  server = spawn(bin, ['serve', '--host', '127.0.0.1', '--port', String(model.port)], { stdio: 'ignore' });
  for (let i = 0; i < 90 && !models; i += 1) { await sleep(1000); models = await alive(); }
  if (!models) { server.kill(); console.log('서버가 켜지지 않았습니다.'); process.exit(1); }
}
const stop = () => { if (server) server.kill(); };
process.on('SIGINT', () => { stop(); process.exit(130); });

if (!models.data?.some((m) => m.id === model.name)) {
  stop();
  console.log(`MLX-Serve에 ${model.name} 모델이 없습니다. 받으려면: mlx-serve pull ${model.name}`);
  process.exit(1);
}

config.seeds ||= {};
let failed = 0;
for (const [index, p] of jobs.entries()) {
  const input = join(ROOT, '_work/input', `${p.id}.png`);
  const [w, h] = execFileSync('magick', ['identify', '-format', '%w %h', input]).toString().split(' ').map(Number);
  if (seedArg !== null) config.seeds[p.id] = seedArg;
  const seed = config.seeds[p.id] ?? model.seed;
  // 사람이 적은 사진은 모델이 사람을 더 그려 넣기 쉬워서, 사진마다 몇 명인지 적은 설명(config.json hints)을 넣는다.
  const hint = config.hints?.[p.id];
  const basePrompt = config.solo?.includes(p.id) ? soloPrompt : prompt;
  const promptText = hint ? `${basePrompt.replace('(several people together)', `(${hint})`)}\n\nIn this photo: ${hint}. Draw exactly these people and do not add anyone else.` : basePrompt;
  const began = Date.now();
  try {
    const res = await fetch(`${BASE}/v1/images/generations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: model.name, prompt: promptText, image: readFileSync(input).toString('base64'), mode: 'edit', size: `${w}x${h}`, seed, response_format: 'b64_json' }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 300)}`);
    writeFileSync(join(outDir, `${p.id}.png`), Buffer.from(JSON.parse(text).data[0].b64_json, 'base64'));
    console.log(`[${index + 1}/${jobs.length}] ${p.id} ${p.title} · 씨앗 ${seed} · ${((Date.now() - began) / 1000).toFixed(0)}초`);
  } catch (err) {
    failed += 1;
    console.log(`[${index + 1}/${jobs.length}] ${p.id} 실패: ${err.message}`);
  }
}
if (seedArg !== null) writeFileSync(CONFIG, JSON.stringify(config, null, 2) + '\n');
stop();
if (failed) { console.log(`${failed}장이 실패했어요. 다시 실행하면 남은 것만 변환합니다.`); process.exit(1); }
