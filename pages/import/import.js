const app = getApp();
const formats = require('../../services/formats.js');

function sanitizeName(s, fallback) {
  let name = (s || '').trim().replace(/[\\/:*?"<>|]/g, '');
  if (!name) name = fallback;
  return name.slice(0, 30);
}

Page({
  data: {
    title: '',
    content: '',
    pcMode: false,
    importing: false
  },
  onLoad() {
    // 识别运行端：电脑端微信可直接打开本地文件对话框
    let platform = 'phone';
    try { platform = wx.getSystemInfoSync().platform || 'phone'; } catch (e) {}
    const pcMode = ['windows', 'mac', 'devtools'].indexOf(platform) >= 0;
    this.setData({ pcMode });
  },
  onInputTitle(e) {
    this.setData({ title: e.detail.value });
  },
  onInputContent(e) {
    this.setData({ content: e.detail.value });
  },
  // 方式一：多端本地上传（电脑直接选本地文件 / 手机从聊天文件选择），支持批量
  chooseFile() {
    if (this.data.importing) return;
    const that = this;
    wx.chooseMessageFile({
      count: 20,
      type: 'file',
      success(res) {
        const files = (res.tempFiles || []).filter((f) => f && f.path);
        if (!files.length) return;
        that.importBatch(files);
      },
      fail(err) {
        if (err && err.errMsg && err.errMsg.indexOf('cancel') >= 0) return;
        wx.showToast({ title: '未选择文件', icon: 'none' });
      }
    });
  },
  importBatch(files) {
    const that = this;
    const existing = app.globalData.customBooks || [];
    const existKey = (t, ty) => existing.some((b) => b.title === t && b.type === ty);
    let done = 0;
    let added = 0;
    let skipped = 0;
    this.setData({ importing: true });
    wx.showLoading({ title: '导入中 0/' + files.length });
    const fs = wx.getFileSystemManager();
    const step = (i) => {
      if (i >= files.length) {
        wx.hideLoading();
        that.setData({ importing: false });
        const msg = skipped ? '已导入 ' + added + ' 本，跳过重复 ' + skipped : '已导入 ' + added + ' 本';
        wx.showToast({ title: msg, icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }
      const f = files[i];
      const type = formats.detectType(f.name);
      const title = sanitizeName(String(f.name || '').replace(/\.[^.]+$/, ''), '未命名书籍');
      if (existKey(title, type)) {
        skipped++;
        done++;
        wx.showLoading({ title: '导入中 ' + done + '/' + files.length });
        step(i + 1);
        return;
      }
      fs.saveFile({
        tempFilePath: f.path,
        success(saveRes) {
          that.registerBook(title, type, saveRes.savedFilePath, f.size || 0);
          existing.push({ title, type });
          added++;
          done++;
          wx.showLoading({ title: '导入中 ' + done + '/' + files.length });
          step(i + 1);
        },
        fail() {
          done++;
          wx.showLoading({ title: '导入中 ' + done + '/' + files.length });
          step(i + 1);
        }
      });
    };
    step(0);
  },
  // 方式二：粘贴文本成书
  savePasted() {
    const title = this.data.title.trim();
    const content = this.data.content.trim();
    if (!title) {
      wx.showToast({ title: '请先填写书名', icon: 'none' });
      return;
    }
    if (!content) {
      wx.showToast({ title: '请粘贴正文内容', icon: 'none' });
      return;
    }
    const that = this;
    const id = 'custom_' + Date.now();
    const dir = wx.env.USER_DATA_PATH + '/mybooks';
    const file = dir + '/' + sanitizeName(title, 'book') + '_' + id + '.txt';
    const fs = wx.getFileSystemManager();
    const doWrite = () => {
      fs.writeFile({
        filePath: file,
        data: content,
        encoding: 'utf-8',
        success() {
          that.registerBook(title, 'txt', file, content.length);
          wx.showToast({ title: '已加入书架', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 600);
        },
        fail() {
          wx.showToast({ title: '保存失败，请重试', icon: 'none' });
        }
      });
    };
    fs.mkdir({ dirPath: dir, recursive: true, success: doWrite, fail: doWrite });
  },
  registerBook(title, type, file, size) {
    const id = 'custom_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const book = {
      id,
      title,
      author: '我的藏书',
      category: '我的书籍',
      file,
      type,
      size: size || 0,
      pkg: 'main',
      custom: true,
      addedAt: Date.now()
    };
    const list = app.globalData.customBooks || [];
    list.unshift(book);
    app.globalData.customBooks = list;
    try { wx.setStorageSync('custom_books', list); } catch (e) {}
    app.scheduleCloudPush('customBooks');
    if (type === 'txt') {
      wx.getFileSystemManager().readFile({
        filePath: file,
        encoding: 'utf-8',
        success(r) {
          if (r.data && r.data.indexOf('\uFFFD') >= 0) {
            wx.showToast({ title: '可能非 UTF-8 编码，或显示乱码', icon: 'none' });
          }
        },
        fail() {}
      });
    }
    if (app.globalData.cloudReady && app.globalData.isLoggedIn) {
      const cloud = require('../../services/cloud.js');
      const s = require('../../services/auth.js').getSession();
      const openid = (s && s.openid) || 'u';
      const ext = (type === 'other') ? 'bin' : type;
      const cloudPath = 'mybooks/' + openid + '/' + sanitizeName(title, 'book') + '_' + id + '.' + ext;
      cloud.uploadBookFile(file, cloudPath).then((r) => {
        if (r && r.fileID) {
          const cur = app.globalData.customBooks || [];
          const b = cur.find((x) => x.id === id);
          if (b) {
            b.cloudFileID = r.fileID;
            try { wx.setStorageSync('custom_books', cur); } catch (e) {}
            app.scheduleCloudPush('customBooks');
          }
        }
      }).catch(() => {});
    }
  }
});