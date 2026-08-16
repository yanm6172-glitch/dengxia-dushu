const app = getApp();
const auth = require('../../services/auth.js');
const remind = require('../../services/remind.js');

Page({
  data: {
    totalHours: 0,
    totalDays: 0,
    streak: 0,
    todayMinutes: 0,
    last7: [],
    customBooks: [],
    loggedIn: false,
    nickname: '',
    avatar: '',
    openidShort: '',
    syncText: '',
    remind: false,
    calendar: [],
    monthLabel: ''
  },
  onShow() {
    let remind = false;
    try { remind = !!wx.getStorageSync('remind_on'); } catch (e) {}
    this.setData({ remind });
    this.refresh();
  },
  refresh() {
    const st = app.getReadingStats();
    const maxM = st.last7.reduce((m, d) => Math.max(m, d.minutes), 0) || 1;
    const last7 = st.last7.map(d => ({
      label: d.label,
      minutes: d.minutes,
      h: d.minutes > 0 ? Math.round(6 + d.minutes / maxM * 64) : 6
    }));
    const logged = app.refreshAuth();
    const cloudReady = app.globalData.cloudReady;
    let syncText = '登录后开启云端同步';
    if (logged) syncText = cloudReady ? '已开启云端同步' : '云开发未开通，数据仅存本机';
    const u = auth.getUser();
    const s = auth.getSession();
    const openid = (s && s.openid) || '';
    this.setData({
      totalHours: Math.round(st.totalSeconds / 3600 * 10) / 10,
      totalDays: st.totalDays,
      streak: st.streak,
      todayMinutes: st.todayMinutes,
      last7,
      customBooks: app.globalData.customBooks || [],
      loggedIn,
      nickname: (u && u.nickname) || '',
      avatar: (u && u.avatar) || '',
      openidShort: openid ? openid.slice(0, 6) + '…' + openid.slice(-4) : '',
      syncText,
      calendar: this.buildCalendar(st),
      monthLabel: (new Date().getMonth() + 1) + ' 月打卡'
    });
  },
  goLogin() {
    wx.navigateTo({ url: '/pages/login/login' });
  },
  onChooseAvatar(e) {
    const avatar = e.detail.avatarUrl;
    auth.saveProfile({ avatar });
    app.refreshAuth();
    this.refresh();
    wx.showToast({ title: '头像已更新', icon: 'success' });
  },
  onNicknameBlur(e) {
    const nickname = (e.detail.value || '').trim();
    if (!nickname) return;
    auth.saveProfile({ nickname });
    app.refreshAuth();
    this.refresh();
    wx.showToast({ title: '昵称已更新', icon: 'success' });
  },
  doLogout() {
    const that = this;
    wx.showModal({
      title: '退出登录',
      content: '退出后本地阅读进度仍保留，云端同步将停止。确定退出吗？',
      confirmColor: '#b3592f',
      success(res) {
        if (!res.confirm) return;
        app.logout();
        that.refresh();
        wx.showToast({ title: '已退出登录', icon: 'none' });
      }
    });
  },
  buildCalendar(st) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstWeekday = new Date(year, month, 1).getDay();
    const cal = [];
    for (let i = 0; i < firstWeekday; i++) cal.push({ d: '', on: false });
    const pad = (n) => ('0' + n).slice(-2);
    for (let d = 1; d <= daysInMonth; d++) {
      const key = year + '-' + pad(month + 1) + '-' + pad(d);
      const sec = (st.daysMap && st.daysMap[key]) || 0;
      cal.push({ d, on: sec >= 60 });
    }
    return cal;
  },
  toggleRemind() {
    const next = !this.data.remind;
    if (next && !remind.TEMPLATE_ID) {
      wx.showModal({
        title: '每日阅读提醒',
        content: '上线前需在微信公众平台配置订阅消息模板（模板 ID 填入 services/remind.js）。当前先记住你的开关。',
        showCancel: false
      });
    } else if (next) {
      remind.request();
    }
    this.setData({ remind: next });
    try { wx.setStorageSync('remind_on', next); } catch (e) {}
  },
  goImport() {
    wx.navigateTo({ url: '/pages/import/import' });
  },
  openBook(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/reader/reader?id=' + id });
  },
  deleteBook(e) {
    const id = e.currentTarget.dataset.id;
    const list = app.globalData.customBooks || [];
    const book = list.find(b => b.id === id);
    if (!book) return;
    const that = this;
    wx.showModal({
      title: '删除自藏书',
      content: '确定删除《' + book.title + '》吗？',
      confirmColor: '#b3592f',
      success(res) {
        if (!res.confirm) return;
        try {
          wx.getFileSystemManager().unlink({ filePath: book.file, fail() {} });
        } catch (err) {}
        const next = list.filter(b => b.id !== id);
        app.globalData.customBooks = next;
        try { wx.setStorageSync('custom_books', next); } catch (err) {}
        app.scheduleCloudPush('customBooks');
        that.refresh();
      }
    });
  }
});