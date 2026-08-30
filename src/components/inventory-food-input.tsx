'use client';

import { useId, useMemo, useState } from 'react';
import { Package } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

function currentSearchTerm(value: string): string {
  return value.split(/[＋+、,，;；]/).at(-1)?.trim() || '';
}

function replaceCurrentTerm(value: string, suggestion: string): string {
  const match = value.match(/^(.*[＋+、,，;；]\s*)[^＋+、,，;；]*$/);
  return match ? `${match[1]}${suggestion}` : suggestion;
}

export function InventoryFoodInput({ value, onChange, suggestions, placeholder, ariaLabel, className }: {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const term = currentSearchTerm(value).toLocaleLowerCase('zh-CN');
  const matches = useMemo(() => suggestions
    .filter(name => !term || name.toLocaleLowerCase('zh-CN').includes(term))
    .slice(0, 6), [suggestions, term]);
  const showSuggestions = focused && matches.length > 0 && !suggestions.includes(currentSearchTerm(value));

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={event => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showSuggestions}
        aria-controls={listId}
        autoComplete="off"
        className={className}
      />
      {showSuggestions && (
        <div id={listId} role="listbox" className="absolute inset-x-0 top-full z-50 mt-1 max-h-52 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
          {matches.map(name => (
            <button
              key={name}
              type="button"
              role="option"
              aria-selected={false}
              onPointerDown={event => event.preventDefault()}
              onClick={() => {
                onChange(replaceCurrentTerm(value, name));
                setFocused(false);
              }}
              className={cn('flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground')}
            >
              <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 break-words">{name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
