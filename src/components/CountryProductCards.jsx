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

function formatPrice(val) {
  if (!val || val === '/') return null;
  const n = Number(val);
  if (isNaN(n)) return val;
  return '$' + n.toLocaleString('en-US');
}

export default function CountryProductCards({
  products,
  pricingModel,
  selectedSeqSet,
  onToggleSelect,
}) {
  const [expandedSeq, setExpandedSeq] = useState(null);

  if (!products || products.length === 0) {
    return <p className="empty">暂无产品数据</p>;
  }

  const primaryPriceLabel = pricingModel === 'DDP' ? 'DDP' : 'CIF';

  return (
    <div className="country-product-grid">
      {products.map((p) => {
        const isSelected = selectedSeqSet?.has(p.seq);
        const isExpanded = expandedSeq === p.seq;
        const primaryPrice = pricingModel === 'DDP' ? p.ddp : p.cif;
        const catClass = CATEGORY_CLASS[p.category] || 'cat-other';

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

            <div className="card-prices">
              <div className="price-row">
                <span className="price-label">FOB</span>
                <span className="price-value">{formatPrice(p.fob) || '-'}</span>
              </div>
              {p.oceanFreight && (
                <div className="price-row price-freight">
                  <span className="price-label">海运费</span>
                  <span className="price-value">{formatPrice(p.oceanFreight)}</span>
                </div>
              )}
              {primaryPrice && primaryPrice !== '/' && (
                <div className="price-row price-final">
                  <span className="price-label">{primaryPriceLabel}</span>
                  <span className="price-value">{formatPrice(primaryPrice)}</span>
                </div>
              )}
            </div>

            {/* Expandable detail */}
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
                {Object.entries(p.allFields).map(([k, v]) => (
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
