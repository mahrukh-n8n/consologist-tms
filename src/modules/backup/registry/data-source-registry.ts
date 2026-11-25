/**
 * DataSourceRegistry — singleton registry for backup data sources.
 * Follows the PageRegistry pattern from auth-rbac.
 *
 * Apps register their data sources at startup, then freeze().
 * The registry resolves dependency order for import/export.
 */
import type { DataSource } from "./types";

export class DataSourceRegistry {
  private sources = new Map<string, DataSource>();
  private frozen = false;
  /** Application installs an independent reference contract for every source. */
  referenceIntegrityRequired = false;

  /**
   * Register a data source. Throws if key is duplicate or registry is frozen.
   * Also detects circular dependencies at registration time.
   */
  register(source: DataSource): void {
    if (this.frozen) {
      throw new Error(
        `DataSourceRegistry is frozen — cannot register "${source.key}"`
      );
    }
    if (this.sources.has(source.key)) {
      throw new Error(
        `Duplicate data source key: "${source.key}" is already registered`
      );
    }

    // Check that all dependencies exist or will exist (already registered)
    // and detect circular dependencies via DFS
    this.sources.set(source.key, source);
    try {
      this.detectCycle(source.key, new Set(), []);
    } catch (e) {
      this.sources.delete(source.key);
      throw e;
    }
  }

  /** Prevent further registration. */
  freeze(): void {
    this.frozen = true;
  }

  isFrozen(): boolean {
    return this.frozen;
  }

  /** Return all registered sources. */
  getAll(): DataSource[] {
    return Array.from(this.sources.values());
  }

  getByKey(key: string): DataSource | undefined {
    return this.sources.get(key);
  }

  getByGroup(group: string): DataSource[] {
    return this.getAll().filter((s) => s.group === group);
  }

  getGroups(): string[] {
    const groups = new Set<string>();
    this.sources.forEach((s) => {
      groups.add(s.group);
    });
    return Array.from(groups);
  }

  /**
   * Topological sort respecting dependsOn.
   * If selectedKeys provided, auto-includes all transitive dependencies.
   * Throws on circular dependencies.
   */
  resolveImportOrder(selectedKeys?: string[]): DataSource[] {
    let keysToInclude: Set<string>;

    if (selectedKeys) {
      keysToInclude = new Set(this.resolveDependenciesFor(selectedKeys));
    } else {
      keysToInclude = new Set(this.sources.keys());
    }

    // Topological sort via DFS
    const visited = new Set<string>();
    const result: DataSource[] = [];

    const visit = (key: string) => {
      if (visited.has(key)) return;
      visited.add(key);

      const source = this.sources.get(key);
      if (!source) return;

      for (const dep of source.dependsOn) {
        if (keysToInclude.has(dep)) {
          visit(dep);
        }
      }
      result.push(source);
    };

    keysToInclude.forEach((key) => {
      visit(key);
    });

    return result;
  }

  /**
   * Returns the full set of keys including transitive dependencies.
   * Useful for UI to show auto-included sources.
   */
  resolveDependenciesFor(keys: string[]): string[] {
    const result = new Set<string>();

    const collect = (key: string) => {
      if (result.has(key)) return;
      result.add(key);
      const source = this.sources.get(key);
      if (source) {
        for (const dep of source.dependsOn) {
          collect(dep);
        }
      }
    };

    for (const key of keys) {
      collect(key);
    }

    return Array.from(result);
  }

  /**
   * Detect cycles via DFS from a given key.
   */
  private detectCycle(
    key: string,
    visiting: Set<string>,
    path: string[]
  ): void {
    if (visiting.has(key)) {
      const cycleStart = path.indexOf(key);
      const cyclePath = [...path.slice(cycleStart), key].join(" -> ");
      throw new Error(`Circular dependency detected: ${cyclePath}`);
    }

    visiting.add(key);
    path.push(key);

    const source = this.sources.get(key);
    if (source) {
      for (const dep of source.dependsOn) {
        const depSource = this.sources.get(dep);
        if (depSource) {
          this.detectCycle(dep, new Set(visiting), [...path]);
        }
      }
    }

    visiting.delete(key);
  }
}

/** Singleton instance */
export const dataSourceRegistry = new DataSourceRegistry();
