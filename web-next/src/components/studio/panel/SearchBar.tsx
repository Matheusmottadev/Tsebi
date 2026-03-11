"use client";

import { Search } from "lucide-react";
import styles from "./SearchBar.module.css";

export type SearchOption = {
  label: string;
  value: string;
};

export interface FilterConfig {
  key: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchOption[];
  ariaLabel?: string;
}

export interface SortOption {
  key: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchOption[];
  ariaLabel?: string;
}

interface SearchBarProps {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  filters?: FilterConfig[];
  sortOptions?: SortOption[];
  resultsCount: number;
  onClear: () => void;
}

export function SearchBar({
  placeholder,
  value,
  onChange,
  filters = [],
  sortOptions = [],
  resultsCount,
  onClear,
}: SearchBarProps) {
  return (
    <div className={styles.searchBar}>
      <div className={styles.searchInputWrap}>
        <Search size={14} className={styles.searchIcon} aria-hidden="true" />
        <input
          className={styles.searchInput}
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>

      {filters.map((filter) => (
        <select
          key={filter.key}
          className={styles.filterSelect}
          value={filter.value}
          onChange={(event) => filter.onChange(event.target.value)}
          aria-label={filter.ariaLabel || filter.key}
        >
          {filter.options.map((option) => (
            <option key={`${filter.key}-${option.value}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ))}

      {sortOptions.map((sort) => (
        <select
          key={sort.key}
          className={styles.filterSelect}
          value={sort.value}
          onChange={(event) => sort.onChange(event.target.value)}
          aria-label={sort.ariaLabel || sort.key}
        >
          {sort.options.map((option) => (
            <option key={`${sort.key}-${option.value}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ))}

      <span className={styles.resultsCount}>{resultsCount} resultado(s) encontrado(s)</span>
      <button type="button" className={styles.clearBtn} onClick={onClear}>
        Limpar
      </button>
    </div>
  );
}
