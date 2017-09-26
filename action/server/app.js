/**
 * @file 应用启动器
 * @author kaivean
 */
'use strict';
const fs = require('fs-extra');
const path = require('path');
const Koa = require('koa');
const Router = require('koa-router');
const send = require('koa-send');
const chalk = require('chalk');
const proxy = require('koa-proxies');

const log = require('../../lib/log');
const util = require('../../lib/util');

async function getRemotePackages(pkgs, conf) {
    let http = require('../../lib/http');

    log.warn('远端请求: ' + conf.remoteHost + '/packinfo?packs=' + pkgs.join(','));
    let res =  await http.get({
        url: conf.remoteHost + '/packinfo',
        query: {
            packs: pkgs.join(','),
            dep: 1,
            code: 1
        }
    });
    // 返回正确
    if (!res.status) {
        let packInfos = res.data.packInfos;
        let codes = res.data.codes;
        for (let pkg of Object.keys(packInfos)) {
            let packInfo = packInfos[pkg];

            let absPath = path.join(conf.mapDir, pkg + '.conf.json');
            fs.ensureFileSync(absPath);

            let retPackInfos = {
                [pkg]: packInfo
            };
            fs.writeFileSync(absPath, JSON.stringify(retPackInfos, null, 4));

            log.info('get package success', pkg);
        }

        for (let filepath of Object.keys(codes)) {
            let cont = codes[filepath];
            let absPath = path.join(conf.distDir, filepath);
            fs.ensureFileSync(absPath);
            fs.writeFileSync(absPath, cont);
        }
    }
    else {
        log.warn('请求本地缺失的包信息和代码失败，返回状态: ', res);
    }
}

function findLocal(pkg, needCache, conf) {
    let pkgPath = path.join(conf.mapDir, pkg + '.conf.json');
    if (fs.existsSync(pkgPath)) {
        return true;
    }
    return false;
}

async function loadRemoteCode(codePaths, conf) {

    let lackPaths = [];
    for (let filePath of codePaths) {
        let fullpath = path.join(conf.distDir, filePath);
        // console.log('fullpath', fullpath, !fs.existsSync(fullpath));
        if (!fs.existsSync(fullpath)) {
            lackPaths.push(filePath);
        }
    }
    if (!lackPaths.length) {
        return;
    }

    let http = require('../../lib/http');

    log.warn('远端请求: ' + conf.remoteHost + '/code?path=' + lackPaths.join(','));
    let res =  await http.get({
        url: conf.remoteHost + '/code',
        query: {
            path: codePaths.join(',')
        }
    });

    // 返回正确
    if (!res.status) {
        let data = res.data;
        for (let codePath of Object.keys(data)) {
            let code = data[codePath];
            if (code === null || code === false) {
                log.warn('远端请求该路径代码失败: ' + codePath);
            }
            else {
                let absPath = path.join(conf.distDir, codePath);
                console.log('get code success: ', absPath);
                fs.ensureFileSync(absPath);
                fs.writeFileSync(absPath, code);
            }
        }
    }
    else {
        log.warn('远端请求代码失败，返回状态: ' + res.status);
    }
}

async function loadRemotePackages(ids, conf) {
    // 远程加载本服务缺失的包
    let lackPackages = [];
    for (let id of ids) {
        if (id) {
            let packName = id.split('/')[0];
            if (!findLocal(packName, conf)) {
                lackPackages.push(packName);
            }
        }
    }
    console.log('lackPackages', lackPackages);
    if (lackPackages.length) {
        await getRemotePackages(lackPackages, conf);
    }
}


async function start(conf = {}) {
    const app = new Koa();
    const router = new Router();
    const jetcore = conf.jetcore;
    jetcore.registerPlugin('onLackPackages', async function (packName) {
        await getRemotePackages([packName], conf);
    });
    console.log('远程Jet服务器： ', conf.remoteHost);

    // 日志收集
    app.use(async function (ctx, next) {
        ctx.set('Access-Control-Allow-Origin', '*');
        ctx.addInfo = function () {};

        try {
            await next();
            log.info(`请求： ${ctx.url}, (status: ${ctx.status})`);
        }
        catch (e) {
            console.log('处理错误', e);
            log.info(`请求： ${ctx.url}, (status: ${ctx.status})`);
        }
    });

    // 提供静态文件服务，
    // 线上html的baseUrl被改成了/，所有的静态文件都会走到这里，优先从本地获取，然后才代理到线上，
    app.use(async function (ctx, next) {
        ctx.set('Access-Control-Allow-Origin', '*');
        let matchPath = ctx.path.replace('/static', '');
        let file = path.join(conf.srcDir, matchPath);
        if (fs.existsSync(file)) {
            log.info(`请求： ${ctx.path }，本地`);
            return await send(ctx, matchPath, {
                root: conf.srcDir,
                gzip: true
            });
        }
        return next();
    });

    // 上面的中间件，没有在本地找到静态文件，就代理到线上
    app.use(proxy('/static', {
        target: conf.remoteHost,
        // changeOrigin: true,
        // agent: new httpsProxyAgent('http://1.2.3.4:88'),
        // rewrite: path => path.replace(/^\/octocat(\/|\/\w+)?$/, '/vagusx'),
        logs: true
    }));

    router.get('/bypath', async function (ctx, next) {
        try {
            let params = ctx.query;
            let keys = Object.keys(params);
            let comboPath = keys.length ? keys[0] : '';
            comboPath = comboPath.replace('?', '');
            let paths = Array.from(new Set(comboPath.split(','))); // 去重

            await loadRemoteCode(paths, conf); // 多加的， 加载远程代码

            let res = await jetcore.bypath(paths, ctx);
            if (res === false) {
                ctx.status = 404;
            }
            else {
                ctx.type = 'application/x-javascript';
                ctx.body = res;
            }
        }
        catch (e) {
            ctx.status = 404;
        }
        log.info(`请求： ${ctx.path }, (status: ${ctx.status})`);
    });

    router.get('/byid', async function (ctx, next) {
        try {
            let params = ctx.query;
            let keys = Object.keys(params);
            let comboPath = keys.length ? keys[0] : '';
            comboPath = comboPath.replace('?', '');
            let ids = Array.from(new Set(comboPath.split(','))); // 去重
            // console.log('params', params, paths);

            await loadRemotePackages(ids, conf); // 多加的， 加载远程包

            let res = await jetcore.byid(ids, ctx);
            if (res === false) {
                ctx.status = 404;
            }
            else {
                ctx.type = 'application/x-javascript';
                ctx.body = res;
            }
        }
        catch (e) {
            ctx.status = 404;
        }

        return await next();
    });

    router.get('/deps', async function (ctx, next) {
        ctx.set('Access-Control-Allow-Origin', '*');
        log.info(`请求： ${ctx.path }`);
        if (ctx.query.ids) {
            return ctx.body = {
                status: 0,
                data: await jetcore.getPackInfosByIds(ctx.query.ids.split(','), ctx)
            };
        }
        else if (ctx.query.packs) {
            return ctx.body = {
                status: 0,
                data: await jetcore.getPackInfosByPacks(ctx.query.packs.split(','), true, ctx)
            };
        }
        return ctx.body = {
            status: 1,
            info: '参数错误'
        };
    });

    router.get('/', async function (ctx, next) {
        ctx.type = 'application/x-javascript; charset=utf-8';
        ctx.body = 'The server is ready!';
        return await next();
    });

    // 使路由生效
    app.use(router.routes()).use(router.allowedMethods());


    app.on('error', function (err, ctx) {
        console.error('本地服务器发生错误：', err);
        ctx.status = 404;
    });

    // 启动后端, 不指定hostname，则通过localhost ,127.0.0.1 机器地址都可以访问
    app.listen(conf.port, function (error) {
        if (error) {
            console.error('本地服务器启动失败：', error);
        }
        else {
            console.log('\n本地服务器 已启动，地址: ', chalk.green(`http://${util.getIPAdress()}:${conf.port}/ `));
        }
    });
}

module.exports = {
    start
};
