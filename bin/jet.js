#!/usr/bin/env node
/**
 * @file 工具
 * @author kaivean
 */

const semver = require('semver');

// 如果当前 node 版本低于 7.6.0，才进行编译，节省启动时间
if (semver.lt(process.versions.node, '7.6.0') && process.env.NODE_ENV !== 'production') {
    require('babel-register');
    require('babel-polyfill');
}

require('./index');
