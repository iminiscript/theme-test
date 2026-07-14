/**
 * @typedef {typeof window.IntersectionObserver} IntersectionObserverConstructor
 */

/**
 * Lazy Image Loader Component
 *
 * Handles lazy loading of images within picture elements with responsive srcsets.
 * Uses IntersectionObserver API for efficient viewport-based loading.
 *
 * Features:
 * - Automatic initialization on page load
 * - Singleton IntersectionObserver for performance
 * - Supports SVG and non-SVG images
 * - Handles responsive srcsets
 * - Works with Shopify theme editor
 *
 * @example
 * <!-- HTML with lazy loading -->
 * <picture class="lazyPicture" data-loaded="false">
 *   <source data-srcset="image-800w.jpg 800w" sizes="800px">
 *   <img src="placeholder.jpg" alt="Image">
 * </picture>
 *
 * @example
 * import { observeLazyImage, initLazyImages } from './lazyImages.js';
 *
 * // Observe a specific element
 * observeLazyImage(element);
 *
 * // Initialize all lazy images
 * initLazyImages();
 */

/**
 * Singleton IntersectionObserver instance
 * @type {IntersectionObserver | null}
 */
let intersectionObserver = null;

/**
 * LazyImage Component
 * Manages lazy loading for individual picture elements
 */
class LazyImage {
  /**
   * @type {HTMLElement}
   */
  element;

  /**
   * @type {boolean}
   */
  isLoaded = false;

  /**
   * Create a new LazyImage instance
   * @param {HTMLPictureElement | null} element - The picture element to observe
   */
  constructor(element) {
    if (!element) return;
    this.element = element;
  }

  /**
   * Get or create the singleton IntersectionObserver instance
   * @returns {IntersectionObserver}
   */
  static getObserver() {
    if (intersectionObserver) {
      return intersectionObserver;
    }

    intersectionObserver = new window.IntersectionObserver(
      entries => {
        for (const entry of entries) {
          const { isIntersecting, target } = entry;
          if (!isIntersecting) continue;

          const element = /** @type {HTMLElement} */ (target);
          const isSvg = element.dataset.svg === "true";

          const img = element.querySelector("img");
          if (!isSvg) {
            const sources = element.querySelectorAll("source");
            for (const s of sources) {
              if (s.dataset && s.dataset.srcset) s.srcset = s.dataset.srcset;
            }
          } else if (img?.dataset.src) {
            img.src = img.dataset.src;
          }

          const markLoaded = () => {
            element.dataset.loaded = "true";
            if (intersectionObserver) intersectionObserver.unobserve(element);
          };
          if (img) {
            if (img.complete) {
              markLoaded();
            } else {
              img.addEventListener("load", markLoaded, { once: true });
              img.addEventListener("error", markLoaded, { once: true });
            }
          } else {
            // No <img> found; consider it done
            markLoaded();
          }
        }
      },
      {
        rootMargin: "10px",
        threshold: 0,
      }
    );

    return intersectionObserver;
  }

  /**
   * Start observing the element for lazy loading
   */
  observe() {
    if (!this.element || this.isLoaded) return;

    // Fallback: eager-load when IntersectionObserver is not supported
    if (!("IntersectionObserver" in window)) {
      const element = this.element;
      const isSvg = element.dataset.svg === "true";
      const img = element.querySelector("img");
      if (!isSvg) {
        const sources = element.querySelectorAll("source");
        for (const s of sources) {
          if (s.dataset && s.dataset.srcset) s.srcset = s.dataset.srcset;
        }
      } else if (img?.dataset.src) {
        img.src = img.dataset.src;
      }
      element.dataset.loaded = "true";
      this.isLoaded = true;
      return;
    }

    // Observe the element when IntersectionObserver is supported
    const observer = LazyImage.getObserver();
    observer.observe(this.element);
  }

  /**
   * Stop observing the element
   */
  unobserve() {
    if (!this.element || !intersectionObserver) return;

    intersectionObserver.unobserve(this.element);
  }
}

/**
 * Observes a picture element for lazy loading
 * @param {HTMLPictureElement | null} element - The picture element to observe
 * @returns {LazyImage | null} LazyImage instance or null
 */
export function observeLazyImage(element) {
  if (!element) return null;

  const lazyImage = new LazyImage(element);
  lazyImage.observe();
  return lazyImage;
}

/**
 * Initialize lazy loading for all picture elements with lazyPicture class
 */
export function initLazyImages() {
  const lazyPictures = document.querySelectorAll("picture.lazyPicture");

  for (const picture of lazyPictures) {
    observeLazyImage(/** @type {HTMLPictureElement} */ (picture));
  }
}
// Initialize lazy images on page load
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initLazyImages);
} else {
  initLazyImages();
}

// Re-initialize lazy images on dynamic content load
document.addEventListener("shopify:section:load", initLazyImages);
document.addEventListener("shopify:block:select", initLazyImages);
