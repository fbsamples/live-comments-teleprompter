/**
 * Copyright 2016-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

// App Config

// Set this to be your Graph API app ID.
// Register for one at https://developers.facebook.com/
var fbAppId = '';

// reloadInterval - Milliseconds between each refresh of comments
var reloadInterval = 10 * 1000;


// Application
if (!fbAppId) {
  alert('You must set a Facebook Graph API app ID in js/main.js to use this application.');
}

var lastReloadTime;
var $countdown;

// Load/save user settings in local storage
function loadConfig() {
  if (!localStorage.config) {
    saveConfig({
      flipHorizontal: false,
      flipVertical: false,
      zoom: 1
    });
  }
  return JSON.parse(localStorage.config);
}

function saveConfig(config) {
  localStorage.config = JSON.stringify(config);
}

function setConfigItem(key, value) {
  var config = loadConfig();
  config[key] = value;
  saveConfig(config);
  applyConfig(config);
}

function applyConfig(config) {
  $('html').css('font-size', (config.zoom || 1) + 'em');
  $('html').css('transform', 'scale(' + (config.flipHorizontal ? -1 : 1) + ', ' + (config.flipVertical ? -1 : 1) + ')');
}

// Promisify FB.api(), for easier use
function fbApi(path, method, params, callback) {
  return jQuery.Deferred(function (dfd) {
    if (callback) {
      dfd.then(callback);
    }
    FB.api(path, method, params, function (res) {
      if (!res || res.error) {
        return dfd.reject(res.error || res);
      }
      dfd.resolve(res);
    });
  }).promise();
}

// Get the most recent (which should be the current) live video for the connected user
function getLastLiveVideo() {
  return fbApi(
    '/me/live_videos',
    'get',
    {
      broadcast_status: ['LIVE'],
      limit: 1
    }
  ).then(function (videoRes) {
    if (!videoRes.data || !videoRes.data[0]) {
      throw new Error('No live videos found.');
    }

    // Use the first video.  Due to server-side sort, this should be the most recent.
    return videoRes.data[0];
  });
}

// Get current comments for a given video ID, sorted from newest to oldest
function getComments(id) {
  return fbApi(
    '/' + encodeURIComponent(id) + '/comments',
    'get',
    {
      order: 'reverse_chronological'
    }
  ).then(function (commentRes) {
    if (!commentRes || !commentRes.data || !commentRes.data.length) {
      throw new Error('No recent comments.');
    }
    return commentRes.data;
  });
}

// Get reactions (wow, haha, like, etc.) for a given video ID, and count them
function getReactions(id) {
  return fbApi(
    '/' + encodeURIComponent(id) + '/reactions',
    'get'
  ).then(function (reactionRes) {
    var reactions = {
      // For testing... uncomment these
      /*
      like: 1337,
      love: 8088,
      haha: 303,
      wow: 808,
      sad: 2,
      angry: 1
      */
    };

    if (!reactionRes || !reactionRes.data || !reactionRes.data.length) {
      return reactions;
    }
    
    reactionRes.data.forEach(function (reaction) {
      reaction.type = reaction.type.toLowerCase();
      reactions[reaction.type] = video.reactions[reaction.type] || 0;
      reactions[reaction.type]++;
    });
    
    return reactions;
  });
}

function refresh() {
  $countdown.removeAttr('value');
  lastReloadTime = null;
  
  return getLastLiveVideo().then(function (video) {
    // Merge video with comments and reactions
    return $.when(
      getComments(video.id),
      getReactions(video.id)
    ).then(function (comments, reactions) {
      video.comments = comments;
      video.reactions = reactions;
      return video;
    });

  }).then(function (video) {
    $('.comments').empty();
    video.comments.forEach(function (comment) {
      $('.comments').append(
        $('<div class="comment"></div>').append(
          $('<h2 class="name">').text(comment.from.name),
          $('<p class="time"></p>').text(
            Math.floor(
              (new Date() - new Date(comment.created_time)) / 1000 / 60
            ) + ' min. ago'
          ),
          $('<p></p>').text(comment.message)
        )
      );
    });

    $('.reactionGroup').hide();
    Object.keys(video.reactions).forEach(function (key) {
      $('.reactionGroup.' + key).show();
      $('.reactionGroup.' + key).find('.count').text(video.reactions[key].toLocaleString());
    });

  }).catch(function (err) {
    $('.comments')
      .empty()
      .append($('<p class="error comment"></p>').text(err.message || err.toString()));

  }).always(function () {
    lastReloadTime = new Date();
  });

}

function onFrame() {
  requestAnimationFrame(onFrame);
  if (!lastReloadTime) {
    return;
  }
  var timeLeft = (reloadInterval - (new Date() - lastReloadTime));
  if (timeLeft <= 0) {
    refresh();
    return;
  }
  $countdown.attr('max', reloadInterval).val(timeLeft);
}

FB.init({
  appId: fbAppId,
  version: 'v2.7',
  status: true
});


$(function () {
  $countdown = $('.countdown');
  $('.reactionGroup').hide();
  onFrame();
  
  applyConfig(loadConfig());
  
  $countdown.click(function () {
    refresh();
  });

  $('[data-action="login"]').click(function () {
    FB.login(function (res) {
      location.reload();
    }, {
      scope: 'user_photos,user_videos'
    });
  });
  
  $('[data-action="zoomUp"]').click(function () {
    setConfigItem('zoom', loadConfig().zoom + 0.1);
  });
  $('[data-action="zoomDown"]').click(function () {
    setConfigItem('zoom', loadConfig().zoom - 0.1);
  });
  
  $('[data-action="flipHorizontal"]').click(function () {
    setConfigItem('flipHorizontal', !loadConfig().flipHorizontal);
  });
  $('[data-action="flipVertical"]').click(function () {
    setConfigItem('flipVertical', !loadConfig().flipVertical);
  });
  
  $('[data-action="fullscreen"]').click(function () {
    if (
      document.webkitFullscreenElement || 
      document.mozFullScreenElement || 
      document.msFullscreenElement || 
      document.webkitFullscreenElement
    ) {
      (
        document.webkitExitFullscreen ||
        document.mozCancelFullScreen ||
        document.msExitFullscreen ||
        document.webkitExitFullscreen
      ).call(document);
      return;
    }
    
    (
      document.documentElement.requestFullscreen ||
      document.documentElement.mozRequestFullScreen ||
      document.documentElement.webkitRequestFullScreen
    ).call(document.documentElement);
  });

  FB.getLoginStatus(function(res) {
    if (res.status !== 'connected') {
      $('.login').show();
      $('.comments').hide();
      return;
    }
    $('.comments').show();
    refresh();
  });
  
});
