/**
 * Streaming Statistics Calculator.
 * Computes statistics incrementally without loading all data into memory.
 * Uses Welford's algorithm for numerically stable variance calculation.
 */

/** Result from streaming statistics calculation */
export interface StreamingStatsResult {
  /** Number of values processed */
  count: number;
  /** Sum of all values */
  sum: number;
  /** Minimum value */
  min: number;
  /** Maximum value */
  max: number;
  /** Arithmetic mean */
  mean: number;
  /** Sample variance (n-1 denominator) */
  variance: number;
  /** Sample standard deviation */
  stdev: number;
}

/**
 * Single-pass statistics calculator using Welford's algorithm.
 * Memory usage: O(1) regardless of data size.
 *
 * Welford's algorithm is numerically stable for computing variance
 * in a single pass, avoiding the catastrophic cancellation that
 * can occur with the naive sum-of-squares approach.
 *
 * @example
 * ```typescript
 * const stats = new StreamingStats();
 * for (const value of largeDataset) {
 *   stats.add(value);
 * }
 * console.log(stats.getStats());
 * ```
 */
export class StreamingStats {
  private n = 0;
  private mean = 0;
  private m2 = 0; // Sum of squared differences from mean
  private sum = 0;
  private min = Infinity;
  private max = -Infinity;

  /**
   * Add a value to the running statistics.
   * Non-finite values (NaN, Infinity) are ignored.
   */
  add(value: number): void {
    if (!Number.isFinite(value)) return;

    this.n++;
    this.sum += value;
    this.min = Math.min(this.min, value);
    this.max = Math.max(this.max, value);

    // Welford's online algorithm for numerical stability
    const delta = value - this.mean;
    this.mean += delta / this.n;
    const delta2 = value - this.mean;
    this.m2 += delta * delta2;
  }

  /**
   * Add multiple values at once.
   */
  addAll(values: number[]): void {
    for (const value of values) {
      this.add(value);
    }
  }

  /**
   * Get current statistics.
   * Returns zeros for count/sum/mean if no values have been added.
   */
  getStats(): StreamingStatsResult {
    if (this.n === 0) {
      return {
        count: 0,
        sum: 0,
        min: 0,
        max: 0,
        mean: 0,
        variance: 0,
        stdev: 0,
      };
    }

    // Sample variance (Bessel's correction)
    const variance = this.n > 1 ? this.m2 / (this.n - 1) : 0;

    return {
      count: this.n,
      sum: this.sum,
      min: this.min,
      max: this.max,
      mean: this.mean,
      variance,
      stdev: Math.sqrt(variance),
    };
  }

  /**
   * Get the current count.
   */
  getCount(): number {
    return this.n;
  }

  /**
   * Reset to initial state.
   */
  reset(): void {
    this.n = 0;
    this.mean = 0;
    this.m2 = 0;
    this.sum = 0;
    this.min = Infinity;
    this.max = -Infinity;
  }

  /**
   * Merge statistics from another StreamingStats instance.
   * Useful for combining results from parallel processing.
   */
  merge(other: StreamingStats): void {
    if (other.n === 0) return;
    if (this.n === 0) {
      this.n = other.n;
      this.mean = other.mean;
      this.m2 = other.m2;
      this.sum = other.sum;
      this.min = other.min;
      this.max = other.max;
      return;
    }

    const totalN = this.n + other.n;
    const delta = other.mean - this.mean;

    // Parallel algorithm for combining two sets of statistics
    this.m2 =
      this.m2 + other.m2 + (delta * delta * this.n * other.n) / totalN;
    this.mean = (this.mean * this.n + other.mean * other.n) / totalN;
    this.sum += other.sum;
    this.min = Math.min(this.min, other.min);
    this.max = Math.max(this.max, other.max);
    this.n = totalN;
  }
}

/**
 * IQR result for outlier detection.
 */
export interface IQRResult {
  /** First quartile (25th percentile) */
  q1: number;
  /** Third quartile (75th percentile) */
  q3: number;
  /** Interquartile range (Q3 - Q1) */
  iqr: number;
}

/**
 * Streaming percentile calculator using reservoir sampling.
 * Maintains approximate percentiles with configurable accuracy.
 *
 * Reservoir sampling ensures each element has equal probability
 * of being in the sample, regardless of stream length.
 *
 * @example
 * ```typescript
 * const percentiles = new StreamingPercentiles(1000);
 * for (const value of largeDataset) {
 *   percentiles.add(value);
 * }
 * console.log(percentiles.getPercentile(50)); // Median
 * console.log(percentiles.getIQR()); // Q1, Q3, IQR
 * ```
 */
export class StreamingPercentiles {
  private reservoir: number[] = [];
  private readonly size: number;
  private n = 0;
  private sorted = false;

  /**
   * Create a new percentile calculator.
   * @param reservoirSize - Size of the sample reservoir (default: 1000)
   *                        Larger = more accurate but more memory
   */
  constructor(reservoirSize = 1000) {
    this.size = reservoirSize;
  }

  /**
   * Add a value using reservoir sampling.
   * Non-finite values are ignored.
   */
  add(value: number): void {
    if (!Number.isFinite(value)) return;

    this.n++;
    this.sorted = false;

    if (this.reservoir.length < this.size) {
      // Fill reservoir until full
      this.reservoir.push(value);
    } else {
      // Reservoir sampling: replace with probability size/n
      const j = Math.floor(Math.random() * this.n);
      if (j < this.size) {
        this.reservoir[j] = value;
      }
    }
  }

  /**
   * Add multiple values at once.
   */
  addAll(values: number[]): void {
    for (const value of values) {
      this.add(value);
    }
  }

  /**
   * Ensure reservoir is sorted for percentile calculation.
   */
  private ensureSorted(): void {
    if (!this.sorted) {
      this.reservoir.sort((a, b) => a - b);
      this.sorted = true;
    }
  }

  /**
   * Get approximate percentile (0-100).
   * @param p - Percentile to get (0-100)
   * @returns Approximate value at that percentile
   */
  getPercentile(p: number): number {
    if (this.reservoir.length === 0) return 0;
    if (p <= 0) return this.reservoir[0];
    if (p >= 100) return this.reservoir[this.reservoir.length - 1];

    this.ensureSorted();

    const index = Math.ceil((p / 100) * this.reservoir.length) - 1;
    return this.reservoir[Math.max(0, Math.min(index, this.reservoir.length - 1))];
  }

  /**
   * Get IQR (Q3 - Q1) for outlier detection.
   */
  getIQR(): IQRResult {
    const q1 = this.getPercentile(25);
    const q3 = this.getPercentile(75);
    return { q1, q3, iqr: q3 - q1 };
  }

  /**
   * Check if a value is an outlier using IQR method.
   * @param value - Value to check
   * @param multiplier - IQR multiplier (default: 1.5)
   */
  isOutlier(value: number, multiplier = 1.5): boolean {
    if (this.reservoir.length === 0) return false;

    const { q1, q3, iqr } = this.getIQR();
    return value < q1 - multiplier * iqr || value > q3 + multiplier * iqr;
  }

  /**
   * Get the median (50th percentile).
   */
  getMedian(): number {
    return this.getPercentile(50);
  }

  /**
   * Get count of values processed.
   */
  getCount(): number {
    return this.n;
  }

  /**
   * Reset to initial state.
   */
  reset(): void {
    this.reservoir = [];
    this.n = 0;
    this.sorted = false;
  }
}

/**
 * Simple streaming unique counter using a Set.
 * For very large cardinalities, consider HyperLogLog instead.
 *
 * Memory usage: O(unique values) - suitable for columns with
 * bounded cardinality (categories, status codes, etc.)
 *
 * @example
 * ```typescript
 * const unique = new StreamingUnique();
 * for (const value of categoryColumn) {
 *   unique.add(value);
 * }
 * console.log(unique.getCount()); // Number of unique categories
 * ```
 */
export class StreamingUnique {
  private seen = new Set<string>();
  private n = 0;

  /**
   * Add a value (converted to string for hashing).
   */
  add(value: unknown): void {
    if (value == null) return;

    this.n++;
    const key = typeof value === 'object' ? JSON.stringify(value) : String(value);
    this.seen.add(key);
  }

  /**
   * Add multiple values at once.
   */
  addAll(values: unknown[]): void {
    for (const value of values) {
      this.add(value);
    }
  }

  /**
   * Get count of unique values seen.
   */
  getCount(): number {
    return this.seen.size;
  }

  /**
   * Get total count of values processed.
   */
  getTotalCount(): number {
    return this.n;
  }

  /**
   * Reset to initial state.
   */
  reset(): void {
    this.seen.clear();
    this.n = 0;
  }
}

/**
 * Combined streaming column statistics.
 * Aggregates StreamingStats, StreamingPercentiles, and StreamingUnique
 * for a single column.
 */
export class StreamingColumnStats {
  readonly stats: StreamingStats;
  readonly percentiles: StreamingPercentiles;
  readonly unique: StreamingUnique;
  private nullCount = 0;
  private totalCount = 0;
  private numericCount = 0;

  constructor(reservoirSize = 1000) {
    this.stats = new StreamingStats();
    this.percentiles = new StreamingPercentiles(reservoirSize);
    this.unique = new StreamingUnique();
  }

  /**
   * Add a value to all aggregators.
   */
  add(value: unknown): void {
    this.totalCount++;

    if (value == null || value === '') {
      this.nullCount++;
      return;
    }

    this.unique.add(value);

    // Track numeric values
    const numValue = typeof value === 'number' ? value : parseFloat(String(value));
    if (Number.isFinite(numValue)) {
      this.numericCount++;
      this.stats.add(numValue);
      this.percentiles.add(numValue);
    }
  }

  /**
   * Get summary statistics.
   */
  getSummary(): {
    stats: StreamingStatsResult;
    uniqueCount: number;
    nullCount: number;
    completeness: number;
    isNumeric: boolean;
    hasOutliers: boolean;
  } {
    const stats = this.stats.getStats();
    const isNumeric = this.numericCount > 0 && this.numericCount >= (this.totalCount - this.nullCount) * 0.8;

    return {
      stats,
      uniqueCount: this.unique.getCount(),
      nullCount: this.nullCount,
      completeness: this.totalCount > 0 ? (this.totalCount - this.nullCount) / this.totalCount : 0,
      isNumeric,
      hasOutliers: isNumeric && this.detectOutliers(),
    };
  }

  /**
   * Detect if column has outliers using IQR method.
   */
  private detectOutliers(): boolean {
    if (this.stats.getCount() < 10) return false;

    const stats = this.stats.getStats();
    if (stats.stdev === 0) return false;

    // Use IQR if we have percentile data
    const { q1, q3, iqr } = this.percentiles.getIQR();
    if (iqr === 0) return false;

    // Check if any values in our sample are outliers
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    return stats.min < lowerBound || stats.max > upperBound;
  }

  /**
   * Reset all aggregators.
   */
  reset(): void {
    this.stats.reset();
    this.percentiles.reset();
    this.unique.reset();
    this.nullCount = 0;
    this.totalCount = 0;
    this.numericCount = 0;
  }
}
