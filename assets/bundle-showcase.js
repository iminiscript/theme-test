import { sectionRenderer } from "@theme/section-renderer";

// Only define the component if it hasn't been defined yet
if (!customElements.get("bundle-showcase-component")) {
  /**
   * Bundle Showcase Section Component
   * Handles product switching for bundle collections
   *
   * This parent component listens for product selection events from
   * bundle-collection child components and updates the section using
   * the Section Rendering API.
   *
   * @extends {HTMLElement}
   */
  class BundleShowcaseComponent extends HTMLElement {
    constructor() {
      super();
      this.isUpdating = false;
      this.productSelectedHandler = null;
    }

    connectedCallback() {
      console.log("[Bundle Showcase] Component initialized");

      // Get section ID from data attribute
      this.sectionId = this.dataset.sectionId;

      if (!this.sectionId) {
        console.warn("[Bundle Showcase] No section ID found");
        return;
      }

      // Set initial current product handle from data attribute if available
      if (!this.dataset.currentProductHandle) {
        // Try to get from the current product in the section
        const initialHandle = this.querySelector("[data-product-handle]")?.getAttribute("data-product-handle");
        if (initialHandle) {
          this.dataset.currentProductHandle = initialHandle;
        }
      }

      // Listen for product selection events from child components
      this.productSelectedHandler = this.handleProductSelected.bind(this);
      this.addEventListener("bundle:product-selected", this.productSelectedHandler);
    }

    disconnectedCallback() {
      // Clean up event listeners
      if (this.productSelectedHandler) {
        this.removeEventListener("bundle:product-selected", this.productSelectedHandler);
      }
      console.log("[Bundle Showcase] Component disconnected");
    }

    /**
     * Handle product selection event from child bundle-collection component
     * @param {CustomEvent} event - Custom event with product handle in detail
     */
    handleProductSelected(event) {
      const productHandle = event.detail?.productHandle;

      if (!productHandle) {
        console.warn("[Bundle Showcase] No product handle in event");
        return;
      }

      console.log("[Bundle Showcase] Product selected:", productHandle);

      // Update the section with the selected product
      this.updateSectionWithProduct(productHandle);
    }

    /**
     * Updates the section using Section Rendering API with new product
     * Uses standardized sectionRenderer for fetching, caching, and morphing
     * @param {string} productHandle - The new product handle
     */
    async updateSectionWithProduct(productHandle) {
      if (!this.sectionId || !productHandle) {
        return;
      }

      // Prevent concurrent updates
      if (this.isUpdating) {
        console.log("[Bundle Showcase] Update already in progress");
        return;
      }

      this.isUpdating = true;

      try {
        // Store the current product handle
        this.dataset.currentProductHandle = productHandle;

        // Build product URL with section_id parameter
        const productUrl = "/products/" + productHandle;
        const targetUrl = new URL(productUrl, window.location.origin);

        console.log("[Bundle Showcase] Updating section with product:", productHandle);

        // Use sectionRenderer to render the section with the new product
        // This will automatically morph the DOM and update all child components
        await sectionRenderer.renderSection(this.sectionId, {
          cache: false,
          url: targetUrl,
        });

        console.log("[Bundle Showcase] Section updated successfully");

        // Re-initialize all blocks after morph completes
        await this.reinitializeBlocks();

        // Notify bundle-collection to update its active state
        // (needed because bundle-collection has data-skip-subtree-update="true")
        const bundleCollection = this.querySelector("bundle-collection-component");
        if (bundleCollection) {
          const event = new CustomEvent("bundle:product-changed", {
            detail: { productHandle },
            bubbles: false,
          });
          bundleCollection.dispatchEvent(event);
        }
      } catch (error) {
        console.error("[Bundle Showcase] Error updating section:", error);
      } finally {
        this.isUpdating = false;
      }
    }

    /**
     * Re-initializes all blocks in the section after morphing
     * This ensures event listeners and component state are properly updated
     */
    async reinitializeBlocks() {
      // Use requestAnimationFrame to ensure DOM is fully updated
      await new Promise(resolve => requestAnimationFrame(resolve));

      // Find all blocks in this section (with data-block-id attribute)
      const blocks = this.querySelectorAll("[data-block-id]");

      blocks.forEach(block => {
        // Skip bundle-collection block (it has data-skip-subtree-update="true")
        if (block.tagName.toLowerCase() === "bundle-collection-component") {
          return;
        }

        // Re-execute inline scripts (non-module scripts)
        const scripts = block.querySelectorAll(
          'script:not([type="module"]):not([src]):not([type="application/json"]):not([type="application/ld+json"])'
        );
        scripts.forEach(script => {
          try {
            // Create and execute a new script element
            const newScript = document.createElement("script");
            // Copy all attributes
            Array.from(script.attributes).forEach(attr => {
              newScript.setAttribute(attr.name, attr.value);
            });
            newScript.textContent = script.textContent;

            // Replace the old script with the new one to trigger execution
            if (script.parentNode) {
              script.parentNode.replaceChild(newScript, script);
            }
          } catch (error) {
            console.warn("[Bundle Showcase] Error executing script:", error);
          }
        });

        // Trigger updatedCallback if it's a Component instance
        // Note: morph.js already calls updatedCallback via onAfterUpdate hook,
        // but we ensure it's called here as well for any edge cases
        if (block.updatedCallback && typeof block.updatedCallback === "function") {
          try {
            block.updatedCallback();
          } catch (error) {
            console.warn("[Bundle Showcase] Error in block updatedCallback:", error);
          }
        }

        // Dispatch custom event for block update
        const event = new CustomEvent("block:updated", {
          detail: { blockId: block.dataset.blockId },
          bubbles: true,
        });
        block.dispatchEvent(event);
      });

      console.log("[Bundle Showcase] Blocks reinitialized");
    }
  }

  // Register the custom element
  customElements.define("bundle-showcase-component", BundleShowcaseComponent);
}
