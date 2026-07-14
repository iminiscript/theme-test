import { Component } from "@theme/component";

/**
 * Reusable comparison component that displays product comparisons
 * Can be used anywhere by passing products data via the `products` property
 *
 * @example
 * const comp = document.querySelector('comparison-chart-component');
 * comp.products = [{id: 1, title: 'Product 1'}, {id: 2, title: 'Product 2'}];
 *
 * @extends {Component}
 */
class ComparisonChartComponent extends Component {
  /** @type {Array<any>} */
  #products = [];

  connectedCallback() {
    super.connectedCallback();

    // Check if this is a page-level chart (not in drawer)
    const context = this.dataset.context || "drawer";
    if (context === "page") {
      // Listen for compare:products-selected event from drawer
      document.addEventListener("compare:products-selected", this.#handleProductsSelected);

      // Load default products if provided (with retry for drawer data)
      this.#loadDefaultProductsWithRetry();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    // Clean up event listener
    document.removeEventListener("compare:products-selected", this.#handleProductsSelected);
  }

  /**
   * Load default products with retry mechanism to wait for drawer data
   */
  #loadDefaultProductsWithRetry() {
    const defaultProductIdsStr = this.dataset.defaultProductIds;
    if (!defaultProductIdsStr || defaultProductIdsStr.trim() === "") {
      return;
    }

    const maxRetries = 10;
    let retryCount = 0;

    const tryLoad = () => {
      // @ts-ignore - window.compareDrawer is a global reference
      if (window.compareDrawer && window.compareDrawer.compareData) {
        this.#loadDefaultProducts();
      } else if (retryCount < maxRetries) {
        retryCount++;
        setTimeout(tryLoad, 100); // Retry after 100ms
      } else {
        console.warn("Compare drawer data not available after retries");
      }
    };

    tryLoad();
  }

  /**
   * Load default products from data attribute
   */
  #loadDefaultProducts() {
    const defaultProductIdsStr = this.dataset.defaultProductIds;
    if (defaultProductIdsStr && defaultProductIdsStr.trim() !== "") {
      // Convert comma-separated string to array of IDs
      const productIds = defaultProductIdsStr
        .split(",")
        .map(id => id.trim())
        .filter(id => id);

      if (productIds.length > 0) {
        // Convert product IDs to full product objects using compare drawer data
        // @ts-ignore - window.compareDrawer is a global reference
        if (window.compareDrawer && window.compareDrawer.compareData) {
          const fullProducts = this.#getProductsById(productIds);
          if (fullProducts.length > 0) {
            this.products = fullProducts;
          }
        }
      }
    }
  }

  /**
   * Get full product objects by IDs from compare data
   * @param {Array} productIds - Array of product IDs or product objects
   * @returns {Array<any>}
   */
  #getProductsById(productIds) {
    const products = [];
    // @ts-ignore
    const compareData = window.compareDrawer?.compareData || {};

    productIds.forEach(item => {
      // Handle both product IDs (string) and product objects from Shopify
      const productId = typeof item === "string" ? item : item?.id || item;
      const product = this.#findProductById(productId, compareData);
      if (product) products.push(product);
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
   * Handle products selected event from drawer
   * @param {CustomEvent} event
   */
  #handleProductsSelected = event => {
    const { products } = event.detail;
    if (products && Array.isArray(products)) {
      this.products = products;
    }
  };

  /**
   * Handle change style button click
   * Context-aware: opens drawer if on page, goes back if in drawer
   */
  #handleChangeStyleClick() {
    const context = this.dataset.context || "drawer";

    if (context === "page") {
      // On page: open the drawer in external mode
      // @ts-ignore - window.compareDrawer is a global reference
      if (window.compareDrawer) {
        // Create a fake event with data-comparison-mode attribute
        const fakeButton = document.createElement("button");
        fakeButton.setAttribute("data-comparison-mode", "external");
        const fakeEvent = { target: fakeButton };

        // @ts-ignore
        window.compareDrawer.open(fakeEvent);
      }
    } else {
      // In drawer: go back to selection view (existing behavior)
      this.dispatchEvent(new CustomEvent("comparison:back", { bubbles: true }));
    }
  }

  /**
   * Set products data and trigger render
   * @param {Array<any>} products - Array of product objects to compare
   */
  set products(products) {
    this.#products = products || [];
    this.#renderComparison();
  }

  /**
   * Get products data
   * @returns {Array<any>}
   */
  get products() {
    return this.#products;
  }

  /**
   * Render the comparison view with products as a table
   */
  #renderComparison() {
    const container = /** @type {HTMLElement} */ (this.refs.comparisonContent);
    if (!container) return;

    // Hide the loader if it exists  👈 ADD THESE LINES
    const loader = /** @type {HTMLElement} */ (this.refs.comparisonLoader);
    if (loader) {
      loader.classList.add("hidden");
    }

    // Clear container
    container.innerHTML = "";

    // Check if we have products
    if (!this.#products || this.#products.length === 0) {
      container.innerHTML = '<p class="text-center text-14-light p-4">No products to compare</p>';
      return;
    }

    // Create table
    const table = document.createElement("table");
    table.className = "w-full table-fixed comparison-table";

    // Create colgroup for column widths
    const colgroup = document.createElement("colgroup");
    colgroup.innerHTML = `<col class="max-w-[89px]" />`;
    table.appendChild(colgroup);

    // Create tbody
    const tbody = document.createElement("tbody");

    // First row: Product Info
    tbody.appendChild(this.#createProductInfoRow());

    // Dynamic rows: Comparison Fields
    const comparisonFields = this.#getAllComparisonFields();
    comparisonFields.forEach(fieldKey => {
      tbody.appendChild(this.#createComparisonFieldRow(fieldKey));
    });

    // Last row: Price and Shop Now
    tbody.appendChild(this.#createPriceRow());

    table.appendChild(tbody);
    container.appendChild(table);
  }

  /**
   * Create product info row (images, ratings, titles, change style button)
   * @returns {HTMLTableRowElement}
   */
  #createProductInfoRow() {
    const row = document.createElement("tr");

    // Header cell
    const th = document.createElement("th");
    th.className = "text-14-regular md:text-16-regular text-left py-3 pl-3 pr-1 align-middle max-w-[92px]";
    // th.textContent = this.dataset.category || "";
    th.textContent = "";
    row.appendChild(th);

    // Product cells
    this.#products.forEach(product => {
      const td = document.createElement("td");
      td.className = "text-center px-1 py-3 align-top";
      td.innerHTML = `
        <img
          src="${product.featuredImage?.src ?? ""}"
          alt="${product.featuredImage?.alt ?? ""}"
          class="mx-auto max-w-[100px] max-h-[100px] brightness-110"
          loading="lazy"
          width="100"
          height="100"
        />
        <div class="flex gap-1 items-center justify-center mt-1">
          ${this.#renderProductRating(product)}
        </div>
        <p class="text-16-bold mt-0.5 text-center">${product.title || ""}</p>
        <button class="text-12-bold text-brunt-orange py-[14px] underline" data-product-id="${product.id}">
          <span class="underline uppercase">Change Style</span>
        </button>
      `;

      // Add click handler for change style button
      const changeBtn = td.querySelector("button");
      if (changeBtn) {
        changeBtn.addEventListener("click", () => {
          this.#handleChangeStyleClick();
        });
      }

      row.appendChild(td);
    });

    return row;
  }

  /**
   * Render product rating using Okendo
   * @param {any} product
   * @returns {string}
   */
  #renderProductRating(product) {
    // Get rating data
    const ratingValue = product.aggregateRating?.ratingValue || 0;
    const reviewCount = product.aggregateRating?.reviewCount || 0;

    return `
      <svg class="h-[14px] w-[14px]" viewBox="0 0 20 20" fill="currentColor">
        <path d="M10 1L12.9389 6.98278L19.5106 7.90983L14.7553 12.5172L15.8779 19.0902L10 15.9L4.12215 19.0902L5.24472 12.5172L0.489435 7.90983L7.06107 6.98278L10 1Z"/>
      </svg>
      <p class="text-12-light">
        <span>${ratingValue}</span>
        <span>(${reviewCount})</span>
      </p>
    `;
  }

  /**
   * Get all unique comparison field keys from all products
   * @returns {string[]}
   */
  #getAllComparisonFields() {
    const fieldsSet = new Set();
    this.#products.forEach(product => {
      if (product.compare_fields && Array.isArray(product.compare_fields)) {
        product.compare_fields.forEach(field => {
          if (field.key) fieldsSet.add(field.key);
        });
      }
    });
    return Array.from(fieldsSet);
  }

  /**
   * Create a comparison field row
   * @param {string} fieldKey
   * @returns {HTMLTableRowElement}
   */
  #createComparisonFieldRow(fieldKey) {
    const row = document.createElement("tr");

    // Header cell
    const th = document.createElement("th");
    th.className = "text-14-regular md:text-16-regular text-left py-3 pl-3 pr-1 align-middle";
    th.textContent = fieldKey;
    row.appendChild(th);

    // Product cells
    this.#products.forEach(product => {
      const td = document.createElement("td");
      td.className = "text-center py-3 pl-1 pr-3 align-middle";

      const field = product.compare_fields?.find(f => f.key === fieldKey);

      if (field && field.value !== null && field.value !== undefined) {
        // Check the type of the value for THIS specific product's field
        if (typeof field.value === "string") {
          td.innerHTML = `<div class="text-14-light">${field.value}</div>`;
        } else if (typeof field.value === "boolean") {
          // Boolean value - show tick or dash
          td.innerHTML = field.value ? this.#getGreenTickSVG() : this.#getGrayDashSVG();
        } else {
          // Fallback for other types
          td.innerHTML = `<div class="text-14-light">${field.value}</div>`;
        }
      } else {
        // No field found or value is null/undefined - show gray dash
        td.innerHTML = this.#getGrayDashSVG();
      }

      row.appendChild(td);
    });

    return row;
  }

  /**
   * Create price row with Shop Now button
   * @returns {HTMLTableRowElement}
   */
  #createPriceRow() {
    const row = document.createElement("tr");

    // Header cell
    const th = document.createElement("th");
    th.className = "text-14-regular md:text-16-regular text-left py-3 pl-3 pr-1 align-middle";
    th.textContent = "Price";
    row.appendChild(th);

    // Product cells
    this.#products.forEach(product => {
      const td = document.createElement("td");
      td.className = "text-center py-3 pl-1 pr-3 align-middle";

      const priceHTML = this.#formatPriceRange(product.price_min, product.price_max, product.price);

      td.innerHTML = `
        <p class="text-20-bold">${priceHTML}</p>
        <a
          href="${product.url || "#"}"
          target="_blank"
          class="px-5 py-[14px] bg-brunt-orange text-white uppercase text-12-bold no-underline flex items-center justify-center mt-3"
        >
          SHOP NOW
        </a>
      `;

      row.appendChild(td);
    });

    return row;
  }

  /**
   * Format price range
   * @param {number} priceMin
   * @param {number} priceMax
   * @param {number} price
   * @returns {string}
   */
  #formatPriceRange(priceMin, priceMax, price) {
    // If min and max are the same, show single price
    if (priceMin === priceMax) {
      return this.#formatPrice(priceMin || price);
    }
    // Show range
    return `${this.#formatPrice(priceMin)}-${this.#formatPrice(priceMax)}`;
  }

  /**
   * Format single price with cents as superscript
   * @param {number} price
   * @returns {string}
   */
  #formatPrice(price) {
    if (price == null) return "";

    const dollars = Math.floor(price / 100);
    const cents = price % 100;

    if (cents === 0) {
      return `$${dollars}`;
    }

    const centsStr = cents.toString().padStart(2, "0");
    return `$${dollars}<sup>${centsStr}</sup>`;
  }

  /**
   * Get green tick SVG
   * @returns {string}
   */
  #getGreenTickSVG() {
    return `
      <svg class="inline-block" width="25" height="24" viewBox="0 0 25 24" fill="none">
        <g clip-path="url(#clip0_green_tick)">
          <path d="M12.5 21C17.4706 21 21.5 16.9706 21.5 12C21.5 7.02944 17.4706 3 12.5 3C7.52944 3 3.5 7.02944 3.5 12C3.5 16.9706 7.52944 21 12.5 21Z" fill="#118047"/>
          <path d="M8.375 12.375L11 14.625L16.25 9.375" stroke="white" stroke-width="2"/>
        </g>
        <defs>
          <clipPath id="clip0_green_tick">
            <rect width="24" height="24" fill="white" transform="translate(0.5)"/>
          </clipPath>
        </defs>
      </svg>
    `;
  }

  /**
   * Get gray dash SVG
   * @returns {string}
   */
  #getGrayDashSVG() {
    return `
      <svg class="inline-block" width="25" height="24" viewBox="0 0 25 24" fill="none">
        <g clip-path="url(#clip0_gray_dash)">
          <path d="M12.5 21C17.4706 21 21.5 16.9706 21.5 12C21.5 7.02944 17.4706 3 12.5 3C7.52944 3 3.5 7.02944 3.5 12C3.5 16.9706 7.52944 21 12.5 21Z" fill="#929286"/>
          <path d="M8.75 12H16.25" stroke="white" stroke-width="2" stroke-linejoin="round"/>
        </g>
        <defs>
          <clipPath id="clip0_gray_dash">
            <rect width="24" height="24" fill="white" transform="translate(0.5)"/>
          </clipPath>
        </defs>
      </svg>
    `;
  }
}

if (!customElements.get("comparison-chart-component")) {
  customElements.define("comparison-chart-component", ComparisonChartComponent);
}
