/**
 * Copyright 2018-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import moment from 'moment';
require('./CommonControls')(window);

// Import shared objects from parent
window.shared = window.parent.shared;

// Teleprompter Config (orientation, scale, etc.)  See index.js.
window.shared.pubsub.on('configUpdate', () => {
  document.querySelector('body').style['font-size'] = (window.shared.config.zoom || 1) + 'em';
  document.querySelector('html').style.transform = 'scale(' +
    (window.shared.config.flipHorizontal ? -1 : 1) + ', ' +
    (window.shared.config.flipVertical ? -1 : 1) +
  ')';
});

// Show reactions in real-time (don't wait for "refresh")
window.shared.pubsub.on('reactionsUpdate', () => {
  document.querySelectorAll('.reactionGroup[data-reaction]').forEach((reactionGroup) => {
    reactionGroup.dataset.value = window.shared.reactions.get(reactionGroup.dataset.reaction) || 0;
    reactionGroup.querySelector('.count').textContent = parseInt(reactionGroup.dataset.value).toLocaleString();
  });
});

// Update the comments on-screen after a countdown (to avoid constant scrolling on busy posts)
window.shared.pubsub.on('teleprompterRefresh', () => {
  // Countdown
  const countdownEl = document.querySelector('.countdown');
  countdownEl.removeAttribute('value');
  countdownEl.style.display = window.shared.config.autoRefresh ? 'block' : 'none';
  window.shared.lastRefreshTime = new Date();
  
  // Comments
  const commentsEl = document.querySelector('.comments');
  while (commentsEl.firstChild) {
    commentsEl.removeChild(commentsEl.firstChild);
  }
  
  let hadComments = false;

  window.shared.comments({deleted: false}).order('priority desc, created desc').each((comment) => {
    hadComments = true;
    const commentFrag = document.querySelector('template#comment');
    commentFrag.content.querySelector('[data-content="name"]').textContent = comment.name;
    commentFrag.content.querySelector('[data-content="time"]').textContent = moment(Math.min(new Date(), comment.created)).fromNow();
    commentFrag.content.querySelector('[data-content="message"]').textContent = comment.message;
    commentsEl.appendChild(document.importNode(commentFrag.content, true));        
  });
  
  // If we didn't load any comments, immediately load some as soon as they come in
  if (!hadComments) {
    const noCommentsFrag = document.querySelector('template#noComments');
    commentsEl.appendChild(document.importNode(noCommentsFrag.content, true));
    window.shared.pubsub.once('commentsUpdate', window.shared.pubsub.emit.bind(window.shared.pubsub, 'teleprompterRefresh'));
  }
});

window.addEventListener('DOMContentLoaded', () => {
  document.querySelector('.countdown').addEventListener(
    'click',
    window.shared.pubsub.emit.bind(window.shared.pubsub, 'teleprompterRefresh')
  );
  
  // For some buttons, only enable them if we're not in a teleprompter preview (within the moderator panel)
  if (window.location.hash !== '#slave') {
    document.querySelector('[data-action="back"]').addEventListener('click', (e) => {
      window.parent.location.hash = '';
    });
    
    document.querySelector('[data-action="moderate"]').addEventListener('click', (e) => {
      window.shared.moderateWindow = window.open('moderate.html', 'moderate', 'menubar=no,toolbar=no,location=no,personalbar=no,status=no');
    });
    
    document.querySelector('[data-action="fullscreen"]').addEventListener('click', (e) => {
      if (
        e.currentTarget.ownerDocument.webkitFullscreenElement || 
        e.currentTarget.ownerDocument.mozFullScreenElement || 
        e.currentTarget.ownerDocument.msFullscreenElement || 
        e.currentTarget.ownerDocument.webkitFullscreenElement
      ) {
        (
          e.currentTarget.ownerDocument.webkitExitFullscreen ||
          e.currentTarget.ownerDocument.mozCancelFullScreen ||
          e.currentTarget.ownerDocument.msExitFullscreen ||
          e.currentTarget.ownerDocument.webkitExitFullscreen
        ).call(e.currentTarget.ownerDocument);
        return;
      }
      
      (
        e.currentTarget.ownerDocument.documentElement.requestFullscreen ||
        e.currentTarget.ownerDocument.documentElement.mozRequestFullScreen ||
        e.currentTarget.ownerDocument.documentElement.webkitRequestFullScreen
      ).call(e.currentTarget.ownerDocument.documentElement);
    });
  }
  
  const countdownEl = document.querySelector('.countdown');
  function onFrame() {
    requestAnimationFrame(onFrame);
    if (!window.shared.lastRefreshTime) {
      return;
    }
    const timeLeft = (window.shared.config.refreshInterval - (new Date() - window.shared.lastRefreshTime));
    if (timeLeft <= 0) {
      if (window.shared.config.autoRefresh) {
        window.shared.lastRefreshTime = null;
        window.shared.pubsub.emit('teleprompterRefresh');
      }
      return;
    }
    
    if (countdownEl) {
      countdownEl.max = window.shared.config.refreshInterval;
      countdownEl.value = timeLeft;
    }
  }
  onFrame();
  
  // Force a refresh of everything, for all teleprompter views, to ensure they're in-sync
  window.shared.pubsub.emit('teleprompterRefresh');
  window.shared.pubsub.emit('reactionsUpdate');
  window.shared.pubsub.emit('configUpdate');
});
