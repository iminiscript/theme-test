/**
 * Order Tracking Component
 * Handles Malomo API integration for order tracking
 * VERSION: 2.7 (Timeline checkmarks & progress bar percentages)
 */

class OrderTracking {
  // Constants
  static STATUSES = {
    ORDER_PLACED: "order_placed",
    IN_TRANSIT: "in_transit",
    OUT_FOR_DELIVERY: "out_for_delivery",
    DELIVERED: "delivered",
  };

  static STATUS_LIST = ["order_placed", "in_transit", "out_for_delivery", "delivered"];

  static PROGRESS_PERCENTAGES = {
    order_placed: 12.5,
    in_transit: 47,
    out_for_delivery: 80,
    delivered: 100,
  };

  static STATUS_MAP = {
    order_placed: ["pre_transit", "label_created"],
    in_transit: ["in_transit", "received_at_origin_facility", "departed"],
    out_for_delivery: ["out_for_delivery"],
    delivered: ["delivered", "arrived_at_destination"],
  };

  static DEFAULT_API_URL = "https://api.gomalomo.com";
  static DEFAULT_API_KEY = "pk_693f19fe342d3f40717af176c8bf69fc";
  static PRICE_TOLERANCE = 100; // $1.00 in cents
  static MAX_EVENTS_BEFORE_COLLAPSE = 3;

  constructor() {
    this.elements = this.initializeElements();
    this.config = this.initializeConfig();
    this.init();
  }

  /**
   * Initialize DOM element references
   */
  initializeElements() {
    return {
      form: document.getElementById("order-tracking-form"),
      errorContainer: document.getElementById("tracking-error"),
      orderStatusView: document.getElementById("order-status-view"),
      shippingDetailsPanel: document.getElementById("shipping-details-panel"),
      trackingHeader: document.querySelector('[data-state="header"]'),
      formContainer: document.querySelector('[data-state="form"]'),
    };
  }

  /**
   * Initialize configuration
   */
  initializeConfig() {
    return {
      apiKey: this.getApiKey(),
      apiUrl: this.getApiUrl(),
    };
  }

  /**
   * Initialize component
   */
  init() {
    if (!this.elements.form) return;

    this.elements.form.addEventListener("submit", this.handleSubmit.bind(this));
    this.setupInputListeners();
    this.setupShowMoreButton();
    this.checkUrlParameters();
  }

  /**
   * Setup input listeners to clear errors
   */
  setupInputListeners() {
    const inputs = this.elements.form.querySelectorAll("input");
    inputs.forEach(input => {
      input.addEventListener("input", () => this.hideError());
    });
  }

  // ============================================================================
  // API Configuration
  // ============================================================================

  getApiKey() {
    const metaTag = document.querySelector('meta[name="malomo-api-key"]');
    if (metaTag) return metaTag.content;

    const section = document.querySelector(".order-tracking-section");
    return section?.dataset?.malomoApiKey || OrderTracking.DEFAULT_API_KEY;
  }

  getApiUrl() {
    const metaTag = document.querySelector('meta[name="malomo-api-url"]');
    if (metaTag) return metaTag.content;

    return OrderTracking.DEFAULT_API_URL;
  }

  // ============================================================================
  // URL Management
  // ============================================================================

  checkUrlParameters() {
    const params = new URLSearchParams(window.location.search);
    const orderNumber = params.get("order") || params.get("order_number");
    const email = params.get("email");
    const trackingNumber = params.get("tracking") || params.get("tracking_number");
    const hasFormParams = params.has("order_number") || params.has("email") || params.has("tracking_number");

    if (hasFormParams && (!orderNumber || !email) && !trackingNumber) {
      this.cleanUrl();
      return;
    }

    if (orderNumber && email) {
      this.fillFormFields({ orderNumber, email });
      this.elements.form.dispatchEvent(new Event("submit"));
    } else if (trackingNumber) {
      this.fillFormFields({ trackingNumber });
      this.elements.form.dispatchEvent(new Event("submit"));
    } else if (hasFormParams) {
      this.cleanUrl();
    }
  }

  fillFormFields({ orderNumber, email, trackingNumber }) {
    if (orderNumber) document.getElementById("order-number").value = orderNumber;
    if (email) document.getElementById("email-address").value = email;
    if (trackingNumber) document.getElementById("tracking-number").value = trackingNumber;
  }

  cleanUrl() {
    if (window.history?.replaceState) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  // ============================================================================
  // Form Handling
  // ============================================================================

  async handleSubmit(event) {
    event.preventDefault();

    this.hideError();
    this.showLoading();

    try {
      const formData = new FormData(this.elements.form);
      const trackingData = await this.fetchTrackingData(formData);
      this.displayTrackingInfo(trackingData);
      this.cleanUrl();
    } catch (error) {
      this.showError(error.message);
      this.hideLoading();
    }
  }

  async fetchTrackingData(formData) {
    let orderNumber = formData.get("order_number")?.trim();
    const email = formData.get("email")?.trim();
    const trackingNumber = formData.get("tracking_number")?.trim();

    // Strip # prefix from order number if present
    if (orderNumber && orderNumber.startsWith("#")) {
      orderNumber = orderNumber.substring(1);
    }

    if (trackingNumber) {
      return await this.trackByTrackingNumber(trackingNumber);
    } else if (orderNumber && email) {
      return await this.trackByOrderNumber(orderNumber, email);
    } else {
      throw new Error("Please provide either an order number with email or a tracking number.");
    }
  }

  // ============================================================================
  // API Methods
  // ============================================================================

  async trackByOrderNumber(orderNumber, email) {
    const url = new URL(`${this.config.apiUrl}/orders`);
    url.searchParams.append("number", orderNumber);
    url.searchParams.append("customer_email", email);

    return await this.fetchOrderData(url);
  }

  async trackByTrackingNumber(trackingNumber) {
    const url = new URL(`${this.config.apiUrl}/orders`);
    url.searchParams.append("tracking_code", trackingNumber);

    return await this.fetchOrderData(url);
  }

  async fetchOrderData(url) {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/vnd.malomo+json; version=1",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(
          "The details you provided do not correspond to an active order. Please check your email for the correct information."
        );
      }
      if (response.status === 403) {
        // Try to get more details from the error response
        let errorMessage =
          "Access forbidden. Please check your order number and email address, or try using your tracking number instead.";
        try {
          const errorData = await response.json();
          if (errorData.message) {
            errorMessage = errorData.message;
          }
        } catch (e) {
          // If we can't parse the error, use the default message
        }
        throw new Error(errorMessage);
      }
      throw new Error("Unable to retrieve tracking information. Please try again later.");
    }

    const data = await response.json();
    return Array.isArray(data) && data.length > 0 ? data[0] : data;
  }

  // ============================================================================
  // Display Methods
  // ============================================================================

  displayTrackingInfo(data) {
    this.hideLoading();
    this.showTrackingView();

    this.updateOrderStatusHeader(data);
    this.updateTimeline(data);
    this.updateShippingDetails(data);
    this.updateOrderItems(data);
    this.updateTrackingActivity(data);
    this.updateActionButtons(data);

    // Scroll to top after displaying tracking info
    this.scrollToTop();
  }

  showTrackingView() {
    this.elements.trackingHeader.classList.add("hidden");
    this.elements.formContainer.classList.add("hidden");
    this.elements.orderStatusView.classList.remove("hidden");
    this.elements.shippingDetailsPanel.classList.remove("hidden");
  }

  // ============================================================================
  // Order Status
  // ============================================================================

  updateOrderStatusHeader(data) {
    const orderNumberDisplay = document.getElementById("order-number-display");
    const statusTitle = document.getElementById("status-title");
    const statusDescription = document.getElementById("status-description");

    if (orderNumberDisplay) {
      orderNumberDisplay.textContent = `Order #${data.number || ""}`;
    }

    const status = this.getOrderStatus(data);
    const statusConfig = this.getStatusConfig(status, data);

    if (statusTitle) statusTitle.textContent = statusConfig.title;
    if (statusDescription) statusDescription.innerHTML = statusConfig.description;
  }

  getOrderStatus(data) {
    const shipment = this.getPrimaryShipment(data);
    if (!shipment) return OrderTracking.STATUSES.ORDER_PLACED;

    const status = shipment.status || "";

    if (status === "delivered") return OrderTracking.STATUSES.DELIVERED;
    if (status === "out_for_delivery") return OrderTracking.STATUSES.OUT_FOR_DELIVERY;
    if (status === "in_transit") return OrderTracking.STATUSES.IN_TRANSIT;
    if (status === "pre_transit") return OrderTracking.STATUSES.ORDER_PLACED;

    return OrderTracking.STATUSES.ORDER_PLACED;
  }

  getPrimaryShipment(data) {
    const shipments = data.shipments || [];
    return shipments.length > 0 ? shipments[0] : null;
  }

  getStatusConfig(status, data) {
    const shipment = this.getPrimaryShipment(data);

    const configs = {
      [OrderTracking.STATUSES.ORDER_PLACED]: {
        title: "ORDER PLACED",
        description: "Your order is being processed.",
      },
      [OrderTracking.STATUSES.IN_TRANSIT]: {
        title: "IN TRANSIT",
        description: shipment?.estimated_delivered_at
          ? `Expected Delivery:\n${this.formatDate(shipment.estimated_delivered_at, "full")}`
          : "Your package is on its way.",
      },
      [OrderTracking.STATUSES.OUT_FOR_DELIVERY]: {
        title: "OUT FOR DELIVERY",
        description: shipment?.estimated_delivered_at
          ? `Expected Delivery:\n${this.formatDate(shipment.estimated_delivered_at, "full")}`
          : "Your package is out for delivery today.",
      },
      [OrderTracking.STATUSES.DELIVERED]: {
        title: "DELIVERED",
        description: `Delivered on <br class="block md:hidden"><strong>${this.formatDate(shipment?.delivered_at, "full")}</strong>`,
      },
    };

    return configs[status] || configs[OrderTracking.STATUSES.ORDER_PLACED];
  }

  // ============================================================================
  // Timeline
  // ============================================================================

  updateTimeline(data) {
    const timeline = document.querySelector("[data-timeline]");
    if (!timeline) return;

    const currentStatus = this.getOrderStatus(data);
    const currentIndex = OrderTracking.STATUS_LIST.indexOf(currentStatus);

    this.updateProgressBar(timeline, currentStatus);
    this.updateTimelineItems(timeline, data, currentIndex);
    this.announceStatusChange(timeline, currentStatus);
  }

  updateProgressBar(timeline, status) {
    const progressBar = timeline.querySelector("[data-timeline-progress]");
    if (progressBar) {
      const percentage = OrderTracking.PROGRESS_PERCENTAGES[status] || 12.5;
      progressBar.style.setProperty("--progress-percentage", `${percentage}%`);
    }
  }

  updateTimelineItems(timeline, data, currentIndex) {
    const shipment = this.getPrimaryShipment(data);
    const events = shipment?.scan_events || [];
    const sortedEvents = this.sortEventsChronologically(events);
    let lastEventDate = data.created_at || data.placed_at ? new Date(data.created_at || data.placed_at) : null;

    OrderTracking.STATUS_LIST.forEach((status, index) => {
      const item = timeline.querySelector(`[data-status="${status}"]`);
      if (!item) return;

      const isCompleted = index <= currentIndex;
      const isActive = index === currentIndex;

      this.updateTimelineItemState(item, isCompleted, isActive, status);
      this.updateTimelineItemDate(item, status, data, sortedEvents, lastEventDate);
      this.updateTimelineItemAccessibility(item, status, isCompleted, isActive);

      const eventDate = this.getEventDateForStatus(status, data, sortedEvents, lastEventDate);
      if (eventDate) {
        lastEventDate = new Date(eventDate);
      }
    });
  }

  sortEventsChronologically(events) {
    return [...events].sort((a, b) => new Date(a.scanned_at) - new Date(b.scanned_at));
  }

  updateTimelineItemState(item, isCompleted, isActive, status) {
    item.setAttribute("data-completed", isCompleted);
    item.setAttribute("data-active", isActive);

    const checkmark = item.querySelector("[data-checkmark]");
    const icon = item.querySelector(".timeline-icon");

    if (checkmark && icon) {
      // Ensure aria-hidden is set on decorative icons
      checkmark.setAttribute("aria-hidden", "true");
      icon.setAttribute("aria-hidden", "true");

      if (isCompleted || status === OrderTracking.STATUSES.ORDER_PLACED) {
        checkmark.classList.remove("hidden");
        icon.classList.remove("bg-white");
        icon.classList.add("bg-brunt-orange", "border-brunt-orange");
      } else {
        checkmark.classList.add("hidden");
        icon.classList.remove("bg-brunt-orange");
        icon.classList.add("bg-white");
      }
    }
  }

  updateTimelineItemAccessibility(item, status, isCompleted, isActive) {
    const statusLabels = {
      [OrderTracking.STATUSES.ORDER_PLACED]: "Order Placed",
      [OrderTracking.STATUSES.IN_TRANSIT]: "In Transit",
      [OrderTracking.STATUSES.OUT_FOR_DELIVERY]: "Out for Delivery",
      [OrderTracking.STATUSES.DELIVERED]: "Delivered",
    };

    const statusLabel = statusLabels[status] || status;
    let ariaLabel = statusLabel;

    if (isActive) {
      ariaLabel = `${statusLabel} — current status`;
      item.setAttribute("aria-current", "true");
    } else {
      item.removeAttribute("aria-current");
      if (isCompleted) {
        ariaLabel = `${statusLabel} — completed`;
      } else {
        ariaLabel = `${statusLabel} — pending`;
      }
    }

    item.setAttribute("aria-label", ariaLabel);
  }

  announceStatusChange(timeline, currentStatus) {
    const announceRegion = timeline.querySelector("[data-timeline-announce]");
    if (!announceRegion) return;

    const statusLabels = {
      [OrderTracking.STATUSES.ORDER_PLACED]: "Order Placed",
      [OrderTracking.STATUSES.IN_TRANSIT]: "In Transit",
      [OrderTracking.STATUSES.OUT_FOR_DELIVERY]: "Out for Delivery",
      [OrderTracking.STATUSES.DELIVERED]: "Delivered",
    };

    const statusLabel = statusLabels[currentStatus] || currentStatus;
    announceRegion.textContent = `Order status updated: ${statusLabel} — current status`;
  }

  updateTimelineItemDate(item, status, data, sortedEvents, lastEventDate) {
    const dateElement = item.querySelector("[data-date]");
    if (!dateElement) return;

    const eventDate = this.getEventDateForStatus(status, data, sortedEvents, lastEventDate);
    if (eventDate) {
      dateElement.textContent = this.formatDate(eventDate, "short");
    }
  }

  getEventDateForStatus(status, data, sortedEvents, lastEventDate) {
    if (status === OrderTracking.STATUSES.ORDER_PLACED) {
      return data.created_at || data.placed_at || null;
    }

    const event = this.findEventForStatus(status, sortedEvents, lastEventDate);
    return event?.scanned_at || null;
  }

  findEventForStatus(status, events, lastEventDate = null) {
    const keywords = OrderTracking.STATUS_MAP[status] || [];

    const matchingEvents = events.filter(event => {
      const eventStatus = (event.status || "").toLowerCase();
      const statusDetail = (event.status_detail || "").toLowerCase();
      const matches = keywords.some(keyword => eventStatus.includes(keyword) || statusDetail.includes(keyword));

      if (matches && lastEventDate) {
        return new Date(event.scanned_at) >= lastEventDate;
      }

      return matches;
    });

    return matchingEvents.length > 0 ? matchingEvents[0] : null;
  }

  // ============================================================================
  // Shipping Details
  // ============================================================================

  updateShippingDetails(data) {
    const panel = this.elements.shippingDetailsPanel;
    if (!panel) return;

    const shipment = this.getPrimaryShipment(data);
    if (!shipment) return;

    this.updateCarrierInfo(panel, shipment);
    this.updateShippingAddress(panel, data, shipment);
  }

  updateCarrierInfo(panel, shipment) {
    const carrierName = panel.querySelector("[data-carrier-name]");
    const trackingNumber = panel.querySelector("[data-tracking-number]");
    const trackingLink = panel.querySelector("[data-tracking-link]");

    if (carrierName && shipment.carrier_name) {
      carrierName.textContent = `Shipped via ${shipment.carrier_name}`;
    }

    if (trackingNumber && shipment.tracking_code) {
      trackingNumber.textContent = shipment.tracking_code;
    }

    if (trackingLink && shipment.carrier_url) {
      trackingLink.href = shipment.carrier_url;
    }
  }

  updateShippingAddress(panel, data, shipment) {
    const recipientName = panel.querySelector("[data-recipient-name]");
    const addressLine1 = panel.querySelector("[data-address-line1]");
    const addressLine2 = panel.querySelector("[data-address-line2]");

    if (recipientName) {
      recipientName.textContent = this.getRecipientName(data);
    }

    if (data.shipping_address) {
      this.updateAddressFromShippingAddress(addressLine1, addressLine2, data.shipping_address);
    } else if (shipment.destination) {
      this.updateAddressFromDestination(addressLine1, addressLine2, shipment.destination);
    }
  }

  getRecipientName(data) {
    if (data.shipping_address) {
      const addr = data.shipping_address;
      const fullName = `${addr.first_name || ""} ${addr.last_name || ""}`.trim();
      if (fullName) return fullName;
      if (addr.company) return addr.company;
    }

    if (data.customer) {
      const fullName = `${data.customer.first_name || ""} ${data.customer.last_name || ""}`.trim();
      if (fullName) return fullName;
    }

    return data.customer?.email || "";
  }

  updateAddressFromShippingAddress(addressLine1, addressLine2, addr) {
    if (addressLine1) {
      const line1Parts = [addr.address1, addr.address2].filter(Boolean);
      addressLine1.textContent = line1Parts.join(", ") || addr.company || "";
    }

    if (addressLine2) {
      const line2Parts = [addr.city, addr.province || addr.state, addr.zip || addr.postal_code].filter(Boolean);
      if (addr.country && addr.country !== "United States") {
        line2Parts.push(addr.country);
      }
      addressLine2.textContent = line2Parts.join(", ");
    }
  }

  updateAddressFromDestination(addressLine1, addressLine2, dest) {
    if (addressLine1) {
      addressLine1.textContent = dest.city || "";
    }

    if (addressLine2) {
      const line2Parts = [dest.state, dest.postal_code, dest.country].filter(Boolean);
      addressLine2.textContent = line2Parts.join(", ");
    }
  }

  // ============================================================================
  // Order Items
  // ============================================================================

  updateOrderItems(data) {
    const containers = this.getOrderItemContainers();
    if (containers.length === 0) return;

    this.clearContainers(containers);

    const items = this.extractLineItems(data);
    const isIncomplete = this.checkItemsIncomplete(data, items);

    if ((items.length === 0 || isIncomplete) && data.meta?.shopify_order?.order_id) {
      this.showLoadingInContainers(containers);
      this.fetchOrderItemsFromShopify(data.meta.shopify_order.order_id, containers);
      return;
    }

    if (items.length === 0) {
      this.showPlaceholderInContainers(containers);
      return;
    }

    this.populateContainers(containers, items);
  }

  getOrderItemContainers() {
    const containers = [];
    const mobileContainer = this.elements.shippingDetailsPanel?.querySelector("[data-order-items-mobile]");
    const desktopContainer = this.elements.shippingDetailsPanel?.querySelector("[data-order-items-desktop]");

    if (mobileContainer) containers.push(mobileContainer);
    if (desktopContainer) containers.push(desktopContainer);

    if (containers.length === 0) {
      const fallbackContainer = this.elements.shippingDetailsPanel?.querySelector("[data-order-items]");
      if (fallbackContainer) containers.push(fallbackContainer);
    }

    return containers;
  }

  extractLineItems(data) {
    let items = data.line_items || data.items || [];

    if (items.length === 0 && data.meta?.shopify_order?.line_items) {
      items = data.meta.shopify_order.line_items;
    }

    return items;
  }

  checkItemsIncomplete(data, items) {
    const orderTotal = data.presentment_current_subtotal_price?.amount || 0;
    const itemsTotal = items.reduce((sum, item) => {
      return sum + (item.final_line_price?.amount || item.original_line_price?.amount || 0);
    }, 0);

    return (
      items.length > 0 &&
      orderTotal > 0 &&
      itemsTotal > 0 &&
      Math.abs(orderTotal - itemsTotal) > OrderTracking.PRICE_TOLERANCE
    );
  }

  clearContainers(containers) {
    containers.forEach(container => {
      container.innerHTML = "";
    });
  }

  showLoadingInContainers(containers) {
    const loading = document.createElement("div");
    loading.className = "text-sm text-gray-600 animate-pulse";
    loading.textContent = "Loading order details...";
    containers.forEach(container => {
      container.appendChild(loading.cloneNode(true));
    });
  }

  showPlaceholderInContainers(containers) {
    const placeholder = document.createElement("div");
    placeholder.className = "text-sm text-gray-600";
    placeholder.innerHTML = `
      <p class="mb-2">Order details not available through tracking system.</p>
      <p class="text-xs">Please check your order confirmation email for item details.</p>
    `;
    containers.forEach(container => {
      container.appendChild(placeholder.cloneNode(true));
    });
  }

  populateContainers(containers, items) {
    containers.forEach(container => {
      items.forEach(item => {
        const itemElement = this.createOrderItemElement(item);
        container.appendChild(itemElement);
      });
    });
  }

  async fetchOrderItemsFromShopify(orderId, containers) {
    const containerArray = Array.isArray(containers) ? containers : [containers];

    try {
      const response = await fetch(`/apps/order-tracking/items?order_id=${orderId}`);

      if (response.ok) {
        const data = await response.json();
        this.clearContainers(containerArray);

        if (data.line_items?.length > 0) {
          this.populateContainers(containerArray, data.line_items);
        }
      } else {
        throw new Error("Unable to fetch order items");
      }
    } catch (error) {
      this.showPlaceholderInContainers(containerArray);
    }
  }

  createOrderItemElement(item) {
    const div = document.createElement("div");
    div.className = "flex gap-2 items-start";

    const imageElement = this.createItemImage(item);
    const detailsElement = this.createItemDetails(item);
    const quantityElement = this.createItemQuantity(item);

    div.appendChild(imageElement);
    div.appendChild(detailsElement);
    div.appendChild(quantityElement);

    return div;
  }

  createItemImage(item) {
    const imageElement = document.createElement("div");
    imageElement.className = "shrink-0";

    const imageUrl = this.getItemImageUrl(item);
    const title = item.title || item.name || item.product_title || "Product";

    if (imageUrl) {
      const img = document.createElement("img");
      img.src = imageUrl;
      img.alt = title;
      img.className = "w-[100px] h-[100px] lg:w-[120px] lg:h-[120px] bg-gray-100 object-cover";
      img.onerror = () => this.handleImageError(img);
      imageElement.appendChild(img);
    } else {
      imageElement.innerHTML = this.getPlaceholderImageHTML();
    }

    return imageElement;
  }

  getItemImageUrl(item) {
    return (
      item.product_image_url ||
      item.variant_image_url ||
      item.image ||
      item.image_url ||
      item.featured_image ||
      item.image?.src ||
      item.variant_image ||
      ""
    );
  }

  handleImageError(img) {
    img.style.display = "none";
    const placeholder = document.createElement("div");
    placeholder.className =
      "w-[100px] h-[100px] lg:w-[120px] lg:h-[120px] bg-gray-100 flex items-center justify-center rounded";
    placeholder.innerHTML = this.getPlaceholderImageHTML();
    img.parentElement.appendChild(placeholder);
  }

  getPlaceholderImageHTML() {
    return `
      <div class="w-[100px] h-[100px] lg:w-[120px] lg:h-[120px] bg-gray-100 flex items-center justify-center rounded">
        <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path>
        </svg>
      </div>
    `;
  }

  createItemDetails(item) {
    const detailsDiv = document.createElement("div");
    detailsDiv.className = "flex-1 min-w-0";

    const title = item.product_title || item.title || item.name || "Product";
    const variant = (item.variant_title || item.variant_name || "").split("/");

    let detailsHTML = `<p class="text-brunt-orange text-16-bold mb-0.5">${this.escapeHtml(title)}</p>`;

    if (variant.length) {
      for (const v in variant) {
        const prefix = ["Color:", "Size:", "Style:", ""];
        detailsHTML += `<p class="text-14-light mb-0.5">${prefix[v]} ${this.escapeHtml(variant[v])}</p>`;
      }
    }

    detailsDiv.innerHTML = detailsHTML;
    return detailsDiv;
  }

  createItemQuantity(item) {
    const quantityDiv = document.createElement("p");
    quantityDiv.className = "text-16-regular w-9 text-center";
    quantityDiv.textContent = item.quantity || item.current_quantity || 1;
    return quantityDiv;
  }

  escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ============================================================================
  // Tracking Activity
  // ============================================================================

  updateTrackingActivity(data) {
    const container = this.elements.shippingDetailsPanel?.querySelector("[data-tracking-events]");
    if (!container) return;

    container.innerHTML = "";
    container.setAttribute("data-collapsed", "true");

    const shipment = this.getPrimaryShipment(data);
    const events = shipment?.scan_events || [];
    const sortedEvents = this.sortEventsByDateDescending(events);

    sortedEvents.forEach(event => {
      const eventElement = this.createTrackingEventElement(event);
      container.appendChild(eventElement);
    });

    this.updateShowMoreButton(sortedEvents.length);
  }

  sortEventsByDateDescending(events) {
    return [...events].sort((a, b) => {
      return new Date(b.scanned_at) - new Date(a.scanned_at);
    });
  }

  createTrackingEventElement(event) {
    const div = document.createElement("div");
    div.className = "tracking-event";

    const description = event.description || event.message || "Tracking update";
    const location = this.formatEventLocation(event.location);

    div.innerHTML = `
      <p class="text-16-bold mb-0.5">${description}${location ? ` in ${location}` : ""}</p>
      <p class="text-16-light">${this.formatDate(event.scanned_at, "full")}</p>
    `;

    return div;
  }

  formatEventLocation(location) {
    if (!location) return "";
    const locParts = [location.city, location.state].filter(Boolean);
    return locParts.join(", ");
  }

  updateShowMoreButton(eventCount) {
    const button = this.elements.shippingDetailsPanel?.querySelector("[data-show-more]");
    if (!button) return;

    if (eventCount <= OrderTracking.MAX_EVENTS_BEFORE_COLLAPSE) {
      button.style.display = "none";
    } else {
      button.style.display = "";
      button.setAttribute("data-expanded", "false");
      button.setAttribute("aria-expanded", "false");
      const text = button.querySelector("[data-show-more-text]");
      if (text) text.textContent = "SHOW MORE";
    }
  }

  setupShowMoreButton() {
    const button = this.elements.shippingDetailsPanel?.querySelector("[data-show-more]");
    if (!button) return;

    button.addEventListener("click", () => {
      const container = this.elements.shippingDetailsPanel?.querySelector("[data-tracking-events]");
      if (!container) return;

      const isCollapsed = container.getAttribute("data-collapsed") === "true";
      const newCollapsedState = !isCollapsed;

      container.setAttribute("data-collapsed", newCollapsedState ? "true" : "false");
      button.setAttribute("data-expanded", newCollapsedState ? "false" : "true");
      button.setAttribute("aria-expanded", newCollapsedState ? "false" : "true");

      const text = button.querySelector("[data-show-more-text]");
      if (text) {
        text.textContent = isCollapsed ? "SHOW LESS" : "SHOW MORE";
      }
    });
  }

  // ============================================================================
  // Action Buttons
  // ============================================================================

  updateActionButtons(data) {
    const status = this.getOrderStatus(data);
    const shipment = this.getPrimaryShipment(data);

    this.updateTrackPackageButton(status, shipment);
    this.updateDeliveredActions(status);
  }

  updateTrackPackageButton(status, shipment) {
    const trackPackageButton = document.getElementById("track-package-button");
    if (!trackPackageButton) return;

    const shouldShow =
      (status === OrderTracking.STATUSES.IN_TRANSIT || status === OrderTracking.STATUSES.OUT_FOR_DELIVERY) &&
      shipment?.carrier_url;

    if (shouldShow) {
      trackPackageButton.classList.remove("hidden");
      const link = trackPackageButton.querySelector("a");
      if (link) link.href = shipment.carrier_url;
    } else {
      trackPackageButton.classList.add("hidden");
    }
  }

  updateDeliveredActions(status) {
    const deliveredActions = document.getElementById("delivered-actions");
    if (!deliveredActions) return;

    if (status === OrderTracking.STATUSES.DELIVERED) {
      deliveredActions.classList.remove("hidden");
    } else {
      deliveredActions.classList.add("hidden");
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  formatDate(dateString, format = "short") {
    if (!dateString) return "";

    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "";

    const options =
      format === "full"
        ? { weekday: "long", year: "numeric", month: "long", day: "numeric" }
        : { weekday: "short", month: "short", day: "numeric" };

    return date.toLocaleDateString("en-US", options);
  }

  showError(message) {
    if (!this.elements.errorContainer) return;
    this.elements.errorContainer.classList.remove("hidden");
    const errorText = this.elements.errorContainer.querySelector("p");
    if (errorText) errorText.textContent = message;
  }

  hideError() {
    if (this.elements.errorContainer) {
      this.elements.errorContainer.classList.add("hidden");
    }
  }

  showLoading() {
    const button = this.elements.form?.querySelector('button[type="submit"]');
    if (button) {
      button.disabled = true;
      button.textContent = "TRACKING...";
    }
  }

  hideLoading() {
    const button = this.elements.form?.querySelector('button[type="submit"]');
    if (button) {
      button.disabled = false;
      button.textContent = button.getAttribute("data-original-text") || "TRACK YOUR ORDER";
    }
  }

  scrollToTop() {
    // Smooth scroll to top of the page
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    new OrderTracking();
  });
} else {
  new OrderTracking();
}
