/**
 * Cart Urgency Badge Component
 *
 * Displays social proof urgency messages for cart items based on
 * real-time add-to-cart data from the analytics API.
 *
 * Shows "HURRY! X others have this in their cart" for the highest priced item
 * when more than 5 others have added it to their cart recently.
 *
 * Uses BWW state.watch('cartState') to react to cart changes, similar to
 * how component-gwp-progressbar.js handles cart updates. After cart state
 * changes, waits for morphSection to complete before processing badges.
 */

// @ts-nocheck
(() => {
  const API_URL = "https://splittesting.acadia.io/analytics/social-proof";
  const PID = "289302657";
  const MIN_ITEMS_THRESHOLD = 5;
  const MAX_DISPLAY_COUNT = 200;

  // ========== TEST MODE FLAGS ==========
  // Set to true to use hardcoded test product ID, false to use actual SKU
  const USE_TEST_PRODUCT_ID = true;
  const TEST_PRODUCT_ID = "840344319419";

  // Set to true to show badge on first item, false to show on highest priced item
  const SHOW_ON_FIRST_ITEM = true;
  // =====================================

  const DEBUG = true;
  const log = (...args) => {
    if (DEBUG) console.log("[CartUrgencyBadge]", ...args);
  };

  /**
   * Cart Urgency Badge Custom Element
   * Renders an urgency message for a cart item
   */
  class CartUrgencyBadge extends HTMLElement {
    constructor() {
      super();
      this._initialized = false;
    }

    connectedCallback() {
      if (this._initialized) return;
      this._initialized = true;
    }

    /**
     * Updates the badge with the count of others who have this item
     * @param {number|string} count - Number of others with this item in cart
     */
    updateCount(count) {
      // Match the class name from cart-urgency-badge.liquid
      const countEl = this.querySelector(".cart-urgency-badge__count");
      if (countEl) {
        const displayCount = count > MAX_DISPLAY_COUNT ? `${MAX_DISPLAY_COUNT}+` : count;
        countEl.textContent = displayCount;
        log("Updated count element:", displayCount);
      } else {
        log("Count element not found!");
      }
    }

    /**
     * Shows the urgency badge
     */
    show() {
      // The snippet uses .hidden class with CSS: .cart-urgency-badge.hidden { display: none; }
      this.classList.remove("hidden");
      log("Badge shown, classList:", this.className);
    }

    /**
     * Hides the urgency badge
     */
    hide() {
      this.classList.add("hidden");
    }
  }

  // Register the custom element
  if (!customElements.get("cart-urgency-badge")) {
    customElements.define("cart-urgency-badge", CartUrgencyBadge);
  }

  /**
   * Cart Urgency Manager (Singleton)
   *
   * Uses the same pattern as component-gwp-progressbar.js:
   * - BWW.ready() for initial cart state
   * - state.watch('cartState') for cart changes
   * - Waits for morphSection to complete before processing badges
   */
  class CartUrgencyManager {
    constructor() {
      this._isProcessing = false;
      this._apiCache = new Map(); // Cache API results by productId
      this._lastProcessTime = 0;
      this._pendingProcess = null;
    }

    /**
     * Initialize the manager
     */
    init() {
      log("Initializing manager...");

      // Initial processing
      this._scheduleProcess("init");

      // Hook into BWW state manager (like GWP progressbar does)
      if (typeof BWW !== "undefined") {
        BWW.ready(state => {
          const cart = state.state?.cartState || null;
          if (cart) {
            this._scheduleProcess("BWW.ready");
          }

          // Watch for cart state changes
          // Cart state is updated BEFORE morphSection runs, so we need to wait
          state.watch(
            "cartState",
            cart => {
              if (cart) {
                // Wait for morphSection to complete (morph happens after state update)
                // Use a longer delay to ensure DOM is fully updated
                this._scheduleProcess("cartState.watch");
              }
            },
            { immediate: false }
          );
        });
      }
    }

    /**
     * Schedule a process with debouncing
     * Waits for DOM to stabilize after cart state changes
     * @param {string} source - What triggered the process
     */
    _scheduleProcess(source) {
      log("Process scheduled by:", source);

      // Clear any pending process
      if (this._pendingProcess) {
        clearTimeout(this._pendingProcess);
      }

      // Wait 300ms for morphSection to complete
      // morphSection is called after cart:update event and state changes
      this._pendingProcess = setTimeout(() => {
        this._pendingProcess = null;
        this._processCartItems(source);
      }, 300);
    }

    /**
     * Process all cart items and show urgency badge on the selected item
     * @param {string} source - What triggered this processing
     */
    async _processCartItems(source) {
      // Prevent concurrent processing
      if (this._isProcessing) {
        log("Already processing, skipping...", source);
        return;
      }

      this._isProcessing = true;
      this._lastProcessTime = Date.now();

      log("Processing cart items...", { source });

      try {
        // Find all cart items with urgency badges (fresh query after morph)
        const badges = document.querySelectorAll("cart-urgency-badge[data-sku]");
        log("Found badges:", badges.length);

        if (badges.length === 0) {
          // Hide any stale badges
          document.querySelectorAll("cart-urgency-badge").forEach(badge => badge.hide());
          return;
        }

        // Log all cart items for debugging
        badges.forEach(badge => {
          const price = parseInt(badge.dataset.itemPrice, 10) || 0;
          const sku = badge.dataset.sku;
          const title = badge.dataset.productTitle;
          log("Cart item:", { sku, title, price });
        });

        // Select the item to show the badge on
        let selectedItem = null;

        if (SHOW_ON_FIRST_ITEM) {
          selectedItem = badges[0];
          log("Using FIRST item:", {
            sku: selectedItem.dataset.sku,
            title: selectedItem.dataset.productTitle,
            price: selectedItem.dataset.itemPrice,
          });
        } else {
          // Find the highest priced item
          let highestPrice = 0;
          badges.forEach(badge => {
            const price = parseInt(badge.dataset.itemPrice, 10) || 0;
            if (price > highestPrice) {
              highestPrice = price;
              selectedItem = badge;
            }
          });

          if (selectedItem) {
            log("Using HIGHEST PRICED item:", {
              sku: selectedItem.dataset.sku,
              title: selectedItem.dataset.productTitle,
              price: highestPrice,
            });
          }
        }

        if (!selectedItem) {
          log("No item found to display badge");
          badges.forEach(badge => badge.hide());
          return;
        }

        const sku = selectedItem.dataset.sku;

        if (!sku) {
          log("No SKU found for selected item");
          return;
        }

        // Fetch social proof data from API (uses cache if available)
        const count = await this._fetchSocialProofData(sku);

        // Re-query badges in case DOM changed during API call
        const currentBadges = document.querySelectorAll("cart-urgency-badge[data-sku]");

        // Update the UI - hide all badges except the selected one (if count meets threshold)
        currentBadges.forEach(badge => {
          // Match by item key or sku to find the correct badge after potential DOM updates
          const isSameItem =
            badge.dataset.itemKey === selectedItem.dataset.itemKey || badge.dataset.sku === selectedItem.dataset.sku;

          if (isSameItem && count > MIN_ITEMS_THRESHOLD) {
            log("Showing badge with count:", count);
            badge.updateCount(count);
            badge.show();
          } else {
            badge.hide();
          }
        });

        if (count <= MIN_ITEMS_THRESHOLD) {
          log("Count below threshold:", { count, threshold: MIN_ITEMS_THRESHOLD });
        }
      } catch (error) {
        console.error("[CartUrgencyBadge] Error processing cart items:", error);
      } finally {
        this._isProcessing = false;
      }
    }

    /**
     * Fetch social proof data from the analytics API (with caching)
     * @param {string} sku - Product SKU
     * @returns {Promise<number>} - Number of items added to cart
     */
    async _fetchSocialProofData(sku) {
      try {
        // Use test product ID if flag is enabled, otherwise use actual SKU
        const productId = USE_TEST_PRODUCT_ID ? TEST_PRODUCT_ID : sku;

        // Check cache first
        if (this._apiCache.has(productId)) {
          const cached = this._apiCache.get(productId);
          log("Using CACHED data:", { productId, count: cached });
          return cached;
        }

        const url = `${API_URL}?pid=${PID}&eventName=add_to_cart&startDate=2daysAgo&productIds=${encodeURIComponent(productId)}`;
        log("Fetching social proof data:", {
          url,
          sku,
          productId,
          usingTestId: USE_TEST_PRODUCT_ID,
        });

        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`API request failed: ${response.status}`);
        }

        const data = await response.json();
        // Parse as integer since API may return string
        const itemsAddedToCart = parseInt(data.value?.[0]?.itemsAddedToCart, 10) || 0;

        log("API Response:", {
          rawData: data,
          valueArray: data.value,
          firstItem: data.value?.[0],
          itemsAddedToCart: itemsAddedToCart,
          sku: sku,
          productId: productId,
          meetsThreshold: itemsAddedToCart > MIN_ITEMS_THRESHOLD,
        });

        // Cache the result for 5 minutes
        this._apiCache.set(productId, itemsAddedToCart);
        setTimeout(() => this._apiCache.delete(productId), 5 * 60 * 1000);

        return itemsAddedToCart;
      } catch (error) {
        console.error("[CartUrgencyBadge] Error fetching social proof data:", error);
        return 0;
      }
    }
  }

  // Singleton instance
  let managerInstance = null;

  /**
   * Initialize the urgency badge manager
   */
  function boot() {
    // Only create one manager instance
    if (managerInstance) {
      log("Manager already initialized, reprocessing...");
      managerInstance._scheduleProcess("reboot");
      return;
    }

    managerInstance = new CartUrgencyManager();
    managerInstance.init();
  }

  // Initialize on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  // Re-initialize on Shopify section loads (theme editor)
  document.addEventListener("shopify:section:load", boot);

  // Expose for debugging
  window.__CartUrgencyBadge__ = {
    CartUrgencyBadge,
    CartUrgencyManager,
    boot,
    getInstance: () => managerInstance,
    reprocess: () => managerInstance?._scheduleProcess("manual"),
  };
})();
