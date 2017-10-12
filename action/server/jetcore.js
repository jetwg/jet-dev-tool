/**
 * @file util
 * @author kaivean
 */

'use strict';

const path = require('path');
const fs = require('fs');
const LRU = require('lru-cache');

let mapDir;
let distDir;
let lruMapCache;
let plugin = {
    async onLackPackages(packNames) { // 默认啥都不做
        return;
    }
};

function getPackStruct() {
    return {
        map: {}
    };
}

function getModuleStruct() {
    return {
        p: '',
        d: [],
        a: []
    };
}

function addPackage(packName) {
    let ctx = this;
    ctx.addInfo('addPackage', packName);
    return new Promise(async function (resolve, reject) {
        let mapFile = path.resolve(mapDir, packName + '.conf.json');
        // console.log('mapFile', mapFile);

        if (!fs.existsSync(mapFile)) {
            ctx.addInfo('lackMapFile', mapFile);
            // console.log('packName', packName);
            await plugin.onLackPackages([packName]);
        }
        fs.readFile(mapFile, 'utf8', function (err, cont) {
            let packInfos = {
                [packName]: getPackStruct()
            };
            if (!err && cont) {
                try {
                    packInfos = JSON.parse(cont);
                }
                catch (e) {
                    ctx.addInfo('readConfFail', packName);
                    // 暂不做任何处理
                }
            }
            // console.log('packInfos', packInfos);
            for (let thePackName of Object.keys(packInfos)) {
                let packInfo = packInfos[thePackName];
                // 不管有没有该包信息，都得写入包信息，否则后面分析会不停地读增加包文件，不停地读取文件
                // 假如写入了zhaopin这个包配置是 {}， 那么根据lruMapCache缓存时间，1分钟之后才会重新读取文件，
                // 1分钟之内上线了该包, 读取还是{}， 因此上线过程得sleep 1分钟以上
                lruMapCache.set(thePackName, packInfo);
            }
            resolve(packInfos[packName]);
        });
    });
}

async function findId(id, packName) {
    let ctx = this;
    // console.log('packName', packName, id);
    let sections = id.split('/');
    let modInfo;
    if (packName) {
        let packInfo = lruMapCache.get(packName);
        if (!packInfo) {
            packInfo = await addPackage.call(this, packName);
        }

        modInfo = packInfo.map[id];
        if (modInfo) {
            return {
                modInfo,
                packName
            };
        }
    }

    let idPackName = sections[0]; // 从Id解析出该id的包名，取到该报名
    let idPackInfo = lruMapCache.get(idPackName); // 从
    if (!idPackInfo) { // id包的包映射都没有
        idPackInfo = await addPackage.call(this, idPackName); // 没有会返回默认包信息，都是空的
    }

    modInfo = idPackInfo.map[id];
    if (modInfo) { // id包里有，就返回
        return {
            modInfo,
            packName: idPackName
        };
    }

    ctx.addInfo('lackModule', packName + '--' + id);
    return {
        modInfo,
        packName: packName || idPackName // 还是返回原来的pack，而不是id的pack
    };
}

async function findPack(packName) {
    let packInfo = lruMapCache.get(packName); // 从
    if (!packInfo) { // id包的包映射都没有
        packInfo = await addPackage.call(this, packName); // 没有会返回默认包信息，都是空的
    }
    return packInfo;
}


async function analyzeModDep(id, thePackName, outDepObj) {
    let res = await findId.call(this, id, thePackName); // 在这一步有可能包 会更换

    let {modInfo, packName} = res;
    if (!outDepObj[packName]) {
        outDepObj[packName] = getPackStruct();
    }
    let packMap = outDepObj[packName].map;
    if (!modInfo) {
        packMap[id] = getModuleStruct();
        return;
    }
    // modInfo不是一个对象
    if (typeof modInfo !== 'object') {
        packMap[id] = getModuleStruct();
        return;
    }

    // 处理同步依赖
    if (modInfo.d) {
        for (let nextId of modInfo.d) {
            if (!packMap[nextId]) {
                await analyzeModDep.call(this, nextId, packName, outDepObj);
            }
        }
    }

    // 处理异步依赖
    if (modInfo.a) {
        for (let nextId of modInfo.a) {
            if (!packMap[nextId]) {
                await analyzeModDep.call(this, nextId, packName, outDepObj);
            }
        }
    }
    packMap[id] = modInfo;
}

async function analyzePackDep(thePackName, outPackInfos) {
    let packInfo = await findPack.call(this, thePackName); // 在这一步有可能包 会更换
    let packMap = packInfo.map;
    outPackInfos[thePackName] = packInfo;
    for (let moduleId of Object.keys(packMap)) {
        let modInfo = packMap[moduleId];
        // 处理同步依赖
        if (modInfo.d) {
            for (let nextId of modInfo.d) {
                let idPackName = nextId.split('/')[0];
                if (!packMap[nextId] && !outPackInfos[idPackName]) {
                    await analyzePackDep.call(this, idPackName, outPackInfos);
                }
            }
        }

        // 处理异步依赖
        if (modInfo.a) {
            for (let nextId of modInfo.a) {
                let idPackName = nextId.split('/')[0];
                if (!packMap[nextId] && !outPackInfos[idPackName]) {
                    await analyzePackDep.call(this, idPackName, outPackInfos);
                }
            }
        }
    }
}

// promise： 每个文件读取操作用promise包裹
function readFile(filePath) {
    return new Promise((resolve, reject) =>
        fs.readFile(filePath, 'utf8', (err, cont) => resolve(err ? false : cont))
    );
}


// nodejs启动时执行初始化
function init(conf) {
    mapDir = conf.mapDir;
    distDir = conf.distDir;

    /* eslint-disable */
    lruMapCache = LRU({
        max: 500, // 最多的key
        maxAge: conf.maxAge || 1000 * 10 // 10s
    });
    /* eslint-enable */
}


module.exports = function (app) {

    // akb环境直接初始化
    if (app && akb) {
        init({
            mapDir: path.resolve(akb.appdir, akb.config.jet.mapDir),
            distDir: path.resolve(akb.appdir, akb.config.jet.distDir)
        });
        console.log('mapDir', mapDir);
        console.log('distDir', distDir);
    }

    return {
        init,
        // 简单插件机制, 没有数组，没有释放， 不喜忽喷,
        registerPlugin(name, cb) {
            if (plugin[name]) {
                plugin[name] = cb;
            }
        },
        async addPackage(packName, ctx) {
            await addPackage.call(ctx, packName);
        },
        // 增加一或多个模块到指定包缓存
        addModulesToCache(packName, moduleInfos) {
            let packInfo = lruMapCache.get(packName);
            if (!packInfo) {
                packInfo = getPackStruct();
            }
            packInfo.map = Object.assign(packInfo.map, moduleInfos);
            lruMapCache.set(packName, packInfo);
        },

        // 读多个文件
        async readFiles(paths, root, ctx) {
            let allPromises = [];
            for (let filepath of paths) {
                // 必须path.join 不能用resolve， 防止filepath为绝对路径的攻击
                let absPath = path.join(root || distDir, filepath);
                console.log('absPath', absPath);
                // 每个文件读取包裹一个promise
                allPromises.push(readFile.call(ctx, absPath, filepath));
            }
            return await Promise.all(allPromises);
        },
        // 可自定义root， 没有就是distDir了
        async bypath(paths, root, ctx) {
            let contents = await this.readFiles(paths, root, ctx);
            let isAllError = true;
            let retContent = '';

            contents.forEach(function (content, index) {
                let filepath = paths[index];
                if (content !== false) {
                    isAllError = false;
                }
                else {
                    content = `console.warn("[JetError] Fail to read the module file <${filepath}> .");`;
                    ctx.addInfo('lackcontent', filepath);
                }

                content = `\n/*module: ${filepath}*/` + content;
                retContent += content;
            });

            if (isAllError) {
                return false;
            }
            return retContent;
        },

        async byid(ids, ctx) { // 通过id commbo， 必须加时间戳不做缓存
            let paths = [];

            for (let id of ids) {
                // console.log('id', id);
                let res = await findId.call(ctx, id, null); // 在这一步有可能包 会更换
                let modInfo = res.modInfo;
                // console.log('modInfo', modInfo);
                if (!modInfo) {
                    continue;
                }
                let jsPath = modInfo.p || '';
                paths.push(jsPath);
            }
            return await this.bypath(paths, ctx);
        },

        // 只会返回ids依赖的模块信息，但也是包格式返回
        async getPackInfosByIds(ids, ctx) {
            // 获取id依赖关系
            let packInfos = {};
            for (let id of ids) {
                if (id) {
                    await analyzeModDep.call(ctx, id, null, packInfos);
                }
            }
            return packInfos;
        },
        // 返回指定的包所有信息
        async getPackInfosByPacks(packs, dep, ctx) {
            // 获取包
            let packInfos = {};
            for (let packName of packs) {
                if (dep) {
                    await analyzePackDep.call(ctx, packName, packInfos);
                }
                else {
                    let packInfo = lruMapCache.get(packName);
                    if (!packInfo) {
                        packInfo = await addPackage.call(ctx, packName);
                    }
                    packInfos[packName] = packInfo;
                }
            }
            return packInfos;
        }
    };
};
