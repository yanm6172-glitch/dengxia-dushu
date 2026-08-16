// 书库构建脚本：把 F 盘根目录的公版古籍 txt 压缩进 data/books_data.js
// 用法：node tools/build_books.js
const fs = require('fs');
const path = require('path');
const pako = require('pako');

const SRC = 'F:/新建文件夹 (2)/';
const OUT = path.join(__dirname, '..', 'data', 'books_data.js');

const BOOKS = [
  ['lunyu', '论语注疏_简体.txt'],
  ['daxue', '大学.txt'],
  ['daxuejz', '大学集注_朱熹_简体.txt'],
  ['zhongyong', '中庸_简体.txt'],
  ['zhongyongjz', '中庸集注_朱熹_简体.txt'],
  ['mengzi', '孟子_古腾堡_繁体.txt'],
  ['liaofan', '了凡四训.txt'],
  ['caigentan', '菜根谭_古腾堡_繁体.txt'],
  ['weilu', '围炉夜话_古腾堡_繁体.txt'],
  ['zhuzi', '朱子治家格言_古腾堡_繁体.txt'],
  ['chuanxilu', '传习录_古腾堡_繁体.txt'],
  ['jinsilu', '近思录_古腾堡_繁体.txt'],
  ['daodejing', '道德经_古腾堡_繁体.txt'],
  ['zhuangzi', '庄子_国学导航_繁体.txt'],
  ['sunzi', '孙子兵法_古腾堡_繁体.txt'],
  ['shijing', '诗经_古腾堡_繁体.txt'],
  ['tangshi', '唐诗三百首_古腾堡_繁体.txt'],
  ['renjian', '人间词话_古腾堡_繁体.txt'],
  ['guwen', '古文观止_古腾堡_繁体.txt'],
  ['shishuo', '世说新语_古腾堡_繁体.txt']
];

const parts = [];
let totalRaw = 0;
let totalB64 = 0;
for (const [id, fn] of BOOKS) {
  const raw = fs.readFileSync(SRC + fn, 'utf-8');
  totalRaw += Buffer.byteLength(raw, 'utf-8');
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