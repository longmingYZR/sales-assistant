/**
 * 地理编码工具模块
 * 从 sales-map 移植：高德 API（主）+ Photon/OSM（后备）
 */

const LS_GAODE_KEY = 'sales_map_gaode_key_v1';

/** 读取高德 Web服务 Key */
export function getGaodeKey() {
  try {
    const fromLs = (localStorage.getItem(LS_GAODE_KEY) || '').trim();
    if (fromLs) return fromLs;
  } catch (_) { /* 无痕模式 */ }
  return '';
}

export function geoKeyMissing() {
  return !getGaodeKey();
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Photon/OSM 地理编码（无需 Key，适合海外地址） */
export async function geoCodePhoton(trimmed, countryHint) {
  try {
    let q = trimmed;
    if (countryHint) q = q + ', ' + countryHint;
    const url =
      'https://photon.komoot.io/api/?limit=1&q=' + encodeURIComponent(q);
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.features || data.features.length === 0) return null;
    const c = data.features[0].geometry.coordinates;
    if (!c || c.length < 2) return null;
    return { lat: parseFloat(c[1]), lon: parseFloat(c[0]) };
  } catch (_) {
    return null;
  }
}

/** JSONP 方式调用高德地理编码（file:// 等环境 fetch 不可用时回退） */
export function geoCodeJsonp(address) {
  return new Promise(function (resolve, reject) {
    const cbName =
      'amap_geocode_' + Date.now() + '_' + Math.floor(Math.random() * 1e9);
    const script = document.createElement('script');
    const timer = setTimeout(function () {
      cleanup();
      reject(new Error('jsonp timeout'));
    }, 20000);

    function cleanup() {
      clearTimeout(timer);
      try {
        delete window[cbName];
      } catch (_) { /* noop */ }
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    }

    window[cbName] = function (data) {
      cleanup();
      resolve(data);
    };

    script.onerror = function () {
      cleanup();
      reject(new Error('jsonp script error'));
    };

    const qs =
      'key=' +
      encodeURIComponent(getGaodeKey()) +
      '&address=' +
      encodeURIComponent(address) +
      '&output=json&callback=' +
      cbName;
    script.src = 'https://restapi.amap.com/v3/geocode/geo?' + qs;
    document.head.appendChild(script);
  });
}

/** 过滤表头关键词污染或过短地址 */
export function isTrivialGeocodeAddress(s) {
  const t = (s || '').trim();
  if (t.length < 3) return true;
  return /^(地址|详细地址|位置|address|addr)$/i.test(t);
}

/** 外文地名高德常误匹配国内同名点，优先走 Photon */
export function looksLikeForeignPlaceName(s) {
  const t = (s || '').trim();
  if (t.length < 3) return false;
  const letters = (t.match(/[A-Za-z]/g) || []).length;
  const cjk = (t.match(/[一-鿿]/g) || []).length;
  if (letters < 3) return false;
  if (cjk === 0) return true;
  return letters >= cjk * 2;
}

/** 主地理编码器：高德 API → 速率限制重试 → Photon 回退 → JSONP 最终回退 */
export async function geoCode(address, countryHint) {
  const trimmed = (address || '').trim();
  const hint = (countryHint || '').trim();
  if (!trimmed) return null;
  if (isTrivialGeocodeAddress(trimmed)) return null;

  const isForeign = looksLikeForeignPlaceName(trimmed);

  function parseGaodeResult(json) {
    if (!json || typeof json !== 'object') return null;
    if (json.status === '1' && json.geocodes && json.geocodes.length > 0) {
      const g0 = json.geocodes[0];
      const loc = g0.location.split(',');
      return { lat: parseFloat(loc[1]), lon: parseFloat(loc[0]) };
    }
    return null;
  }

  // 外文地址优先 Photon
  if (isForeign) {
    const photonPos = await geoCodePhoton(trimmed, hint);
    if (photonPos) return photonPos;
    if (geoKeyMissing()) return null;
  }

  if (geoKeyMissing()) return null;

  const url =
    'https://restapi.amap.com/v3/geocode/geo?key=' +
    encodeURIComponent(getGaodeKey()) +
    '&address=' +
    encodeURIComponent(trimmed) +
    '&output=json';

  const maxAttempts = 6;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(url);
      const json = await res.json();
      const isRateLimited =
        String(json.infocode) === '10021' ||
        (json.info && String(json.info).indexOf('CUQPS_HAS_EXCEEDED') !== -1);
      if (isRateLimited) {
        await sleep(900 + attempt * 500);
        continue;
      }

      const gaodePos = parseGaodeResult(json);
      if (gaodePos) {
        // 外文地址走 Photon 优先路径不应到这里；若到则额外校验
        if (isForeign) {
          const g0 = json.geocodes && json.geocodes[0];
          const country = String((g0 && g0.country) || '');
          if (country.indexOf('中国') !== -1) {
            console.warn('高德外文误判中国，已丢弃：', trimmed);
            return null;
          }
        }
        return gaodePos;
      }

      // 高德未命中，尝试 Photon（非外文地址尚未尝试过）
      if (!isForeign) {
        await sleep(600);
        const photonPos2 = await geoCodePhoton(trimmed, hint);
        if (photonPos2) return photonPos2;
      }

      console.warn('未找到：', trimmed);
      return null;
    } catch (_e) {
      // fetch 失败（如 file://），尝试 JSONP
      if (geoKeyMissing()) return null;
      try {
        const json = await geoCodeJsonp(trimmed);
        const jp = parseGaodeResult(json);
        if (jp) return jp;
        await sleep(600);
        const photonPos3 = await geoCodePhoton(trimmed, hint);
        if (photonPos3) return photonPos3;
        console.warn('未找到：', trimmed);
        return null;
      } catch (_e2) {
        console.error('解析异常：', trimmed, _e.message);
        return null;
      }
    }
  }
  return null;
}

// ── 表格工具 ──

/** 去除 UTF-8 BOM */
export function stripBomKey(k) {
  return String(k).replace(/^﻿/, '').trim();
}

export function normalizeSheetRows(rows) {
  return rows.map(function (row) {
    const out = {};
    for (const k in row) {
      if (!Object.prototype.hasOwnProperty.call(row, k)) continue;
      out[stripBomKey(k)] = row[k];
    }
    return out;
  });
}

/** 从行数据中匹配已知地址列 */
export function pickAddressCell(item) {
  if (!item) return '';
  const keys = [
    '地址', '详细地址', '位置', '门店地址', '公司地址',
    '通讯地址', '收货地址',
    'address', 'Addr', 'Address', 'location', 'Location',
  ];
  for (let i = 0; i < keys.length; i++) {
    const v = item[keys[i]];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

/** 从行数据中匹配已知国家列 */
export function pickCountryCell(item) {
  if (!item) return '';
  const keys = ['Country', 'country', '国家', '国家/地区', '国别'];
  for (let i = 0; i < keys.length; i++) {
    const v = item[keys[i]];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

/**
 * 启发式推断地址列
 * 当 Excel 表头是 Column1/Column2 等通用名时，通过文本特征打分
 */
export function inferAddressColumnKey(rows) {
  if (!rows || rows.length === 0) return null;
  const keys = Object.keys(rows[0]);
  let bestKey = null;
  let bestScore = -1;

  keys.forEach(function (k) {
    const kl = String(k).toLowerCase().trim();
    // 排除已知的经纬度列
    if (/^(lat|lng|lon|latitude|longitude|纬度|经度)$/.test(kl)) return;

    let total = 0;
    let nonEmpty = 0;
    let addrHints = 0;
    for (let i = 0; i < rows.length; i++) {
      const v = rows[i][k];
      if (v == null || v === '') continue;
      const s = String(v).trim();
      if (!s) continue;
      nonEmpty++;
      total += s.length;
      if (/[一-鿿]/.test(s)) total += 8;
      if (/省|市|区|县|镇|乡|路|街|大道|巷|号|楼|室|自治区/.test(s)) addrHints++;
      if (/^\d+(\.\d+)?$/.test(s) && s.length < 14) total -= 6;
    }
    if (nonEmpty === 0) return;
    const score = (total / nonEmpty) * Math.sqrt(nonEmpty) + addrHints * 4;
    if (score > bestScore) {
      bestScore = score;
      bestKey = k;
    }
  });

  return bestKey;
}

export function pickAddressOrFallback(item, fallbackKey) {
  const a = pickAddressCell(item);
  if (a) return a;
  if (fallbackKey && item[fallbackKey] != null) {
    const s = String(item[fallbackKey]).trim();
    if (s) return s;
  }
  return '';
}

export function rowNeedsGeocode(item, fallbackKey) {
  const lat = parseFloat(item.lat || item.Lat || item.LAT);
  const lon = parseFloat(item.lon || item.Lon || item.LON);
  if (!isNaN(lat) && !isNaN(lon)) return false;
  return !!pickAddressOrFallback(item, fallbackKey);
}
