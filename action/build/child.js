'use strict';

const crypto = require('crypto');
const Analyser = require('jet-analyser');
const fs = require('fs-extra');
const path = require('path');

function hash(data, type) {
    if (typeof type !== 'string') {
        type = 'sha256';
    }

    let hash = crypto.createHash(type);
    hash.update(data);
    return hash.digest('base64');
}

function hashToPath(hash) {
    hash = hash
        .substring(0, 8)
        .toLowerCase()
        .replace(/\//g, '_')
        .replace(/\+/g, '_');

    return hash.match(/.{2}|./g).join('/');
}

function writeFile(filepath, cont) {
    return new Promise((resolve, reject) => {
        fs.ensureFile(filepath)
            .then(() => {
                fs.writeFile(filepath, cont, function (err) {
                    if (err) {
                        return reject(err);
                    }
                    resolve();
                });
            })
            .catch(err => {
                reject(err);
            });
    });
}

function getSourceCode(fileName, encoding = 'utf8') {
    return new Promise((resolve, reject) => {
        fs.readFile(fileName, encoding, (err, data) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(data);
            }
        });
    });
}

function getContent(config) {
    return new Promise((resolve, reject) => {
        if (config.inputPath) {
            if (config.inputContent) {
                resolve(config.inputContent);
            }
            else {
                getSourceCode(config.inputPath).then(function (inputContent) {
                    resolve(inputContent);
                }, function (err) {
                    reject(err);
                });
            }
        }
        else {
            reject('lack file content');
        }
    });
}

module.exports = function (config, callback) {
    getContent(config).then(function (inputContent) {
        let {srcDir, distDir, inputPath} = config;

        let result = Analyser.analyse({
            code: inputContent,
            useHash: '',
            baseId: config.baseId,
            amdWrapper: config.amdWrapper,
            beautify: config.beautify // 可选】是否格式化代码
        });
        if (config.useHash) {
            result.hash = hash(result.output, config.useHash);
        }
        result.src = config.subPath;

        // 有outputPath，就把代码写入到文件系统
        if (config.output) {
            let outputConf = Object.assign({
                distDir: '',
                hashPath: !!config.useHash,
                originPath: !config.useHash,
                map: true
            }, config.output);

            let pros = [];

            if (outputConf.originPath) {
                result.dist = config.baseId + '.js';
                let originPath = path.join(outputConf.distDir, result.dist);
                pros.push(
                    new Promise(function (resolve, reject) {
                        writeFile(originPath, result.output).then(function () {
                            resolve();
                        }).catch(function (err) {
                            reject(err);
                        });
                    })
                );
                if (outputConf.map) {
                    result.mapPath = config.baseId + '.js.map';
                    let mapPath = originPath + '.map';
                    pros.push(
                        new Promise(function (resolve, reject) {
                            writeFile(mapPath, result.map).then(function () {
                                resolve();
                            }).catch(function (err) {
                                reject(err);
                            });
                        })
                    );
                }
            }

            if (outputConf.hashPath) {
                result.dist = hashToPath(result.hash) + '.js';
                // console.log('hasresult ', result.dist , config.baseId, outputConf.distDir);

                let hashPath = path.join(outputConf.distDir, result.dist);
                pros.push(
                    new Promise(function (resolve, reject) {
                        writeFile(hashPath, result.output).then(function () {
                            resolve();
                        }).catch(function (err) {
                            reject(err);
                        });
                    })
                );
                if (outputConf.map) {
                    result.mapPath = result.dist + '.map';
                    let hashMapPath = hashPath + '.map';
                    pros.push(
                        new Promise(function (resolve, reject) {
                            writeFile(hashMapPath, result.map).then(function () {
                                resolve();
                            }).catch(function (err) {
                                reject(err);
                            });
                        })
                    );
                }
            }

            Promise.all(pros).then(function () {
                callback(null, result);
            }).catch(function (err) {
                if (err.code !== 'ERR_IPC_CHANNEL_CLOSED') {
                    callback({
                        error: {
                            message: err.message,
                            code: err.code,
                            stack: err.stack,
                            filename: err.filename,
                            line: err.line,
                            col: err.col
                        },
                        config
                    });
                }
            });
            return;
        }
        callback(null, result);

    }).catch(function (err) {
        // 直接把err传过去，stack等信息就丢失了，所以用对象保存起来，在主线程再恢复
        callback({
            error: {
                message: err.message,
                code: err.code,
                stack: err.stack,
                filename: err.filename,
                line: err.line,
                col: err.col
            },
            config
        });
    });
};
