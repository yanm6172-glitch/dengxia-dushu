// 云函数：微信登录
// 使用云开发环境时，getWXContext() 直接拿到调用者 openid，无需再走 code2session
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const token = 'tk_' + openid.slice(-10) + '_' + Date.now().toString(36);
  return { openid, token };
};