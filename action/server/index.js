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

let compiling = false;
let nextconf = '';
let waitingPaths = [];

module.exports = {
    async run(opt) {
        let conf = {
            port: 8111, // 本地jet开发服务端口
            // remoteHost: 'http://gzhxy-ps-bfw-jet-zhaopin0.gzhxy:8060', // jet服务器
            remoteHost: 'http://bjyz-happyfe.epc.baidu.com:8062', // jet服务器
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

function writeFile(filepath, cont) {
    fs.ensureFile(filepath)
        .then(() => {
            fs.writeFile(filepath, cont, function (err) {
                if (err) {
                    return console.error(err);
                }
                console.log('写入文件: ', filepath);
            });
        })
        .catch(err => {
            console.error(err);
        });
}

async function readFile(thePath) {
    return new Promise(function (resolve, reject) {
        fs.readFile(thePath, 'utf8', function (err, cont) {
            if (err) {
                console.error('读取文件失败');
                return reject(err);
            }
            resolve(cont);
        });
    });
}


function listenDir(conf) {
    let {ignore, packages, srcDir} = conf;

    // 更新 增量构建
    let chokidarOpt = {
        ignoreInitial: true,
        ignored: ignore
    };
    let watchDirs = packages.map(pack => path.join(srcDir, `${pack}/**/*.js`));
    console.log('监听目录: ', watchDirs);

    function handleWatch(thePath) {
        console.log('文件处理', thePath);
        try {
            compile(conf, thePath);
        }
        catch (e) {
            console.error('compile error', e);
        }
    }

    // 监控项目文件的改动
    chokidar.watch(watchDirs, chokidarOpt).on('add', handleWatch);
    chokidar.watch(watchDirs, chokidarOpt).on('change', handleWatch);
    chokidar.watch(watchDirs, chokidarOpt).on('unlink', handleWatch);
    // chokidar.watch(watchDirs, chokidarOpt).on('unlinkDir', handleRemoveWatch);
}

async function compileAll(conf) {
    console.log('全部编译');
    // 第一次构建
    await buildAction.build({
        packages: conf.packages,
        srcDir: conf.srcDir,
        distDir: conf.distDir,
        mapDir: conf.mapDir,
        amdWrapper: false,
        clean: true,
        useHash: true,
        beautify: true // 【可选】是否格式化代码
    });
    let lruMapCache = jetcore.getCacheObj();
    lruMapCache.reset();
}

async function compileSingle(conf, thePath) {
    /* eslint-disable fecs-prefer-destructure */
    console.log('单编译');
    let filepath = thePath.replace(conf.srcDir, ''); // => /atomWorker/AtomWorker.js
    filepath = filepath.replace(/^\//, ''); // => atomWorker/AtomWorker.js

    // 拿到包名
    let packName = filepath.split(path.sep)[0]; // 从文件里获取到包名
    let extname = path.extname(filepath);
    if (extname && extname === '.js') {
        packName = path.basename(packName, extname);
    }

    // 不是我们允许的包名
    if (conf.packages.indexOf(packName) === -1) {
        return;
    }

    try {
        let code = await readFile(thePath);
        // 拿到baseId
        let baseId = path.join(path.dirname(filepath), path.basename(filepath, extname));
        let moduleInfos = await buildAction.buildFile({
            code: code,
            baseId: baseId,
            packageName: packName,
            amdWrapper: false,
            beautify: true // 【可选】是否格式化代码
        });
        // console.log('moduleInfos', moduleInfos);
        for (let moduleId of Object.keys(moduleInfos)) {
            let moduleInfo = moduleInfos[moduleId];
            writeFile(path.join(conf.distDir, filepath), moduleInfo.output);
            delete moduleInfo.output;
        }
        let mapFile = path.resolve(conf.mapDir, packName + '.conf.json');
        fs.ensureFileSync(mapFile);
        let packInfos;
        try {
            delete require.cache[mapFile];
            packInfos = require(mapFile);
        }
        catch (e) {
            log.error(`require ${mapFile} fail`, e);
            packInfos = {};
        }

        if (!packInfos[packName]) {
            packInfos[packName] = {map: {}};
        }
        packInfos[packName].map = Object.assign(packInfos[packName].map, moduleInfos);

        buildAction.saveConf(packName, packInfos[packName], conf);

        let lruMapCache = jetcore.getCacheObj();
        lruMapCache.del(packName);

        log.info('构建完成');
    }
    catch (e) {
        log.error(`分析文件${filepath}失败`, e);
    }
}


async function dispatch(conf) {
    if (!compiling && waitingPaths.length > 0) {
        compiling = true;

        // 开始消耗等待队列
        let filePaths = waitingPaths;
        nextconf = '';
        waitingPaths = [];
        log.info('compiling start');

        // 如果只有一个文件改动了(不是删除)，那么就编译这个文件h好了，加快编译速度，适用于普通开发，一边写，一边保存，然后编译，然后浏览
        if (filePaths.length === 1 && fs.existsSync(filePaths[0])) {
            await compileSingle(conf, filePaths[0]);
        }
        else {
            // 200ms改动了大量文件，一般是改动了目录或代码构建之后瞬时产生大量文件，此时直接全部编译
            await compileAll(conf);
        }

        compiling = false;
        log.info('compiling end');
        dispatch(conf).then(function () {});
    }
}

let timer = null;

// 一次性改动多个文件，只会在最后一个改动后编译，如果正在编译中，有改动文件，会在编译结束后再次运行编译
function compile(conf, filepath) {
    waitingPaths.push(filepath);
    clearTimeout(timer);
    timer = setTimeout(function () {
        dispatch(conf).then(function () {});
    }, 500);
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
