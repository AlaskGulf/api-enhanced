const fs = require('fs');
const path = require('path');
const axios = require('axios');

const BASE = 'http://localhost:3000';
const COOKIE_FILE = path.join(__dirname, 'cookie.txt');

// --- 读取 cookie ---
let cookieRaw;
try {
  cookieRaw = fs.readFileSync(COOKIE_FILE, 'utf-8').trim();
} catch {
  console.error('❌ 找不到 cookie.txt，请先运行 login-helper.js 扫码登录');
  process.exit(1);
}
if (!cookieRaw) {
  console.error('❌ cookie.txt 为空，请先运行 login-helper.js 扫码登录');
  process.exit(1);
}
// 不要 encodeURIComponent —— axios 和 Express 会自动处理编码
const cookie = cookieRaw;

function ts() {
  return Date.now();
}

// --- 工具函数 ---
async function checkStatus() {
  const res = await axios.get(`${BASE}/login/status`, {
    params: { cookie, timestamp: ts() },
  });
  const profile = res.data?.data?.profile;
  if (!profile) {
    console.log('❌ Cookie 无效，请重新扫码');
    process.exit(1);
  }
  console.log(`👤 当前登录: ${profile.nickname} (userId: ${profile.userId})\n`);
  return profile;
}

async function searchSong(keyword, artistName) {
  const res = await axios.get(`${BASE}/cloudsearch`, {
    params: { keywords: keyword, limit: 30, cookie, timestamp: ts() },
  });
  const songs = res.data?.result?.songs || [];

  // 精确匹配艺人名
  const match = songs.find((s) =>
    (s.ar || []).some((a) => a.name === artistName)
  );

  if (!match) {
    console.log(`❌ 搜索结果里没有真 ${artistName}`);
    console.log('   前 5 条结果:');
    songs.slice(0, 5).forEach((s, i) => {
      const artists = (s.ar || []).map((a) => a.name).join('/');
      console.log(`   ${i + 1}. ${s.name} — ${artists} (id: ${s.id})`);
    });
    console.log('');
    return null;
  }

  const artists = (match.ar || []).map((a) => a.name).join('/');
  console.log(`🎵 找到: ${match.name} — ${artists} (id: ${match.id})`);
  return match;
}

async function getSongUrl(songId) {
  const res = await axios.get(`${BASE}/song/url/v1`, {
    params: { id: songId, level: 'exhigh', cookie, timestamp: ts() },
  });
  return res.data?.data?.[0] || null;
}

function printSongInfo(info, label) {
  if (!info) return;
  console.log(`📊 ${label} 播放信息：`);
  console.log(`   url:           ${info.url || '(null)'}`);
  console.log(`   time:          ${info.time} ms`);
  console.log(`   size:          ${info.size} 字节`);
  console.log(`   br:            ${info.br}`);
  console.log(`   level:         ${info.level}`);
  console.log(`   freeTrialInfo: ${info.freeTrialInfo != null ? '⚠️ 试听片段' : '✅ 完整版'}`);
  console.log(`   fee:           ${info.fee} (0=免费 1=VIP 4=专辑付费 8=VIP包月)`);
}

function judgeUrl(info) {
  if (!info) return { ok: false, reason: 'info 为空' };
  if (info.url == null) return { ok: false, reason: '❌ VIP 没生效，拿不到 URL' };
  if (info.freeTrialInfo != null) return { ok: false, reason: '❌ 拿到的是 30 秒试听' };
  if (info.time > 240000 && info.freeTrialInfo == null) {
    return { ok: true, reason: '✅ VIP 生效，拿到完整歌曲！' };
  }
  return { ok: true, reason: '⚠️ 拿到 URL 但时长较短，可能是非 VIP 歌曲' };
}

async function verifyUrl(url) {
  if (!url) return false;
  try {
    const head = await axios.head(url, { timeout: 10000 });
    const ct = (head.headers['content-type'] || '').toLowerCase();
    const cl = head.headers['content-length'];
    console.log(`   HEAD ${head.status} | content-type: ${ct} | content-length: ${cl || 'unknown'}`);
    if (head.status === 200 && ct.includes('audio')) {
      console.log('   ✅ URL 真实有效\n');
      return true;
    }
    if (head.status === 403 || head.status === 404) {
      console.log('   ❌ URL 已失效\n');
      return false;
    }
    console.log(`   ⚠️ 意外状态\n`);
    return false;
  } catch (e) {
    console.log(`   ❌ HEAD 请求失败: ${e.message}\n`);
    return false;
  }
}

// --- 主流程 ---
async function main() {
  console.log('═══════════════════════════════════');
  console.log('  网易云 Enhanced API VIP 测试');
  console.log('═══════════════════════════════════\n');

  // ===== 测试 A: 身份验证 =====
  console.log('─── 测试 A: 身份验证 ───');
  await checkStatus();

  const results = {};

  // ===== 测试 B + C + D: 五月天《突然好想你》 =====
  console.log('─── 测试 B+C+D: 五月天《突然好想你》 ───');
  {
    const song = await searchSong('突然好想你 五月天', '五月天');
    if (song) {
      const info = await getSongUrl(song.id);
      printSongInfo(info, '五月天《突然好想你》');
      const judge = judgeUrl(info);
      console.log(`   ${judge.reason}`);
      if (info?.url) await verifyUrl(info.url);
      results['五月天《突然好想你》'] = judge.ok ? '✅' : '❌';
    } else {
      results['五月天《突然好想你》'] = '❌ 未找到';
    }
    console.log('');
  }

  // ===== 测试 E: 赵雷《画》 =====
  console.log('─── 测试 E: 赵雷《画》 ───');
  {
    const song = await searchSong('画 赵雷', '赵雷');
    if (song) {
      const info = await getSongUrl(song.id);
      printSongInfo(info, '赵雷《画》');
      const judge = judgeUrl(info);
      console.log(`   ${judge.reason}`);
      if (info?.url) await verifyUrl(info.url);
      console.log(`💎 赵雷《画》: ${info?.url ? '✅ 完整 URL: ' + info.url : '❌ 拿不到'}`);
      results['赵雷《画》'] = judge.ok ? '✅' : '❌';
    } else {
      console.log('❌ 赵雷《画》搜不到 - 真的没版权');
      results['赵雷《画》'] = '❌ 未找到';
    }
    console.log('');
  }

  // ===== 测试 F: Yann Tiersen 钢琴曲 =====
  console.log('─── 测试 F: Yann Tiersen — Comptine d\'un autre été ───');
  {
    const song = await searchSong("Comptine d'un autre été Yann Tiersen", 'Yann Tiersen');
    if (song) {
      const info = await getSongUrl(song.id);
      printSongInfo(info, 'Yann Tiersen 钢琴曲');
      const judge = judgeUrl(info);
      console.log(`   ${judge.reason}`);
      if (info?.url) await verifyUrl(info.url);
      console.log(`💎 Yann Tiersen 钢琴曲: ${info?.url ? '✅ 完整 URL: ' + info.url : '❌ 拿不到'}`);
      results['Yann Tiersen 钢琴曲'] = judge.ok ? '✅' : '❌';
    } else {
      console.log('❌ Yann Tiersen 钢琴曲搜不到');
      results['Yann Tiersen 钢琴曲'] = '❌ 未找到';
    }
    console.log('');
  }

  // ===== 汇总 =====
  console.log('═══════════════════════════════════');
  console.log('📋 测试汇总：');
  for (const [name, status] of Object.entries(results)) {
    console.log(`   ${name.padEnd(20, '　')} ${status}`);
  }
  console.log('═══════════════════════════════════');
}

main().catch((err) => {
  console.error('💥 脚本出错:', err.message);
  process.exit(1);
});
