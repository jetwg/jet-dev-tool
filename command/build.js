/**
 * @file 构建命令入口
 * @author kaivean
 */

const path = require('path');
const fs = require('fs-extra');
const buildAction = require('../action/build/index');
let log = require('../lib/log');

module.exports = async function (option, args, program) {
    let srcDir = process.cwd();
    if (option.path) {
        srcDir = option.path;
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

    // console.log('pack',option, args, packageName);
    // 默认是true, option.hash拿到都是字符串，在这里做转换，0 false字符串都是 布尔型 false
    let hash = typeof option.hash === 'undefined' ? true : !!+option.hash;
    let conf = {
        srcDir: srcDir, // 构建根目录
        packages: packages, // 需要构建的包
        clean: !!option.clean,
        mapDir: option.map,
        distDir: option.dist,
        useHash: hash, // 默认
        beautify: !!option.beautify
    };

    let res;
    try {
        res = await buildAction.build(conf);
        log.info('\n构建完成');
    }
    catch (e) {
        log.error('\n构建失败', e);
        process.exit(1);
    }
    return res;
};
