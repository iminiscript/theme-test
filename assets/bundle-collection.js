import { Component } from "@theme/component";

// Only define the component if it hasn't been defined yet
if (!customElements.get("bundle-collection-component")) {
  /**
   * Bundle Collection Block
   * Handles interactions for bundle collection product displays
   *
   * A custom element that dispatches events when products are clicked.
   * The parent bundle-showcase component listens for these events and
   * handles the section updates.
   *
   * @extends {Component}
   */
  class BundleCollectionComponent extends Component {
    constructor() {
      super();
      this.productChangedHandler = null;
    }

    connectedCallback() {
      super.connectedCallback();
      // Setup click handler
      this.#setupClickHandler();

      // Set initial active state after a small delay to ensure parent is ready
      // Use requestAnimationFrame to ensure DOM is fully ready
      requestAnimationFrame(() => {
        this.#updateActiveState();
      });

      // Listen for product change events from parent
      this.productChangedHandler = this.#handleProductChanged.bind(this);
      this.addEventListener("bundle:product-changed", this.productChangedHandler);
    }

    disconnectedCallback() {
      super.disconnectedCallback();
      // Clean up event listener
      if (this.productChangedHandler) {
        this.removeEventListener("bundle:product-changed", this.productChangedHandler);
      }
    }

    /**
     * Handle product change event from parent
     * @param {CustomEvent} event - Event with new product handle
     */
    #handleProductChanged(event) {
      const productHandle = event.detail?.productHandle;
      if (productHandle) {
        console.log("[Bundle Collection] Product changed to:", productHandle);
        this.#setActiveProduct(productHandle);
      }
    }

    /**
     * Setup click handler for product selection
     */
    #setupClickHandler() {
      const container = /** @type {HTMLElement | undefined} */ (this.refs?.productsContainer);

      if (!container) {
        console.log("[Bundle Collection] Products container ref not found");
        return;
      }

      container.addEventListener(
        "click",
        /** @param {MouseEvent} event */ event => {
          // Find the closest product div
          const target = /** @type {HTMLElement} */ (event.target);
          const productElement = target.closest("[data-product-handle]");

          if (!productElement) {
            return;
          }

          const productHandle = /** @type {HTMLElement} */ (productElement).dataset.productHandle;

          if (!productHandle) {
            console.warn("[Bundle Collection] No product handle found");
            return;
          }
          // Update active state immediately for better UX
          this.#setActiveProduct(productHandle);

          // Dispatch event for parent component to handle
          this.dispatchProductSelectedEvent(productHandle);
        }
      );
    }

    /**
     * Update active state based on current product in parent section
     */
    #updateActiveState() {
      // Find the parent bundle-showcase component
      const bundleShowcase = /** @type {HTMLElement | null} */ (this.closest("bundle-showcase-component"));
      if (!bundleShowcase) {
        console.warn("[Bundle Collection] Parent bundle-showcase not found");
        return;
      }

      // Get the current product handle from data attribute (set by parent)
      const currentHandle = bundleShowcase.dataset.currentProductHandle;

      console.log("[Bundle Collection] Current product handle from parent:", currentHandle);

      if (currentHandle) {
        this.#setActiveProduct(currentHandle);
      } else {
        console.warn("[Bundle Collection] No current product handle found on parent");
      }
    }

    /**
     * Set active product by handle
     * @param {string} productHandle - The product handle to mark as active
     */
    #setActiveProduct(productHandle) {
      const container = /** @type {HTMLElement | undefined} */ (this.refs?.productsContainer);

      if (!container) {
        console.warn("[Bundle Collection] Products container not found");
        return;
      }

      // Find all product elements
      const productElements = container.querySelectorAll("[data-product-handle]");

      console.log(
        "[Bundle Collection] Setting active product:",
        productHandle,
        "Total products:",
        productElements.length
      );

      let foundActive = false;
      productElements.forEach(el => {
        const element = /** @type {HTMLElement} */ (el);
        const handle = element.dataset.productHandle;
        const isActive = handle === productHandle;

        if (isActive) {
          foundActive = true;
          console.log("[Bundle Collection] Found and activating product:", handle);
        }

        // Update border classes
        if (isActive) {
          element.classList.remove("border-[#E1E1D9]");
          element.classList.add("border-asphalt");
        } else {
          element.classList.remove("border-asphalt");
          element.classList.add("border-[#E1E1D9]");
        }
      });

      if (!foundActive) {
        console.warn("[Bundle Collection] Product handle not found in collection:", productHandle);
      }
    }

    /**
     * Dispatch a custom event to notify parent of product selection
     * @param {string} productHandle - The selected product handle
     */
    dispatchProductSelectedEvent(productHandle) {
      const event = new CustomEvent("bundle:product-selected", {
        detail: { productHandle },
        bubbles: true,
        cancelable: true,
      });

      this.dispatchEvent(event);
      console.log("[Bundle Collection] Dispatched product-selected event:", productHandle);
    }
  }

  // Register the custom element
  customElements.define("bundle-collection-component", BundleCollectionComponent);
}
