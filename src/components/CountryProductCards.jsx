import { useState } from 'react';

const CATEGORY_CLASS = {
  '宽体车': 'cat-truck',
  '矿卡': 'cat-minetruck',
  '矿挖': 'cat-excavator',
  '破碎设备': 'cat-crusher',
  '筛分设备': 'cat-screen',
  '钻机': 'cat-drill',
  '其他': 'cat-other',
};

// Fields already visible on card preview — exclude from detail
const VISIBLE_ON_CARD = ['序号', '机型', '名称', '外形尺寸', '运输重量'];
// Price/freight/tax keywords to exclude from detail
const PRICE_FREIGHT_TAX = /价|费|税|FOB|CIF|DDP|保险|EXW|Invoice/i;

const COST_OPTIONS = [
  { key: 'fob', label: 'FOB' },
  { key: 'freight', label: '海运' },
  { key: 'insurance', label: '保险' },
];

export default function CountryProductCards({
  products,
  selectedSeqSet,
  onToggleSelect,
  costSelection,
  onToggleCost,
}) {
  const [expandedSeq, setExpandedSeq] = useState(null);

  if (!products || products.length === 0) {
    return <p className="empty">暂无产品数据</p>;
  }

  return (
    <div className="country-product-grid">
      {products.map((p) => {
        const isSelected = selectedSeqSet?.has(p.seq);
        const isExpanded = expandedSeq === p.seq;
        const catClass = CATEGORY_CLASS[p.category] || 'cat-other';
        const costs = costSelection?.[p.seq] || {};

        return (
          <div
            key={p.seq}
            className={`country-product-card ${isSelected ? 'selected' : ''} ${isExpanded ? 'expanded' : ''}`}
            onClick={() => onToggleSelect?.(p)}
          >
            {isSelected && <span className="card-check">&#10003;</span>}

            <div className="card-header">
              <span className={`card-category ${catClass}`}>{p.category}</span>
              <span className="card-model">{p.model}</span>
            </div>

            <div className="card-name">{p.name}</div>

            {p.dimensions && <div className="card-specs">{p.dimensions}</div>}
            {p.weight && <div className="card-specs">{Number(p.weight).toLocaleString('en-US')} KG</div>}

            {/* Cost composition checkboxes */}
            <div
              className="card-costs"
              onClick={(e) => e.stopPropagation()}
            >
              {COST_OPTIONS.map((opt) => (
                <label key={opt.key} className="cost-check-label">
                  <input
                    type="checkbox"
                    checked={!!costs[opt.key]}
                    onChange={() => onToggleCost?.(p.seq, opt.key)}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>

            {/* Expandable detail — core product params only */}
            <button
              className="card-expand-btn"
              onClick={(e) => {
                e.stopPropagation();
                setExpandedSeq(isExpanded ? null : p.seq);
              }}
            >
              {isExpanded ? '收起详情' : '查看详情'}
            </button>

            {isExpanded && (
              <div className="card-detail">
                {Object.entries(p.allFields)
                  .filter(([k]) => {
                    if (VISIBLE_ON_CARD.some((v) => k.includes(v))) return false;
                    if (PRICE_FREIGHT_TAX.test(k)) return false;
                    return true;
                  })
                  .map(([k, v]) => (
                    <div key={k} className="detail-row">
                      <span className="detail-key">{k}</span>
                      <span className="detail-val">{v}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
