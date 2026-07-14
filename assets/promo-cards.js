/**
 * Promo Cards Component
 *
 * Features:
 * - Swiper.js integration
 * - Autoplay with pause on hover
 * - Custom progress bar pagination
 * - Analytics tracking
 * - Keyboard navigation
 * - Accessibility support
 * - Respects prefers-reduced-motion
 *
 * @requires Swiper v12 (loaded via CDN in theme.liquid)
 */

class PromoCards {
  constructor(element) {
    this.element = element;
    this.sectionId = element.dataset.sectionId;
    this.autoplayEnabled = element.dataset.autoplay === "true";
    this.autoplayInterval = parseInt(element.dataset.autoplayInterval, 10) || 5000;
    this.animationSpeed = parseInt(element.dataset.speed, 10) || 500;
    this.swiper = null;
    this.prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    this.init();
  }

  init() {
    // Check if Swiper is available
    if (typeof window.Swiper === "undefined") {
      console.warn("Swiper is not loaded yet, retrying...");
      setTimeout(() => this.init(), 100);
      return;
    }

    // Don't autoplay if user prefers reduced motion
    const shouldAutoplay = this.autoplayEnabled && !this.prefersReducedMotion;

    // Get scoped selectors for this instance
    const scopedSelector = `[data-section-id="${this.sectionId}"] `;

    // Initialize Swiper
    this.swiper = new window.Swiper(this.element, {
      // Responsive breakpoints
      slidesPerView: 1,
      spaceBetween: 24,
      speed: this.animationSpeed,
      loop: false,
      centeredSlides: true,
      breakpoints: {
        // Mobile & Tablet: Auto-width slides with peek, respects CSS width
        320: {
          slidesPerView: "auto",
          spaceBetween: 24,
          centeredSlides: true,
        },
        // Desktop: 3 slides, centered as a group (no spaceBetween to avoid off-center issue)
        1280: {
          slidesPerView: 3,
          spaceBetween: 0,
          centeredSlides: false,
        },
      },

      // Autoplay
      autoplay: shouldAutoplay
        ? {
            delay: this.autoplayInterval,
            disableOnInteraction: false,
            pauseOnMouseEnter: true,
          }
        : false,

      // Navigation (use CSS selector strings like hero carousel)
      navigation: {
        nextEl: `${scopedSelector}.promo-nav-next`,
        prevEl: `${scopedSelector}.promo-nav-prev`,
      },

      // Pagination (use CSS selector string)
      pagination: {
        el: `${scopedSelector}.promo-pagination`,
        clickable: true,
        dynamicBullets: false,
        renderBullet: (index, className) => {
          return `<button 
            type="button"
            class="${className}"
            aria-label="Go to slide ${index + 1}"
          ></button>`;
        },
      },

      // Accessibility
      a11y: {
        enabled: true,
        prevSlideMessage: "Previous slide",
        nextSlideMessage: "Next slide",
        firstSlideMessage: "This is the first slide",
        lastSlideMessage: "This is the last slide",
        paginationBulletMessage: "Go to slide {{index}}",
      },

      // Keyboard control
      keyboard: {
        enabled: true,
        onlyInViewport: true,
      },

      // Events
      on: {
        init: swiper => this.onInit(swiper),
        slideChange: () => this.onSlideChange(),
        autoplayStart: () => this.handleAutoplayEvent("cards:autoplayStart"),
        autoplayStop: () => this.handleAutoplayEvent("cards:autoplayStop"),
        autoplayPause: () => this.handleAutoplayEvent("cards:autoplayPause"),
        autoplayResume: () => this.handleAutoplayEvent("cards:autoplayResume"),
      },
    });

    // Setup pause control button if reduced motion is preferred
    if (this.prefersReducedMotion && this.autoplayEnabled) {
      console.log("Autoplay disabled due to prefers-reduced-motion setting");
    }

    // Track CTA button clicks
    this.setupCTATracking();
  }

  onInit(swiper) {
    // Use passed swiper instance since this.swiper isn't assigned yet during init event
    const swiperInstance = swiper || this.swiper;

    if (!swiperInstance) return;

    this.updateAriaAttributes();
    this.dispatchEvent("cards:init", {
      sectionId: this.sectionId,
      totalSlides: swiperInstance.slides.length,
    });
  }

  onSlideChange() {
    if (!this.swiper) return;

    this.updateAriaAttributes();

    this.dispatchEvent("cards:slideChange", {
      sectionId: this.sectionId,
      slideIndex: this.swiper.realIndex,
      totalSlides: this.swiper.slides.length,
      slideTitle: this.getActiveSlideTitle(),
    });
  }

  handleAutoplayEvent(eventName) {
    this.dispatchEvent(eventName, {
      sectionId: this.sectionId,
    });
  }

  updateAriaAttributes() {
    if (!this.swiper?.slides) return;

    const activeIndex = this.swiper.realIndex;

    this.swiper.slides.forEach((slide, index) => {
      const isActive = index === activeIndex;
      slide.setAttribute("aria-hidden", !isActive);

      // Update tab index for interactive elements in non-active slides
      slide.querySelectorAll("a, button").forEach(element => {
        element.setAttribute("tabindex", isActive ? "0" : "-1");
      });
    });
  }

  getActiveSlideTitle() {
    const activeSlide = this.swiper?.slides?.[this.swiper.activeIndex];
    return activeSlide?.querySelector(".text-subheading-1")?.textContent.trim() || "";
  }

  setupCTATracking() {
    this.element.querySelectorAll("[data-track]").forEach(button => {
      button.addEventListener("click", () => {
        this.dispatchEvent("cards:ctaClick", {
          sectionId: this.sectionId,
          slideIndex: button.dataset.slideIndex,
          slideTitle: button.dataset.slideTitle,
          trackingId: button.dataset.track || button.dataset.trackId || null,
          url: button.href,
        });
      });
    });
  }

  dispatchEvent(eventName, detail) {
    const event = new CustomEvent(eventName, { detail, bubbles: true });
    this.element.dispatchEvent(event);
    window.dispatchEvent(event); // For global analytics listeners
  }

  destroy() {
    if (this.swiper) {
      this.swiper.destroy(true, true);
      this.swiper = null;
    }
  }
}

// Initialize all promo cards on page
function initPromoCards() {
  document.querySelectorAll(".promo-cards").forEach(element => {
    // Skip if already initialized (Swiper adds this class)
    if (!element.classList.contains("swiper-initialized")) {
      new PromoCards(element);
    }
  });
}

// Initialize on DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPromoCards);
} else {
  initPromoCards();
}

// Re-initialize on Shopify section events (theme editor)
document.addEventListener("shopify:section:load", initPromoCards);
document.addEventListener("shopify:block:select", initPromoCards);

// Example: Listen to promo cards events for analytics
// window.addEventListener('cards:ctaClick', (event) => {
//   console.log('CTA clicked:', event.detail);
//   // Send to analytics service
//   // gtag('event', 'promo_cards_cta_click', event.detail);
// });

export default PromoCards;
