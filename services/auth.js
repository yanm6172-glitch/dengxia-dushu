// 登录服务：微信小程序标准登录流程（wx.login -> 服务端换 token -> 会话管理）
//
// 【生产接入说明】
// 方式一（推荐）：微信云开发
//   1. 微信开发者工具点「云开发」开通环境
//   2. 右键 cloudfunctions/login 目录 -> 上传并部署（云端安装依赖）
//   3. 把下方 USE_CLOUD 改为 true
// 方式二：自建后端
//   在 remoteExchange() 中实现 wx.request 调用（域名需在小程序后台配置合法域名），
//   后端用 code 调微信 code2session 接口换取 openid 并签发 token。
const USE_CLOUD = false;

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';
const AGREEMENT_KEY = 'auth_agreed';
const TOKEN_TTL = 7 * 24 * 3600 * 1000; // 7 天

function wxLogin() {
  return new Promise((resolve, reject) => {
    wx.login({
      success(res) { resolve(res.code); },
      fail: reject
    });
  });
}

// 模拟后端 code2session（本地演示用；生产环境由服务端完成）
function mockExchange(code) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const openid = 'mock_' + (code ? String(code).slice(0, 12) : 'guest');
      const token = 'tk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
      resolve({ token, openid, expiresAt: Date.now() + TOKEN_TTL });
    }, 400);
  });
}

// 云开发后端：调用 login 云函数
function cloudExchange(code) {
  return wx.cloud.callFunction({ name: 'login', data: { code } }).then((r) => {
    const d = (r && r.result) || {};
    return { token: d.token, openid: d.openid, expiresAt: Date.now() + TOKEN_TTL };
  });
}

// 自建后端（TODO：替换为你的接口地址）
function remoteExchange(code) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: 'https://your-api.example.com/auth/login',
      method: 'POST',
      data: { code },
      success(r) { resolve(r.data && r.data.data); },
      fail: reject
    });
  });
}

function saveSession(res) {
  try {
    wx.setStorageSync(TOKEN_KEY, {
      token: res.token,
      openid: res.openid,
      expiresAt: res.expiresAt
    });
  } catch (e) {}
}

function getSession() {
  try { return wx.getStorageSync(TOKEN_KEY) || null; } catch (e) { return null; }
}

function login() {
  return wxLogin().then((code) => {
    if (USE_CLOUD && wx.cloud) {
      return cloudExchange(code);
    }
    // 未接后端时使用本地模拟；接好后改为 remoteExchange(code)
    return mockExchange(code);
  }).then((res) => {
    saveSession(res);
    return res;
  });
}

function isLoggedIn() {
  const s = getSession();
  return !!(s && s.token && s.expiresAt > Date.now());
}

function getUser() {
  try { return wx.getStorageSync(USER_KEY) || null; } catch (e) { return null; }
}

function saveProfile(profile) {
  const u = Object.assign({}, getUser() || {}, profile);
  try { wx.setStorageSync(USER_KEY, u); } catch (e) {}
  return u;
}

function hasAgreed() {
  try { return !!wx.getStorageSync(AGREEMENT_KEY); } catch (e) { return false; }
}

function setAgreed(v) {
  try { wx.setStorageSync(AGREEMENT_KEY, !!v); } catch (e) {}
}

function logout() {
  try { wx.removeStorageSync(TOKEN_KEY); } catch (e) {}
}

module.exports = {
  login,
  isLoggedIn,
  getSession,
  getUser,
  saveProfile,
  hasAgreed,
  setAgreed,
  logout
};