/**
 * Copyright 2018-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import debounce from 'debounce';
require('./CommonControls')(window);

// Import shared objects from parent
window.shared = window.opener.shared;

// Set the teleprompter preview to the exact scale and aspect ratio as the actual
// teleprompter, so as to display its layout identically.
function onParentWindowResize(e) {
  const scale =
    parseInt(
      window.getComputedStyle(
        document.querySelector('.preview')
      ).height
    ) / window.opener.innerHeight;
  const previewIframeEl = document.querySelector('.preview iframe');
  previewIframeEl.style.width = window.opener.innerWidth + 'px';
  previewIframeEl.style.height = window.opener.innerHeight + 'px';
  previewIframeEl.style.transform = 'scale(' + scale.toString() + ')';
  document.querySelector('.preview').style.width = (window.opener.innerWidth * scale) + 'px';
}

document.addEventListener('DOMContentLoaded', () => {
  window.opener.addEventListener('resize', debounce(onParentWindowResize, 100));
  onParentWindowResize();

  document.querySelector('[data-action="refreshTeleprompters"]').addEventListener(
    'click',
    window.shared.pubsub.emit.bind(window.shared.pubsub, 'teleprompterRefresh')
  );
  
  document.querySelector('[data-content="comments"] table').addEventListener('click', (e) => {
    switch (true){
    case e.target.matches('[data-action="prioritize"]'):
      window.shared.comments({
        id: e.target.closest('[data-comment-id]').dataset.commentId
      }).update(function () {
        this.priority++;
        return this;
      });
      break;
      
    case e.target.matches('[data-action="delete"]'):
      window.shared.comments({
        id: e.target.closest('[data-comment-id]').dataset.commentId
      }).update({
        deleted: true
      });
      break;
    }
  });
  
  document.querySelector('form[name="newComment"]').addEventListener('submit', (e) => {
    e.preventDefault();
    window.shared.comments.insert({
      id: 'ZZZZZ' + (new Date()-0),
      created: new Date(),
      name: e.target.elements.name.value,
      message: e.target.elements.message.value,
      priority: parseInt(e.target.elements.submit.dataset.priority),
      deleted: false
    });
    e.target.elements.name.value = '';
    e.target.elements.message.value = '';
    e.target.elements.name.focus();
  });

  document.querySelector('[data-action="toggleAutoRefresh"]').addEventListener('click', (e) => {
    window.shared.config.autoRefresh = !window.shared.config.autoRefresh;
    window.shared.pubsub.emit('teleprompterRefresh');
  });
});

const refresh = debounce(() => {
  // Post Title
  const postTitleEl = document.querySelector('[data-content="postTitle"]');
  if (!window.shared.post) {
    postTitleEl.textContent = '';
    return;
  }
  postTitleEl.textContent = window.shared.post.title;
  
  // Auto-Refresh Controls
  document.querySelector('[data-action="toggleAutoRefresh"]').classList[window.shared.config.autoRefresh ? 'add' : 'remove']('active');
  
  // Comments
  const tableBodyEl = document.querySelector('[data-content="comments"] table tbody');
  while (tableBodyEl.firstChild) {
    tableBodyEl.removeChild(tableBodyEl.firstChild);
  }
  window.shared.comments({
    deleted: false
  }).order('priority desc, created desc').each((comment) => {
    const commentFrag = document.querySelector('template#commentRow').cloneNode(true);
    commentFrag.content.querySelector('[data-column="name"]').textContent = comment.name || '';
    commentFrag.content.querySelector('[data-column="message"]').textContent = comment.message || '';
    if (comment.priority) {
      commentFrag.content.querySelector('[data-action="prioritize"]').className += ' active';
    }
    commentFrag.content.querySelector('tr').dataset.commentId = comment.id;
    tableBodyEl.appendChild(document.importNode(commentFrag.content, true));
  });
}, 200);

// When pretty much anything happens, refresh (common-debounced) the moderator view
window.shared.pubsub.on('teleprompterRefresh', refresh);
window.shared.pubsub.on('commentsUpdate', refresh);
window.shared.pubsub.on('postUpdate', refresh);