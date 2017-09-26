/**
 * @file action
 * @author kaivean
 */
'use strict';

const path = require('path');
const fs = require('fs-extra');
const app = require('./app');
const chokidar = require('chokidar');
const chalk = require('chalk');
const buildAction = require('../build/index');
const log = require('../../lib/log');
const jetcore = require('./jetcore.js')();

let buildStatus = 0;

module.exports = {
    async run(opt) {
        let conf = {
            port: 8111, // 本地jet开发服务端口
            remoteHost: 'http://gzhxy-ps-bfw-jet-zhaopin0.gzhxy:8060', // jet服务器
            distDir: '',
            mapDir: '',
            srcDir: '',
            jetcore
        };
        conf = Object.assign(conf, opt);

        const {distDir, mapDir} = conf;

        jetcore.init({mapDir, distDir});

        handleUncaughtException();

        await compileAll(conf);

        await app.start(conf);

        listenDir(conf);
    }
};

function listenDir(conf) {
    let {ignore, packages, srcDir} = conf;

    // 更新 增量构建
    let chokidarOpt = {
        ignoreInitial: true,
        ignored: ignore
    };
    let watchDirs = packages.map(pack => path.join(srcDir, `(${pack}/**.js|${pack}.js)`));
    console.log('监听目录: ', watchDirs);
    // 监控项目文件的改动
    chokidar.watch(watchDirs, chokidarOpt).on('all', async (event, thePath) => {
        /* eslint-disable fecs-prefer-destructure */
        // thePath.replace(listenDir, '') => /app/atom_local_item/index.atom

        let filepath = thePath.replace(srcDir, ''); // => /atomWorker/AtomWorker.js
        filepath = filepath.replace(/^\//, ''); // => atomWorker/AtomWorker.js

        // 拿到包名
        let packName = filepath.split(path.sep)[0]; // 从文件里获取到包名
        let extname = path.extname(filepath);
        if (extname && extname === '.js') {
            packName = path.basename(packName, extname);
        }

        // 不是我们允许的包名
        if (packages.indexOf(packName) === -1) {
            return;
        }

        // 拿到baseId
        let baseId = path.join(path.dirname(filepath), path.basename(filepath, extname));
        console.log('packName', packName, baseId, extname, filepath);
        // 正在编译
        buildStatus = 1;
        try {
            let moduleInfos = await buildAction.buildFile({
                code: fs.readFileSync(thePath, 'utf8'),
                baseId: baseId,
                packageName: packName,
                amdWrapper: false,
                beautify: true  // 【可选】是否格式化代码
            });
            console.log('moduleInfos', moduleInfos);

            jetcore.addModulesToCache(packName, moduleInfos);
            log.info('构建完成');
        }
        catch (e) {
            log.error(`分析文件${filepath}失败`, e);
        }
        buildStatus = 0;
    });
}


async function compileAll(conf) {
    // 第一次构建
    await buildAction.build({
        packages: conf.packages,
        srcDir: conf.srcDir,
        distDir: conf.distDir,
        mapDir: conf.mapDir,
        amdWrapper: false,
        clean: true,
        useHash: false,
        beautify: true  // 【可选】是否格式化代码
    });
}

function handleUncaughtException() {
    // 捕获错误
    process.on('uncaughtException', function (err) {
        if (err.message.indexOf('listen EADDRINUSE') > -1) {
            log.error('Server端口被占用');

            // 由于ctr+z中断，部分进程不退出，每次ala server，提示端口占用，因此先kill残留进程
            try {
                const execSync = require('child_process').execSync;
                console.log('已尝试关闭所有ala server进程，请再次执行命令');
                console.log(chalk.green('提示：'), '每次关闭ala server进程时，用ctr + c,  不要用ctr + z（导致进程后台常驻）');
                // 执行该命令会把当前进程杀掉
                let cmd = 'ps -ef|grep "ala server"|grep -v grep|awk \'{print $2;}\'|xargs kill -9';
                execSync(cmd, {encoding: 'utf-8'});
            }
            catch (e) {
                // 暂不处理
                console.error(err);
            }
        }
        else {
            console.error(err);
        }

        process.exit(1);
    });
}
