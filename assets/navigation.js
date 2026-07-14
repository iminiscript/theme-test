import { Component } from "@theme/component";

/**
 * Navigation component - Mobile and Desktop Navigation Handler
 *
 * Manages comprehensive navigation interactions including:
 * - Mobile hamburger menu toggle
 * - Sub-navigation drawers and overlays
 * - Accordion menus
 * - Desktop drawer navigation
 * - Promo bar carousel (Swiper)
 * - Feature callout carousels (Swiper)
 * - Gorgias chat integration
 * - Back navigation
 * - Overlay click-to-close
 *
 * @extends {Component}
 */
/* global GorgiasChat */
class NavigationComponent extends Component {
  constructor() {
    super();
    this.dom = {};
    this.swiperInstances = [];
    this.eventHandlers = [];
  }

  /**
   * Called when component is added to the DOM
   */
  connectedCallback() {
    super.connectedCallback();
    this.#cacheDom();
    this.#bindUIActions();
  }

  /**
   * Called when component is removed from the DOM
   */
  disconnectedCallback() {
    super.disconnectedCallback();
    this.#cleanup();
  }

  /**
   * Cache all DOM elements for navigation
   * @private
   */
  #cacheDom() {
    this.dom.navToggle = this.querySelector(".js-nav__toggle");
    this.dom.navDrawer = this.querySelector(".js-header__navigation");
    this.dom.navTriggers = this.querySelectorAll(".js-subNavTrigger");
    this.dom.navBack = this.querySelectorAll(".js-collapsible-back");
    this.dom.navAccordions = this.querySelectorAll(".js-menuAccordion");
    this.dom.navCarousel = this.querySelectorAll(".js-navFeature");
    this.dom.desktopNavTriggers = this.querySelectorAll(".sidebarMenu__mainTrigger");
    this.dom.overlay = this.querySelector(".sidebarMenu__drawerOverlay");
    this.dom.drawerTriggers = this.querySelectorAll(".sidebarMenu__drawerTrigger");
    this.dom.closeNavBtn = this.querySelector(".header__closeNav");
    this.dom.triggerGorgiasChat = this.querySelector(".js-sidebarMenu__contactTopItem--chat");
    this.dom.promoBarSlider = document.querySelector(".js-promoBar__carousel");
    this.dom.promoSlides = document.querySelectorAll(".announcement__bar");
  }

  /**
   * Bind all UI event handlers
   * @private
   */
  #bindUIActions() {
    // Gorgias chat trigger
    if (this.dom.triggerGorgiasChat) {
      const chatHandler = () => this.#handleGorgiasChat();
      this.dom.triggerGorgiasChat.addEventListener("click", chatHandler);
      this.eventHandlers.push({ element: this.dom.triggerGorgiasChat, event: "click", handler: chatHandler });
    }

    // Mobile hamburger toggle
    if (this.dom.navToggle) {
      const toggleHandler = () => this.#toggleMobileNav();
      this.dom.navToggle.addEventListener("click", toggleHandler);
      this.eventHandlers.push({ element: this.dom.navToggle, event: "click", handler: toggleHandler });
    }

    // Sub-navigation triggers (click)
    this.dom.navTriggers.forEach(trigger => {
      const clickHandler = () => this.#handleNavTriggerClick(trigger);
      trigger.addEventListener("click", clickHandler);
      this.eventHandlers.push({ element: trigger, event: "click", handler: clickHandler });

      // Desktop hover behavior
      if (window.innerWidth > 1280) {
        const hoverHandler = () => this.#handleNavTriggerHover(trigger);
        trigger.addEventListener("mouseover", hoverHandler);
        this.eventHandlers.push({ element: trigger, event: "mouseover", handler: hoverHandler });
      }
    });

    // Back navigation buttons
    this.dom.navBack.forEach(back => {
      const backHandler = () => this.#handleNavBack(back);
      back.addEventListener("click", backHandler);
      this.eventHandlers.push({ element: back, event: "click", handler: backHandler });
    });

    // Accordion menus
    this.dom.navAccordions.forEach(accordion => {
      const accordionHandler = () => this.#handleAccordion(accordion);
      accordion.addEventListener("click", accordionHandler);
      this.eventHandlers.push({ element: accordion, event: "click", handler: accordionHandler });
    });

    // Desktop drawer triggers
    this.dom.desktopNavTriggers.forEach(trigger => {
      if (window.innerWidth > 1280) {
        const desktopHandler = e => this.#handleDesktopDrawer(trigger, e);
        trigger.addEventListener("click", desktopHandler);
        this.eventHandlers.push({ element: trigger, event: "click", handler: desktopHandler });
      }
    });

    // Drawer triggers
    this.dom.drawerTriggers.forEach(drawerTrigger => {
      const drawerHandler = e => this.#handleDrawerTrigger(drawerTrigger, e);
      drawerTrigger.addEventListener("click", drawerHandler);
      this.eventHandlers.push({ element: drawerTrigger, event: "click", handler: drawerHandler });
    });

    // Overlay click to close
    if (this.dom.overlay) {
      const overlayHandler = () => this.#closeDrawers();
      this.dom.overlay.addEventListener("click", overlayHandler);
      this.eventHandlers.push({ element: this.dom.overlay, event: "click", handler: overlayHandler });
    }

    // Close button
    if (this.dom.closeNavBtn) {
      const closeHandler = () => this.#closeDrawers();
      this.dom.closeNavBtn.addEventListener("click", closeHandler);
      this.eventHandlers.push({ element: this.dom.closeNavBtn, event: "click", handler: closeHandler });
    }

    // Initialize carousels
    this.#initFeatureCarousels();

    // Initialize promo bar carousel if multiple slides
    if (this.dom.promoSlides.length > 1) {
      this.#initPromoBarCarousel();
    }
  }

  /**
   * Handle Gorgias chat trigger
   * @private
   */
  #handleGorgiasChat() {
    if (window.innerWidth < 1024) {
      // Mobile: Close navigation drawer
      const hamburger = this.dom.navToggle?.querySelector(".icon--menu");
      const close = this.dom.navToggle?.querySelector(".icon--menuClose");
      if (hamburger) hamburger.style.display = "block";
      if (close) close.style.display = "none";
      if (this.dom.navDrawer?.getAttribute("aria-hidden") === "false") {
        this.dom.navDrawer.setAttribute("aria-hidden", "true");
        document.body.classList.remove("drawer-open", "menu--open");
      }
    } else {
      // Desktop: Close drawers
      this.#closeDrawers();
    }

    // Open Gorgias chat
    if (typeof GorgiasChat !== "undefined") {
      GorgiasChat.open();
      GorgiasChat.hidePoweredBy(true);
      const gorgiasClose = document.getElementById("gorgiasClose");
      if (gorgiasClose && window.innerWidth > 992) {
        gorgiasClose.classList.remove("hide");
      }
    }
  }

  /**
   * Toggle mobile navigation drawer
   * @private
   */
  #toggleMobileNav() {
    const hamburger = this.dom.navToggle?.querySelector(".icon--menu");
    const close = this.dom.navToggle?.querySelector(".icon--menuClose");

    if (!hamburger || !close || !this.dom.navDrawer) return;

    if (hamburger.style.display !== "none") {
      hamburger.style.display = "none";
      close.style.display = "block";
      if (this.dom.navDrawer.getAttribute("aria-hidden") === "true") {
        this.dom.navDrawer.setAttribute("aria-hidden", "false");
        document.body.classList.add("drawer-open", "menu--open");
      }
    } else {
      hamburger.style.display = "block";
      close.style.display = "none";
      if (this.dom.navDrawer.getAttribute("aria-hidden") === "false") {
        this.dom.navDrawer.setAttribute("aria-hidden", "true");
        document.body.classList.remove("drawer-open", "menu--open");
      }
    }
  }

  /**
   * Handle navigation trigger click
   * @param {HTMLElement} trigger - The trigger element
   * @private
   */
  #handleNavTriggerClick(trigger) {
    if (trigger.dataset.navChild === "false") return;
    const subMenu = trigger.nextElementSibling;
    if (subMenu) {
      subMenu.classList.add("is--active");
    }
  }

  /**
   * Handle navigation trigger hover (desktop only)
   * @param {HTMLElement} trigger - The trigger element
   * @private
   */
  #handleNavTriggerHover(trigger) {
    // Set all other triggers as inactive
    this.dom.navTriggers.forEach(t => {
      if (trigger.dataset.navChild === "true") {
        t.classList.add("is--inactive");
      } else {
        t.classList.remove("is--inactive");
      }
    });
    trigger.classList.remove("is--inactive");

    // Close other open submenus
    const openSubMenus = this.querySelectorAll(".sidebarMenu__subMenu.is--active");
    openSubMenus.forEach(openSubMenu => {
      if (openSubMenu !== trigger.nextElementSibling) {
        openSubMenu.classList.remove("is--active");
      }
    });

    if (trigger.dataset.navChild === "false") return;
    const subMenu = trigger.nextElementSibling;
    if (subMenu) {
      subMenu.classList.add("is--active");
    }
  }

  /**
   * Handle back navigation
   * @param {HTMLElement} back - The back button element
   * @private
   */
  #handleNavBack(back) {
    const subMenu = back.closest(".is--active");
    if (subMenu) {
      subMenu.classList.remove("is--active");
    }
  }

  /**
   * Handle accordion menu toggle
   * @param {HTMLElement} accordion - The accordion element
   * @private
   */
  #handleAccordion(accordion) {
    const content = accordion.nextElementSibling;
    if (!content) return;

    if (accordion.classList.contains("isExpanded")) {
      // Collapse
      accordion.classList.remove("isExpanded");
      content.style.height = "0px";
      content.classList.remove("isOpen");
    } else {
      // Collapse any other expanded accordion
      const expanded = this.querySelector(".js-menuAccordion.isExpanded");
      if (expanded && expanded !== accordion) {
        expanded.classList.remove("isExpanded");
        const expandedContent = expanded.nextElementSibling;
        if (expandedContent) {
          expandedContent.style.height = "0px";
          expandedContent.classList.remove("isOpen");
        }
      }

      // Expand current accordion
      accordion.classList.add("isExpanded");
      content.classList.add("isOpen");
      content.style.height = content.scrollHeight + "px";
    }
  }

  /**
   * Handle desktop drawer trigger
   * @param {HTMLElement} trigger - The trigger element
   * @param {Event} e - The click event
   * @private
   */
  #handleDesktopDrawer(trigger, e) {
    const contactMenu = document.querySelector(".sidebarMenu__contact");
    const openDrawers = document.querySelectorAll(".sidebarMenu__drawerWrapper.is--active");

    // Close other open drawers
    openDrawers.forEach(openDrawer => {
      if (openDrawer !== e.target.closest(".sidebarMenu__drawerWrapper")) {
        openDrawer.classList.remove("is--active");
      }
    });

    const drawer = e.target.nextElementSibling;
    if (drawer && !drawer.classList.contains("is--active")) {
      document.body.style.overflow = "hidden";
      drawer.classList.add("is--active");

      this.dom.drawerTriggers.forEach(drawerTrigger => {
        drawerTrigger.classList.add("is--visible");
        if (drawerTrigger.dataset.trigger === trigger.dataset.trigger) {
          drawerTrigger.classList.add("is--active");
        } else {
          drawerTrigger.classList.remove("is--active");
        }
      });

      // Move contact menu to drawer
      if (contactMenu) {
        const desktopDrawer = drawer.querySelector(".sidebarMenu__subNavWrapper");
        if (desktopDrawer) {
          desktopDrawer.appendChild(contactMenu);
        }
      }

      if (this.dom.overlay) {
        this.dom.overlay.classList.add("is--active");
      }
    }

    if (this.dom.closeNavBtn && !this.dom.closeNavBtn.classList.contains("is--visible")) {
      this.dom.closeNavBtn.classList.add("is--visible");
    }
  }

  /**
   * Handle drawer trigger click
   * @param {HTMLElement} drawerTrigger - The drawer trigger element
   * @param {Event} e - The click event
   * @private
   */
  #handleDrawerTrigger(drawerTrigger, e) {
    // Reset inactive states
    this.dom.navTriggers.forEach(t => {
      t.classList.remove("is--inactive");
    });

    const contactMenu = document.querySelector(".sidebarMenu__contact");
    const openDrawers = document.querySelectorAll(".sidebarMenu__drawerWrapper.is--active");

    // Close other open drawers
    openDrawers.forEach(openDrawer => {
      if (openDrawer !== e.target.closest(".sidebarMenu__drawerWrapper")) {
        openDrawer.classList.remove("is--active");
      }
    });

    const drawer = e.target.parentElement;
    if (drawer && !drawer.classList.contains("is--active")) {
      drawer.classList.add("is--active");

      // Move contact menu to drawer
      if (contactMenu) {
        const desktopDrawer = drawer.querySelector(".sidebarMenu__subNavWrapper");
        if (desktopDrawer) {
          desktopDrawer.appendChild(contactMenu);
        }
      }

      this.dom.drawerTriggers.forEach(trigger => trigger.classList.remove("is--active"));
      drawerTrigger.classList.add("is--active");

      if (this.dom.overlay) {
        this.dom.overlay.classList.add("is--active");
      }
      document.body.style.overflow = "hidden";
    }
  }

  /**
   * Close all drawers and reset states
   * @private
   */
  #closeDrawers() {
    const drawers = document.querySelectorAll(".sidebarMenu__drawerWrapper.is--active");
    drawers.forEach(drawer => {
      drawer.classList.remove("is--active");
    });

    this.dom.drawerTriggers.forEach(trigger => {
      trigger.classList.remove("is--active");
      trigger.classList.remove("is--visible");
    });

    const openSubMenus = this.querySelectorAll(".sidebarMenu__subMenu.is--active");
    openSubMenus.forEach(openSubMenu => {
      openSubMenu.classList.remove("is--active");
    });

    this.dom.navTriggers.forEach(trigger => trigger.classList.remove("is--inactive"));

    if (this.dom.closeNavBtn?.classList.contains("is--visible")) {
      this.dom.closeNavBtn.classList.remove("is--visible");
    }

    if (this.dom.overlay) {
      this.dom.overlay.classList.remove("is--active");
    }

    document.body.style.overflow = "unset";
  }

  /**
   * Initialize feature carousels using Swiper
   * @private
   */
  #initFeatureCarousels() {
    if (typeof Swiper === "undefined") {
      console.warn("NavigationComponent: Swiper not available for feature carousels");
      return;
    }

    this.dom.navCarousel.forEach(el => {
      const slides = el.querySelectorAll(".featureCallout__feature");
      const sliderScrollbar = el.querySelector(".js-featureCallout__scrollbar");
      const sliderNext = el.querySelector(".featureCallout__navigation--next");
      const sliderPrev = el.querySelector(".featureCallout__navigation--prev");

      let config = {};

      if (slides && slides.length > 1) {
        config = {
          slidesPerView: 1.2,
          allowSlideNext: true,
          watchOverflow: true,
          freeMode: true,
          spaceBetween: 12,
          slidesOffsetAfter: 12,
          slidesOffsetBefore: 12,
          scrollbar: {
            el: sliderScrollbar,
            draggable: true,
          },
          a11y: {
            enabled: true,
          },
          navigation: {
            enabled: false,
          },
          breakpoints: {
            1280: {
              slidesPerView: 1.28,
              slidesOffsetAfter: 16,
              slidesOffsetBefore: 16,
              navigation: {
                enabled: true,
                nextEl: sliderNext,
                prevEl: sliderPrev,
              },
            },
          },
        };
      } else {
        config = {
          slidesPerView: 1.2,
          allowSlideNext: false,
          watchOverflow: true,
          freeMode: false,
          spaceBetween: 12,
          slidesOffsetAfter: 12,
          slidesOffsetBefore: 12,
          scrollbar: {
            enabled: false,
          },
          navigation: {
            enabled: false,
          },
          breakpoints: {
            1280: {
              slidesPerView: 1.28,
              slidesOffsetAfter: 16,
              slidesOffsetBefore: 16,
            },
          },
        };
      }

      // Check if window.carouselFn exists, otherwise use Swiper directly
      if (typeof window.carouselFn === "function") {
        window.carouselFn(el, config);
      } else {
        const swiperInstance = new Swiper(el, config);
        this.swiperInstances.push(swiperInstance);
      }
    });
  }

  /**
   * Initialize promo bar carousel with Swiper
   * @private
   */
  #initPromoBarCarousel() {
    if (!this.dom.promoBarSlider || typeof Swiper === "undefined") {
      console.warn("NavigationComponent: Swiper not available or promo bar slider not found");
      return;
    }

    const arrowPrev = document.querySelector(".announcement__left");
    const arrowNext = document.querySelector(".announcement__right");

    if (arrowPrev) arrowPrev.style.display = "flex";
    if (arrowNext) arrowNext.style.display = "flex";

    // Set initial ARIA states
    this.dom.promoSlides.forEach((slide, index) => {
      if (index === 0) {
        slide.setAttribute("aria-hidden", "false");
      } else {
        slide.setAttribute("aria-hidden", "true");
        const links = slide.querySelectorAll("a");
        links.forEach(link => link.setAttribute("tabindex", "-1"));
      }
      slide.setAttribute("role", "group");
      slide.setAttribute("aria-label", `announcement ${index + 1} of ${this.dom.promoSlides.length}`);
    });

    // Initialize Swiper with accessibility enhancements
    const promoSwiper = new Swiper(this.dom.promoBarSlider, {
      slidesPerView: 1,
      loop: true,
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
          const realIndex = this.realIndex;
          const promoSlidesLength = document.querySelectorAll(".announcement__bar").length;

          let i = 0;
          for (const slide of slides) {
            const isActive =
              i === this.activeIndex || (this.isLoop && (i - this.loopedSlides) % promoSlidesLength === realIndex);

            if (isActive) {
              slide.setAttribute("aria-hidden", "false");
              const links = slide.querySelectorAll("a");
              links.forEach(link => link.removeAttribute("tabindex"));
            } else {
              slide.setAttribute("aria-hidden", "true");
              const links = slide.querySelectorAll("a");
              links.forEach(link => link.setAttribute("tabindex", "-1"));
            }

            i++;
          }
        },
      },
    });

    this.swiperInstances.push(promoSwiper);
  }

  /**
   * Clean up event listeners and Swiper instances
   * @private
   */
  #cleanup() {
    // Remove all event listeners
    this.eventHandlers.forEach(({ element, event, handler }) => {
      if (element) {
        element.removeEventListener(event, handler);
      }
    });
    this.eventHandlers = [];

    // Destroy all Swiper instances
    this.swiperInstances.forEach(swiper => {
      if (swiper && typeof swiper.destroy === "function") {
        swiper.destroy(true, true);
      }
    });
    this.swiperInstances = [];

    // Close drawers and reset state
    this.#closeDrawers();
  }
}

if (!window.customElements.get("navigation-component")) {
  window.customElements.define("navigation-component", NavigationComponent);
}
