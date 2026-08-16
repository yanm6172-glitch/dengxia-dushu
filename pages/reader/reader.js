const booksData = require('../../utils/books.js');
const app = getApp();

// ---------- 文件读取 ----------
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

function readFileBinary(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      success(res) { resolve(res.data); },
      fail(err) { reject(err); }
    });
  });
}

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

// ---------- 文本解析 ----------
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

const SPEEDS = [
  { step: 3, name: '慢' },
  { step: 7, name: '中' },
  { step: 14, name: '快' }
];

Page({
  data: {
    title: '',
    author: '',
    paragraphs: [],
    catalog: [],
    marks: [],
    fontSize: 2,
    theme: 'paper',
    font: 'song',
    percent: 0,
    scrollTop: 0,
    scrollIntoView: '',
    showCatalog: false,
    catTab: 'catalog',
    currentChapter: '',
    curHeadIdx: -1,
    bookmarkCount: 0,
    notes: [],
    noteCount: 0,
    showNoteEditor: false,
    noteDraft: '',
    noteTargetIdx: -1,
    noteSrcText: '',
    noteExists: false,
    viewMode: 'text',
    chrome: true,
    autoOn: false,
    autoLabel: '自动',
    showSearch: false,
    searchKey: '',
    searchResults: [],
    hitIdx: -1,
    showTheme: false,
    showShare: false,
    shareImage: ''
  },
  onLoad(options) {
    const id = options && options.id;
    const book = booksData.list.find((b) => b.id === id) || (app.globalData.customBooks || []).find((b) => b.id === id);
    if (!book) {
      wx.showToast({ title: '未找到这本书', icon: 'none' });
      return;
    }
    this.book = book;
    const fmt = require('../../services/formats.js');
    if (fmt.isDocType(book.type)) {
      this.setData({ viewMode: 'doc', title: book.title, author: book.author });
      wx.setNavigationBarTitle({ title: book.title });
      return;
    }
    const fontSize = wx.getStorageSync('reader_fontsize') || 2;
    const theme = wx.getStorageSync('reader_theme') || 'paper';
    const font = wx.getStorageSync('reader_font') || 'song';
    this.setData({ viewMode: 'text', title: book.title, author: book.author, fontSize, theme, font });
    wx.setNavigationBarTitle({ title: book.title });
    this.loadMarks();
    this.loadNotes();
    this.loadBook(book);
  },
  onShow() {
    this._sessionStart = Date.now();
  },
  endSession() {
    if (this._sessionStart) {
      const sec = Math.round((Date.now() - this._sessionStart) / 1000);
      this._sessionStart = null;
      if (sec > 0 && app.addReadingSeconds(sec)) {
        wx.showToast({ title: '🎉 今日日课完成', icon: 'none' });
      }
    }
  },
  loadMarks() {
    const marks = app.getBookmarks(this.book.id);
    this.setData({ marks, bookmarkCount: marks.length });
  },
  saveMarks() {
    app.setBookmarks(this.book.id, this.data.marks);
  },
  loadNotes() {
    const notes = app.getBookNotes(this.book.id);
    this.setData({ notes, noteCount: notes.length });
  },
  saveNotesLocal() {
    app.setBookNotes(this.book.id, this.data.notes);
  },
  openNoteEditor(idx) {
    const para = this.data.paragraphs[idx];
    if (!para) return;
    const old = this.data.notes.find((n) => n.idx === idx);
    this.setData({
      showNoteEditor: true,
      noteTargetIdx: idx,
      noteDraft: old ? old.note : '',
      noteSrcText: para.t.slice(0, 40) + (para.t.length > 40 ? '…' : ''),
      noteExists: !!old
    });
  },
  onNoteInput(e) {
    this.setData({ noteDraft: e.detail.value });
  },
  saveNote() {
    const note = this.data.noteDraft.trim();
    if (!note) {
      wx.showToast({ title: '请写点心得', icon: 'none' });
      return;
    }
    const idx = this.data.noteTargetIdx;
    const para = this.data.paragraphs[idx];
    const notes = this.data.notes.slice();
    const i = notes.findIndex((n) => n.idx === idx);
    const item = {
      idx,
      t: para ? para.t.slice(0, 24) + (para.t.length > 24 ? '…' : '') : '',
      note,
      ts: Date.now()
    };
    if (i >= 0) notes[i] = item; else notes.push(item);
    notes.sort((a, b) => a.idx - b.idx);
    this.setData({ notes, noteCount: notes.length, showNoteEditor: false, noteDraft: '' });
    this.saveNotesLocal();
    wx.showToast({ title: '笔记已保存', icon: 'success' });
  },
  cancelNote() {
    this.setData({ showNoteEditor: false, noteDraft: '' });
  },
  deleteNoteFromEditor() {
    const idx = this.data.noteTargetIdx;
    const notes = this.data.notes.filter((n) => n.idx !== idx);
    this.setData({ notes, noteCount: notes.length, showNoteEditor: false, noteDraft: '' });
    this.saveNotesLocal();
  },
  deleteNoteFromList(e) {
    const idx = e.currentTarget.dataset.idx;
    const notes = this.data.notes.filter((n) => n.idx !== idx);
    this.setData({ notes, noteCount: notes.length });
    this.saveNotesLocal();
    wx.showToast({ title: '笔记已删除', icon: 'none' });
  },
  goNote(e) {
    const idx = e.currentTarget.dataset.idx;
    this.setData({ showCatalog: false, scrollIntoView: 'p' + idx });
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
      that._paragraphs = paragraphs;
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
      wx.showModal({
        title: '打开失败',
        content: (e && e.errMsg) ? e.errMsg : String(e),
        showCancel: false
      });
    };
    if (book.custom) {
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
  // ---------- 滚动 ----------
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
  toggleChrome() {
    this.setData({ chrome: !this.data.chrome });
  },
  scrollToTop() {
    this.setData({ scrollTop: 0, scrollIntoView: '' });
    this.lastScroll = null;
  },
  // ---------- 自动滚动 ----------
  cycleAuto() {
    if (!this.data.autoOn) {
      this.startAuto(0);
      return;
    }
    const next = this._autoLevel + 1;
    if (next >= SPEEDS.length) {
      this.stopAuto();
    } else {
      this.startAuto(next);
    }
  },
  startAuto(level) {
    this.stopAuto();
    const sp = SPEEDS[level];
    this._autoLevel = level;
    this._step = sp.step;
    this.setData({ autoOn: true, autoLabel: '自动·' + sp.name });
    this._autoTimer = setInterval(() => {
      const d = this.lastScroll || {};
      const st = (d.scrollTop || 0) + this._step;
      const sh = d.scrollHeight || 0;
      if (sh && st >= sh - 700) {
        this.stopAuto();
        wx.showToast({ title: '已到文末', icon: 'none' });
        return;
      }
      this.setData({ scrollTop: st });
    }, 50);
  },
  stopAuto() {
    if (this._autoTimer) clearInterval(this._autoTimer);
    this._autoTimer = null;
    this.setData({ autoOn: false, autoLabel: '自动' });
  },
  // ---------- 搜索 ----------
  toggleSearch() {
    this.setData({
      showSearch: !this.data.showSearch,
      showCatalog: false,
      showTheme: false,
      searchKey: '',
      searchResults: []
    });
  },
  onSearchInput(e) {
    const k = (e.detail.value || '').trim();
    this.setData({ searchKey: k });
    this.runSearch(k);
  },
  runSearch(k) {
    if (!k) {
      this.setData({ searchResults: [] });
      return;
    }
    const paras = this._paragraphs || [];
    const lower = k.toLowerCase();
    const out = [];
    for (let i = 0; i < paras.length && out.length < 50; i++) {
      const t = paras[i].t || '';
      const idx = t.toLowerCase().indexOf(lower);
      if (idx >= 0) {
        const start = Math.max(0, idx - 12);
        const tail = idx + lower.length + 20;
        const snip = (start > 0 ? '…' : '') + t.slice(start, tail) + (tail < t.length ? '…' : '');
        out.push({ idx: i, snippet: snip, head: paras[i].h });
      }
    }
    this.setData({ searchResults: out });
  },
  gotoResult(e) {
    const idx = e.currentTarget.dataset.idx;
    this.setData({ showSearch: false, scrollIntoView: 'p' + idx, hitIdx: idx });
    setTimeout(() => this.setData({ hitIdx: -1 }), 2000);
  },
  // ---------- 目录 / 书签 ----------
  setCatTab(e) {
    this.setData({ catTab: e.currentTarget.dataset.t });
  },
  toggleCatalog() {
    this.setData({ showCatalog: !this.data.showCatalog, catTab: 'catalog', showTheme: false, showSearch: false });
  },
  toggleMarks() {
    this.setData({ showCatalog: !this.data.showCatalog, catTab: 'mark', showTheme: false, showSearch: false });
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
    const marks = this.data.marks.filter((m) => m.idx !== idx);
    this.setData({ marks, bookmarkCount: marks.length });
    this.saveMarks();
    wx.showToast({ title: '书签已删除', icon: 'none' });
  },
  // ---------- 主题 / 字体 ----------
  toggleThemePanel() {
    this.setData({ showTheme: !this.data.showTheme, showCatalog: false, showSearch: false });
  },
  closePanels() {
    this.setData({ showTheme: false });
  },
  pickTheme(e) {
    const t = e.currentTarget.dataset.t;
    this.setData({ theme: t, showTheme: false });
    wx.setStorageSync('reader_theme', t);
  },
  pickFont(e) {
    const f = e.currentTarget.dataset.f;
    this.setData({ font: f });
    wx.setStorageSync('reader_font', f);
  },
  // ---------- 书摘卡 ----------
  makeShareCard(idx) {
    const para = this.data.paragraphs[idx];
    if (!para || !para.t) return;
    this._shareText = para.t.slice(0, 120);
    this._shareSource = this.data.title;
    this.setData({ showShare: true, shareImage: '' });
    wx.nextTick(() => this.drawShareCard());
  },
  drawShareCard() {
    const that = this;
    wx.createSelectorQuery().in(this).select('#shareCanvas').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0] || !res[0].node) return;
      const canvas = res[0].node;
      const w = 300;
      const h = 400;
      const dpr = (wx.getSystemInfoSync().pixelRatio) || 2;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      ctx.fillStyle = '#f7f1e0';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#8c5a3c';
      ctx.fillRect(0, 0, w, 8);
      ctx.fillStyle = '#c9b28a';
      ctx.font = 'bold 56px serif';
      ctx.fillText('\u201C', 18, 74);
      ctx.fillStyle = '#3b3224';
      ctx.font = '17px "Songti SC","STSong","SimSun",serif';
      const maxW = w - 56;
      const lines = [];
      let line = '';
      const text = this._shareText || '';
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (line && ctx.measureText(line + ch).width > maxW) {
          lines.push(line);
          line = ch;
        } else {
          line += ch;
        }
        if (lines.length >= 8) break;
      }
      if (lines.length < 8 && line) lines.push(line);
      let y = 100;
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], 28, y);
        y += 34;
      }
      ctx.fillStyle = '#8c5a3c';
      ctx.font = '13px sans-serif';
      ctx.fillText('—— 《' + (this._shareSource || '灯下读书') + '》', 28, y + 20);
      ctx.fillStyle = '#b3a488';
      ctx.font = '11px sans-serif';
      const d2 = new Date();
      const ds = d2.getFullYear() + '-' + ('0' + (d2.getMonth() + 1)).slice(-2) + '-' + ('0' + d2.getDate()).slice(-2);
      ctx.fillText('灯下读书 · ' + ds, 28, h - 26);
      ctx.fillStyle = '#c9b28a';
      ctx.fillRect(0, h - 8, w, 8);
      wx.canvasToTempFilePath({
        canvas,
        success(r) {
          that.setData({ shareImage: r.tempFilePath });
        },
        fail() {
          wx.showToast({ title: '生成失败，请重试', icon: 'none' });
        }
      }, that);
    });
  },
  saveShareImage() {
    if (!this.data.shareImage) return;
    const that = this;
    wx.saveImageToPhotosAlbum({
      filePath: this.data.shareImage,
      success() {
        wx.showToast({ title: '已保存到相册', icon: 'success' });
      },
      fail() {
        wx.showModal({
          title: '需要相册权限',
          content: '请在设置中允许保存到相册',
          confirmText: '去设置',
          success(r) {
            if (r.confirm) wx.openSetting();
          }
        });
      }
    });
  },
  closeShare() {
    this.setData({ showShare: false });
  },
  noop() {},
  // ---------- 段落长按 ----------
  onParaLongPress(e) {
    const idx = e.currentTarget.dataset.idx;
    const para = this.data.paragraphs[idx];
    if (!para) return;
    const that = this;
    wx.showActionSheet({
      itemList: ['复制本段', '添加书签', '写笔记', '生成书摘卡'],
      success(res) {
        if (res.tapIndex === 0) {
          wx.setClipboardData({ data: para.t });
        } else if (res.tapIndex === 1) {
          const marks = that.data.marks.slice();
          const exists = marks.some((m) => m.idx === idx);
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
        } else if (res.tapIndex === 2) {
          that.openNoteEditor(idx);
        } else if (res.tapIndex === 3) {
          that.makeShareCard(idx);
        }
      }
    });
  },
  // ---------- 字号 ----------
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
  onHide() {
    this.endSession();
    this.saveProgress();
    this.stopAuto();
  },
  onUnload() {
    this.endSession();
    this.saveProgress();
    this.stopAuto();
  },
  onShareAppMessage() {
    return {
      title: '一起读《' + this.data.title + '》',
      path: '/pages/reader/reader?id=' + (this.book ? this.book.id : '')
    };
  }
});