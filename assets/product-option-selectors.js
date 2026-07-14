import { Component } from "@theme/component";

class ProductOptionSelectors extends Component {
  constructor() {
    super();
    this.blockId = null;
    this.productId = null;
    this.sectionId = null;
    this.form = null;
    this.variantIdInput = null;
    this.variants = [];
    this.options = [];
    this.variantData = null;
    this.isInitialized = false;
    this.addToCartComponents = [];
  }

  connectedCallback() {
    super.connectedCallback();
    this.init();
  }

  updatedCallback() {
    super.updatedCallback();
    this.isInitialized = false;
    this.init();
  }

  init() {
    if (this.isInitialized) return;

    this.blockId = this.dataset.blockId;
    if (!this.blockId) return;

    const productIdAttr = this.dataset.productId;
    if (productIdAttr) {
      this.productId = parseInt(productIdAttr, 10);
    }

    this.sectionId = this.dataset.sectionId;
    if (!this.sectionId) {
      const section = this.closest(".shopify-section");
      if (section) {
        const foundId = section.id;
        this.sectionId = foundId.startsWith("shopify-section-") ? foundId.replace("shopify-section-", "") : foundId;
      }
    } else {
      if (this.sectionId.startsWith("shopify-section-")) {
        this.sectionId = this.sectionId.replace("shopify-section-", "");
      }
    }

    // [OPTIMIZATION] Find linked Add to Cart components
    // 1. Specific Match: Buttons linked directly to this product (e.g. Sticky Bar)
    const productMatches = this.productId
      ? Array.from(document.querySelectorAll(`product-add-to-cart[data-product-id="${this.productId}"]`))
      : [];

    // 2. Section Match: Shared buttons in the same section (e.g. Bundle ATC)
    const sectionMatches = this.sectionId
      ? Array.from(document.querySelectorAll(`product-add-to-cart[data-section-id="${this.sectionId}"]`))
      : [];

    // 3. Bundle Mode Match: Find any bundle-mode add-to-cart buttons on the page
    // This enables cross-section communication for bundle pages where option selectors
    // are in different sections than the shared add-to-cart button
    const bundleModeMatches = Array.from(document.querySelectorAll("product-add-to-cart[data-items]"));

    // Merge unique components
    const allTargets = new Set([...productMatches, ...sectionMatches, ...bundleModeMatches]);
    this.addToCartComponents = Array.from(allTargets);

    this.form = this.querySelector("[data-variant-picker-form]");
    if (!this.form) return;

    if (this.form.dataset.variantSelectorInitialized === "true") return;
    this.form.dataset.variantSelectorInitialized = "true";

    this.variantIdInput = this.form.querySelector("[data-variant-id-input]");
    if (!this.variantIdInput) return;

    const variantDataResult = this._parseJsonData(this.form, "[data-variant-data]");
    if (variantDataResult === false) return;
    if (variantDataResult !== null) this.variantData = variantDataResult;

    const variantsResult = this._parseJsonData(this.form, "[data-all-variants-data]");
    if (variantsResult === false) return;
    if (variantsResult !== null) this.variants = variantsResult;

    const optionsResult = this._parseJsonData(this, "[data-product-options]");
    if (optionsResult === false) return;
    if (optionsResult !== null) this.options = optionsResult;

    this.setupEventListeners();
    this.initializeForm();

    this.isInitialized = true;
  }

  _parseJsonData(container, selector) {
    const script = container.querySelector(selector);
    if (!script) return null;
    try {
      return JSON.parse(script.textContent);
    } catch (e) {
      console.error(`[Product Option Selectors] Error parsing JSON data from ${selector}:`, e);
      return false;
    }
  }

  setupEventListeners() {
    this._onChange = event => {
      this.handleOptionChange(event);
    };
    this._onInput = event => {
      if (event.target.type === "radio") this.handleOptionChange(event);
    };
    this._onClick = event => {
      const genderButton = event.target.closest("[data-gender]");
      if (genderButton) this.handleGenderToggle(genderButton);
    };

    this.form.addEventListener("change", this._onChange);
    this.form.addEventListener("input", this._onInput);
    this.addEventListener("click", this._onClick);
  }

  disconnectedCallback() {
    super.disconnectedCallback?.();
    if (this.form) {
      if (this._onChange) this.form.removeEventListener("change", this._onChange);
      if (this._onInput) this.form.removeEventListener("input", this._onInput);
    }
    if (this._onClick) this.removeEventListener("click", this._onClick);

    this._onChange = null;
    this._onInput = null;
    this._onClick = null;
    this.addToCartComponents = [];
  }

  findVariantId(selectedOptions) {
    const { variants, options } = this;
    const variantOptions = Object.fromEntries(Object.entries(selectedOptions).filter(([key]) => key !== "boot-width"));

    const matchingVariant = variants.find(variant => {
      return options.every((option, i) => {
        const optionPosition = option.position.toString();
        const optionValue = variant.options[i];
        return variantOptions[optionPosition] === optionValue;
      });
    });

    return matchingVariant?.id ?? null;
  }

  getSelectedOptions() {
    const selectedOptions = {};
    const inputs = this.form.querySelectorAll('input[type="radio"]:checked:not([data-non-variant-option])');
    inputs.forEach(input => {
      const position = input.dataset.optionPosition;
      if (position) {
        selectedOptions[position] = input.value;
      }
    });
    return selectedOptions;
  }

  updateVariantId(changedOptionPosition = null) {
    const { variantIdInput, variants, sectionId, productId } = this;
    const selectedOptions = this.getSelectedOptions();
    const variantId = this.findVariantId(selectedOptions);
    const variant = variantId ? variants.find(v => v.id === variantId) : null;

    if (variantId) {
      variantIdInput.value = variantId;

      const url = new URL(window.location.href);
      url.searchParams.set("variant", variantId);
      // Find the variant object
      const variant = variants.find(v => v.id === variantId);

      // Update URL with variant ID ONLY if not inside a bundle-showcase context
      // Bundle showcases handle their own state and shouldn't pollute the page URL
      const isInBundleShowcase = this.closest("bundle-showcase-component");

      if (!isInBundleShowcase) {
        const url = new URL(window.location.href);
        url.searchParams.set("variant", variantId);

        if (url.href !== window.location.href) {
          window.history.replaceState({}, "", url.toString());
        }
      }

      const eventDetail = {
        variant,
        variantId,
        sectionId,
        productId: variant?.product_id ?? productId,
        changedOptionPosition,
      };

      const event = new CustomEvent("variant:changed", {
        detail: eventDetail,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);
    }

    this.updateAddToCartComponent(variant);
  }

  updateAddToCartComponent(variant = null) {
    if (!this.addToCartComponents || this.addToCartComponents.length === 0) return;

    if (!variant) {
      const selectedOptions = this.getSelectedOptions();
      const variantId = this.findVariantId(selectedOptions);
      if (variantId) {
        variant = this.variants.find(v => v.id === variantId);
      }
    }

    const isWomenSelected = Array.from(this.querySelectorAll('[data-gender="women"]')).some(btn =>
      btn.classList.contains("product-options__gender-tab--active")
    );

    const properties = {};
    if (isWomenSelected) {
      properties._women_size_selected = true;
    }
    const propertiesJson = JSON.stringify(properties);

    // Get sold_out tag status from data attribute
    const hasSoldOutTag = this.dataset.soldOut === "true";

    this.addToCartComponents.forEach(component => {
      // [BUNDLE MODE] Shared button with data-items array
      if (component.hasAttribute("data-items")) {
        let items = [];
        try {
          items = JSON.parse(component.dataset.items);
        } catch (e) {
          console.error(`[Product Option Selectors] Error parsing JSON data from ${component.dataset.items}:`, e);
        }

        // Use blockId as unique key to support multiple selectors for same product
        let itemIndex = items.findIndex(i => i._selector_id === this.blockId);

        if (itemIndex === -1) {
          itemIndex = items.length;
          items.push({
            product_id: this.productId,
            _selector_id: this.blockId, // Internal tracking ID
          });
        }

        if (variant) {
          items[itemIndex].id = variant.id;
          items[itemIndex].price = variant.price;
          items[itemIndex].compare_at_price = variant.compare_at_price;
          items[itemIndex].available = variant.available;
          items[itemIndex].inventory_policy = variant.inventory_policy;
          items[itemIndex].inventory_quantity = variant.inventory_quantity;
          items[itemIndex].requires_selling_plan = variant.requires_selling_plan || false;
          items[itemIndex].has_sold_out_tag = hasSoldOutTag;
          // Merge properties specifically for this item
          items[itemIndex].properties = {
            ...(items[itemIndex].properties || {}),
            ...properties,
          };
        } else {
          items[itemIndex].id = null;
          items[itemIndex].available = false;
        }

        component.dataset.items = JSON.stringify(items);
      }

      // [SINGLE MODE] Specific button for this product
      else if (component.dataset.productId == this.productId) {
        if (variant) {
          component.dataset.selectedVariantId = variant.id;
          component.dataset.price = variant.price;
          component.dataset.compareAtPrice = variant.compare_at_price || "";
          component.dataset.inventoryPolicy = variant.inventory_policy;
          component.dataset.inventoryQuantity = variant.inventory_quantity;
        }
        component.dataset.cartProperties = propertiesJson;
      }
    });
  }

  findVariantForOptions(testOptions) {
    const { variants, options } = this;
    const variantOptions = Object.fromEntries(Object.entries(testOptions).filter(([key]) => key !== "boot-width"));

    return (
      variants.find(variant => {
        return options.every((option, i) => {
          const optionPosition = option.position.toString();
          if (!(optionPosition in variantOptions)) return true;
          const optionValue = variant.options[i];
          return variantOptions[optionPosition] === optionValue;
        });
      }) ?? null
    );
  }

  getColorOptionPosition() {
    const { options } = this;
    const colorOption = options.find(option => option.name.toLowerCase() === "color");
    return colorOption?.position ?? null;
  }

  updateOptionVisibility() {
    const { form } = this;
    const colorOptionPosition = this.getColorOptionPosition();
    const inputsByPosition = {};
    const allInputs = form.querySelectorAll('input[type="radio"]:not([data-non-variant-option])');

    allInputs.forEach(input => {
      const position = input.dataset.optionPosition;
      if (!position) return;
      if (!inputsByPosition[position]) inputsByPosition[position] = [];
      inputsByPosition[position].push(input);
    });

    const sortedPositions = Object.keys(inputsByPosition).sort((a, b) => parseInt(a) - parseInt(b));
    let currentSelections = this.getSelectedOptions();

    sortedPositions.forEach(position => {
      if (position === colorOptionPosition?.toString()) return;

      const positionNum = parseInt(position);
      const inputs = inputsByPosition[position];
      let hasVisibleSelected = false;
      let firstVisibleInput = null;

      currentSelections = this.getSelectedOptions();

      inputs.forEach(input => {
        const label = input.closest("label");
        if (!label) return;

        const testOptions = Object.fromEntries(
          Object.entries(currentSelections).filter(([selPosition]) => {
            const selPosNum = parseInt(selPosition);
            return selPosNum < positionNum;
          })
        );

        testOptions[position] = input.value;

        const variant = this.findVariantForOptions(testOptions);
        const isValid = variant !== null;
        const isVariantAvailable = variant?.available === true;

        if (isValid) {
          label.classList.remove("hidden");
          label.style.display = "";
          if (!firstVisibleInput) firstVisibleInput = input;
          if (input.checked) hasVisibleSelected = true;
        } else {
          label.classList.add("hidden");
          label.style.display = "none";
        }

        input.dataset.optionAvailable = isVariantAvailable.toString();
      });

      if (!hasVisibleSelected && firstVisibleInput) {
        firstVisibleInput.checked = true;
        currentSelections[position] = firstVisibleInput.value;
        this.updateSelectedStates();
        this.updateOptionNameDisplays();
      }
    });

    this.updateGenderToggleDisplay();
  }

  updateGenderToggleDisplay() {
    const { form } = this;
    const genderSelectors = this.querySelectorAll("[data-gender-selector]");
    genderSelectors.forEach(selector => {
      const optionPosition = selector.dataset.optionPosition;
      if (!optionPosition) return;

      const activeButton = selector.querySelector(".product-options__gender-tab--active");
      if (activeButton) {
        const gender = activeButton.dataset.gender;
        const sizeContainer = form.querySelector(
          `[data-size-options-container][data-option-position="${optionPosition}"]`
        );
        if (sizeContainer) {
          const optionInputs = sizeContainer.querySelectorAll(`input[data-option-position="${optionPosition}"]`);

          optionInputs.forEach(input => {
            const label = input.closest("label");
            if (!label || label.style.display === "none") return;

            const textSpan = label.querySelector(".product-options__value-text");
            if (!textSpan) return;

            const originalText = textSpan.dataset.originalText ?? input.value;
            const originalValue = parseFloat(originalText);

            if (!isNaN(originalValue)) {
              if (gender === "women") {
                const womensSize = originalValue + 1.5;
                textSpan.textContent = womensSize.toString();
              } else {
                textSpan.textContent = originalText;
              }
            }
          });
        }
      }
    });
  }

  initializeForm() {
    if (this.variantData?.id) {
      this.variantIdInput.value = this.variantData.id;
    }
    this.initializeGenderToggles();
    this.updateOptionVisibility();
    this.updateSelectedStates();
    this.updateOptionNameDisplays();
    this.updateVariantId();
    this.updateAddToCartComponent();
  }

  initializeGenderToggles() {
    const { form } = this;
    const genderSelectors = this.querySelectorAll("[data-gender-selector]");
    genderSelectors.forEach(selector => {
      const optionPosition = selector.dataset.optionPosition;
      if (!optionPosition) return;

      const menButton = selector.querySelector('[data-gender="men"]');
      const womenButton = selector.querySelector('[data-gender="women"]');
      if (menButton && womenButton) {
        menButton.classList.add("product-options__gender-tab--active");
        menButton.setAttribute("aria-pressed", "true");
        womenButton.classList.remove("product-options__gender-tab--active");
        womenButton.setAttribute("aria-pressed", "false");
      }

      const sizeContainer = form.querySelector(
        `[data-size-options-container][data-option-position="${optionPosition}"]`
      );
      if (sizeContainer) {
        const optionInputs = sizeContainer.querySelectorAll(`input[data-option-position="${optionPosition}"]`);
        optionInputs.forEach(input => {
          const label = input.closest("label");
          if (!label) return;

          const textSpan = label.querySelector(".product-options__value-text");
          if (textSpan && !textSpan.dataset.originalText) {
            textSpan.dataset.originalText = textSpan.textContent.trim();
          }
        });
      }
    });
  }

  updateSelectedStates() {
    const { form } = this;
    const allInputs = form.querySelectorAll('input[type="radio"]');
    allInputs.forEach(input => {
      const label = input.closest("label");
      if (!label) return;

      const isSelected = input.checked;
      const isNonVariantOption =
        input.hasAttribute("data-non-variant-option") || input.dataset.optionPosition === "boot-width";

      if (label.classList.contains("product-options__value")) {
        label.classList.toggle("product-options__value--selected", isSelected);

        if (!isNonVariantOption) {
          const isAvailable = input.dataset.optionAvailable === "true";
          label.classList.toggle("product-options__value--unavailable", !isAvailable);
        }

        const textSpan = label.querySelector(".product-options__value-text");
        if (textSpan) {
          textSpan.classList.toggle("product-options__value-text--selected", isSelected);
        }
      }

      if (label.classList.contains("product-options__swatch")) {
        label.classList.toggle("swatch-selected", isSelected);
      }
    });
  }

  updateOptionNameDisplays() {
    const { form } = this;
    const selectedOptions = this.getSelectedOptions();

    Object.keys(selectedOptions).forEach(position => {
      const selectedValue = selectedOptions[position];
      const displayElement = form.querySelector(`[data-option-selected-value][data-option-position="${position}"]`);

      if (displayElement && selectedValue) {
        displayElement.textContent = selectedValue;
      }
    });

    const bootWidthInput = form.querySelector('input[data-option-position="boot-width"]:checked');
    if (bootWidthInput) {
      const bootWidthDisplay = form.querySelector('[data-option-selected-value][data-option-position="boot-width"]');
      if (bootWidthDisplay) {
        bootWidthDisplay.textContent = bootWidthInput.value;
      }
    }

    const allDisplayElements = this.form.querySelectorAll("[data-option-selected-value]");
    allDisplayElements.forEach(element => {
      const position = element.dataset.optionPosition;
      if (position === "boot-width") return;
      if (!selectedOptions[position]) {
        element.textContent = "Selection";
      }
    });
  }

  handleOptionChange(event) {
    const input = event.target;
    if (!input || input.type !== "radio") return;

    const { form } = this;
    const optionName = input.name;
    const sameGroupInputs = form.querySelectorAll(`input[type="radio"][name="${optionName}"]`);

    sameGroupInputs.forEach(radio => {
      const label = radio.closest("label");
      if (!label) return;

      const isSelected = radio.checked;
      const isNonVariantOption =
        radio.hasAttribute("data-non-variant-option") || radio.dataset.optionPosition === "boot-width";

      if (label.classList.contains("product-options__value")) {
        label.classList.toggle("product-options__value--selected", isSelected);

        if (!isNonVariantOption) {
          const isAvailable = radio.dataset.optionAvailable === "true";
          label.classList.toggle("product-options__value--unavailable", !isAvailable);
        }

        const textSpan = label.querySelector(".product-options__value-text");
        if (textSpan) {
          textSpan.classList.toggle("product-options__value-text--selected", isSelected);
        }
      }

      if (label.classList.contains("product-options__swatch")) {
        label.classList.toggle("swatch-selected", isSelected);
      }
    });

    this.updateOptionNameDisplays();

    if (input.hasAttribute("data-non-variant-option")) return;

    const changedOptionPosition = input.dataset.optionPosition;
    this.updateOptionVisibility();
    this.updateVariantId(changedOptionPosition);
    this.updateSelectedStates();
    this.updateOptionNameDisplays();
  }

  handleGenderToggle(genderButton) {
    const { form } = this;
    const gender = genderButton.dataset.gender;
    const optionPosition = genderButton.dataset.optionPosition;
    if (!optionPosition) return;

    const genderSelector = genderButton.closest("[data-gender-selector]");
    if (!genderSelector) return;

    const menButton = genderSelector.querySelector('[data-gender="men"]');
    const womenButton = genderSelector.querySelector('[data-gender="women"]');

    if (menButton && womenButton) {
      if (gender === "men") {
        menButton.classList.add("product-options__gender-tab--active");
        menButton.setAttribute("aria-pressed", "true");
        womenButton.classList.remove("product-options__gender-tab--active");
        womenButton.setAttribute("aria-pressed", "false");
      } else {
        womenButton.classList.add("product-options__gender-tab--active");
        womenButton.setAttribute("aria-pressed", "true");
        menButton.classList.remove("product-options__gender-tab--active");
        menButton.setAttribute("aria-pressed", "false");
      }
    }

    const sizeContainer = form.querySelector(`[data-size-options-container][data-option-position="${optionPosition}"]`);
    if (!sizeContainer) return;

    const optionInputs = sizeContainer.querySelectorAll(`input[data-option-position="${optionPosition}"]`);

    optionInputs.forEach(input => {
      const label = input.closest("label");
      if (!label) return;

      const textSpan = label.querySelector(".product-options__value-text");
      if (!textSpan) return;

      const originalText = textSpan.dataset.originalText ?? input.value;
      const originalValue = parseFloat(originalText);

      if (!isNaN(originalValue)) {
        if (gender === "women") {
          const womensSize = originalValue + 1.5;
          textSpan.textContent = womensSize.toString();
        } else {
          textSpan.textContent = originalText;
        }
      }
    });

    this.updateAddToCartComponent();
  }
}

if (!customElements.get("product-option-selectors")) {
  customElements.define("product-option-selectors", ProductOptionSelectors);
}
