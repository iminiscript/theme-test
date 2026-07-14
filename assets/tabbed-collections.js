/**
 * Tabbed Collections Component
 * Handles tab switching and dynamic content display for collections
 */

class TabbedCollections {
  constructor(sectionElement) {
    this.section = sectionElement;
    this.tabs = this.section.querySelectorAll(".tabbed-collections__tab");
    this.panels = this.section.querySelectorAll(".tabbed-collections__panel");

    this.init();
  }

  init() {
    // Add click handlers to tabs
    this.tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => this.switchTab(index));

      // Add keyboard navigation support
      tab.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.switchTab(index);
        }

        // Arrow key navigation
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          const prevIndex = index > 0 ? index - 1 : this.tabs.length - 1;
          this.switchTab(prevIndex);
          this.tabs[prevIndex].focus();
        }

        if (e.key === "ArrowRight") {
          e.preventDefault();
          const nextIndex = index < this.tabs.length - 1 ? index + 1 : 0;
          this.switchTab(nextIndex);
          this.tabs[nextIndex].focus();
        }
      });
    });
  }

  switchTab(targetIndex) {
    // Update tabs
    this.tabs.forEach((tab, index) => {
      const isActive = index === targetIndex;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", isActive.toString());

      // Update indicator
      const indicator = tab.querySelector(".tabbed-collections__tab-indicator");
      if (indicator) {
        indicator.classList.toggle("scale-x-100", isActive);
        indicator.classList.toggle("scale-x-0", !isActive);
      }
    });

    // Update panels
    this.panels.forEach((panel, index) => {
      const isActive = index === targetIndex;
      panel.classList.toggle("hidden", !isActive);
      panel.setAttribute("aria-hidden", (!isActive).toString());
    });

    // Track analytics
    if (typeof window.dataLayer !== "undefined") {
      const activeTab = this.tabs[targetIndex];
      window.dataLayer.push({
        event: "tabbed_collection_view",
        collection_handle: activeTab.dataset.collectionHandle || "",
        collection_title: activeTab.dataset.collectionTitle || "",
      });
    }
  }
}

// Initialize all tabbed collections on the page
function initTabbedCollections() {
  const sections = document.querySelectorAll(".tabbed-collections");
  sections.forEach(section => {
    new TabbedCollections(section);
  });
}

// Initialize on DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initTabbedCollections);
} else {
  initTabbedCollections();
}

// Re-initialize on Shopify section load (for theme editor)
if (typeof Shopify !== "undefined" && Shopify.designMode) {
  document.addEventListener("shopify:section:load", event => {
    if (event.target.classList.contains("tabbed-collections-section")) {
      const section = event.target.querySelector(".tabbed-collections");
      if (section) {
        new TabbedCollections(section);
      }
    }
  });
}
