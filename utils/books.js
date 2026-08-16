// 书库清单 + 文本读取
// 书籍正文以 deflate+base64 压缩为 JS 数据模块（data/books_data.js），
// 通过 require 加载、pako 解压——不依赖 FileSystemManager，任何环境均可读。
const pako = require('../libs/pako.min.js');
const BOOK_DATA = require('../data/books_data.js');

const list = [
  { id: 'lunyu', title: '论语注疏', author: '何晏注 · 邢昺疏', category: '四书' },
  { id: 'daxue', title: '大学', author: '礼记', category: '四书' },
  { id: 'daxuejz', title: '大学集注', author: '朱熹', category: '四书' },
  { id: 'zhongyong', title: '中庸', author: '子思', category: '四书' },
  { id: 'zhongyongjz', title: '中庸集注', author: '朱熹', category: '四书' },
  { id: 'mengzi', title: '孟子', author: '孟子', category: '四书' },
  { id: 'liaofan', title: '了凡四训', author: '袁了凡', category: '修身' },
  { id: 'caigentan', title: '菜根谭', author: '洪应明', category: '修身' },
  { id: 'weilu', title: '围炉夜话', author: '王永彬', category: '修身' },
  { id: 'zhuzi', title: '朱子治家格言', author: '朱柏庐', category: '修身' },
  { id: 'chuanxilu', title: '传习录', author: '王阳明', category: '修身' },
  { id: 'jinsilu', title: '近思录', author: '朱熹 · 吕祖谦', category: '修身' },
  { id: 'daodejing', title: '道德经', author: '老子', category: '道家' },
  { id: 'zhuangzi', title: '庄子', author: '庄周（郭象注本）', category: '道家' },
  { id: 'sunzi', title: '孙子兵法', author: '孙武', category: '兵家' },
  { id: 'shijing', title: '诗经', author: '佚名', category: '诗文' },
  { id: 'tangshi', title: '唐诗三百首', author: '蘅塘退士', category: '诗文' },
  { id: 'renjian', title: '人间词话', author: '王国维', category: '诗文' },
  { id: 'guwen', title: '古文观止', author: '吴楚材 · 吴调侯', category: '诗文' },
  { id: 'shishuo', title: '世说新语', author: '刘义庆', category: '笔记' }
];

const categories = ['四书', '修身', '道家', '兵家', '诗文', '笔记'];

// base64 -> Uint8Array（纯 JS，兼容所有环境）
function base64ToBytes(b64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const s = String(b64).replace(/=+$/, '').replace(/[^A-Za-z0-9+/]/g, '');
  const out = [];
  let bits = 0;
  let acc = 0;
  for (let i = 0; i < s.length; i++) {
    const v = chars.indexOf(s[i]);
    if (v < 0) continue;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

// UTF-8 字节 -> JS 字符串（纯 JS）
function utf8Decode(bytes) {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i++];
    if (b < 0x80) {
      out += String.fromCharCode(b);
    } else if (b < 0xe0) {
      out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i++] & 0x3f));
    } else if (b < 0xf0) {
      out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f));
    } else {
      const cp = ((b & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
      const c = cp - 0x10000;
      out += String.fromCharCode(0xd800 + (c >> 10), 0xdc00 + (c & 0x3ff));
    }
  }
  return out;
}

// 按 id 取正文（同步，解压约几十毫秒）
function getText(id) {
  const item = BOOK_DATA.find((d) => d.id === id);
  if (!item || !item.b64) return '';
  try {
    const bytes = pako.inflate(base64ToBytes(item.b64));
    return utf8Decode(bytes);
  } catch (e) {
    return '';
  }
}

module.exports = { list, categories, getText };