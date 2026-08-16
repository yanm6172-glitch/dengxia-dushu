const booksData = require('../../utils/books.js');
const quotesData = require('../../utils/quotes.js');
const app = getApp();

const COLORS = {
  '四书': 'c-sishu',
  '修身': 'c-xiushen',
  '道家': 'c-daojia',
  '兵家': 'c-bingjia',
  '诗文': 'c-shiwen',
  '笔记': 'c-biji',
  '蒙学': 'c-mengxue',
  '我的书籍': 'c-mine'
};

Page({
  data: {
    grouped: [],
    quote: null,
    readCount: 0,
    searchKey: '',
    lastBook: null,
    todayMinutes: 0,
    streak: 0,
    goalMinutes: 25,
    goalPercent: 0,
    goalDone: false,
    showGuide: false,
    guideIndex: 0
  },
  onShow() {
    let done = false;
    try { done = !!wx.getStorageSync('onboarding_done'); } catch (e) {}
    if (!done) {
      this.setData({ showGuide: true, guideIndex: 0 });
    }
    this.refresh();
  },
  guideChange(e) {
    this.setData({ guideIndex: e.detail.current });
  },
  nextGuide() {
    if (this.data.guideIndex >= 3) {
      this.finishGuide();
    } else {
      this.setData({ guideIndex: this.data.guideIndex + 1 });
    }
  },
  skipGuide() {
    this.finishGuide();
  },
  finishGuide() {
    this.setData({ showGuide: false });
    try { wx.setStorageSync('onboarding_done', 1); } catch (e) {}
  },
  refresh() {
    const progress = app.globalData.progress;
    const st = app.getReadingStats();
    let readCount = 0;
    Object.keys(progress).forEach(k => {
      if ((progress[k].percent || 0) > 0) readCount++;
    });

    const mapBook = b => {
      const p = progress[b.id];
      const percent = (p && p.percent) || 0;
      return {
        id: b.id,
        title: b.title,
        author: b.author,
        percent,
        started: percent > 0,
        custom: !!b.custom,
        type: b.type || 'txt',
        color: COLORS[b.category] || 'c-mine',
        firstChar: (b.title || '书').charAt(0)
      };
    };

    const customBooks = (app.globalData.customBooks || []).map(mapBook);
    const allBooks = customBooks.concat(booksData.list.map(mapBook));

    let lastBook = null;
    let lastTs = -1;
    Object.keys(progress).forEach(k => {
      const p = progress[k];
      if (p && p.updatedAt && p.updatedAt > lastTs) {
        lastTs = p.updatedAt;
        lastBook = allBooks.find(b => b.id === k) || null;
      }
    });
    if (lastBook) {
      lastBook = Object.assign({}, lastBook, { percent: (progress[lastBook.id].percent || 0) });
    }

    const search = this.data.searchKey.trim();
    const grouped = [];
    const pushGroup = (name, books) => {
      const filtered = search
        ? books.filter(b => b.title.indexOf(search) >= 0 || (b.author || '').indexOf(search) >= 0)
        : books;
      if (filtered.length) grouped.push({ name, books: filtered });
    };
    if (customBooks.length) pushGroup('我的书籍', customBooks);
    booksData.categories.forEach(c => {
      pushGroup(c, booksData.list.filter(b => b.category === c).map(mapBook));
    });

    const day = Math.floor(Date.now() / 86400000);
    const quote = quotesData.quotes[day % quotesData.quotes.length];
    const goal = app.getReadingGoal();
    this.setData({
      grouped, quote, readCount, lastBook,
      todayMinutes: st.todayMinutes,
      streak: st.streak,
      goalMinutes: goal,
      goalPercent: Math.min(100, Math.round(st.todayMinutes / goal * 100)),
      goalDone: st.todayMinutes >= goal
    });
  },
  onSearch(e) {
    this.setData({ searchKey: e.detail.value });
    this.refresh();
  },
  continueLast() {
    if (this.data.lastBook) {
      wx.navigateTo({ url: '/pages/reader/reader?id=' + this.data.lastBook.id });
    }
  },
  goPlan() {
    wx.navigateTo({ url: '/pages/plan/plan' });
  },
  goImport() {
    wx.navigateTo({ url: '/pages/import/import' });
  },
  openBook(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/reader/reader?id=' + id });
  },
  openQuoteBook() {
    if (this.data.quote) {
      wx.navigateTo({ url: '/pages/reader/reader?id=' + this.data.quote.bookId });
    }
  },
  deleteBook(e) {
    const id = e.currentTarget.dataset.id;
    const list = app.globalData.customBooks || [];
    const book = list.find(b => b.id === id);
    if (!book) return;
    const that = this;
    wx.showModal({
      title: '删除自藏书',
      content: '确定从书架删除《' + book.title + '》吗？',
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
  },
  onShareAppMessage() {
    return { title: '灯下读书 · 大三古籍日课', path: '/pages/index/index' };
  }
});