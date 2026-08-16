// 书库构建脚本：把 F 盘根目录的公版古籍 txt 压缩进 data/books_data.js
// 用法：node tools/build_books.js
const fs = require('fs');
const path = require('path');
const pako = require('pako');

const SRC = 'F:/新建文件夹 (2)/';
const OUT = path.join(__dirname, '..', 'data', 'books_data.js');

// [id, 文件名, 是否剥离英文译文（古腾堡双语书）]
const BOOKS = [
  ['lunyu', '论语注疏_简体.txt', false],
  ['daxue', '大学.txt', false],
  ['daxuejz', '大学集注_朱熹_简体.txt', false],
  ['zhongyong', '中庸_简体.txt', false],
  ['zhongyongjz', '中庸集注_朱熹_简体.txt', false],
  ['mengzi', '孟子_古腾堡_繁体.txt', true],
  ['liaofan', '了凡四训.txt', false],
  ['caigentan', '菜根谭_古腾堡_繁体.txt', true],
  ['weilu', '围炉夜话_古腾堡_繁体.txt', true],
  ['zhuzi', '朱子治家格言_古腾堡_繁体.txt', true],
  ['chuanxilu', '传习录_古腾堡_繁体.txt', true],
  ['jinsilu', '近思录_古腾堡_繁体.txt', true],
  ['daodejing', '道德经_古腾堡_繁体.txt', true],
  ['zhuangzi', '庄子_国学导航_繁体.txt', false],
  ['sunzi', '孙子兵法_古腾堡_繁体.txt', true],
  ['shijing', '诗经_古腾堡_繁体.txt', true],
  ['tangshi', '唐诗三百首_古腾堡_繁体.txt', true],
  ['renjian', '人间词话_古腾堡_繁体.txt', true],
  ['guwen', '古文观止_古腾堡_繁体.txt', true],
  ['shishuo', '世说新语_古腾堡_繁体.txt', true],
  ['zengguang', '增广贤文_简体.txt', false],
  ['sanzijing', '三字经_简体.txt', false],
  ['qianziwen', '千字文_简体.txt', false],
  ['dizigui', '弟子规_简体.txt', false],
  ['yanshi', '颜氏家训_简体.txt', false],
  ['liweng', '笠翁对韵_简体.txt', false]
];

// 英文译文行判定：ASCII 字母多且几乎无汉字
function isEnglishLine(line) {
  const t = String(line || '').trim();
  if (t.length < 12) return false;
  let cjk = 0;
  let ascii = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if (c >= 0x4e00 && c <= 0x9fff) cjk++;
    else if (c < 128 && ((c >= 65 && c <= 90) || (c >= 97 && c <= 122))) ascii++;
  }
  return ascii > 10 && cjk < 3;
}

// 剥离古腾堡许可头尾 + 英文译文行
function trimGutenberg(raw) {
  let t = raw;
  const starts = ['*** START OF THE PROJECT GUTENBERG EBOOK', '*** START OF THIS PROJECT GUTENBERG EBOOK'];
  for (const m of starts) {
    const idx = t.indexOf(m);
    if (idx >= 0) { t = t.slice(idx + m.length); break; }
  }
  const ends = ['*** END OF THE PROJECT GUTENBERG EBOOK', '*** END OF THIS PROJECT GUTENBERG EBOOK'];
  for (const m of ends) {
    const idx = t.indexOf(m);
    if (idx >= 0) { t = t.slice(0, idx); break; }
  }
  const lines = t.split('\n');
  const out = [];
  let dropped = 0;
  for (const l of lines) {
    if (isEnglishLine(l)) { dropped++; continue; }
    out.push(l);
  }
  return { text: out.join('\n'), dropped };
}

const parts = [];
let totalRaw = 0;
let totalB64 = 0;
for (const [id, fn, gb] of BOOKS) {
  let raw = fs.readFileSync(SRC + fn, 'utf-8');
  totalRaw += Buffer.byteLength(raw, 'utf-8');
  if (gb) {
    const tr = trimGutenberg(raw);
    raw = tr.text;
    console.log('trim ' + id + ' 去除英文行 ' + tr.dropped);
  }
  const deflated = pako.deflate(Buffer.from(raw, 'utf-8'), { level: 9 });
  const b64 = Buffer.from(deflated).toString('base64');
  totalB64 += b64.length;
  parts.push('{id:"' + id + '",b64:"' + b64 + '"}');
  console.log('packed ' + id + ' ' + (Buffer.byteLength(raw) / 1024).toFixed(0) + 'KB -> ' + (b64.length / 1024).toFixed(0) + 'KB');
}
const content = 'module.exports=[' + parts.join(',\n') + '];\n';
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, content, 'utf-8');
console.log('=== data/books_data.js: ' + (content.length / 1024).toFixed(0) + ' KB (raw ' + (totalRaw / 1024).toFixed(0) + 'KB -> b64 ' + (totalB64 / 1024).toFixed(0) + 'KB)');