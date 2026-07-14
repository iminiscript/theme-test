import { Component } from "@theme/component";
import { CartAddEvent } from "@theme/events";

class ProductAddToCart extends Component {
  static get observedAttributes() {
    return [
      "data-selected-variant-id",
      "data-price",
      "data-compare-at-price",
      "data-inventory-policy",
      "data-inventory-quantity",
      "data-items",
      "data-sold-out",
    ];
  }

  constructor() {
    super();
    this.productId = null;
    this.isUs = false;
    this.currencySymbol = null;
    this.currentVariant = null;
    this.bundleItems = null;
    this.button = null;
    this.buttonText = null;
    this.buttonPrice = null;
    this.topCopy = null;
    this.originalTopCopyContent = null;
    this.isAddingToCart = false;
    this.buttonClickHandler = null;
    this.inlineFormContainer = null;
    this.preOrderConfirmHandler = null;
    this.notifyEmailFormHandler = null;
    this.notifyEmailInlineFormHandler = null;
    this.notifyEmailInlineFormKeyHandler = null;
    this.resizeTimeout = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.init();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue !== newValue) {
      this.updateStateFromAttributes();
    }
  }

  init() {
    this.productId = this.dataset.productId ? parseInt(this.dataset.productId, 10) : null;
    this.isUs = this.dataset.isUs === "true";

    // Get currency symbol
    const currencyScript = this.querySelector("script[data-currency-symbol]");
    this.currencySymbol = currencyScript
      ? JSON.parse(currencyScript.textContent) || currencyScript.dataset.currencySymbol
      : window.Shopify?.currency?.active || "$";

    this.button = this.querySelector("[data-add-to-cart-button]");
    this.buttonText = this.querySelector("[data-button-text]");
    this.buttonPrice = this.querySelector("[data-button-price]");
    this.topCopy = this.querySelector("[data-top-copy]");

    // Store original top copy content if it exists
    if (this.topCopy) {
      this.originalTopCopyContent = this.topCopy.innerHTML;
    }

    if (this.button) {
      if (this.buttonClickHandler) this.button.removeEventListener("click", this.buttonClickHandler);
      this.buttonClickHandler = this.handleAddToCartClick.bind(this);
      this.button.addEventListener("click", this.buttonClickHandler);
    }

    // Handle window resize for notify email form
    this.handleResize = this.handleResize.bind(this);
    window.addEventListener("resize", this.handleResize);

    this.updateStateFromAttributes();
  }

  disconnectedCallback() {
    super.disconnectedCallback?.();
    if (this.handleResize) {
      window.removeEventListener("resize", this.handleResize);
    }
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }
    this.removeNotifyEmailInlineForm();
  }

  handleResize() {
    // Debounce resize handling
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }
    this.resizeTimeout = setTimeout(() => {
      const currentState = this.getCurrentButtonState();
      if (currentState === "out_of_stock" && !this.isUs) {
        this.handleNotifyEmailState();
      }
    }, 250);
  }

  updateStateFromAttributes() {
    // 1. Check for Bundle Mode
    if (this.dataset.items) {
      try {
        this.bundleItems = JSON.parse(this.dataset.items);
        this.currentVariant = null;
        this.updateBundleState();
        return;
      } catch (e) {
        console.warn("[ProductAddToCart] Invalid data-items JSON", e);
      }
    }

    // 2. Fallback to Single Variant Mode
    const variantId = this.dataset.selectedVariantId;
    if (variantId) {
      this.bundleItems = null;
      const hasSoldOutTag = this.dataset.soldOut === "true";
      this.currentVariant = {
        id: parseInt(variantId, 10),
        price: parseInt(this.dataset.price, 10),
        compare_at_price: this.dataset.compareAtPrice ? parseInt(this.dataset.compareAtPrice, 10) : null,
        inventory_policy: this.dataset.inventoryPolicy,
        inventory_quantity: parseInt(this.dataset.inventoryQuantity, 10),
        available: true,
        requires_selling_plan: false, // Set to false for now as per requirements
        has_sold_out_tag: hasSoldOutTag,
      };

      // Unavailable: inventory_quantity <= 0 && inventory_policy === "deny"
      if (this.currentVariant.inventory_quantity <= 0 && this.currentVariant.inventory_policy === "deny") {
        this.currentVariant.available = false;
      }

      this.updateSingleState();
    }
  }

  updateBundleState() {
    if (!this.bundleItems || this.bundleItems.length === 0) {
      this.setButtonState("sold_out");
      if (this.buttonPrice) {
        this.buttonPrice.innerHTML = "";
      }
      return;
    }

    // Get bundle state based on new requirements
    const state = this.getBundleButtonState();
    this.setButtonState(state);

    if (this.buttonPrice) {
      if (["default", "pre_order", "subscribe"].includes(state)) {
        // Calculate total price
        let totalRegularPrice = 0;
        this.bundleItems.forEach(item => {
          if (item.price) totalRegularPrice += item.price;
        });

        // Get bundle discount percentage from bundle-atc-component
        const bundleAtcComponent = document.querySelector("bundle-atc-component");
        const discountPercentage = bundleAtcComponent
          ? parseInt(bundleAtcComponent.dataset.discountPercentage || "0", 10)
          : 0;

        // Calculate discounted price (using floor to match Liquid behavior)
        const discountMultiplier = (100 - discountPercentage) / 100;
        const totalDiscountedPrice = Math.floor(totalRegularPrice * discountMultiplier);

        const aggregateVariant = {
          price: totalDiscountedPrice,
          compare_at_price: discountPercentage > 0 ? totalRegularPrice : null,
        };
        this.buttonPrice.innerHTML = ` - ${this.formatPriceDisplay(aggregateVariant)}`;
      } else {
        // Clear price for out_of_stock, sold_out, and other states
        this.buttonPrice.innerHTML = "";
      }
    }
  }

  updateSingleState() {
    const variant = this.currentVariant;
    const state = this.getButtonState(variant);
    this.setButtonState(state);

    if (this.buttonPrice) {
      if (["default", "pre_order", "subscribe"].includes(state) && variant) {
        this.buttonPrice.innerHTML = ` - ${this.formatPriceDisplay(variant)}`;
      } else {
        // Clear price for out_of_stock, sold_out, and other states
        this.buttonPrice.innerHTML = "";
      }
    }
  }

  setButtonState(state) {
    if (!this.button || !this.buttonText) return;

    // Handle out_of_stock state for non-US users
    if (state === "out_of_stock" && !this.isUs) {
      this.handleNotifyEmailState();
      return;
    }

    // Remove notify email inline form if it exists
    this.removeNotifyEmailInlineForm();

    this.button.disabled = state === "sold_out";
    this.buttonText.textContent = this.getButtonText(state);

    this.button.className = this.button.className.replace(/product__addToCartButton--\S+/g, "");
    this.button.classList.add(`product__addToCartButton--${state.replace(/_/g, "-")}`);

    // Update top copy for out_of_stock state
    this.updateTopCopy(state);
  }

  handleNotifyEmailState() {
    // On desktop: show inline form, hide button
    // On mobile: button stays visible (modal will show on click)
    if (window.innerWidth >= 768) {
      this.showNotifyEmailInlineForm();
    } else {
      // Mobile: keep button visible, it will trigger modal
      this.button.disabled = false;
      this.buttonText.textContent = this.getButtonText("out_of_stock");
      this.button.className = this.button.className.replace(/product__addToCartButton--\S+/g, "");
      this.button.classList.add("product__addToCartButton--out-of-stock");
    }
    this.updateTopCopy("out_of_stock");
  }

  showNotifyEmailInlineForm() {
    // Remove existing inline form if any
    this.removeNotifyEmailInlineForm();

    // Hide the button
    if (this.button) {
      this.button.style.display = "none";
    }

    // Create inline form container
    this.inlineFormContainer = document.createElement("div");
    this.inlineFormContainer.className = "notify-email-inline-form";
    this.inlineFormContainer.innerHTML = `
      <div class="flex gap-2">
        <input
          type="email"
          name="email"
          class="notify-email-inline-input"
          placeholder="Email Address"
          autocomplete="email"
          required
          data-notify-email-inline-input
          aria-label="Email address"
        />
        <button
        type="button"
        class="notify-email-inline-submit btn btn-lg btn-primary-asphalt"
        data-notify-email-inline-submit
        aria-label="Submit email notification"
        >
        <span data-notify-email-inline-submit-text>Submit</span>
      </button>
      </div>
      <div class="notify-email-inline-error hidden m-2" data-notify-email-inline-error role="alert">
        <span data-notify-email-inline-error-text></span>
      </div>
      <div class="notify-email-inline-message hidden" data-notify-email-inline-message role="alert">
        <span data-notify-email-inline-message-text></span>
      </div>
    `;

    // Insert after button or at the end of the component
    if (this.button && this.button.parentNode) {
      this.button.parentNode.insertBefore(this.inlineFormContainer, this.button.nextSibling);
    } else {
      this.appendChild(this.inlineFormContainer);
    }

    // Set up form handler
    this.setupNotifyEmailInlineForm();
  }

  removeNotifyEmailInlineForm() {
    if (this.inlineFormContainer && this.inlineFormContainer.parentNode) {
      this.inlineFormContainer.parentNode.removeChild(this.inlineFormContainer);
      this.inlineFormContainer = null;
    }
    if (this.button) {
      this.button.style.display = "";
    }
  }

  setupNotifyEmailInlineForm() {
    if (!this.inlineFormContainer) return;

    const input = this.inlineFormContainer.querySelector("[data-notify-email-inline-input]");
    const submitBtn = this.inlineFormContainer.querySelector("[data-notify-email-inline-submit]");
    const errorDiv = this.inlineFormContainer.querySelector("[data-notify-email-inline-error]");
    const messageDiv = this.inlineFormContainer.querySelector("[data-notify-email-inline-message]");

    if (!input || !submitBtn) return;

    // Remove existing handler
    if (this.notifyEmailInlineFormHandler) {
      submitBtn.removeEventListener("click", this.notifyEmailInlineFormHandler);
      input.removeEventListener("keypress", this.notifyEmailInlineFormKeyHandler);
    }

    // Create handlers
    this.notifyEmailInlineFormHandler = event => {
      event.preventDefault();
      this.handleNotifyEmailSubmit(input, submitBtn, errorDiv, messageDiv, true);
    };

    this.notifyEmailInlineFormKeyHandler = event => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.handleNotifyEmailSubmit(input, submitBtn, errorDiv, messageDiv, true);
      }
    };

    submitBtn.addEventListener("click", this.notifyEmailInlineFormHandler);
    input.addEventListener("keypress", this.notifyEmailInlineFormKeyHandler);
  }

  updateTopCopy(state) {
    if (!this.topCopy) return;

    const topCopyElement = this.topCopy;
    if (state === "out_of_stock") {
      topCopyElement.textContent = "Out of stock!";
      if (topCopyElement instanceof HTMLElement) {
        topCopyElement.style.color = "var(--color-cherry)";
      }
    } else {
      // Restore original content or clear if it was empty
      if (this.originalTopCopyContent) {
        topCopyElement.innerHTML = this.originalTopCopyContent;
        if (topCopyElement instanceof HTMLElement) {
          topCopyElement.style.color = "";
        }
      } else {
        topCopyElement.textContent = "";
        if (topCopyElement instanceof HTMLElement) {
          topCopyElement.style.color = "";
        }
      }
    }
  }

  getButtonText(state) {
    const settings = {
      default: this.dataset.buttonTextDefault ?? "Add to Cart",
      preOrder: this.dataset.buttonTextPreOrder ?? "Pre-Order",
      subscribe: this.dataset.buttonTextSubscribe ?? "Subscribe",
      outOfStockUs: this.dataset.buttonTextOutOfStockUs ?? "Notify me via text",
      outOfStockInternational: this.dataset.buttonTextOutOfStockInternational ?? "Notify me via email",
      soldOut: this.dataset.buttonTextSoldOut ?? "Sold Out",
    };

    const stateMap = {
      pre_order: settings.preOrder,
      subscribe: settings.subscribe,
      out_of_stock: this.isUs ? settings.outOfStockUs : settings.outOfStockInternational,
      sold_out: settings.soldOut,
    };

    return stateMap[state] ?? settings.default;
  }

  formatPrice(priceInCents) {
    if (isNaN(priceInCents) || priceInCents === null) return { floor: "", sup: "" };
    const floor = Math.floor(priceInCents / 100);
    const sup = priceInCents % 100;
    return {
      floor: `${this.currencySymbol}${floor}`,
      sup: String(sup).padStart(2, "0"),
    };
  }

  formatPriceDisplay(variant) {
    if (!variant || variant.price === null) return "";

    const priceFormatted = this.formatPrice(variant.price);
    const priceSup = parseInt(priceFormatted.sup, 10);
    const productId = this.productId ?? "";

    const priceHtml = `<span class="igPrice" data-product-id="${productId}">${priceFormatted.floor}${priceSup > 0 ? `<sup class="top-[-0.2em]">${priceFormatted.sup}</sup>` : ""}</span>`;

    const { compare_at_price: compareAtPrice, price } = variant;
    if (compareAtPrice && compareAtPrice > price && compareAtPrice > 0) {
      const comparePriceFormatted = this.formatPrice(compareAtPrice);
      const comparePriceSup = parseInt(comparePriceFormatted.sup, 10);
      const comparePriceHtml = `<span class="text-(--color-gray-accessible) text-12-regular line-through compareAtPrice"><span class="igComparePrice" data-product-id="${productId}">${comparePriceFormatted.floor}${comparePriceSup > 0 ? `<sup class="top-[-0.3em]">${comparePriceFormatted.sup}</sup>` : ""}</span></span>`;
      return `${priceHtml} ${comparePriceHtml}`;
    }

    return priceHtml;
  }

  getBundleButtonState() {
    if (!this.bundleItems || this.bundleItems.length === 0) {
      return "sold_out";
    }

    // Priority order: Pre order → Subscribe → Add to cart → Notify Me → Sold out

    // 1. Check for Pre order: Any variant's inventory_policy === "continue"
    const hasPreOrder = this.bundleItems.some(item => item.inventory_policy === "continue");
    if (hasPreOrder) return "pre_order";

    // 2. Check for Subscribe: Any variant has requires_selling_plan === true
    const hasSubscribe = this.bundleItems.some(item => item.requires_selling_plan === true);
    if (hasSubscribe) return "subscribe";

    // 3. Check for Add to cart: All variants available with inventory > 0 and policy = "deny"
    const allAvailable = this.bundleItems.every(item => {
      return item.available && item.inventory_quantity > 0 && item.inventory_policy === "deny";
    });
    if (allAvailable) return "default";

    // 4. Check for Notify Me: Any variant unavailable, policy = "deny"
    const hasUnavailableDeny = this.bundleItems.some(item => {
      const isUnavailable = !item.available || (item.inventory_quantity <= 0 && item.inventory_policy === "deny");
      return isUnavailable && item.inventory_policy === "deny";
    });
    if (hasUnavailableDeny) {
      // Check if any variant has sold_out tag
      const hasSoldOutTag = this.bundleItems.some(item => item.has_sold_out_tag === true);
      if (hasSoldOutTag) {
        return "sold_out";
      }
      return "out_of_stock";
    }

    // 5. Default to sold_out
    return "sold_out";
  }

  getButtonState(variant) {
    if (!variant) return "sold_out";

    // Priority order: Pre order → Subscribe → Add to cart → Notify Me → Sold out

    // 1. Pre order: inventory_policy === "continue" (regardless of quantity)
    if (variant.inventory_policy === "continue") {
      return "pre_order";
    }

    // 2. Subscribe: requires_selling_plan === true
    if (variant.requires_selling_plan === true) {
      return "subscribe";
    }

    // 3. Add to cart: available, inventory > 0, and inventory_policy === "deny"
    if (variant.available && variant.inventory_quantity > 0 && variant.inventory_policy === "deny") {
      return "default";
    }

    // 4. Notify Me / Sold out: unavailable (inventory_quantity <= 0 && inventory_policy === "deny")
    const isUnavailable =
      !variant.available || (variant.inventory_quantity <= 0 && variant.inventory_policy === "deny");
    if (isUnavailable && variant.inventory_policy === "deny") {
      // Check if product has sold_out tag
      if (variant.has_sold_out_tag === true) {
        return "sold_out";
      }
      return "out_of_stock";
    }

    // 5. Default to sold_out
    return "sold_out";
  }

  async handleAddToCartClick(event) {
    event.preventDefault();
    if (this.isAddingToCart) return;

    // Check if current state is pre_order - show modal instead
    const currentState = this.getCurrentButtonState();
    if (currentState === "pre_order") {
      this.showPreOrderModal();
      return;
    }

    // Check if current state is out_of_stock and user is not in US - show modal on mobile
    if (currentState === "out_of_stock" && !this.isUs) {
      if (window.innerWidth < 768) {
        this.showNotifyEmailModal();
        return;
      }
      // Desktop: inline form is already shown, don't do anything
      return;
    }

    await this.addToCart();
  }

  getCurrentButtonState() {
    if (this.bundleItems) {
      return this.getBundleButtonState();
    } else if (this.currentVariant) {
      return this.getButtonState(this.currentVariant);
    }
    return "sold_out";
  }

  showPreOrderModal() {
    const modal = document.querySelector("#pre-order-modal");
    if (!modal) {
      console.warn("[ProductAddToCart] Pre-order modal not found");
      return;
    }

    // Set the confirm button text to match the default add to cart button text
    const confirmButton = modal.querySelector("[data-pre-order-confirm]");
    const confirmButtonText = modal.querySelector("[data-pre-order-confirm-text]");
    if (confirmButton && confirmButtonText) {
      const defaultText = this.dataset.buttonTextDefault ?? "Add to Cart";
      confirmButtonText.textContent = defaultText;
    }

    // Show the modal
    if (typeof modal.showDialog === "function") {
      modal.showDialog();
    } else {
      // Fallback: try to find the dialog and show it
      const dialog = modal.querySelector("dialog");
      if (dialog && typeof dialog.showModal === "function") {
        dialog.showModal();
      }
    }

    // Set up the confirm button handler
    this.setupPreOrderModalConfirm(modal);
  }

  setupPreOrderModalConfirm(modal) {
    const confirmButton = modal.querySelector("[data-pre-order-confirm]");
    if (!confirmButton) return;

    // Remove any existing handler
    if (this.preOrderConfirmHandler) {
      confirmButton.removeEventListener("click", this.preOrderConfirmHandler);
    }

    // Create new handler
    this.preOrderConfirmHandler = async event => {
      event.preventDefault();
      event.stopPropagation();

      // Close the modal first
      if (typeof modal.closeDialog === "function") {
        await modal.closeDialog();
      } else {
        // Fallback: try to find the dialog and close it
        const dialog = modal.querySelector("dialog");
        if (dialog && typeof dialog.close === "function") {
          dialog.close();
        }
      }

      // Then add to cart
      await this.addToCart();
    };

    confirmButton.addEventListener("click", this.preOrderConfirmHandler);

    // Clean up handler when modal closes
    const cleanup = () => {
      if (this.preOrderConfirmHandler) {
        confirmButton.removeEventListener("click", this.preOrderConfirmHandler);
        modal.removeEventListener("dialog:close", cleanup);
      }
    };
    modal.addEventListener("dialog:close", cleanup, { once: true });
  }

  showNotifyEmailModal() {
    const modal = document.querySelector("#notify-me-email-modal");
    if (!modal) {
      console.warn("[ProductAddToCart] Notify me email modal not found");
      return;
    }

    // Show the modal
    if (typeof modal.showDialog === "function") {
      modal.showDialog();
    } else {
      const dialog = modal.querySelector("dialog");
      if (dialog && typeof dialog.showModal === "function") {
        dialog.showModal();
      }
    }

    // Set up the form handler
    this.setupNotifyEmailModalForm(modal);
  }

  setupNotifyEmailModalForm(modal) {
    const form = modal.querySelector("[data-notify-email-form]");
    const input = modal.querySelector("[data-notify-email-input]");
    const submitBtn = modal.querySelector("[data-notify-email-submit]");
    const errorDiv = modal.querySelector("[data-notify-email-error]");
    const messageDiv = modal.querySelector("[data-notify-email-message]");

    if (!form || !input || !submitBtn) return;

    // Remove existing handler
    if (this.notifyEmailFormHandler) {
      form.removeEventListener("submit", this.notifyEmailFormHandler);
    }

    // Create new handler
    this.notifyEmailFormHandler = event => {
      event.preventDefault();
      this.handleNotifyEmailSubmit(input, submitBtn, errorDiv, messageDiv, false);
    };

    form.addEventListener("submit", this.notifyEmailFormHandler);
  }

  async handleNotifyEmailSubmit(input, submitBtn, errorDiv, messageDiv, isInline) {
    const email = input.value.trim();

    // Hide previous messages
    if (errorDiv) {
      errorDiv.classList.add("hidden");
    }
    if (messageDiv) {
      messageDiv.classList.add("hidden");
    }

    // Validate email
    if (!email) {
      this.showNotifyEmailError("Please enter an email address.", errorDiv, messageDiv);
      return;
    }

    if (!this.validateEmail(email)) {
      this.showNotifyEmailError("Please enter a valid email address.", errorDiv, messageDiv);
      return;
    }

    // Show loading state
    const submitText =
      submitBtn.querySelector("[data-notify-email-submit-text]") ||
      submitBtn.querySelector("[data-notify-email-inline-submit-text]");
    const originalText = submitText ? submitText.textContent : submitBtn.textContent;
    if (submitText) {
      submitText.textContent = "Submitting...";
    } else {
      submitBtn.textContent = "Submitting...";
    }
    submitBtn.disabled = true;

    // Get Klaviyo ID and Form ID
    const klaviyoId = this.dataset.klaviyoId;
    const formId = this.dataset.klaviyoFormId;

    if (!klaviyoId) {
      this.showNotifyEmailError("Klaviyo ID is not configured.", errorDiv, messageDiv);
      if (submitText) {
        submitText.textContent = originalText;
      } else {
        submitBtn.textContent = originalText;
      }
      submitBtn.disabled = false;
      return;
    }

    try {
      // Build request URL
      const url = `https://a.klaviyo.com/client/back-in-stock-subscriptions/?company_id=${encodeURIComponent(klaviyoId)}`;

      // Prepare form data
      const formData = new FormData();
      formData.append("email", email);
      if (formId) {
        formData.append("form_id", formId);
      }
      // Add product/variant information
      if (this.currentVariant) {
        formData.append("variant_id", this.currentVariant.id);
      }
      if (this.productId) {
        formData.append("product_id", this.productId);
      }

      const response = await fetch(url, {
        method: "POST",
        body: formData,
        headers: {
          Accept: "application/json",
        },
      });

      const data = await response.json();

      if (response.ok && data.success !== false) {
        // Success
        const successMessage = data.message || "Thank you! We'll notify you when this product is back in stock.";
        this.showNotifyEmailSuccess(successMessage, errorDiv, messageDiv);
        input.value = "";

        // Close modal if not inline
        if (!isInline) {
          const modal = document.querySelector("#notify-me-email-modal");
          if (modal && typeof modal.closeDialog === "function") {
            setTimeout(() => {
              modal.closeDialog();
            }, 2000);
          }
        }
      } else {
        // Error
        const errorMessage = data.message || data.error || "Something went wrong. Please try again.";
        this.showNotifyEmailError(errorMessage, errorDiv, messageDiv);
      }
    } catch (error) {
      console.error("[ProductAddToCart] Notify email error:", error);
      this.showNotifyEmailError("Something went wrong. Please try again.", errorDiv, messageDiv);
    } finally {
      if (submitText) {
        submitText.textContent = originalText;
      } else {
        submitBtn.textContent = originalText;
      }
      submitBtn.disabled = false;
    }
  }

  showNotifyEmailError(message, errorDiv, messageDiv) {
    if (errorDiv) {
      const errorText =
        errorDiv.querySelector("[data-notify-email-error-text]") ||
        errorDiv.querySelector("[data-notify-email-inline-error-text]");
      if (errorText) {
        errorText.textContent = message;
      }
      errorDiv.classList.remove("hidden");
    }
    if (messageDiv) {
      messageDiv.classList.add("hidden");
    }
  }

  showNotifyEmailSuccess(message, errorDiv, messageDiv) {
    if (errorDiv) {
      errorDiv.classList.add("hidden");
    }
    if (messageDiv) {
      const messageText = messageDiv.querySelector("[data-notify-email-message-text]");
      if (messageText) {
        messageText.textContent = message;
      } else {
        messageDiv.textContent = message;
      }
      messageDiv.classList.remove("hidden");
      messageDiv.classList.remove("error");
      messageDiv.classList.add("success");
    }
  }

  validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  async addToCart() {
    if (this.isAddingToCart) return;

    if (!this.bundleItems && !this.currentVariant) {
      console.warn("[ProductAddToCart] No items to add.");
      return;
    }

    this.isAddingToCart = true;
    if (this.button) {
      this.button.disabled = true;
      if (this.buttonText) {
        this.buttonText.textContent = "Adding...";
      }
    }

    try {
      let payload = {};
      let source = "product";

      if (this.bundleItems) {
        source = "bundle";

        // Get bundle properties from parent bundle-atc-component if it exists
        let bundleProperties = {};
        const bundleAtcComponent = document.querySelector("bundle-atc-component");
        if (bundleAtcComponent && typeof bundleAtcComponent.collectBundleProperties === "function") {
          bundleProperties = bundleAtcComponent.collectBundleProperties();
        }

        payload = {
          items: this.bundleItems.map(item => ({
            id: item.id,
            quantity: 1,
            properties: {
              ...(item.properties || {}),
              ...bundleProperties,
            },
          })),
        };
      } else {
        let properties = {};
        try {
          if (this.dataset.cartProperties) properties = JSON.parse(this.dataset.cartProperties);
        } catch (e) {
          console.warn("Error parsing properties", e);
        }

        payload = {
          items: [
            {
              id: this.currentVariant.id,
              quantity: 1,
              properties: properties,
            },
          ],
        };
      }

      await this.addToCartAndOpenDrawer(payload, source);
    } catch (error) {
      console.error("[ProductAddToCart] Error:", error);
      alert(error?.message ?? "Failed to add to cart.");
    } finally {
      this.isAddingToCart = false;
      if (this.button) {
        this.button.disabled = false;
      }

      if (this.bundleItems) {
        this.setButtonState("default");
      } else {
        const state = this.getButtonState(this.currentVariant);
        this.setButtonState(state);
      }
    }
  }

  async addToCartAndOpenDrawer(payload, source = "product") {
    const response = await fetch(window.Shopify.routes.root + "cart/add.js", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.description || "Failed to add items to cart");
    }

    const cartData = await response.json();

    const sectionId = this.dataset.sectionId || "product-section";
    const cartAddEvent = new CartAddEvent(cartData, sectionId, {
      source: source,
      itemCount: cartData.item_count,
      sections: {},
    });

    document.dispatchEvent(cartAddEvent);

    return cartData;
  }
}

if (!customElements.get("product-add-to-cart")) {
  customElements.define("product-add-to-cart", ProductAddToCart);
}
