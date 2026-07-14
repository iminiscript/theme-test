// Only define the component if it hasn't been defined yet
if (!customElements.get("bundle-atc-component")) {
  class BundleAtcComponent extends HTMLElement {
    connectedCallback() {
      this.button = this.querySelector("[data-bundle-atc-button]");
      if (this.button) {
        this.handleClickBound = this.handleClick.bind(this);
        this.button.addEventListener("click", this.handleClickBound);
      }

      // Get section settings from data attributes
      this.discountPercentage = parseInt(this.dataset.discountPercentage || "10", 10);
      this.bundleImage = this.dataset.bundleImage || "";
      // Use current page URL path as bundle link (e.g., /pages/bundle-builder)
      this.bundleLink = this.dataset.bundleLink || window.location.pathname;
    }

    disconnectedCallback() {
      if (this.button && this.handleClickBound) {
        this.button.removeEventListener("click", this.handleClickBound);
      }
    }

    handleClick() {
      const bundleProperties = this.collectBundleProperties();
      console.log("Bundle Properties:", bundleProperties);
    }

    /**
     * Collects all bundle properties from bundle-showcase components on the page
     * @returns {Object} Bundle properties object matching cart system documentation
     */
    collectBundleProperties() {
      // Get all bundle-showcase components on the page
      const bundleShowcases = document.querySelectorAll("bundle-showcase-component");

      /** @type {string[]} */
      const bundleIds = [];
      /** @type {string[]} */
      const bundleTitles = [];
      let totalRegularPrice = 0;
      let enableSafetyRating = false;

      bundleShowcases.forEach(showcase => {
        // Get selected variant ID
        /** @type {HTMLInputElement | null} */
        const variantInput = showcase.querySelector("[data-variant-id-input]");
        if (variantInput && variantInput.value) {
          bundleIds.push(variantInput.value);
        }

        // Get product title from product-title-price block
        const titleElement = showcase.querySelector(".product__title");
        if (titleElement) {
          bundleTitles.push(titleElement.textContent?.trim() || "");
        }

        // Check if any product has safety rating enabled
        // Cast to HTMLElement to access dataset
        const showcaseElement = /** @type {HTMLElement} */ (showcase);
        // Only enable safety rating if product has it enabled AND country is US
        if (showcaseElement.dataset.enableSafetyRating === "true") {
          const isUS = window.Shopify?.country === "US";
          if (isUS) {
            enableSafetyRating = true;
          }
        }

        // Get variant price from all-variants-data
        const variantsDataScript = showcase.querySelector("[data-all-variants-data]");
        if (variantsDataScript && variantInput) {
          try {
            const variants = JSON.parse(variantsDataScript.textContent || "[]");
            const selectedVariantId = parseInt(variantInput.value, 10);
            const selectedVariant = variants.find((/** @type {{ id: number }} */ v) => v.id === selectedVariantId);
            if (selectedVariant && selectedVariant.price) {
              totalRegularPrice += selectedVariant.price;
            }
          } catch (e) {
            console.warn("[Bundle ATC] Error parsing variants data:", e);
          }
        }
      });

      // Calculate discounted price (using floor to match old Liquid behavior)
      const discountPercentage = this.discountPercentage || 10;
      const discountMultiplier = (100 - discountPercentage) / 100;
      const totalDiscountedPrice = Math.floor(totalRegularPrice * discountMultiplier);

      // Build bundle title from product titles
      const bundleTitle = bundleTitles.join(" + ");

      // Build bundle properties object matching cart system documentation
      // Note: _women_size_selected is already set per-item via product-option-selectors.js
      const bundleProperties = {
        _bundle_type: "kit",
        _bundle_ids: bundleIds.join(","),
        _bundle_title: bundleTitle,
        _bundle_discount_percentage: discountPercentage,
        _bundle_regular_price: totalRegularPrice,
        _bundle_discounted_price: totalDiscountedPrice,
        _bundle_image: this.bundleImage || "",
        _bundle_link: this.bundleLink || window.location.pathname,
        _enable_safety_rating: enableSafetyRating,
      };

      return bundleProperties;
    }
  }

  customElements.define("bundle-atc-component", BundleAtcComponent);
}
