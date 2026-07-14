import { Component } from "@theme/component";

class ProductTitlePrice extends Component {
  constructor() {
    super();
    this.productId = null;
    this.currencySymbol = null;
    this.priceWrapper = null;
    this.variantChangeHandler = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.init();
  }

  updatedCallback() {
    super.updatedCallback();
    // Re-initialize when the component is updated by morph
    this.init();
  }

  init() {
    // Find price wrapper
    this.priceWrapper = this.querySelector("[data-product-price-wrapper]");
    if (!this.priceWrapper) {
      return;
    }

    // Get product ID from data attribute
    const productIdAttr = this.priceWrapper.getAttribute("data-product-id");
    if (productIdAttr) {
      this.productId = parseInt(productIdAttr, 10);
    }

    // Get currency symbol from Liquid-injected JSON script
    const currencyScript = this.querySelector("script[data-currency-symbol]");
    if (currencyScript) {
      try {
        this.currencySymbol = JSON.parse(currencyScript.textContent);
      } catch (error) {
        console.warn("[Product Title Price] Error parsing currency symbol JSON, using fallback:", error);
        // Fallback: try data attribute
        this.currencySymbol = currencyScript.getAttribute("data-currency-symbol") || "$";
      }
    } else {
      // Fallback: try to get from window or use default
      this.currencySymbol = window.Shopify?.currency?.active || "$";
    }

    // Remove existing listener if it exists
    if (this.variantChangeHandler) {
      document.removeEventListener("variant:changed", this.variantChangeHandler);
    }

    // Set up variant change handler
    this.variantChangeHandler = this.handleVariantChange.bind(this);
    document.addEventListener("variant:changed", this.variantChangeHandler);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    // Clean up event listener
    if (this.variantChangeHandler) {
      document.removeEventListener("variant:changed", this.variantChangeHandler);
      this.variantChangeHandler = null;
    }
  }

  /**
   * Format price (in cents) to display format
   * @param {number} priceInCents - Price in cents
   * @returns {{floor: string, sup: string}} - Formatted price object
   */
  formatPrice(priceInCents) {
    const floor = Math.floor(priceInCents / 100);
    const sup = priceInCents % 100;
    return {
      floor: this.currencySymbol + floor,
      sup: String(sup).padStart(2, "0"),
    };
  }

  /**
   * Update price display
   * @param {Object} variant - Variant object with price and compare_at_price
   */
  updatePrice(variant) {
    if (!variant || !this.priceWrapper) {
      return;
    }

    const priceFormatted = this.formatPrice(variant.price);
    const compareAtPriceFormatted =
      variant.compare_at_price > variant.price ? this.formatPrice(variant.compare_at_price) : null;

    // Find or create price elements
    let priceElement = this.priceWrapper.querySelector(".igPrice");
    let comparePriceElement = this.priceWrapper.querySelector(".compareAtPrice");

    // Create price paragraph if it doesn't exist
    if (!priceElement) {
      const priceParagraph = document.createElement("p");
      priceParagraph.className = "text-16-bold priceRange";
      if (compareAtPriceFormatted) {
        priceParagraph.classList.add("text-(--color-brunt-orange)");
      }

      priceElement = document.createElement("span");
      priceElement.className = "igPrice";
      if (this.productId) {
        priceElement.setAttribute("data-product-id", this.productId);
      }

      priceParagraph.appendChild(priceElement);
      this.priceWrapper.innerHTML = "";
      this.priceWrapper.appendChild(priceParagraph);
    }

    // Update price content
    priceElement.innerHTML =
      priceFormatted.floor +
      (priceFormatted.sup !== "00" ? '<sup class="top-[-0.2em]">' + priceFormatted.sup + "</sup>" : "");

    // Update compare at price
    if (compareAtPriceFormatted) {
      if (!comparePriceElement) {
        comparePriceElement = document.createElement("p");
        comparePriceElement.className = "text-(--color-gray-accessible) text-12-regular line-through compareAtPrice";
        this.priceWrapper.appendChild(comparePriceElement);
      }

      let comparePriceSpan = comparePriceElement.querySelector(".igComparePrice");
      if (!comparePriceSpan) {
        comparePriceSpan = document.createElement("span");
        comparePriceSpan.className = "igComparePrice";
        if (this.productId) {
          comparePriceSpan.setAttribute("data-product-id", this.productId);
        }
        comparePriceElement.innerHTML = "";
        comparePriceElement.appendChild(comparePriceSpan);
      }

      comparePriceSpan.innerHTML =
        compareAtPriceFormatted.floor +
        (compareAtPriceFormatted.sup !== "00"
          ? '<sup class="top-[-0.3em]">' + compareAtPriceFormatted.sup + "</sup>"
          : "");
    } else {
      // Remove compare at price if it exists
      if (comparePriceElement) {
        comparePriceElement.remove();
      }
      // Remove sale class from price
      const priceParagraph = priceElement.closest("p");
      if (priceParagraph) {
        priceParagraph.classList.remove("text-(--color-brunt-orange)");
      }
    }
  }

  /**
   * Handle variant change event
   * @param {CustomEvent} event - variant:changed event
   */
  handleVariantChange(event) {
    // Only process if this is for the correct product
    if (this.productId && event.detail.variant && event.detail.variant.product_id !== this.productId) {
      return;
    }

    const variant = event.detail.variant;
    if (variant) {
      this.updatePrice(variant);
    }
  }
}

if (!customElements.get("product-title-price")) {
  customElements.define("product-title-price", ProductTitlePrice);
}
