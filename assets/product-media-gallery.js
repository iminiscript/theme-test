import { Component } from "@theme/component";
import { sectionRenderer, normalizeSectionId } from "@theme/section-renderer";
import { initLazyImages } from "@theme/lazyImages";

class ProductMediaGallery extends Component {
  constructor() {
    super();
    this.blockId = null;
    this.productId = null;
    this.sectionId = null;
    this.carouselConfig = null;
    this.carouselSwiper = null;
    this.updateTimeout = null;
    this.isUpdating = false;
    this.variantChangeHandler = null;
    this.productOptions = null;
    this._swiperCheckInterval = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.init();
  }

  updatedCallback() {
    super.updatedCallback();
    // Re-initialize when the component is updated by morph
    // This ensures product ID and other data attributes are refreshed
    // Store old product ID to detect changes
    const oldProductId = this.productId;
    this.init();

    // If product ID changed (e.g., from style selector), reinitialize carousel
    // The DOM should already have the new media, but we need to reinitialize Swiper
    if (oldProductId && this.productId && oldProductId !== this.productId) {
      // Product changed, reinitialize carousel with new media
      if (typeof window.Swiper !== "undefined") {
        setTimeout(() => {
          this.initCarousel();
        }, 50);
      }
    }
  }

  init() {
    // Get block ID from data attribute
    this.blockId = this.dataset.blockId;
    if (!this.blockId) {
      return;
    }

    // Get product ID from data attribute
    const productIdAttr = this.dataset.productId;
    if (productIdAttr) {
      this.productId = parseInt(productIdAttr, 10);
    }

    // Get section ID from data attribute
    this.sectionId = this.dataset.sectionId;
    if (!this.sectionId) {
      // Fallback: try to find parent section
      let element = this;
      let depth = 0;
      while (element && element !== document.body && depth < 20) {
        if (element.classList && element.classList.contains("shopify-section")) {
          const foundId = element.id;
          this.sectionId = foundId.startsWith("shopify-section-") ? foundId.replace("shopify-section-", "") : foundId;
          break;
        }
        element = element.parentElement;
        depth++;
      }
    } else {
      // Normalize section ID (remove 'shopify-section-' prefix if present)
      if (this.sectionId.startsWith("shopify-section-")) {
        this.sectionId = this.sectionId.replace("shopify-section-", "");
      }
    }

    if (!this.sectionId) {
      console.error("[Product Media Gallery] Could not determine section ID");
      return;
    }

    // Get product options from data attribute or script
    const optionsScript = this.querySelector("[data-product-options]");
    if (optionsScript) {
      try {
        this.productOptions = JSON.parse(optionsScript.textContent);
      } catch (e) {
        console.error("[Product Media Gallery] Error parsing product options:", e);
      }
    }

    // Get carousel config from window or use default
    this.carouselConfig = window.productMediaGallery || this.getDefaultCarouselConfig();

    // Initialize carousel if Swiper is available
    if (typeof window.Swiper !== "undefined") {
      this.initCarousel();
    } else {
      // Wait for Swiper to load
      this._swiperCheckInterval = setInterval(() => {
        if (typeof window.Swiper !== "undefined") {
          clearInterval(this._swiperCheckInterval);
          this._swiperCheckInterval = null;
          this.initCarousel();
        }
      }, 100);
    }

    // Set up variant change listener
    this.setupVariantChangeListener();
  }

  /**
   * Get default carousel configuration
   * @returns {Object} - Default Swiper config
   */
  getDefaultCarouselConfig() {
    const enableDesktopCarousel = this.dataset.enableDesktopCarousel === "true";

    return {
      slidesPerView: 1,
      spaceBetween: 0,
      navigation: {
        nextEl: ".productMedia__navigation-next",
        prevEl: ".productMedia__navigation-prev",
      },
      scrollbar: {
        el: ".productMedia__scrollbar",
        draggable: true,
      },
      breakpoints: {
        375: {
          enabled: true,
          slidesPerView: 1,
          spaceBetween: 0,
          navigation: {
            enabled: true,
          },
          scrollbar: {
            enabled: true,
          },
        },
        ...(enableDesktopCarousel
          ? {}
          : {
              1280: {
                enabled: false,
                slidesPerView: "auto",
                navigation: {
                  enabled: false,
                },
                scrollbar: {
                  enabled: false,
                },
              },
            }),
      },
      on: {
        init: function () {},
      },
    };
  }

  /**
   * Initialize the carousel
   */
  initCarousel() {
    if (!this.carouselConfig || typeof window.Swiper === "undefined") {
      return;
    }

    // The component itself is the carousel element (has data-config="productMediaGallery")
    const carousel =
      this.hasAttribute("data-config") && this.getAttribute("data-config") === "productMediaGallery"
        ? this
        : this.querySelector('[data-config="productMediaGallery"]');

    if (!carousel) {
      return;
    }

    // Destroy existing Swiper if it exists
    if (carousel.swiper) {
      try {
        carousel.swiper.destroy(true, true);
      } catch (e) {
        console.warn("[Product Media Gallery] Error destroying Swiper:", e);
      }
    }

    // Initialize Swiper
    try {
      this.carouselSwiper = new window.Swiper(carousel, this.carouselConfig);
    } catch (e) {
      console.error("[Product Media Gallery] Error initializing Swiper:", e);
    }
  }

  /**
   * Set up variant change listener
   */
  setupVariantChangeListener() {
    // Remove existing listener if it exists
    if (this.variantChangeHandler) {
      document.removeEventListener("variant:changed", this.variantChangeHandler);
    }

    // Set up new handler
    this.variantChangeHandler = this.handleVariantChange.bind(this);
    document.addEventListener("variant:changed", this.variantChangeHandler);
  }

  /**
   * Handle variant change event with debouncing
   * @param {CustomEvent} event - variant:changed event
   */
  handleVariantChange(event) {
    // Ensure this is a legitimate variant:changed event with detail
    if (event.type !== "variant:changed" || !event.detail) {
      return;
    }

    // Skip self-update when inside a bundle-showcase context
    // Bundle showcases handle their own section updates via sectionRenderer with the correct product URL
    // If we tried to update here, we'd use window.location.pathname which would fetch the wrong product
    const isInBundleShowcase = this.closest("bundle-showcase-component");
    if (isInBundleShowcase) {
      return;
    }

    // Check if this is for the correct product
    const eventProductId = event.detail?.productId || event.detail?.variant?.product_id;
    const expectedProductIdStr = String(this.productId);

    if (eventProductId) {
      const eventProductIdStr = String(eventProductId);
      if (eventProductIdStr !== expectedProductIdStr) {
        return;
      }
    }

    // Only update images when color option changes
    const changedOptionPosition = event.detail?.changedOptionPosition;

    // If changedOptionPosition is provided, check if it's the color option
    if (changedOptionPosition !== undefined && changedOptionPosition !== null) {
      // Get color option position from product options
      const colorOptionPosition = this.getColorOptionPosition();

      // Only proceed if the changed option is the color option
      if (colorOptionPosition && changedOptionPosition !== String(colorOptionPosition)) {
        return; // Not a color change, skip update
      }
    }
    // If changedOptionPosition is not provided (undefined/null), allow the update
    // This handles cases where variant changes but option position isn't specified

    const variantId = event.detail.variantId;
    const eventSectionId = event.detail.sectionId;

    if (!variantId) {
      return;
    }

    // Debounce: clear existing timeout
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
    }

    // Debounce: set new timeout (100ms)
    this.updateTimeout = setTimeout(() => {
      this.updateMediaGallery(variantId, eventSectionId);
    }, 100);
  }

  /**
   * Get the position of the Color option (if it exists)
   * @returns {number|null} - Color option position or null
   */
  getColorOptionPosition() {
    if (!this.productOptions || !Array.isArray(this.productOptions)) {
      return null;
    }

    for (let i = 0; i < this.productOptions.length; i++) {
      if (!this.productOptions[i].name) {
        continue;
      }
      const optionName = this.productOptions[i].name.toLowerCase();
      if (optionName.includes("color")) {
        return this.productOptions[i].position;
      }
    }
    return null;
  }

  /**
   * Update media gallery using Section Rendering API
   * Replaces inner HTML of the media gallery element
   * @param {number} variantId - Variant ID
   * @param {string} eventSectionId - Section ID from event
   */
  async updateMediaGallery(variantId, eventSectionId) {
    // Prevent concurrent updates
    if (this.isUpdating) {
      return;
    }

    // Use section ID from event, fallback to stored section ID
    const targetSectionId = eventSectionId || this.sectionId;

    if (!targetSectionId) {
      console.error("[Product Media Gallery] No section ID available");
      return;
    }

    // Normalize section ID
    const normalizedSectionId = normalizeSectionId(targetSectionId);

    this.isUpdating = true;

    try {
      // Build Section Rendering API URL
      const url = window.location.pathname + "?variant=" + variantId + "&section_id=" + normalizedSectionId;

      // Fetch updated section HTML using sectionRenderer
      const sectionHTML = await sectionRenderer.getSectionHTML(
        normalizedSectionId,
        false,
        new URL(url, window.location.origin)
      );

      if (!sectionHTML) {
        throw new Error("No section HTML found in response");
      }

      // Parse the section HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(sectionHTML, "text/html");

      // Find the media gallery block in the response
      // The block should be the <product-media-gallery> element with data-block-id
      let updatedBlock = doc.querySelector(`[data-block-id="${this.blockId}"]`);

      if (!updatedBlock) {
        // Try finding by class as fallback
        updatedBlock =
          doc.querySelector('.product__mediaGallery [data-config="productMediaGallery"]') ||
          doc.querySelector('[data-config="productMediaGallery"]');
      }

      if (!updatedBlock) {
        console.error("[Product Media Gallery] Could not find updated block. Block ID:", this.blockId);
        console.error("[Product Media Gallery] Available blocks:", doc.querySelectorAll("[data-block-id]"));
        throw new Error("Could not find updated media gallery block in response");
      }

      // Get the inner HTML of the updated block
      // updatedBlock is the <product-media-gallery> element, so innerHTML contains:
      // - script tag with data-product-options
      // - navigation elements
      // - swiper-wrapper with slides
      // - scrollbar
      const newInnerHTML = updatedBlock.innerHTML;

      if (!newInnerHTML) {
        console.warn("[Product Media Gallery] Updated block has no innerHTML");
        return;
      }

      // Destroy existing Swiper before replacing
      if (this.carouselSwiper) {
        try {
          this.carouselSwiper.destroy(true, true);
          this.carouselSwiper = null;
        } catch (e) {
          console.warn("[Product Media Gallery] Error destroying Swiper:", e);
        }
      }

      // Replace inner HTML (not the whole element)
      // The component itself is the carousel element
      this.innerHTML = newInnerHTML;

      // Reinitialize after update
      this.reinitializeAfterUpdate();
    } catch (error) {
      console.error("[Product Media Gallery] Error updating media gallery:", error);
      console.error("[Product Media Gallery] Error stack:", error.stack);
    } finally {
      this.isUpdating = false;
    }
  }

  /**
   * Reinitialize carousel and lazy images after update
   */
  async reinitializeAfterUpdate() {
    // The component itself is the carousel element
    const carousel = this;

    // Reset lazy image data-loaded attributes for new images
    const newLazyPictures = carousel.querySelectorAll("picture.lazyPicture");
    newLazyPictures.forEach(picture => {
      picture.setAttribute("data-loaded", "false");
    });

    // Reinitialize Swiper
    if (window.Swiper) {
      setTimeout(() => {
        if (!carousel.classList.contains("swiper-initialized")) {
          try {
            this.carouselSwiper = new window.Swiper(carousel, this.carouselConfig);
          } catch (e) {
            console.error("[Product Media Gallery] Error initializing Swiper:", e);
          }
        }
      }, 50);
    }

    // Reinitialize lazy images
    setTimeout(async () => {
      try {
        initLazyImages();
      } catch (err) {
        console.error("[Product Media Gallery] Could not initialize lazy images:", err);
      }
    }, 150);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    // Clean up event listener
    if (this.variantChangeHandler) {
      document.removeEventListener("variant:changed", this.variantChangeHandler);
      this.variantChangeHandler = null;
    }
    // Clean up timeout
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
      this.updateTimeout = null;
    }
    // Clean up Swiper check interval
    if (this._swiperCheckInterval) {
      clearInterval(this._swiperCheckInterval);
      this._swiperCheckInterval = null;
    }
    // Clean up Swiper
    if (this.carouselSwiper) {
      try {
        this.carouselSwiper.destroy(true, true);
      } catch (error) {
        console.warn("[Product Media Gallery] Error destroying Swiper during cleanup:", error);
      }
    }
  }
}

if (!customElements.get("product-media-gallery")) {
  customElements.define("product-media-gallery", ProductMediaGallery);
}
