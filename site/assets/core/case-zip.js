/* ZIP adapter: local files only; existing CaseImport package contract is unchanged.
   DEFLATE: bundled fflate 0.8.2 (MIT), see licenses/fflate-MIT.txt. */
(function (global) {
  'use strict';

  function decodeName(bytes, utf8) {
    return new TextDecoder(utf8 ? 'utf-8' : 'gb18030', { fatal: true }).decode(bytes);
  }

  function entries(bytes, limit) {
    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    function u16(p) { return view.getUint16(p, true); }
    function u32(p) { return view.getUint32(p, true); }
    var end = bytes.length - 22;
    for (; end >= Math.max(0, bytes.length - 65557); end--) {
      if (u32(end) === 0x06054b50 && end + 22 + u16(end + 20) === bytes.length) break;
    }
    if (end < Math.max(0, bytes.length - 65557)) throw new Error('ZIP 不完整或格式无效，请重新压缩后再试。');
    if (u16(end + 4) || u16(end + 6) || u16(end + 8) !== u16(end + 10)) throw new Error('请使用单个 ZIP 文件，不支持分卷压缩包。');
    var count = u16(end + 10), size = u32(end + 12), pos = u32(end + 16);
    if (count === 65535 || pos === 0xffffffff || size === 0xffffffff) throw new Error('请使用普通 ZIP，不支持 ZIP64。');
    if (count > 512 || pos + size !== end) throw new Error('ZIP 文件目录无效或文件数超过 512 个。');
    var result = [], names = Object.create(null), total = 0;
    for (var i = 0; i < count; i++) {
      if (pos + 46 > end || u32(pos) !== 0x02014b50) throw new Error('ZIP 文件目录损坏。');
      var flags = u16(pos + 8), method = u16(pos + 10), crc = u32(pos + 16);
      var compressed = u32(pos + 20), original = u32(pos + 24);
      var n = u16(pos + 28), extra = u16(pos + 30), comment = u16(pos + 32), offset = u32(pos + 42);
      if (pos + 46 + n + extra + comment > end) throw new Error('ZIP 文件目录不完整。');
      var name = decodeName(bytes.subarray(pos + 46, pos + 46 + n), flags & 2048).replace(/\\/g, '/');
      if (flags & 1) throw new Error('请先移除 ZIP 密码，再导入案例。');
      if (method !== 0 && method !== 8) throw new Error('请使用标准 ZIP 压缩（Store 或 Deflate）。');
      if (!name || /[\x00-\x1f]/.test(name) || /^(\/|[a-z]:)/i.test(name) || name.split('/').some(function (part) { return part === '..' || part === '.'; })) throw new Error('ZIP 内有无效文件路径。');
      if (names[name]) throw new Error('ZIP 内有重复文件路径：' + name);
      names[name] = true;
      if (((u32(pos + 38) >>> 16) & 0xf000) === 0xa000) throw new Error('ZIP 内不能包含符号链接。');
      if (offset + 30 > u32(end + 16) || u32(offset) !== 0x04034b50 || u16(offset + 8) !== method || (u16(offset + 6) & 1)) throw new Error('ZIP 文件头无效。');
      var start = offset + 30 + u16(offset + 26) + u16(offset + 28);
      if (start + compressed > u32(end + 16)) throw new Error('ZIP 内文件数据不完整。');
      total += original;
      if (total > limit) throw new Error('ZIP 解压后超过 6 MB，请精简图片或数据后再导入。');
      // Ignore operating-system metadata, while still counting it toward size limits.
      if (!/\/$/.test(name) && !/(^|\/)(__MACOSX|\.DS_Store)(\/|$)/.test(name)) {
        result.push({ name: name, start: start, compressed: compressed, size: original, method: method, crc: crc });
      }
      pos += 46 + n + extra + comment;
    }
    if (pos !== end || !result.length) throw new Error('ZIP 里没有可导入的案例文件。');
    var manifests = result.filter(function (f) { return /(^|\/)(case|[a-z0-9._-]+\.case)\.json$/i.test(f.name); });
    if (manifests.length > 1) throw new Error('这个 ZIP 包含多个案例清单，请将每个案例的 ZIP 分别添加。');
    // Remove common outer folders; preserve paths within the package itself.
    while (result.every(function (f) { return f.name.indexOf('/') > 0 && f.name.split('/')[0] === result[0].name.split('/')[0]; })) {
      result.forEach(function (f) { f.name = f.name.slice(f.name.indexOf('/') + 1); });
    }
    return result;
  }

  var table = new Uint32Array(256);
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  function crc32(bytes) {
    var c = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) c = table[(c ^ bytes[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function read(file, limit) {
    if (file.size > limit) return Promise.reject(new Error('ZIP 文件超过 6 MB，请精简后再导入。'));
    return file.arrayBuffer().then(function (buffer) {
      var bytes = new Uint8Array(buffer);
      return entries(bytes, limit).map(function (entry) {
        var data = bytes.subarray(entry.start, entry.start + entry.compressed);
        if (entry.method === 8) {
          if (!global.fflate) throw new Error('ZIP 解压组件未加载，请刷新页面后重试。');
          data = global.fflate.inflateSync(data, { out: new Uint8Array(entry.size) });
        }
        if (data.length !== entry.size || crc32(data) !== entry.crc) throw new Error('ZIP 内文件校验失败：' + entry.name + '，请重新压缩。');
        var out = new File([data], entry.name.split('/').pop());
        Object.defineProperty(out, 'webkitRelativePath', { value: entry.name });
        return out;
      });
    });
  }

  global.CaseZip = { read: read };
})(window);
