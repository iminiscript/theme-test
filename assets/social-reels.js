/**
 * Social Reels - Click-to-Play Video Functionality
 * Handles Shopify video playback for social reel cards
 * Videos only play when user clicks - NO autoplay
 */

/**
 * Initialize social reel video players
 */
function initSocialReelPlayers() {
  const containers = document.querySelectorAll(".js-social-reel__container");

  if (containers.length === 0) {
    return;
  }

  containers.forEach(container => {
    const trigger = container.querySelector(".js-social-reel__trigger");
    const videoWrapper = container.querySelector(".js-social-reel__video");
    const videoPlayer = container.querySelector(".js-social-reel__player");

    if (!trigger || !videoWrapper || !videoPlayer) {
      return;
    }

    // Handle click to play video
    const playVideo = e => {
      if (e) e.preventDefault();

      // Hide thumbnail
      trigger.style.display = "none";
      videoWrapper.style.display = "block";

      // Play video with sound
      videoPlayer.muted = false;
      videoPlayer.play().catch(error => {
        console.error("Social reel video play failed:", error);
        // Show thumbnail again if play fails
        trigger.style.display = "block";
        videoWrapper.style.display = "none";
      });
    };

    // Click event
    trigger.addEventListener("click", playVideo);

    // Keyboard event (Enter or Space)
    trigger.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") {
        playVideo(e);
      }
    });

    // Reset to thumbnail when video ends
    videoPlayer.addEventListener("ended", () => {
      trigger.style.display = "block";
      videoWrapper.style.display = "none";
      videoPlayer.currentTime = 0;
    });
  });
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSocialReelPlayers);
} else {
  initSocialReelPlayers();
}

// Re-initialize when section is rendered (for Shopify theme editor)
document.addEventListener("shopify:section:load", initSocialReelPlayers);
