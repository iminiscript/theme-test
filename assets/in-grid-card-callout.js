import { Component } from "@theme/component";

/**
 * In-grid card callout custom element.
 *
 * @extends {Component}
 */
export class InGridCardCallout extends Component {
  connectedCallback() {
    super.connectedCallback();

    this.addEventListener("click", this.#handleClick);
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    this.removeEventListener("click", this.#handleClick);
  }

  /**
   * Handles click on the callout
   * @param {MouseEvent} event - The click event
   */
  #handleClick = event => {
    // The button snippet renders an <a> tag that navigates on its own
    // Prevent double navigation by ignoring clicks on links
    const target = /** @type {Element} */ (event.target);
    if (target.closest("a")) {
      return;
    }

    const videoUrl = this.dataset.videoUrl;
    const triggerCompareDrawer = this.dataset.triggerCompareDrawer === "true";
    const ctaUrl = this.dataset.ctaUrl;
    const hasVideo = videoUrl && videoUrl.trim() !== "";

    if (hasVideo) {
      this.#openVideoModal(videoUrl);
    } else if (triggerCompareDrawer) {
      // @ts-ignore - window.compareDrawer is a global reference to the compare drawer component
      window.compareDrawer.open();
    } else if (ctaUrl && ctaUrl.trim() !== "") {
      window.location.href = ctaUrl;
    }
  };

  /**
   * Opens the video modal with the video popup component
   * @param {string} videoUrl - The video URL
   */
  #openVideoModal = videoUrl => {
    // Get the video popup ID from data attribute
    const videoPopupId = this.dataset.videoPopupId;
    if (!videoPopupId) {
      console.error("Video popup ID not found");
      return;
    }

    // Find the video popup component by ID
    const videoPopup = /** @type {import('./video-popup').VideoPopupComponent | null} */ (
      document.getElementById(videoPopupId)
    );

    if (videoPopup && typeof videoPopup.open === "function") {
      videoPopup.open(videoUrl);
    } else {
      console.error(`Video popup component not found with ID: ${videoPopupId}`);
    }
  };
}

if (!customElements.get("in-grid-card-callout")) {
  customElements.define("in-grid-card-callout", InGridCardCallout);
}
