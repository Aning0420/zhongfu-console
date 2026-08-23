export const INVENTORY_CATEGORY_GROUPS = [
  {
    label: '食品与饮水',
    categories: [
      '猫粮',
      '主食冻干',
      '零食冻干',
      '主食罐头',
      '零食罐头',
      '主食餐盒',
      '零食餐盒',
      '主食餐包',
      '零食餐包',
      '汤包',
      '奶',
      '主食猫条',
      '零食猫条',
    ],
  },
  {
    label: '健康管理',
    categories: ['保健品', '药品'],
  },
  {
    label: '日常用品',
    categories: ['猫砂与清洁', '喂养用品', '洗护用品', '玩具', '居家用品', '外出用品', '其他用品'],
  },
] as const;

export const INVENTORY_CATEGORIES = INVENTORY_CATEGORY_GROUPS.flatMap(group => group.categories);

const CATEGORY_ALIASES: Record<string, string> = {
  food: '猫粮',
  supplies: '其他用品',
  health: '保健品',
  daily: '其他用品',
  主粮: '猫粮',
  干粮: '猫粮',
  用品: '其他用品',
};

export function normalizeInventoryCategory(category: unknown): string {
  const value = String(category || '').trim();
  if (INVENTORY_CATEGORIES.some(item => item === value)) return value;
  return CATEGORY_ALIASES[value] || value || '其他用品';
}
