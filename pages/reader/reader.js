const booksData = require('../../utils/books.js');
const app = getApp();

function readFile(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: 'utf-8',
      success(res) { resolve(res.data); },
      fail(err) { reject(err); }
    });
  });
}

// 按二进制读取（EPUB 解析用）
function readFileBinary(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      success(res) { resolve(res.data); },
      fail(err) { reject(err); }
    });
  });
}



// 自藏书：优先读本地文件；本地缺失且有云端副本时从云存储下载
function ensureCustomFile(book) {
  if (!book.cloudFileID) return Promise.resolve(book.file);
  const fs = wx.getFileSystemManager();
  return new Promise((resolve) => {
    fs.access({
      path: book.file,
      success() { resolve(book.file); },
      fail() {
        const cloud = require('../../services/cloud.js');
        cloud.downloadBookFile(book.cloudFileID).then((r) => {
          resolve((r && r.tempFilePath) || book.file);
        }).catch(() => resolve(book.file));
      }
    });
  });
}

function isHeading(s) {
  if (!s || s.length > 30) return false;
  if (/^[【●■□]/.test(s)) return true;
  if (/^【[^】]{1,30}】$/.test(s)) return true;
  if (/^第[一二三四五六七八九十百千0-9]+[卷章篇节回]/.test(s)) return true;
  if (/^卷[上中下]?[一二三四五六七八九十]/.test(s)) return true;
  if (/^[一二三四五六七八九十]+$/.test(s)) return true;
  if (/^[一二三四五六七八九十]{1,3}[、．.\s]/.test(s)) return true;
  if (/^《[^》]{1,20}》$/.test(s)) return true;
  if (/^(序|跋|自序|序言|导读|前言)$/.test(s)) return true;
  return false;
}

// 把被并入长行的章节标记（●卷一 / 【篇名】）重新拆成独立行
function splitMarks(line) {
  if (line.indexOf('●') < 0 && line.indexOf('【') < 0) return [line];
  return line.split(/(?=[●【])/).map((p) => p.trim()).filter((p) => p);
}

function splitLong(line) {
  if (line.length <= 120) return [line];
  const parts = [];
  let buf = '';
  const endMarks = '。！？；」』”';
  for (let i = 0; i < line.length; i++) {
    buf += line[i];
    if (endMarks.indexOf(line[i]) >= 0 && buf.length > 40) {
      parts.push(buf.trim());
      buf = '';
    }
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts;
}

function cleanText(raw) {
  let t = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const starts = [
    '*** START OF THE PROJECT GUTENBERG EBOOK',
    '*** START OF THIS PROJECT GUTENBERG EBOOK'
  ];
  for (let i = 0; i < starts.length; i++) {
    const idx = t.indexOf(starts[i]);
    if (idx >= 0) { t = t.slice(idx + starts[i].length); break; }
  }
  const ends = [
    '*** END OF THE PROJECT GUTENBERG EBOOK',
    '*** END OF THIS PROJECT GUTENBERG EBOOK'
  ];
  for (let i = 0; i < ends.length; i++) {
    const idx = t.indexOf(ends[i]);
    if (idx >= 0) { t = t.slice(0, idx); break; }
  }
  const lines = t.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (/^The Project Gutenberg|^This eBook|^Title:|^Author:|^Release Date|^Language:|^Character set|^\*\*\* START|^\*\*\* END/i.test(line)) continue;
    const marks = splitMarks(line);
    for (let k = 0; k < marks.length; k++) {
      const chunks = splitLong(marks[k]);
      for (let j = 0; j < chunks.length; j++) out.push(chunks[j]);
    }
  }
  return out;
}

Page({
  data: {
    title: '',
    author: '',
    paragraphs: [],
    catalog: [],
    marks: [],
    fontSize: 2,
    night: false,
    percent: 0,
    scrollTop: 0,
    scrollIntoView: '',
    showCatalog: false,
    catTab: 'catalog',
    currentChapter: '',
    curHeadIdx: -1,
    bookmarkCount: 0,
    viewMode: 'text'
  },
  onLoad(options) {
    const id = options && options.id;
    const book = booksData.list.find(b => b.id === id) || (app.globalData.customBooks || []).find(b => b.id === id);
    if (!book) {
      wx.showToast({ title: '未找到这本书', icon: 'none' });
      return;
    }
    this.book = book;
    // PDF / 办公文档：微信内置阅读器打开
    const fmt = require('../../services/formats.js');
    if (fmt.isDocType(book.type)) {
      this.setData({ viewMode: 'doc', title: book.title, author: book.author });
      wx.setNavigationBarTitle({ title: book.title });
      return;
    }
    const fontSize = wx.getStorageSync('reader_fontsize') || 2;
    const night = wx.getStorageSync('reader_night') || false;
    this.setData({ title: book.title, author: book.author, fontSize, night });
    wx.setNavigationBarTitle({ title: book.title });
    this.loadMarks();
    this.loadBook(book);
  },
  onShow() {
    this._sessionStart = Date.now();
  },
  endSession() {
    if (this._sessionStart) {
      const sec = Math.round((Date.now() - this._sessionStart) / 1000);
      this._sessionStart = null;
      if (sec > 0) app.addReadingSeconds(sec);
    }
  },
  loadMarks() {
    const marks = app.getBookmarks(this.book.id);
    this.setData({ marks, bookmarkCount: marks.length });
  },
  saveMarks() {
    app.setBookmarks(this.book.id, this.data.marks);
  },
  loadBook(book) {
    const that = this;
    wx.showLoading({ title: '开卷……' });
    const render = (raw) => {
      const lines = cleanText(raw);
      const paragraphs = [];
      const catalog = [];
      for (let i = 0; i < lines.length; i++) {
        const h = isHeading(lines[i]);
        if (h) catalog.push({ t: lines[i], idx: paragraphs.length });
        paragraphs.push({ t: lines[i], h });
      }
      that.headings = catalog;
      const finish = () => {
        const p = app.getProgress(book.id);
        if (p && p.scrollTop > 0) {
          setTimeout(() => {
            that.setData({ scrollTop: p.scrollTop });
            wx.showToast({ title: '已恢复到上次进度', icon: 'none' });
          }, 200);
        }
        wx.hideLoading();
      };
      // 分批渲染：首屏先出 800 段，其余每 60ms 追加一批
      const CHUNK = 800;
      that.setData({ paragraphs: paragraphs.slice(0, CHUNK), catalog }, () => {
        if (paragraphs.length <= CHUNK) { finish(); return; }
        let i = CHUNK;
        const timer = setInterval(() => {
          const patch = {};
          const end = Math.min(i + CHUNK, paragraphs.length);
          for (let j = i; j < end; j++) {
            patch['paragraphs[' + j + ']'] = paragraphs[j];
          }
          i = end;
          that.setData(patch);
          if (i >= paragraphs.length) {
            clearInterval(timer);
            finish();
          }
        }, 60);
      });
    };
    const fail = (e) => {
      wx.hideLoading();
      const msg = (e && e.errMsg) ? e.errMsg : String(e);
      wx.showModal({
        title: '打开失败',
        content: msg + '\n文件: ' + book.file,
        showCancel: false
      });
    };
    if (book.custom) {
      // 自藏书：EPUB 走解析器，其余文本类直接读
      const fmt = require('../../services/formats.js');
      if (book.type === 'epub') {
        ensureCustomFile(book)
          .then((p) => readFileBinary(p))
          .then((buf) => render(fmt.epubToText(buf)))
          .catch(fail);
      } else {
        ensureCustomFile(book).then((p) => readFile(p)).then(render).catch(fail);
      }
      return;
    }
    // 内置公版书：从压缩数据模块直接解压（require 加载，不依赖文件系统）
    try {
      const raw = booksData.getText(book.id);
      if (!raw) {
        fail(new Error('未找到书籍数据: ' + book.id));
        return;
      }
      render(raw);
    } catch (e) {
      fail(e);
    }
  },
  openDoc() {
    this.openDocumentBook(this.book);
  },
  openDocumentBook(book) {
    const that = this;
    if (!book || !book.file) return;
    const doOpen = (path) => {
      const opt = {
        filePath: path,
        showMenu: true,
        fail(e) {
          wx.showModal({
            title: '打开失败',
            content: (e && e.errMsg) ? e.errMsg : '微信内置阅读器无法打开该文件',
            showCancel: false
          });
        }
      };
      if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].indexOf(book.type) >= 0) {
        opt.fileType = book.type;
      }
      wx.openDocument(opt);
    };
    if (book.custom) {
      ensureCustomFile(book).then(doOpen).catch(() => doOpen(book.file));
    } else {
      doOpen(book.file);
    }
  },
  onScroll(e) {
    const d = e.detail;
    this.lastScroll = d;
    if (this.data.scrollIntoView) this.setData({ scrollIntoView: '' });
    const denom = Math.max(1, (d.scrollHeight || 600) - 400);
    const percent = Math.min(100, Math.max(0, Math.round(d.scrollTop / denom * 100)));
    if (this.data.percent !== percent) this.setData({ percent });
    const total = this.data.paragraphs.length;
    if (total) {
      const para = Math.min(total - 1, Math.round(d.scrollTop / Math.max(1, d.scrollHeight) * total));
      let cur = '';
      let curIdx = -1;
      const hs = this.headings || [];
      for (let i = 0; i < hs.length; i++) {
        if (hs[i].idx <= para) { cur = hs[i].t; curIdx = hs[i].idx; } else break;
      }
      if (this._curIdx !== curIdx) {
        this._curIdx = curIdx;
        this.setData({ currentChapter: cur, curHeadIdx: curIdx });
      }
    }
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => this.saveProgress(d), 2000);
  },
  saveProgress(d) {
    if (!this.book) return;
    d = d || this.lastScroll;
    if (!d) return;
    const denom = Math.max(1, (d.scrollHeight || 600) - 400);
    const percent = Math.min(100, Math.max(0, Math.round(d.scrollTop / denom * 100)));
    app.setProgress(this.book.id, {
      scrollTop: d.scrollTop,
      percent,
      updatedAt: Date.now()
    });
  },
  onParaLongPress(e) {
    const idx = e.currentTarget.dataset.idx;
    const para = this.data.paragraphs[idx];
    if (!para) return;
    const that = this;
    wx.showActionSheet({
      itemList: ['复制本段', '添加书签'],
      success(res) {
        if (res.tapIndex === 0) {
          wx.setClipboardData({ data: para.t });
        } else if (res.tapIndex === 1) {
          const marks = that.data.marks.slice();
          const exists = marks.some(m => m.idx === idx);
          if (exists) {
            wx.showToast({ title: '已在书签中', icon: 'none' });
            return;
          }
          marks.push({
            idx,
            t: para.t.slice(0, 24) + (para.t.length > 24 ? '…' : ''),
            ts: Date.now()
          });
          marks.sort((a, b) => a.idx - b.idx);
          that.setData({ marks, bookmarkCount: marks.length });
          that.saveMarks();
          wx.showToast({ title: '已加入书签', icon: 'success' });
        }
      }
    });
  },
  setCatTab(e) {
    this.setData({ catTab: e.currentTarget.dataset.t });
  },
  toggleCatalog() {
    this.setData({ showCatalog: !this.data.showCatalog, catTab: 'catalog' });
  },
  toggleMarks() {
    this.setData({ showCatalog: !this.data.showCatalog, catTab: 'mark' });
  },
  closeCatalog() {
    this.setData({ showCatalog: false });
  },
  goCatalog(e) {
    const idx = e.currentTarget.dataset.idx;
    this.setData({ showCatalog: false, scrollIntoView: 'p' + idx });
  },
  goMark(e) {
    const idx = e.currentTarget.dataset.idx;
    this.setData({ showCatalog: false, scrollIntoView: 'p' + idx });
  },
  deleteMark(e) {
    const idx = e.currentTarget.dataset.idx;
    const marks = this.data.marks.filter(m => m.idx !== idx);
    this.setData({ marks, bookmarkCount: marks.length });
    this.saveMarks();
    wx.showToast({ title: '书签已删除', icon: 'none' });
  },
  fontSmaller() {
    const v = Math.max(1, this.data.fontSize - 1);
    this.setData({ fontSize: v });
    wx.setStorageSync('reader_fontsize', v);
  },
  fontBigger() {
    const v = Math.min(4, this.data.fontSize + 1);
    this.setData({ fontSize: v });
    wx.setStorageSync('reader_fontsize', v);
  },
  toggleNight() {
    const night = !this.data.night;
    this.setData({ night });
    wx.setStorageSync('reader_night', night);
  },
  onHide() {
    this.endSession();
    this.saveProgress();
  },
  onUnload() {
    this.endSession();
    this.saveProgress();
  },
  onShareAppMessage() {
    return {
      title: '一起读《' + this.data.title + '》',
      path: '/pages/reader/reader?id=' + (this.book ? this.book.id : '')
    };
  }
});