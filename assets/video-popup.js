import { DialogComponent, DialogCloseEvent } from "@theme/dialog";

/**
 * Video popup component - extends DialogComponent with video-specific logic.
 * Leverages the existing dialog system for open/close, accessibility, and animations.
 *
 * @extends {DialogComponent}
 */
export class VideoPopupComponent extends DialogComponent {
  requiredRefs = ["dialog", "videoIframe"];

  connectedCallback() {
    super.connectedCallback();

    // Listen for dialog close event to stop video
    this.addEventListener(DialogCloseEvent.eventName, this.#handleDialogClose);
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    this.removeEventListener(DialogCloseEvent.eventName, this.#handleDialogClose);
  }

  /**
   * Opens the video popup with autoplay
   * @param {string} videoUrl - The video URL to display
   */
  open = videoUrl => {
    if (!videoUrl || videoUrl.trim() === "") return;

    // Add autoplay parameter to the URL
    const hasQuery = videoUrl.includes("?");
    const autoplayUrl = `${videoUrl}${hasQuery ? "&" : "?"}autoplay=1`;

    // Set iframe src with autoplay
    const iframe = /** @type {HTMLIFrameElement} */ (this.refs.videoIframe);
    if (iframe) {
      iframe.src = autoplayUrl;
    }

    // Use existing dialog system to open
    this.showDialog();
  };

  /**
   * Handles dialog close event to stop video
   */
  #handleDialogClose = () => {
    // Stop video by clearing iframe src
    const iframe = /** @type {HTMLIFrameElement | undefined} */ (this.refs.videoIframe);
    if (iframe) {
      iframe.src = "";
    }
  };
}

if (!customElements.get("video-popup-component")) {
  customElements.define("video-popup-component", VideoPopupComponent);
}
