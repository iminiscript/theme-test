import { Component } from "@theme/component";
import { VariantSelectedEvent, VariantUpdateEvent } from "@theme/events";
import { morph } from "@theme/morph";
import { requestYieldCallback } from "@theme/utilities";

/**
 * A custom element that manages a variant picker.
 *
 * @template {import('@theme/component').Refs} [Refs = {}]
 *
 * @extends Component<Refs>
 */
export default class VariantPicker extends Component {
  /** @type {string | undefined} */
  #pendingRequestUrl;

  /** @type {AbortController | undefined} */
  #abortController;

  /** @type {boolean} */
  #shouldAutoSelectSize = false;

  connectedCallback() {
    super.connectedCallback();

    this.addEventListener("change", this.variantChanged.bind(this));
  }

  /**
   * Handles the variant change event.
   * @param {Event} event - The variant change event.
   */
  variantChanged(event) {
    if (!(event.target instanceof HTMLElement)) return;

    const selectedOption =
      event.target instanceof HTMLSelectElement ? event.target.options[event.target.selectedIndex] : event.target;

    if (!selectedOption) return;

    // Check if this is a color option change (for cart-upsell context)
    const isColorOption = this.isColorOption(event.target);
    const isCartUpsell = this.dataset.cartUpsell === "true";

    this.updateSelectedOption(event.target);
    this.dispatchEvent(new VariantSelectedEvent({ id: selectedOption.dataset.optionValueId ?? "" }));

    const isOnProductPage =
      this.dataset.templateProductMatch === "true" &&
      !event.target.closest("product-card") &&
      !event.target.closest("quick-add-dialog");

    // Morph the entire main content for combined listings child products, because changing the product
    // might also change other sections depending on recommendations, metafields, etc.
    const currentUrl = this.dataset.productUrl?.split("?")[0];
    const newUrl = selectedOption.dataset.connectedProductUrl;
    const loadsNewProduct = isOnProductPage && !!newUrl && newUrl !== currentUrl;

    // Store flag to auto-select first available size after color change
    if (isCartUpsell && isColorOption) {
      this.#shouldAutoSelectSize = true;
    }

    this.fetchUpdatedSection(this.buildRequestUrl(selectedOption), loadsNewProduct);

    const url = new URL(window.location.href);

    const variantId = selectedOption.dataset.variantId || null;

    if (isOnProductPage) {
      if (variantId) {
        url.searchParams.set("variant", variantId);
      } else {
        url.searchParams.delete("variant");
      }
    }

    // Change the path if the option is connected to another product via combined listing.
    if (loadsNewProduct) {
      url.pathname = newUrl;
    }

    if (url.href !== window.location.href) {
      requestYieldCallback(() => {
        history.replaceState({}, "", url.toString());
      });
    }
  }

  /**
   * Updates the selected option.
   * @param {string | Element} target - The target element.
   */
  updateSelectedOption(target) {
    if (typeof target === "string") {
      const targetElement = this.querySelector(`[data-option-value-id="${target}"]`);

      if (!targetElement) throw new Error("Target element not found");

      target = targetElement;
    }

    if (target instanceof HTMLInputElement) {
      target.checked = true;
    }

    if (target instanceof HTMLSelectElement) {
      const newValue = target.value;
      const newSelectedOption = Array.from(target.options).find(option => option.value === newValue);

      if (!newSelectedOption) throw new Error("Option not found");

      for (const option of target.options) {
        option.removeAttribute("selected");
      }

      newSelectedOption.setAttribute("selected", "selected");
    }
  }

  /**
   * Builds the request URL.
   * @param {HTMLElement} selectedOption - The selected option.
   * @param {string | null} [source] - The source.
   * @param {string[]} [sourceSelectedOptionsValues] - The source selected options values.
   * @returns {string} The request URL.
   */
  buildRequestUrl(selectedOption, source = null, sourceSelectedOptionsValues = []) {
    // this productUrl and pendingRequestUrl will be useful for the support of combined listing. It is used when a user changes variant quickly and those products are using separate URLs (combined listing).
    // We create a new URL and abort the previous fetch request if it's still pending.
    let productUrl = selectedOption.dataset.connectedProductUrl || this.#pendingRequestUrl || this.dataset.productUrl;
    this.#pendingRequestUrl = productUrl;
    const params = [];

    if (this.selectedOptionsValues.length && !source) {
      params.push(`option_values=${this.selectedOptionsValues.join(",")}`);
    } else if (source === "product-card") {
      if (this.selectedOptionsValues.length) {
        params.push(`option_values=${sourceSelectedOptionsValues.join(",")}`);
      } else {
        params.push(`option_values=${selectedOption.dataset.optionValueId}`);
      }
    }

    // If variant-picker is a child of quick-add-component or swatches-variant-picker-component, we need to append section_id=section-rendering-product-card to the URL
    if (this.closest("quick-add-component") || this.closest("swatches-variant-picker-component")) {
      if (productUrl?.includes("?")) {
        productUrl = productUrl.split("?")[0];
      }
      return `${productUrl}?section_id=section-rendering-product-card&${params.join("&")}`;
    }

    // For cart-upsell context, use section-rendering-product-card to get variant picker updates
    // This ensures we get the correct variant options when selecting colors/sizes
    if (this.dataset.cartUpsell === "true") {
      if (productUrl?.includes("?")) {
        productUrl = productUrl.split("?")[0];
      }
      return `${productUrl}?section_id=section-rendering-product-card&${params.join("&")}`;
    }

    return `${productUrl}?${params.join("&")}`;
  }

  /**
   * Fetches the updated section.
   * @param {string} requestUrl - The request URL.
   * @param {boolean} shouldMorphMain - If the entire main content should be morphed. By default, only the variant picker is morphed.
   */
  fetchUpdatedSection(requestUrl, shouldMorphMain = false) {
    // We use this to abort the previous fetch request if it's still pending.
    this.#abortController?.abort();
    this.#abortController = new AbortController();

    fetch(requestUrl, { signal: this.#abortController.signal })
      .then(response => response.text())
      .then(responseText => {
        this.#pendingRequestUrl = undefined;
        const html = new DOMParser().parseFromString(responseText, "text/html");
        // Defer is only useful for the initial rendering of the page. Remove it here.
        html.querySelector("overflow-list[defer]")?.removeAttribute("defer");

        const textContent = html.querySelector(`variant-picker script[type="application/json"]`)?.textContent;
        if (!textContent) return;

        if (shouldMorphMain) {
          this.updateMain(html);
        } else {
          const newProduct = this.updateVariantPicker(html);

          // Auto-select first available size after color change (cart-upsell context)
          if (this.#shouldAutoSelectSize) {
            this.#shouldAutoSelectSize = false;
            requestYieldCallback(() => {
              this.autoSelectFirstAvailableSize();
            });
          }

          // We grab the variant object from the response and dispatch an event with it.
          if (this.selectedOptionId) {
            this.dispatchEvent(
              new VariantUpdateEvent(JSON.parse(textContent), this.selectedOptionId, {
                html,
                productId: this.dataset.productId ?? "",
                newProduct,
              })
            );
          }
        }
      })
      .catch(error => {
        if (error.name === "AbortError") {
          console.warn("Fetch aborted by user");
        } else {
          console.error(error);
        }
      });
  }

  /**
   * @typedef {Object} NewProduct
   * @property {string} id
   * @property {string} url
   */

  /**
   * Re-renders the variant picker.
   * @param {Document} newHtml - The new HTML.
   * @returns {NewProduct | undefined} Information about the new product if it has changed, otherwise undefined.
   */
  updateVariantPicker(newHtml) {
    /** @type {NewProduct | undefined} */
    let newProduct;

    const newVariantPickerSource = newHtml.querySelector(this.tagName.toLowerCase());

    if (!newVariantPickerSource) {
      throw new Error("No new variant picker source found");
    }

    // For combined listings, the product might have changed, so update the related data attribute.
    if (newVariantPickerSource instanceof HTMLElement) {
      const newProductId = newVariantPickerSource.dataset.productId;
      const newProductUrl = newVariantPickerSource.dataset.productUrl;

      if (newProductId && newProductUrl && this.dataset.productId !== newProductId) {
        newProduct = { id: newProductId, url: newProductUrl };
      }

      this.dataset.productId = newProductId;
      this.dataset.productUrl = newProductUrl;
    }

    morph(this, newVariantPickerSource);

    return newProduct;
  }

  /**
   * Re-renders the entire main content.
   * @param {Document} newHtml - The new HTML.
   */
  updateMain(newHtml) {
    const main = document.querySelector("main");
    const newMain = newHtml.querySelector("main");

    if (!main || !newMain) {
      throw new Error("No new main source found");
    }

    morph(main, newMain);
  }

  /**
   * Gets the selected option.
   * @returns {HTMLInputElement | HTMLOptionElement | undefined} The selected option.
   */
  get selectedOption() {
    const selectedOption = this.querySelector("select option[selected], fieldset input:checked");

    if (!(selectedOption instanceof HTMLInputElement || selectedOption instanceof HTMLOptionElement)) {
      return undefined;
    }

    return selectedOption;
  }

  /**
   * Gets the selected option ID.
   * @returns {string | undefined} The selected option ID.
   */
  get selectedOptionId() {
    const { selectedOption } = this;
    if (!selectedOption) return undefined;
    const { optionValueId } = selectedOption.dataset;

    if (!optionValueId) {
      throw new Error("No option value ID found");
    }

    return optionValueId;
  }

  /**
   * Gets the selected options values.
   * @returns {string[]} The selected options values.
   */
  get selectedOptionsValues() {
    /** @type HTMLElement[] */
    const selectedOptions = Array.from(this.querySelectorAll("select option[selected], fieldset input:checked"));

    return selectedOptions.map(option => {
      const { optionValueId } = option.dataset;

      if (!optionValueId) throw new Error("No option value ID found");

      return optionValueId;
    });
  }

  /**
   * Checks if an element is a color option input.
   * @param {HTMLElement} element - The element to check.
   * @returns {boolean} True if the element is a color option.
   */
  isColorOption(element) {
    if (!element) return false;

    // Check if the input is inside a color swatch label
    const swatchLabel = element.closest(".variant-swatch__label");
    if (swatchLabel) return true;

    // Check if the input name contains "color" (case-insensitive)
    if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement) {
      const name = element.name || "";
      const nameLower = name.toLowerCase();
      if (nameLower.includes("color")) return true;
    }

    // Check if the fieldset legend contains "color"
    const fieldset = element.closest("fieldset");
    if (fieldset) {
      const legend = fieldset.querySelector("legend");
      if (legend) {
        const legendText = legend.textContent?.toLowerCase() || "";
        if (legendText.includes("color")) return true;
      }
    }

    return false;
  }

  /**
   * Automatically selects the first available size option after a color change.
   * This is used in cart-upsell context to ensure a valid variant is always selected.
   */
  autoSelectFirstAvailableSize() {
    // Find all non-color option fieldsets (size, waist, height, etc.)
    const allFieldsets = Array.from(this.querySelectorAll("fieldset.variant-option"));
    const nonColorFieldsets = allFieldsets.filter(fieldset => {
      // Skip color swatch fieldsets
      if (fieldset.classList.contains("variant-option--color-swatches")) {
        return false;
      }

      // Check if legend contains "color"
      const legend = fieldset.querySelector("legend");
      if (legend) {
        const legendText = legend.textContent?.toLowerCase() || "";
        if (legendText.includes("color")) {
          return false;
        }
      }

      return true;
    });

    // For each non-color fieldset, find the first available option
    for (const fieldset of nonColorFieldsets) {
      const inputs = Array.from(fieldset.querySelectorAll('input[type="radio"]'));

      // Find the first available input that's not disabled
      const firstAvailable = inputs.find(input => {
        if (!(input instanceof HTMLInputElement)) return false;
        const isAvailable = input.dataset.optionAvailable === "true";
        const isNotDisabled = !input.disabled;
        return isAvailable && isNotDisabled;
      });

      if (firstAvailable && firstAvailable instanceof HTMLInputElement) {
        // Check if it's not already selected
        if (!firstAvailable.checked) {
          // Select the first available option
          firstAvailable.checked = true;
          // Trigger change event but prevent it from triggering another auto-select
          this.#shouldAutoSelectSize = false;
          firstAvailable.dispatchEvent(new Event("change", { bubbles: true }));
          break; // Only select the first available option in the first non-color fieldset
        }
      }
    }
  }
}

if (!customElements.get("variant-picker")) {
  customElements.define("variant-picker", VariantPicker);
}
