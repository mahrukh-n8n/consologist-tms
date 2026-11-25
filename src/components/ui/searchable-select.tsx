"use client";
import Image from "next/image";

/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, useRef, useCallback, useMemo, useId } from "react";
import { createPortal } from "react-dom";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronLeft, ChevronRight, ListFilter, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchableSelectOption {
  imageUrl?: string;
  value: string;
  label: string;
  /** Optional category for chip-bar filtering (e.g. "Asset", "Cash", "Liability") */
  category?: string;
  /** Optional description shown as a subtitle beneath the label in the dropdown */
  description?: string;
  /** Optional extra text used for matching but not rendered */
  searchText?: string;
}

/** Category definition for the chip filter bar */
export interface FilterCategory {
  /** Display label on the chip */
  label: string;
  /** Matches against option.category */
  match: string;
}

export interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  /** If true, no clear (×) button rendered — for required fields where empty is invalid */
  noClear?: boolean;
  /**
   * Optional chip filter bar above the dropdown list.
   * Each category shows as a clickable chip; clicking filters options by category.
   * Options must have a `category` field that matches FilterCategory.match.
   */
  filterCategories?: FilterCategory[];
  /** Open a wide account picker with a single scrollable category row. */
  categoryLayout?: "chips" | "inline";
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Search...",
  disabled,
  id,
  className,
  noClear,
  filterCategories,
  categoryLayout = "chips",
}: SearchableSelectProps) {
  const [searchText, setSearchText] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const chipScrollRef = useRef<HTMLDivElement>(null);
  const isInteractingRef = useRef(false);
  const dropdownId = useId();
  const inlineMode = categoryLayout === "inline";

  const updateScrollButtons = useCallback(() => {
    const strip = chipScrollRef.current;
    if (!strip) return;
    setCanScrollLeft(strip.scrollLeft > 1);
    setCanScrollRight(strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1);
  }, []);

  // Compute dropdown position when opening (portal renders at document body)
  useEffect(() => {
    if (!isOpen || !containerRef.current) {
      setDropdownPos(null);
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    const viewportPadding = 12;
    const width = Math.min(
      Math.max(rect.width, inlineMode ? 720 : 320),
      window.innerWidth - viewportPadding * 2
    );
    const left = Math.min(
      Math.max(rect.left + window.scrollX, window.scrollX + viewportPadding),
      window.scrollX + window.innerWidth - width - viewportPadding
    );
    setDropdownPos({
      top: rect.bottom + window.scrollY + 4,
      left,
      width,
    });
  }, [isOpen, inlineMode]);

  // Sync searchText when value changes from outside
  useEffect(() => {
    if (inlineMode) return;
    if (!value) {
      setSearchText("");
      return;
    }
    const option = options.find((o) => o.value === value);
    if (option) {
      setSearchText(option.label);
    }
  }, [value, options, inlineMode]);

  useEffect(() => {
    if (inlineMode) setSearchText("");
  }, [value, inlineMode]);

  useEffect(() => {
    if (!inlineMode || !isOpen || !dropdownPos) return;
    inputRef.current?.focus();
    updateScrollButtons();
    const strip = chipScrollRef.current;
    strip?.addEventListener("scroll", updateScrollButtons);
    window.addEventListener("resize", updateScrollButtons);
    return () => {
      strip?.removeEventListener("scroll", updateScrollButtons);
      window.removeEventListener("resize", updateScrollButtons);
    };
  }, [inlineMode, isOpen, dropdownPos, filterCategories, updateScrollButtons]);

  useEffect(() => {
    if (!inlineMode || !isOpen || !activeCategory) return;
    const strip = chipScrollRef.current;
    const chip = Array.from(strip?.children ?? []).find(
      (item) => item.getAttribute("data-category") === activeCategory
    );
    if (!strip || !chip || typeof strip.scrollBy !== "function") return;
    const stripRect = strip.getBoundingClientRect();
    const chipRect = chip.getBoundingClientRect();
    strip.scrollBy({
      left: chipRect.left + chipRect.width / 2 - stripRect.left - stripRect.width / 2,
      behavior: "smooth",
    });
  }, [activeCategory, inlineMode, isOpen]);

  // Click-outside handler (must check both container and portaled dropdown)
  const dropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: PointerEvent) {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        (!dropdownRef.current || !dropdownRef.current.contains(target))
      ) {
        setIsOpen(false);
        setActiveCategory(null);
        setIsCategoryMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", handleClickOutside);
    return () =>
      document.removeEventListener("pointerdown", handleClickOutside);
  }, [isOpen]);

  // Filter by text search + category chip
  const filteredOptions = useMemo(() => {
    let result = options;
    // Skip text filtering when searchText matches the selected option's label —
    // user just opened the dropdown and hasn't typed anything new
    const selectedOption = value ? options.find((o) => o.value === value) : null;
    const isUnchangedSelection = selectedOption && searchText === selectedOption.label;
    if (searchText && !isUnchangedSelection) {
      const q = searchText.toLowerCase();
      result = result.filter(
        (o) =>
          o.label.toLowerCase().includes(q) ||
          (o.description && o.description.toLowerCase().includes(q)) ||
          (o.searchText && o.searchText.toLowerCase().includes(q)) ||
          (o.category && o.category.toLowerCase().includes(q))
      );
    }
    if (activeCategory) {
      result = result.filter((o) => o.category === activeCategory);
    }
    return result;
  }, [options, searchText, activeCategory, value]);

  const hasSelection = value !== "";
  const selectedLabel = options.find((option) => option.value === value)?.label ?? value;
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (inlineMode) {
      for (const option of options) {
        if (option.category) {
          counts.set(option.category, (counts.get(option.category) ?? 0) + 1);
        }
      }
    }
    return counts;
  }, [options, inlineMode]);

  const handleSelect = useCallback(
    (optionValue: string, optionLabel: string) => {
      onChange(optionValue);
      setSearchText(inlineMode ? "" : optionLabel);
      setIsOpen(false);
      setActiveCategory(null);
      setIsCategoryMenuOpen(false);
      if (inlineMode) triggerRef.current?.focus();
    },
    [onChange, inlineMode]
  );

  const chooseCategory = useCallback((category: string | null) => {
    setActiveCategory((current) => current === category ? null : category);
    setIsCategoryMenuOpen(false);
  }, []);

  // Pointer handlers shared by dropdown and items
  const dropdownPointerDown = useCallback(
    (e: React.PointerEvent | React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      isInteractingRef.current = true;
    },
    []
  );

  const optionsList = (
    <div className={cn("overflow-y-auto", inlineMode ? "max-h-80" : "max-h-52")}>
      {filteredOptions.length === 0 ? (
        <p className={cn("px-3 text-sm text-muted-foreground", inlineMode ? "py-3" : "py-2")}>No options found.</p>
      ) : (
        filteredOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            className={cn(
              "flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-accent cursor-pointer",
              inlineMode && "border-b border-border/60 px-4 py-3 last:border-b-0",
              option.value === value && "bg-accent font-medium"
            )}
            onPointerDown={inlineMode ? undefined : dropdownPointerDown}
            onClick={() => {
              handleSelect(option.value, option.label);
              isInteractingRef.current = false;
            }}
            title={option.label}
          >
            <div className="flex w-full items-start justify-between gap-2">
              <span className={cn("inline-flex items-center gap-2", inlineMode && "min-w-0")}>
                {option.imageUrl && <Image unoptimized src={option.imageUrl} alt="" width={32} height={32} loading="lazy" className="size-8 object-contain" onError={e => { e.currentTarget.style.visibility = "hidden"; }} />}
                <span className="whitespace-normal break-words leading-snug">
                  {inlineMode && /^#\d+\s/.test(option.label) ? (
                    <><strong>{option.label.slice(0, option.label.indexOf(" "))}</strong>{option.label.slice(option.label.indexOf(" "))}</>
                  ) : option.label}
                </span>
              </span>
              {option.category && (
                <span className={cn(
                  "ml-2 shrink-0 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded",
                  inlineMode && "max-w-28 truncate bg-transparent px-0 text-xs sm:max-w-40"
                )}>
                  {option.category}
                </span>
              )}
            </div>
            {option.description && (
              <span className="text-xs text-muted-foreground mt-0.5 leading-snug">{option.description}</span>
            )}
          </button>
        ))
      )}
    </div>
  );

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {inlineMode ? (
        <button
          ref={triggerRef}
          id={id}
          type="button"
          disabled={disabled}
          aria-expanded={isOpen}
          aria-controls={dropdownId}
          className={cn(
            "flex h-11 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm shadow-sm transition-colors hover:border-ring focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            hasSelection && !noClear && "pr-16"
          )}
          title={hasSelection ? selectedLabel : placeholder}
          onClick={() => {
            setIsOpen((open) => !open);
            setIsCategoryMenuOpen(false);
          }}
        >
          <span className={cn("truncate", !hasSelection && "text-muted-foreground")}>{hasSelection ? selectedLabel : placeholder}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      ) : (
        <Input
          ref={inputRef}
          id={id}
          placeholder={placeholder}
          value={searchText}
          title={searchText}
          disabled={disabled}
          className={hasSelection && !noClear ? "pr-8" : ""}
          onChange={(e) => {
            setSearchText(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => {
            if (!isInteractingRef.current) {
              setTimeout(() => setIsOpen(false), 200);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setIsOpen(false);
              setActiveCategory(null);
            }
          }}
        />
      )}

      {/* Clear button */}
      {hasSelection && !noClear && (
        <button
          type="button"
          aria-label="Clear selection"
          disabled={disabled && inlineMode}
          className={cn(
            "absolute top-1/2 z-10 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
            inlineMode ? "right-9" : "right-2"
          )}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={() => {
            onChange("");
            setSearchText("");
            setIsOpen(false);
            setActiveCategory(null);
            if (inlineMode) triggerRef.current?.focus();
            else inputRef.current?.focus();
          }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Dropdown — portaled to body to escape overflow clipping */}
      {isOpen && dropdownPos && createPortal(
        <div
          ref={dropdownRef}
          id={dropdownId}
          className="z-50 rounded-md border bg-popover shadow-md"
          style={{
            position: "absolute",
            top: dropdownPos.top,
            left: dropdownPos.left,
            width: dropdownPos.width,
            maxWidth: "calc(100vw - 24px)",
            pointerEvents: "auto",
          }}
          onPointerDown={inlineMode ? undefined : dropdownPointerDown}
          onPointerUp={() => {
            isInteractingRef.current = false;
          }}
        >
          {inlineMode ? (
            <>
              <div className="flex items-center gap-2 border-b px-3 py-2">
                <Search className="size-4 shrink-0 text-muted-foreground" />
                <Input
                  ref={inputRef}
                  type="search"
                  value={searchText}
                  placeholder="Search by account name, number, or category"
                  aria-label="Search accounts"
                  className="min-w-0 border-0 px-0 shadow-none focus-visible:ring-0 [&::-webkit-search-cancel-button]:hidden"
                  onChange={(e) => setSearchText(e.target.value)}
                  onBlur={(e) => {
                    if (
                      !dropdownRef.current?.contains(e.relatedTarget as Node) &&
                      !containerRef.current?.contains(e.relatedTarget as Node)
                    ) {
                      setTimeout(() => setIsOpen(false), 200);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      if (isCategoryMenuOpen) setIsCategoryMenuOpen(false);
                      else {
                        setIsOpen(false);
                        setActiveCategory(null);
                        triggerRef.current?.focus();
                      }
                    }
                  }}
                />
                <button
                  type="button"
                  aria-label="Clear search"
                  className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  onClick={() => {
                    setSearchText("");
                    inputRef.current?.focus();
                  }}
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="relative flex h-14 items-center gap-1.5 border-b px-2">
                <button
                  type="button"
                  aria-pressed={!activeCategory}
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors",
                    !activeCategory ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
                  )}
                  onClick={() => chooseCategory(null)}
                >
                  All
                </button>
                <button
                  type="button"
                  aria-label="Choose account category"
                  aria-expanded={isCategoryMenuOpen}
                  disabled={!filterCategories?.length}
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-md border text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40",
                    isCategoryMenuOpen && "border-ring bg-accent text-foreground"
                  )}
                  onClick={() => setIsCategoryMenuOpen((open) => !open)}
                >
                  <ListFilter className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label="Scroll categories left"
                  disabled={!canScrollLeft}
                  className="flex size-8 shrink-0 items-center justify-center rounded-md border text-muted-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => chipScrollRef.current?.scrollBy({ left: -220, behavior: "smooth" })}
                >
                  <ChevronLeft className="size-4" />
                </button>
                <div ref={chipScrollRef} aria-label="Account category shortcuts" className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {filterCategories?.map((cat) => (
                    <button
                      key={cat.match}
                      type="button"
                      data-category={cat.match}
                      aria-pressed={activeCategory === cat.match}
                      title={cat.label}
                      className={cn(
                        "max-w-48 shrink-0 truncate rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                        activeCategory === cat.match ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
                      )}
                      onClick={() => chooseCategory(cat.match)}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  aria-label="Scroll categories right"
                  disabled={!canScrollRight}
                  className="flex size-8 shrink-0 items-center justify-center rounded-md border text-muted-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => chipScrollRef.current?.scrollBy({ left: 220, behavior: "smooth" })}
                >
                  <ChevronRight className="size-4" />
                </button>
                {isCategoryMenuOpen && (
                  <div className="absolute left-12 top-full z-10 max-h-72 w-64 max-w-[calc(100%_-_3rem)] overflow-y-auto rounded-md border bg-popover py-1 shadow-lg">
                    <div className="border-b px-3 py-2 text-xs font-semibold">Select account category</div>
                    {filterCategories?.map((cat) => (
                      <button
                        key={cat.match}
                        type="button"
                        aria-pressed={activeCategory === cat.match}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-accent",
                          activeCategory === cat.match && "bg-accent font-medium"
                        )}
                        onClick={() => chooseCategory(cat.match)}
                      >
                        <span>{cat.label}</span>
                        <span className="tabular-nums text-muted-foreground">{categoryCounts.get(cat.match) ?? 0}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 border-b px-4 py-2 text-sm">
                <span className="min-w-0 truncate font-medium">{filterCategories?.find((cat) => cat.match === activeCategory)?.label ?? "All accounts"}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{filteredOptions.length} {filteredOptions.length === 1 ? "account" : "accounts"}</span>
              </div>
              {optionsList}
            </>
          ) : (
            <>
              {filterCategories && filterCategories.length > 0 && (
                <div className="flex flex-wrap gap-1 px-2 py-1.5 border-b bg-muted/30">
                  <button
                    type="button"
                    className={cn(
                      "px-2 py-0.5 rounded-full text-xs font-medium transition-colors",
                      !activeCategory
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                    onPointerDown={dropdownPointerDown}
                    onClick={() => setActiveCategory(null)}
                  >
                    All
                  </button>
                  {filterCategories.map((cat) => (
                    <button
                      key={cat.match}
                      type="button"
                      className={cn(
                        "px-2 py-0.5 rounded-full text-xs font-medium transition-colors",
                        activeCategory === cat.match
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      )}
                      onPointerDown={dropdownPointerDown}
                      onClick={() =>
                        setActiveCategory(activeCategory === cat.match ? null : cat.match)
                      }
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              )}
              {optionsList}
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
