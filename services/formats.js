// 电子书格式服务：类型识别 + EPUB 正文提取
const fflate = require('../libs/fflate.min.js');

// 由微信内置阅读器（wx.openDocument）打开的文档类型
const DOC_TYPES = {
  pdf: 1, doc: 1, docx: 1, xls: 1, xlsx: 1, ppt: 1, pptx: 1, other: 1
};

// 按扩展名识别类型；未知类型归为 other（打开时交给微信阅读器尝试）
function detectType(filename) {
  const n = String(filename || '').toLowerCase();
  if (n.endsWith('.epub')) return 'epub';
  if (n.endsWith('.pdf')) return 'pdf';
  if (n.endsWith('.doc')) return 'doc';
  if (n.endsWith('.docx')) return 'docx';
  if (n.endsWith('.xls')) return 'xls';
  if (n.endsWith('.xlsx')) return 'xlsx';
  if (n.endsWith('.ppt')) return 'ppt';
  if (n.endsWith('.pptx')) return 'pptx';
  if (n.endsWith('.txt') || n.endsWith('.md') || n.endsWith('.text') ||
      n.endsWith('.log') || n.endsWith('.json') || n.endsWith('.js') ||
      n.endsWith('.css') || n.endsWith('.html') || n.endsWith('.htm') ||
      n.endsWith('.csv')) return 'txt';
  return 'other';
}

function isDocType(t) {
  return !!DOC_TYPES[t];
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

function decodeEntities(s) {
  return String(s)
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (m, n) => {
      try { return String.fromCharCode(parseInt(n, 10)); } catch (e) { return m; }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (m, n) => {
      try { return String.fromCharCode(parseInt(n, 16)); } catch (e) { return m; }
    });
}

// HTML -> 纯文本；h1-h6 转成【标题】行供目录识别
function stripHtml(html) {
  let t = String(html || '');
  t = t.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  t = t.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  t = t.replace(/<head[\s\S]*?<\/head>/gi, ' ');
  t = t.replace(/<(h[1-6])[^>]*>/gi, '\n\n【');
  t = t.replace(/<\/(h[1-6])>/gi, '】\n\n');
  t = t.replace(/<\/(p|div|tr|li|blockquote|section)>/gi, '\n');
  t = t.replace(/<br\s*\/?>/gi, '\n');
  t = t.replace(/<[^>]+>/g, '');
  return decodeEntities(t);
}

function normKey(k) {
  return String(k).replace(/\\/g, '/').split('/').filter(Boolean).join('/').toLowerCase();
}

// EPUB：解压 zip -> container.xml 找 opf -> spine 顺序提取正文
function epubToText(input) {
  const data = (input instanceof Uint8Array) ? input : new Uint8Array(input);
  let files;
  try {
    files = fflate.unzipSync(data);
  } catch (e) {
    throw new Error('EPUB 解析失败（文件可能损坏或不是标准 EPUB）');
  }
  const keys = Object.keys(files);
  const map = {};
  keys.forEach((k) => { map[normKey(k)] = k; });
  const get = (p) => {
    const k = map[normKey(p)];
    return k ? files[k] : null;
  };

  // 1. container.xml
  let containerText = '';
  let containerKey = map['meta-inf/container.xml'];
  if (containerKey) containerText = utf8Decode(files[containerKey]);
  let opfPath = '';
  const cm = /full-path="([^"]+)"/i.exec(containerText);
  if (cm) opfPath = cm[1];

  // 2. opf（找不到时退化为第一个 .opf）
  let opfKey = opfPath ? (map[normKey(opfPath)] || null) : null;
  if (!opfKey) {
    opfKey = keys.find((k) => /\.opf$/i.test(k)) || null;
  }
  if (!opfKey) throw new Error('EPUB 缺少 opf 清单');
  const opf = utf8Decode(files[opfKey]);

  // 3. spine + manifest
  const spine = [];
  let sm;
  const spineRe = /<itemref[^>]*idref="([^"]+)"/gi;
  while ((sm = spineRe.exec(opf))) spine.push(sm[1]);
  const manifest = {};
  let mm;
  const manRe = /<item[^>]*id="([^"]+)"[^>]*href="([^"]+)"/gi;
  while ((mm = manRe.exec(opf))) manifest[mm[1]] = mm[2];

  // 4. 逐章提取
  const baseDir = opfKey.split('/').slice(0, -1).join('/');
  const joinPath = (dir, href) => {
    const out = [];
    (dir ? dir.split('/') : []).concat(href.split('/')).forEach((s) => {
      if (!s || s === '.') return;
      if (s === '..') { out.pop(); return; }
      out.push(s);
    });
    return out.join('/');
  };
  const parts = [];
  for (let i = 0; i < spine.length; i++) {
    const href = manifest[spine[i]];
    if (!href) continue;
    const key = map[normKey(joinPath(baseDir, href))];
    if (!key) continue;
    const text = stripHtml(utf8Decode(files[key]));
    if (text && text.trim()) parts.push(text.trim());
  }
  if (!parts.length) throw new Error('EPUB 未提取到正文');
  return parts.join('\n\n');
}

module.exports = { detectType, isDocType, epubToText };