/**
 * Cart Upsell Component - Minimal JavaScript
 * Handles drawer toggle functionality and image switching on variant selection.
 * Variant-picker and product-form-component handle all variant selection and add-to-cart functionality.
 */

// @ts-nocheck

class CartUpsell {
  /**
   * @param {HTMLElement} container
   */
  constructor(container) {
    this.container = container;
    /** @type {AbortController|null} */
    this.abortController = null;
    /** @type {Map<string, object>} Product data cache keyed by product ID */
    this.productDataCache = new Map();
    this.init();
  }

  init() {
    if (!this.container) {
      return;
    }

    // Create AbortController for managing document-level event listeners
    this.abortController = new AbortController();

    // Remove form attributes from variant inputs immediately
    this.removeFormAttributes();

    // Cache product data for all items
    this.cacheProductData();

    // Attach single delegated event listener for variant image updates
    this.attachVariantImageListener();

    // Attach click listeners to swatches
    this.attachSwatchClickListeners();

    // Variant option input handling is managed by the variant-picker component

    // Attach click listeners to variant slide-down button
    this.attachVariantSlideDownListeners();
  }

  /**
   * Destroy the CartUpsell instance and clean up all event listeners
   */
  destroy() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.productDataCache.clear();
  }

  /**
   * Cache product data for all items in the container
   */
  cacheProductData() {
    const items = this.container.querySelectorAll("[data-product-id]");

    items.forEach((/** @type {HTMLElement} */ item) => {
      const productId = item.dataset.productId;
      if (!productId) {
        return;
      }

      const productDataScript = item.querySelector("[data-product-data]");
      if (productDataScript) {
        try {
          const productData = JSON.parse(productDataScript.textContent);
          if (productData && productData.variants) {
            this.productDataCache.set(productId, productData);
          }
        } catch (e) {
          console.error("[Cart Upsell] Error parsing product data for image switching:", e);
        }
      }
    });
  }

  /**
   * Remove form attribute from variant-picker inputs to prevent auto-submit
   * Following Horizon pattern: https://github.com/Shopify/horizon/blob/main/snippets/quick-add.liquid
   */
  removeFormAttributes() {
    // Remove form attribute from existing inputs
    const inputs = this.container.querySelectorAll('variant-picker input[type="radio"]');

    inputs.forEach((/** @type {HTMLInputElement} */ input) => {
      if (input.hasAttribute("form")) {
        input.removeAttribute("form");
      }
    });
  }

  /**
   * Attach a single delegated event listener for variant image updates
   * Listens for variant:update events and updates the product image from product data JSON
   * Uses AbortController for proper cleanup
   */
  attachVariantImageListener() {
    if (!this.abortController) {
      return;
    }

    // Single delegated listener for all variant:update events
    document.addEventListener(
      "variant:update",
      (/** @type {CustomEvent} */ event) => {
        const eventProductId = event.detail?.data?.productId;
        const variant = event.detail?.resource;

        if (!variant || !variant.id) {
          return;
        }

        // Find the matching item in this container
        const item = eventProductId ? this.container.querySelector(`[data-product-id="${eventProductId}"]`) : null;

        if (!item) {
          return;
        }

        const imageContainer = item.querySelector("[data-product-image-container]");
        if (!imageContainer) {
          return;
        }

        // Get cached product data
        const productData = this.productDataCache.get(eventProductId);
        if (!productData || !productData.variants) {
          return;
        }

        // Find matching variant in product data JSON
        const matchingVariant = productData.variants.find(v => v.id === variant.id);

        if (!matchingVariant) {
          return;
        }

        // Get the selected color (option1) from the variant
        const selectedColor = matchingVariant.option1;

        if (!selectedColor) {
          return;
        }

        // Find variants matching the selected color that have an image
        // Filter out null, undefined, and empty string values
        const colorVariants = productData.variants.filter(
          v => v.option1 === selectedColor && v.image !== null && v.image !== undefined && v.image !== ""
        );

        let variantImageUrl = null;

        // First, try to find a variant with this color that has an image
        if (colorVariants.length > 0) {
          // Use the first variant with an image for this color
          variantImageUrl = colorVariants[0].image;
        } else {
          // If no variant has an image, check if the current variant has featured_image or featured_media
          // (This handles cases where variant data comes from AJAX API with different structure)
          if (matchingVariant.featured_image) {
            // Handle featured_image object (from AJAX API format)
            if (typeof matchingVariant.featured_image === "string") {
              variantImageUrl = matchingVariant.featured_image;
            } else if (matchingVariant.featured_image.src) {
              variantImageUrl = matchingVariant.featured_image.src;
            }
          } else if (matchingVariant.featured_media?.preview_image?.src) {
            variantImageUrl = matchingVariant.featured_media.preview_image.src;
          }
        }

        // Update the image if we have a URL
        if (variantImageUrl) {
          const img = imageContainer.querySelector("img");
          if (img) {
            // Ensure the URL has protocol (some URLs might be protocol-relative)
            const imageUrl = variantImageUrl.startsWith("//") ? `https:${variantImageUrl}` : variantImageUrl;

            // Simply update the src - the image URL already has width parameters
            img.src = imageUrl;
          }
        } else if (productData.featured_image) {
          // Fallback to product featured image if variant has no image
          const img = imageContainer.querySelector("img");
          if (img) {
            const imageUrl = productData.featured_image.startsWith("//")
              ? `https:${productData.featured_image}`
              : productData.featured_image;
            img.src = imageUrl;
          }
        }
      },
      { signal: this.abortController.signal }
    );
  }

  /**
   * Attach click listeners to color swatches
   * Uses event delegation to catch clicks on dynamically added swatches
   */
  attachSwatchClickListeners() {
    // Use event delegation on the container to catch all swatch clicks
    this.container.addEventListener("click", e => {
      // Check if clicked element is a swatch label or input
      const target = e.target;
      const swatchLabel = target.closest(".variant-swatch__label");
      const swatchInput =
        target.closest('input[type="radio"]') ||
        (swatchLabel ? swatchLabel.querySelector('input[type="radio"]') : null);

      if (swatchLabel || swatchInput) {
        const input = swatchInput || swatchLabel?.querySelector('input[type="radio"]');

        if (input) {
          // Find the cart-upsell-item, not the variant-picker
          // The variant-picker also has data-product-id, so we need to find the parent cart-upsell-item
          let productItem = input.closest(".cartUpsell__item");
          // If not found, try to find it by going up from variant-picker
          if (!productItem) {
            const variantPicker = input.closest("variant-picker");
            if (variantPicker) {
              productItem = variantPicker.closest(".cartUpsell__item");
            }
          }
          // Fallback to any element with data-product-id
          if (!productItem) {
            productItem = input.closest("[data-product-id]");
          }

          // Get image URL from data attribute
          const colorImageUrl = input.dataset.colorImage || swatchLabel?.dataset.colorImage;

          if (colorImageUrl && productItem) {
            // Find the image container (it has class upsell-image and data-product-image-container)
            const imageContainer =
              productItem.querySelector("[data-product-image-container]") || productItem.querySelector(".upsell-image");

            if (imageContainer) {
              // Find the picture element and img inside it
              const picture = imageContainer.querySelector("picture");
              const img = imageContainer.querySelector("img") || (picture ? picture.querySelector("img") : null);
              const source = picture ? picture.querySelector("source") : null;

              if (img) {
                // Ensure the URL has protocol (some URLs might be protocol-relative)
                const imageUrl = colorImageUrl.startsWith("//") ? `https:${colorImageUrl}` : colorImageUrl;

                // Update img src
                img.src = imageUrl;

                // Update source srcset if it exists
                if (source) {
                  // Generate srcset with multiple widths
                  const widths = [100, 116, 134, 156, 182, 200];
                  const srcsetParts = widths.map(w => {
                    // Add width parameter to URL
                    const separator = imageUrl.includes("?") ? "&" : "?";
                    return `${imageUrl}${separator}width=${w} ${w}w`;
                  });
                  source.srcset = srcsetParts.join(", ");
                  source.setAttribute("data-srcset", source.srcset);
                }
              }
            }
          }
        }
      }
    });
  }

  /**
   * Attach click listeners to variant slide-down button
   * Handles showing/hiding fieldsets and add-to-cart button
   * One-way method: once shown, stays shown even after DOM morphs
   */
  attachVariantSlideDownListeners() {
    // Track which variant-pickers have been expanded (one-way state)
    const expandedPickers = new WeakSet();
    // Track width classes that should be preserved after DOM morph
    const pickerWidthClasses = new WeakMap();

    /**
     * Show fieldsets and add-to-cart button for a variant-picker
     * @param {HTMLElement} variantPicker - The variant-picker element
     */
    const showVariantOptions = variantPicker => {
      const fieldsetsSelector = "[data-variant-options-fieldsets]";
      const addToCartSelector = "[data-variant-add-to-cart]";
      const buttonSelector = "[data-variant-slide-down-button]";

      // Find target elements within the variant-picker
      const fieldsets = variantPicker.querySelectorAll(fieldsetsSelector);
      const addToCartButton = variantPicker.querySelector(addToCartSelector);
      const button = variantPicker.querySelector(buttonSelector);

      // 1. Hide the entire variant-slide-down div (if it exists)
      if (button) {
        const variantSlideDown = button.closest(".variant-slide-down");
        if (variantSlideDown) {
          variantSlideDown.classList.add("hidden");
          variantSlideDown.setAttribute("aria-hidden", "true");
        }
        button.setAttribute("aria-expanded", "true");
      }

      // 2. Remove hidden class from fieldsets (one-way - never add back)
      fieldsets.forEach((/** @type {HTMLElement} */ fieldset) => {
        fieldset.classList.remove("hidden");
        fieldset.setAttribute("aria-hidden", "false");
      });

      // 3. Remove hidden class from add-to-cart button (one-way - never add back)
      // Also restore width classes that may have been lost during DOM morph
      if (addToCartButton) {
        addToCartButton.classList.remove("hidden");
        addToCartButton.setAttribute("aria-hidden", "false");

        // Restore saved width classes if they exist
        const savedClasses = pickerWidthClasses.get(variantPicker);
        if (savedClasses) {
          savedClasses.forEach(cls => {
            if (!addToCartButton.classList.contains(cls)) {
              addToCartButton.classList.add(cls);
            }
          });
        }
      }

      // Mark this picker as expanded
      expandedPickers.add(variantPicker);
    };

    /**
     * Save width classes from add-to-cart button for a variant-picker
     * @param {HTMLElement} variantPicker - The variant-picker element
     */
    const saveWidthClasses = variantPicker => {
      const addToCartButton = variantPicker.querySelector("[data-variant-add-to-cart]");
      if (addToCartButton) {
        // Save width-related classes (w-*, md:w-*, lg:w-*, etc.)
        const widthClasses = Array.from(addToCartButton.classList).filter(cls =>
          cls.match(/^(w-|md:w-|lg:w-|xl:w-|sm:w-)/)
        );
        if (widthClasses.length > 0) {
          pickerWidthClasses.set(variantPicker, widthClasses);
        }
      }
    };

    // Save initial width classes for all variant-pickers in this container
    const variantPickers = this.container.querySelectorAll("variant-picker");
    variantPickers.forEach(picker => saveWidthClasses(picker));

    // Use event delegation on the container to catch all button clicks
    this.container.addEventListener("click", e => {
      const button = e.target.closest("[data-variant-slide-down-button]");

      if (!button) {
        return;
      }

      // Find the variant-picker that contains this button
      const variantPicker = button.closest("variant-picker");
      if (!variantPicker) {
        return;
      }

      // Save width classes before showing options (in case they haven't been saved yet)
      saveWidthClasses(variantPicker);

      // Show the options (one-way)
      showVariantOptions(variantPicker);
    });

    // Re-apply visibility after DOM morph (variant-picker morphs DOM on variant change)
    // Uses AbortController for proper cleanup
    if (this.abortController) {
      document.addEventListener(
        "variant:update",
        (/** @type {CustomEvent} */ e) => {
          // Check if the event originated from within this container
          const variantPicker = e.target?.closest("variant-picker");
          if (variantPicker && this.container.contains(variantPicker)) {
            // If this picker was previously expanded, keep it visible
            if (expandedPickers.has(variantPicker)) {
              // Small delay to ensure DOM has been morphed
              requestAnimationFrame(() => {
                showVariantOptions(variantPicker);
              });
            }
          }
        },
        { signal: this.abortController.signal }
      );
    }
  }
}

/**
 * Initialize cart upsell components
 * Properly cleans up old instances before creating new ones to prevent memory leaks
 */
function initializeCartUpsell() {
  const containers = document.querySelectorAll("[data-cart-upsell-container]:not([data-initialized])");
  containers.forEach(container => {
    // Destroy existing instance if present (handles re-initialization after cart updates)
    if (container._cartUpsellInstance) {
      container._cartUpsellInstance.destroy();
    }

    container.dataset.initialized = "true";
    const instance = new CartUpsell(container);
    // Store instance reference on container for cleanup
    container._cartUpsellInstance = instance;
  });
}

/**
 * Cleanup all cart upsell instances
 * Useful when the cart drawer is completely removed from DOM
 */
function destroyAllCartUpsell() {
  const containers = document.querySelectorAll("[data-cart-upsell-container][data-initialized]");
  containers.forEach(container => {
    if (container._cartUpsellInstance) {
      container._cartUpsellInstance.destroy();
      container._cartUpsellInstance = null;
    }
    delete container.dataset.initialized;
  });
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  initializeCartUpsell();
});

// Also initialize on dynamic content (cart drawer updates)
document.addEventListener("cart:update", () => {
  initializeCartUpsell();
});
