// 云函数：阅读数据同步（progress / stats / bookmarks / customBooks）
// 使用云开发鉴权：getWXContext() 直接取得调用者 openid，无需自建鉴权
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const COLLECTION = 'readers';
const SECTIONS = ['progress', 'stats', 'bookmarks', 'customBooks'];

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, err: 'no openid' };
  const docId = 'u_' + OPENID;

  try {
    const res = await db.collection(COLLECTION).doc(docId).get().catch(() => null);
    const doc = res && res.data ? res.data : null;

    if (event.action === 'pull') {
      return {
        ok: true,
        data: doc ? {
          progress: doc.progress,
          stats: doc.stats,
          bookmarks: doc.bookmarks,
          customBooks: doc.customBooks
        } : null
      };
    }

    if (event.action === 'push') {
      const section = event.section;
      if (!section || SECTIONS.indexOf(section) < 0) {
        return { ok: false, err: 'bad section' };
      }
      const payload = {};
      payload[section] = { data: event.data, updatedAt: event.updatedAt || Date.now() };
      if (doc) {
        await db.collection(COLLECTION).doc(docId).update({ data: payload });
      } else {
        await db.collection(COLLECTION).add({ data: Object.assign({ _id: docId }, payload) });
      }
      return { ok: true };
    }

    return { ok: false, err: 'bad action' };
  } catch (e) {
    return { ok: false, err: String((e && e.message) || e) };
  }
};