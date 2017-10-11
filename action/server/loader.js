/**
 * @file 应用启动器
 * @author kaivean
 */

const fs = require('fs-extra');
const path = require('path');
const log = require('../../lib/log');


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

function findLocal(pkg, conf) {
    let pkgPath = path.join(conf.mapDir, pkg + '.conf.json');
    if (fs.existsSync(pkgPath)) {
        return true;
    }
    return false;
}

async function loadRemoteCode(codePaths, rootType, conf) {

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
            path: codePaths.join(','),
            rootType: rootType // 是jetdist目录 还是 static 目录
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
                console.log('get code success: ', codePath);
                // 静态代码不污染用户static目录，而是新建一个隐藏目录
                if (rootType === 'static') {
                    let absPath = path.join(conf.staticDir, codePath);
                    fs.ensureFileSync(absPath);
                    fs.writeFileSync(absPath, code);
                }
                else {
                    let absPath = path.join(conf.distDir, codePath);
                    fs.ensureFileSync(absPath);
                    fs.writeFileSync(absPath, code);
                }
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

module.exports = {
    loadRemotePackages,
    loadRemoteCode,
    getRemotePackages,
    findLocal
};
