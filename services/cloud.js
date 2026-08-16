// 云同步服务：基于微信云开发
// 使用前提：开通云开发并部署 cloudfunctions/sync 云函数
let ready = false;

function initCloud() {
  return new Promise((resolve) => {
    if (!wx.cloud) { resolve(false); return; }
    try {
      wx.cloud.init({ traceUser: true });
      ready = true;
      resolve(true);
    } catch (e) {
      resolve(false);
    }
  });
}

function isReady() {
  return ready;
}

function callSync(payload) {
  return wx.cloud.callFunction({ name: 'sync', data: payload }).then((r) => (r && r.result) || {});
}

// 拉取全部云端数据（登录后合并到本地）
function syncPull() {
  return callSync({ action: 'pull' });
}

// 推送某一类数据（progress / stats / bookmarks / customBooks）
function syncPush(section, data, updatedAt) {
  return callSync({ action: 'push', section, data, updatedAt });
}

// 自藏书正文上传云存储
function uploadBookFile(localPath, cloudPath) {
  return wx.cloud.uploadFile({ cloudPath, filePath: localPath });
}

// 自藏书正文从云存储下载（返回临时路径）
function downloadBookFile(fileID) {
  return wx.cloud.downloadFile({ fileID });
}

module.exports = {
  initCloud,
  isReady,
  syncPull,
  syncPush,
  uploadBookFile,
  downloadBookFile
};