const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const BASE = 'http://localhost:3000';
const COOKIE_FILE = path.join(__dirname, 'cookie.txt');
const QRCODE_FILE = path.join(__dirname, 'qrcode.png');
const MAX_RETRIES = 60;
const POLL_INTERVAL = 3000;

// 检查 axios 是否安装，没有就装
function ensureAxios() {
  try {
    require.resolve('axios');
  } catch {
    console.log('📦 axios 未安装，正在安装...');
    require('child_process').execSync('npm install axios', {
      cwd: __dirname,
      stdio: 'inherit',
    });
  }
}

async function main() {
  ensureAxios();
  const axios = require('axios');

  // --- Step 1: 获取 unikey ---
  console.log('🔑 正在获取登录密钥...');
  const keyRes = await axios.get(`${BASE}/login/qr/key`, {
    params: { timestamp: Date.now() },
  });
  const unikey = keyRes.data?.data?.unikey;
  if (!unikey) {
    console.error('❌ 获取 unikey 失败，响应:', JSON.stringify(keyRes.data));
    process.exit(1);
  }
  console.log(`✅ unikey: ${unikey}`);

  // --- Step 2: 生成二维码 ---
  console.log('🎨 正在生成二维码...');
  const qrRes = await axios.get(`${BASE}/login/qr/create`, {
    params: { key: unikey, qrimg: true, timestamp: Date.now() },
  });
  const qrimg = qrRes.data?.data?.qrimg;
  if (!qrimg) {
    console.error('❌ 获取二维码失败，响应:', JSON.stringify(qrRes.data));
    process.exit(1);
  }

  // base64 → buffer → 写入文件
  const base64Data = qrimg.includes(',') ? qrimg.split(',')[1] : qrimg;
  fs.writeFileSync(QRCODE_FILE, Buffer.from(base64Data, 'base64'));
  console.log('✅ 二维码已保存到 qrcode.png');

  // --- Step 3: 自动打开二维码 ---
  exec(`start "" "${QRCODE_FILE}"`);
  console.log('📷 已打开二维码图片，请用网易云 App 扫码登录...\n');

  // --- Step 4: 轮询登录状态 ---
  for (let i = 1; i <= MAX_RETRIES; i++) {
    await sleep(POLL_INTERVAL);

    const checkRes = await axios.get(`${BASE}/login/qr/check`, {
      params: { key: unikey, timestamp: Date.now() },
    });
    const code = checkRes.data?.code;

    switch (code) {
      case 801:
        console.log(`⏳ 等待扫码... (${i}/${MAX_RETRIES})`);
        break;
      case 802:
        console.log('📱 已扫码，请在手机上点确认');
        break;
      case 803: {
        const cookie = checkRes.data?.cookie;
        if (cookie) {
          fs.writeFileSync(COOKIE_FILE, cookie, 'utf-8');
          console.log('✅ 登录成功！cookie 已保存');
        } else {
          console.log('⚠️ 登录成功但未获取到 cookie，响应:', JSON.stringify(checkRes.data));
        }
        process.exit(0);
      }
      case 800:
        console.log('❌ 二维码过期，请重新运行脚本');
        process.exit(1);
      default:
        console.log(`❓ 未知状态码: ${code}，响应:`, JSON.stringify(checkRes.data));
        break;
    }
  }

  console.log(`⏰ 已轮询 ${MAX_RETRIES} 次（约 3 分钟），超时退出`);
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error('💥 脚本出错:', err.message);
  process.exit(1);
});
