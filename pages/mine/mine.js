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
    goalMinutes: 25,
    loggedIn: false,
    nickname: '',
    avatar: '',
    openidShort: '',
    syncText: '',
    remind: false,
    calendar: [],
    monthLabel: '',
    marksTotal: 0,
    marksPreview: [],
    allMarks: [],
    showMarks: false,
    notesTotal: 0,
    notesPreview: [],
    allNotes: [],
    showNotes: false,
    showReport: false,
    reportImage: '',
    heatmap: [],
    showRestore: false,
    restoreDraft: ''
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
    const rows = app.getAllBookmarks();
    const noteRows = app.getAllNotes();
    this.setData({
      totalHours: Math.round(st.totalSeconds / 3600 * 10) / 10,
      totalDays: st.totalDays,
      streak: st.streak,
      todayMinutes: st.todayMinutes,
      last7,
      customBooks: app.globalData.customBooks || [],
      goalMinutes: app.getReadingGoal(),
      loggedIn,
      nickname: (u && u.nickname) || '',
      avatar: (u && u.avatar) || '',
      openidShort: openid ? openid.slice(0, 6) + '…' + openid.slice(-4) : '',
      syncText,
      calendar: this.buildCalendar(st),
      monthLabel: (new Date().getMonth() + 1) + ' 月打卡',
      marksTotal: rows.length,
      marksPreview: rows.slice(0, 2),
      notesTotal: noteRows.length,
      notesPreview: noteRows.slice(0, 2),
      heatmap: this.buildHeatmap(st)
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
  buildHeatmap(st) {
    const goal = app.getReadingGoal();
    const cols = [];
    const today = new Date();
    const keyOf = (d) => d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    for (let c = 0; c < 26; c++) {
      const col = [];
      for (let r = 0; r < 7; r++) {
        const back = (25 - c) * 7 + (6 - r);
        const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - back);
        const mins = Math.round(((st.daysMap && st.daysMap[keyOf(d)]) || 0) / 60);
        let level = 0;
        if (mins >= goal) level = 3;
        else if (mins >= 15) level = 2;
        else if (mins >= 1) level = 1;
        col.push({ k: c + '-' + r, level, today: back === 0 });
      }
      cols.push(col);
    }
    return cols;
  },
  openRestore() {
    this.setData({ showRestore: true });
  },
  closeRestore() {
    this.setData({ showRestore: false, restoreDraft: '' });
  },
  onRestoreInput(e) {
    this.setData({ restoreDraft: e.detail.value });
  },
  doRestore() {
    const json = this.data.restoreDraft.trim();
    if (!json) {
      wx.showToast({ title: '请先粘贴备份文本', icon: 'none' });
      return;
    }
    const that = this;
    wx.showModal({
      title: '恢复数据',
      content: '将覆盖当前阅读数据（进度/统计/书签/笔记/设置），确定继续吗？',
      confirmColor: '#b3592f',
      success(res) {
        if (!res.confirm) return;
        const r = app.importBackup(json);
        if (r.ok) {
          that.setData({ showRestore: false, restoreDraft: '' });
          that.refresh();
          wx.showToast({ title: '恢复成功', icon: 'success' });
        } else {
          wx.showToast({ title: r.err, icon: 'none' });
        }
      }
    });
  },
  doBackup() {
    const json = app.exportBackup();
    wx.setClipboardData({
      data: json,
      success() {
        wx.showModal({
          title: '备份已复制',
          content: '阅读数据已复制到剪贴板（约 ' + Math.round(json.length / 1024) + ' KB），请粘贴保存到备忘录或文件中。',
          showCancel: false
        });
      }
    });
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
  setGoal(e) {
    const g = Number(e.currentTarget.dataset.g);
    try { wx.setStorageSync('reading_goal', g); } catch (err) {}
    this.refresh();
    wx.showToast({ title: '目标已设为 ' + g + ' 分钟', icon: 'none' });
  },
  openMarksSheet() {
    this.setData({ showMarks: true, allMarks: app.getAllBookmarks() });
  },
  closeMarksSheet() {
    this.setData({ showMarks: false });
  },
  copyMarks() {
    const rows = app.getAllBookmarks();
    if (!rows.length) return;
    const text = rows.map((r, i) => (i + 1) + '. 《' + r.bookTitle + '》 ' + r.text).join('\n');
    wx.setClipboardData({
      data: text,
      success() {
        wx.showToast({ title: '已复制 ' + rows.length + ' 条摘抄', icon: 'success' });
      }
    });
  },
  openNotesSheet() {
    this.setData({ showNotes: true, allNotes: app.getAllNotes() });
  },
  closeNotesSheet() {
    this.setData({ showNotes: false });
  },
  copyNotes() {
    const rows = app.getAllNotes();
    if (!rows.length) return;
    const text = rows.map((r, i) => (i + 1) + '. 《' + r.bookTitle + '》 ' + r.text + '\n   心得：' + r.note).join('\n\n');
    wx.setClipboardData({
      data: text,
      success() {
        wx.showToast({ title: '已复制 ' + rows.length + ' 条笔记', icon: 'success' });
      }
    });
  },
  makeReport() {
    this.setData({ showReport: true, reportImage: '' });
    wx.nextTick(() => this.drawReport());
  },
  drawReport() {
    const that = this;
    wx.createSelectorQuery().in(this).select('#reportCanvas').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0] || !res[0].node) return;
      const canvas = res[0].node;
      const w = 300;
      const h = 440;
      const dpr = wx.getSystemInfoSync().pixelRatio || 2;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      const st = app.getReadingStats();
      const progress = app.globalData.progress;
      let finished = 0;
      Object.keys(progress).forEach((k) => {
        if ((progress[k].percent || 0) >= 99) finished++;
      });
      const now = new Date();
      const ym = now.getFullYear() + '-' + ('0' + (now.getMonth() + 1)).slice(-2);
      let monthDays = 0;
      Object.keys(st.daysMap || {}).forEach((k) => {
        if (k.indexOf(ym) === 0 && st.daysMap[k] >= 60) monthDays++;
      });
      ctx.fillStyle = '#f7f1e0';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#8c5a3c';
      ctx.fillRect(0, 0, w, 10);
      ctx.fillStyle = '#3b3224';
      ctx.font = 'bold 24px "Songti SC","STSong","SimSun",serif';
      ctx.fillText('灯下读书 · 阅读报告', 24, 56);
      ctx.fillStyle = '#b3a488';
      ctx.font = '12px sans-serif';
      ctx.fillText(now.getFullYear() + ' 年 ' + (now.getMonth() + 1) + ' 月', 24, 80);
      ctx.strokeStyle = '#c9b28a';
      ctx.beginPath();
      ctx.moveTo(24, 96);
      ctx.lineTo(w - 24, 96);
      ctx.stroke();
      const items = [
        { num: String(Math.round(st.totalSeconds / 3600 * 10) / 10), label: '累计阅读(小时)' },
        { num: String(st.totalDays), label: '阅读天数' },
        { num: String(st.streak), label: '连续打卡' },
        { num: String(finished), label: '读完本数' },
        { num: String(monthDays), label: '本月打卡(天)' }
      ];
      const cols = 2;
      const cellW = (w - 48) / cols;
      items.forEach((it, i) => {
        const cx = 24 + (i % cols) * cellW;
        const cy = 130 + Math.floor(i / cols) * 84;
        ctx.fillStyle = '#8c5a3c';
        ctx.font = 'bold 30px sans-serif';
        ctx.fillText(it.num, cx, cy + 24);
        ctx.fillStyle = '#9c8a6c';
        ctx.font = '12px sans-serif';
        ctx.fillText(it.label, cx, cy + 48);
      });
      ctx.fillStyle = '#b3a488';
      ctx.font = '11px sans-serif';
      ctx.fillText('读圣贤书 · 养浩然气', 24, h - 40);
      ctx.fillText('灯下读书', w - 24 - ctx.measureText('灯下读书').width, h - 40);
      ctx.fillStyle = '#c9b28a';
      ctx.fillRect(0, h - 8, w, 8);
      wx.canvasToTempFilePath({
        canvas,
        success(r) { that.setData({ reportImage: r.tempFilePath }); },
        fail() { wx.showToast({ title: '生成失败，请重试', icon: 'none' }); }
      }, that);
    });
  },
  saveReport() {
    if (!this.data.reportImage) return;
    wx.saveImageToPhotosAlbum({
      filePath: this.data.reportImage,
      success() { wx.showToast({ title: '已保存到相册', icon: 'success' }); },
      fail() {
        wx.showModal({
          title: '需要相册权限',
          content: '请在设置中允许保存到相册',
          confirmText: '去设置',
          success(r) { if (r.confirm) wx.openSetting(); }
        });
      }
    });
  },
  closeReport() {
    this.setData({ showReport: false });
  },
  noop() {},
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