import { sectionRenderer } from "@theme/section-renderer";
import { Component } from "@theme/component";
import { FilterUpdateEvent, ThemeEvents } from "@theme/events";
import { debounce, formatMoney, startViewTransition } from "@theme/utilities";

/**
 * Search query parameter.
 * @type {string}
 */
const SEARCH_QUERY = "q";

/**
 * Handles the main facets form functionality
 *
 * @typedef {Object} FacetsFormRefs
 * @property {HTMLFormElement} facetsForm - The main facets form element
 * @property {HTMLElement | undefined} facetStatus - The facet status element
 *
 * @extends {Component<FacetsFormRefs>}
 */
class FacetsFormComponent extends Component {
  requiredRefs = ["facetsForm"];

  /**
   * Creates URL parameters from form data
   * @param {FormData} [formData] - Optional form data to use instead of the main form
   * @returns {URLSearchParams} The processed URL parameters
   */
  createURLParameters(formData = new FormData(this.refs.facetsForm)) {
    const newParameters = new URLSearchParams(/** @type any */ (formData));

    if (newParameters.get("filter.v.price.gte") === "") newParameters.delete("filter.v.price.gte");
    if (newParameters.get("filter.v.price.lte") === "") newParameters.delete("filter.v.price.lte");

    newParameters.delete("page");

    const searchQuery = this.#getSearchQuery();
    if (searchQuery) newParameters.set(SEARCH_QUERY, searchQuery);

    return newParameters;
  }

  /**
   * Gets the search query parameter from the current URL
   * @returns {string} The search query
   */
  #getSearchQuery() {
    const url = new URL(window.location.href);
    return url.searchParams.get(SEARCH_QUERY) ?? "";
  }

  get sectionId() {
    const id = this.getAttribute("section-id");
    if (!id) throw new Error("Section ID is required");
    return id;
  }

  /**
   * Updates the URL hash with current filter parameters
   */
  #updateURLHash() {
    const url = new URL(window.location.href);
    const urlParameters = this.createURLParameters();

    // Get all filter/sort params that this form can control
    const controlledParams = new Set();
    const formInputs = this.refs.facetsForm.querySelectorAll("input, select");
    formInputs.forEach(input => {
      if (input.name) controlledParams.add(input.name);
    });

    // Also include params that will be in the URL (like search query "q")
    // to prevent duplication
    const paramsToUpdate = new Set(controlledParams);
    for (const [param] of urlParameters.entries()) {
      paramsToUpdate.add(param);
    }

    // Remove ALL params that will be updated (including unchecked ones)
    Array.from(url.searchParams.keys()).forEach(param => {
      if (paramsToUpdate.has(param)) {
        url.searchParams.delete(param);
      }
    });

    // Add back only the checked/selected values from this form
    for (const [param, value] of urlParameters.entries()) {
      url.searchParams.append(param, value);
    }

    history.pushState({ urlParameters: urlParameters.toString() }, "", url.toString());
  }

  /**
   * Updates filters and renders the section
   */
  updateFilters = () => {
    this.#updateURLHash();
    this.dispatchEvent(new FilterUpdateEvent(this.createURLParameters()));
    this.#updateSection();
  };

  /**
   * Updates the section
   */
  #updateSection() {
    const viewTransition = !this.closest("dialog");

    // Show loader, hide products
    this.#toggleLoader(true);

    const renderPromise = viewTransition
      ? startViewTransition(() => sectionRenderer.renderSection(this.sectionId), ["product-grid"])
      : sectionRenderer.renderSection(this.sectionId);

    // Hide loader, show products after render completes
    renderPromise.finally(() => {
      // Small delay to ensure DOM is updated
      requestAnimationFrame(() => {
        this.#toggleLoader(false);
      });
    });
  }

  /**
   * Toggles the loader visibility
   * @param {boolean} show - Whether to show the loader
   */
  #toggleLoader(show) {
    const loader = document.querySelector(`[data-loader]`);
    const productsContainer = document.querySelector(`[data-products-container]`);

    if (loader && productsContainer) {
      if (show) {
        loader.classList.remove("hidden");
        productsContainer.classList.add("hidden");
      } else {
        loader.classList.add("hidden");
        productsContainer.classList.remove("hidden");
      }
    }
  }

  /**
   * Updates filters based on a provided URL
   * @param {string} url - The URL to update filters with
   */
  updateFiltersByURL(url) {
    history.pushState("", "", url);
    this.dispatchEvent(new FilterUpdateEvent(this.createURLParameters()));

    // Show loader, hide products
    this.#toggleLoader(true);

    const renderPromise = sectionRenderer.renderSection(this.sectionId);

    // Hide loader, show products after render completes
    renderPromise.finally(() => {
      requestAnimationFrame(() => {
        this.#toggleLoader(false);
      });
    });
  }
}

if (!customElements.get("facets-form-component")) {
  customElements.define("facets-form-component", FacetsFormComponent);
}

/**
 * @typedef {Object} FacetInputsRefs
 * @property {HTMLInputElement[]} facetInputs - The facet input elements
 */

/**
 * Handles individual facet input functionality
 * @extends {Component<FacetInputsRefs>}
 */
class FacetInputsComponent extends Component {
  get sectionId() {
    const id = this.closest(".shopify-section")?.id;
    if (!id) throw new Error("FacetInputs component must be a child of a section");
    return id;
  }

  /**
   * Checks if this component should operate in batch mode (drawer)
   * @returns {boolean} True if in batch mode, false otherwise
   */
  #isInBatchMode() {
    // Check if component is visible first
    // Hidden desktop filters should not process events
    const isInDialog = this.closest("dialog[open]") !== null;
    if (this.offsetParent === null && !isInDialog) {
      return null; // Signal to skip processing entirely
    }

    // Check if this component instance is inside a batch-mode container
    const batchModeContainers = document.querySelectorAll("[data-batch-mode]");
    for (const container of batchModeContainers) {
      if (container.contains(this)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Updates filters and the selected facet summary
   */
  updateFilters() {
    const facetsForm = this.closest("facets-form-component");
    if (!(facetsForm instanceof FacetsFormComponent)) return;

    const batchMode = this.#isInBatchMode();

    // Skip if component is hidden (null indicates hidden component)
    if (batchMode === null) return;

    if (batchMode) {
      // Batch mode: only update the summary, don't apply filters
      // Filters will be applied when the Apply button is clicked
      this.#updateSelectedFacetSummary();
      return;
    }

    // Immediate mode: update filters right away
    facetsForm.updateFilters();
    this.#updateSelectedFacetSummary();
  }

  /**
   * Handles keydown events for the facets form
   * @param {KeyboardEvent} event - The keydown event
   */
  handleKeyDown(event) {
    if (!(event.target instanceof HTMLElement)) return;
    const closestInput = event.target.querySelector("input");

    if (!(closestInput instanceof HTMLInputElement)) return;

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      closestInput.checked = !closestInput.checked;
      this.updateFilters();
    }
  }

  /**
   * Handles mouseover events on facet labels
   * @param {MouseEvent} event - The mouseover event
   */
  prefetchPage = debounce(event => {
    if (!(event.target instanceof HTMLElement)) return;

    const form = this.closest("form");
    if (!form) return;

    const formData = new FormData(form);
    const inputElement = event.target.querySelector("input");

    if (!(inputElement instanceof HTMLInputElement)) return;

    if (!inputElement.checked) formData.append(inputElement.name, inputElement.value);

    const facetsForm = this.closest("facets-form-component");
    if (!(facetsForm instanceof FacetsFormComponent)) return;

    const urlParameters = facetsForm.createURLParameters(formData);

    const url = new URL(window.location.pathname, window.location.origin);

    for (const [key, value] of urlParameters) url.searchParams.append(key, value);

    if (inputElement.checked) url.searchParams.delete(inputElement.name, inputElement.value);

    sectionRenderer.getSectionHTML(this.sectionId, true, url);
  }, 200);

  cancelPrefetchPage = () => this.prefetchPage.cancel();

  /**
   * Updates the selected facet summary
   */
  #updateSelectedFacetSummary() {
    if (!this.refs.facetInputs) return;

    const checkedInputElements = this.refs.facetInputs.filter(input => input.checked);
    const details = this.closest("details");
    const statusComponent = details?.querySelector("facet-status-component");

    if (!(statusComponent instanceof FacetStatusComponent)) return;

    statusComponent.updateListSummary(checkedInputElements);
  }
}

if (!customElements.get("facet-inputs-component")) {
  customElements.define("facet-inputs-component", FacetInputsComponent);
}

/**
 * @typedef {Object} PriceFacetRefs
 * @property {HTMLInputElement} minInput - The minimum price input
 * @property {HTMLInputElement} maxInput - The maximum price input
 */

/**
 * Handles price facet functionality
 * @extends {Component<PriceFacetRefs>}
 */
class PriceFacetComponent extends Component {
  connectedCallback() {
    super.connectedCallback();
    this.addEventListener("keydown", this.#onKeyDown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener("keydown", this.#onKeyDown);
  }

  /**
   * Handles keydown events to restrict input to valid characters
   * @param {KeyboardEvent} event - The keydown event
   */
  #onKeyDown = event => {
    if (event.metaKey) return;

    const pattern = /[0-9]|\.|,|'| |Tab|Backspace|Enter|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Delete|Escape/;
    if (!event.key.match(pattern)) event.preventDefault();
  };

  /**
   * Checks if this component should operate in batch mode
   * @returns {boolean|null} True if batch mode, false if immediate, null if hidden
   */
  #isInBatchMode() {
    const isInDialog = this.closest("dialog[open]") !== null;
    if (this.offsetParent === null && !isInDialog) {
      return null; // Component is hidden
    }

    const batchModeContainers = document.querySelectorAll("[data-batch-mode]");
    for (const container of batchModeContainers) {
      if (container.contains(this)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Updates price filter and results
   */
  updatePriceFilterAndResults() {
    const { minInput, maxInput } = this.refs;

    this.#adjustToValidValues(minInput);
    this.#adjustToValidValues(maxInput);

    const facetsForm = this.closest("facets-form-component");
    if (!(facetsForm instanceof FacetsFormComponent)) return;

    const batchMode = this.#isInBatchMode();
    if (batchMode === null) return; // Skip if hidden

    if (!batchMode) {
      // Immediate mode: apply filters right away
      facetsForm.updateFilters();
    }

    this.#setMinAndMaxValues();
    this.#updateSummary();
  }

  /**
   * Adjusts input values to be within valid range
   * @param {HTMLInputElement} input - The input element to adjust
   */
  #adjustToValidValues(input) {
    if (input.value.trim() === "") return;

    const value = Number(input.value);
    const min = Number(formatMoney(input.getAttribute("data-min") ?? ""));
    const max = Number(formatMoney(input.getAttribute("data-max") ?? ""));

    if (value < min) input.value = min.toString();
    if (value > max) input.value = max.toString();
  }

  /**
   * Sets min and max values for the inputs
   */
  #setMinAndMaxValues() {
    const { minInput, maxInput } = this.refs;

    if (maxInput.value) minInput.setAttribute("data-max", maxInput.value);
    if (minInput.value) maxInput.setAttribute("data-min", minInput.value);
    if (minInput.value === "") maxInput.setAttribute("data-min", "0");
    if (maxInput.value === "") minInput.setAttribute("data-max", maxInput.getAttribute("data-max") ?? "");
  }

  /**
   * Updates the price summary
   */
  #updateSummary() {
    const { minInput, maxInput } = this.refs;
    const details = this.closest("details");
    const statusComponent = details?.querySelector("facet-status-component");

    if (!(statusComponent instanceof FacetStatusComponent)) return;

    statusComponent?.updatePriceSummary(minInput, maxInput);
  }
}

if (!customElements.get("price-facet-component")) {
  customElements.define("price-facet-component", PriceFacetComponent);
}

/**
 * Handles clearing of facet filters
 * @extends {Component}
 */
class FacetClearComponent extends Component {
  requiredRefs = ["clearButton"];

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener("keyup", this.#handleKeyUp);
    document.addEventListener(ThemeEvents.FilterUpdate, this.#handleFilterUpdate);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener(ThemeEvents.FilterUpdate, this.#handleFilterUpdate);
  }

  /**
   * Clears the filter
   * @param {Event} event - The click event
   */
  clearFilter(event) {
    if (!(event.target instanceof HTMLElement)) return;

    if (event instanceof KeyboardEvent) {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
    }

    // Check if this is inside a specific filter container or a "Clear All" button
    const container = event.target.closest("facet-inputs-component, price-facet-component");

    if (container) {
      // Clear only the specific filter group
      container.querySelectorAll('[type="checkbox"]:checked, input').forEach(input => {
        if (input instanceof HTMLInputElement) {
          input.checked = false;
          input.value = "";
        }
      });

      const details = event.target.closest("details");
      const statusComponent = details?.querySelector("facet-status-component");

      if (statusComponent instanceof FacetStatusComponent) {
        statusComponent.clearSummary();
      }
    } else {
      // Clear ALL filters in the entire form (for "Clear All" button)
      const facetsForm = this.closest("facets-form-component");
      if (facetsForm instanceof FacetsFormComponent) {
        const form = facetsForm.refs.facetsForm;
        if (form) {
          // Clear all checkboxes
          form.querySelectorAll('[type="checkbox"]:checked').forEach(input => {
            if (input instanceof HTMLInputElement) {
              input.checked = false;
            }
          });

          // Clear all text/number inputs (for price filters)
          form.querySelectorAll('input[type="text"], input[type="number"]').forEach(input => {
            if (input instanceof HTMLInputElement) {
              input.value = "";
            }
          });
        }
      }
    }

    const facetsForm = this.closest("facets-form-component");
    if (!(facetsForm instanceof FacetsFormComponent)) return;

    facetsForm.updateFilters();
  }

  /**
   * Handles keyup events
   * @param {KeyboardEvent} event - The keyup event
   */
  #handleKeyUp = event => {
    if (event.metaKey) return;
    if (event.key === "Enter") this.clearFilter(event);
  };

  /**
   * Toggle clear button visibility when filters are applied. Happens before the
   * Section Rendering Request resolves.
   *
   * @param {FilterUpdateEvent} event
   */
  #handleFilterUpdate = event => {
    const { clearButton } = this.refs;
    if (clearButton instanceof Element) {
      clearButton.classList.toggle("facets__clear--active", event.shouldShowClearAll());
    }
  };
}

if (!customElements.get("facet-clear-component")) {
  customElements.define("facet-clear-component", FacetClearComponent);
}

/**
 * @typedef {Object} FacetRemoveComponentRefs
 * @property {HTMLInputElement | undefined} clearButton - The button to clear filters
 */

/**
 * Handles removal of individual facet filters
 * @extends {Component<FacetRemoveComponentRefs>}
 */
class FacetRemoveComponent extends Component {
  connectedCallback() {
    super.connectedCallback();
    document.addEventListener(ThemeEvents.FilterUpdate, this.#handleFilterUpdate);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener(ThemeEvents.FilterUpdate, this.#handleFilterUpdate);
  }

  /**
   * Removes the filter
   * @param {Object} data - The data object
   * @param {string} data.form - The form to remove the filter from
   * @param {Event} event - The click event
   */
  removeFilter({ form }, event) {
    if (event instanceof KeyboardEvent) {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
    }

    const url = this.dataset.url;
    if (!url) return;

    const facetsForm = form ? document.getElementById(form) : this.closest("facets-form-component");

    if (!(facetsForm instanceof FacetsFormComponent)) return;

    facetsForm.updateFiltersByURL(url);
  }

  /**
   * Toggle clear button visibility when filters are applied. Happens before the
   * Section Rendering Request resolves.
   *
   * @param {FilterUpdateEvent} event
   */
  #handleFilterUpdate = event => {
    const { clearButton } = this.refs;
    if (clearButton instanceof Element) {
      clearButton.classList.toggle("active", event.shouldShowClearAll());
    }
  };
}

if (!customElements.get("facet-remove-component")) {
  customElements.define("facet-remove-component", FacetRemoveComponent);
}

/**
 * Handles sorting filter functionality
 *
 * @typedef {Object} SortingFilterRefs
 * @property {HTMLSelectElement} sortSelect - The select element
 *
 * @extends {Component}
 */
class SortingFilterComponent extends Component {
  requiredRefs = ["sortSelect"];

  /**
   * Updates filter and sorting
   */
  updateFilterAndSorting() {
    const facetsForm =
      this.closest("facets-form-component") || this.closest(".shopify-section")?.querySelector("facets-form-component");

    if (!(facetsForm instanceof FacetsFormComponent)) return;

    facetsForm.updateFilters();

    // Close the dialog if this sorting component is inside one
    const dialogComponent = this.closest("filter-drawer-component") || this.closest("dialog-component");
    if (dialogComponent) {
      // Small delay to allow the filter update to process first
      setTimeout(() => {
        dialogComponent.closeDialog();
      }, 100);
    }
  }
}

if (!customElements.get("sorting-filter-component")) {
  customElements.define("sorting-filter-component", SortingFilterComponent);
}

/**
 * @typedef {Object} FacetStatusRefs
 * @property {HTMLElement} facetStatus - The facet status element
 */

/**
 * Handles facet status display
 * @extends {Component<FacetStatusRefs>}
 */
class FacetStatusComponent extends Component {
  /**
   * Updates the list summary
   * @param {HTMLInputElement[]} checkedInputElements - The checked input elements
   */
  updateListSummary(checkedInputElements) {
    const checkedInputElementsCount = checkedInputElements.length;

    this.getAttribute("facet-type") === "swatches"
      ? this.#updateSwatchSummary(checkedInputElements, checkedInputElementsCount)
      : this.#updateBubbleSummary(checkedInputElements, checkedInputElementsCount);
  }

  /**
   * Updates the swatch summary
   * @param {HTMLInputElement[]} checkedInputElements - The checked input elements
   * @param {number} checkedInputElementsCount - The number of checked inputs
   */
  #updateSwatchSummary(checkedInputElements, checkedInputElementsCount) {
    const { facetStatus } = this.refs;
    facetStatus.classList.remove("bubble", "facets__bubble");

    if (checkedInputElementsCount === 0) {
      facetStatus.innerHTML = "";
      return;
    }

    if (checkedInputElementsCount > 3) {
      facetStatus.innerHTML = checkedInputElementsCount.toString();
      facetStatus.classList.add("bubble", "facets__bubble");
      return;
    }

    facetStatus.innerHTML = Array.from(checkedInputElements)
      .map(inputElement => {
        const swatch = inputElement.parentElement?.querySelector("span.swatch");
        return swatch?.outerHTML ?? "";
      })
      .join("");
  }

  /**
   * Updates the bubble summary
   * @param {HTMLInputElement[]} checkedInputElements - The checked input elements
   * @param {number} checkedInputElementsCount - The number of checked inputs
   */
  #updateBubbleSummary(checkedInputElements, checkedInputElementsCount) {
    const { facetStatus } = this.refs;
    facetStatus.classList.remove("bubble", "facets__bubble");

    if (checkedInputElementsCount === 0) {
      facetStatus.innerHTML = "";
      return;
    }

    if (checkedInputElementsCount === 1) {
      facetStatus.innerHTML = checkedInputElements[0]?.dataset.label ?? "";
      return;
    }

    facetStatus.innerHTML = checkedInputElementsCount.toString();
    facetStatus.classList.add("bubble", "facets__bubble");
  }

  /**
   * Updates the price summary
   * @param {HTMLInputElement} minInput - The minimum price input
   * @param {HTMLInputElement} maxInput - The maximum price input
   */
  updatePriceSummary(minInput, maxInput) {
    const minInputValue = minInput.value;
    const maxInputValue = maxInput.value;
    const { facetStatus } = this.refs;

    if (!minInputValue && !maxInputValue) {
      facetStatus.innerHTML = "";
      return;
    }

    const minInputNum = this.#parseCents(minInputValue, "0");
    const maxInputNum = this.#parseCents(maxInputValue, facetStatus.dataset.rangeMax);
    facetStatus.innerHTML = `${this.#formatMoney(minInputNum)}–${this.#formatMoney(maxInputNum)}`;
  }

  /**
   * Parses a decimal number as cents
   * @param {string} value - The stringified decimal number to parse
   * @param {string} fallback - The fallback value in case `value` is invalid
   * @returns {number} The money value in cents
   */
  #parseCents(value, fallback = "0") {
    const parts = value ? value.trim().split(/[^0-9]/) : (parseInt(fallback, 10) / 100).toString();
    const [wholeStr, fractionStr, ...rest] = parts;
    if (typeof wholeStr !== "string" || rest.length > 0) return parseInt(fallback, 10);

    const whole = parseInt(wholeStr, 10);
    let fraction = parseInt(fractionStr || "0", 10);

    // Use two most-significant digits, e.g. 1 -> 10, 12 -> 12, 123 -> 12.3, 1234 -> 12.34, etc
    fraction = fraction * Math.pow(10, 2 - fraction.toString().length);

    return whole * 100 + fraction;
  }

  /**
   * Formats money, replicated the implementation of the `money` liquid filters
   * @param {number} moneyValue - The money value
   * @returns {string} The formatted money value
   */
  #formatMoney(moneyValue) {
    if (!(this.refs.moneyFormat instanceof HTMLTemplateElement)) return "";

    const template = this.refs.moneyFormat.content.textContent || "{{amount}}";
    const currency = this.refs.facetStatus.dataset.currency || "";

    return template.replace(/{{\s*(\w+)\s*}}/g, (_, placeholder) => {
      if (typeof placeholder !== "string") return "";
      if (placeholder === "currency") return currency;

      let thousandsSeparator = ",";
      let decimalSeparator = ".";
      let precision = CURRENCY_DECIMALS[currency.toUpperCase()] ?? DEFAULT_CURRENCY_DECIMALS;

      if (placeholder === "amount") {
        // Check first since it's the most common, use defaults.
      } else if (placeholder === "amount_no_decimals") {
        precision = 0;
      } else if (placeholder === "amount_with_comma_separator") {
        thousandsSeparator = ".";
        decimalSeparator = ",";
      } else if (placeholder === "amount_no_decimals_with_comma_separator") {
        // Weirdly, this is correct. It uses amount_with_comma_separator's
        // behaviour but removes decimals, resulting in an unintuitive
        // output that can't possibly include commas, despite the name.
        thousandsSeparator = ".";
        precision = 0;
      } else if (placeholder === "amount_no_decimals_with_space_separator") {
        thousandsSeparator = " ";
        precision = 0;
      } else if (placeholder === "amount_with_space_separator") {
        thousandsSeparator = " ";
        decimalSeparator = ",";
      } else if (placeholder === "amount_with_period_and_space_separator") {
        thousandsSeparator = " ";
        decimalSeparator = ".";
      } else if (placeholder === "amount_with_apostrophe_separator") {
        thousandsSeparator = "'";
        decimalSeparator = ".";
      }

      return this.#formatCents(moneyValue, thousandsSeparator, decimalSeparator, precision);
    });
  }

  /**
   * Formats money in cents
   * @param {number} moneyValue - The money value in cents (hundredths of one major currency unit)
   * @param {string} thousandsSeparator - The thousands separator
   * @param {string} decimalSeparator - The decimal separator
   * @param {number} precision - The precision
   * @returns {string} The formatted money value
   */
  #formatCents(moneyValue, thousandsSeparator, decimalSeparator, precision) {
    const roundedNumber = (moneyValue / 100).toFixed(precision);

    let [a, b] = roundedNumber.split(".");
    if (!a) a = "0";
    if (!b) b = "";

    // Split by groups of 3 digits
    a = a.replace(/\d(?=(\d\d\d)+(?!\d))/g, digit => digit + thousandsSeparator);

    return precision <= 0 ? a : a + decimalSeparator + b.padEnd(precision, "0");
  }

  /**
   * Clears the summary
   */
  clearSummary() {
    this.refs.facetStatus.innerHTML = "";
  }
}

if (!customElements.get("facet-status-component")) {
  customElements.define("facet-status-component", FacetStatusComponent);
}

/**
 * Default currency decimals used in most currenies
 * @constant {number}
 */
const DEFAULT_CURRENCY_DECIMALS = 2;

/**
 * Decimal precision for currencies that have a non-default precision
 * @type {Record<string, number>}
 */
const CURRENCY_DECIMALS = {
  BHD: 3,
  BIF: 0,
  BYR: 0,
  CLF: 4,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  IQD: 3,
  ISK: 0,
  JOD: 3,
  JPY: 0,
  KMF: 0,
  KRW: 0,
  KWD: 3,
  LYD: 3,
  MRO: 5,
  OMR: 3,
  PYG: 0,
  RWF: 0,
  TND: 3,
  UGX: 0,
  UYI: 0,
  UYW: 4,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XAG: 0,
  XAU: 0,
  XBA: 0,
  XBB: 0,
  XBC: 0,
  XBD: 0,
  XDR: 0,
  XOF: 0,
  XPD: 0,
  XPF: 0,
  XPT: 0,
  XSU: 0,
  XTS: 0,
  XUA: 0,
};
