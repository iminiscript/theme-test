import { Component } from "@theme/component";
import { fetchConfig, debounce, onAnimationEnd, prefersReducedMotion, resetShimmer } from "@theme/utilities";
import { morphSection, sectionRenderer } from "@theme/section-renderer";
import {
  ThemeEvents,
  CartUpdateEvent,
  QuantitySelectorUpdateEvent,
  CartAddEvent,
  DiscountUpdateEvent,
} from "@theme/events";
import { cartPerformance } from "@theme/performance";

/** @typedef {import('./utilities').TextComponent} TextComponent */

/**
 * A custom element that displays a cart items component.
 *
 * @typedef {object} Refs
 * @property {HTMLElement[]} quantitySelectors - The quantity selector elements.
 * @property {HTMLTableRowElement[]} cartItemRows - The cart item rows.
 * @property {TextComponent} cartTotal - The cart total.
 *
 * @extends {Component<Refs>}
 */
class CartItemsComponent extends Component {
  #debouncedOnChange = debounce(this.#onQuantityChange, 300).bind(this);

  // Store bound function references for event listeners
  _onBundleQuantityChange = this.#onBundleQuantityChange.bind(this);
  _onBundleRemove = this.#onBundleRemove.bind(this);
  _handleBundleRemoveClick = this.#handleBundleRemoveClick.bind(this);

  connectedCallback() {
    super.connectedCallback();

    document.addEventListener(ThemeEvents.cartUpdate, this.#handleCartUpdate);
    document.addEventListener(ThemeEvents.discountUpdate, this.handleDiscountUpdate);
    document.addEventListener(ThemeEvents.quantitySelectorUpdate, this.#debouncedOnChange);
    document.addEventListener("theme:quantitySelectorBundleUpdate", this._onBundleQuantityChange);
    document.addEventListener("theme:bundleRemove", this._onBundleRemove);

    // Handle bundle remove buttons directly
    this.addEventListener("click", this._handleBundleRemoveClick);
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    document.removeEventListener(ThemeEvents.cartUpdate, this.#handleCartUpdate);
    document.removeEventListener(ThemeEvents.quantitySelectorUpdate, this.#debouncedOnChange);
    document.removeEventListener("theme:quantitySelectorBundleUpdate", this._onBundleQuantityChange);
    document.removeEventListener("theme:bundleRemove", this._onBundleRemove);
    this.removeEventListener("click", this._handleBundleRemoveClick);
  }

  /**
   * Handles bundle quantity update event.
   * @param {CustomEvent} event - The bundle update event.
   */
  #onBundleQuantityChange(event) {
    const { bundleIds, quantity } = event.detail;

    console.log("Handling bundle quantity change:", { bundleIds, quantity });

    // Update all bundle items by variant IDs
    this.#updateBundleByVariantIds(bundleIds, quantity);
  }

  /**
   * Handles bundle removal event.
   * @param {CustomEvent} event - The bundle removal event.
   */
  #onBundleRemove(event) {
    const { lines } = event.detail;
    console.log("Handling bundle removal:", { lines });

    // Remove all bundle items by setting quantity to 0
    this.updateBundleQuantity(lines, 0);
  }

  /**
   * Handles click events on bundle remove buttons.
   * @param {MouseEvent} event - The click event.
   */
  #handleBundleRemoveClick(event) {
    const target = /** @type {HTMLElement | null} */ (event.target);
    if (!target) return;

    const removeButton = target.closest("[data-bundle-remove]");
    if (!removeButton) return;

    event.preventDefault();
    event.stopPropagation();

    const bundleRow = removeButton.closest("[data-bundle-ids]");
    if (!bundleRow || !(bundleRow instanceof HTMLElement)) {
      console.error("Bundle row not found for remove button");
      return;
    }

    const bundleIds = bundleRow.dataset.bundleIds;
    if (!bundleIds) {
      console.error("Bundle IDs not found");
      return;
    }

    console.log("Bundle remove clicked. Bundle IDs:", bundleIds);

    // Use variant IDs directly to remove all bundle items
    this.#removeBundleByVariantIds(bundleIds);
  }

  /**
   * Removes bundle items by variant IDs using cart/update.js
   * @param {string} bundleIds - Comma-separated variant IDs
   */
  async #removeBundleByVariantIds(bundleIds) {
    console.log("Removing bundle by variant IDs:", bundleIds);

    const cartPerformaceUpdateMarker = cartPerformance.createStartingMarker("bundle-remove:user-action");

    this.#disableCartItems();

    const { cartTotal } = this.refs;
    cartTotal?.shimmer();

    // Build updates object with all variant IDs set to 0
    /** @type {Record<string, number>} */
    const updates = {};
    const variantIds = bundleIds.split(",").map(id => id.trim());
    variantIds.forEach(variantId => {
      if (variantId) {
        updates[variantId] = 0;
      }
    });

    console.log("Removing bundle items:", updates);

    try {
      const response = await fetch(/** @type {any} */ (window.Shopify).routes.root + "cart/update.js", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ updates }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const cart = await response.json();

      resetShimmer(this);

      // Collect all cart sections that need updating
      const cartItemsComponents = document.querySelectorAll("cart-items-component");
      const sectionsToUpdate = new Set([this.sectionId]);
      cartItemsComponents.forEach(item => {
        if (item instanceof HTMLElement && item.dataset.sectionId) {
          sectionsToUpdate.add(item.dataset.sectionId);
        }
      });

      // Fetch updated sections
      const sectionsUrl = `${window.location.pathname}?sections=${Array.from(sectionsToUpdate).join(",")}`;
      const sectionsResponse = await fetch(sectionsUrl);
      const sections = await sectionsResponse.json();

      // Get new item count
      const newSectionHTML = new DOMParser().parseFromString(sections[this.sectionId], "text/html");
      const newCartHiddenItemCount = newSectionHTML.querySelector('[ref="cartItemCount"]')?.textContent;
      const newCartItemCount = newCartHiddenItemCount ? parseInt(newCartHiddenItemCount, 10) : 0;

      // Dispatch cart update event
      this.dispatchEvent(
        new CartUpdateEvent({}, this.sectionId, {
          itemCount: newCartItemCount,
          source: "cart-items-component",
          sections: sections,
        })
      );

      // Morph the sections with new HTML
      morphSection(this.sectionId, sections[this.sectionId]);
    } catch (error) {
      console.error("Error removing bundle:", error);

      // Show error to user (you might want to add a toast notification here)
      // For now, just re-render the section to reset the UI
      sectionRenderer.renderSection(this.sectionId, { cache: false });
    } finally {
      this.#enableCartItems();
      cartPerformance.measureFromMarker(cartPerformaceUpdateMarker);
    }
  }

  /**
   * Updates multiple cart items sequentially
   * @param {number[]} lines - Array of line numbers to update
   * @param {number} quantity - The quantity to set for all lines
   */
  // updateBundleQuantity(lines, quantity) {
  //   console.log('Updating bundle lines:', lines, 'to quantity:', quantity);

  //   // Update each line sequentially with delay to avoid race conditions
  //   lines.forEach((/** @type {number} */ line, /** @type {number} */ index) => {
  //     setTimeout(() => {
  //       this.updateQuantity({
  //         line,
  //         quantity,
  //         action: 'change',
  //       });
  //     }, index * 100); // 100ms delay between updates
  //   });
  // }
  /**
   * Updates bundle items by variant IDs directly
   * @param {string} bundleIds - Comma-separated variant IDs
   * @param {number} quantity - The quantity to set for all variants
   */
  async #updateBundleByVariantIds(bundleIds, quantity) {
    console.log("Updating bundle by variant IDs:", bundleIds, "to quantity:", quantity);

    const cartPerformaceUpdateMarker = cartPerformance.createStartingMarker("bundle:user-action");

    this.#disableCartItems();

    const { cartTotal } = this.refs;
    cartTotal?.shimmer();

    // Build updates object with variant IDs
    /** @type {Record<string, number>} */
    const updates = {};
    const variantIds = bundleIds.split(",").map(id => id.trim());
    variantIds.forEach(variantId => {
      if (variantId) {
        updates[variantId] = quantity;
      }
    });

    console.log("Updates object:", updates);

    try {
      const response = await fetch(/** @type {any} */ (window.Shopify).routes.root + "cart/update.js", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ updates }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const cart = await response.json();

      resetShimmer(this);

      // Collect all cart sections that need updating
      const cartItemsComponents = document.querySelectorAll("cart-items-component");
      const sectionsToUpdate = new Set([this.sectionId]);
      cartItemsComponents.forEach(item => {
        if (item instanceof HTMLElement && item.dataset.sectionId) {
          sectionsToUpdate.add(item.dataset.sectionId);
        }
      });

      // Fetch updated sections
      const sectionsUrl = `${window.location.pathname}?sections=${Array.from(sectionsToUpdate).join(",")}`;
      const sectionsResponse = await fetch(sectionsUrl);
      const sections = await sectionsResponse.json();

      // Get new item count
      const newSectionHTML = new DOMParser().parseFromString(sections[this.sectionId], "text/html");
      const newCartHiddenItemCount = newSectionHTML.querySelector('[ref="cartItemCount"]')?.textContent;
      const newCartItemCount = newCartHiddenItemCount ? parseInt(newCartHiddenItemCount, 10) : 0;

      // Dispatch cart update event
      this.dispatchEvent(
        new CartUpdateEvent({}, this.sectionId, {
          itemCount: newCartItemCount,
          source: "cart-items-component",
          sections: sections,
        })
      );

      // Morph the sections with new HTML
      morphSection(this.sectionId, sections[this.sectionId]);
    } catch (error) {
      console.error("Error updating bundle:", error);

      // Show error to user (you might want to add a toast notification here)
      // For now, just re-render the section to reset the UI
      sectionRenderer.renderSection(this.sectionId, { cache: false });
    } finally {
      this.#enableCartItems();
      cartPerformance.measureFromMarker(cartPerformaceUpdateMarker);
    }
  }

  /**
   * Updates multiple cart items in a single request
   * @param {number[]} lines - Array of line numbers to update
   * @param {number} quantity - The quantity to set for all lines
   * @deprecated Use #updateBundleByVariantIds instead
   */
  async updateBundleQuantity(lines, quantity) {
    console.log("Updating bundle lines:", lines, "to quantity:", quantity);

    const cartPerformaceUpdateMarker = cartPerformance.createStartingMarker("bundle:user-action");

    this.#disableCartItems();

    const { cartTotal } = this.refs;
    cartTotal?.shimmer();

    // Build updates object with variant IDs from bundle
    /** @type {Record<string, number>} */
    const updates = {};

    lines.forEach(line => {
      const lineItemRow = this.refs.cartItemRows[line - 1];
      if (lineItemRow) {
        // Get bundle IDs from data attribute (comma-separated variant IDs)
        const bundleIds = lineItemRow.dataset.bundleIds;

        if (bundleIds) {
          // Split the bundle IDs and set quantity for each
          const variantIds = bundleIds.split(",").map(id => id.trim());
          variantIds.forEach(variantId => {
            if (variantId) {
              updates[variantId] = quantity;
            }
          });
        }
      }
    });

    console.log("Updates object:", updates);

    try {
      const response = await fetch(/** @type {any} */ (window.Shopify).routes.root + "cart/update.js", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ updates }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const cart = await response.json();

      resetShimmer(this);

      // Collect all cart sections that need updating
      const cartItemsComponents = document.querySelectorAll("cart-items-component");
      const sectionsToUpdate = new Set([this.sectionId]);
      cartItemsComponents.forEach(item => {
        if (item instanceof HTMLElement && item.dataset.sectionId) {
          sectionsToUpdate.add(item.dataset.sectionId);
        }
      });

      // Fetch updated sections
      const sectionsUrl = `${window.location.pathname}?sections=${Array.from(sectionsToUpdate).join(",")}`;
      const sectionsResponse = await fetch(sectionsUrl);
      const sections = await sectionsResponse.json();

      // Get new item count
      const newSectionHTML = new DOMParser().parseFromString(sections[this.sectionId], "text/html");
      const newCartHiddenItemCount = newSectionHTML.querySelector('[ref="cartItemCount"]')?.textContent;
      const newCartItemCount = newCartHiddenItemCount ? parseInt(newCartHiddenItemCount, 10) : 0;

      // Dispatch cart update event
      this.dispatchEvent(
        new CartUpdateEvent({}, this.sectionId, {
          itemCount: newCartItemCount,
          source: "cart-items-component",
          sections: sections,
        })
      );

      // Morph the sections with new HTML
      morphSection(this.sectionId, sections[this.sectionId]);
    } catch (error) {
      console.error("Error updating bundle:", error);

      // Show error to user (you might want to add a toast notification here)
      // For now, just re-render the section to reset the UI
      sectionRenderer.renderSection(this.sectionId, { cache: false });
    } finally {
      this.#enableCartItems();
      cartPerformance.measureFromMarker(cartPerformaceUpdateMarker);
    }
  }

  /**
   * Handles QuantitySelectorUpdateEvent change event.
   * @param {QuantitySelectorUpdateEvent} event - The event.
   */
  #onQuantityChange(event) {
    const { quantity, cartLine: line } = event.detail;

    if (!line) return;

    if (quantity === 0) {
      return this.onLineItemRemove(line);
    }

    this.updateQuantity({
      line,
      quantity,
      action: "change",
    });
    const lineItemRow = this.refs.cartItemRows[line - 1];

    if (!lineItemRow) return;

    const textComponent = /** @type {TextComponent | undefined} */ (lineItemRow.querySelector("text-component"));
    textComponent?.shimmer();
  }

  /**
   * Handles the line item removal.
   * @param {number} line - The line item index.
   */
  onLineItemRemove(line) {
    this.updateQuantity({
      line,
      quantity: 0,
      action: "clear",
    });

    const cartItemRowToRemove = this.refs.cartItemRows[line - 1];

    if (!cartItemRowToRemove) return;

    const rowsToRemove = [
      cartItemRowToRemove,
      // Get all nested lines of the row to remove
      ...this.refs.cartItemRows.filter(row => row.dataset.parentKey === cartItemRowToRemove.dataset.key),
    ];

    // Add class to the row to trigger the animation
    rowsToRemove.forEach(row => {
      const remove = () => row.remove();

      if (prefersReducedMotion()) return remove();

      row.style.setProperty("--row-height", `${row.clientHeight}px`);
      row.classList.add("removing");

      // Remove the row after the animation ends
      onAnimationEnd(row, remove);
    });
  }

  /**
   * Updates the quantity.
   * @param {Object} config - The config.
   * @param {number} config.line - The line.
   * @param {number} config.quantity - The quantity.
   * @param {string} config.action - The action.
   */
  updateQuantity(config) {
    const cartPerformaceUpdateMarker = cartPerformance.createStartingMarker(`${config.action}:user-action`);

    this.#disableCartItems();

    const { line, quantity } = config;
    const { cartTotal } = this.refs;

    const cartItemsComponents = document.querySelectorAll("cart-items-component");
    const sectionsToUpdate = new Set([this.sectionId]);
    cartItemsComponents.forEach(item => {
      if (item instanceof HTMLElement && item.dataset.sectionId) {
        sectionsToUpdate.add(item.dataset.sectionId);
      }
    });

    const body = JSON.stringify({
      line: line,
      quantity: quantity,
      sections: Array.from(sectionsToUpdate).join(","),
      sections_url: window.location.pathname,
    });

    cartTotal?.shimmer();

    fetch(`${Theme.routes.cart_change_url}`, fetchConfig("json", { body }))
      .then(response => {
        return response.text();
      })
      .then(responseText => {
        const parsedResponseText = JSON.parse(responseText);

        resetShimmer(this);

        if (parsedResponseText.errors) {
          this.#handleCartError(line, parsedResponseText);
          return;
        }

        const newSectionHTML = new DOMParser().parseFromString(
          parsedResponseText.sections[this.sectionId],
          "text/html"
        );

        // Grab the new cart item count from a hidden element
        const newCartHiddenItemCount = newSectionHTML.querySelector('[ref="cartItemCount"]')?.textContent;
        const newCartItemCount = newCartHiddenItemCount ? parseInt(newCartHiddenItemCount, 10) : 0;

        this.dispatchEvent(
          new CartUpdateEvent({}, this.sectionId, {
            itemCount: newCartItemCount,
            source: "cart-items-component",
            sections: parsedResponseText.sections,
          })
        );

        morphSection(this.sectionId, parsedResponseText.sections[this.sectionId]);
      })
      .catch(error => {
        console.error(error);
      })
      .finally(() => {
        this.#enableCartItems();
        cartPerformance.measureFromMarker(cartPerformaceUpdateMarker);
      });
  }

  /**
   * Handles the discount update.
   * @param {DiscountUpdateEvent} event - The event.
   */
  handleDiscountUpdate = event => {
    this.#handleCartUpdate(event);
  };

  /**
   * Handles the cart error.
   * @param {number} line - The line.
   * @param {Object} parsedResponseText - The parsed response text.
   * @param {string} parsedResponseText.errors - The errors.
   */
  #handleCartError = (line, parsedResponseText) => {
    const quantitySelector = this.refs.quantitySelectors[line - 1];
    const quantityInput = quantitySelector?.querySelector("input");

    if (!quantityInput) throw new Error("Quantity input not found");

    quantityInput.value = quantityInput.defaultValue;

    const cartItemError = this.refs[`cartItemError-${line}`];
    const cartItemErrorContainer = this.refs[`cartItemErrorContainer-${line}`];

    if (!(cartItemError instanceof HTMLElement)) throw new Error("Cart item error not found");
    if (!(cartItemErrorContainer instanceof HTMLElement)) throw new Error("Cart item error container not found");

    cartItemError.textContent = parsedResponseText.errors;
    cartItemErrorContainer.classList.remove("hidden");
  };

  /**
   * Handles the cart update.
   *
   * @param {DiscountUpdateEvent | CartUpdateEvent | CartAddEvent} event
   */
  #handleCartUpdate = event => {
    if (event instanceof DiscountUpdateEvent) {
      sectionRenderer.renderSection(this.sectionId, { cache: false });
      return;
    }
    if (event.target === this) return;

    const cartItemsHtml = event.detail.data.sections?.[this.sectionId];
    if (cartItemsHtml) {
      morphSection(this.sectionId, cartItemsHtml);
    } else {
      sectionRenderer.renderSection(this.sectionId, { cache: false });
    }
  };

  /**
   * Disables the cart items.
   */
  #disableCartItems() {
    this.classList.add("cart-items-disabled");
  }

  /**
   * Enables the cart items.
   */
  #enableCartItems() {
    this.classList.remove("cart-items-disabled");
  }

  /**
   * Gets the section id.
   * @returns {string} The section id.
   */
  get sectionId() {
    const { sectionId } = this.dataset;

    if (!sectionId) throw new Error("Section id missing");

    return sectionId;
  }
}

if (!customElements.get("cart-items-component")) {
  customElements.define("cart-items-component", CartItemsComponent);
}
