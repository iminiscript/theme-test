import { OverflowList } from "@theme/critical";
import VariantPicker from "@theme/variant-picker";
import { Component } from "@theme/component";
import { debounce, isDesktopBreakpoint, mediaQueryLarge, requestYieldCallback } from "@theme/utilities";
import { ThemeEvents, VariantSelectedEvent, VariantUpdateEvent, SlideshowSelectEvent } from "@theme/events";
import { morph } from "@theme/morph";
/**
 * A custom element that displays a product card.
 *
 * @typedef {object} Refs
 * @property {HTMLAnchorElement} productCardLink - The product card link element.
 * @property {import('slideshow').Slideshow} [slideshow] - The slideshow component.
 * @property {import('quick-add').QuickAddComponent} [quickAdd] - The quick add component.
 * @property {HTMLElement} [cardGallery] - The card gallery component.
 *
 * @extends {Component<Refs>}
 */
export class ProductCard extends Component {
  requiredRefs = ["productCardLink"];
  /** @type {any[]} */
  #swipers = [];

  get productPageUrl() {
    return this.refs.productCardLink.href;
  }
  /**
   * Gets the currently selected variant ID from the product card
   * @returns {string | null} The variant ID or null if none selected
   */
  getSelectedVariantId() {
    const checkedInput = /** @type {HTMLInputElement | null} */ (
      this.querySelector('input[type="radio"]:checked[data-variant-id]')
    );
    return checkedInput?.dataset.variantId || null;
  }
  /**
   * Gets the product card link element
   * @returns {HTMLAnchorElement | null} The product card link or null
   */
  getProductCardLink() {
    return this.refs.productCardLink || null;
  }
  #fetchProductPageHandler = () => {
    this.refs.quickAdd?.fetchProductPage(this.productPageUrl);
  };
  /**
   * Navigates to a URL link. Respects modifier keys for opening in new tab/window.
   * @param {Event} event - The event that triggered the navigation.
   * @param {URL} url - The URL to navigate to.
   */
  #navigateToURL = (event, url) => {
    // Check for modifier keys that should open in new tab/window (only for mouse events)
    const shouldOpenInNewTab =
      event instanceof MouseEvent && (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1);
    if (shouldOpenInNewTab) {
      event.preventDefault();
      window.open(url.href, "_blank");
      return;
    } else {
      window.location.href = url.href;
    }
  };
  connectedCallback() {
    super.connectedCallback();
    const link = this.refs.productCardLink;
    if (!(link instanceof HTMLAnchorElement)) throw new Error("Product card link not found");
    this.#handleQuickAdd();
    this.addEventListener(ThemeEvents.variantUpdate, this.#handleVariantUpdate);
    this.addEventListener(ThemeEvents.variantSelected, this.#handleVariantSelected);
    this.addEventListener(SlideshowSelectEvent.eventName, this.#handleSlideshowSelect);
    mediaQueryLarge.addEventListener("change", this.#handleQuickAdd);
    this.addEventListener("click", this.navigateToProduct);
    this.addEventListener("click", this.#handleSwatchClick);
    // Initialize product card swipers
    this.#initSwipers();
    // Preload the next image on the slideshow to avoid white flashes on previewImage
    setTimeout(() => {
      if (this.refs.slideshow?.isNested) {
        this.#preloadNextPreviewImage();
      }
    });
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener("click", this.navigateToProduct);
    this.removeEventListener("click", this.#handleSwatchClick);
    // Destroy swipers
    this.#destroySwipers();
  }

  /**
   * Initialize Swiper instances for product card image carousels.
   */
  #initSwipers() {
    const win = /** @type {any} */ (window);
    if (typeof win.Swiper === "undefined") {
      // Wait for Swiper to load
      const checkSwiper = setInterval(() => {
        if (typeof win.Swiper !== "undefined") {
          clearInterval(checkSwiper);
          this.#createSwipers();
        }
      }, 100);
      return;
    }
    this.#createSwipers();
  }

  /**
   * Create Swiper instances for all .productCard__swiper elements.
   */
  #createSwipers() {
    const win = /** @type {any} */ (window);
    const swiperContainers = this.querySelectorAll(".productCard__swiper");
    for (const container of swiperContainers) {
      const el = /** @type {any} */ (container);
      // Skip if already initialized
      if (el.swiper) continue;

      const swiper = new win.Swiper(container, {
        slidesPerView: 1,
        spaceBetween: 0,
        loop: false,
        navigation: {
          nextEl: container.querySelector(".productCard__nav--next"),
          prevEl: container.querySelector(".productCard__nav--prev"),
        },
      });
      this.#swipers.push(swiper);
    }
  }

  /**
   * Destroy all Swiper instances.
   */
  #destroySwipers() {
    for (const swiper of this.#swipers) {
      try {
        swiper.destroy(true, true);
      } catch (e) {
        // Ignore errors during cleanup
      }
    }
    this.#swipers = [];
  }
  #preloadNextPreviewImage() {
    const currentSlide = this.refs.slideshow?.slides?.[this.refs.slideshow?.current];
    currentSlide?.nextElementSibling?.querySelector('img[loading="lazy"]')?.removeAttribute("loading");
  }
  /**
   * Handles the quick add event.
   */
  #handleQuickAdd = () => {
    this.removeEventListener("pointerenter", this.#fetchProductPageHandler);
    this.removeEventListener("focusin", this.#fetchProductPageHandler);
    if (isDesktopBreakpoint()) {
      this.addEventListener("pointerenter", this.#fetchProductPageHandler);
      this.addEventListener("focusin", this.#fetchProductPageHandler);
    }
  };
  /**
   * Handles the variant selected event.
   * @param {VariantSelectedEvent} event - The variant selected event.
   */
  #handleVariantSelected = event => {
    if (event.target !== this.variantPicker) {
      this.variantPicker?.updateSelectedOption(event.detail.resource.id);
    }
  };
  /**
   * Handles the variant update event.
   * Updates price, checks for unavailable variants, and updates product URL.
   * @param {VariantUpdateEvent} event - The variant update event.
   */
  #handleVariantUpdate = event => {
    // Stop the event from bubbling up to the section, variant updates triggered from product cards are fully handled
    // by this component and should not affect anything outside the card.
    event.stopPropagation();
    this.updatePrice(event);
    this.#isUnavailableVariantSelected(event);
    this.#updateProductUrl(event);
    this.refs.quickAdd?.fetchProductPage(this.productPageUrl);
    if (event.target !== this.variantPicker) {
      this.variantPicker?.updateVariantPicker(event.detail.data.html);
    }
    this.#updateVariantImages();
    this.#previousSlideIndex = null;
    // Remove attribute after re-rendering since a variant selection has been made
    this.removeAttribute("data-no-swatch-selected");
    // Force overflow list to reflow after variant update
    // This fixes an issue where the overflow counter doesn't update properly in some browsers
    this.#updateOverflowList();
  };
  /**
   * Forces the overflow list to recalculate by dispatching a reflow event.
   * This ensures the overflow counter displays correctly after variant updates.
   */
  #updateOverflowList() {
    // Find the overflow list in the variant picker
    const overflowList = this.querySelector("swatches-variant-picker-component overflow-list");
    const isActiveOverflowList = overflowList?.querySelector('[slot="overflow"]') ? true : false;
    if (!overflowList || !isActiveOverflowList) return;
    // Use requestAnimationFrame to ensure DOM has been updated
    requestAnimationFrame(() => {
      // Dispatch a reflow event to trigger recalculation
      overflowList.dispatchEvent(
        new CustomEvent("reflow", {
          bubbles: true,
          detail: {},
        })
      );
    });
  }
  /**
   * Updates the DOM with a new price.
   * @param {VariantUpdateEvent} event - The variant update event.
   */
  updatePrice(event) {
    const priceContainer = this.querySelectorAll(`product-price [ref='priceContainer']`)[1];
    const newPriceElement = event.detail.data.html.querySelector(`product-price [ref='priceContainer']`);
    if (newPriceElement && priceContainer) {
      morph(priceContainer, newPriceElement);
    }
  }
  /**
   * Updates the product URL based on the variant update event.
   * @param {VariantUpdateEvent} event - The variant update event.
   */
  #updateProductUrl(event) {
    const anchorElement = event.detail.data.html?.querySelector("product-card a");
    const featuredMediaUrl = event.detail.data.html
      ?.querySelector("product-card-link")
      ?.getAttribute("data-featured-media-url");
    // If the product card is inside a product link, update the product link's featured media URL
    if (featuredMediaUrl && this.closest("product-card-link"))
      this.closest("product-card-link")?.setAttribute("data-featured-media-url", featuredMediaUrl);
    if (anchorElement instanceof HTMLAnchorElement) {
      // If the href is empty, don't update the product URL eg: unavailable variant
      if (anchorElement.getAttribute("href")?.trim() === "") return;
      const productUrl = anchorElement.href;
      const { productCardLink, productTitleLink, cardGalleryLink } = this.refs;
      productCardLink.href = productUrl;
      if (cardGalleryLink instanceof HTMLAnchorElement) {
        cardGalleryLink.href = productUrl;
      }
      if (productTitleLink instanceof HTMLAnchorElement) {
        productTitleLink.href = productUrl;
      }
    }
  }
  /**
   * Checks if an unavailable variant is selected.
   * @param {VariantUpdateEvent} event - The variant update event.
   */
  #isUnavailableVariantSelected(event) {
    const allVariants = /** @type {NodeListOf<HTMLInputElement>} */ (
      event.detail.data.html.querySelectorAll("input:checked")
    );
    for (const variant of allVariants) {
      this.#toggleAddToCartButton(variant.dataset.optionAvailable === "true");
    }
  }
  /**
   * Toggles the add to cart button state.
   * @param {boolean} enable - Whether to enable or disable the button.
   */
  #toggleAddToCartButton(enable) {
    const addToCartButton = this.querySelector(".add-to-cart__button button");
    if (addToCartButton instanceof HTMLButtonElement) {
      addToCartButton.disabled = !enable;
    }
  }

  /**
   * Handles swatch click events to change visible images for the selected color option.
   * @param {Event} event - The click event.
   */
  #handleSwatchClick = event => {
    if (!(event.target instanceof Element)) return;
    const swatch = event.target.closest(".productCard__swatch");
    if (!(swatch instanceof HTMLElement)) return;

    // Prevent navigation when clicking swatches
    event.preventDefault();
    event.stopPropagation();

    const optionMediaId = swatch.dataset.optionMediaId;
    if (optionMediaId === undefined || optionMediaId === null) return;

    // Update selected state visually
    const allSwatches = this.querySelectorAll(".productCard__swatch");
    allSwatches.forEach(s => s.classList.remove("swatch-selected"));
    swatch.classList.add("swatch-selected");

    // Update images to show the selected color option's images
    this.#updateVariantImagesByMediaId(optionMediaId);
  };

  /**
   * Updates variant images by media ID.
   * @param {string} selectedMediaId - The selected media ID.
   */
  #updateVariantImagesByMediaId(selectedMediaId) {
    const imageItems = this.querySelectorAll('[data-variant-image="true"]');
    for (const imageItem of imageItems) {
      const el = /** @type {any} */ (imageItem);
      const slideId = imageItem.getAttribute("data-slide-id");
      if (slideId === selectedMediaId) {
        imageItem.classList.remove("hidden");
        // Reset swiper to first slide when showing
        if (el.swiper) {
          el.swiper.slideTo(0, 0);
        }
      } else {
        imageItem.classList.add("hidden");
      }
    }
  }

  /**
   * Hide the variant images that are not for the selected variant.
   */
  #updateVariantImages() {
    const { slideshow } = this.refs;
    if (!this.variantPicker?.selectedOption) {
      return;
    }
    const selectedImageId = this.variantPicker?.selectedOption.dataset.optionMediaId;
    if (selectedImageId === undefined || selectedImageId === null) {
      return;
    }
    // Handle slideshow case
    if (slideshow) {
      const { slides = [] } = slideshow.refs;
      for (const slide of slides) {
        if (slide.getAttribute("variant-image") == null && slide.getAttribute("data-variant-image") == null) continue;
        const slideId = slide.getAttribute("slide-id") || slide.getAttribute("data-slide-id");
        slide.hidden = slideId !== selectedImageId;
      }
      slideshow.select({ id: selectedImageId }, undefined, { animate: false });
    } else {
      // Handle direct image divs (no slideshow component)
      const imageItems = this.querySelectorAll('[data-variant-image="true"]');
      for (const imageItem of imageItems) {
        const slideId = imageItem.getAttribute("data-slide-id");
        if (slideId === selectedImageId) {
          imageItem.classList.remove("hidden");
        } else {
          imageItem.classList.add("hidden");
        }
      }
    }
  }
  /**
   * Gets all variant inputs.
   * @returns {NodeListOf<HTMLInputElement>} All variant input elements.
   */
  get allVariants() {
    return this.querySelectorAll("input[data-variant-id]");
  }
  /**
   * Gets the variant picker component.
   * @returns {VariantPicker | null} The variant picker component.
   */
  get variantPicker() {
    return this.querySelector("swatches-variant-picker-component");
  }
  /** @type {number | null} */
  #previousSlideIndex = null;
  /**
   * Handles the slideshow select event.
   * @param {SlideshowSelectEvent} event - The slideshow select event.
   */
  #handleSlideshowSelect = event => {
    if (event.detail.userInitiated) {
      this.#previousSlideIndex = event.detail.index;
    }
  };
  /**
   * Previews a variant.
   * @param {string} id - The id of the variant to preview.
   */
  previewVariant(id) {
    const { slideshow } = this.refs;
    if (!slideshow) return;
    this.resetVariant.cancel();
    slideshow.select({ id }, undefined, { animate: false });
  }
  /**
   * Previews the next image.
   * @param {PointerEvent} event - The pointer event.
   */
  previewImage(event) {
    if (event.pointerType !== "mouse") return;
    const { slideshow } = this.refs;
    if (!slideshow) return;
    this.resetVariant.cancel();
    if (this.#previousSlideIndex != null && this.#previousSlideIndex > 0) {
      slideshow.select(this.#previousSlideIndex, undefined, { animate: false });
    } else {
      slideshow.next(undefined, { animate: false });
      setTimeout(() => this.#preloadNextPreviewImage());
    }
  }
  /**
   * Resets the image to the variant image.
   * @param {PointerEvent} event - The pointer event.
   */
  resetImage(event) {
    if (event.pointerType !== "mouse") return;
    const { slideshow } = this.refs;
    if (!this.variantPicker) {
      if (!slideshow) return;
      slideshow.previous(undefined, { animate: false });
    } else {
      this.#resetVariant();
    }
  }
  /**
   * Resets the image to the variant image.
   */
  #resetVariant = () => {
    const { slideshow } = this.refs;
    if (!slideshow) return;
    // If we have a selected variant, always use its image
    if (this.variantPicker?.selectedOption) {
      const id = this.variantPicker.selectedOption.dataset.optionMediaId;
      if (id) {
        slideshow.select({ id }, undefined, { animate: false });
        return;
      }
    }
    // No variant selected - use initial slide if it's valid
    const initialSlide = slideshow.initialSlide;
    const slideId = initialSlide?.getAttribute("slide-id");
    if (initialSlide && slideshow.slides?.includes(initialSlide) && slideId) {
      slideshow.select({ id: slideId }, undefined, { animate: false });
      return;
    }
    // No valid initial slide or selected variant - go to previous
    slideshow.previous(undefined, { animate: false });
  };
  /**
   * Intercepts the click event on the product card anchor, we want
   * to use this to add an intermediate state to the history.
   * This intermediate state captures the page we were on so that we
   * navigate back to the same page when the user navigates back.
   * In addition to that, it captures the product card anchor so that we
   * have the specific product card in view.
   *
   * A product card can have other interactive elements like variant picker,
   * so we do not navigate if the click was on one of those elements.
   *
   * @param {Event} event
   */
  navigateToProduct = event => {
    if (!(event.target instanceof Element)) return;
    // Don't navigate if this product card is marked as no-navigation (e.g., in theme editor)
    if (this.hasAttribute("data-no-navigation")) return;
    const interactiveElement = event.target.closest(
      'button, input, label, select, [tabindex="1"], .productCard__swatch'
    );
    // If the click was on an interactive element, do nothing.
    if (interactiveElement) {
      return;
    }
    // Check if timer is active and prevent navigation
    const link = this.refs.productCardLink;
    if (link && link.hasAttribute("data-timer-click-handler")) {
      const timerState = this.#checkTimerState();
      if (timerState && timerState.isActive === true && timerState.timeRemaining > 0) {
        event.preventDefault();
        this.#handleTimerActiveClick(event);
        return;
      }
    }
    if (!link.href) return;
    const linkURL = new URL(link.href);
    const productCardAnchor = link.getAttribute("id");
    if (!productCardAnchor) return;
    const url = new URL(window.location.href);
    const parent = this.closest("li");
    url.hash = productCardAnchor;
    if (parent && parent.dataset.page) {
      url.searchParams.set("page", parent.dataset.page);
    }
    if (!window.Shopify.designMode) {
      requestYieldCallback(() => {
        history.replaceState({}, "", url.toString());
      });
    }
    const targetLink = event.target.closest("a");
    // Let the native navigation handle the click if it was on a link.
    if (!targetLink) {
      this.#navigateToURL(event, linkURL);
    }
  };
  /**
   * Checks if timer is active and returns its state
   * @returns {{isActive: boolean, timeRemaining: number, state: any}|null} Timer state or null
   */
  #checkTimerState() {
    if (!this.hasAttribute("data-has-timer")) return null;
    const timer = /** @type {any} */ (this.querySelector("countdown-timer"));
    if (!timer || typeof timer.getState !== "function") return null;
    const state = timer.getState();
    if (!state || state.isCompleted) return null;
    // Timer is active if it's running and has time remaining
    const isActive = state.isRunning && state.timeRemaining && state.timeRemaining.total > 0;
    return {
      isActive,
      timeRemaining: state.timeRemaining?.total || 0,
      state,
    };
  }
  /**
   * Handles click when timer is active
   * @param {Event} event - The click event
   */
  #handleTimerActiveClick(event) {
    // Fire custom function when timer is active
    const handler = /** @type {any} */ (window).handleProductCardTimerClick;
    if (typeof handler === "function") {
      handler(event, this);
    } else {
      // Default behavior - prevent navigation and optionally show notification
      console.log("Product is not yet available - timer is active", {
        productId: this.dataset.productId,
        timerState: this.#checkTimerState(),
      });
    }
  }
  /**
   * Resets the variant.
   */
  resetVariant = debounce(this.#resetVariant, 100);
}
if (!customElements.get("product-card")) {
  customElements.define("product-card", ProductCard);
}
/**
 * A custom element that displays a variant picker with swatches.
 *
 * @typedef {object} SwatchesRefs
 * @property {HTMLElement} overflowList
 *
 * @extends {VariantPicker<SwatchesRefs>}
 */
class SwatchesVariantPickerComponent extends VariantPicker {
  connectedCallback() {
    super.connectedCallback();
    // Cache the parent product card
    this.parentProductCard = this.closest("product-card");
    // Listen for variant updates to apply pending URL changes
    this.addEventListener(ThemeEvents.variantUpdate, this.#handleCardVariantUrlUpdate.bind(this));
  }
  /**
   * Updates the card URL when a variant is selected.
   */
  #handleCardVariantUrlUpdate() {
    if (this.pendingVariantId && this.parentProductCard instanceof ProductCard) {
      const currentUrl = new URL(this.parentProductCard.refs.productCardLink.href);
      currentUrl.searchParams.set("variant", this.pendingVariantId);
      this.parentProductCard.refs.productCardLink.href = currentUrl.toString();
      this.pendingVariantId = null;
    }
  }
  /**
   * Override the variantChanged method to handle unavailable swatches with available alternatives.
   * @param {Event} event - The variant change event.
   */
  variantChanged(event) {
    if (!(event.target instanceof HTMLElement)) return;
    // Check if this is a swatch input
    const isSwatchInput = event.target instanceof HTMLInputElement && event.target.name?.includes("-swatch");
    const clickedSwatch = event.target;
    const availableCount = parseInt(clickedSwatch.dataset.availableCount || "0");
    const firstAvailableVariantId = clickedSwatch.dataset.firstAvailableOrFirstVariantId;
    // For swatch inputs, check if we need special handling
    if (isSwatchInput && availableCount > 0 && firstAvailableVariantId) {
      // If this is an unavailable variant but there are available alternatives
      // Prevent the default handling
      event.stopPropagation();
      // Update the selected option visually
      this.updateSelectedOption(clickedSwatch);
      // Build request URL with the first available variant
      const productUrl = this.dataset.productUrl?.split("?")[0];
      if (!productUrl) return;
      const url = new URL(productUrl, window.location.origin);
      url.searchParams.set("variant", firstAvailableVariantId);
      url.searchParams.set("section_id", "section-rendering-product-card");
      const requestUrl = url.href;
      // Store the variant ID we want to apply to the URL
      this.pendingVariantId = firstAvailableVariantId;
      // Use parent's fetch method
      this.fetchUpdatedSection(requestUrl);
      return;
    }
    // For all other cases, use the default behavior
    super.variantChanged(event);
  }
  /**
   * Shows all swatches.
   * @param {Event} [event] - The event that triggered the show all swatches.
   */
  showAllSwatches(event) {
    event?.preventDefault();
    const { overflowList } = this.refs;
    if (overflowList instanceof OverflowList) {
      overflowList.showAll();
    }
  }
}
if (!customElements.get("swatches-variant-picker-component")) {
  customElements.define("swatches-variant-picker-component", SwatchesVariantPickerComponent);
}
