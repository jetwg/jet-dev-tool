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
const loader = require('./loader');


function format(messages) {
    let output = '';
    messages.forEach(message => {
        let val = message[1];
        if (val === undefined || val === null) {
            val = '';
        }
        if (typeof val !== 'string') { // obj array等
            val = JSON.stringify(val);
        }
        // [ ] 转换成形式:  &#x + ASCII值。 因为格式化时外围时[]
        val = val.replace(/\[/g, '&#x123');
        val = val.replace(/\]/g, '&#x125');
        output += `${message[0]}[${val}] `;
    });
    return output;
}

async function start(conf = {}) {
    const app = new Koa();
    const router = new Router();
    const jetcore = conf.jetcore;
    jetcore.registerPlugin('onLackPackages', async function (packName) {
        await loader.getRemotePackages([packName], conf);
    });
    console.log('远程Jet服务器： ', conf.remoteHost);

    // 日志收集
    app.use(async function (ctx, next) {
        ctx.set('Access-Control-Allow-Origin', '*');

        ctx.addInfo = function (key, value) {
            log.warn(format([key, value]));
        };

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

    router.get(['/bypath', '/combo/jetdist'], async function (ctx, next) {
        try {
            let params = ctx.query;
            let keys = Object.keys(params);
            let comboPath = keys.length ? keys[0] : '';
            if (comboPath.indexOf('?') !== 0) {
                ctx.status = 403; // 访问路径格式不对，403拒绝访问
                return;
            }
            comboPath = comboPath.replace('?', '');
            let paths = Array.from(new Set(comboPath.split(','))); // 去重

            // _ignore_开头的模块忽略掉
            paths = paths.filter(codePath => codePath.indexOf('_ignore_') !== 0);

            await loader.loadRemoteCode(paths, null, conf); // 多加的， 加载远程代码
            let res = await jetcore.bypath(paths, null, ctx);
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

    // 和 bypath是一样的，只不过在线上该路径是nginx直接combo处理
    router.get('/combo/static', async function (ctx, next) {
        try {
            let params = ctx.query;
            let keys = Object.keys(params);
            let comboPath = keys.length ? keys[0] : '';
            if (comboPath.indexOf('?') !== 0) {
                ctx.status = 403; // 访问路径格式不对，403拒绝访问
                return;
            }
            comboPath = comboPath.replace('?', '');
            let paths = Array.from(new Set(comboPath.split(','))); // 去重

            await loader.loadRemoteCode(paths, 'static', conf); // 多加的， 加载远程代码

            let res = await jetcore.bypath(paths, conf.staticDir, ctx);
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
            if (comboPath.indexOf('?') !== 0) {
                ctx.status = 403; // 访问路径格式不对，403拒绝访问
                return;
            }
            comboPath = comboPath.replace('?', '');
            let ids = Array.from(new Set(comboPath.split(','))); // 去重
            // console.log('ids', ids);

            await loader.loadRemotePackages(ids, conf); // 多加的， 加载远程包

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
            console.log('jet error', e);
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
