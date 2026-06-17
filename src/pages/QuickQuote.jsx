import { useState, useMemo } from 'react';
import { getCountriesWithPricing, getCountryPricing } from '../utils/countryPricing';
import { calcVolume, formatVolume } from '../utils/dimensions';

const CATEGORY_CLASS = {
  '宽体车': 'cat-truck',
  '矿卡': 'cat-minetruck',
  '矿挖': 'cat-excavator',
  '破碎设备': 'cat-crusher',
  '筛分设备': 'cat-screen',
  '钻机': 'cat-drill',
};

export default function QuickQuote() {
  const [activeCategory, setActiveCategory] = useState('all');
  const [selectedModel, setSelectedModel] = useState(null);
  const [copied, setCopied] = useState(false);

  // Load products from the first available country's pricing data
  const { products, categories } = useMemo(() => {
    const countries = getCountriesWithPricing();
    if (countries.length === 0) return { products: [], categories: [] };

    const pricing = getCountryPricing(countries[0]);
    const allProducts = pricing?.products || [];

    // Deduplicate by model (same model appears in multiple countries)
    const seen = new Set();
    const unique = [];
    for (const p of allProducts) {
      if (!seen.has(p.model)) {
        seen.add(p.model);
        unique.push(p);
      }
    }

    const cats = [...new Set(unique.map(p => p.category).filter(Boolean))].sort();
    return { products: unique, categories: cats };
  }, []);

  const filteredProducts = activeCategory === 'all'
    ? products
    : products.filter(p => p.category === activeCategory);

  const handleCopy = (product) => {
    const volume = calcVolume(product.dimensions);
    const dims = product.dimensions || '-';
    const text = [
      `${product.model}  ${product.name}`,
      `FOB: $${Number(product.fob).toLocaleString('en-US')}`,
      `尺寸: ${dims} mm`,
      `体积: ${formatVolume(volume)}`,
    ].join('\n');

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (products.length === 0) {
    return (
      <div className="page">
        <h2 className="page-title">快速报价</h2>
        <p className="empty">暂无产品数据，请先导入价格表</p>
      </div>
    );
  }

  return (
    <div className="page">
      <h2 className="page-title">快速报价</h2>

      {/* Category filter */}
      <div className="quick-quote-categories">
        <button
          className={`filter-chip ${activeCategory === 'all' ? 'active' : ''}`}
          onClick={() => { setActiveCategory('all'); setSelectedModel(null); }}
        >
          全部
        </button>
        {categories.map(cat => (
          <button
            key={cat}
            className={`filter-chip ${CATEGORY_CLASS[cat] || ''} ${activeCategory === cat ? 'active' : ''}`}
            onClick={() => { setActiveCategory(cat); setSelectedModel(null); }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Machine list */}
      <div className="quick-quote-list">
        {filteredProducts.map(p => {
          const isSelected = selectedModel === p.model;
          const volume = calcVolume(p.dimensions);
          const catClass = CATEGORY_CLASS[p.category] || '';

          return (
            <div
              key={p.model}
              className={`qq-machine-card ${isSelected ? 'selected' : ''}`}
              onClick={() => setSelectedModel(isSelected ? null : p.model)}
            >
              <div className="qq-card-header">
                <span className={`card-category ${catClass}`}>{p.category}</span>
                <span className="qq-card-model">{p.model}</span>
              </div>
              <div className="qq-card-name">{p.name}</div>

              {isSelected && (
                <div className="qq-detail">
                  <div className="qq-detail-row">
                    <span className="qq-detail-label">FOB 价格</span>
                    <span className="qq-detail-value qq-price">
                      $ {Number(p.fob).toLocaleString('en-US')}
                    </span>
                  </div>
                  <div className="qq-detail-row">
                    <span className="qq-detail-label">外形尺寸</span>
                    <span className="qq-detail-value">{p.dimensions || '-'} mm</span>
                  </div>
                  <div className="qq-detail-row">
                    <span className="qq-detail-label">运输重量</span>
                    <span className="qq-detail-value">
                      {p.weight ? Number(p.weight).toLocaleString('en-US') + ' KG' : '-'}
                    </span>
                  </div>
                  <div className="qq-detail-row qq-volume-row">
                    <span className="qq-detail-label">体积</span>
                    <span className="qq-detail-value qq-volume">{formatVolume(volume)}</span>
                  </div>
                  <button
                    className="btn btn-primary btn-sm qq-copy-btn"
                    onClick={(e) => { e.stopPropagation(); handleCopy(p); }}
                  >
                    {copied ? '✓ 已复制' : '复制信息'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filteredProducts.length === 0 && (
        <p className="empty">该分类暂无产品</p>
      )}
    </div>
  );
}
