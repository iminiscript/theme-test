class ThemePerformance {
  /**
   * @param {string} metricPrefix
   */
  constructor(metricPrefix) {
    this.metricPrefix = metricPrefix;
  }

  /**
   * @param {string} benchmarkName
   * @returns {PerformanceMark}
   */
  createStartingMarker(benchmarkName) {
    const metricName = `${this.metricPrefix}:${benchmarkName}`;
    return performance.mark(`${metricName}:start`);
  }

  /**
   * @param {string} benchmarkName
   * @param {Event} event
   * @returns {void}
   */
  measureFromEvent(benchmarkName, event) {
    const metricName = `${this.metricPrefix}:${benchmarkName}`;
    const startMarkerName = `${metricName}:start`;
    const endMarkerName = `${metricName}:end`;

    // Check if start marker exists
    const startMarker = performance.getEntriesByName(startMarkerName, "mark")[0];

    if (!startMarker) {
      // If start marker doesn't exist, create it now to prevent errors
      // This handles cases where the start marker wasn't created before the event
      performance.mark(startMarkerName);
    }

    // Create end marker
    performance.mark(endMarkerName);

    // Measure between start and end markers
    try {
      performance.measure(metricName, startMarkerName, endMarkerName);
    } catch (e) {
      // If measurement fails, log a warning but don't throw
      // Performance measurement is non-critical and shouldn't break functionality
      console.warn(`[Performance] Failed to measure ${metricName}:`, e.message);
    }
  }

  /**
   * @param {PerformanceMark} startMarker
   * @returns {void}
   */
  measureFromMarker(startMarker) {
    const metricName = startMarker.name.replace(/:start$/, "");
    const endMarker = performance.mark(`${metricName}:end`);

    performance.measure(metricName, startMarker.name, endMarker.name);
  }

  /**
   * @param {string} benchmarkName
   * @param {Function} callback
   * @returns {void}
   */
  measure(benchmarkName, callback) {
    const metricName = `${this.metricPrefix}:${benchmarkName}`;
    performance.mark(`${metricName}:start`);

    callback();

    performance.mark(`${metricName}:end`);

    performance.measure(benchmarkName, `${metricName}:start`, `${metricName}:end`);
  }
}

export const cartPerformance = new ThemePerformance("cart-performance");
