/**
 * Copyright 2018-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import EventEmitter from 'event-emitter';
import debounce from 'debounce';
import {taffy} from 'taffydb';
import moment from 'moment';

// Shared state between base window, teleprompter iframe, and moderator pop-up view
window.shared = {
  config: Object.assign(
    {
      autoRefresh: true,
      flipHorizontal: false,
      flipVertical: false,
      refreshInterval: 10000,
      textMode: false,
      zoom: 1
    },
    JSON.parse(localStorage.config || '{}')
  ),
  lastReloadTime: null,
  pubsub: new EventEmitter()
};

// Track whether or not we're fully logged in and authorized for the Graph API
let connectedWithFacebook = false;

// Reactions
const reactions = new Map();
window.shared.reactions = reactions;

// Comments, in a local database that can be manipulated
// independently from real data on Facebook.
const comments = taffy();
window.shared.comments = comments;
comments.settings({
  onDBChange: debounce(window.shared.pubsub.emit.bind(window.shared.pubsub, 'commentsUpdate'), 100),
  template: {
    deleted: false,
    priority: 0
  }
});

// Promise-based wrapper around the regular Facebook SDK, for API calls
function fbAPIPromise(path, method, params, key) {
  if (!key) {
    key = 'data';
  }
  return new Promise((resolve, reject) => {
    FB.api(path, method, params, (res) => {
      if (!res || res.error) {
        reject(res.error || new Error('No response'));
      }
      resolve(res[key] || res);
    });
  });
}

// Load fresh data from the Facebook Graph API for comments and reactions
function loadCommentsReactions() {
  const postId = location.hash.slice(1);
  const possibleReactions = ['LIKE', 'LOVE', 'HAHA', 'WOW', 'SAD', 'ANGRY'];
  
  if (!postId) {
    const rejectedPromise = new Promise((resolve, reject) => {
      throw new Error('No post ID in hash.');
    });
    return rejectedPromise;
  }
  
  // Fetch the post name and creation date, if we don't already have it
  if (!window.shared.post){
    fbAPIPromise(
      '/' + encodeURIComponent(postId),
      'GET'
    ).then((post) => {
      post.created_time = new Date(post.created_time);
      post.title = getPostTitle(post); // Add an extra formatted version of this post to the object
      window.shared.post = post;
      window.shared.pubsub.emit('postUpdate');
    });
  }
  
  return Promise.all(
    [
      
      // Comments
      fbAPIPromise(
        '/' + encodeURIComponent(postId) + '/comments',
        'GET', 
        {
          order: 'reverse_chronological',
          filter: 'stream', // Ensures we get ALL comments, not just the "top" comments
        }
      ).then((newComments) => {
        newComments.forEach((comment) => {
          if (!comment.message.trim()) { // Throw out messages with no text (usually photos, GIFs, etc.)
            return;
          }
          comments.merge({
            id: comment.id,
            created: new Date(comment.created_time),
            name: (comment.from && comment.from.name) ? comment.from.name : 'Facebook User',
            message: comment.message
          }, 'id');
        })
      })
      
    ].concat(
        
      // Reactions (one request for each type)
      possibleReactions.map((reaction) => {
        return fbAPIPromise(
          '/' + encodeURIComponent(postId) + '/reactions',
          'GET',
          {
            summary: 'total_count',
            limit: 0,
            type: reaction
          },
          'summary'
        ).then((res) => {
          reactions.set(reaction, res.total_count);
          window.shared.pubsub.emit('reactionsUpdate');
        });
      })
      
    )
  );
}

function loadCommentsReactionsLoop() {
  loadCommentsReactions().then(() => {
    setTimeout(loadCommentsReactionsLoop, Math.max(window.shared.config.refreshInterval / 2, 1000));
  }).catch(() => {
    setTimeout(loadCommentsReactionsLoop, 1000);
  });
}

function getPostTitle(post) {
  return post.message ||
    post.story ||
    'Post on ' + moment(post.created_time).format('LLL');
}

// Load recent posts so the user can choose which to stream comments/reactions for
function loadPosts() {
  // Fetch user info, and their pages
  return Promise.all([
    fbAPIPromise(
      '/me',
      'GET'
    ),
    fbAPIPromise(
      '/me/accounts',
      'GET',
      {
        fields: ['id', 'name'].join(',')
      }
    )
  
  // Merge user and pages into one set of "accounts"
  ]).then(([meAccount, pageAccounts]) => {
    return [meAccount].concat(pageAccounts);
    
  // Fetch recent posts for each account, merge with account data
  }).then((accounts) => {
    return Promise.all(accounts.map((account) => {
      return fbAPIPromise(
        '/' + encodeURIComponent(account.id) + '/posts',
        'GET',
        {
          limit: 8
        }
      ).then((posts) => {
        account.posts = posts;
        return account;
      });
    }));
    
  // Display each account with links to recent posts
  }).then((accounts) => {
    const accountsEl = document.querySelector('.accounts');
    while (accountsEl.firstChild) {
      accountsEl.removeChild(accountsEl.firstChild);
    }
    
    accounts.forEach((account) => {
      const accountEl = document.importNode(
        document.querySelector('template#account').content,
        true
      );
      accountEl.querySelector('h2').textContent = account.name;
      
      if (account.posts && account.posts.length) {
        accountEl.querySelector('.noPosts').remove();
      }
      
      const postsEl = accountEl.querySelector('.posts');
      
      account.posts.forEach((post) => {
        const postEl = document.importNode(
          document.querySelector('template#postListItem').content,
          true
        );
        const aEl = postEl.querySelector('a');
        aEl.textContent = getPostTitle(post);
        aEl.href = '#' + post.id
        postsEl.appendChild(postEl);
      });
      accountEl.appendChild(postsEl);
      accountsEl.appendChild(accountEl);
    });
  });
}

// Initialize Facebook SDK
FB.init({
  appId: FB_APP_ID, // App ID comes from environment at *build* time.  See README.md and webpack.config.js.
  version: 'v2.12',
  status: true
});

// On load...
document.addEventListener('DOMContentLoaded', () => {
  // Listen for Facebook to be logged in and authorized with this app
  FB.Event.subscribe('auth.statusChange', (res) => {
    if (res.status === 'connected') {
      connectedWithFacebook = true;
      window.dispatchEvent(new Event('hashchange')); // Force a refresh of state
    }
  });
  
  document.querySelector('[data-action="login"]').addEventListener('click', (e) => {
    FB.login((res) => {
      console.log(res);
    }, {
      scope: [
        'user_photos',
        'user_posts',
        'user_videos',
        'pages_show_list'
      ].join(','),
      return_scopes: true
    });
  });
  
  document.querySelector('form[name="openUrl"]').addEventListener('submit', (e) => {
    e.preventDefault();
    
    new Promise((resolve, reject) => {
      // *Attempt* to figure out an account and post ID from a URL.
      // Note, this won't always work.  There are a lot of edge cases.
      // The intent here is to catch as many normal cases as we can.
      // This is a very unofficial way to parse URLs from Facebook.
      // There is no official method available.
      const match = e.target.elements.url.value.match(/^.+\/(.+)\/(?:posts|videos)\/([0-9]+)/);
      if (!match) {
        throw new Error('URL did not match expected pattern.');
      }
      return resolve(match);
      
    }).then((match) => {
      // Look up the account ID.  (We can't make Graph API calls with the alias.)
      return fbAPIPromise(
        '/' + encodeURIComponent(match[1]),
        'GET',
        {
          fields: 'id'
        },
        'id'
      ).then((accountId) => {
        // Concatenate the account ID with the post ID
        return [accountId, match[2]].join('_');
      });

    }).then((postId) => {
      window.location.hash = postId;
      
    }).catch(() => {
      alert('Your URL was not recognized.  Please post a URL to a specific post on Facebook.');
      
    });
    
  });

  window.dispatchEvent(new Event('hashchange')); // Force a refresh of state
  loadCommentsReactionsLoop(); // Load fresh comments/reactions every few seconds
});

window.addEventListener('hashchange', () => {
  const postId = window.location.hash.substr(1);
  
  // Hide all pages, before showing one later
  document.querySelectorAll('.page').forEach((pageEl) => {
    pageEl.style.display = 'none';
  });
  
  // If we have a post ID, go to the teleprompter
  if (postId && connectedWithFacebook) {
    // Clear out all existing comments and reactions
    comments().remove();
    reactions.forEach((count, key) => {
      reactions.delete(key);
    });
    window.shared.pubsub.emit('reactionsUpdate');
    window.shared.post = null;
    window.shared.pubsub.emit('postUpdate');
    
    // Force an immediate load of new comments and reactions
    loadCommentsReactions();
    
    // Display Teleprompter page
    document.querySelector('[data-page-name="teleprompter"]').style.display = 'flex';
    window.shared.pubsub.emit('teleprompterRefresh');
    return;
  }
  
  // If we don't have a post ID...
  if (connectedWithFacebook) {
    // If we're logged in, show possible posts to choose from
    document.querySelector('[data-page-name="choosePost"]').style.display = 'block';
    loadPosts();
  } else {
    // If we're not logged in, show the login button
    document.querySelector('[data-page-name="login"]').style.display = 'block';
  }
});

window.addEventListener('unload', () => {
  // Close the moderator panel when we close this window
  if (window.shared.moderateWindow) {
    window.shared.moderateWindow.close();
  }
  
  // Keep users' config in local storage for next load
  localStorage.config = JSON.stringify(window.shared.config);
});
