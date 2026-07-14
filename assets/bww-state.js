// @ts-nocheck
/**
 * BWW State Management Library - Optimized & Enhanced
 * A reactive state management library for Shopify stores
 *
 * @version 1.1.0
 * @author iminiscript
 * @license MIT
 *
 * @example
 * const state = new BWWState({}, {
 *   debug: true,
 *   batchUpdates: true
 * });
 *
 * state.initCartState();
 *
 */

class BWWState {
  /**
   * Creates a new BWWState instance
   * @param {Object} initialState - Initial state object
   * @param {Object} options - Configuration options
   * @param {boolean} options.debug - Enable debug mode
   * @param {boolean} options.batchUpdates - Enable batch updates (default: true)
   *
   * @example
   * const state = new BWWState({
   *   products: [],
   *   cart: null,
   *   user: { loggedIn: false }
   * }, {
   *   debug: process.env.NODE_ENV === 'development',
   *   batchUpdates: true
   * });
   */
  constructor(initialState = {}, options = {}) {
    this.state = {};
    this.watchers = new Map();
    this.computedCache = new Map();
    this.computedDeps = new Map();
    this.bindingMap = new Map();
    this.elementListeners = new Map();
    this.validators = new Map();
    this.persistedKeys = new Set();
    this.persistedStorage = new Map();

    this.scheduledUpdates = new Set();
    this.updateScheduled = false;

    this.debug = options.debug || false;
    this.batchUpdates = options.batchUpdates !== false;

    if (this.debug) {
      this.enableDevTools();
    }

    // Initialize reactive properties
    Object.keys(initialState).forEach(key => {
      this.defineReactive(key, initialState[key]);
    });

    return new Proxy(this, {
      get(target, prop) {
        if (prop in target) {
          return target[prop];
        }
        return target.state[prop];
      },
      set(target, prop, value) {
        if (prop in target && typeof target[prop] !== "function") {
          target[prop] = value;
        } else {
          target.setState(prop, value);
        }
        return true;
      },
    });
  }

  /**
   * Enables developer tools and console logging
   * @private
   */
  enableDevTools() {
    // Store the original setState if not already stored
    if (!this._originalSetState) {
      this._originalSetState = this.setState.bind(this);
    }

    this.setState = (key, value) => {
      const oldValue = this.state[key];
      console.log(`[BWW State] ${key}:`, oldValue, "→", value);
      return this._originalSetState(key, value);
    };

    // Create debug API with access to internal methods
    this.debugAPI = {
      // Internal state management
      invalidateComputedDeps: key => this.invalidateComputedDeps(key),
      notifyWatchers: (key, newValue, oldValue) => this.notifyWatchers(key, newValue, oldValue),
      queueUpdate: (key, value, oldValue) => this.queueUpdate(key, value, oldValue),
      flushUpdates: () => this.flushUpdates(),

      // Internal state inspection
      getWatchers: () => {
        const watchers = {};
        this.watchers.forEach((set, key) => {
          watchers[key] = set.size;
        });
        return watchers;
      },
      getComputedCache: () => Object.fromEntries(this.computedCache),
      getComputedDeps: () => {
        const deps = {};
        this.computedDeps.forEach((depsSet, key) => {
          deps[key] = Array.from(depsSet);
        });
        return deps;
      },
      getPersistedKeys: () => Array.from(this.persistedKeys),
      getBindingMap: () => {
        const bindings = {};
        this.bindingMap.forEach((elements, key) => {
          bindings[key] = elements.size;
        });
        return bindings;
      },

      // Force recompute
      recompute: key => {
        if (this.computedCache.has(key)) {
          this.computedCache.delete(key);
          const value = this[key];
          console.log(`[BWW Debug] Recomputed "${key}":`, value);
          return value;
        } else {
          console.warn(`[BWW Debug] "${key}" is not a computed property`);
        }
      },

      // Get full state snapshot
      snapshot: () => ({
        state: JSON.parse(JSON.stringify(this.state)),
        watchers: this.getWatchers(),
        computed: this.getComputedCache(),
        computedDeps: this.getComputedDeps(),
        persistedKeys: this.getPersistedKeys(),
        bindings: this.getBindingMap(),
      }),

      // Access to full instance (all methods)
      instance: this,
    };

    if (typeof window !== "undefined") {
      window.__BWW_STATE__ = this;
      window.__BWW_STATE_DEBUG__ = this.debugAPI;
      console.log("[BWW State] DevTools enabled.");
      console.log("[BWW State] Access full instance via: window.__BWW_STATE__");
      console.log("[BWW State] Access debug API via: window.__BWW_STATE_DEBUG__");
      console.log("[BWW State] Or use: bww.debugAPI");
    }
  }

  /**
   * Sets debug mode on or off
   * @param {boolean} enabled - Whether to enable debug mode
   *
   * @example
   * // Turn on debug mode
   * bww.setDebug(true);
   *
   * // Turn off debug mode
   * bww.setDebug(false);
   */
  setDebug(enabled) {
    this.debug = Boolean(enabled);

    if (this.debug) {
      this.enableDevTools();
    } else {
      // Restore original setState
      if (this._originalSetState) {
        this.setState = this._originalSetState;
        this._originalSetState = null;
      }

      // Remove debug API
      if (this.debugAPI) {
        delete this.debugAPI;
      }

      if (typeof window !== "undefined") {
        delete window.__BWW_STATE__;
        delete window.__BWW_STATE_DEBUG__;
      }

      console.log("[BWW State] DevTools disabled");
    }
  }

  /**
   * Defines a reactive property on the state
   * @param {string} key - Property name
   * @param {*} value - Initial value
   * @param {Function} validator - Optional validator function
   *
   * @example
   * state.defineReactive('price', 0, (val) => val >= 0);
   * state.defineReactive('email', '', (val) => /\S+@\S+\.\S+/.test(val));
   */
  defineReactive(key, value, validator = null) {
    if (validator) {
      this.validators.set(key, validator);
      if (!validator(value)) {
        console.warn(`[BWW State] Invalid initial value for "${key}"`);
        return;
      }
    }

    this.state[key] = value;

    if (!this.watchers.has(key)) {
      this.watchers.set(key, new Set());
    }

    Object.defineProperty(this, key, {
      get() {
        return this.state[key];
      },
      set(newValue) {
        this.setState(key, newValue);
      },
      enumerable: true,
      configurable: true,
    });
  }

  /**
   * Updates state value with validation and watchers
   * @param {string} key - Property name
   * @param {*} value - New value
   *
   * @example
   * Update cart state (usually done via initCartState() or shopify().updateCart())
   * state.setState('cartState', { items: [], item_count: 0, total_price: 0 });
   *
   * Update other state properties (add any custom state you need)
   * state.setState('user', { name: 'John', email: 'john@example.com' });
   * state.setState('user.name', 'John'); // Use deepSetState for nested
   */
  setState(key, value) {
    // Validate if validator exists
    if (this.validators.has(key)) {
      const validator = this.validators.get(key);
      if (!validator(value)) {
        console.warn(`[BWW State] Validation failed for "${key}"`, value);
        return false;
      }
    }

    const oldValue = this.state[key];

    // Skip if value hasn't changed
    if (oldValue === value) return true;

    // Create reactive property if it doesn't exist
    if (!(key in this.state)) {
      this.defineReactive(key, value);
      return true;
    }

    this.state[key] = value;

    // Persist to storage if needed
    if (this.persistedKeys.has(key)) {
      const storageType = this.persistedStorage?.get(key) || "localStorage";
      this.saveToStorage(key, value, storageType);
    }

    // Update watchers and bindings
    if (this.batchUpdates) {
      this.queueUpdate(key, value, oldValue);
    } else {
      this.notifyWatchers(key, value, oldValue);
      this.invalidateComputedDeps(key);
      this.updateBoundElements(key, value);
    }

    return true;
  }

  /**
   * Queues an update for batch processing
   * @private
   */
  queueUpdate(key, value, oldValue) {
    this.scheduledUpdates.add({ key, value, oldValue });

    if (!this.updateScheduled) {
      this.updateScheduled = true;
      requestAnimationFrame(() => this.flushUpdates());
    }
  }

  /**
   * Flushes all queued updates
   * @private
   */
  flushUpdates() {
    const updates = Array.from(this.scheduledUpdates);
    this.scheduledUpdates.clear();
    this.updateScheduled = false;

    updates.forEach(({ key, value, oldValue }) => {
      this.notifyWatchers(key, value, oldValue);
      this.invalidateComputedDeps(key);
      this.updateBoundElements(key, value);
    });
  }

  /**
   * Sets a nested state value using dot notation
   * @param {string} path - Dot-separated path (e.g., 'user.profile.name')
   * @param {*} value - New value
   *
   * @example
   * state.deepSetState('cart.items.0.quantity', 2);
   * state.deepSetState('user.settings.theme', 'dark');
   */
  deepSetState(path, value) {
    const keys = path.split(".");
    const lastKey = keys.pop();
    const rootKey = keys[0];
    let target = this.state;

    // Navigate to nested object
    for (const key of keys) {
      if (!(key in target) || typeof target[key] !== "object") {
        target[key] = {};
      }
      target = target[key];
    }

    target[lastKey] = value;

    // Notify watchers for root key
    if (rootKey && this.state[rootKey]) {
      this.notifyWatchers(rootKey, this.state[rootKey]);
      this.updateBoundElements(rootKey, this.state[rootKey]);
    }
  }

  /**
   * Gets a nested state value using dot notation
   * @param {string} path - Dot-separated path
   * @returns {*} Value at path or undefined
   *
   * @example
   * const userName = state.deepGetState('user.profile.name');
   * const firstItem = state.deepGetState('cart.items.0');
   */
  deepGetState(path) {
    const keys = path.split(".");
    let target = this.state;

    for (const key of keys) {
      if (target && typeof target === "object" && key in target) {
        target = target[key];
      } else {
        return undefined;
      }
    }

    return target;
  }

  /**
   * Watches for changes to a state property
   * @param {string} key - Property name to watch
   * @param {Function} callback - Callback function (newValue, oldValue)
   * @param {Object} options - Watch options
   * @param {boolean} options.immediate - Call immediately with current value
   * @param {boolean} options.deep - Watch nested properties
   * @returns {Function} Unwatch function
   *
   * @example
   * // Watch cart state (cartState contains full cart object)
   * const unwatch = state.watch('cartState', (newCart, oldCart) => {
   *   const newCount = newCart?.item_count || 0;
   *   const oldCount = oldCart?.item_count || 0;
   *   console.log(`Cart count: ${oldCount} → ${newCount}`);
   * });
   *
   * // Watch with immediate execution
   * state.watch('cartState', (cart) => {
   *   const count = cart?.item_count || 0;
   *   updateCartIcon(count);
   * }, { immediate: true });
   *
   * // Stop watching
   * unwatch();
   */
  watch(key, callback, options = {}) {
    if (!this.watchers.has(key)) {
      this.watchers.set(key, new Set());
    }

    const watcher = {
      callback,
      immediate: options.immediate || false,
      deep: options.deep || false,
    };

    this.watchers.get(key).add(watcher);

    if (watcher.immediate && key in this.state) {
      callback(this.state[key], undefined);
    }

    // Return unwatch function
    return () => {
      if (this.watchers.has(key)) {
        this.watchers.get(key).delete(watcher);
      }
    };
  }

  /**
   * Creates a computed property that auto-updates
   * @param {string} key - Computed property name
   * @param {Function} computeFn - Function to compute value
   *
   * @example
   * state.computed('totalPrice', function() {
   *   return this.cartState?.items?.reduce((sum, item) => {
   *     return sum + (item.price * item.quantity);
   *   }, 0) || 0;
   * });
   *
   * // Access computed value
   * console.log(state.totalPrice);
   *
   * @example
   * state.computed('discountedPrice', function() {
   *   return this.price * (1 - this.discountPercent / 100);
   * });
   */
  computed(key, computeFn) {
    const dependencies = new Set();

    const computedWatcher = () => {
      dependencies.clear();

      const trackingProxy = new Proxy(this.state, {
        get(target, prop) {
          if (prop !== key) {
            dependencies.add(prop);
          }
          return target[prop];
        },
      });

      const context = new Proxy(this, {
        get(target, prop) {
          if (prop === "state" || prop in target.state) {
            return trackingProxy[prop];
          }
          return target[prop];
        },
      });

      try {
        const result = computeFn.call(context);
        this.computedDeps.set(key, new Set(dependencies));
        this.computedCache.set(key, result);
        return result;
      } catch (error) {
        console.error(`[BWW State] Error in computed "${key}":`, error);
        return undefined;
      }
    };

    Object.defineProperty(this, key, {
      get() {
        if (!this.computedCache.has(key)) {
          return computedWatcher();
        }
        return this.computedCache.get(key);
      },
      enumerable: true,
      configurable: true,
    });

    computedWatcher();

    // Watch dependencies
    dependencies.forEach(dep => {
      this.watch(dep, () => {
        this.computedCache.delete(key);
        const newValue = computedWatcher();
        this.notifyWatchers(key, newValue, undefined);
      });
    });
  }

  /**
   * Auto-binds all elements with [bww-model] attribute
   *
   * @example
   * // HTML: <input type="text" bww-model="username">
   * state.bindElements();
   * // Now input is two-way bound to state.username
   */
  bindElements() {
    const elements = document.querySelectorAll("[bww-model]");

    elements.forEach(element => {
      const key = element.getAttribute("bww-model");

      if (!key) return;

      if (!(key in this.state)) {
        this.defineReactive(key, this.getElementValue(element));
      }

      if (!this.bindingMap.has(key)) {
        this.bindingMap.set(key, new Set());
      }
      this.bindingMap.get(key).add(element);

      this.setElementValue(element, this.state[key]);
      this.addElementListeners(element, key);
    });
  }

  /**
   * Binds specific elements to state properties
   * @param {string|Element|NodeList} selector - Element selector or element(s)
   * @param {string} key - State property name
   * @param {Object} options - Binding options
   * @param {*} options.defaultValue - Default value if element has none
   *
   * @example
   * // Bind input to state
   * state.bind('#email-input', 'userEmail');
   *
   * // Bind with default value
   * state.bind('.quantity-input', 'quantity', { defaultValue: 1 });
   *
   * // Bind multiple elements
   * state.bind('.price-display', 'currentPrice');
   */
  bind(selector, key, options = {}) {
    const elements =
      typeof selector === "string"
        ? document.querySelectorAll(selector)
        : selector instanceof NodeList
          ? selector
          : [selector];

    elements.forEach(element => {
      if (!element) return;

      if (!(key in this.state)) {
        const value = options.defaultValue !== undefined ? options.defaultValue : this.getElementValue(element);
        this.defineReactive(key, value);
      }

      if (!this.bindingMap.has(key)) {
        this.bindingMap.set(key, new Set());
      }
      this.bindingMap.get(key).add(element);

      this.setElementValue(element, this.state[key]);
      this.addElementListeners(element, key);
    });
  }

  /**
   * Removes binding from elements
   * @param {string|Element|NodeList} selector - Element selector or element(s)
   * @param {string} key - State property name
   *
   * @example
   * state.unbind('#email-input', 'userEmail');
   * state.unbind('.price-display', 'currentPrice');
   */
  unbind(selector, key) {
    const elements =
      typeof selector === "string"
        ? document.querySelectorAll(selector)
        : selector instanceof NodeList
          ? selector
          : [selector];

    elements.forEach(element => {
      if (!element) return;

      if (this.bindingMap.has(key)) {
        this.bindingMap.get(key).delete(element);
      }

      if (this.elementListeners.has(element)) {
        const listeners = this.elementListeners.get(element);
        listeners.forEach(({ event, handler }) => {
          element.removeEventListener(event, handler);
        });
        this.elementListeners.delete(element);
      }
    });
  }

  /**
   * Notifies all watchers of a property change
   * @private
   */
  notifyWatchers(key, newValue, oldValue) {
    if (this.watchers.has(key)) {
      this.watchers.get(key).forEach(watcher => {
        try {
          watcher.callback(newValue, oldValue);
        } catch (error) {
          console.error(`[BWW State] Error in watcher for "${key}":`, error);
        }
      });
    }
  }

  /**
   * Invalidates computed properties that depend on a key
   * @private
   */
  invalidateComputedDeps(key) {
    this.computedDeps.forEach((deps, computedKey) => {
      if (deps.has(key)) {
        this.computedCache.delete(computedKey);
        const newValue = this[computedKey];

        if (this.watchers.has(computedKey)) {
          this.watchers.get(computedKey).forEach(watcher => {
            try {
              watcher.callback(newValue, undefined);
            } catch (error) {
              console.error(`[BWW State] Error in computed watcher for "${computedKey}":`, error);
            }
          });
        }
      }
    });
  }

  /**
   * Updates all DOM elements bound to a key
   * @private
   */
  updateBoundElements(key, value) {
    if (this.bindingMap.has(key)) {
      this.bindingMap.get(key).forEach(element => {
        if (element && this.getElementValue(element) !== value) {
          this.setElementValue(element, value);
        }
      });
    }
  }

  /**
   * Gets value from a DOM element
   * @private
   */
  getElementValue(element) {
    if (!element) return "";

    switch (element.type) {
      case "checkbox":
        return element.checked;
      case "radio":
        return element.checked ? element.value : "";
      case "number":
      case "range":
        return parseFloat(element.value) || 0;
      default:
        return element.value !== undefined ? element.value : element.textContent;
    }
  }

  /**
   * Sets value on a DOM element
   * @private
   */
  setElementValue(element, value) {
    if (!element) return;

    switch (element.type) {
      case "checkbox":
        element.checked = Boolean(value);
        break;
      case "radio":
        element.checked = element.value === String(value);
        break;
      case "number":
      case "range":
        element.value = value;
        break;
      default:
        if (element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.tagName === "SELECT") {
          element.value = value;
        } else {
          element.textContent = value;
        }
    }
  }

  /**
   * Adds event listeners to an element for state updates
   * @private
   */
  addElementListeners(element, key) {
    if (!element) return;

    // Remove existing listeners if they exist to prevent duplicates
    if (this.elementListeners.has(element)) {
      const existingListeners = this.elementListeners.get(element);
      existingListeners.forEach(({ event, handler }) => {
        element.removeEventListener(event, handler);
      });
    }

    const updateState = () => {
      this.setState(key, this.getElementValue(element));
    };

    const listeners = [];

    switch (element.type) {
      case "checkbox":
      case "radio":
        element.addEventListener("change", updateState);
        listeners.push({ event: "change", handler: updateState });
        break;
      case "range":
        element.addEventListener("input", updateState);
        element.addEventListener("change", updateState);
        listeners.push({ event: "input", handler: updateState });
        listeners.push({ event: "change", handler: updateState });
        break;
      default:
        if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
          element.addEventListener("input", updateState);
          listeners.push({ event: "input", handler: updateState });
        }
        if (element.tagName === "SELECT") {
          element.addEventListener("change", updateState);
          listeners.push({ event: "change", handler: updateState });
        }
    }

    // Store listeners in Map after adding to DOM
    this.elementListeners.set(element, listeners);
  }

  /**
   * Persists a state property to storage
   * @param {string} key - Property name
   * @param {string} storage - Storage type ('localStorage' or 'sessionStorage')
   *
   * @example
   * // Persist to localStorage
   * state.persist('userPreferences');
   *
   * // Persist to sessionStorage
   * state.persist('temporaryCart', 'sessionStorage');
   */
  persist(key, storage = "localStorage") {
    if (typeof window === "undefined" || !window[storage]) {
      console.warn(`[BWW State] ${storage} not available`);
      return;
    }

    // Check if storage access is available (CSP might block it)
    let storageAvailable = false;
    try {
      const testKey = `__bww_test_${Date.now()}`;
      window[storage].setItem(testKey, "test");
      window[storage].removeItem(testKey);
      storageAvailable = true;
    } catch (e) {
      // Storage access blocked (likely CSP)
      if (this.debug) {
        console.warn(`[BWW State] Storage access blocked (CSP or privacy mode):`, e.message);
      }
      return;
    }

    if (!storageAvailable) return;

    // Load from storage if exists
    try {
      const stored = window[storage].getItem(`bww_${key}`);
      if (stored) {
        try {
          const parsedValue = JSON.parse(stored);
          if (!(key in this.state)) {
            this.defineReactive(key, parsedValue);
          } else {
            this.state[key] = parsedValue;
            this.notifyWatchers(key, parsedValue, undefined);
            this.updateBoundElements(key, parsedValue);
          }
        } catch (e) {
          console.warn(`[BWW State] Failed to parse stored value for "${key}"`);
        }
      }
    } catch (e) {
      if (this.debug) {
        console.warn(`[BWW State] Failed to read from ${storage}:`, e.message);
      }
      return;
    }

    this.persistedKeys.add(key);
    this.persistedStorage = this.persistedStorage || new Map();
    this.persistedStorage.set(key, storage);

    // Save current value
    if (key in this.state) {
      this.saveToStorage(key, this.state[key], storage);
    }
  }

  /**
   * Saves a value to storage
   * @private
   */
  saveToStorage(key, value, storage = "localStorage") {
    if (typeof window === "undefined" || !window[storage]) return;

    try {
      window[storage].setItem(`bww_${key}`, JSON.stringify(value));
    } catch (e) {
      // Silently handle CSP or quota errors (don't spam console)
      if (this.debug) {
        console.warn(`[BWW State] Failed to save "${key}" to ${storage}:`, e.message);
      }
    }
  }

  /**
   * Removes persistence for a property
   * @param {string} key - Property name
   * @param {string} storage - Storage type
   *
   * @example
   * state.unpersist('temporaryData');
   */
  unpersist(key, storage = undefined) {
    this.persistedKeys.delete(key);
    if (this.persistedStorage) this.persistedStorage.delete(key);
    if (typeof window !== "undefined") {
      if (storage && window[storage]) {
        window[storage].removeItem(`bww_${key}`);
      } else {
        window.localStorage?.removeItem(`bww_${key}`);
        window.sessionStorage?.removeItem(`bww_${key}`);
      }
    }
  }

  /**
   * Gets cart-related section IDs from the page
   * @private
   * @returns {Set<string>} Set of section IDs
   */
  _getCartSectionIds() {
    const sectionsToUpdate = new Set();

    // Get cart-items-component sections
    const cartItemsComponents = document.querySelectorAll("cart-items-component");
    cartItemsComponents.forEach(item => {
      if (item instanceof HTMLElement && item.dataset.sectionId) {
        sectionsToUpdate.add(item.dataset.sectionId);
      }
    });

    // Get header section (for cart drawer/badge)
    const headerSection = document.querySelector("header-component");
    if (headerSection instanceof HTMLElement && headerSection.dataset.sectionId) {
      sectionsToUpdate.add(headerSection.dataset.sectionId);
    }

    return sectionsToUpdate;
  }

  /**
   * Fetches and morphs cart-related sections
   * Public method to manually trigger cart section re-rendering
   * @param {Array<string>} sectionIds - Optional array of specific section IDs
   * @returns {Promise<void>}
   *
   * @example
   * // Update all cart sections automatically
   * await bww.updateCartSections();
   *
   * // Update specific sections
   * await bww.updateCartSections(['cart-section-id', 'header-section-id']);
   */
  async updateCartSections(sectionIds = null) {
    try {
      // Get section IDs if not provided
      const sectionsToUpdate = sectionIds ? new Set(sectionIds) : this._getCartSectionIds();

      if (sectionsToUpdate.size === 0) {
        return; // No sections to update
      }

      // Try to import morphSection dynamically
      let morphSection;
      try {
        const sectionRenderer = await import("@theme/section-renderer");
        morphSection = sectionRenderer.morphSection;
      } catch (e) {
        // morphSection not available, skip section updates
        if (this.debug) {
          console.warn("[BWW State] morphSection not available, skipping section updates");
        }
        return;
      }

      // Fetch updated sections
      const sectionsUrl = `${window.location.pathname}?sections=${Array.from(sectionsToUpdate).join(",")}`;
      const sectionsResponse = await fetch(sectionsUrl);

      if (!sectionsResponse.ok) {
        throw new Error("Failed to fetch sections");
      }

      const sections = await sectionsResponse.json();

      // Morph each section
      for (const sectionId of sectionsToUpdate) {
        if (sections[sectionId] && morphSection) {
          try {
            morphSection(sectionId, sections[sectionId]);
          } catch (error) {
            if (this.debug) {
              console.warn(`[BWW State] Failed to morph section ${sectionId}:`, error);
            }
          }
        }
      }
    } catch (error) {
      if (this.debug) {
        console.error("[BWW State] Failed to update cart sections:", error);
      }
      // Don't throw - section updates are optional
    }
  }

  /**
   * Returns Shopify-specific helper methods
   * @returns {Object} Shopify methods
   *
   * @example
   * // Add item to cart
   * const shopify = state.shopify();
   * await shopify.addToCart(variantId, 1, { gift_wrap: true });
   *
   * // Update cart
   * await shopify.updateCart();
   *
   * // Change cart item quantity
   * await shopify.changeCartItem(1, 3);
   *
   * // Render section
   * const html = await shopify.renderSection('cart-drawer');
   */
  shopify() {
    const self = this; // Store reference to BWWState instance

    return {
      /**
       * Adds item to Shopify cart
       * @param {number|string} variantId - Product variant ID
       * @param {number} quantity - Quantity to add
       * @param {Object} properties - Line item properties
       */
      addToCart: async (variantId, quantity = 1, properties = {}) => {
        try {
          const response = await fetch("/cart/add.js", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: variantId,
              quantity,
              properties,
            }),
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.description || "Failed to add to cart");
          }

          const data = await response.json();
          await self.shopify().updateCart();
          return data;
        } catch (error) {
          console.error("[BWW State] Cart error:", error);
          throw error;
        }
      },

      /**
       * Fetches and updates cart state
       */
      updateCart: async () => {
        try {
          const response = await fetch("/cart.js");

          if (!response.ok) {
            throw new Error("Failed to fetch cart");
          }

          const data = await response.json();
          // Update cartState (single source of truth)
          self.setState("cartState", data);

          // Update cart sections (morphSection)
          await self.updateCartSections();

          return data;
        } catch (error) {
          console.error("[BWW State] Failed to update cart:", error);
          throw error;
        }
      },

      /**
       * Changes cart item quantity
       * @param {number} line - Line item index (1-based)
       * @param {number} quantity - New quantity (0 to remove)
       */
      changeCartItem: async (line, quantity) => {
        try {
          const response = await fetch("/cart/change.js", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ line, quantity }),
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.description || "Failed to update cart item");
          }

          const data = await response.json();
          // Update cartState (single source of truth)
          self.setState("cartState", data);

          // Update cart sections (morphSection)
          await self.updateCartSections();

          return data;
        } catch (error) {
          console.error("[BWW State] Cart update error:", error);
          throw error;
        }
      },

      /**
       * Renders a Shopify section
       * @param {string} sectionId - Section file name without .liquid
       * @param {Object} params - URL parameters
       */
      renderSection: async (sectionId, params = {}) => {
        try {
          const url = `/sections/${sectionId}?${new URLSearchParams(params)}`;
          const response = await fetch(url);

          if (!response.ok) {
            throw new Error("Failed to render section");
          }

          const html = await response.text();
          setTimeout(() => self.bindElements(), 100);
          return html;
        } catch (error) {
          console.error("[BWW State] Section render error:", error);
          throw error;
        }
      },

      /**
       * Manually re-renders cart-related sections using morphSection
       * Useful when you need to refresh cart UI without updating cart state
       * @param {Array<string>} sectionIds - Optional array of specific section IDs
       * @returns {Promise<void>}
       *
       * @example
       * // Update all cart sections automatically
       * await shopify.updateCartSections();
       *
       * // Update specific sections only
       * await shopify.updateCartSections(['cart-section-id', 'header-section-id']);
       */
      updateCartSections: async (sectionIds = null) => {
        return await self.updateCartSections(sectionIds);
      },
    };
  }

  /**
   * Initializes cart state and sets up automatic synchronization
   * Call this once when initializing the state instance
   *
   * @example
   * const bww = new BWWState({}, { debug: true });
   * bww.initCartState();
   * // Now bww.cartState is available and auto-updates
   */
  initCartState() {
    // Initialize cartState as reactive property if it doesn't exist
    if (!("cartState" in this.state)) {
      this.defineReactive("cartState", null);
    }

    // Persist cartState to sessionStorage for faster load on page reload
    // This loads saved cart state immediately, then we fetch fresh data
    this.persist("cartState", "sessionStorage");

    // Fetch fresh cart data from Shopify (will overwrite persisted data)
    this.shopify()
      .updateCart()
      .catch(error => {
        console.error("[BWW State] Failed to initialize cart state:", error);
        // If fetch fails, use persisted state if available, otherwise empty
        if (!this.state.cartState) {
          this.setState("cartState", {
            items: [],
            item_count: 0,
            total_price: 0,
            original_total_price: 0,
            total_discount: 0,
          });
        }
      });

    // Set up cart event listener for automatic updates
    if (typeof window !== "undefined" && typeof document !== "undefined") {
      const updateCartState = async () => {
        try {
          await this.shopify().updateCart();
        } catch (error) {
          console.error("[BWW State] Failed to sync cart state:", error);
        }
      };

      // Listen to cart:update event (ThemeEvents.cartUpdate)
      document.addEventListener("cart:update", updateCartState);

      // Store cleanup function for potential future use
      this._cartStateCleanup = () => {
        document.removeEventListener("cart:update", updateCartState);
      };
    }
  }

  /**
   * Resets state (specific key or entire state)
   * @param {string} key - Optional key to reset
   *
   * @example
   * // Reset specific property
   * state.reset('cartState'); // Resets cart to null
   * state.reset('user'); // Resets user object
   *
   * // Reset entire state
   * state.reset();
   */
  reset(key) {
    if (key) {
      delete this.state[key];
      this.watchers.delete(key);
      this.bindingMap.delete(key);
      this.validators.delete(key);
      this.persistedKeys.delete(key);
      if (this.persistedStorage) this.persistedStorage.delete(key);

      if (typeof window !== "undefined") {
        window.localStorage?.removeItem(`bww_${key}`);
        window.sessionStorage?.removeItem(`bww_${key}`);
      }
    } else {
      this.state = {};
      this.watchers.clear();
      this.bindingMap.clear();
      this.computedCache.clear();
      this.computedDeps.clear();
      this.validators.clear();
      this.persistedKeys.clear();
      if (this.persistedStorage) this.persistedStorage.clear();
      this.elementListeners.forEach((listeners, element) => {
        listeners.forEach(({ event, handler }) => {
          element.removeEventListener(event, handler);
        });
      });
      this.elementListeners.clear();
    }
  }

  /**
   * Converts state to JSON string
   * @returns {string} JSON representation of state
   *
   * @example
   * console.log(state.toJSON());
   * localStorage.setItem('backup', state.toJSON());
   */
  toJSON() {
    return JSON.stringify(this.state, null, 2);
  }

  /**
   * Adds a validator for a state property
   * @param {string} key - Property name
   * @param {Function} validator - Validation function (returns boolean)
   *
   * @example
   * state.validate('age', (val) => val >= 0 && val <= 120);
   * state.validate('email', (val) => /\S+@\S+\.\S+/.test(val));
   */
  validate(key, validator) {
    this.validators.set(key, validator);
  }

  /**
   * Adds CSS class(es) to element(s)
   * @param {string|Element} selector - Element selector or element
   * @param {string} className - Space-separated class names
   * @returns {BWWState} This instance for chaining
   *
   * @example
   * state.addClass('.button', 'active');
   * state.addClass('#modal', 'show fade');
   */
  addClass(selector, className) {
    const elements = typeof selector === "string" ? document.querySelectorAll(selector) : [selector];

    elements.forEach(el => {
      if (el?.classList) {
        el.classList.add(...className.split(" ").filter(Boolean));
      }
    });
    return this;
  }

  /**
   * Removes CSS class(es) from element(s)
   * @param {string|Element} selector - Element selector or element
   * @param {string} className - Space-separated class names
   * @returns {BWWState} This instance for chaining
   *
   * @example
   * state.removeClass('.button', 'active');
   * state.removeClass('#modal', 'show fade');
   */
  removeClass(selector, className) {
    const elements = typeof selector === "string" ? document.querySelectorAll(selector) : [selector];

    elements.forEach(el => {
      if (el?.classList) {
        el.classList.remove(...className.split(" ").filter(Boolean));
      }
    });
    return this;
  }

  /**
   * Toggles CSS class(es) on element(s)
   * @param {string|Element} selector - Element selector or element
   * @param {string} className - Space-separated class names
   * @returns {BWWState} This instance for chaining
   *
   * @example
   * state.toggleClass('.menu', 'open');
   * state.toggleClass('#sidebar', 'collapsed expanded');
   */
  toggleClass(selector, className) {
    const elements = typeof selector === "string" ? document.querySelectorAll(selector) : [selector];

    elements.forEach(el => {
      if (el?.classList) {
        className
          .split(" ")
          .filter(Boolean)
          .forEach(cls => {
            el.classList.toggle(cls);
          });
      }
    });
    return this;
  }
}

/**
 * Global Events System
 * Provides efficient window-level event handling
 *
 * @example
 * // Resize events with breakpoint detection
 * const unsubscribe = BWWState.globalEvents.onResize((e) => {
 *   console.log('Breakpoint:', e.breakpoint);
 *   console.log('Size:', e.width, 'x', e.height);
 * });
 *
 * @example
 * // Scroll events with direction
 * BWWState.globalEvents.onScroll((e) => {
 *   console.log('Direction:', e.direction);
 *   console.log('At top:', e.isTop);
 *   console.log('At bottom:', e.isBottom);
 * }, { immediate: true });
 *
 * @example
 * // Keyboard shortcuts
 * BWWState.globalEvents.onKeyboard('ctrl+s', (e) => {
 *   console.log('Save shortcut pressed');
 * }, { preventDefault: true });
 *
 * // Cleanup
 * unsubscribe();
 */
BWWState.globalEvents = {
  _handlers: {
    resize: new Set(),
    scroll: new Set(),
    keydown: new Set(),
    keyup: new Set(),
  },
  _initialized: false,
  _scrollTicking: false,
  _resizeTicking: false,
  _lastScrollY: 0,
  _lastScreenWidth: typeof window !== "undefined" ? window.innerWidth : 0,

  /**
   * Initializes global event listeners
   * @private
   */
  _init() {
    if (this._initialized || typeof window === "undefined") return;

    // Resize handler with RAF throttling
    window.addEventListener("resize", () => {
      if (!this._resizeTicking) {
        this._resizeTicking = true;
        requestAnimationFrame(() => {
          const newWidth = window.innerWidth;
          this._handlers.resize.forEach(handler => {
            try {
              handler({
                width: newWidth,
                height: window.innerHeight,
                previousWidth: this._lastScreenWidth,
                breakpoint: this._getBreakpoint(newWidth),
              });
            } catch (error) {
              console.error("[BWW State] Error in resize handler:", error);
            }
          });
          this._lastScreenWidth = newWidth;
          this._resizeTicking = false;
        });
      }
    });

    // Scroll handler with RAF throttling
    window.addEventListener(
      "scroll",
      () => {
        if (!this._scrollTicking) {
          this._scrollTicking = true;
          requestAnimationFrame(() => {
            const currentScrollY = window.scrollY;
            const direction =
              currentScrollY > this._lastScrollY ? "down" : currentScrollY < this._lastScrollY ? "up" : "none";

            this._handlers.scroll.forEach(handler => {
              try {
                handler({
                  scrollY: currentScrollY,
                  scrollX: window.scrollX,
                  direction,
                  previousScrollY: this._lastScrollY,
                  isTop: currentScrollY === 0,
                  isBottom: window.innerHeight + currentScrollY >= document.documentElement.scrollHeight - 1,
                });
              } catch (error) {
                console.error("[BWW State] Error in scroll handler:", error);
              }
            });

            this._lastScrollY = currentScrollY;
            this._scrollTicking = false;
          });
        }
      },
      { passive: true }
    );

    // Keydown handler
    window.addEventListener("keydown", e => {
      this._handlers.keydown.forEach(handler => {
        try {
          handler({
            key: e.key,
            code: e.code,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            altKey: e.altKey,
            metaKey: e.metaKey,
            originalEvent: e,
          });
        } catch (error) {
          console.error("[BWW State] Error in keydown handler:", error);
        }
      });
    });

    // Keyup handler
    window.addEventListener("keyup", e => {
      this._handlers.keyup.forEach(handler => {
        try {
          handler({
            key: e.key,
            code: e.code,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            altKey: e.altKey,
            metaKey: e.metaKey,
            originalEvent: e,
          });
        } catch (error) {
          console.error("[BWW State] Error in keyup handler:", error);
        }
      });
    });

    this._initialized = true;
  },

  /**
   * Gets responsive breakpoint name
   * @private
   */
  _getBreakpoint(width) {
    if (width < 640) return "mobile";
    if (width < 768) return "sm";
    if (width < 1024) return "md";
    if (width < 1280) return "lg";
    return "xl";
  },

  /**
   * Subscribes to window resize events
   * @param {Function} handler - Callback function
   * @returns {Function} Unsubscribe function
   */
  onResize(handler) {
    this._init();
    this._handlers.resize.add(handler);

    // Call immediately with current values
    handler({
      width: window.innerWidth,
      height: window.innerHeight,
      previousWidth: this._lastScreenWidth,
      breakpoint: this._getBreakpoint(window.innerWidth),
    });

    return () => this._handlers.resize.delete(handler);
  },

  /**
   * Subscribes to window scroll events
   * @param {Function} handler - Callback function
   * @param {Object} options - Options
   * @param {boolean} options.immediate - Call handler immediately
   * @returns {Function} Unsubscribe function
   */
  onScroll(handler, options = {}) {
    this._init();
    this._handlers.scroll.add(handler);

    if (options.immediate) {
      handler({
        scrollY: window.scrollY,
        scrollX: window.scrollX,
        direction: "none",
        previousScrollY: this._lastScrollY,
        isTop: window.scrollY === 0,
        isBottom: window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 1,
      });
    }

    return () => this._handlers.scroll.delete(handler);
  },

  /**
   * Subscribes to keyboard events
   * @param {string|Function} shortcut - Keyboard shortcut or handler function
   * @param {Function} handler - Callback function (if shortcut provided)
   * @param {Object} options - Options
   * @param {string} options.event - Event type ('keydown' or 'keyup')
   * @param {boolean} options.preventDefault - Prevent default behavior
   * @returns {Function} Unsubscribe function
   */
  onKeyboard(shortcut, handler, options = {}) {
    this._init();

    const eventType = options.event || "keydown";

    // If shortcut is a function, use it as handler
    if (typeof shortcut === "function") {
      this._handlers[eventType].add(shortcut);
      return () => this._handlers[eventType].delete(shortcut);
    }

    const keys =
      typeof shortcut === "string"
        ? shortcut
            .toLowerCase()
            .split("+")
            .map(k => k.trim())
        : [];

    const wrappedHandler = e => {
      if (typeof shortcut === "string") {
        const modifiers = {
          ctrl: e.ctrlKey || e.metaKey,
          shift: e.shiftKey,
          alt: e.altKey,
          meta: e.metaKey,
        };

        const matchesShortcut = keys.every(key => {
          if (key in modifiers) return modifiers[key];
          return e.key.toLowerCase() === key || e.code.toLowerCase() === key.toLowerCase();
        });

        if (matchesShortcut) {
          if (options.preventDefault) e.originalEvent.preventDefault();
          handler(e);
        }
      } else {
        handler(e);
      }
    };

    this._handlers[eventType].add(wrappedHandler);
    return () => this._handlers[eventType].delete(wrappedHandler);
  },

  /**
   * Clears event handlers
   * @param {string} eventType - Optional event type to clear
   */
  clear(eventType) {
    if (eventType && this._handlers[eventType]) {
      this._handlers[eventType].clear();
    } else {
      Object.keys(this._handlers).forEach(type => {
        this._handlers[type].clear();
      });
    }
  },
};

// Export for module systems
if (typeof module !== "undefined" && module.exports) {
  module.exports = BWWState;
}

// Export for browser
if (typeof window !== "undefined") {
  window.BWWState = BWWState;
}

// Export for ES Modules
export { BWWState };
export default BWWState;
