import { DialogComponent } from "@theme/dialog";
import { normalizeSectionId } from "@theme/section-renderer";
import BWWState from "@theme/bww-state";

const state = new BWWState({
  compareProducts: [],
  selectedProductsObject: {},
});

/**
 * A custom element that manages the compare drawer.
 * Can be triggered globally from anywhere on the page.
 *
 * @extends {DialogComponent}
 */
class CompareDrawerComponent extends DialogComponent {
  connectedCallback() {
    super.connectedCallback();

    // Make this drawer globally accessible
    // @ts-ignore - Adding global reference for easy access
    if (!window.compareDrawer) {
      // @ts-ignore
      window.compareDrawer = this;
    }

    // Initialize comparison mode
    this.comparisonMode = "internal"; // Default mode

    // Listen for dialog open event to load content
    this.addEventListener("dialog:open", this.#handleOpen);

    // Load and log compare data
    this.#loadCompareData();

    // Setup checkbox listeners
    this.#setupCheckboxListeners();

    // Setup disabled checkbox click listeners
    this.#setupDisabledCheckboxListeners();

    // Setup clear all button
    this.#setupClearAllButton();

    // Setup compare button
    this.#setupCompareButton();

    // Listen for comparison view events
    this.addEventListener("comparison:back", this.#handleComparisonBack);
    this.addEventListener("comparison:close", this.#handleComparisonClose);

    // Whenever the selection changes, update the dots and selected products display
    state.watch(
      "selectedProductsObject",
      () => {
        this.#syncCategoryIndicators();
        this.#enforceMaxDisabled();
        this.#renderSelectedProductsPills();
        this.#updateClearAllButton();
        this.#updateCompareButton();
      },
      { immediate: true, deep: false }
    );
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    // Clean up global reference
    // @ts-ignore
    if (window.compareDrawer === this) {
      // @ts-ignore
      window.compareDrawer = null;
    }

    // Clear any pending timeout
    if (this.maxLimitMessageTimeout) {
      clearTimeout(this.maxLimitMessageTimeout);
    }

    this.removeEventListener("dialog:open", this.#handleOpen);
    this.removeEventListener("comparison:back", this.#handleComparisonBack);
    this.removeEventListener("comparison:close", this.#handleComparisonClose);
  }

  /**
   * Loads compare data from JSON script tag
   */
  #loadCompareData() {
    const dataScript = this.querySelector("#compareDrawerData");
    if (dataScript) {
      try {
        const compareData = JSON.parse(dataScript.textContent);

        // Store data on the instance for later use
        this.compareData = compareData;

        // Store data in BWWState for global access
        state.setState("compareProducts", compareData);
        // @ts-ignore - dynamic state property
        console.log("Compare Products:", state.compareProducts);
      } catch (error) {
        console.error("Failed to parse compare drawer data:", error);
      }
    } else {
      console.warn("No compare drawer data found");
    }
  }

  /**
   * Setup checkbox listeners for product selection
   */
  #setupCheckboxListeners() {
    this.addEventListener("change", event => {
      const checkbox = /** @type {HTMLInputElement} */ (event.target);
      if (checkbox && checkbox.name === "compare-product") {
        this.#handleProductSelection(checkbox);
      }
    });
  }

  /**
   * Setup click listeners for disabled checkboxes to show max limit message
   */
  #setupDisabledCheckboxListeners() {
    this.addEventListener("click", event => {
      const target = /** @type {HTMLElement} */ (event.target);

      // Check if click is on a checkbox or its label
      let checkbox = null;
      if (target.tagName === "INPUT" && target.getAttribute("name") === "compare-product") {
        checkbox = /** @type {HTMLInputElement} */ (target);
      } else if (target.tagName === "LABEL") {
        const forId = target.getAttribute("for");
        if (forId) {
          // Use attribute selector to handle IDs that start with numbers
          checkbox = /** @type {HTMLInputElement} */ (this.querySelector(`[id="${forId}"]`));
        }
      }

      // If checkbox is disabled, show the message
      if (checkbox && checkbox.disabled && checkbox.name === "compare-product") {
        this.#showMaxLimitMessage();
      }
    });
  }

  /**
   * Show max limit message temporarily
   */
  #showMaxLimitMessage() {
    const message = /** @type {HTMLElement} */ (this.refs.maxLimitMessage);
    if (!message) return;

    // Clear any existing timeout
    if (this.maxLimitMessageTimeout) {
      clearTimeout(this.maxLimitMessageTimeout);
    }

    // Show message
    message.classList.remove("hidden");
    message.classList.add("flex");

    // Hide after 3 seconds
    this.maxLimitMessageTimeout = setTimeout(() => {
      this.#hideMaxLimitMessage();
    }, 3000);
  }

  /**
   * Hide max limit message
   */
  #hideMaxLimitMessage() {
    const message = /** @type {HTMLElement} */ (this.refs.maxLimitMessage);
    if (!message) return;

    message.classList.add("hidden");
    message.classList.remove("flex");
  }

  /**
   * Setup clear all button
   */
  #setupClearAllButton() {
    const clearButton = /** @type {HTMLButtonElement} */ (this.refs.clearAllButton);
    if (!clearButton) return;

    clearButton.addEventListener("click", () => this.#clearAllSelections());
  }

  /**
   * Update clear all button state based on selections
   */
  #updateClearAllButton() {
    const clearButton = /** @type {HTMLButtonElement} */ (this.refs.clearAllButton);
    if (!clearButton) return;

    // @ts-ignore - dynamic state property
    const selected = state.selectedProductsObject || {};
    const hasSelections = Object.keys(selected).length > 0;

    clearButton.disabled = !hasSelections;
    clearButton.classList.toggle("opacity-50", !hasSelections);
  }

  /**
   * Clear all product selections
   */
  #clearAllSelections() {
    // Uncheck all checkboxes
    this.querySelectorAll('input[name="compare-product"]:checked').forEach(el => {
      const checkbox = /** @type {HTMLInputElement} */ (el);
      checkbox.checked = false;
    });

    // Clear state
    state.setState("selectedProductsObject", {});
  }

  /**
   * Setup compare button
   */
  #setupCompareButton() {
    const compareButton = /** @type {HTMLButtonElement} */ (this.refs.compareButton);
    if (!compareButton) return;

    compareButton.addEventListener("click", () => this.#showComparisonView());
  }

  /**
   * Update compare button state based on selections
   */
  #updateCompareButton() {
    const compareButton = /** @type {HTMLButtonElement} */ (this.refs.compareButton);
    if (!compareButton) return;

    const max = this.#getMaxAllowed();
    const selected = this.#selectedCount();
    const isMaxSelected = selected === max;

    compareButton.disabled = !isMaxSelected;
    compareButton.classList.toggle("opacity-50", !isMaxSelected);
  }

  /**
   * Show comparison view and hide selection view
   * OR dispatch event if in external mode
   */
  #showComparisonView() {
    // Get selected products
    const selectedProducts = this.#getSelectedProductsForComparison();

    // Check if we're in external mode
    if (this.comparisonMode === "external") {
      // Dispatch event with selected products
      this.dispatchEvent(
        new CustomEvent("compare:products-selected", {
          detail: { products: selectedProducts },
          bubbles: true,
          composed: true,
        })
      );

      // Close the drawer
      this.close();
      return;
    }

    // Internal mode - show comparison inside drawer (existing behavior)
    const selectionView = /** @type {HTMLElement} */ (this.refs.selectionView);
    const comparisonView = /** @type {HTMLElement} */ (this.refs.comparisonView);
    const headerText = /** @type {HTMLElement} */ (this.refs.headerText);
    const footerSection = /** @type {HTMLElement} */ (this.refs.footerSection);
    const selectedProductsContainer = /** @type {HTMLElement} */ (this.refs.selectedProductsContainer);

    if (selectionView && comparisonView) {
      // Find comparison component and pass data
      const comparisonComponent = comparisonView.querySelector("comparison-chart-component");
      if (comparisonComponent) {
        // @ts-ignore - custom property
        comparisonComponent.products = selectedProducts;
      }

      // Update header text
      if (headerText) {
        const category = this.getAttribute("category-name") || "";
        headerText.textContent = `Compare ${category} Styles`;
      }

      // Hide selected products container
      if (selectedProductsContainer) {
        selectedProductsContainer.classList.add("hidden");
      }

      // Hide footer section
      if (footerSection) {
        footerSection.classList.add("hidden");
      }

      // Toggle views
      selectionView.classList.add("hidden");
      comparisonView.classList.remove("hidden");
    }
  }

  /**
   * Get selected products for comparison from state
   * @returns {Array<any>}
   */
  #getSelectedProductsForComparison() {
    /** @type {Array<any>} */
    const products = [];

    // @ts-ignore - dynamic state property
    const selectedObj = state.selectedProductsObject || {};
    // @ts-ignore - dynamic state property
    const compareData = state.compareProducts || {};

    // Get all selected product IDs from state
    Object.keys(selectedObj).forEach(categoryName => {
      Object.keys(selectedObj[categoryName]).forEach(productId => {
        const product = this.#findProductById(productId, compareData);
        if (product) products.push(product);
      });
    });

    return products;
  }

  /**
   * Find product by ID in compareData
   * @param {string|number} productId
   * @param {any} data
   */
  #findProductById(productId, data) {
    if (!data?.categories) return null;
    for (const category of data.categories) {
      const product = category.products?.find(/** @param {any} p */ p => String(p.id) === String(productId));
      if (product) return product;
    }
    return null;
  }

  /**
   * Handle back button from comparison view
   */
  #handleComparisonBack = () => {
    const selectionView = /** @type {HTMLElement} */ (this.refs.selectionView);
    const comparisonView = /** @type {HTMLElement} */ (this.refs.comparisonView);
    const headerText = /** @type {HTMLElement} */ (this.refs.headerText);
    const footerSection = /** @type {HTMLElement} */ (this.refs.footerSection);
    const selectedProductsContainer = /** @type {HTMLElement} */ (this.refs.selectedProductsContainer);

    if (selectionView && comparisonView) {
      // Restore header text
      if (headerText) {
        const category = this.getAttribute("category-name") || "";
        const maxProducts = this.#getMaxAllowed();
        headerText.innerHTML = `Choose <span class="text-brunt-orange">${maxProducts}</span> ${category} to Compare`;
      }

      // Show selected products container
      if (selectedProductsContainer) {
        selectedProductsContainer.classList.remove("hidden");
      }

      // Show footer section
      if (footerSection) {
        footerSection.classList.remove("hidden");
      }

      // Toggle views
      comparisonView.classList.add("hidden");
      selectionView.classList.remove("hidden");
    }
  };

  /**
   * Handle close button from comparison view
   */
  #handleComparisonClose = () => {
    this.close();
  };

  /**
   * Handles product selection/deselection
   * @param {HTMLInputElement} checkbox
   */
  #handleProductSelection(checkbox) {
    const productId = checkbox.value;
    const isChecked = checkbox.checked;
    const productRow = /** @type {HTMLElement} */ (checkbox.closest("[data-category]"));
    if (!productRow) return;

    const categoryName = productRow.dataset.category;
    if (!categoryName) return;

    // Deep copy to trigger reactivity
    // @ts-ignore
    const currentState = JSON.parse(JSON.stringify(state.selectedProductsObject || {}));

    if (!currentState[categoryName]) currentState[categoryName] = {};

    if (isChecked) {
      // If we're at limit already, immediately undo the click and bail.
      const max = this.#getMaxAllowed();
      const currentTotal = this.#selectedCount();
      if (currentTotal >= max) {
        checkbox.checked = false;
        return;
      }
      currentState[categoryName][productId] = true;
    } else {
      delete currentState[categoryName][productId];
      if (Object.keys(currentState[categoryName]).length === 0) delete currentState[categoryName];
    }

    state.setState("selectedProductsObject", currentState);

    // Immediate UI enforcement (also handled by watcher, but this feels snappier)
    this.#enforceMaxDisabled();
  }

  // Show the dot if that category has any selections
  // Note: Single-product categories don't have indicators since they don't use accordions
  #syncCategoryIndicators() {
    // @ts-ignore - dynamic state property
    const map = state.selectedProductsObject || {};
    this.querySelectorAll(".category-indicator").forEach(el => {
      const cat = el.getAttribute("data-category-indicator");
      const hasAny = !!map[cat] && Object.keys(map[cat]).length > 0;
      el.classList.toggle("hidden", !hasAny);
    });
  }

  // Render selected products as pills
  #renderSelectedProductsPills() {
    const container = /** @type {HTMLElement} */ (this.refs.selectedProductsContainer);
    if (!container) return;

    // @ts-ignore - dynamic state property
    const selected = state.selectedProductsObject || {};
    const productData = this.compareData || {};

    // Clear container
    container.innerHTML = "";
    container.classList.remove("mt-5");

    // Iterate through categories and selected products
    Object.keys(selected).forEach(categoryName => {
      Object.keys(selected[categoryName]).forEach(productId => {
        // Find product name from compareData
        const product = this.#findProductById(productId, productData);
        const productName = product?.title || "Unknown Product";

        // Create pill element
        const pill = document.createElement("div");
        pill.className =
          "px-3 py-1.5 bg-white outline outline-1 outline-offset-[-1px] outline-stone-200 inline-flex justify-start items-center gap-2 overflow-hidden cursor-pointer";
        pill.innerHTML = `
          <p class="text-14-light">${productName}</p>
          <svg class="w-[14px] h-[14px]" viewBox="0 0 20 20" fill="none">
            <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        `;

        // Handle click to deselect
        pill.addEventListener("click", () => this.#deselectProduct(productId));

        container.classList.add("mt-5");
        container.appendChild(pill);
      });
    });
  }

  /**
   * Deselect a product
   * @param {string|number} productId
   */
  #deselectProduct(productId) {
    // Find and uncheck the checkbox
    const checkbox = /** @type {HTMLInputElement} */ (
      this.querySelector(`input[name="compare-product"][value="${productId}"]`)
    );
    if (checkbox) {
      checkbox.checked = false;
      // Trigger change event to update state
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  #getMaxAllowed() {
    // Prefer value from JSON (state.compareProducts.maxProducts),
    // fallback to 2.
    // @ts-ignore - dynamic state property
    const fromState = Number(state.compareProducts?.maxProducts);
    return Number.isFinite(fromState) ? fromState : 2;
  }

  #selectedCount() {
    // @ts-ignore
    const map = state.selectedProductsObject || {};
    let total = 0;
    for (const cat in map) total += Object.keys(map[cat]).length;
    return total;
  }

  /**
   * Disable/enable unchecked checkboxes based on limit.
   * Keep already-checked items always enabled.
   */
  #enforceMaxDisabled() {
    const max = this.#getMaxAllowed();
    const selected = this.#selectedCount();
    const shouldDisableOthers = selected >= max;

    this.querySelectorAll('input[name="compare-product"]').forEach(el => {
      const input = /** @type {HTMLInputElement} */ (el);
      if (input.checked) {
        input.disabled = false;
      } else {
        input.disabled = shouldDisableOthers;
      }

      // Optional: add a subtle visual for disabled rows
      const row = input.closest("[data-category]");
      if (row) row.classList.toggle("opacity-50", input.disabled && !input.checked);
    });
  }

  /**
   * Handles drawer open event - restores state from memory
   * @param {Event} event
   */
  #handleOpen = event => {
    // Check for comparison mode from the triggering element
    // @ts-ignore - custom event detail
    const triggerElement = event.detail?.triggerElement;
    if (triggerElement) {
      const mode = triggerElement.getAttribute("data-comparison-mode");
      this.comparisonMode = mode === "external" ? "external" : "internal";
    } else {
      // Default to internal mode if no trigger element
      this.comparisonMode = "internal";
    }

    // Restore checkbox states from persisted state
    this.#restoreCheckboxStates();

    // Update the UI
    this.#syncCategoryIndicators();
    this.#enforceMaxDisabled();
    this.#renderSelectedProductsPills();
    this.#updateClearAllButton();
    this.#updateCompareButton();
  };

  /**
   * Restore checkbox states from the persisted state
   */
  #restoreCheckboxStates() {
    // @ts-ignore - dynamic state property
    const selected = state.selectedProductsObject || {};

    // First, uncheck all checkboxes
    this.querySelectorAll('input[name="compare-product"]').forEach(el => {
      const checkbox = /** @type {HTMLInputElement} */ (el);
      checkbox.checked = false;
    });

    // Then, check the ones that should be checked based on state
    Object.keys(selected).forEach(categoryName => {
      Object.keys(selected[categoryName]).forEach(productId => {
        const checkbox = /** @type {HTMLInputElement} */ (
          this.querySelector(`input[name="compare-product"][value="${productId}"]`)
        );
        if (checkbox) {
          checkbox.checked = true;
        }
      });
    });
  }

  /**
   * Public method to open the compare drawer from anywhere
   * @param {Event} [event] - Optional triggering event
   */
  open(event) {
    this.showDialog(event);
  }

  /**
   * Public method to close the compare drawer from anywhere
   */
  close() {
    this.closeDialog();
  }

  /**
   * Public method to toggle the compare drawer from anywhere
   */
  toggle() {
    this.toggleDialog();
  }

  /**
   * Gets the section ID from the closest section
   * @returns {string} The section ID (normalized, without 'shopify-section-' prefix)
   */
  get sectionId() {
    const section = this.closest(".shopify-section");
    if (!section?.id) throw new Error("Compare drawer must be inside a shopify section");
    return normalizeSectionId(section.id);
  }
}

if (!customElements.get("compare-drawer-component")) {
  customElements.define("compare-drawer-component", CompareDrawerComponent);
}
