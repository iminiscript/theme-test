/**
 * Media Content Block - Video Player Functionality
 * Handles YouTube IFrame API and native Shopify video playback
 * Supports multiple instances on a single page
 */

// Flag to track if YouTube API is loaded
let youtubeApiReady = false;
let youtubeApiCallbacks = [];

/**
 * Load YouTube IFrame API
 */
function loadYouTubeAPI() {
  if (window.YT && window.YT.Player) {
    youtubeApiReady = true;
    youtubeApiCallbacks.forEach(callback => callback());
    youtubeApiCallbacks = [];
    return;
  }

  // Check if script is already being loaded
  if (document.querySelector('script[src*="youtube.com/iframe_api"]')) {
    return;
  }

  const tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  const firstScriptTag = document.getElementsByTagName("script")[0];
  firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
}

/**
 * Called automatically by YouTube API when ready
 */
window.onYouTubeIframeAPIReady = function () {
  youtubeApiReady = true;
  youtubeApiCallbacks.forEach(callback => callback());
  youtubeApiCallbacks = [];
};

/**
 * Execute callback when YouTube API is ready
 */
function whenYouTubeReady(callback) {
  if (youtubeApiReady) {
    callback();
  } else {
    youtubeApiCallbacks.push(callback);
  }
}

/**
 * Create YouTube player instance
 */
function createYouTubePlayer(playerId, videoId) {
  return new window.YT.Player(playerId, {
    videoId: videoId,
    playerVars: {
      autoplay: 1,
      playsinline: 1,
      rel: 0,
      modestbranding: 1,
    },
    events: {
      onError: error => {
        console.error("YouTube player error:", error);
      },
    },
  });
}

/**
 * Initialize video players
 */
function initVideoPlayers() {
  const containers = document.querySelectorAll(".js-video__container");

  if (containers.length === 0) {
    return;
  }

  // Check if any YouTube videos exist
  const hasYouTubeVideos = Array.from(containers).some(container => container.querySelector(".js-video__iframe"));

  // Load YouTube API if needed
  if (hasYouTubeVideos) {
    loadYouTubeAPI();
  }

  containers.forEach(container => {
    const trigger = container.querySelector(".js-video__trigger");
    const youtubeIframe = container.querySelector(".js-video__iframe");
    const nativeWrapper = container.querySelector(".js-video__native");
    const nativePlayer = container.querySelector(".js-video__nativePlayer");

    // Handle YouTube videos
    if (youtubeIframe && trigger) {
      const playYouTubeVideo = e => {
        if (e) e.preventDefault();

        const { playerId, videoId } = youtubeIframe.dataset;
        if (!playerId || !videoId) {
          console.error("Missing YouTube player ID or video ID");
          return;
        }

        // Hide thumbnail
        trigger.style.display = "none";
        youtubeIframe.style.display = "block";

        // Create player when API is ready
        whenYouTubeReady(() => {
          try {
            createYouTubePlayer(playerId, videoId);
          } catch (error) {
            console.error("Failed to create YouTube player:", error);
            // Show thumbnail again if player creation fails
            trigger.style.display = "block";
            youtubeIframe.style.display = "none";
          }
        });
      };

      trigger.addEventListener("click", playYouTubeVideo);
      trigger.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") {
          playYouTubeVideo(e);
        }
      });
    }

    // Handle native Shopify videos
    if (nativeWrapper && nativePlayer && trigger) {
      // Set up click handler for manual play
      const playNativeVideo = e => {
        if (e) e.preventDefault();
        trigger.style.display = "none";
        nativeWrapper.style.display = "block";

        // Play with sound when user clicks
        nativePlayer.muted = false;
        nativePlayer.play().catch(error => {
          console.error("Native video play failed:", error);
          // Show thumbnail again if play fails
          trigger.style.display = "block";
          nativeWrapper.style.display = "none";
        });
      };

      trigger.addEventListener("click", playNativeVideo);
      trigger.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") {
          playNativeVideo(e);
        }
      });

      // Set up intersection observer for autoplay (muted) - only if autoplay is enabled
      const noAutoplay = container.dataset.noAutoplay === "true";

      if (!noAutoplay) {
        const observer = new IntersectionObserver(
          entries => {
            entries.forEach(entry => {
              if (entry.isIntersecting) {
                // Only autoplay if thumbnail is still showing (user hasn't clicked)
                if (trigger.style.display !== "none" && nativePlayer.paused) {
                  // Hide thumbnail
                  trigger.style.display = "none";
                  nativeWrapper.style.display = "block";

                  // Autoplay muted
                  nativePlayer.muted = true;
                  nativePlayer.play().catch(error => {
                    console.error("Autoplay prevented:", error);
                    // Show thumbnail if autoplay fails
                    trigger.style.display = "block";
                    nativeWrapper.style.display = "none";
                  });
                }
                // If video is already playing (was paused when scrolled away), resume it
                else if (nativePlayer.paused && nativeWrapper.style.display !== "none") {
                  // Restart video if it ended, otherwise resume
                  if (nativePlayer.ended) {
                    nativePlayer.currentTime = 0;
                  }
                  nativePlayer.play().catch(error => {
                    console.error("Resume play failed:", error);
                  });
                }
              } else {
                // Pause video when out of viewport
                if (!nativePlayer.paused) {
                  nativePlayer.pause();
                }
              }
            });
          },
          {
            threshold: 0.5, // Play when 50% visible
            rootMargin: "0px",
          }
        );

        observer.observe(container);
      }
    }
  });
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initVideoPlayers);
} else {
  initVideoPlayers();
}
