/**
 * @typedef {typeof window & { Swiper: any }} WindowWithSwiper
 */

/**
 * Swiper Carousel Component
 *
 * A generic, reusable carousel component that initializes Swiper with configurations
 * from data attributes or direct config objects. Supports auto-initialization,
 * manual initialization, and proper cleanup.
 *
 * @example
 * <!-- HTML with data-config -->
 * <div class="swiper__carousel" data-config="myCarouselConfig">
 *   <div class="swiper-wrapper">
 *     <div class="swiper-slide">Slide 1</div>
 *   </div>
 * </div>
 *
 * <script>
 *   window.myCarouselConfig = {
 *     slidesPerView: 1,
 *     autoplay: { delay: 5000 },
 *   };
 * </script>
 *
 * @example
 * // Manual initialization with direct config
 * import { CarouselComponent } from './carousel.js';
 * const carousel = new CarouselComponent(element, { slidesPerView: 3 });
 * carousel.init();
 *
 * @example
 * // Using the helper function
 * import { initCarousel } from './carousel.js';
 * const carousel = initCarousel(element, { slidesPerView: 2 });
 */
class CarouselComponent {
  /**
   * @type {any}
   */
  swiper = null;

  /**
   * @type {HTMLElement}
   */
  element;

  /**
   * @type {Object | undefined}
   */
  config;

  /**
   * @type {number}
   */
  swiperLoadRetries = 0;

  /**
   * @type {number}
   */
  maxRetries = 10;

  /**
   * Create a new CarouselComponent instance
   * @param {HTMLElement} element - The swiper container element
   * @param {Object} [config] - Optional Swiper configuration override
   */
  constructor(element, config) {
    if (!element) {
      throw new Error("CarouselComponent requires a valid element");
    }
    this.element = element;
    this.config = config;
  }

  /**
   * Initialize the carousel with retry logic for Swiper loading
   * @returns {any | undefined} Swiper instance
   */
  init() {
    const w = /** @type {WindowWithSwiper} */ (window);

    // Check if Swiper is loaded, with retry logic
    if (!w.Swiper) {
      if (this.swiperLoadRetries < this.maxRetries) {
        this.swiperLoadRetries++;
        setTimeout(() => this.init(), 100);
        return;
      } else {
        console.error(
          "Swiper library failed to load after multiple retries. Please ensure Swiper is included in your theme.",
          this.element
        );
        return;
      }
    }

    // Skip if already initialized
    if (this.element.classList.contains("swiper-initialized")) {
      return this.swiper;
    }

    // Get configuration
    const configObject = this.getConfig();

    if (!configObject) {
      console.warn(
        "No configuration found for carousel. Please set data-config attribute or provide a config object.",
        this.element
      );
      return;
    }

    try {
      // Initialize Swiper
      this.swiper = new w.Swiper(this.element, configObject);

      // Store swiper instance for external access
      if (configObject) {
        configObject.$swiper = this.swiper;
      }

      // Store instance on element for easy access
      this.element._carouselInstance = this;

      return this.swiper;
    } catch (error) {
      console.error("Failed to initialize Swiper carousel:", error, this.element);
      return undefined;
    }
  }

  /**
   * Get configuration from data attribute or constructor
   * @returns {Object | undefined} Swiper configuration
   */
  getConfig() {
    // Use constructor config if provided
    if (this.config) {
      return this.config;
    }

    // Otherwise, look for data-config attribute
    const dataConfigName = this.element.dataset.config;
    if (dataConfigName) {
      const w = /** @type {WindowWithSwiper} */ (window);
      if (dataConfigName in w) {
        return /** @type {any} */ (w)[dataConfigName];
      }
    }

    return undefined;
  }

  /**
   * Update Swiper configuration dynamically
   * @param {Object} newConfig - New configuration to merge
   */
  updateConfig(newConfig) {
    if (!this.swiper) {
      console.warn("Cannot update config: Swiper not initialized");
      return;
    }

    Object.assign(this.swiper.params, newConfig);
    this.swiper.update();
  }

  /**
   * Get the current Swiper instance
   * @returns {any | null} Swiper instance
   */
  getInstance() {
    return this.swiper;
  }

  /**
   * Check if carousel is initialized
   * @returns {boolean}
   */
  isInitialized() {
    return this.swiper !== null && this.element.classList.contains("swiper-initialized");
  }

  /**
   * Destroy the carousel instance and clean up
   * @param {boolean} [deleteInstance=true] - Whether to delete the instance
   * @param {boolean} [cleanStyles=true] - Whether to clean up Swiper styles
   */
  destroy(deleteInstance = true, cleanStyles = true) {
    if (this.swiper) {
      this.swiper.destroy(deleteInstance, cleanStyles);
      this.swiper = null;
    }

    // Clean up instance reference
    if (this.element._carouselInstance) {
      delete this.element._carouselInstance;
    }
  }
}

/**
 * Initialize all carousel instances on the page
 * @param {string} [selector=".swiper__carousel"] - CSS selector for carousel elements
 * @returns {CarouselComponent[]} Array of initialized carousel instances
 */
export function initCarousels(selector = ".swiper__carousel") {
  const carouselElements = document.querySelectorAll(selector);
  const instances = [];

  for (const element of carouselElements) {
    // Skip if already initialized
    if (element.classList.contains("swiper-initialized")) {
      // Return existing instance if available
      if (element._carouselInstance) {
        instances.push(element._carouselInstance);
      }
      continue;
    }

    const carousel = new CarouselComponent(/** @type {HTMLElement} */ (element));
    const swiper = carousel.init();

    if (swiper) {
      instances.push(carousel);
    }
  }

  return instances;
}

/**
 * Initialize a specific carousel element
 * @param {HTMLElement} element - The swiper container element
 * @param {Object} [config] - Optional Swiper configuration
 * @returns {CarouselComponent | null} Carousel instance or null if initialization failed
 */
export function initCarousel(element, config) {
  if (!element) {
    console.warn("initCarousel: No element provided");
    return null;
  }

  // Return existing instance if already initialized
  if (element._carouselInstance && element._carouselInstance.isInitialized()) {
    return element._carouselInstance;
  }

  const carousel = new CarouselComponent(element, config);
  const swiper = carousel.init();

  return swiper ? carousel : null;
}

/**
 * Destroy all carousel instances on the page
 * @param {string} [selector=".swiper__carousel"] - CSS selector for carousel elements
 */
export function destroyCarousels(selector = ".swiper__carousel") {
  const carouselElements = document.querySelectorAll(selector);

  for (const element of carouselElements) {
    if (element._carouselInstance) {
      element._carouselInstance.destroy();
    }
  }
}

/**
 * Get carousel instance from an element
 * @param {HTMLElement} element - The carousel element
 * @returns {CarouselComponent | null} Carousel instance or null
 */
export function getCarouselInstance(element) {
  return element._carouselInstance || null;
}

// Make functions globally available for inline scripts in sections
window.initCarousel = initCarousel;
window.initCarousels = initCarousels;
window.getCarouselInstance = getCarouselInstance;

// Auto-initialize carousels on page load
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => initCarousels());
} else {
  initCarousels();
}

// Handle Shopify theme editor events
document.addEventListener("shopify:section:load", event => {
  // Re-initialize carousels in the loaded section
  const sectionElement = event.target;
  if (sectionElement) {
    const carousels = sectionElement.querySelectorAll(".swiper__carousel");
    carousels.forEach(carousel => {
      if (!carousel.classList.contains("swiper-initialized")) {
        initCarousel(/** @type {HTMLElement} */ (carousel));
      }
    });
  }
});

document.addEventListener("shopify:section:unload", event => {
  // Destroy carousels in the unloaded section
  const sectionElement = event.target;
  if (sectionElement) {
    const carousels = sectionElement.querySelectorAll(".swiper__carousel");
    carousels.forEach(carousel => {
      if (carousel._carouselInstance) {
        carousel._carouselInstance.destroy();
      }
    });
  }
});

/**
 * Carousel Utility Functions
 * These functions provide common carousel functionality that can be reused across sections
 */

/**
 * Update progress bar animation for carousel autoplay
 * @param {any} swiper - Swiper instance
 * @param {number} progress - Progress value (0-1)
 * @param {string} wrapperSelector - Selector for the carousel wrapper element
 * @param {string} paginationSelector - Selector for the pagination container
 * @param {string} progressBarSelector - Selector for the progress bar element
 */
export function updateProgressBar(swiper, progress, wrapperSelector, paginationSelector, progressBarSelector) {
  if (!swiper || !swiper.el) return;

  const wrapper = swiper.el.closest(wrapperSelector);
  if (!wrapper) return;

  const activeBullet = wrapper.querySelector(
    `${paginationSelector} .swiper-pagination-bullet-active ${progressBarSelector}`
  );

  if (activeBullet) {
    const width = (1 - progress) * 100;
    activeBullet.style.width = `${width}%`;
  }
}

/**
 * Attach pagination click handlers for carousel
 * @param {any} swiper - Swiper instance
 * @param {string} paginationSelector - Selector for the pagination container
 */
export function attachPaginationHandlers(swiper, paginationSelector) {
  if (!swiper || !swiper.el) return;

  const paginationEl =
    swiper.el.closest("[data-section-id]")?.querySelector(paginationSelector) ||
    document.querySelector(paginationSelector);

  if (!paginationEl || paginationEl.dataset.handlersAttached) return;

  paginationEl.addEventListener("click", function (e) {
    if (e.target.matches(".swiper-pagination-bullet")) {
      const bullets = Array.from(paginationEl.querySelectorAll(".swiper-pagination-bullet"));
      const index = bullets.indexOf(e.target);
      if (index !== -1) {
        swiper.slideToLoop(index);
      }
    }
  });

  paginationEl.dataset.handlersAttached = "true";
}

/**
 * Update slide placement attributes for carousel animations
 * Used for carousels that need custom positioning based on active slide
 * @param {any} swiper - Swiper instance
 */
export function updateSlideStyles(swiper) {
  if (!swiper || !swiper.slides) return;

  const activeIndex = swiper.activeIndex;

  swiper.slides.forEach((slide, index) => {
    switch (index) {
      case activeIndex - 3:
        slide.dataset.placement = "-3";
        break;
      case activeIndex - 2:
        slide.dataset.placement = "-2";
        break;
      case activeIndex - 1:
        slide.dataset.placement = "-1";
        break;
      case activeIndex:
        slide.dataset.placement = "0";
        break;
      case activeIndex + 1:
        slide.dataset.placement = "1";
        break;
      case activeIndex + 2:
        slide.dataset.placement = "2";
        break;
      case activeIndex + 3:
        slide.dataset.placement = "3";
        break;
      default:
        delete slide.dataset.placement;
    }
  });
}

/**
 * Update navigation button visibility based on carousel position
 * @param {any} swiper - Swiper instance
 * @param {string} prevSelector - Selector for the previous button
 * @param {string} nextSelector - Selector for the next button
 */
export function updateNavigationVisibility(swiper, prevSelector, nextSelector) {
  if (!swiper || !swiper.el) return;

  const wrapper = swiper.el.closest("[data-section-id]") || document;
  const prevButton = wrapper.querySelector(prevSelector);
  const nextButton = wrapper.querySelector(nextSelector);

  if (!prevButton || !nextButton) return;

  // Check if at the beginning
  if (swiper.isBeginning) {
    prevButton.style.opacity = "0";
    prevButton.style.pointerEvents = "none";
  } else {
    prevButton.style.opacity = "1";
    prevButton.style.pointerEvents = "auto";
  }

  // Check if at the end
  if (swiper.isEnd) {
    nextButton.style.opacity = "0";
    nextButton.style.pointerEvents = "none";
  } else {
    nextButton.style.opacity = "1";
    nextButton.style.pointerEvents = "auto";
  }
}

/**
 * Attach keyboard handlers for carousel controls
 * @param {any} swiper - Swiper instance
 * @param {string} controlSelector - Selector for control elements (buttons, pagination, etc.)
 */
export function attachKeyboardHandlers(swiper, controlSelector) {
  if (!swiper || !swiper.el) return;

  const wrapper = swiper.el.closest("[data-section-id]") || document;
  const controls = wrapper.querySelectorAll(controlSelector);

  if (!controls || controls.length === 0) return;

  controls.forEach(control => {
    if (control.dataset.keyboardHandlersAttached) return;

    control.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (control.matches(".swiper-pagination-bullet")) {
          const paginationEl = control.closest(".swiper-pagination");
          if (paginationEl) {
            const bullets = Array.from(paginationEl.querySelectorAll(".swiper-pagination-bullet"));
            const index = bullets.indexOf(control);
            if (index !== -1) {
              if (swiper.params.loop) {
                swiper.slideToLoop(index);
              } else {
                swiper.slideTo(index);
              }
            }
          }
        } else {
          control.click();
        }
      }
    });

    control.dataset.keyboardHandlersAttached = "true";
  });
}

/**
 * Manage aria-live attribute for carousel announcements
 * @param {string} wrapperSelector - Selector for the carousel wrapper element
 * @param {boolean} isRotating - Whether the carousel is currently rotating/autoplaying
 * @param {any} [swiper] - Optional Swiper instance to find wrapper relative to
 */
export function manageAriaLive(wrapperSelector, isRotating, swiper) {
  let wrapper;
  if (swiper && swiper.el) {
    wrapper = swiper.el.closest(wrapperSelector);
  } else {
    wrapper = document.querySelector(wrapperSelector);
  }

  if (!wrapper) return;

  const carouselContainer = wrapper.querySelector(".swiper__carousel, .swiper");
  if (!carouselContainer) return;

  if (isRotating) {
    carouselContainer.setAttribute("aria-live", "off");
  } else {
    carouselContainer.setAttribute("aria-live", "polite");
  }
}

/**
 * Attach pause/resume handlers for carousel autoplay on hover and focus
 * @param {any} swiper - Swiper instance
 * @param {string} wrapperSelector - Selector for the carousel wrapper element
 */
export function attachPauseResumeFocusHandlers(swiper, wrapperSelector) {
  if (!swiper || !swiper.el) return;

  const wrapper = swiper.el.closest(wrapperSelector);
  if (!wrapper || wrapper.dataset.pauseResumeHandlersAttached) return;

  const handlePause = () => {
    if (swiper.autoplay && swiper.autoplay.running) {
      swiper.autoplay.pause();
      manageAriaLive(wrapperSelector, false, swiper);
    }
  };

  const handleResume = () => {
    if (swiper.autoplay && swiper.autoplay.paused) {
      swiper.autoplay.resume();
      manageAriaLive(wrapperSelector, true, swiper);
    }
  };

  wrapper.addEventListener("mouseenter", handlePause);
  wrapper.addEventListener("mouseleave", handleResume);
  wrapper.addEventListener("focusin", handlePause);
  wrapper.addEventListener("focusout", handleResume);

  wrapper.dataset.pauseResumeHandlersAttached = "true";
}

// Make utility functions globally available for inline scripts in sections
window.updateProgressBar = updateProgressBar;
window.attachPaginationHandlers = attachPaginationHandlers;
window.updateSlideStyles = updateSlideStyles;
window.updateNavigationVisibility = updateNavigationVisibility;
window.attachKeyboardHandlers = attachKeyboardHandlers;
window.manageAriaLive = manageAriaLive;
window.attachPauseResumeFocusHandlers = attachPauseResumeFocusHandlers;

// Export the component class for advanced usage
export { CarouselComponent };
