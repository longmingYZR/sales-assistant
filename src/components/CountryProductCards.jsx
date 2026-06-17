import { useState } from 'react';
import { calcVolume, formatVolume } from '../utils/dimensions';

const CATEGORY_CLASS = {
  '宽体车': 'cat-truck',
  '矿卡': 'cat-minetruck',
  '矿挖': 'cat-excavator',
  '破碎设备': 'cat-crusher',
  '筛分设备': 'cat-screen',
  '钻机': 'cat-drill',
  '其他': 'cat-other',
};

export default function CountryProductCards({ products, selectedModels, onToggleSelect, onCopyProduct }) {
  const [copiedModel, setCopiedModel] = useState(null);

  if (!products || products.length === 0) {
    return <p className="empty">暂无产品数据</p>;
  }

  const handleCopy = (p, e) => {
    e.stopPropagation();
    setCopiedModel(p.model);
    setTimeout(() => setCopiedModel(null), 2000);
    if (onCopyProduct) onCopyProduct(p);
  };

  return (
    <div className="country-product-grid">
      {products.map((p) => {
        const volume = calcVolume(p.dimensions);
        const catClass = CATEGORY_CLASS[p.category] || 'cat-other';
        const justCopied = copiedModel === p.model;
        const isSelected = selectedModels?.has(p.model);

        return (
          <div
            key={p.seq}
            className={`country-product-card ${isSelected ? 'selected' : ''}`}
            onClick={() => onToggleSelect?.(p.model)}
          >
            {isSelected && <span className="card-check">&#10003;</span>}

            <div className="card-header">
              <span className={`card-category ${catClass}`}>{p.category}</span>
              <span className="card-model">{p.model}</span>
            </div>

            <div className="card-name">{p.name}</div>

            {/* FOB price ×1.15 — prominent */}
            {p.fob && (
              <div className="card-fob">
                FOB <span className="card-fob-price">$ {(Number(p.fob) * 1.15).toLocaleString('en-US')}</span>
              </div>
            )}

            {/* Dimensions */}
            {p.dimensions && <div className="card-specs">{p.dimensions} mm</div>}

            {/* Weight */}
            {p.weight && <div className="card-specs">{Number(p.weight).toLocaleString('en-US')} KG</div>}

            {/* Volume — highlighted */}
            <div className="card-volume">
              体积 <span className="card-volume-value">{formatVolume(volume)}</span>
            </div>

            {/* Copy button */}
            <button
              className={`btn btn-sm card-copy-btn ${justCopied ? 'copied' : ''}`}
              onClick={(e) => handleCopy(p, e)}
            >
              {justCopied ? '✓ 已复制' : '复制信息'}
            </button>
          </div>
        );
      })}
    </div>
  );
}
