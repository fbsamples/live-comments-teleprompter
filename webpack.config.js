/**
 *  Copyright (c) 2018-present, Facebook, Inc.
 *  All rights reserved.
 *
 *  This source code is licensed under the license found in the
 *  LICENSE file in the root directory of this source tree.
 *
 */

const webpack = require('webpack');

if (!process.env.FB_APP_ID) {
  console.error('You must set FB_APP_ID in your environment before building.  See README.md.');
  process.exit(1);
}

module.exports = {
  devtool: 'source-map',
  entry: {
    index: './src/js/index.js',
    moderate: './src/js/moderate.js',
    teleprompter: './src/js/teleprompter.js'
  },
  output: {
    path: './src/js',
    filename: '[name]-bundle.js',
  },
  module: {
    loaders: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        loader: 'babel-loader',
      },
      {
        test: /\.json$/,
        loader: 'json',
      },
      {
        test: /\.css$/,
        loader: [ 'style-loader', 'css-loader' ]
      }
    ],
  },
  plugins: [
    new webpack.DefinePlugin({
      FB_APP_ID: process.env.FB_APP_ID
    })
  ]
};
