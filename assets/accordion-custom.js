import { mediaQueryLarge, isMobileBreakpoint } from "@theme/utilities";

// Accordion
class AccordionCustom extends HTMLElement {
  /** @type {HTMLDetailsElement} */
  get details() {
    const details = this.querySelector("details");

    if (!(details instanceof HTMLDetailsElement)) throw new Error("Details element not found");

    return details;
  }

  /** @type {HTMLElement} */
  get summary() {
    const summary = this.details.querySelector("summary");

    if (!(summary instanceof HTMLElement)) throw new Error("Summary element not found");

    return summary;
  }

  get #disableOnMobile() {
    return this.dataset.disableOnMobile === "true";
  }

  get #disableOnDesktop() {
    return this.dataset.disableOnDesktop === "true";
  }

  get #closeWithEscape() {
    return this.dataset.closeWithEscape === "true";
  }

  #controller = new AbortController();

  connectedCallback() {
    const { signal } = this.#controller;

    this.#setDefaultOpenState();

    this.addEventListener("keydown", this.#handleKeyDown, { signal });
    this.summary.addEventListener("click", this.handleClick, { signal });
    this.details.addEventListener("toggle", this.#handleToggle, { signal });
    mediaQueryLarge.addEventListener("change", this.#handleMediaQueryChange, { signal });
  }

  /**
   * Handles the disconnect event.
   */
  disconnectedCallback() {
    // Disconnect all the event listeners
    this.#controller.abort();
  }

  /**
   * Handles the click event.
   * @param {Event} event - The event.
   */
  handleClick = event => {
    const isMobile = isMobileBreakpoint();
    const isDesktop = !isMobile;

    // Stop default behaviour from the browser
    if ((isMobile && this.#disableOnMobile) || (isDesktop && this.#disableOnDesktop)) {
      event.preventDefault();
      return;
    }
  };

  /**
   * Handles the media query change event.
   */
  #handleMediaQueryChange = () => {
    this.#setDefaultOpenState();
  };

  /**
   * Handles the toggle event when the details element opens/closes
   * @param {Event} event - The toggle event.
   */
  #handleToggle = event => {
    // Update aria-expanded attribute
    this.summary.setAttribute("aria-expanded", String(this.details.open));

    // Announce state change to screen readers
    this.#announceStateChange();

    // Only close other accordions when this one is being opened
    if (this.details.open) {
      this.#closeOtherAccordions();
      // Scroll to the opened accordion to keep it in view when page height changes
      // Use multiple requestAnimationFrame calls and timeout to ensure DOM updates complete
      // This is especially important when closing other accordions changes page height
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(() => {
            // Calculate position with 80px offset above the accordion for navigation/header clearance
            const rect = this.details.getBoundingClientRect();
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const targetPosition = rect.top + scrollTop - 80;

            window.scrollTo({
              top: targetPosition,
              behavior: "smooth",
            });
          }, 100);
        });
      });
    }
  };

  /**
   * Sets the default open state of the accordion based on the `open-by-default-on-mobile` and `open-by-default-on-desktop` attributes.
   */
  #setDefaultOpenState() {
    const isMobile = isMobileBreakpoint();

    this.details.open =
      (isMobile && this.hasAttribute("open-by-default-on-mobile")) ||
      (!isMobile && this.hasAttribute("open-by-default-on-desktop"));

    // Set initial aria-expanded state
    this.summary.setAttribute("aria-expanded", String(this.details.open));
  }

  /**
   * Handles keydown events for the accordion
   *
   * @param {KeyboardEvent} event - The keyboard event.
   */
  #handleKeyDown(event) {
    // Handle arrow key navigation between accordions
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      this.#navigateToAdjacentAccordion(event.key === "ArrowDown" ? "next" : "previous");
      return;
    }

    // Handle Enter and Space keys to toggle accordion
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      this.details.open = !this.details.open;
      return;
    }

    // Close the accordion when used as a menu
    if (event.key === "Escape" && this.#closeWithEscape) {
      event.preventDefault();
      this.details.open = false;
      this.summary.focus();
    }
  }

  /**
   * Announces state changes to screen readers
   */
  #announceStateChange() {
    const accordionGroup = this.closest(".accordion");
    if (!accordionGroup) return;

    const statusElement = accordionGroup.querySelector("[aria-live]");
    if (statusElement) {
      const heading = this.summary.querySelector("h5")?.textContent || this.summary.textContent;
      const state = this.details.open ? "expanded" : "collapsed";
      statusElement.textContent = `${heading} ${state}`;
    }
  }

  /**
   * Navigates to the next or previous accordion in the group
   * @param {'next'|'previous'} direction - Direction to navigate
   */
  #navigateToAdjacentAccordion(direction) {
    const accordionGroup = this.closest(".accordion") || this.parentElement;

    if (!accordionGroup) return;

    const allAccordions = Array.from(accordionGroup.querySelectorAll("accordion-custom"));
    const currentIndex = allAccordions.indexOf(this);

    if (currentIndex === -1) return;

    let targetIndex;
    if (direction === "next") {
      targetIndex = currentIndex + 1;
      if (targetIndex >= allAccordions.length) {
        targetIndex = 0; // Wrap to first accordion
      }
    } else {
      targetIndex = currentIndex - 1;
      if (targetIndex < 0) {
        targetIndex = allAccordions.length - 1; // Wrap to last accordion
      }
    }

    const targetAccordion = allAccordions[targetIndex];
    if (targetAccordion && targetAccordion instanceof AccordionCustom) {
      targetAccordion.summary.focus();
    }
  }

  /**
   * Closes other accordions in the same group
   */
  #closeOtherAccordions() {
    // Find the parent container that holds all accordions in this group
    const accordionGroup = this.closest(".accordion") || this.parentElement;

    if (accordionGroup) {
      // Find all accordion-custom elements in the same group
      const allAccordions = accordionGroup.querySelectorAll("accordion-custom");

      allAccordions.forEach(accordion => {
        if (accordion !== this && accordion instanceof AccordionCustom) {
          accordion.details.open = false;
          // Update aria-expanded state for closed accordions
          accordion.summary.setAttribute("aria-expanded", "false");
        }
      });
    }
  }
}

if (!customElements.get("accordion-custom")) {
  customElements.define("accordion-custom", AccordionCustom);
}
