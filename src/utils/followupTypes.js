export const FOLLOWUP_TYPES = {
  visit:       { label: '拜访',       defaultInterval: 3,  urgency: 'high' },
  payment:     { label: '催款',       defaultInterval: 3,  urgency: 'high' },
  feedback:    { label: '待反馈',     defaultInterval: 5,  urgency: 'medium' },
  quotation:   { label: '报价跟进',   defaultInterval: 5,  urgency: 'medium' },
  negotiation: { label: '谈判推进',   defaultInterval: 7,  urgency: 'medium' },
  maintain:    { label: '日常维护',   defaultInterval: 15, urgency: 'low' },
  other:       { label: '其他',       defaultInterval: 7,  urgency: 'low' },
  checkpoint:  { label: '点检',       defaultInterval: 7,  urgency: 'low' },
};

export const STAGE_FOLLOWUP_TYPES = {
  '初接触': ['visit', 'feedback', 'other', 'checkpoint'],
  '需求确认': ['visit', 'quotation', 'feedback', 'other', 'checkpoint'],
  '报价中': ['quotation', 'feedback', 'negotiation', 'other', 'checkpoint'],
  '谈判中': ['negotiation', 'payment', 'feedback', 'other', 'checkpoint'],
  '成交': ['payment', 'maintain', 'other', 'checkpoint'],
  '搁置': ['maintain', 'other', 'checkpoint'],
  '商机关闭': ['maintain', 'other', 'checkpoint'],
};

// Type → dashboard category
const TYPE_CATEGORY = {
  visit:       'urgent',
  payment:     'urgent',
  feedback:    'waiting',
  quotation:   'progressing',
  negotiation: 'progressing',
  maintain:    'routine',
  other:       'routine',
  checkpoint:  'routine',
};

export const CATEGORY_CONFIG = {
  urgent:      { label: '急需行动', color: 'danger' },
  waiting:     { label: '等待反馈', color: 'warning' },
  progressing: { label: '推进中',   color: 'accent' },
  routine:     { label: '日常维护', color: 'muted' },
};

export function getCategoryForType(type) {
  return TYPE_CATEGORY[type] || 'routine';
}

export function getDefaultInterval(type) {
  const stored = JSON.parse(localStorage.getItem('followupIntervals') || '{}');
  if (stored[type] != null) return Number(stored[type]);
  const def = FOLLOWUP_TYPES[type];
  if (def) return def.defaultInterval;
  return Number(localStorage.getItem('remindDays')) || 5;
}

export function getIntervalDays(type) {
  return getDefaultInterval(type);
}
