/**
 * Countdown Timer Component
 *
 * A flexible, reusable countdown timer that can be configured via data attributes.
 * Supports multiple timers on a single page with individual configurations.
 * Completely dynamic - no hardcoded class names or DOM structure dependencies.
 *
 * @author website-3.0
 * @version 1.0.0
 *
 * ============================================================================
 * USAGE EXAMPLES
 * ============================================================================
 *
 * Basic Usage (Default timezone: America/New_York):
 * --------------------------------------------------
 * <countdown-timer data-end="2025-12-31 23:59:59"></countdown-timer>
 *
 *
 * With Start Date (Timer hidden until start date):
 * -------------------------------------------------
 * <countdown-timer
 *   data-start="2025-11-01 00:00:00"
 *   data-end="2025-12-31 23:59:59">
 * </countdown-timer>
 *
 *
 * Header Location (Custom format):
 * ---------------------------------
 * <countdown-timer
 *   data-end="2025-12-31 23:59:59"
 *   data-location="header">
 * </countdown-timer>
 * Output: "10 DAYS : 5 HRS : 30 MINS : 45 SECS"
 *
 *
 * Custom Timezone:
 * ----------------
 * <countdown-timer
 *   data-end="2025-12-31 23:59:59"
 *   data-timezone="Europe/London">
 * </countdown-timer>
 *
 *
 * Custom Format with Template:
 * ----------------------------
 * <countdown-timer
 *   data-end="2025-12-31 23:59:59"
 *   data-format="custom"
 *   data-format-template="{days} Days {hours}:{minutes}:{seconds}">
 * </countdown-timer>
 *
 *
 * Hide Timer on Completion:
 * -------------------------
 * <countdown-timer
 *   data-end="2025-11-30 23:59:59"
 *   data-hide-on-complete="true">
 * </countdown-timer>
 *
 *
 * Hide Parent Container on Completion:
 * -------------------------------------
 * <div class="wrapper">
 *   <countdown-timer
 *     data-end="2025-11-30 23:59:59"
 *     data-hide-container-selector=".wrapper">
 *   </countdown-timer>
 * </div>
 *
 *
 *
 * Product Card with Dynamic Unlock (No hardcoded classes):
 * ---------------------------------------------------------
 * <div data-product-wrapper>
 *   <a href="#" data-product-link data-url="/product-page">
 *     <div data-product-content>
 *       <countdown-timer
 *         data-end="2025-11-30 23:59:59"
 *         data-unlock-on-complete="true"
 *         data-unlock-wrapper="[data-product-wrapper]"
 *         data-unlock-link="[data-product-link]"
 *         data-unlock-notify="[data-notify-me]"
 *         data-unlock-remove-class="blurred,locked"
 *         data-unlock-remove-link-class="modal-opener">
 *       </countdown-timer>
 *       <div data-notify-me>Coming Soon!</div>
 *     </div>
 *   </a>
 * </div>
 *
 *
 * Update Element Content on Completion:
 * --------------------------------------
 * <countdown-timer
 *   data-end="2025-11-30 23:59:59"
 *   data-completion-target="#message"
 *   data-completion-content="<p>Sale has ended!</p>">
 * </countdown-timer>
 * <div id="message"></div>
 *
 *
 * Trigger Custom Action on Completion:
 * -------------------------------------
 * <countdown-timer
 *   data-end="2025-11-30 23:59:59"
 *   data-completion-callback="handleTimerComplete">
 * </countdown-timer>
 *
 * <script>
 * window.handleTimerComplete = (timer) => {
 *   console.log('Timer completed!', timer);
 *   // Your custom logic here
 * };
 * </script>
 *
 *
 * Advanced: Product Launch with Delayed Start:
 * ---------------------------------------------
 * <countdown-timer
 *   data-start="2025-11-15 09:00:00"
 *   data-end="2025-12-31 23:59:59"
 *   data-location="header"
 *   data-timezone="America/New_York">
 * </countdown-timer>
 *
 * This will be hidden until Nov 15, then show the regular countdown format until Dec 31.
 *
 * ============================================================================
 * DATA ATTRIBUTES REFERENCE
 * ============================================================================
 *
 * Required:
 * ---------
 * data-end                       : End date/time in format "YYYY-MM-DD HH:MM:SS"
 *
 *
 * Optional Timing:
 * ----------------
 * data-start                     : Start date/time in format "YYYY-MM-DD HH:MM:SS" (optional)
 *                                  If provided, timer is hidden until start date is reached
 *
 *
 * Display Options:
 * ----------------
 * data-timezone                  : IANA timezone (default: "America/New_York")
 * data-location                  : "header" for uppercase format, omit for compact
 * data-format                    : "custom" to use data-format-template
 * data-format-template           : Custom template string (use {days}, {hours}, {minutes}, {seconds})
 *
 *
 * Completion Behavior - Visibility:
 * ---------------------------------
 * data-hide-on-complete          : "true" to hide the timer element itself
 * data-hide-container-selector   : CSS selector of container to hide (e.g., ".wrapper", "[data-card]")
 *
 *
 * Completion Behavior - Unlock Feature:
 * -------------------------------------
 * data-unlock-on-complete        : "true" to enable unlock behavior
 * data-unlock-wrapper            : CSS selector for wrapper element (e.g., "[data-product]")
 * data-unlock-link               : CSS selector for link element (e.g., "[data-link]", "a")
 * data-unlock-notify             : CSS selector for notify element to hide (e.g., "[data-notify]")
 * data-unlock-remove-class       : Comma-separated classes to remove from wrapper (e.g., "blur,disabled")
 * data-unlock-remove-link-class  : Comma-separated classes to remove from link (e.g., "modal-trigger")
 * data-unlock-clear-handlers     : Global array name containing event handlers to remove (e.g., "myEventHandlers")
 *
 *
 * Completion Behavior - Content Update:
 * -------------------------------------
 * data-completion-target         : CSS selector for element to update (e.g., "#status", ".message")
 * data-completion-content        : HTML content to insert into target
 *
 *
 * Completion Behavior - Custom Callback:
 * --------------------------------------
 * data-completion-callback       : Global function name to call (e.g., "handleComplete")
 *                                  Function receives timer element as argument
 *
 * ============================================================================
 * CUSTOM EVENTS
 * ============================================================================
 *
 * countdown-complete : Fired when the countdown reaches zero
 *   event.detail: { timer: HTMLElement }
 *
 * countdown-tick : Fired on each update interval
 *   event.detail: { timer: HTMLElement, timeRemaining: Object }
 *
 * ============================================================================
 * PROGRAMMATIC CONTROL
 * ============================================================================
 *
 * const timer = document.querySelector('countdown-timer');
 *
 * timer.start();      // Start/resume the countdown
 * timer.stop();       // Pause the countdown
 * timer.reset();      // Reset and restart the countdown
 * timer.getState();   // Get current timer state
 *
 * // Listen to events
 * timer.addEventListener('countdown-complete', (e) => {
 *   console.log('Timer finished!', e.detail);
 * });
 *
 * timer.addEventListener('countdown-tick', (e) => {
 *   console.log('Time remaining:', e.detail.timeRemaining);
 * });
 *
 * ============================================================================
 */

/**
 * @typedef {Object} TimeRemaining
 * @property {number} days
 * @property {number} hours
 * @property {number} minutes
 * @property {number} seconds
 * @property {number} total
 */

// Test if script is loading
console.log("CountdownTimer script is loading...");
/** @type {any} */ (window).countdownTimerScriptLoaded = true;

/**
 * Countdown Timer Custom Element
 * @extends {HTMLElement}
 */
export class CountdownTimer extends HTMLElement {
  /** @type {number | null} */
  #intervalId = null;

  /** @type {AbortController} */
  #abortController = new AbortController();

  /** @type {boolean} */
  #isCompleted = false;

  /**
   * Default configuration
   * @type {{DEFAULT_TIMEZONE: string, UPDATE_INTERVAL: number}}
   */
  static CONFIG = {
    DEFAULT_TIMEZONE: "America/New_York",
    UPDATE_INTERVAL: 1000, // milliseconds
  };

  /**
   * Component lifecycle - called when element is added to DOM
   */
  connectedCallback() {
    this.#validateRequiredAttributes();
    this.#startCountdown();
  }

  /**
   * Component lifecycle - called when element is removed from DOM
   */
  disconnectedCallback() {
    this.#stopCountdown();
    this.#abortController.abort();
  }

  /**
   * Validates that required attributes are present and dates are valid
   */
  #validateRequiredAttributes() {
    const endDate = this.dataset.end;
    const startDate = this.dataset.start;

    if (!endDate || endDate === "") {
      console.error("CountdownTimer: Missing required data-end attribute", this);
      return;
    }

    // If start date is provided, validate it's before end date
    if (startDate && startDate !== "") {
      try {
        const start = new Date(startDate.replace(" ", "T").trim());
        const end = new Date(endDate.replace(" ", "T").trim());

        if (start >= end) {
          console.error("CountdownTimer: data-start must be before data-end", {
            start: startDate,
            end: endDate,
            element: this,
          });
        }
      } catch (error) {
        console.error("CountdownTimer: Invalid date format in data-start or data-end", error);
      }
    }
  }

  /**
   * Starts the countdown interval
   */
  #startCountdown() {
    // Clear any existing interval
    this.#stopCountdown();

    // Run immediately, then start interval
    this.#updateTimer();
    this.#intervalId = setInterval(() => {
      this.#updateTimer();
    }, CountdownTimer.CONFIG.UPDATE_INTERVAL);
  }

  /**
   * Stops the countdown interval
   */
  #stopCountdown() {
    if (this.#intervalId) {
      clearInterval(this.#intervalId);
      this.#intervalId = null;
    }
  }

  /**
   * Main update function - calculates and displays time remaining
   */
  #updateTimer() {
    // Skip if already completed
    if (this.#isCompleted) return;

    const endDate = this.dataset.end;
    const startDate = this.dataset.start;
    if (!endDate) return;

    // If start date is provided, check if we're before the start
    if (startDate && startDate !== "") {
      const startTime = this.#calculateTimeToStart(startDate);

      // If we haven't reached the start date yet, hide the timer
      if (startTime.total > 0) {
        this.#hideTimer();
        return;
      }
    }

    // Calculate time remaining to end date
    const time = this.#calculateTimeRemaining(endDate);

    // Handle completion early to prevent negative flashes
    if (time.total <= 0) {
      const zeroTime = { days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 };
      this.#renderCountdown(zeroTime);
      this.#handleCompletion();
      return;
    }

    // Update display and dispatch tick event
    this.#renderCountdown(time);
    this.#dispatchTickEvent(time);
  }

  /**
   * Calculates time remaining until start date
   * @param {string} startDateString - Start date in "YYYY-MM-DD HH:MM:SS" format
   * @returns {TimeRemaining} Object containing days, hours, minutes, seconds, and total milliseconds
   */
  #calculateTimeToStart(startDateString) {
    try {
      const timezone = this.dataset.timezone || CountdownTimer.CONFIG.DEFAULT_TIMEZONE;

      // Parse the start date string and convert to milliseconds in the specified timezone
      const startDate = startDateString.replace(" ", "T").trim();
      const startDateTime = new Date(startDate);

      // Get current time in the specified timezone
      const now = new Date();
      const nowInTimezone = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
      const startInTimezone = new Date(startDateTime.toLocaleString("en-US", { timeZone: timezone }));

      // Calculate total milliseconds until start
      const total = Math.ceil(startInTimezone.getTime() - nowInTimezone.getTime());

      const clamped = Math.max(0, total);
      const seconds = Math.floor((clamped / 1000) % 60);
      const minutes = Math.floor((clamped / 1000 / 60) % 60);
      const hours = Math.floor((clamped / (1000 * 60 * 60)) % 24);
      const days = Math.floor(clamped / (1000 * 60 * 60 * 24));

      return { days, hours, minutes, seconds, total };
    } catch (error) {
      console.error("CountdownTimer: Error calculating time to start", error);
      return { days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 };
    }
  }

  /**
   * Calculates time remaining until end date
   * @param {string} endDateString - End date in "YYYY-MM-DD HH:MM:SS" format
   * @returns {TimeRemaining} Object containing days, hours, minutes, seconds, and total milliseconds
   */
  #calculateTimeRemaining(endDateString) {
    try {
      const timezone = this.dataset.timezone || CountdownTimer.CONFIG.DEFAULT_TIMEZONE;

      // Parse the end date string and convert to milliseconds in the specified timezone
      const endDate = endDateString.replace(" ", "T").trim();
      const endDateTime = new Date(endDate);

      // Get current time in the specified timezone
      const now = new Date();
      const nowInTimezone = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
      const endInTimezone = new Date(endDateTime.toLocaleString("en-US", { timeZone: timezone }));

      // Calculate total milliseconds remaining
      const total = Math.ceil(endInTimezone.getTime() - nowInTimezone.getTime());

      const clamped = Math.max(0, total);
      const seconds = Math.floor((clamped / 1000) % 60);
      const minutes = Math.floor((clamped / 1000 / 60) % 60);
      const hours = Math.floor((clamped / (1000 * 60 * 60)) % 24);
      const days = Math.floor(clamped / (1000 * 60 * 60 * 24));

      return { days, hours, minutes, seconds, total };
    } catch (error) {
      console.error("CountdownTimer: Error calculating time remaining", error);
      return { days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 };
    }
  }

  /**
   * Renders the countdown display
   * @param {TimeRemaining} time - Time object with days, hours, minutes, seconds
   */
  #renderCountdown(time) {
    this.#showTimer(); // Ensure timer is visible
    const formatted = this.#formatCountdown(time);
    this.innerHTML = formatted;
  }

  /**
   * Hides the timer when start date hasn't been reached
   */
  #hideTimer() {
    this.style.display = "none";
    this.dataset.timerVisible = "false";
  }

  /**
   * Shows the timer (used when start date is reached)
   */
  #showTimer() {
    this.style.display = "";
    this.dataset.timerVisible = "true";
  }

  /**
   * Formats countdown display based on configuration
   * @param {TimeRemaining} time - Time object with days, hours, minutes, seconds
   * @returns {string} Formatted time string
   */
  #formatCountdown(time) {
    const { days, hours, minutes, seconds } = time;
    const location = this.dataset.location;
    const format = this.dataset.format;
    const template = this.dataset.formatTemplate;

    // Custom format with template
    if (format === "custom" && template) {
      return template
        .replace("{days}", days.toString())
        .replace("{hours}", this.#padZero(hours))
        .replace("{minutes}", this.#padZero(minutes))
        .replace("{seconds}", this.#padZero(seconds));
    }

    // Header format (uppercase, spelled out)
    if (location === "header") {
      return `${days} DAYS : ${hours} HRS : ${minutes} MINS : ${seconds} SECS`;
    }

    // Default compact format
    return `${days}d : ${hours}h : ${minutes}m : ${seconds}s`;
  }

  /**
   * Formats a number to always have at least 2 digits
   * @param {number} num - Number to format
   * @returns {string} Formatted number string
   */
  #padZero(num) {
    return num.toString().padStart(2, "0");
  }

  /**
   * Dispatches tick event on each update
   * @param {TimeRemaining} timeRemaining - Time remaining object
   */
  #dispatchTickEvent(timeRemaining) {
    this.dispatchEvent(
      new CustomEvent("countdown-tick", {
        bubbles: true,
        detail: { timer: this, timeRemaining },
      })
    );
  }

  /**
   * Handles timer completion - orchestrates all completion behaviors
   */
  #handleCompletion() {
    this.#isCompleted = true;
    this.#stopCountdown();

    // Execute all completion behaviors based on data attributes
    this.#handleVisibilityBehavior();
    this.#handleUnlockBehavior();
    this.#handleContentUpdateBehavior();
    this.#handleCallbackBehavior();

    // Mark as completed
    this.setAttribute("data-completed", "true");

    // Dispatch completion event
    this.dispatchEvent(
      new CustomEvent("countdown-complete", {
        bubbles: true,
        detail: { timer: this },
      })
    );
  }

  /**
   * Handles visibility behavior on completion (hiding elements)
   */
  #handleVisibilityBehavior() {
    const hideOnComplete = this.dataset.hideOnComplete === "true";
    const containerSelector = this.dataset.hideContainerSelector;

    // Hide the timer itself if configured
    if (hideOnComplete) {
      this.style.display = "none";
    }

    // Hide a parent container if selector provided
    if (containerSelector) {
      const container = this.closest(containerSelector);
      if (container instanceof HTMLElement) {
        container.style.display = "none";
      }
    }
  }

  /**
   * Handles unlock behavior on completion (removing restrictions, enabling links)
   */
  #handleUnlockBehavior() {
    const unlockOnComplete = this.dataset.unlockOnComplete === "true";
    if (!unlockOnComplete) return;

    const wrapperSelector = this.dataset.unlockWrapper;
    const linkSelector = this.dataset.unlockLink;
    const notifySelector = this.dataset.unlockNotify;
    const removeClasses = this.dataset.unlockRemoveClass;
    const removeLinkClasses = this.dataset.unlockRemoveLinkClass;
    const clearHandlers = this.dataset.unlockClearHandlers;

    // Find elements using dynamic selectors
    const wrapper = wrapperSelector ? this.closest(wrapperSelector) : null;
    const link = linkSelector ? this.closest(linkSelector) : null;
    const notify = notifySelector ? this.querySelector(notifySelector) : null;

    // Get URL from link data attribute
    const productURL = link instanceof HTMLElement ? link.dataset.url : null;

    // Update link URL if available
    if (productURL && link instanceof HTMLAnchorElement) {
      link.setAttribute("href", productURL);
    }

    // Remove classes from wrapper
    if (wrapper instanceof HTMLElement && removeClasses) {
      const classesToRemove = removeClasses.split(",").map(cls => cls.trim());
      wrapper.classList.remove(...classesToRemove);
    }

    // Remove classes from link
    if (link instanceof HTMLElement && removeLinkClasses) {
      const classesToRemove = removeLinkClasses.split(",").map(cls => cls.trim());
      link.classList.remove(...classesToRemove);

      // Clear event handlers if specified
      if (clearHandlers && clearHandlers in window) {
        const handlers = /** @type {any} */ (window)[clearHandlers];
        if (Array.isArray(handlers)) {
          handlers.forEach(handler => {
            link.removeEventListener("click", handler);
          });
        }
      }
    }

    // Hide notify element
    if (notify instanceof HTMLElement) {
      notify.style.display = "none";
    }
  }

  /**
   * Handles content update behavior on completion
   */
  #handleContentUpdateBehavior() {
    const targetSelector = this.dataset.completionTarget;
    const content = this.dataset.completionContent;

    if (!targetSelector || !content) return;

    const target = document.querySelector(targetSelector);
    if (target instanceof HTMLElement) {
      target.innerHTML = content;
    }
  }

  /**
   * Handles custom callback behavior on completion
   */
  #handleCallbackBehavior() {
    const callbackName = this.dataset.completionCallback;

    if (!callbackName) return;

    // Check if callback exists in window scope
    if (callbackName in window && typeof (/** @type {any} */ (window)[callbackName]) === "function") {
      try {
        /** @type {any} */ (window)[callbackName](this);
      } catch (error) {
        console.error(`CountdownTimer: Error executing callback "${callbackName}"`, error);
      }
    } else {
      console.warn(`CountdownTimer: Callback function "${callbackName}" not found in window scope`);
    }
  }

  /**
   * Public API: Starts or resumes the countdown
   */
  start() {
    this.#isCompleted = false;
    this.removeAttribute("data-completed");
    this.#startCountdown();
  }

  /**
   * Public API: Pauses the countdown
   */
  stop() {
    this.#stopCountdown();
  }

  /**
   * Public API: Resets and restarts the countdown
   */
  reset() {
    this.#isCompleted = false;
    this.removeAttribute("data-completed");
    this.#stopCountdown();
    this.#startCountdown();
  }

  /**
   * Public API: Gets the current state of the timer
   * @returns {Object|null} Timer state or null if invalid
   */
  getState() {
    const endDate = this.dataset.end;
    const startDate = this.dataset.start;
    if (!endDate) return null;

    const timezone = this.dataset.timezone || CountdownTimer.CONFIG.DEFAULT_TIMEZONE;

    // Check if we have a start date and haven't reached it yet
    let isWaitingToStart = false;
    let timeToStart = null;

    if (startDate && startDate !== "") {
      timeToStart = this.#calculateTimeToStart(startDate);
      isWaitingToStart = timeToStart.total > 0;
    }

    const timeRemaining = isWaitingToStart ? null : this.#calculateTimeRemaining(endDate);

    return {
      endDate,
      startDate: startDate || null,
      timezone,
      isCompleted: this.#isCompleted,
      isWaitingToStart,
      isHidden: isWaitingToStart,
      timeRemaining,
      timeToStart,
      isRunning: this.#intervalId !== null,
    };
  }
}

// Register the custom element

// Register the custom element when the module loads
if (!customElements.get("countdown-timer")) {
  try {
    customElements.define("countdown-timer", CountdownTimer);
  } catch (error) {
    console.error("Error registering CountdownTimer custom element:", error);
  }
} else {
  console.log("CountdownTimer custom element already registered");
}
