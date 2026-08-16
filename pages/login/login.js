const app = getApp();
const auth = require('../../services/auth.js');

Page({
  data: {
    agreed: false,
    step: 1,
    avatar: '',
    nickname: ''
  },
  onLoad() {
    if (auth.isLoggedIn()) {
      this.redirectIn();
      return;
    }
    this.setData({ agreed: auth.hasAgreed() });
  },
  toggleAgree() {
    const v = !this.data.agreed;
    this.setData({ agreed: v });
    auth.setAgreed(v);
  },
  goAgreement(e) {
    wx.navigateTo({ url: '/pages/agreement/agreement?type=' + e.currentTarget.dataset.type });
  },
  doLogin() {
    if (!this.data.agreed) {
      wx.showToast({ title: '请先阅读并同意协议', icon: 'none' });
      return;
    }
    const that = this;
    wx.showLoading({ title: '登录中…' });
    auth.login().then(() => {
      wx.hideLoading();
      app.refreshAuth();
      const u = auth.getUser();
      if (u && u.nickname) {
        that.redirectIn();
      } else {
        that.setData({
          step: 2,
          avatar: (u && u.avatar) || '',
          nickname: (u && u.nickname) || ''
        });
      }
    }).catch(() => {
      wx.hideLoading();
      wx.showToast({ title: '登录失败，请重试', icon: 'none' });
    });
  },
  onChooseAvatar(e) {
    this.setData({ avatar: e.detail.avatarUrl });
  },
  onNickname(e) {
    this.setData({ nickname: e.detail.value });
  },
  saveProfile() {
    const nickname = this.data.nickname.trim();
    if (!nickname) {
      wx.showToast({ title: '请填写昵称', icon: 'none' });
      return;
    }
    auth.saveProfile({ nickname, avatar: this.data.avatar });
    app.refreshAuth();
    this.redirectIn();
  },
  skipProfile() {
    this.redirectIn();
  },
  redirectIn() {
    wx.switchTab({ url: '/pages/mine/mine' });
  },
  guest() {
    wx.switchTab({ url: '/pages/index/index' });
  }
});