// 灯下读书 - 全局逻辑
const books = require('./utils/books.js');
const auth = require('./services/auth.js');
const cloud = require('./services/cloud.js');

const SYNC_KEY = 'sync_meta';

function dayKey(d) {
  const m = ('0' + (d.getMonth() + 1)).slice(-2);
  const day = ('0' + d.getDate()).slice(-2);
  return d.getFullYear() + '-' + m + '-' + day;
}

function getSyncMeta() {
  try { return wx.getStorageSync(SYNC_KEY) || {}; } catch (e) { return {}; }
}

function setSyncMeta(m) {
  try { wx.setStorageSync(SYNC_KEY, m); } catch (e) {}
}

App({
  globalData: {
    books: books.list,
    progress: {},
    customBooks: [],
    stats: { days: {}, totalSeconds: 0 },
    isLoggedIn: false,
    user: null,
    cloudReady: false
  },
  onLaunch() {
    try {
      const p = wx.getStorageSync('reading_progress');
      if (p) this.globalData.progress = p;
    } catch (e) {}
    try {
      const c = wx.getStorageSync('custom_books');
      if (c && c.length) this.globalData.customBooks = c;
    } catch (e) {}
    try {
      const s = wx.getStorageSync('reading_stats');
      if (s) this.globalData.stats = s;
    } catch (e) {}
    this.refreshAuth();
    cloud.initCloud().then(() => {
      this.globalData.cloudReady = cloud.isReady();
      if (this.globalData.cloudReady) this.cloudPull();
    });
  },
  // ===== 登录态 =====
  refreshAuth() {
    const logged = auth.isLoggedIn();
    this.globalData.isLoggedIn = logged;
    this.globalData.user = logged ? auth.getUser() : null;
    return logged;
  },
  logout() {
    auth.logout();
    this.refreshAuth();
  },
  // ===== 云同步 =====
  cloudPull() {
    const that = this;
    if (!this.globalData.cloudReady || !this.globalData.isLoggedIn) return;
    cloud.syncPull().then((res) => {
      if (!res || !res.ok || !res.data) return;
      const meta = getSyncMeta();
      const d = res.data;
      const merge = (section, apply) => {
        const remote = d[section];
        if (remote && remote.data && remote.updatedAt > (meta[section] || 0)) {
          apply(remote.data);
          meta[section] = remote.updatedAt;
        }
      };
      merge('progress', (v) => {
        that.globalData.progress = v || {};
        that.saveProgress();
      });
      merge('stats', (v) => {
        that.globalData.stats = v || { days: {}, totalSeconds: 0 };
        try { wx.setStorageSync('reading_stats', that.globalData.stats); } catch (e) {}
      });
      merge('bookmarks', (v) => {
        try { wx.setStorageSync('bookmarks', v || {}); } catch (e) {}
      });
      merge('notes', (v) => {
        try { wx.setStorageSync('notes', v || {}); } catch (e) {}
      });
      merge('customBooks', (v) => {
        that.globalData.customBooks = v || [];
        try { wx.setStorageSync('custom_books', that.globalData.customBooks); } catch (e) {}
      });
      setSyncMeta(meta);
    }).catch(() => {});
  },
  scheduleCloudPush(section) {
    const that = this;
    if (!this.globalData.cloudReady || !this.globalData.isLoggedIn) return;
    if (!this._pushTimers) this._pushTimers = {};
    if (this._pushTimers[section]) clearTimeout(this._pushTimers[section]);
    this._pushTimers[section] = setTimeout(() => {
      let data = null;
      if (section === 'progress') data = that.globalData.progress;
      else if (section === 'stats') data = that.globalData.stats;
      else if (section === 'bookmarks') {
        try { data = wx.getStorageSync('bookmarks') || {}; } catch (e) { data = {}; }
      } else if (section === 'notes') {
        try { data = wx.getStorageSync('notes') || {}; } catch (e) { data = {}; }
      } else if (section === 'customBooks') data = that.globalData.customBooks;
      if (!data) return;
      const now = Date.now();
      cloud.syncPush(section, data, now).then((res) => {
        if (res && res.ok) {
          const meta = getSyncMeta();
          meta[section] = now;
          setSyncMeta(meta);
        }
      }).catch(() => {});
    }, 1500);
  },
  // ===== 书签（本地 + 云端） =====
  getBookmarks(bookId) {
    let all = {};
    try { all = wx.getStorageSync('bookmarks') || {}; } catch (e) {}
    return all[bookId] || [];
  },
  setBookmarks(bookId, marks) {
    let all = {};
    try { all = wx.getStorageSync('bookmarks') || {}; } catch (e) {}
    all[bookId] = marks;
    try { wx.setStorageSync('bookmarks', all); } catch (e) {}
    this.scheduleCloudPush('bookmarks');
  },
  // 全部书签（摘抄）汇总：跨书合并，附书名，按时间倒序
  getBookNotes(bookId) {
    let all = {};
    try { all = wx.getStorageSync('notes') || {}; } catch (e) {}
    return all[bookId] || [];
  },
  setBookNotes(bookId, notes) {
    let all = {};
    try { all = wx.getStorageSync('notes') || {}; } catch (e) {}
    all[bookId] = notes;
    try { wx.setStorageSync('notes', all); } catch (e) {}
    this.scheduleCloudPush('notes');
  },
  getAllNotes() {
    let all = {};
    try { all = wx.getStorageSync('notes') || {}; } catch (e) {}
    const titleMap = {};
    books.list.forEach((b) => { titleMap[b.id] = b.title; });
    (this.globalData.customBooks || []).forEach((b) => { titleMap[b.id] = b.title; });
    const rows = [];
    Object.keys(all).forEach((bid) => {
      const notes = all[bid] || [];
      notes.forEach((n) => {
        rows.push({
          bookId: bid,
          bookTitle: titleMap[bid] || '未命名书',
          text: n.t,
          note: n.note,
          idx: n.idx,
          ts: n.ts || 0
        });
      });
    });
    rows.sort((a, b) => b.ts - a.ts);
    return rows;
  },
  getAllBookmarks() {
    let all = {};
    try { all = wx.getStorageSync('bookmarks') || {}; } catch (e) {}
    const titleMap = {};
    books.list.forEach((b) => { titleMap[b.id] = b.title; });
    (this.globalData.customBooks || []).forEach((b) => { titleMap[b.id] = b.title; });
    const rows = [];
    Object.keys(all).forEach((bid) => {
      const marks = all[bid] || [];
      marks.forEach((m) => {
        rows.push({
          bookId: bid,
          bookTitle: titleMap[bid] || '未命名书',
          text: m.t,
          idx: m.idx,
          ts: m.ts || 0
        });
      });
    });
    rows.sort((a, b) => b.ts - a.ts);
    return rows;
  },
  // ===== 进度与统计 =====
  saveProgress() {
    try { wx.setStorageSync('reading_progress', this.globalData.progress); } catch (e) {}
  },
  getProgress(id) {
    return this.globalData.progress[id] || null;
  },
  setProgress(id, val) {
    this.globalData.progress[id] = val;
    this.saveProgress();
    this.scheduleCloudPush('progress');
  },
  addReadingSeconds(sec) {
    const s = this.globalData.stats;
    s.totalSeconds = (s.totalSeconds || 0) + sec;
    const key = dayKey(new Date());
    s.days[key] = (s.days[key] || 0) + sec;
    try { wx.setStorageSync('reading_stats', s); } catch (e) {}
    this.scheduleCloudPush('stats');
    const goal = this.getReadingGoal();
    return (s.days[key] || 0) >= goal * 60;
  },
  exportBackup() {
    const data = {
      version: 14,
      exportedAt: Date.now(),
      progress: this.globalData.progress,
      stats: this.globalData.stats,
      bookmarks: {},
      notes: {},
      customBooks: this.globalData.customBooks,
      settings: {}
    };
    try { data.bookmarks = wx.getStorageSync('bookmarks') || {}; } catch (e) {}
    try { data.notes = wx.getStorageSync('notes') || {}; } catch (e) {}
    try { data.settings.reading_goal = wx.getStorageSync('reading_goal') || 25; } catch (e) {}
    try { data.settings.reader_theme = wx.getStorageSync('reader_theme') || 'paper'; } catch (e) {}
    try { data.settings.reader_font = wx.getStorageSync('reader_font') || 'song'; } catch (e) {}
    return JSON.stringify(data);
  },
  getReadingGoal() {
    try {
      const g = wx.getStorageSync('reading_goal');
      return g ? Number(g) : 25;
    } catch (e) {
      return 25;
    }
  },
  getReadingStats() {
    const s = this.globalData.stats;
    const days = s.days || {};
    const todaySeconds = days[dayKey(new Date())] || 0;
    let totalDays = 0;
    Object.keys(days).forEach(k => { if (days[k] >= 60) totalDays++; });
    const t = new Date();
    if (todaySeconds < 60) t.setDate(t.getDate() - 1);
    let streak = 0;
    while ((days[dayKey(t)] || 0) >= 60) {
      streak++;
      t.setDate(t.getDate() - 1);
    }
    const weekNames = ['日', '一', '二', '三', '四', '五', '六'];
    const now = new Date();
    const last7 = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      last7.push({ label: '周' + weekNames[d.getDay()], minutes: Math.round((days[dayKey(d)] || 0) / 60) });
    }
    return {
      totalSeconds: s.totalSeconds || 0,
      todayMinutes: Math.round(todaySeconds / 60),
      totalDays,
      streak,
      last7,
      daysMap: days
    };
  }
});