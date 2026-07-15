import { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet-ruler';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { getAllCustomers } from '../db';
import {
  geoCode, geoCodePhoton, geoKeyMissing, sleep,
  normalizeSheetRows, pickAddressCell, pickCountryCell,
  inferAddressColumnKey, pickAddressOrFallback, rowNeedsGeocode,
} from '../utils/geocode';

// Vite + Leaflet 默认图标修复
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// ── 测距工具蓝色（与暗色主题协调）──
const RULER_OPTS = {
  position: 'topleft',
  circleMarker: { color: '#4a9eff', radius: 4 },
  lineStyle: { color: '#4a9eff', weight: 3 },
};

export default function Map() {
  // ── 状态 ──
  const [dataMode, setDataMode] = useState('customers'); // 'customers' | 'file'
  const [allData, setAllData] = useState([]);
  const [geocoding, setGeocoding] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, success: 0 });
  const [statusMsg, setStatusMsg] = useState({ text: '', isError: false });
  const [hasMarkers, setHasMarkers] = useState(false);

  // ── Refs ──
  const mapRef = useRef(null);
  const mapDivRef = useRef(null);
  const markersRef = useRef([]);
  const fileInputRef = useRef(null);
  const abortRef = useRef(false);

  // ── 初始化 Leaflet 地图 ──
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;

    const map = L.map(mapDivRef.current).setView([15, -70], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      crossOrigin: true,
      maxZoom: 18,
    }).addTo(map);

    L.control.scale({ imperial: false, metric: true, position: 'bottomleft' }).addTo(map);

    try {
      L.ruler(RULER_OPTS).addTo(map);
    } catch (_) {
      console.warn('测距工具加载失败');
    }

    mapRef.current = map;

    // 初检 Key
    if (geoKeyMissing()) {
      setStatusMsg({ text: '💡 提示：未配置高德 Key，海外地址将仅使用 Photon 编码。在「设置」中添加 Key 可获得更好效果。', isError: false });
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // 标记变化后刷新地图尺寸
  useEffect(() => {
    if (mapRef.current) {
      setTimeout(() => mapRef.current.invalidateSize(), 100);
    }
  }, [hasMarkers]);

  // ── 状态提示 ──
  const showStatus = useCallback((text, isError = false) => {
    setStatusMsg({ text, isError });
    if (!isError) {
      setTimeout(() => setStatusMsg({ text: '', isError: false }), 6000);
    }
  }, []);

  // ── 清空旧标记 ──
  const clearMarkers = useCallback(() => {
    markersRef.current.forEach((m) => mapRef.current?.removeLayer(m));
    markersRef.current = [];
    setHasMarkers(false);
  }, []);

  // ── 批量地理编码 + 打点 ──
  const geocodeAll = useCallback(async (rows, fallbackAddrKey = null) => {
    abortRef.current = false;
    setGeocoding(true);
    setAllData(rows);
    clearMarkers();

    let success = 0;
    const markerArr = [];
    const needsKey = rows.some((item) => rowNeedsGeocode(item, fallbackAddrKey));

    if (needsKey && geoKeyMissing()) {
      showStatus('❌ 数据需要地理编码，请先在「设置」中配置高德 Web服务 Key', true);
      setGeocoding(false);
      return;
    }

    showStatus(`📌 共 ${rows.length} 条数据，开始地理编码...`);

    for (let i = 0; i < rows.length; i++) {
      if (abortRef.current) break;

      const item = rows[i];
      let pos = null;

      // 优先用已有经纬度
      let lat = parseFloat(item.lat || item.Lat || item.LAT);
      let lon = parseFloat(item.lon || item.Lon || item.LON);

      if (!isNaN(lat) && !isNaN(lon)) {
        pos = { lat, lon };
      } else {
        const addr = pickAddressOrFallback(item, fallbackAddrKey);
        if (addr) {
          const country = pickCountryCell(item);
          pos = await geoCode(addr, country);
          if (!abortRef.current) await sleep(400);
        }
      }

      if (pos) {
        item.lat = pos.lat;
        item.lon = pos.lon;
        const marker = L.marker([pos.lat, pos.lon]).addTo(mapRef.current);

        let popHtml = '<div style="font-size:12px;line-height:1.6;max-height:180px;overflow-y:auto;">';
        for (const k in item) {
          if (Object.prototype.hasOwnProperty.call(item, k) && !k.startsWith('_')) {
            const val = item[k] != null ? String(item[k]).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
            popHtml += `<strong style="color:var(--accent)">${k}</strong>：${val}<br>`;
          }
        }
        popHtml += '</div>';
        marker.bindPopup(popHtml, { maxWidth: 280 });
        markerArr.push(marker);
        success++;
      }

      setProgress({ current: i + 1, total: rows.length, success });

      if ((i + 1) % 5 === 0 || i === rows.length - 1) {
        setStatusMsg({ text: `🔄 处理中... ${i + 1}/${rows.length} | 已定位：${success}`, isError: false });
      }
    }

    markersRef.current = markerArr;
    setHasMarkers(markerArr.length > 0);
    setAllData([...rows]); // 触发重渲染
    setGeocoding(false);

    if (markerArr.length > 0) {
      const group = L.featureGroup(markerArr);
      mapRef.current.fitBounds(group.getBounds().pad(0.1), { maxZoom: 12 });
    }

    showStatus(`✅ 完成！共 ${rows.length} 条数据，成功定位 ${success} 个点位`);
  }, [clearMarkers, showStatus]);

  // ── 加载客户数据 ──
  const loadCustomers = useCallback(async () => {
    try {
      showStatus('⏳ 正在加载客户数据...');
      const customers = await getAllCustomers();
      if (customers.length === 0) {
        showStatus('⚠️ 暂无客户数据，请先在「客户」页面添加客户', true);
        return;
      }

      const rows = customers.map((c) => ({
        '客户名称': c.客户名称 || c.companyName || '',
        '联系人': c.联系人 || c.contactName || '',
        '国家': c.国家 || c.country || '',
        '销售阶段': c.销售阶段 || c.stage || '',
        '商机金额': c.商机金额 || c.amount || '',
        '地址': `${c.客户名称 || c.companyName || ''}, ${c.国家 || c.country || ''}`,
      }));

      await geocodeAll(rows);
    } catch (e) {
      console.error('加载客户失败：', e);
      showStatus('❌ 加载客户数据失败', true);
      setGeocoding(false);
    }
  }, [geocodeAll, showStatus]);

  // ── 文件上传处理 ──
  const handleFileUpload = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // 重置 input 以允许重复上传同一文件
    if (fileInputRef.current) fileInputRef.current.value = '';

    showStatus('⏳ 正在读取文件...');
    const reader = new FileReader();

    reader.onload = async (ev) => {
      try {
        const data = new Uint8Array(ev.target.result);
        let wb = XLSX.read(data, { type: 'array' });
        let sheet = wb.Sheets[wb.SheetNames[0]];
        let rawRows = XLSX.utils.sheet_to_json(sheet);
        let allRows = normalizeSheetRows(rawRows);

        let rowsWithAddr = allRows.filter((r) => !!pickAddressCell(r)).length;

        // GBK 回退
        if (/\.csv$/i.test(file.name) && allRows.length > 0 && rowsWithAddr === 0) {
          try {
            const wb936 = XLSX.read(data, { type: 'array', codepage: 936 });
            const sh936 = wb936.Sheets[wb936.SheetNames[0]];
            const raw936 = XLSX.utils.sheet_to_json(sh936);
            const norm936 = normalizeSheetRows(raw936);
            const cnt936 = norm936.filter((r) => !!pickAddressCell(r)).length;
            if (cnt936 > rowsWithAddr) {
              wb = wb936; sheet = sh936; rawRows = raw936;
              allRows = norm936;
              rowsWithAddr = cnt936;
            }
          } catch (_) { /* GBK 回退失败，继续 */ }
        }

        let fallbackAddrKey = null;
        if (rowsWithAddr === 0 && allRows.length > 0) {
          fallbackAddrKey = inferAddressColumnKey(allRows);
        }

        const rowsWithAddrEff = allRows.filter(
          (r) => !!pickAddressOrFallback(r, fallbackAddrKey)
        ).length;

        const hasCoords = allRows.some((r) => {
          const la = parseFloat(r.lat || r.Lat || r.LAT);
          const lo = parseFloat(r.lon || r.Lon || r.LON);
          return !isNaN(la) && !isNaN(lo);
        });

        if (allRows.length === 0) {
          showStatus('⚠️ 表格为空，请检查文件内容', true);
          return;
        }

        if (rowsWithAddrEff === 0 && !hasCoords) {
          showStatus(
            '⚠️ 未识别到地址或经纬度：请使用「地址」列表头，或保证某一列为完整地址文本',
            true
          );
          return;
        }

        if (fallbackAddrKey && rowsWithAddr === 0 && rowsWithAddrEff > 0) {
          showStatus(`📎 已自动将「${fallbackAddrKey}」列作为地址列（表头为 Column1 等时）`, false);
        }

        // 按地址列过滤 → 编码
        const needsGeo = allRows.some((item) => rowNeedsGeocode(item, fallbackAddrKey));
        if (needsGeo && geoKeyMissing()) {
          showStatus('❌ 表格需要地理编码，请先在「设置」中保存高德 Web服务 Key 后再上传', true);
          return;
        }

        await geocodeAll(allRows, fallbackAddrKey);
      } catch (err) {
        console.error('文件解析失败：', err);
        showStatus('❌ 文件解析失败，请确认格式正确（csv/xlsx/xls）', true);
      }
    };

    reader.readAsArrayBuffer(file);
  }, [geocodeAll, showStatus]);

  // ── 导出 PNG ──
  const exportPNG = useCallback(async () => {
    if (markersRef.current.length === 0) {
      showStatus('⚠️ 请先加载数据并完成打点', true);
      return;
    }
    showStatus('🖼️ 正在生成图片...');
    try {
      const canvas = await html2canvas(mapDivRef.current, {
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#1a1a2e',
      });
      const a = document.createElement('a');
      a.download = `地图点位_${new Date().toISOString().slice(0, 10)}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
      showStatus('✅ 图片已导出');
    } catch (err) {
      console.error('截图失败：', err);
      showStatus('❌ 截图失败，请重试', true);
    }
  }, [showStatus]);

  // ── 导出 CSV ──
  const exportCSV = useCallback(() => {
    if (allData.length === 0) {
      showStatus('⚠️ 请先加载数据并完成打点', true);
      return;
    }
    const ws = XLSX.utils.json_to_sheet(allData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '点位数据');
    XLSX.writeFile(wb, `地址带经纬度_${new Date().toISOString().slice(0, 10)}.csv`);
    showStatus('✅ CSV 已导出');
  }, [allData, showStatus]);

  // ── 导出 KML ──
  const exportKML = useCallback(() => {
    const placed = allData.filter((item) => item.lat && item.lon);
    if (placed.length === 0) {
      showStatus('⚠️ 没有成功定位的点位可导出', true);
      return;
    }

    let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>GeoMap 导出点位</name>`;

    placed.forEach((item) => {
      const name = (item['名称'] || item['客户名称'] || item.name || item['地址'] || item.address || '未命名')
        .toString()
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const desc = (item['备注'] || item.note || '').toString()
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      kml += `
  <Placemark>
    <name>${name}</name>
    <description>${desc}</description>
    <Point>
      <coordinates>${item.lon},${item.lat},0</coordinates>
    </Point>
  </Placemark>`;
    });

    kml += `
</Document>
</kml>`;

    const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `点位_${new Date().toISOString().slice(0, 10)}.kml`;
    a.click();
    URL.revokeObjectURL(url);
    showStatus(`✅ KML 已导出，共 ${placed.length} 个点位`);
  }, [allData, showStatus]);

  // ── 取消编码 ──
  const cancelGeocoding = useCallback(() => {
    abortRef.current = true;
    setGeocoding(false);
    showStatus('⏹ 已取消');
  }, [showStatus]);

  return (
    <div className="map-page">
      {/* 状态栏 */}
      {statusMsg.text && (
        <div className={`map-status ${statusMsg.isError ? 'error' : ''}`}>
          {statusMsg.text}
        </div>
      )}

      {/* 工具栏 */}
      <div className="map-toolbar">
        {/* 模式切换 */}
        <div className="map-mode-toggle">
          <button
            className={`btn btn-sm ${dataMode === 'customers' ? 'active-mode' : ''}`}
            onClick={() => setDataMode('customers')}
            disabled={geocoding}
          >
            客户数据
          </button>
          <button
            className={`btn btn-sm ${dataMode === 'file' ? 'active-mode' : ''}`}
            onClick={() => setDataMode('file')}
            disabled={geocoding}
          >
            上传文件
          </button>
        </div>

        {/* 数据加载 */}
        {dataMode === 'customers' ? (
          <button
            className="btn btn-primary btn-sm"
            onClick={loadCustomers}
            disabled={geocoding}
          >
            {geocoding ? `编码中 ${progress.current}/${progress.total}` : '加载客户'}
          </button>
        ) : (
          <>
            <input
              type="file"
              ref={fileInputRef}
              className="map-file-input"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileUpload}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={geocoding}
            >
              {geocoding ? `编码中 ${progress.current}/${progress.total}` : '📁 上传文件'}
            </button>
          </>
        )}

        {/* 取消 */}
        {geocoding && (
          <button className="btn btn-sm" onClick={cancelGeocoding} style={{ color: 'var(--danger)' }}>
            取消
          </button>
        )}

        {/* 导出 */}
        <button className="btn btn-sm" onClick={exportPNG} disabled={!hasMarkers || geocoding}>
          🖼️ 图片
        </button>
        <button className="btn btn-sm" onClick={exportCSV} disabled={allData.length === 0 || geocoding}>
          📄 CSV
        </button>
        <button className="btn btn-sm" onClick={exportKML} disabled={!hasMarkers || geocoding}>
          📍 KML
        </button>
      </div>

      {/* 地图容器 */}
      <div className="map-container">
        <div ref={mapDivRef} />
      </div>

      {/* 使用提示（无标记时） */}
      {!hasMarkers && !geocoding && (
        <div className="map-hint" style={{
          padding: '12px 16px',
          fontSize: 'var(--font-size-xs)',
          color: 'var(--text-secondary)',
          background: 'var(--bg-secondary)',
        }}>
          <p style={{ margin: 0 }}>
            💡 <strong>客户数据</strong>：加载 CRM 中的客户地址到地图 |
            <strong> 上传文件</strong>：上传 CSV/XLSX 批量地址打点
          </p>
        </div>
      )}
    </div>
  );
}
