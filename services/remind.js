// 订阅消息提醒（生产配置说明）
// 1. 公众平台 -> 功能 -> 订阅消息 -> 选用「读书提醒」类模板
// 2. 把模板 ID 填到下方 TEMPLATE_ID
// 3. 用户点开「每日阅读提醒」时调用 request() 授权（一次订阅可推送一次）
// 4. 服务端（云函数定时触发器或自建后端）调 subscribeMessage.send 推送
const TEMPLATE_ID = ''; // TODO: 填入你的模板 ID

function request() {
  return new Promise((resolve) => {
    if (!TEMPLATE_ID) {
      wx.showToast({ title: '未配置提醒模板', icon: 'none' });
      resolve(false);
      return;
    }
    wx.requestSubscribeMessage({
      tmplIds: [TEMPLATE_ID],
      success(res) { resolve(res[TEMPLATE_ID] === 'accept'); },
      fail() { resolve(false); }
    });
  });
}

module.exports = { request, TEMPLATE_ID };