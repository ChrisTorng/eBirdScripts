#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

const root = path.resolve(__dirname, '..');
const readmePath = path.join(root, 'README.md');
const outputPath = path.join(root, 'index.html');
const rawBaseUrl = 'https://github.com/ChrisTorng/eBirdScripts/raw/main';

marked.setOptions({
  mangle: false,
  headerIds: false
});

const escapedBase = rawBaseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const markdown = fs.readFileSync(readmePath, 'utf8')
  .replace(new RegExp(escapedBase, 'g'), '');
const bodyContent = marked.parse(markdown).trim();
const html = [
  '<!DOCTYPE html>',
  '<html lang="zh-Hant">',
  '<head>',
  '  <meta charset="UTF-8">',
  '  <meta name="viewport" content="width=device-width, initial-scale=1">',
  '  <title>eBird Scripts</title>',
  '  <style>',
  '    body { max-width: 900px; margin: 0 auto; padding: 24px; color: #222; font: 16px/1.65 system-ui, sans-serif; }',
  '    img { max-width: 100%; height: auto; }',
  '    pre { overflow: auto; padding: 12px; background: #f4f4f4; }',
  '    a { color: #176b2c; }',
  '  </style>',
  '</head>',
  '<body>',
  bodyContent.split('\n').map((line) => line ? '  ' + line : '').join('\n'),
  '</body>',
  '</html>',
  ''
].join('\n');

fs.writeFileSync(outputPath, html, 'utf8');
console.log('index.html generated from README.md.');
