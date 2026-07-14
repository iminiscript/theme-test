import { Component } from "@theme/component";
import { sectionRenderer, morphSection, normalizeSectionId } from "@theme/section-renderer";

class ProductStyleSelector extends Component {
  constructor() {
    super();
    this.selections = {};
    this.currentHandle = null;
    this.products = [];
    this.categories = [];
    this.categoryArray = [];
    this.sectionId = null;
    this.blockId = null;
    this.updateSectionTimeout = null;
    this.isUpdatingSection = false;
    this.DEBOUNCE_DELAY = 300;
    // Bind click handler in constructor to enable proper cleanup
    this._onClick = this.handleOptionClick.bind(this);
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

  disconnectedCallback() {
    super.disconnectedCallback();
    // Remove click listener when component is disconnected
    this.removeEventListener("click", this._onClick);
  }

  init() {
    // Get block ID from data attribute
    this.blockId = this.dataset.blockId;
    if (!this.blockId) {
      return;
    }

    // Find the data script
    const dataScript = this.querySelector(`#styleSelectorData-${this.blockId}`);
    if (!dataScript) {
      return;
    }

    // Parse products data
    let productsData;
    try {
      productsData = JSON.parse(dataScript.textContent);
    } catch (error) {
      console.error("[Product Style Selector] Error parsing data:", error);
      return;
    }

    const { products, categories, currentProductHandle } = productsData;
    if (!products || !categories) {
      return;
    }

    this.products = products;
    this.categories = categories;
    this.currentHandle = currentProductHandle || null;

    // Get section ID from block
    this.sectionId = this.dataset.sectionId;
    if (!this.sectionId) {
      // Fallback: find parent section
      let element = this;
      let depth = 0;
      while (element && element !== document.body && depth < 20) {
        if (element.classList && element.classList.contains("shopify-section")) {
          const foundId = element.id;
          this.sectionId = foundId.startsWith("shopify-section-") ? foundId.replace("shopify-section-", "") : foundId;
          break;
        }
        element = element.parentElement;
        depth++;
      }
    } else {
      // Normalize section ID (remove 'shopify-section-' prefix if present)
      if (this.sectionId.startsWith("shopify-section-")) {
        this.sectionId = this.sectionId.replace("shopify-section-", "");
      }
    }

    if (!this.sectionId) {
      console.warn("[Product Style Selector] Could not determine section ID");
      return;
    }

    // Initialize selections from current product style (from data attributes or DOM)
    this.initializeSelections();

    // Get category fieldsets
    const categoryFieldsets = this.querySelectorAll(".product__styleCategory");
    this.categoryArray = Array.from(categoryFieldsets);

    // Set up event listener (remove before re-adding to avoid duplicates)
    this.removeEventListener("click", this._onClick);
    this.addEventListener("click", this._onClick);

    // Run initial setup
    this.setInitialSelectedState();
    this.initialDisableButtons();
  }

  /**
   * Initialize selections from current product style
   * This reads from the DOM state that was set by Liquid
   */
  initializeSelections() {
    this.selections = {};

    // Get all category fieldsets and extract current selections from DOM
    const categoryFieldsets = this.querySelectorAll(".product__styleCategory");
    categoryFieldsets.forEach((fieldset, index) => {
      const category = this.categories[index];
      if (!category) return;

      // Find the selected button
      const selectedButton = fieldset.querySelector(".product__styleOption--selected");
      if (selectedButton) {
        const option = selectedButton.dataset.option;
        if (option) {
          this.selections[category.name] = option;
        }
      }
    });
  }

  /**
   * Check if a product matches the given selections
   * @param {Object} product - Product object with product_style metafield
   * @param {Object} testSelections - Selections to test against
   * @returns {boolean}
   */
  productMatchesSelections(product, testSelections) {
    if (!product.product_style || !Array.isArray(product.product_style)) {
      return false;
    }

    // Check if all selections are present in product_style
    for (const [, option] of Object.entries(testSelections)) {
      if (!product.product_style.includes(option)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Find the best matching product for given selections
   * @param {Object} testSelections - Selections to match
   * @param {number} [fixedCategoryIndex] - Optional: category index to keep fixed (for interacted category)
   * @returns {Object|null} - Best matching product or null
   */
  findBestMatch(testSelections, fixedCategoryIndex = null) {
    // First, try exact match
    for (const product of this.products) {
      if (this.productMatchesSelections(product, testSelections)) {
        return product;
      }
    }

    // If no exact match and we have a fixed category, try changing subsequent categories
    if (fixedCategoryIndex !== null && fixedCategoryIndex < this.categories.length - 1) {
      const fixedCategory = this.categories[fixedCategoryIndex];
      const fixedSelection = testSelections[fixedCategory.name];

      if (fixedSelection) {
        // Try all combinations of subsequent categories while keeping fixed category
        const categoriesAfter = this.categories.slice(fixedCategoryIndex + 1);

        const trySubsequentCombinations = (categoryIndex, accumulatedSelections) => {
          if (categoryIndex >= categoriesAfter.length) {
            // We've built a complete combination, check if any product matches
            const combinedSelections = { ...testSelections, ...accumulatedSelections };
            for (const product of this.products) {
              if (this.productMatchesSelections(product, combinedSelections)) {
                return product;
              }
            }
            return null;
          }

          const category = categoriesAfter[categoryIndex];
          // Try each option for this category
          for (const option of category.options) {
            const newSelections = { ...accumulatedSelections, [category.name]: option };
            const result = trySubsequentCombinations(categoryIndex + 1, newSelections);
            if (result) return result;
          }

          return null;
        };

        const result = trySubsequentCombinations(0, {});
        if (result) {
          return result;
        }
      }
    }

    // Fallback: try removing selections one by one from the end (least priority)
    const selectionKeys = Object.keys(testSelections);
    if (selectionKeys.length === 0) {
      return null;
    }

    // Find the category indices for the selections
    const selectionIndices = selectionKeys
      .map(key => {
        return this.categories.findIndex(cat => cat.name === key);
      })
      .filter(idx => idx !== -1)
      .sort((a, b) => a - b);

    if (selectionIndices.length === 0) {
      return null;
    }

    // Try removing selections one by one from the end (least priority)
    for (let i = selectionIndices.length - 1; i >= 0; i--) {
      const categoryIndex = selectionIndices[i];
      // Skip if this is the fixed category
      if (categoryIndex === fixedCategoryIndex) {
        continue;
      }

      const categoryName = this.categories[categoryIndex].name;
      const partialSelections = { ...testSelections };
      delete partialSelections[categoryName];

      // Try exact match with partial selections
      for (const product of this.products) {
        if (this.productMatchesSelections(product, partialSelections)) {
          return product;
        }
      }
    }

    return null;
  }

  /**
   * Strictly check if a product matches the given selections (exact match only, no fallback)
   * @param {Object} testSelections - Selections to match
   * @returns {Object|null} - Product object if exact match found, null otherwise
   */
  findStrictMatch(testSelections) {
    for (const product of this.products) {
      if (this.productMatchesSelections(product, testSelections)) {
        return product;
      }
    }
    return null;
  }

  /**
   * Check if there are any valid combinations for categories after a given category index
   * @param {number} startCategoryIndex - Index to start checking from (exclusive)
   * @param {Object} baseSelections - Base selections to keep fixed
   * @returns {Object|null} - Product object if valid combination found, null otherwise
   */
  hasValidCombinationsAfter(startCategoryIndex, baseSelections) {
    // If we're at or past the last category, there are no categories after
    if (startCategoryIndex >= this.categories.length - 1) {
      // Use strict match - must match exactly
      const match = this.findStrictMatch(baseSelections);
      return match;
    }

    // Get categories after the start index (exclusive)
    const categoriesAfter = this.categories.slice(startCategoryIndex + 1);

    if (categoriesAfter.length === 0) {
      // No categories after, just check if base selections match exactly
      const match = this.findStrictMatch(baseSelections);
      return match;
    }

    // Try all combinations of options for categories after
    const tryCombinations = (categoryIndex, accumulatedSelections) => {
      if (categoryIndex >= categoriesAfter.length) {
        // We've built a complete combination, check if any product matches exactly
        const combinedSelections = { ...baseSelections, ...accumulatedSelections };
        const match = this.findStrictMatch(combinedSelections);
        return match;
      }

      const category = categoriesAfter[categoryIndex];

      // Try each option for this category
      for (const option of category.options) {
        const newSelections = { ...accumulatedSelections, [category.name]: option };
        const match = tryCombinations(categoryIndex + 1, newSelections);
        if (match) {
          return match; // Found at least one valid combination, return the product
        }
      }

      return null; // No valid combinations found
    };

    return tryCombinations(0, {});
  }

  /**
   * Build selections object with only selections from categories up to and including a given index
   * @param {number} maxCategoryIndex - Maximum category index to include
   * @returns {Object} - Selections object with only relevant categories
   */
  buildSelectionsUpTo(maxCategoryIndex) {
    const result = {};
    for (let i = 0; i <= maxCategoryIndex && i < this.categories.length; i++) {
      const categoryName = this.categories[i].name;
      if (this.selections[categoryName]) {
        result[categoryName] = this.selections[categoryName];
      }
    }
    return result;
  }

  /**
   * Update state based on best matching product
   * This function auto-corrects selections and UI to match the best product
   * @param {Object} newProduct - The best matching product object
   */
  updateState(newProduct) {
    if (!newProduct || !newProduct.product_style || !Array.isArray(newProduct.product_style)) {
      return;
    }

    // Iterate through all categories
    this.categories.forEach((category, catIndex) => {
      // Find the matching option within the newProduct.product_style array
      const matchedOption = category.options.find(option => newProduct.product_style.includes(option));

      if (matchedOption) {
        // Update the global selections object
        this.selections[category.name] = matchedOption;

        // Update the UI
        const categoryFieldset = this.categoryArray[catIndex];
        if (categoryFieldset) {
          // Update the selected option display
          const selectionText = categoryFieldset.querySelector(".product__styleCategorySelection");
          if (selectionText) {
            selectionText.textContent = matchedOption;
          }

          // Find all buttons in this category
          const categoryButtons = categoryFieldset.querySelectorAll(".product__styleOption");

          categoryButtons.forEach(btn => {
            const isSelected = btn.dataset.option === matchedOption;

            // Remove selected class from all buttons first, then add to selected one
            btn.classList.remove("product__styleOption--selected");
            if (isSelected) {
              btn.classList.add("product__styleOption--selected");
            }

            btn.setAttribute("aria-pressed", isSelected);
          });
        }
      }
    });
  }

  /**
   * Set initial selected state for buttons based on current selections
   */
  setInitialSelectedState() {
    this.categories.forEach((category, catIndex) => {
      const categoryFieldset = this.categoryArray[catIndex];
      if (!categoryFieldset) {
        return;
      }

      const selectedOption = this.selections[category.name];
      if (!selectedOption) {
        return;
      }

      const categoryButtons = categoryFieldset.querySelectorAll(".product__styleOption");
      categoryButtons.forEach(btn => {
        const isSelected = btn.dataset.option === selectedOption;
        btn.classList.toggle("product__styleOption--selected", isSelected);
        btn.setAttribute("aria-pressed", isSelected);
      });
    });
  }

  /**
   * Disable buttons that don't have valid combinations on initial page load
   */
  initialDisableButtons() {
    // Iterate through all categories
    this.categories.forEach((category, i) => {
      const categoryFieldset = this.categoryArray[i];
      if (!categoryFieldset) {
        return;
      }

      // Build base selections from categories BEFORE the current one being checked
      // This captures all current selections from categories before the one being processed
      const baseSelections = this.buildSelectionsUpTo(i - 1);

      // Iterate through all options for the current category
      category.options.forEach(optionValue => {
        // Create test selections: base selections + this option
        const testSelections = { ...baseSelections, [category.name]: optionValue };

        // Check for valid combinations
        const matchedProduct = this.hasValidCombinationsAfter(i, testSelections);
        const hasCombinations = matchedProduct !== null;

        // Find the corresponding button in the DOM
        const categoryButtons = categoryFieldset.querySelectorAll(".product__styleOption");
        const button = Array.from(categoryButtons).find(btn => btn.dataset.option === optionValue);

        if (!button) {
          return;
        }

        // Apply disabling logic using product__styleOption--disabled class
        if (!hasCombinations) {
          // No valid combinations - disable the button
          button.disabled = true;
          button.classList.add("product__styleOption--disabled");
          button.classList.remove("opacity-50", "cursor-not-allowed");
          button.style.pointerEvents = "none";
        } else {
          // Has valid combinations - ensure button is enabled
          button.disabled = false;
          button.classList.remove("product__styleOption--disabled", "opacity-50", "cursor-not-allowed");
          button.style.pointerEvents = "";
        }
      });
    });
  }

  /**
   * Update button states for categories after the interacted one
   * @param {number} interactedCategoryIndex - Index of the category that was interacted with
   */
  updateButtonsAfterCategory(interactedCategoryIndex) {
    if (interactedCategoryIndex >= this.categories.length - 1) {
      return; // No categories after
    }

    // Get all categories after the interacted one
    const categoriesAfter = this.categories.slice(interactedCategoryIndex + 1);

    categoriesAfter.forEach((category, relativeIndex) => {
      const absoluteIndex = interactedCategoryIndex + 1 + relativeIndex;

      const categoryFieldset = this.categoryArray[absoluteIndex];
      if (!categoryFieldset) {
        return;
      }

      // Build base selections from categories BEFORE the current one being checked
      // This includes all selections from categories 0, 1, ..., absoluteIndex - 1
      // This ensures we keep all selections from categories above (before) the current one
      const baseSelections = this.buildSelectionsUpTo(absoluteIndex - 1);

      // Check ALL options from the category data, not just buttons in DOM
      // This ensures we check every possible option
      category.options.forEach(optionValue => {
        // Create test selections: base selections (from categories before) + this option
        // We explicitly use this option, ignoring any current selection in this category
        const testSelections = { ...baseSelections, [category.name]: optionValue };

        // Check if selecting this option allows for valid combinations in remaining categories
        // We pass absoluteIndex so it checks categories AFTER this one (absoluteIndex + 1, absoluteIndex + 2, etc.)
        const matchedProduct = this.hasValidCombinationsAfter(absoluteIndex, testSelections);
        const hasCombinations = matchedProduct !== null;

        // Find the corresponding button in the DOM
        const categoryButtons = categoryFieldset.querySelectorAll(".product__styleOption");
        const button = Array.from(categoryButtons).find(btn => btn.dataset.option === optionValue);

        if (!button) {
          return;
        }

        if (hasCombinations) {
          button.disabled = false;
          button.classList.remove("product__styleOption--disabled", "opacity-50", "cursor-not-allowed");
          button.style.pointerEvents = "";
        } else {
          button.disabled = true;
          button.classList.add("product__styleOption--disabled");
          button.classList.remove("opacity-50", "cursor-not-allowed");
          button.style.pointerEvents = "none";
        }
      });
    });
  }

  /**
   * Handle option button click using event delegation
   * @param {Event} event
   */
  handleOptionClick(event) {
    // Use event delegation - check if the clicked element is a style option button
    const button = event.target.closest(".product__styleOption");
    if (!button) {
      return; // Not a style option button, ignore
    }

    const category = button.dataset.category;
    const option = button.dataset.option;

    if (!category || !option) {
      return;
    }

    // Find the category index
    const categoryIndex = this.categories.findIndex(cat => cat.name === category);
    if (categoryIndex === -1) {
      return;
    }

    // Update selection
    this.selections[category] = option;

    // Update button states in this category
    const categoryFieldset = this.categoryArray[categoryIndex];
    if (categoryFieldset) {
      const categoryButtons = categoryFieldset.querySelectorAll(".product__styleOption");
      categoryButtons.forEach(btn => {
        const isSelected = btn === button;
        btn.classList.toggle("product__styleOption--selected", isSelected);
        btn.setAttribute("aria-pressed", isSelected);
      });

      // Update selection display
      const selectionText = categoryFieldset.querySelector(".product__styleCategorySelection");
      if (selectionText) {
        selectionText.textContent = option;
      }
    }

    // Find best matching product, keeping the interacted category fixed
    const bestMatch = this.findBestMatch(this.selections, categoryIndex);

    // If best match is found, update state to auto-correct selections
    if (bestMatch) {
      this.updateState(bestMatch);

      // Check if the product handle has changed
      if (bestMatch.handle && bestMatch.handle !== this.currentHandle) {
        this.currentHandle = bestMatch.handle;
        // Debounced section update
        this.debouncedUpdateSection(bestMatch.handle);
      }
    }

    // Update buttons for categories after this one
    this.updateButtonsAfterCategory(categoryIndex);
  }

  /**
   * Debounced function to update section with new product
   * @param {string} productHandle - The new product handle
   */
  debouncedUpdateSection(productHandle) {
    // Clear existing timeout
    if (this.updateSectionTimeout) {
      clearTimeout(this.updateSectionTimeout);
    }

    // Set new timeout
    this.updateSectionTimeout = setTimeout(() => {
      this.updateSectionWithProduct(productHandle);
    }, this.DEBOUNCE_DELAY);
  }

  /**
   * Updates the section using Section Rendering API with new product
   * Uses standardized sectionRenderer for fetching, caching, and morphing
   * @param {string} productHandle - The new product handle
   */
  async updateSectionWithProduct(productHandle) {
    if (!this.sectionId || !productHandle) {
      return;
    }

    // Prevent concurrent updates
    if (this.isUpdatingSection) {
      return;
    }

    this.isUpdatingSection = true;

    try {
      // Build product URL with section_id parameter
      const productUrl = "/products/" + productHandle;
      const targetUrl = new URL(productUrl, window.location.origin);
      targetUrl.searchParams.set("section_id", this.sectionId);

      // Use sectionRenderer to get the section HTML (handles caching, aborting, etc.)
      const sectionHTML = await sectionRenderer.getSectionHTML(this.sectionId, false, targetUrl);

      if (!sectionHTML) {
        throw new Error("No section HTML found in response");
      }

      // Add data-skip-subtree-update to style selector in new HTML before morphing
      // This is required because the morph function checks for this attribute on BOTH old and new nodes
      const parser = new DOMParser();
      const doc = parser.parseFromString(sectionHTML, "text/html");
      const normalizedSectionId = normalizeSectionId(this.sectionId);
      const sectionSelector = "shopify-section-" + normalizedSectionId;
      const newSectionElement = doc.getElementById(sectionSelector);

      if (newSectionElement) {
        const newStyleSelector = newSectionElement.querySelector(`[data-block-id="${this.blockId}"]`);
        if (newStyleSelector) {
          newStyleSelector.setAttribute("data-skip-subtree-update", "true");
          // Get the modified section HTML
          const modifiedSectionHTML = newSectionElement.outerHTML;

          // Use morphSection from section-renderer (handles lazy images automatically)
          await morphSection(normalizedSectionId, modifiedSectionHTML);
        } else {
          // Fallback: use morphSection directly if style selector not found
          await morphSection(normalizedSectionId, sectionHTML);
        }
      } else {
        // Fallback: use morphSection directly
        await morphSection(normalizedSectionId, sectionHTML);
      }

      // Re-initialize all blocks after morph completes
      await this.reinitializeBlocks(normalizedSectionId);
    } catch (error) {
      console.error("[Product Style Selector] Error updating section:", error);
    } finally {
      this.isUpdatingSection = false;
    }
  }

  /**
   * Re-initializes all blocks in the section after morphing
   * @param {string} normalizedSectionId - The normalized section ID
   */
  async reinitializeBlocks(normalizedSectionId) {
    // Use requestAnimationFrame to ensure DOM is fully updated
    await new Promise(resolve => requestAnimationFrame(resolve));

    const sectionSelector = "shopify-section-" + normalizedSectionId;
    const sectionElement = document.getElementById(sectionSelector);
    if (!sectionElement) {
      return;
    }

    // Find all blocks in the section (excluding style selector)
    const blocks = sectionElement.querySelectorAll("[data-block-id]");

    blocks.forEach(block => {
      // Skip style selector block
      if (block.dataset.blockId === this.blockId.toString()) {
        return;
      }

      // Re-execute inline scripts (non-module scripts)
      const scripts = block.querySelectorAll(
        'script:not([type="module"]):not([src]):not([type="application/json"]):not([type="application/ld+json"])'
      );
      scripts.forEach(script => {
        try {
          // Create and execute a new script element
          const newScript = document.createElement("script");
          // Copy all attributes
          Array.from(script.attributes).forEach(attr => {
            newScript.setAttribute(attr.name, attr.value);
          });
          newScript.textContent = script.textContent;

          // Replace the old script with the new one to trigger execution
          if (script.parentNode) {
            script.parentNode.replaceChild(newScript, script);
          }
        } catch (error) {
          console.warn("[Product Style Selector] Error executing script:", error);
        }
      });

      // Trigger updatedCallback if it's a Component instance
      // Note: morph.js already calls updatedCallback via onAfterUpdate hook,
      // but we ensure it's called here as well for any edge cases
      if (block.updatedCallback && typeof block.updatedCallback === "function") {
        try {
          block.updatedCallback();
        } catch (error) {
          console.warn("[Product Style Selector] Error in block updatedCallback:", error);
        }
      }

      // Dispatch custom event for block update
      const event = new CustomEvent("block:updated", {
        detail: { blockId: block.dataset.blockId },
        bubbles: true,
      });
      block.dispatchEvent(event);
    });

    // Dispatch section updated event
    const sectionEvent = new CustomEvent("section:updated", {
      detail: { sectionId: normalizedSectionId },
      bubbles: true,
    });
    sectionElement.dispatchEvent(sectionEvent);
  }
}

if (!customElements.get("product-style-selector")) {
  customElements.define("product-style-selector", ProductStyleSelector);
}
