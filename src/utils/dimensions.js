/**
 * Parse a dimension string like "9400×4000×3950" into numeric L/W/H in mm.
 * Handles × (U+00D7), x, X, and comma separators.
 * Returns null for unparseable input.
 */
export function parseDimensions(dimStr) {
  if (!dimStr || typeof dimStr !== 'string') return null;
  const parts = dimStr.split(/[×xX,]/).map(s => Number(s.trim()));
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  return { length: parts[0], width: parts[1], height: parts[2] };
}

/**
 * Calculate volume in cubic meters from a dimension string.
 * Formula: (L/1000) × (W/1000) × (H/1000)
 * Returns null if dimensions can't be parsed.
 */
export function calcVolume(dimStr) {
  const dims = parseDimensions(dimStr);
  if (!dims) return null;
  return (dims.length / 1000) * (dims.width / 1000) * (dims.height / 1000);
}

/**
 * Format a volume number into a human-readable string with unit.
 * Auto-selects precision: whole number for >=100 m³, 1 decimal for 10-100, 2 decimals for <10.
 */
export function formatVolume(m3) {
  if (m3 === null || m3 === undefined) return '-';
  if (m3 >= 100) return m3.toFixed(0) + ' m³';
  if (m3 >= 10) return m3.toFixed(1) + ' m³';
  return m3.toFixed(2) + ' m³';
}
