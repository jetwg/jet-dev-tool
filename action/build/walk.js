'use strict';

const child_process = require('child_process');
const Analyser = require('jet-analyser');
const workerFarm = require('worker-farm');
const walk = require('walk');
const path = require('path');
const workers = workerFarm({
    maxRetries: 0
}, require.resolve('./child'));


function defaultFilter(inputPath) {
    return path.extname(inputPath) === '.js'; // endWith(fileName, '.js');
}

function run(config, cb) {
    let totalNum = 0;
    let finishedNum = 0;
    let noMoreInput = false;
    let stop = false;
    let results = [];

    let {srcDir, distDir, files} = config;

    function runOne(inputPath, inputContent, next) {

        if (defaultFilter(inputPath) !== true) {
            next();
            return;
        }

        if (inputPath.indexOf(srcDir) !== 0) {
            // TODO 报错
            next();
            return;
        }

        let subPath = path.normalize(inputPath.substring(srcDir.length));
        subPath = subPath.substr(1); // eg: zepto/zepto.js
        let idPath = path.normalize(path.join(config.baseId, subPath));
        let id = path.join(path.dirname(idPath), path.basename(idPath, '.js')); // eg: zepto/zepto

        let packName = id.split(path.sep)[0]; // 从文件里获取到包名

        let opt = {
            inputPath,
            inputContent,
            srcDir,
            output: {
                distDir
            },
            subPath,
            packName, // 该文件所属包名
            useHash: config.useHash,
            baseId: id,
            amdWrapper: config.analyserConfig.amdWrapper,
            beautify: config.analyserConfig.beautify // 是否格式化代码
        };

        totalNum++;
        workers(opt, function (err, result) {
            finishedNum++;
            // console.log('finishedNum, totalNum', finishedNum, totalNum);
            if (err) {
                stop = true;
                workerFarm.end(workers);
                let e = new Error();
                e.message = err.error.message;
                e.code = err.error.code;
                e.stack = err.error.stack;
                e.filename = err.error.filename;
                e.line = err.error.line;
                e.col = err.error.col;
                err.error = e;
                cb(err);
                return;
            }

            results.push(result);
            if (noMoreInput) {
                if (finishedNum === totalNum) {
                    stop = true;
                    workerFarm.end(workers);
                    cb(null, results);
                }
            }
        });
        next();
    }

    if (files) {
        files.forEach(function (item) {
            if (stop) {
                return;
            }
            runOne(item.path, item.content, function () {});
        });
        console.log('no more input');
        noMoreInput = true;
    }
    else {
        let walker = walk.walk(srcDir, config.walkOption || {});
        walker.on('file', (root, fileStats, next) => {
            if (stop) {
                next();
                return;
            }
            let fileName = path.join(root, fileStats.name);
            runOne(fileName, null, next);
        });

        walker.on('end', () => {
            console.log('no more input');
            noMoreInput = true;
        });
    }
}

module.exports = {
    run
};
