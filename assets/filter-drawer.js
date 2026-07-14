import { DialogComponent } from "@theme/dialog";

/**
 * A custom element that manages the filter drawer.
 * Handles filter-specific drawer functionality like batch mode
 * applying filters and clearing filters.
 *
 * @extends {DialogComponent}
 */
class FilterDrawerComponent extends DialogComponent {
  /**
   * Applies filters in the drawer and closes it
   */
  applyFiltersAndClose = () => {
    const facetsForm = this.refs.drawerFacetsForm;
    if (facetsForm && typeof facetsForm.updateFilters === "function") {
      facetsForm.updateFilters();
    }
    this.closeDialog();
  };

  /**
   * Clears all filters in the drawer
   */
  clearAllFiltersInDrawer = () => {
    const facetsForm = this.refs.drawerFacetsForm;
    if (facetsForm && facetsForm.refs.facetsForm) {
      const form = facetsForm.refs.facetsForm;

      // Clear all checkboxes
      form.querySelectorAll('[type="checkbox"]:checked').forEach(input => {
        if (input instanceof HTMLInputElement) {
          input.checked = false;
        }
      });

      // Clear all text/number inputs (for price filters)
      form.querySelectorAll('input[type="text"], input[type="number"]').forEach(input => {
        if (input instanceof HTMLInputElement) {
          input.value = "";
        }
      });

      // Apply the cleared filters
      facetsForm.updateFilters();
    }
    this.closeDialog();
  };
}

if (!customElements.get("filter-drawer-component")) {
  customElements.define("filter-drawer-component", FilterDrawerComponent);
}
