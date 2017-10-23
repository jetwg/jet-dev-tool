/**
 * @file action
 * @author kaivean
 */

const log = require('../../lib/log');
const fs = require('fs-extra');
const path = require('path');
const jet = require('jet-analyser');

let defaultOpt = {
    distDir: '',
    mapDir: '',
    saveMap: true,
    useHash: true,
    amdWrapper: false,
    beautify: false,
    clean: false // 先清空dist 和 map两个输出目录
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

module.exports = {
    async buildFile(conf) {
        let opt = {
            // code: code,
            // baseId: baseId,
            amdWrapper: false,
            beautify: true  // 【可选】是否格式化代码
        };
        opt = Object.assign(opt, conf);
        let packName = opt.packageName;
        let fileBuildInfo = jet.analyse(opt);

        // console.log('fileBuildInfo', fileBuildInfo);

        // 包的模块信息
        let modInfos = {};
        let defines = fileBuildInfo.defines;
        for (let moduleId of Object.keys(defines)) {
            let moduleInfo = defines[moduleId];
            if (modInfos[moduleId]) {
                log.warn(`包${packName}里面定义两个及以上相同amd模块${moduleId}， 将只保留一个，请check代码正确性`);
            }
            modInfos[moduleId] = {
                output: fileBuildInfo.output,
                p: opt.baseId + '.js',
                d: moduleInfo.depends,
                a: moduleInfo.requires
            };
        }

        return modInfos;
    },
    saveOriginPath(distPath, originPath) {
        fs.copy(distPath, originPath, function (err, cont) {
            if (err) {
                console.error('readFile error', err);
                return;
            }
        });
    },
    async readFile(thePath) {
        return new Promise(function (resolve, reject) {
            fs.readFile(thePath, 'utf8', function (err, cont) {
                if (err) {
                    console.error('读取文件失败');
                    return reject(err);
                }
                resolve(cont);
            });
        });
    },
    saveConf(packName, packInfo, opt) {
        fs.ensureDirSync(opt.mapDir);
        let jetmap = {
            [packName]: packInfo
        };
        writeFile(
            path.join(opt.mapDir, packName + '.conf.json'),
            JSON.stringify(jetmap, null, 4)
        );
        savaPHPMap(jetmap, packName, opt); // 可以一个文件存多个包信息
    },
    async outputPackages(result, opt) {

        // 包的模块信息
        // let packInfo = {
        //     name: packName,
        //     main,
        //     map: {}
        // };
        // 所有包信息
        let packages = {};


        for (let fileBuildInfo of result) {
            // console.log('filepath', fileBuildInfo.src, fileBuildInfo.defines);
            // fileBuildInfo结构如下
            // {
            // src: 'atomWorker/AtomWorker.js',
            // dist: 'km/qt/oz/4x.js',
            // map: 'km/qt/oz/4x.js.map',
            // state: 'success',
            // defines: { 'atomWorker/AtomWorker': [Object] } }
            let filepath = fileBuildInfo.src;
            filepath = filepath.replace('^/', ''); // => atomWorker/AtomWorker.js

            let packName = filepath.split(path.sep)[0]; // 从文件里获取到包名

            let extname = path.extname(packName);
            if (extname && extname === '.js') {
                packName = path.basename(packName, extname);
            }
            // 不是我们允许的包名
            if (opt.packages.indexOf(packName) === -1) {
                log.warn(`排除了包: ${packName}`);
                continue;
            }

            // 初始化包结构
            if (!packages[packName]) {
                packages[packName] = {map: {}};
            }
            let packInfo = packages[packName];

            // 往包里增加该文件的模块信息
            let defines = fileBuildInfo.defines;
            let modules = Object.keys(defines);
            if (!modules.length) { // 非amd模块的处理
                log.warn(`文件${filepath}里面没有定义任何AMD模块`);
                // throw new Error(`文件${filepath}里面没有定义任何AMD模块`);
            }

            for (let moduleId of Object.keys(defines)) {
                let moduleInfo = defines[moduleId];
                if (packInfo.map[moduleId]) {
                    log.warn(`包${packName}里面定义两个及以上相同amd模块${moduleId}， 将只保留一个，请check代码正确性`);
                    // log.warn(`包${packName}里面定义两个及以上相同amd模块${moduleId}， 将只保留一个，请check代码正确性`);
                }
                packInfo.map[moduleId] = {
                    p: fileBuildInfo.dist,
                    d: moduleInfo.depends,
                    a: moduleInfo.requires
                };
            }

            // 如果使用hash. 那么还需要保存一份原始路径的代码，用于兜底
            if (opt.useHash) {

                let originPath = path.join(opt.distDir, fileBuildInfo.src);
                let distPath = path.join(opt.distDir, fileBuildInfo.dist);
                console.log(distPath, originPath);
                this.saveOriginPath(distPath, originPath);
            }
        }

        // require('atomworker') 实际是require哪个
        // let defaultId = packName;
        // if (!packInfo.map[defaultId]) { // 如果没有具名定义，那么需要映射到入口id上
        //     let realId = path.join(packName, main);
        //     if (packInfo.map[realId]) {
        //         packInfo.map[defaultId] = packInfo.map[realId];
        //     }
        // }
        // let packNames = Object.keys(ret); // 一个包里可能构建出好几个包的配置，比如superframe包里可能具名定义了 atomworker这个模块
        // // 监测
        // let otherPackNames = packNames.filter(thePackName => thePackName !== packName);
        // if (otherPackNames.length) {
        //     log.warn(`包${packName}里面定义了其它包${otherPackNames.join(', ')}代码，其它包信息不会计入配置文件`);
        // }

        return packages;
    },
    async build(userConf) {
        let opt = Object.assign({}, defaultOpt, userConf); // 复制一份用户配置
        let packages = opt.packages;

        if (packages.constructor.name === 'Object') {
            packages = [packages];
        }

        if (!opt.distDir) {
            opt.distDir = path.join(userConf.srcDir, '..', 'jetdist');
        }
        if (!opt.mapDir) {
            opt.mapDir = path.join(opt.distDir, '..', 'jetmap');
        }

        if (opt.clean) {
            fs.removeSync(opt.distDir);
            opt.saveMap && fs.removeSync(opt.mapDir);
        }

        // let opt = Object.assign({}, defaultOpt, conf);

        // 默认
        let analyseOpt = {
            srcDir: opt.srcDir,
            distDir: opt.distDir,
            baseId: './',
            useHash: opt.useHash,
            analyserConfig: {
                amdWrapper: opt.amdWrapper,
                beautify: opt.beautify  // 【可选】是否格式化代码
            }
        };

        let result = jet.walk(analyseOpt);

        let packageInfos = await module.exports.outputPackages(result, opt);


        if (opt.saveMap) {
            fs.ensureDirSync(opt.mapDir);
            for (let packName of Object.keys(packageInfos)) {
                let packInfo = packageInfos[packName];
                this.saveConf(packName, packInfo, opt);
            }
        }

        return packageInfos;
    }
};


function savaPHPMap(packageInfos, filename, opt) {
    // php 格式如下:
    // <?php
    // return array(
    //     'atomWorker' => array(
    //         'map' => array(
    //             'atomWorker/AtomWorker' => array(
    //                 'p' => '',
    //                 'd' => array(
    //                     '',
    //                     ''
    //                 )
    //             )
    //         )
    //     )
    // );
    // ?>

    // 输出php conf
    let output = `<?php
    return array(
    `;

    for (let packName of Object.keys(packageInfos)) {
        let packInfo = packageInfos[packName]; // item.defines;
        output += `
        '${packName}' => array(
            'map' => array(
        `;

        for (let moduleId of Object.keys(packInfo.map)) {
            let moduleInfo = packInfo.map[moduleId];

            output += `
                '${moduleId}' => array(
                    'p' => '${moduleInfo.p}',
                    'd' => array(${moduleInfo.d.map(dep => `
                        '${dep}',`).join('')}
                    ),
                    'a' => array(${moduleInfo.a.map(req => `
                        '${req}',`).join('')}
                    ),
                ),
            `;
        }

        output += `
            ),
        ),
        `;
    }

    output += `);
    ?>
    `;
    writeFile(
        path.join(opt.mapDir, filename + '.conf.php'),
        output
    );
}
