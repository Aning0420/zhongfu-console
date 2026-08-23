import { SelectGroup, SelectItem, SelectLabel } from '@/components/ui/select';
import { INVENTORY_CATEGORY_GROUPS } from '@/lib/inventory-categories';

export function InventoryCategoryOptions() {
  return INVENTORY_CATEGORY_GROUPS.map(group => (
    <SelectGroup key={group.label}>
      <SelectLabel>{group.label}</SelectLabel>
      {group.categories.map(category => (
        <SelectItem key={category} value={category}>{category}</SelectItem>
      ))}
    </SelectGroup>
  ));
}
