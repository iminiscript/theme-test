/* gwp.js — class-name agnostic via [data-gwp="..."] hooks
 * Requires Liquid to add:
 *  - data-gwp="indicator" + data-threshold + data-label
 *  - data-gwp="marker" inside each indicator
 *  - data-gwp="segment" + data-start + data-end
 *  - data-gwp="fill" inside each segment
 *  - data-gwp="achievedText", data-gwp="nextText"
 * Wrapper still needs:
 *  - data-component="gwp-progressbar"
 *  - data-thresholds="0,5000,10000,..."
 *  - data-currency, data-cart-total
 *  - (for GWP manager) data-gwp-variant-id, data-gwp-tier, data-gwp-target-threshold
 */

// @ts-nocheck
(() => {
  const DEBUG = true;
  const log = (...a) => {
    if (DEBUG) console.log("[GWP]", ...a);
  };
  const err = (...a) => console.error("[GWP]", ...a);

  // ---------- Progress (role-based) ----------
  class GwpProgress {
    constructor(root) {
      this.root = root;
      this.currency = root.dataset.currency || "$";
      this.thresholds = this._parseThresholds(root.dataset.thresholds || "");
      this.cartPriceType = root.dataset.cartPriceType || "total_price";
      this.lastSeen = {
        value: parseInt(root.dataset.cartTotal || "0", 10) || 0,
        t: Date.now(),
      };
      this._cache(); // cache nodes by roles
      this.paint(this.lastSeen.value);

      BWW.ready(state => {
        const cart = state.state?.cartState || null;
        if (cart) this.safeUpdate(cart);
        state.watch("cartState", c => c && this.safeUpdate(c), { immediate: false });
      });
    }

    _getCartTotal(cart) {
      if (!cart) return 0;
      if (this.cartPriceType === "original_total_price") {
        return typeof cart.original_total_price === "number" ? cart.original_total_price : 0;
      }
      return typeof cart.total_price === "number" ? cart.total_price : 0;
    }

    _cache() {
      const q = name => this.root.querySelector(`[data-gwp="${name}"]`);
      const qa = name => this.root.querySelectorAll(`[data-gwp="${name}"]`);
      this.nodes = {
        indicators: qa("indicator"),
        markers: qa("marker"),
        segments: qa("segment"),
        fills: qa("fill"),
        achieved: q("achievedText"),
        next: q("nextText"),
        remainingAmount: q("remainingAmount"),
        achievedMessage: q("achievedMessage"),
        nextAchievement: q("nextAchievement"),
      };
      // Store initial milestone data from Liquid
      this.achievedLabel = this.root.dataset.achievedLabel || "";
      this.nextThreshold = parseInt(this.root.dataset.nextThreshold || "0", 10) || 0;
      this.nextLabel = this.root.dataset.nextLabel || "";
    }

    _parseThresholds(s) {
      return s
        .split(",")
        .map(v => parseInt(v.trim(), 10))
        .filter(v => !isNaN(v))
        .sort((a, b) => a - b);
    }

    safeUpdate(cart) {
      const now = Date.now();
      const v = this._getCartTotal(cart);
      if (v === 0 && this.lastSeen.value > 0 && now - this.lastSeen.t < 400) {
        log("progress: transient zero ignored");
        return;
      }
      this.lastSeen = { value: v, t: now };
      this.paint(v);
    }

    paint(totalCents) {
      // markers
      this.nodes.indicators.forEach(ind => {
        const t = parseInt(ind.dataset.threshold || "0", 10) || 0;
        const marker = ind.querySelector('[data-gwp="marker"]');
        if (marker) marker.classList.toggle("GWP__marker--checked", totalCents >= t);
      });

      // fills
      const segments = Array.from(this.nodes.segments);
      segments.forEach((seg, index) => {
        const fill = seg.querySelector('[data-gwp="fill"]');
        if (!fill) return;
        const start = parseInt(seg.dataset.thresholdStart || "0", 10) || 0;
        const end = parseInt(seg.dataset.thresholdEnd || "0", 10) || 0;
        let w = 0;
        if (totalCents >= end) w = 100;
        else if (totalCents > start && end > start) {
          w = Math.min(100, ((totalCents - start) * 100) / (end - start));
        }

        // Add 20% boost for first or last segment when progress > 50%
        // const isFirst = index === 0;
        // const isLast = index === segments.length - 1;
        // if ((isFirst || isLast) && w > 50) {
        //   w = w + 20;
        // }

        fill.style.width = w + "%";
      });

      // Update milestones if we've crossed a threshold
      this._updateMilestones(totalCents);

      // Update remaining amount for next milestone
      if (this.nextThreshold > 0 && this.nodes.remainingAmount) {
        const remainCents = this.nextThreshold - totalCents;
        const remainDollars = remainCents / 100;
        // Format: remove .00 if whole number, otherwise show 2 decimals
        const remainFormatted = remainDollars % 1 === 0 ? remainDollars.toString() : remainDollars.toFixed(2);
        this.nodes.remainingAmount.textContent = `${this.currency}${remainFormatted}`;
      }
    }

    _updateMilestones(totalCents) {
      // Recalculate achieved milestone (highest threshold reached)
      let newAchievedLabel = "";
      for (let i = this.thresholds.length - 1; i >= 0; i--) {
        if (totalCents >= this.thresholds[i]) {
          const ind = Array.from(this.nodes.indicators).find(
            x => parseInt(x.dataset.threshold || "0", 10) === this.thresholds[i]
          );
          newAchievedLabel = (ind && ind.dataset.label) || "";
          break;
        }
      }

      // Recalculate next milestone (lowest threshold not yet reached)
      const nextT = this.thresholds.find(t => t > totalCents);
      let newNextThreshold = 0;
      let newNextLabel = "";
      if (nextT) {
        const ind = Array.from(this.nodes.indicators).find(x => parseInt(x.dataset.threshold || "0", 10) === nextT);
        newNextThreshold = nextT;
        newNextLabel = (ind && ind.dataset.label) || "";
      }

      // Only update if changed to avoid flickering
      if (newAchievedLabel !== this.achievedLabel) {
        this.achievedLabel = newAchievedLabel;
        if (this.nodes.achieved) {
          if (newAchievedLabel) {
            this.nodes.achieved.textContent = `You've earned ${newAchievedLabel}`;
            if (this.nodes.achievedMessage && this.nodes.achievedMessage.style.display === "none") {
              this.nodes.achievedMessage.style.display = "";
            }
          } else if (this.nodes.achievedMessage) {
            this.nodes.achievedMessage.style.display = "none";
          }
        }
      }

      if (newNextThreshold !== this.nextThreshold || newNextLabel !== this.nextLabel) {
        this.nextThreshold = newNextThreshold;
        this.nextLabel = newNextLabel;
        if (newNextLabel) {
          // Update the full message if milestone changed
          if (this.nodes.next) {
            const remainCents = newNextThreshold - totalCents;
            const remainDollars = remainCents / 100;
            const remainFormatted = remainDollars % 1 === 0 ? remainDollars.toString() : remainDollars.toFixed(2);
            // Update the entire message structure
            this.nodes.next.innerHTML = `You're <span data-gwp="remainingAmount">${this.currency}${remainFormatted}</span> away from ${newNextLabel}`;
            // Re-cache the remainingAmount node
            this.nodes.remainingAmount = this.root.querySelector('[data-gwp="remainingAmount"]');
          }
          if (this.nodes.nextAchievement && this.nodes.nextAchievement.style.display === "none") {
            this.nodes.nextAchievement.style.display = "";
          }
        } else if (this.nodes.nextAchievement) {
          this.nodes.nextAchievement.style.display = "none";
        }
      }
    }

    static initAll() {
      document.querySelectorAll('[data-component="gwp-progressbar"]').forEach(el => {
        if (!el._gwpProgress) el._gwpProgress = new GwpProgress(el);
      });
    }
  }

  // ---------- GWP Tier Manager (role-agnostic) ----------
  class GwpTierManager {
    // Class-level lock to prevent multiple instances from conflicting
    static _globalLocks = new Map();

    constructor(root) {
      this.root = root;
      this.variantId = GwpTierManager._toInt(root.dataset.gwpVariantId);
      this.tier = GwpTierManager._toInt(root.dataset.gwpTier);
      this.target = GwpTierManager._toInt(root.dataset.gwpTargetThreshold); // cents
      this.cartPriceType = root.dataset.cartPriceType || "total_price";
      this._unwatch = null;
      this._lastState = { meets: null, has: null, qty: null };
      this._lockKey = `tier-${this.tier}-variant-${this.variantId}`;

      if (!this.variantId || !this.tier || !this.target) {
        log("tier: missing attrs, skip", { v: this.variantId, t: this.tier, thr: this.target });
        return;
      }

      // Prevent multiple instances for same tier+variant
      if (GwpTierManager._globalLocks.has(this._lockKey)) {
        console.warn(`⚠️ Duplicate GwpTierManager for ${this._lockKey}, skipping`);
        return;
      }

      GwpTierManager._globalLocks.set(this._lockKey, false);
      this._attach();
    }

    static _toInt(v) {
      const n = parseInt(v, 10);
      return Number.isFinite(n) ? n : 0;
    }

    _isLocked() {
      return GwpTierManager._globalLocks.get(this._lockKey) === true;
    }

    _setLock(locked) {
      GwpTierManager._globalLocks.set(this._lockKey, locked);
    }

    _attach() {
      BWW.ready(state => {
        const cart = state.state?.cartState || BWW.getCart() || null;
        if (cart) this._evaluate(cart);

        this._unwatch = state.watch(
          "cartState",
          c => {
            if (c) this._evaluate(c);
          },
          { immediate: false }
        );

        // Gentle post-init poll for edge cases
        let n = 0,
          max = 4;
        const timer = setInterval(() => {
          const c = BWW.getCart();
          if (c) this._evaluate(c);
          if (++n >= max) clearInterval(timer);
        }, 1000);
      });
    }

    _propIsGwp(props) {
      if (!props) return false;
      if (props._isGWP !== undefined) return ["true", true, 1, "1"].includes(props._isGWP);
      if (Array.isArray(props)) {
        const p = props.find(x => (x?.name || x?.first) === "_isGWP");
        const v = p && (p.value ?? p.last);
        return ["true", true, 1, "1"].includes(v);
      }
      return false;
    }

    _getCartTotal(cart) {
      if (!cart) return 0;
      if (this.cartPriceType === "original_total_price") {
        return typeof cart.original_total_price === "number" ? cart.original_total_price : 0;
      }
      return typeof cart.total_price === "number" ? cart.total_price : 0;
    }

    _findGwp(cart) {
      if (!cart?.items?.length || !this.variantId) return null;
      const idx = cart.items.findIndex(it => it.variant_id === this.variantId && this._propIsGwp(it.properties));
      return idx === -1 ? null : { item: cart.items[idx], line: idx + 1 };
    }

    async _evaluate(cart) {
      // Ignore transient zero carts (Shopify intermediate states)
      if (!cart?.items?.length && this._getCartTotal(cart) === 0) {
        const lastTotal = this._lastState.total || 0;
        if (lastTotal > 0) {
          console.log(`🚀 ~ _evaluate ~ ignoring transient zero cart (last total: ${lastTotal})`);
          return;
        }
      }

      const total = this._getCartTotal(cart);
      const meets = total >= this.target;
      const gwp = this._findGwp(cart);
      const has = !!gwp;
      const qty = gwp?.item?.quantity || 0;

      // console.log(`🚀 ~ _evaluate ~ total:`, total);
      // console.log(`🚀 ~ _evaluate ~ meets:`, meets);
      // console.log(`🚀 ~ _evaluate ~ gwp:`, gwp);
      // console.log(`🚀 ~ _evaluate ~ has:`, has);
      // console.log(`🚀 ~ _evaluate ~ qty:`, qty);

      // If locked, skip silently
      if (this._isLocked()) {
        console.log(`🚀 ~ _evaluate ~ locked by another operation, skipping`);
        return;
      }

      // Prevent infinite loops - skip if state hasn't changed
      if (
        this._lastState.meets === meets &&
        this._lastState.has === has &&
        this._lastState.qty === qty &&
        this._lastState.total === total
      ) {
        console.log(`🚀 ~ _evaluate ~ state unchanged, skipping`);
        return;
      }

      // Update memo before proceeding
      this._lastState = { meets, has, qty, total };

      log("tier: eval", { total, target: this.target, meets, has, line: gwp?.line, qty });

      if (meets && !has) {
        console.log(`🚀 ~ _evaluate ~ meets && !has: true -> calling _add()`);
        return this._add();
      }
      if (!meets && has) {
        console.log(`🚀 ~ _evaluate ~ !meets && has: true -> calling _remove()`);
        return this._remove(gwp);
      }
      if (meets && has && qty !== 1) {
        console.log(`🚀 ~ _evaluate ~ meets && has && qty !== 1: true -> calling _qty()`);
        return this._qty(gwp, 1);
      }
      console.log(`🚀 ~ _evaluate ~ no action needed`);
    }

    async _add() {
      if (this._isLocked()) {
        console.log(`🚀 ~ _add ~ already locked, aborting`);
        return;
      }

      this._setLock(true);

      try {
        const shopify = await BWW.shopify();
        console.log(`🚀 ~ _add ~ adding variant ${this.variantId}`);

        // addToCart internally calls updateCart() which updates sections
        await shopify.addToCart(this.variantId, 1, {
          _isGWP: "true",
          _gwp_tier: String(this.tier),
        });

        // Wait for cart to stabilize
        await new Promise(resolve => setTimeout(resolve, 200));

        console.log(`🚀 ~ _add ~ completed`);
      } catch (e) {
        err("tier: add failed", e);
      } finally {
        this._setLock(false);
      }
    }

    async _remove(gwp) {
      if (this._isLocked()) {
        console.log(`🚀 ~ _remove ~ already locked, aborting`);
        return;
      }

      console.log(`🚀 ~ _remove ~ called with gwp:`, gwp);
      this._setLock(true);

      try {
        const shopify = await BWW.shopify();
        console.log(`🚀 ~ _remove ~ removing line ${gwp.line}`);

        // changeCartItem returns updated cart and calls updateCartSections()
        await shopify.changeCartItem(gwp.line, 0);

        // Wait for cart to stabilize
        await new Promise(resolve => setTimeout(resolve, 200));

        console.log(`🚀 ~ _remove ~ completed`);
      } catch (e) {
        err("tier: remove failed", e);
      } finally {
        this._setLock(false);
      }
    }

    async _qty(gwp, q) {
      if (this._isLocked()) {
        console.log(`🚀 ~ _qty ~ already locked, aborting`);
        return;
      }

      console.log(`🚀 ~ _qty ~ called with gwp:`, gwp, `qty:`, q);
      this._setLock(true);

      try {
        const shopify = await BWW.shopify();
        console.log(`🚀 ~ _qty ~ updating line ${gwp.line} to quantity ${q}`);

        // changeCartItem returns updated cart and calls updateCartSections()
        await shopify.changeCartItem(gwp.line, q);

        // Wait for cart to stabilize
        await new Promise(resolve => setTimeout(resolve, 200));

        console.log(`🚀 ~ _qty ~ completed`);
      } catch (e) {
        err("tier: qty failed", e);
      } finally {
        this._setLock(false);
      }
    }

    static initAll() {
      // Clear any existing locks
      GwpTierManager._globalLocks.clear();

      document.querySelectorAll('[data-component="gwp-progressbar"]').forEach(el => {
        if (!el.dataset.gwpVariantId || !el.dataset.gwpTier || !el.dataset.gwpTargetThreshold) return;
        if (!el._gwpTier) el._gwpTier = new GwpTierManager(el);
      });
    }
  }

  // ---------- Boot ----------
  function boot() {
    GwpProgress.initAll();
    GwpTierManager.initAll();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
  document.addEventListener("shopify:section:load", boot);

  // Optional: expose for debug
  window.__GWP__ = { boot, GwpProgress, GwpTierManager };
})();
