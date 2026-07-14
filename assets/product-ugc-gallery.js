import { Component } from "@theme/component";

class ProductUgcGallery extends Component {
  constructor() {
    super();
    this.blockId = null;
    this.modalId = null;
    this.carouselConfig = null;
    this.carouselSwiper = null;
    this.modalSwiper = null;
    this.clickedSlideIndex = 0;
    this.modalComponent = null;
    this.modalCarousel = null;
    this._swiperCheckInterval = null;
    this._onDocumentClick = null;
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
    // Get block ID from data attribute
    this.blockId = this.dataset.blockId;
    if (!this.blockId) {
      return;
    }

    // Get modal ID
    this.modalId = "ugc-gallery-modal-" + this.blockId;

    // Find carousel element
    const carousel = this.querySelector('[data-config="productUgcGallery"]');
    if (!carousel) {
      return;
    }

    // Find modal component
    this.modalComponent = document.getElementById(this.modalId);
    if (!this.modalComponent) {
      return;
    }

    // Find modal carousel
    this.modalCarousel = document.getElementById("ugc-gallery-main-" + this.blockId);
    if (!this.modalCarousel) {
      return;
    }

    // Get carousel config from JSON script tag
    const configScript = this.querySelector("[data-carousel-config]");
    if (configScript) {
      try {
        this.carouselConfig = JSON.parse(configScript.textContent);
      } catch (e) {
        console.error("[Product UGC Gallery] Error parsing carousel config:", e);
        // Fallback to default config
        this.carouselConfig = {
          slidesPerView: 3.5,
          spaceBetween: 8,
          freeMode: true,
          scrollbar: {
            el: ".productUgcGallery__scrollbar",
            draggable: true,
            hide: false,
          },
          breakpoints: {
            764: {
              slidesPerView: 4,
            },
          },
        };
      }
    } else {
      // Fallback to default config if script tag not found
      this.carouselConfig = {
        slidesPerView: 3.5,
        spaceBetween: 8,
        freeMode: true,
        scrollbar: {
          el: ".productUgcGallery__scrollbar",
          draggable: true,
          hide: false,
        },
        breakpoints: {
          764: {
            slidesPerView: 4,
          },
        },
      };
    }

    // Initialize main carousel if Swiper is available
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

    // Set up modal event listeners
    this.setupModalListeners();

    // Set up click handler for gallery items
    this.setupGalleryItemClickHandler();
  }

  /**
   * Initialize the main carousel
   */
  initCarousel() {
    if (!this.carouselConfig || typeof window.Swiper === "undefined") {
      return;
    }

    const carousel = this.querySelector('[data-config="productUgcGallery"]');
    if (!carousel) {
      return;
    }

    // Destroy existing Swiper if it exists
    if (carousel.swiper) {
      try {
        carousel.swiper.destroy(true, true);
      } catch (e) {
        console.warn("[Product UGC Gallery] Error destroying carousel Swiper:", e);
      }
    }

    // Initialize Swiper
    try {
      this.carouselSwiper = new window.Swiper(carousel, this.carouselConfig);
    } catch (e) {
      console.error("[Product UGC Gallery] Error initializing carousel Swiper:", e);
    }
  }

  /**
   * Set up click handler for gallery item buttons
   */
  setupGalleryItemClickHandler() {
    // Store clicked slide index when button is clicked
    this._onDocumentClick = e => {
      const button = e.target.closest(".product__ugcGalleryItemButton");
      if (button && button.hasAttribute("data-slide-index")) {
        const slideIndex = parseInt(button.getAttribute("data-slide-index"), 10);
        if (!isNaN(slideIndex)) {
          this.clickedSlideIndex = slideIndex;
        }
      }
    };
    document.addEventListener("click", this._onDocumentClick, true);
  }

  /**
   * Set up modal event listeners
   */
  setupModalListeners() {
    if (!this.modalComponent) {
      return;
    }

    // Listen for modal open event
    this.modalComponent.addEventListener("dialog:open", () => {
      this.initModalCarousel();
    });

    // Clean up Swiper when modal closes
    this.modalComponent.addEventListener("dialog:close", () => {
      this.destroyModalCarousel();
    });
  }

  /**
   * Initialize Swiper in modal when modal opens
   */
  initModalCarousel() {
    if (typeof window.Swiper === "undefined") {
      console.warn("[Product UGC Gallery] Swiper not loaded");
      return;
    }

    if (!this.modalCarousel) {
      return;
    }

    // Destroy existing Swiper if it exists
    if (this.modalSwiper) {
      this.modalSwiper.destroy(true, true);
      this.modalSwiper = null;
    }

    // Initialize Swiper in modal
    setTimeout(() => {
      if (!this.modalCarousel) {
        return;
      }

      // Remove swiper-initialized class if it exists
      this.modalCarousel.classList.remove("swiper-initialized");

      // Initialize main Swiper
      try {
        this.modalSwiper = new window.Swiper(this.modalCarousel, {
          slidesPerView: 1.2,
          spaceBetween: 20,
          initialSlide: this.clickedSlideIndex,
          scrollbar: {
            el: ".product__ugcGalleryModalScrollbar",
            draggable: true,
            hide: false,
          },
          breakpoints: {
            768: {
              slidesPerView: 3.2,
            },
          },
        });
      } catch (e) {
        console.error("[Product UGC Gallery] Error initializing modal Swiper:", e);
      }
    }, 100);
  }

  /**
   * Destroy modal Swiper when modal closes
   */
  destroyModalCarousel() {
    if (this.modalSwiper) {
      try {
        this.modalSwiper.destroy(true, true);
        this.modalSwiper = null;
      } catch (e) {
        console.warn("[Product UGC Gallery] Error destroying modal Swiper:", e);
      }
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    // Clear Swiper check interval if it exists
    if (this._swiperCheckInterval) {
      clearInterval(this._swiperCheckInterval);
      this._swiperCheckInterval = null;
    }
    // Remove document click listener
    if (this._onDocumentClick) {
      document.removeEventListener("click", this._onDocumentClick, true);
      this._onDocumentClick = null;
    }
    // Clean up Swipers
    if (this.carouselSwiper) {
      try {
        this.carouselSwiper.destroy(true, true);
      } catch (error) {
        console.warn("[Product UGC Gallery] Error destroying carousel Swiper during cleanup:", error);
      }
    }
    this.destroyModalCarousel();
  }
}

if (!customElements.get("product-ugc-gallery")) {
  customElements.define("product-ugc-gallery", ProductUgcGallery);
}
