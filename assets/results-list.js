import PaginatedList from "@theme/paginated-list";

/**
 * A custom element that renders a paginated results list
 */
export default class ResultsList extends PaginatedList {
  /** @type {IntersectionObserver | undefined} */
  #buttonVisibilityObserver;

  /** @type {number} */
  #lastCheckedCardCount = 0;

  connectedCallback() {
    super.connectedCallback();
    this.setAttribute("initialized", "");

    // Initial check
    this.#updateLoadMoreButtonVisibility();

    // Observe the viewMoreNext sentinel - when it's visible, check button visibility
    this.#setupSentinelObserver();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.#buttonVisibilityObserver) {
      this.#buttonVisibilityObserver.disconnect();
    }
  }

  /**
   * Setup observer on the viewMoreNext sentinel element
   * This is simpler than MutationObserver - we only check when the sentinel is visible
   */
  #setupSentinelObserver() {
    const { viewMoreNext, grid } = this.refs;

    if (!viewMoreNext || !(grid instanceof HTMLElement)) {
      console.log("[LoadMore] No viewMoreNext sentinel or grid found");
      return;
    }

    console.log("[LoadMore] Setting up sentinel observer on viewMoreNext");

    this.#buttonVisibilityObserver = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            // Sentinel is visible - check if card count changed
            const currentCardCount = grid.querySelectorAll('[ref="cards[]"]').length;

            if (currentCardCount !== this.#lastCheckedCardCount) {
              console.log("[LoadMore] Card count changed:", this.#lastCheckedCardCount, "→", currentCardCount);
              this.#lastCheckedCardCount = currentCardCount;
              // Use requestAnimationFrame to check after the browser finishes rendering
              requestAnimationFrame(() => {
                this.#updateLoadMoreButtonVisibility();
              });
            }
          }
        }
      },
      {
        rootMargin: "200px", // Check a bit earlier
      }
    );

    this.#buttonVisibilityObserver.observe(viewMoreNext);
  }

  /**
   * Check if we've reached the last page and hide/show button accordingly
   */
  #updateLoadMoreButtonVisibility() {
    const { loadMoreButton, loadMoreContainer, grid } = this.refs;

    console.log("[LoadMore] Checking button visibility...");
    console.log("[LoadMore] Refs:", { loadMoreButton, loadMoreContainer, grid });

    if (!(grid instanceof HTMLElement)) {
      console.log("[LoadMore] Grid is not an HTMLElement, exiting");
      return;
    }

    const lastPage = Number(grid.dataset.lastPage);
    console.log("[LoadMore] Last page from dataset:", lastPage);

    // Query cards directly from the grid to get the current state after append
    const allCards = grid.querySelectorAll('[ref="cards[]"]');
    console.log("[LoadMore] Total cards found:", allCards.length);

    const lastCard = allCards[allCards.length - 1];
    const currentPage = lastCard instanceof HTMLElement ? Number(lastCard.dataset.page) : 0;
    console.log("[LoadMore] Current page (from last card):", currentPage);
    console.log("[LoadMore] Last card element:", lastCard);

    // Hide button if we've reached the last page, otherwise re-enable it
    if (currentPage >= lastPage) {
      console.log("[LoadMore] ✅ Reached last page! Hiding button...");
      if (loadMoreContainer instanceof HTMLElement) {
        loadMoreContainer.style.display = "none";
        console.log("[LoadMore] Button container hidden");
      } else {
        console.log("[LoadMore] ⚠️ loadMoreContainer is not an HTMLElement:", loadMoreContainer);
      }
    } else {
      console.log("[LoadMore] ℹ️ More pages available. Current:", currentPage, "Last:", lastPage);
      if (loadMoreButton instanceof HTMLButtonElement) {
        loadMoreButton.disabled = false;
        loadMoreButton.textContent = "Load More";
        console.log("[LoadMore] Button re-enabled");
      }
    }
  }

  /**
   * Override parent's renderNextPage to update button visibility after loading
   */
  async renderNextPage() {
    console.log("[LoadMore] renderNextPage called");
    await super.renderNextPage();
    console.log("[LoadMore] super.renderNextPage completed, checking button visibility");
    this.#updateLoadMoreButtonVisibility();
  }

  /**
   * Handle load more button click
   */
  async handleLoadMore() {
    console.log("[LoadMore] handleLoadMore clicked");
    const { loadMoreButton } = this.refs;

    if (loadMoreButton instanceof HTMLButtonElement) {
      loadMoreButton.disabled = true;
      loadMoreButton.textContent = "Loading...";
    }

    // Trigger loading the next page (which will also update button visibility)
    await this.renderNextPage();
  }
}

if (!customElements.get("results-list")) {
  customElements.define("results-list", ResultsList);
}
