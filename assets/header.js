import { Component } from "@theme/component";
import { debounce } from "@theme/utilities";

/**
 * A sticky header wrapper component that controls scroll-based show/hide functionality
 * for the entire header section (including announcements).
 *
 * @extends {Component}
 */
class StickyHeaderWrapper extends Component {
  /**
   * The last recorded scroll position
   * @type {number}
   */
  #lastScrollTop = 0;

  /**
   * The scroll threshold before header behavior activates (header height + buffer)
   * @type {number}
   */
  #scrollThreshold = 200;

  /**
   * Debounced scroll handler to optimize performance
   */
  #handleScroll = debounce(() => {
    const currentScroll = window.scrollY;

    // Only apply scroll behavior after threshold is reached
    if (currentScroll >= this.#scrollThreshold) {
      const isScrollingDown = currentScroll > this.#lastScrollTop;

      if (isScrollingDown) {
        // Scrolling down - hide header wrapper
        this.style.transform = "translateY(-100%)";
      } else {
        // Scrolling up - show header wrapper
        this.style.transform = "translateY(0)";
      }
    } else {
      // Below threshold - reset header wrapper to default state
      this.style.transform = "translateY(0)";
    }

    this.#lastScrollTop = currentScroll;
  }, 200);

  connectedCallback() {
    super.connectedCallback();

    // Calculate dynamic scroll threshold based on wrapper height + buffer
    this.#scrollThreshold = this.clientHeight + 200;

    // Add scroll listener
    window.addEventListener("scroll", this.#handleScroll, { passive: true });
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    // Clean up scroll listener
    window.removeEventListener("scroll", this.#handleScroll);

    // Cancel any pending debounced calls
    if (typeof this.#handleScroll.cancel === "function") {
      this.#handleScroll.cancel();
    }
  }
}

/**
 * A simple header component (no scroll behavior - handled by parent wrapper)
 *
 * @extends {Component}
 */
class HeaderComponent extends Component {
  // Header component now just serves as a semantic wrapper
  // All scroll behavior is handled by the sticky-header-wrapper parent
}

if (!window.customElements.get("sticky-header-wrapper")) {
  window.customElements.define("sticky-header-wrapper", StickyHeaderWrapper);
}

if (!window.customElements.get("header-component")) {
  window.customElements.define("header-component", HeaderComponent);
}
