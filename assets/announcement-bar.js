import { Component } from "@theme/component";

/**
 * Announcement bar web component with Swiper integration
 */
class AnnouncementBar extends Component {
  /**
   * @type {import('swiper').Swiper | null}
   */
  #swiper = null;

  connectedCallback() {
    super.connectedCallback();
    this.#initSwiper();
    console.log("Announcement bar component registered and connected");
  }

  disconnectedCallback() {
    if (this.#swiper) {
      this.#swiper.destroy(true, true);
      this.#swiper = null;
    }
  }

  /**
   * Initialize Swiper for announcement slides
   */
  #initSwiper() {
    const promoBarSlider = this.querySelector(".announcement-swiper");

    if (!promoBarSlider) {
      console.warn("No swiper container found in announcement bar");
      return;
    }

    // Wait for Swiper to be available
    if (typeof Swiper === "undefined") {
      console.warn("Swiper not loaded yet, retrying...");
      setTimeout(() => this.#initSwiper(), 100);
      return;
    }

    const promoSlides = promoBarSlider.querySelectorAll(".announcement-swiper .swiper-slide");

    if (promoBarSlider) {
      const promoSwiper = new Swiper(promoBarSlider, {
        slidesPerView: 1,
        loop: false,
        spaceBetween: 0,
        autoplay: {
          delay: 4000,
          disableOnInteraction: false,
          pauseOnMouseEnter: true,
        },
        navigation: {
          nextEl: ".announcement__right",
          prevEl: ".announcement__left",
        },
        on: {
          slideChange: function () {
            // Update aria-hidden and tabindex for all slides
            const slides = this.slides;
            const realIndex = this.realIndex; // Get real index in loop mode

            let i = 0; // We still need an index counter
            for (const slide of slides) {
              // Check if this is the currently active slide
              const isActive =
                i === this.activeIndex || (this.isLoop && (i - this.loopedSlides) % promoSlides.length === realIndex);

              if (isActive) {
                slide.setAttribute("aria-hidden", "false");
                const links = slide.querySelectorAll("a");
                links.forEach(link => link.removeAttribute("tabindex"));
              } else {
                slide.setAttribute("aria-hidden", "true");
                const links = slide.querySelectorAll("a");
                links.forEach(link => link.setAttribute("tabindex", "-1"));
              }

              i++; // Increment the counter for each iteration
            }
          },
        },
      });

      this.#swiper = promoSwiper;
      console.log("Announcement bar Swiper initialized successfully");
    }
  }

  /**
   * Get the Swiper instance
   * @returns {import('swiper').Swiper | null}
   */
  get swiper() {
    return this.#swiper;
  }
}

if (!window.customElements.get("announcement-bar")) {
  window.customElements.define("announcement-bar", AnnouncementBar);
}
