/**
 * @file 构建命令入口
 * @author kaivean
 */

const path = require('path');
const fs = require('fs-extra');
const serverAction = require('../action/server/index');
let log = require('../lib/log');

module.exports = async function (option, args, program) {
    let srcDir = process.cwd();
    if (option.path) {
        srcDir = path.resolve(srcDir, option.path);
    }
    let ignores = ['jetdist', 'jetmap'];
    let packages = [];
    if (option.all) {
        let filenames = fs.readdirSync(srcDir);
        filenames = filenames.filter(filename => ignores.indexOf(filename) === -1);
        // 只有目录 或者 .js 文件才作为包名
        filenames.map(filename => {
            if (fs.statSync(path.join(srcDir, filename)).isDirectory()) {
                return packages.push(filename);
            }
            let extname = path.extname(filename);
            if (extname && extname === '.js') {
                let packName = path.basename(filename, extname);
                packages.push(packName);
            }
        });
    }
    else {
        if (args.length) {
            for (let packagePath of args) {
                let packageDir = path.resolve(srcDir, packagePath);
                let packageEntry = path.resolve(srcDir, packagePath + '.js');
                let packageName = path.basename(packageDir);
                if (fs.existsSync(packageDir) || fs.existsSync(packageEntry)) {
                    packages.push(packageName);
                }
                else {
                    throw new Error(`不存在包代码: ${packageName}`);
                }
            }
        }
        else {
            throw new Error('未指定包名');
        }
    }
    packages = Array.from(new Set(packages)); // 去重

    let hash = !!option.hash;
    let conf = {
        srcDir,
        packages,
        mapDir: option.map,
        distDir: option.dist,
        useHash: hash, // 默认
        beautify: !option.beautify,
        remoteHost: option.host,
        port: option.port
    };
    console.log('packages', conf);
    if (!conf.distDir) {
        conf.distDir = path.join(srcDir, '..', 'jetdist');
    }
    if (!conf.mapDir) {
        conf.mapDir = path.join(conf.distDir, '..', 'jetmap');
    }

    let res;
    try {
        res = await serverAction.run(conf);
        log.info('\n构建完成');
    }
    catch (e) {
        log.error('\n构建失败', e);
        process.exit(1);
    }
    return res;
};
