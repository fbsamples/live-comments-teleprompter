/**
 * Copyright 2018-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

module.exports = function (window) {
  window.addEventListener('DOMContentLoaded', () => {
    // Bluetooth Clickers (like for cameras, CamKix, Selfie Button, etc.)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'AudioVolumeUp') {
        window.shared.pubsub.emit('teleprompterRefresh');
        e.preventDefault();
      }
    });
    
    // Teleprompter View Modifiers
    document.querySelector('[data-action="zoomUp"]').addEventListener('click', (e) => {
      window.shared.config.zoom += 0.1;
      window.shared.pubsub.emit('configUpdate');
    });
    document.querySelector('[data-action="zoomDown"]').addEventListener('click', (e) => {
      window.shared.config.zoom -= 0.1;
      window.shared.pubsub.emit('configUpdate');
    });
    
    document.querySelector('[data-action="flipHorizontal"]').addEventListener('click', (e) => {
      window.shared.config.flipHorizontal = !window.shared.config.flipHorizontal;
      window.shared.pubsub.emit('configUpdate');
    });
    document.querySelector('[data-action="flipVertical"]').addEventListener('click', (e) => {
      window.shared.config.flipVertical = !window.shared.config.flipVertical;
      window.shared.pubsub.emit('configUpdate');
    });
  });
}